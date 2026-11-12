/**
 * SQLite 引擎适配：`<handle>/luker-storage.sqlite` ↔ canonical 行。
 *
 * 上游事实（2026-11-12 取证）：
 * - SQLite 的 dump 就是**原始 `.sqlite` 文件字节**（`sqlite-engine.js:86-95`）。
 * - 表结构与 mysql/postgres 同构，DDL 见 `migrations/sqlite/0001-initial.sql`；
 *   `chats.integrity` 是 `json_extract(...)` 的 GENERATED STORED 列。
 * - 迁移版本记在 `PRAGMA user_version`（`sqlite-schema.js`）。
 *
 * 依赖注入：`initSqlJs` 由调用方提供（浏览器用 fetch 到的 wasm，Node 测试用文件字节），
 * 本模块不碰 DOM、不碰文件系统，可在 Vitest 直接跑。
 */

import {
  DUMP_TABLES,
  TABLE_COLUMNS,
  SQLITE_DB_ENTRY,
  parseDocValue,
  serializeDocValue,
} from '../engine-model.js';

export const SCHEMA_VERSION = 1;

/** 与上游 `migrations/sqlite/0001-initial.sql` 逐字一致的 DDL。 */
export const SQLITE_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS chats (
    handle TEXT NOT NULL,
    char_dir TEXT NOT NULL,
    name TEXT NOT NULL,
    is_group INTEGER NOT NULL DEFAULT 0,
    group_id TEXT NOT NULL DEFAULT '',
    doc TEXT NOT NULL,
    integrity TEXT GENERATED ALWAYS AS (json_extract(doc, '$.header.chat_metadata.integrity')) STORED,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (handle, char_dir, name, is_group, group_id)
  )`,
  'CREATE INDEX IF NOT EXISTS chats_updated ON chats(handle, updated_at DESC)',
  `CREATE TABLE IF NOT EXISTS chat_states (
    handle TEXT NOT NULL,
    char_dir TEXT NOT NULL,
    name TEXT NOT NULL,
    is_group INTEGER NOT NULL DEFAULT 0,
    group_id TEXT NOT NULL DEFAULT '',
    namespace TEXT NOT NULL,
    doc TEXT NOT NULL,
    PRIMARY KEY (handle, char_dir, name, is_group, group_id, namespace)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    handle TEXT PRIMARY KEY,
    doc TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS presets (
    handle TEXT NOT NULL,
    dir_key TEXT NOT NULL,
    name TEXT NOT NULL,
    doc TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (handle, dir_key, name)
  )`,
  `CREATE TABLE IF NOT EXISTS preset_states (
    handle TEXT NOT NULL,
    dir_key TEXT NOT NULL,
    name TEXT NOT NULL,
    namespace TEXT NOT NULL,
    doc TEXT NOT NULL,
    PRIMARY KEY (handle, dir_key, name, namespace)
  )`,
  `CREATE TABLE IF NOT EXISTS worlds (
    handle TEXT NOT NULL,
    name TEXT NOT NULL,
    doc TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (handle, name)
  )`,
  `CREATE TABLE IF NOT EXISTS named_docs (
    handle TEXT NOT NULL,
    bucket TEXT NOT NULL,
    name TEXT NOT NULL,
    doc TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (handle, bucket, name)
  )`,
  `CREATE TABLE IF NOT EXISTS groups_table (
    handle TEXT NOT NULL,
    id TEXT NOT NULL,
    doc TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (handle, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stats (
    handle TEXT PRIMARY KEY,
    doc TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
]);

function normalizeCell(col, value) {
  if (col === 'doc') return parseDocValue(value);
  if (col === 'is_group') return value === 1 || value === true || value === '1';
  if (col === 'group_id') return value == null ? '' : String(value);
  if (col === 'updated_at' || col === 'created_at') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return value == null ? null : value;
}

/**
 * 读一个 SQLite 数据库字节流，逐表逐行回调。
 *
 * @param {{ SQL: any, bytes: Uint8Array|ArrayBuffer,
 *           onRow?: (table:string,row:object)=>void,
 *           onWarn?: (msg:string)=>void,
 *           handle?: string }} args
 * @returns {{ counts: Record<string,number>, handle: string }}
 */
export function readSqlite({ SQL, bytes, onRow, onWarn, handle = '' } = {}) {
  const db = new SQL.Database(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const counts = Object.fromEntries(DUMP_TABLES.map((t) => [t.name, 0]));
  let dbHandle = handle;
  try {
    const version = Number(db.exec('PRAGMA user_version')[0]?.values?.[0]?.[0] ?? 0);
    if (version !== SCHEMA_VERSION) {
      onWarn?.(`SQLite user_version=${version}，上游当前 schemaVersion=${SCHEMA_VERSION}`);
    }
    for (const table of DUMP_TABLES) {
      let result;
      try {
        result = db.exec(`SELECT ${table.cols.join(', ')} FROM ${table.name}`);
      } catch (error) {
        onWarn?.(`SQLite 表 ${table.name} 读取失败：${error.message}`);
        continue;
      }
      if (!result?.length) continue;
      const { columns, values } = result[0];
      for (const cells of values) {
        const row = {};
        columns.forEach((col, i) => { row[col] = normalizeCell(col, cells[i]); });
        if (!dbHandle && row.handle) dbHandle = String(row.handle);
        if (dbHandle && row.handle && String(row.handle) !== dbHandle) continue;
        onRow?.(table.name, row);
        counts[table.name] += 1;
      }
    }
  } finally {
    db.close();
  }
  return { counts, handle: dbHandle };
}

function insertSql(table) {
  const cols = TABLE_COLUMNS[table];
  return `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
}

function bindValues(table, row) {
  return TABLE_COLUMNS[table].map((col) => {
    const value = row?.[col];
    if (col === 'doc') return serializeDocValue(value);
    if (col === 'is_group') return value ? 1 : 0;
    if (col === 'group_id') return value == null ? '' : String(value);
    if (col === 'updated_at' || col === 'created_at') return Number(value) || 0;
    return value == null ? '' : value;
  });
}

/**
 * 建一个 SQLite 写入器：逐行收数据，`finish()` 导出完整 `.sqlite` 字节。
 *
 * @param {{ SQL: any, handle: string }} args
 */
export function createSqliteWriter({ SQL, handle }) {
  const db = new SQL.Database();
  const counts = Object.fromEntries(DUMP_TABLES.map((t) => [t.name, 0]));
  db.exec('PRAGMA journal_mode = MEMORY');
  for (const statement of SQLITE_DDL) db.exec(statement);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  const statements = new Map();
  const prepared = (table) => {
    if (!statements.has(table)) statements.set(table, db.prepare(insertSql(table)));
    return statements.get(table);
  };

  return {
    row(table, row) {
      if (!TABLE_COLUMNS[table]) return;
      const stmt = prepared(table);
      stmt.run(bindValues(table, { ...row, handle: row?.handle || handle }));
      counts[table] += 1;
    },
    finish() {
      for (const stmt of statements.values()) stmt.free();
      statements.clear();
      const bytes = db.export();
      db.close();
      return { bytes, counts, name: `${handle}/${SQLITE_DB_ENTRY}` };
    },
  };
}

export { SQLITE_DB_ENTRY };
