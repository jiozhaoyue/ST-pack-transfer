/**
 * 存储引擎互转桥（纯逻辑 + 注入式 IO，无 DOM）。
 *
 * 目标（用户 2026-11-12 裁定）：**转换后的包，走宿主原生恢复流程不再连接任何数据库**。
 * - 目标 `fs`：产物不含 `_engine_dump.bin`/`_engine_meta.json`，由行数据重建磁盘文件。
 * - 目标 `postgres`/`mysql`：产物含正确 `engineKind` 的 `_engine_meta.json` + JSONL dump。
 * - 目标 `sqlite`：产物含 `<handle>/luker-storage.sqlite`。
 *
 * 全程只读文本/文件，**不创建任何临时数据库**；SQLite 走注入的 `sqliteInit`（浏览器用 wasm）。
 *
 * 用法（transform 侧）：
 *   1. `planEngineConversion()` 扫一遍条目名 + meta，得到 `suppress(name)` 判定；
 *   2. 主循环跳过被抑制的源条目；
 *   3. 主循环结束后 `await plan.emit(writer, { onWarn })` 生成目标承载物。
 *
 * 守卫：schemaVersion 不符 / 未知引擎 / 未知表 / 坏 JSONL 一律**显式报告**；
 * 行数对账不符时抛错，不产出半成品。
 */

import {
  ENGINE_KINDS,
  ENGINE_DUMP_ENTRY,
  ENGINE_META_ENTRY,
  SQLITE_DB_ENTRY,
  DUMP_TABLES,
  normalizeEngineKind,
  isEngineCarrierEntry,
} from './engine-model.js';
import {
  createDumpParser,
  createDumpWriter,
  parseEngineMeta,
  engineKindOfMeta,
  validateEngineMeta,
} from './engine-adapters/jsonl-dump.js';
import {
  fsEntryToRow,
  rowToFsEntry,
  isFsEnginePath,
  relativizeEntryName,
} from './engine-adapters/fs.js';
import { readSqlite, createSqliteWriter } from './engine-adapters/sqlite.js';
import { detectSourceEngine } from './engine-registry.js';

const encoder = new TextEncoder();

/** 行 → 选择项门禁（与上游 `selection-mapping.js` 的语义一致）。 */
export function selectionAllowsRow(table, selection) {
  if (!selection || typeof selection !== 'object') return true;
  switch (table) {
    case 'settings':
      return selection.settings !== false;
    case 'stats':
    case 'groups_table':
    case 'chats':
    case 'chat_states':
      return selection.chats !== false;
    case 'worlds':
      return selection.lorebooks !== false && selection.worlds !== false;
    case 'presets':
    case 'preset_states':
    case 'named_docs':
      return selection.presets !== false;
    default:
      return true;
  }
}

async function scanSource(io, sourcePath) {
  const reader = await io.openReader(sourcePath);
  const names = [];
  let meta = null;
  let manifest = null;
  let prefixHandle = '';
  try {
    for await (const entry of reader.entries()) {
      names.push(entry.fileName);
      const base = String(entry.fileName).split('/').pop();
      if (base === ENGINE_META_ENTRY) {
        try {
          meta = parseEngineMeta(new TextDecoder().decode(await entry.read()));
        } catch {
          meta = null;
        }
      } else if (entry.fileName === 'manifest.json') {
        try {
          manifest = JSON.parse(new TextDecoder().decode(await entry.read()));
        } catch {
          manifest = null;
        }
      } else {
        if (!prefixHandle) {
          const match = /^data\/([^/]+)\//.exec(String(entry.fileName));
          if (match) prefixHandle = match[1];
        }
        if (typeof entry.skip === 'function') entry.skip();
      }
    }
  } finally {
    await reader.close();
  }
  return { names, meta, manifest, prefixHandle };
}

/**
 * 规划一次引擎转换。不读大文件（只读 meta），可安全在转换开始前调用。
 *
 * @param {object} args
 * @param {object} args.io  `{ openReader, createWriter }`
 * @param {*} args.sourcePath
 * @param {string} args.targetEngine  目标引擎 kind
 * @param {string} [args.handle]      目标 handle（DB/SQLite 目标必填）
 * @param {object} [args.selection]   选择项（false = 排除）
 * @param {*} [args.sqliteInit]       `(config) => Promise<SQL>`，SQLite 目标/源需要
 * @param {function(string):void} [args.onWarn]
 * @returns {Promise<object>} `{ applicable, sourceEngine, targetEngine, handle, suppress(), emit(), reason }`
 */
export async function planEngineConversion({
  io,
  sourcePath,
  targetEngine,
  handle = '',
  selection = null,
  sqliteInit = null,
  onWarn,
} = {}) {
  const want = normalizeEngineKind(targetEngine);
  if (!want) {
    return { applicable: false, sourceEngine: '', targetEngine: '', reason: '未指定目标引擎' };
  }

  const { names, meta, manifest, prefixHandle } = await scanSource(io, sourcePath);
  const detection = detectSourceEngine({ names, meta });
  const sourceEngine = detection.kind;

  if (!sourceEngine) {
    onWarn?.(detection.reason || '无法识别源包的存储引擎');
    return { applicable: false, sourceEngine: '', targetEngine: want, reason: detection.reason };
  }
  if (sourceEngine === want) {
    return { applicable: false, sourceEngine, targetEngine: want, reason: '源与目标引擎相同' };
  }
  if (sourceEngine !== ENGINE_KINDS.FS) {
    const check = validateEngineMeta(meta);
    if (!check.ok && detection.handledBy === 'dump') {
      onWarn?.(check.reason);
      return { applicable: false, sourceEngine, targetEngine: want, reason: check.reason };
    }
  }
  if (want === ENGINE_KINDS.SQLITE && typeof sqliteInit !== 'function') {
    const reason = 'SQLite 目标需要 sql.js 初始化器（尚未注入）';
    onWarn?.(reason);
    return { applicable: false, sourceEngine, targetEngine: want, reason };
  }
  if (sourceEngine === ENGINE_KINDS.SQLITE && typeof sqliteInit !== 'function') {
    const reason = 'SQLite 源需要 sql.js 初始化器（尚未注入）';
    onWarn?.(reason);
    return { applicable: false, sourceEngine, targetEngine: want, reason };
  }

  const resolvedHandle = String(
    handle || meta?.handle || manifest?.handle || prefixHandle || '',
  ).trim();
  const needsHandle = want !== ENGINE_KINDS.FS || sourceEngine === ENGINE_KINDS.FS;
  if (needsHandle && !resolvedHandle) {
    const reason = '目标引擎需要用户 handle（包内未提供，且未显式指定）';
    onWarn?.(reason);
    return { applicable: false, sourceEngine, targetEngine: want, reason };
  }

  const suppress = (name) => {
    if (isEngineCarrierEntry(name)) return true;
    if (want === ENGINE_KINDS.FS && sourceEngine !== ENGINE_KINDS.FS) {
      return isFsEnginePath(relativizeEntryName(name, resolvedHandle));
    }
    return false;
  };

  return {
    applicable: true,
    sourceEngine,
    targetEngine: want,
    handle: resolvedHandle,
    suppress,
    async emit(writer, { onWarn: emitWarn } = {}) {
      return emitConversion({
        io,
        sourcePath,
        sourceEngine,
        targetEngine: want,
        handle: resolvedHandle,
        selection,
        sqliteInit,
        writer,
        onWarn: emitWarn || onWarn,
      });
    },
  };
}

async function emitConversion({
  io, sourcePath, sourceEngine, targetEngine, handle, selection, sqliteInit, writer, onWarn,
}) {
  const sink = await createTargetSink({ targetEngine, handle, sqliteInit, writer, onWarn });
  const readCounts = Object.fromEntries(DUMP_TABLES.map((t) => [t.name, 0]));
  const pushRow = (table, row) => {
    if (!selectionAllowsRow(table, selection)) return;
    readCounts[table] += 1;
    sink.row(table, { ...row, handle });
  };

  const reader = await io.openReader(sourcePath);
  try {
    if (sourceEngine === ENGINE_KINDS.FS) {
      for await (const entry of reader.entries()) {
        const rel = relativizeEntryName(entry.fileName, handle);
        if (!isFsEnginePath(rel) || isEngineCarrierEntry(entry.fileName)) {
          entry.skip?.();
          continue;
        }
        const text = new TextDecoder().decode(await entry.read());
        const mapped = fsEntryToRow(rel, text, {
          handle,
          updatedAt: entry.lastModified ? new Date(entry.lastModified).getTime() : 0,
        });
        if (mapped) pushRow(mapped.table, mapped.row);
        else onWarn?.(`引擎文件无法映射为行：${rel}`);
      }
    } else if (sourceEngine === ENGINE_KINDS.SQLITE) {
      let bytes = null;
      for await (const entry of reader.entries()) {
        if (String(entry.fileName).split('/').pop() === SQLITE_DB_ENTRY) {
          bytes = await entry.read();
        } else {
          entry.skip?.();
        }
      }
      if (!bytes) throw new Error('源包标记为 SQLite，但未找到 luker-storage.sqlite');
      const SQL = await sqliteInit({});
      readSqlite({
        SQL,
        bytes,
        handle,
        onRow: (table, row) => pushRow(table, row),
        onWarn,
      });
    } else {
      let parser = null;
      for await (const entry of reader.entries()) {
        if (String(entry.fileName).split('/').pop() === ENGINE_DUMP_ENTRY) {
          parser = createDumpParser({ onRow: (table, row) => pushRow(table, row), onWarn });
          const stream = await entry.openStream();
          for await (const chunk of stream) parser.push(chunk);
        } else {
          entry.skip?.();
        }
      }
      if (!parser) throw new Error('源包标记为数据库引擎，但未找到 _engine_dump.bin');
      const { bad } = parser.finish();
      if (bad > 0) {
        throw new Error(`_engine_dump.bin 有 ${bad} 行无法解析，已中止（不产出半成品）`);
      }
    }
  } finally {
    await reader.close();
  }

  const written = await sink.finish();
  const mismatches = [];
  for (const table of DUMP_TABLES) {
    const read = readCounts[table.name] || 0;
    const wrote = written.counts[table.name] || 0;
    if (read !== wrote) mismatches.push(`${table.name}: 读到 ${read} / 写入 ${wrote}`);
  }
  if (mismatches.length) {
    throw new Error(`引擎转换对账不符：${mismatches.join('；')}`);
  }
  return { sourceEngine, targetEngine, handle, counts: written.counts, total: Object.values(written.counts).reduce((a, b) => a + b, 0) };
}

async function createTargetSink({ targetEngine, handle, sqliteInit, writer, onWarn }) {
  if (targetEngine === ENGINE_KINDS.FS) {
    const counts = Object.fromEntries(DUMP_TABLES.map((t) => [t.name, 0]));
    const emitted = new Set();
    let pending = 0;
    return {
      row(table, row) {
        const entry = rowToFsEntry(table, row);
        if (!entry) {
          onWarn?.(`行无法写成文件（表 ${table}），已跳过`);
          return;
        }
        if (emitted.has(entry.name)) {
          onWarn?.(`目标路径重复：${entry.name}（后写入者覆盖相同行，已按 zip 去重）`);
          return;
        }
        emitted.add(entry.name);
        counts[table] += 1;
        pending += 1;
        void writer.add(entry.name, encoder.encode(entry.text));
        if (pending >= 64) {
          pending = 0;
          void writer.waitForRoom?.();
        }
      },
      async finish() {
        await writer.waitForRoom?.();
        return { counts };
      },
    };
  }

  if (targetEngine === ENGINE_KINDS.SQLITE) {
    const SQL = await sqliteInit({});
    const sink = createSqliteWriter({ SQL, handle });
    return {
      row(table, row) { sink.row(table, row); },
      async finish() {
        const { bytes, counts, name } = sink.finish();
        await writer.add(name, bytes);
        return { counts };
      },
    };
  }

  // postgres / mysql
  const dump = createDumpWriter({ kind: targetEngine, onWarn });
  return {
    row(table, row) { dump.row(table, row); },
    async finish() {
      const { chunks, byteSize, meta, counts } = dump.finish({ handle });
      writer.addLazy(
        ENGINE_DUMP_ENTRY,
        (cb) => {
          cb(null, new ReadableStream({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk);
              controller.close();
            },
          }));
        },
        byteSize,
      );
      await writer.add(ENGINE_META_ENTRY, encoder.encode(meta));
      return { counts };
    },
  };
}

export { ENGINE_DUMP_ENTRY, ENGINE_META_ENTRY, SQLITE_DB_ENTRY, engineKindOfMeta };
