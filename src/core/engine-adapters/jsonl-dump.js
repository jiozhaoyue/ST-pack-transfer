/**
 * PG / MySQL 的引擎转储适配（纯逻辑，无 DOM）。
 *
 * 上游事实（2026-11-12 取证）：
 * - `_engine_dump.bin` **不是** pg_dump 二进制，而是**逐行 JSONL**：
 *   `{"sql":"INSERT INTO <表> (cols) VALUES ($1, …)","params":[…]}`；
 *   MySQL 引擎只把占位符换成 `?`（`postgres-engine.js:213-240`、`mysql-engine.js:260-285`）。
 * - 恢复端只按行回放 `{sql, params}`，因此我们生成的文本只要列清单与方言正确即可被原生恢复消费。
 * - `_engine_meta.json` = `{engineKind, schemaVersion:1, createdAt, handle}`；
 *   `engineKind` 与目标引擎不一致时宿主**直接拒绝**（`migration/backup.js:147-160`）。
 */

import {
  DUMP_TABLES,
  TABLE_COLUMNS,
  ENGINE_META_ENTRY,
  ENGINE_DUMP_ENTRY,
  normalizeEngineKind,
  parseDocValue,
  serializeDocValue,
  pickRow,
} from '../engine-model.js';

export const SUPPORTED_DUMP_KINDS = Object.freeze(['postgres', 'mysql']);
export const CURRENT_SCHEMA_VERSION = 1;

const INSERT_RE = /^\s*INSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(([^)]*)\)\s*VALUES/i;

function dialectPlaceholders(kind, count) {
  return Array.from({ length: count }, (_, i) => (kind === 'mysql' ? '?' : `$${i + 1}`)).join(', ');
}

/** 一行 dump 文本 → `{ table, row }`；不是合法 INSERT 返回 null。 */
export function parseDumpLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  const sql = typeof payload?.sql === 'string' ? payload.sql : '';
  const match = INSERT_RE.exec(sql);
  if (!match) return null;
  const table = match[1];
  if (!TABLE_COLUMNS[table]) return { table, row: null };
  const cols = match[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const params = Array.isArray(payload.params) ? payload.params : [];
  const raw = {};
  cols.forEach((col, i) => { raw[col] = params[i]; });
  const row = pickRow(table, normalizeRowValues(table, raw));
  return { table, row };
}

function normalizeRowValues(table, raw) {
  const out = { ...raw };
  if (Object.prototype.hasOwnProperty.call(out, 'doc')) {
    out.doc = parseDocValue(out.doc);
  }
  for (const key of ['updated_at', 'created_at']) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = typeof out[key] === 'string' && out[key].trim() !== ''
        ? Number(out[key])
        : out[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(out, 'is_group')) {
    const value = out.is_group;
    out.is_group = value === true || value === 1 || value === '1' || value === 'true';
  }
  if (table === 'chats' || table === 'chat_states') {
    if (out.group_id == null) out.group_id = '';
  }
  return out;
}

/** 一行 canonical 行 → dump 文本（含换行）。 */
export function serializeDumpLine(table, row, kind) {
  const cols = TABLE_COLUMNS[table];
  if (!cols) throw new Error(`jsonl-dump: 未知表 ${table}`);
  const params = cols.map((col) => {
    const value = row?.[col];
    if (col === 'doc') return serializeDocValue(value);
    // 上游 chats.is_group 在 PG 是 SMALLINT、MySQL 是 TINYINT（`0001-initial.sql` 注明为
    // 「parity with MySQL」），**不是布尔列**；写 `true/false` 会被 PG 直接拒绝。
    if (col === 'is_group') return value ? 1 : 0;
    return value === undefined ? null : value;
  });
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${dialectPlaceholders(kind, cols.length)})`;
  return `${JSON.stringify({ sql, params })}\n`;
}

/**
 * 流式 JSONL 解析器：按块喂入字节，按行回调。
 *
 * 关键点：块边界可能落在多字节 UTF-8 中间（CJK/emoji），必须用 `TextDecoder` 的
 * stream 模式跨块续解码，否则会静默产生 U+FFFD（上游 `postgres-engine.js` 已踩过）。
 */
export function createDumpParser({ onRow, onWarn } = {}) {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let lineNo = 0;
  let bad = 0;

  const handleLine = (line) => {
    lineNo += 1;
    if (!line.trim()) return;
    const parsed = parseDumpLine(line);
    if (!parsed) {
      bad += 1;
      onWarn?.(`_engine_dump.bin 第 ${lineNo} 行无法解析，已跳过`);
      return;
    }
    if (!parsed.row) {
      bad += 1;
      onWarn?.(`_engine_dump.bin 第 ${lineNo} 行指向未知表，已跳过`);
      return;
    }
    onRow?.(parsed.table, parsed.row);
  };

  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    },
    finish() {
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
      buffer = '';
      return { lines: lineNo, bad };
    },
    get badLines() { return bad; },
  };
}

/** 解析 `_engine_meta.json`；非对象返回 null。 */
export function parseEngineMeta(text) {
  try {
    const parsed = JSON.parse(String(text ?? ''));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** meta 的引擎类型（拿不到返回空串）。 */
export function engineKindOfMeta(meta) {
  return normalizeEngineKind(meta?.engineKind || meta?.kind || meta?.engine);
}

/** 生成 `_engine_meta.json` 文本。`schemaVersion` 固定写当前版本。 */
export function buildEngineMeta({ kind, handle }) {
  const engineKind = normalizeEngineKind(kind);
  if (!SUPPORTED_DUMP_KINDS.includes(engineKind)) {
    throw new Error(`jsonl-dump: 不支持生成 ${kind} 的引擎转储`);
  }
  return `${JSON.stringify({
    engineKind,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    handle: String(handle || ''),
  }, null, 2)}\n`;
}

/** 校验 meta 能否被当作转换来源；不能则给出原因。 */
export function validateEngineMeta(meta) {
  const kind = engineKindOfMeta(meta);
  if (!SUPPORTED_DUMP_KINDS.includes(kind)) {
    return { ok: false, kind, reason: `未知或不受支持的源引擎：${meta?.engineKind ?? '(缺失)'}` };
  }
  const version = Number(meta?.schemaVersion);
  if (version !== CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      kind,
      reason: `引擎转储 schemaVersion=${meta?.schemaVersion ?? '(缺失)'}，本工具只支持 ${CURRENT_SCHEMA_VERSION}`,
    };
  }
  return { ok: true, kind };
}

/** 建一个按目标方言输出 dump 的写入器（收集字节块，最后交给 zip 写入）。 */
export function createDumpWriter({ kind, onWarn } = {}) {
  const engineKind = normalizeEngineKind(kind);
  if (!SUPPORTED_DUMP_KINDS.includes(engineKind)) {
    throw new Error(`jsonl-dump: 不支持写入 ${kind}`);
  }
  const encoder = new TextEncoder();
  const chunks = [];
  let byteSize = 0;
  const counts = Object.fromEntries(DUMP_TABLES.map((t) => [t.name, 0]));

  return {
    row(table, row) {
      if (!TABLE_COLUMNS[table]) {
        onWarn?.(`未知表 ${table} 无法写入 ${engineKind} 转储，已跳过`);
        return;
      }
      const chunk = encoder.encode(serializeDumpLine(table, row, engineKind));
      chunks.push(chunk);
      byteSize += chunk.byteLength;
      counts[table] += 1;
    },
    /**
     * 产出 `{ chunks, byteSize, meta }`；`handle` 写入 meta。
     *
     * 刻意不返回拼好的大块：125 MB 级转储若先拼成连续内存，再交给写入器等于复制两份。
     * 调用方用 `chunks` + `byteSize` 直接建流（`addLazy`），全程零额外拷贝。
     */
    finish({ handle } = {}) {
      return {
        chunks,
        byteSize,
        meta: buildEngineMeta({ kind: engineKind, handle }),
        counts,
      };
    },
  };
}

export const ENGINE_ENTRY_NAMES = Object.freeze({ meta: ENGINE_META_ENTRY, dump: ENGINE_DUMP_ENTRY });
