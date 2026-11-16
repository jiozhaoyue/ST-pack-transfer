import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipIo } from '../src/core/zip-io.js';
import { convert } from '../src/core/transform.js';
import { planEngineConversion } from '../src/core/engine-bridge.js';
import { loadSqlJs } from '../src/core/sqlite-init.js';
import {
  serializeDumpLine, parseDumpLine, createDumpParser, buildEngineMeta,
} from '../src/core/engine-adapters/jsonl-dump.js';
import { rowToFsEntry, fsEntryToRow, presetRecordPath, parsePresetRecordPath } from '../src/core/engine-adapters/fs.js';
import { readSqlite, createSqliteWriter } from '../src/core/engine-adapters/sqlite.js';

const HANDLE = 'default-user';

function chatDoc() {
  return {
    header: { chat_metadata: { integrity: 'abc' }, user_name: '用户' },
    body: [{ name: '用户', mes: '你好 😀' }, { name: 'Seraphina', mes: 'hello' }],
  };
}

async function makeZip(entries) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-engine-bridge-'));
  const file = path.join(dir, 'pack.zip');
  const writer = await zipIo.createWriter(file, { level: 0 });
  for (const [name, data] of entries) await writer.add(name, data);
  await writer.close();
  return file;
}

async function readZip(source) {
  const reader = await zipIo.openReader(source);
  const out = new Map();
  try {
    for await (const entry of reader.entries()) {
      out.set(entry.fileName, new TextDecoder().decode(await entry.read()));
    }
  } finally {
    await reader.close();
  }
  return out;
}

describe('JSONL 转储：PG / MySQL 互认', () => {
  const rows = [
    ['settings', { handle: HANDLE, doc: { a: 1, b: '中文😀' }, updated_at: 1700000000000 }],
    ['chats', {
      handle: HANDLE, char_dir: '角色', name: '聊天 1', is_group: false, group_id: '',
      doc: chatDoc(), updated_at: 1700000000000, created_at: 1690000000000,
    }],
    ['groups_table', { handle: HANDLE, id: 'g1', doc: { name: 'g' }, updated_at: 1, created_at: 1 }],
  ];

  for (const kind of ['postgres', 'mysql']) {
    it(`${kind}：写出行能被自己解析回同一行`, () => {
      for (const [table, row] of rows) {
        const line = serializeDumpLine(table, row, kind);
        const parsed = parseDumpLine(line.trim());
        expect(parsed.table).toBe(table);
        expect(parsed.row).toEqual(row);
      }
    });
  }

  it('占位符方言正确', () => {
    const pg = serializeDumpLine('settings', rows[0][1], 'postgres');
    expect(pg).toContain('VALUES ($1, $2, $3)');
    const my = serializeDumpLine('settings', rows[0][1], 'mysql');
    expect(my).toContain('VALUES (?, ?, ?)');
  });

  it('is_group 写 0/1（上游是 SMALLINT，不是布尔列）', () => {
    const chat = rows[1][1];
    for (const kind of ['postgres', 'mysql']) {
      const parsed = JSON.parse(serializeDumpLine('chats', { ...chat, is_group: true }, kind));
      expect(parsed.params[3]).toBe(1);
      const parsedFalse = JSON.parse(serializeDumpLine('chats', { ...chat, is_group: false }, kind));
      expect(parsedFalse.params[3]).toBe(0);
    }
  });

  it('流式解析跨块不产生乱码', () => {
    const text = serializeDumpLine('settings', rows[0][1], 'postgres');
    const bytes = new TextEncoder().encode(text);
    const seen = [];
    const parser = createDumpParser({ onRow: (t, r) => seen.push([t, r]) });
    // 故意在多字节字符中间切块
    for (const byte of bytes) parser.push(new Uint8Array([byte]));
    expect(parser.finish().bad).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0][1].doc.b).toBe('中文😀');
  });

  it('meta 写入 schemaVersion=1 且带 handle', () => {
    const meta = JSON.parse(buildEngineMeta({ kind: 'mysql', handle: HANDLE }));
    expect(meta).toMatchObject({ engineKind: 'mysql', schemaVersion: 1, handle: HANDLE });
  });
});

describe('FS 适配：行 ↔ 文件', () => {
  it('各表都能双向还原', () => {
    const cases = [
      ['settings', { handle: HANDLE, doc: { x: 1 }, updated_at: 10 }],
      ['stats', { handle: HANDLE, doc: { n: 1 }, updated_at: 10 }],
      ['worlds', { handle: HANDLE, name: '世界', doc: { entries: {} }, updated_at: 10 }],
      ['groups_table', { handle: HANDLE, id: 'g1', doc: { id: 'g1' }, updated_at: 10, created_at: 5 }],
      ['named_docs', { handle: HANDLE, bucket: 'themes', name: 'Azure', doc: { a: 1 }, updated_at: 10 }],
      ['presets', { handle: HANDLE, dir_key: 'openAI_Settings', name: 'Default', doc: { t: 1 }, updated_at: 10 }],
      ['chats', {
        handle: HANDLE, char_dir: '角色', name: '聊天', is_group: false, group_id: '',
        doc: chatDoc(), updated_at: 10, created_at: 5,
      }],
      ['chat_states', {
        handle: HANDLE, char_dir: '角色', name: '聊天', is_group: false, group_id: '',
        namespace: 'chat_sync', doc: { s: 1 },
      }],
      ['preset_states', {
        handle: HANDLE, dir_key: 'openAI_Settings', name: 'Default', namespace: 'state', doc: { s: 1 },
      }],
    ];
    for (const [table, row] of cases) {
      const entry = rowToFsEntry(table, row);
      expect(entry, `${table} 应能落成文件`).toBeTruthy();
      const back = fsEntryToRow(entry.name, entry.text, { handle: HANDLE, updatedAt: 10 });
      expect(back?.table).toBe(table);
      // 磁盘上只有 mtime；`created_at` 在 FS 引擎同样取文件时间（上游 fs list() 用 birthtime/mtime），
      // 属已知精度上限，不是丢数据。
      const expected = (table === 'groups_table' || table === 'chats')
        ? { ...row, created_at: 10 }
        : row;
      expect(back.row).toMatchObject(expected);
    }
  });

  it('预设目录名用磁盘名而不是 dir_key', () => {
    const entry = rowToFsEntry('presets', {
      handle: HANDLE, dir_key: 'novelAI_Settings', name: 'X', doc: {}, updated_at: 1,
    });
    expect(entry.name).toBe('NovelAI Settings/X.json');
  });

  it('不安全预设名走 hex 规范路径且可逆', () => {
    const name = 'a'.repeat(300);
    const rel = presetRecordPath('instruct', 'preset', name);
    expect(rel).toContain('/.luker-preset-records/v1/');
    expect(parsePresetRecordPath(rel)).toEqual({ kind: 'preset', dirKey: 'instruct', name });
  });
});

describe('SQLite 适配：写 → 读', () => {
  it('行能写进 .sqlite 再读回', async () => {
    const SQL = await loadSqlJs();
    const writer = createSqliteWriter({ SQL, handle: HANDLE });
    writer.row('settings', { handle: HANDLE, doc: { a: 1 }, updated_at: 1 });
    writer.row('chats', {
      handle: HANDLE, char_dir: '角色', name: '聊天', is_group: false, group_id: '',
      doc: chatDoc(), updated_at: 2, created_at: 1,
    });
    const { bytes, name } = writer.finish();
    // L 包是用户根扁平布局：宿主只认根下的 luker-storage.sqlite
    expect(name).toBe('luker-storage.sqlite');
    const seen = [];
    readSqlite({ SQL, bytes, handle: HANDLE, onRow: (table, row) => seen.push([table, row]) });
    expect(seen.map(([t]) => t)).toEqual(['settings', 'chats']);
    expect(seen[1][1].doc.body[0].mes).toBe('你好 😀');
    expect(seen[1][1].is_group).toBe(false);
  });
});

describe('engine-bridge：整包互转', () => {
  it('PG 源 → FS 目标：产物无 dump，文件由行重建', async () => {
    const source = await makeZip([
      ['_engine_meta.json', JSON.stringify({ engineKind: 'postgres', schemaVersion: 1, handle: HANDLE })],
      ['_engine_dump.bin', serializeDumpLine('settings', { handle: HANDLE, doc: { a: 1 }, updated_at: 5 }, 'postgres')
        + serializeDumpLine('chats', {
          handle: HANDLE, char_dir: '角色', name: '聊天', is_group: false, group_id: '',
          doc: chatDoc(), updated_at: 5, created_at: 5,
        }, 'postgres')],
      ['settings.json', JSON.stringify({ stale: true })],
      ['characters/default.png', 'png-bytes'],
    ]);

    const plan = await planEngineConversion({ io: zipIo, sourcePath: source, targetEngine: 'fs' });
    expect(plan.applicable).toBe(true);
    expect(plan.sourceEngine).toBe('postgres');
    expect(plan.suppress('settings.json')).toBe(true);
    expect(plan.suppress('characters/default.png')).toBe(false);

    const target = path.join(await mkdtemp(path.join(os.tmpdir(), 'tavern-engine-target-')), 'out.zip');
    const writer = await zipIo.createWriter(target, { level: 0 });
    await writer.add('characters/default.png', 'png-bytes');
    await plan.emit(writer, {});
    await writer.close();

    const out = await readZip(target);
    expect(out.has('_engine_dump.bin')).toBe(false);
    expect(out.has('_engine_meta.json')).toBe(false);
    expect(JSON.parse(out.get('settings.json'))).toEqual({ a: 1 });
    const chat = out.get('chats/角色/聊天.jsonl').trim().split('\n');
    expect(JSON.parse(chat[0]).user_name).toBe('用户');
    expect(chat).toHaveLength(3);
  });

  it('FS 源 → MySQL 目标：meta engineKind 正确、dump 行数与源一致', async () => {
    const source = await makeZip([
      ['settings.json', JSON.stringify({ a: 1 })],
      ['worlds/世界.json', JSON.stringify({ entries: {} })],
      ['chats/角色/聊天.jsonl', `${JSON.stringify(chatDoc().header)}\n${JSON.stringify(chatDoc().body[0])}\n`],
      ['manifest.json', JSON.stringify({ schemaVersion: 1, handle: HANDLE })],
    ]);
    const plan = await planEngineConversion({ io: zipIo, sourcePath: source, targetEngine: 'mysql' });
    expect(plan.applicable).toBe(true);
    expect(plan.handle).toBe(HANDLE);

    const target = path.join(await mkdtemp(path.join(os.tmpdir(), 'tavern-engine-target-')), 'out.zip');
    const writer = await zipIo.createWriter(target, { level: 0 });
    const summary = await plan.emit(writer, {});
    await writer.close();

    const out = await readZip(target);
    const meta = JSON.parse(out.get('_engine_meta.json'));
    expect(meta.engineKind).toBe('mysql');
    const lines = out.get('_engine_dump.bin').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(summary.total);
    expect(summary.counts).toMatchObject({ settings: 1, worlds: 1, chats: 1 });
    expect(lines[0]).toContain('VALUES (?, ?, ?)');
  });

  it('schemaVersion 不匹配时如实拒绝，不转换', async () => {
    const source = await makeZip([
      ['_engine_meta.json', JSON.stringify({ engineKind: 'postgres', schemaVersion: 2, handle: HANDLE })],
      ['_engine_dump.bin', ''],
    ]);
    const warnings = [];
    const plan = await planEngineConversion({
      io: zipIo, sourcePath: source, targetEngine: 'fs', onWarn: (m) => warnings.push(m),
    });
    expect(plan.applicable).toBe(false);
    expect(plan.sourceEngine).toBe('postgres');
    expect(warnings.join('')).toContain('schemaVersion');
  });

  it('选择项为 false 的类目不进目标', async () => {
    const source = await makeZip([
      ['settings.json', JSON.stringify({ a: 1 })],
      ['worlds/世界.json', JSON.stringify({ entries: {} })],
    ]);
    const plan = await planEngineConversion({
      io: zipIo, sourcePath: source, targetEngine: 'postgres', handle: HANDLE, selection: { lorebooks: false },
    });
    const target = path.join(await mkdtemp(path.join(os.tmpdir(), 'tavern-engine-target-')), 'out.zip');
    const writer = await zipIo.createWriter(target, { level: 0 });
    const summary = await plan.emit(writer, {});
    await writer.close();
    expect(summary.counts.worlds).toBe(0);
    expect(summary.counts.settings).toBe(1);
  });
});

describe('engine-bridge：跨宿主（Luker 数据库形态 → 其它宿主文件形态）', () => {
  it('PG 源 → TT 目标：引擎行落成 data/default-user/ 文件，且不带 dump', async () => {
    const source = await makeZip([
      ['manifest.json', JSON.stringify({ schemaVersion: 1, handle: HANDLE, selection: {} })],
      ['_engine_meta.json', JSON.stringify({ engineKind: 'postgres', schemaVersion: 1, handle: HANDLE })],
      ['_engine_dump.bin', serializeDumpLine('settings', { handle: HANDLE, doc: { a: 1 }, updated_at: 5 }, 'postgres')
        + serializeDumpLine('worlds', { handle: HANDLE, name: '世界', doc: { entries: {} }, updated_at: 5 }, 'postgres')],
      ['settings.json', JSON.stringify({ stale: true })],
    ]);
    const out = path.join(await mkdtemp(path.join(os.tmpdir(), 'tavern-engine-tt-')), 'out.zip');
    await convert(source, out, { target: 'tt' });
    const zip = await readZip(out);
    expect(zip.has('_engine_dump.bin')).toBe(false);
    expect(JSON.parse(zip.get('data/default-user/settings.json'))).toEqual({ a: 1 });
    expect(JSON.parse(zip.get('data/default-user/worlds/世界.json'))).toEqual({ entries: {} });
  });
});
