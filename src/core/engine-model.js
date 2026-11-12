/**
 * 存储引擎的 canonical 行模型（纯数据，无 DOM、无 IO）。
 *
 * 事实来源（上游 Luker，2026-11-12 取证）：
 * - 表与列：`src/storage/engines/postgres-engine.js:23-33` 的 `DUMP_TABLES`（父表在前）。
 * - 磁盘目录名：`src/constants.js:35-64`（`dir_key` 与磁盘目录名**不同名**，见 PRESET_DIR_KEY_TO_FOLDER）。
 * - 命名文档桶：`src/storage/repositories/named-doc-repo.js` 的 `BUCKET_TO_DIR`。
 * - 预设目录：`src/storage/repositories/preset-repo.js` 的 `PRESET_FOLDER_BY_API_ID`。
 * - 旁车命名：`src/storage/engines/sidecar-naming.js`。
 * - SQLite DDL：`src/storage/engines/migrations/sqlite/0001-initial.sql`。
 *
 * 本模块只描述「数据长什么样」，不做任何读取/写入决策。
 */

/** 四种存储引擎（上游当前支持的全集）。 */
export const ENGINE_KINDS = Object.freeze({
  FS: 'fs',
  POSTGRES: 'postgres',
  MYSQL: 'mysql',
  SQLITE: 'sqlite',
});

export const ENGINE_LABELS = Object.freeze({
  fs: '文件系统',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
});

/** 包内的引擎承载物文件名。 */
export const ENGINE_META_ENTRY = '_engine_meta.json';
export const ENGINE_DUMP_ENTRY = '_engine_dump.bin';
export const SQLITE_DB_ENTRY = 'luker-storage.sqlite';

/** 行数据表清单 —— 顺序与上游 `DUMP_TABLES` 一致（父表在前，恢复时满足外键）。 */
export const DUMP_TABLES = Object.freeze([
  { name: 'settings', cols: Object.freeze(['handle', 'doc', 'updated_at']) },
  { name: 'stats', cols: Object.freeze(['handle', 'doc', 'updated_at']) },
  { name: 'groups_table', cols: Object.freeze(['handle', 'id', 'doc', 'updated_at', 'created_at']) },
  { name: 'named_docs', cols: Object.freeze(['handle', 'bucket', 'name', 'doc', 'updated_at']) },
  { name: 'worlds', cols: Object.freeze(['handle', 'name', 'doc', 'updated_at']) },
  { name: 'presets', cols: Object.freeze(['handle', 'dir_key', 'name', 'doc', 'updated_at']) },
  { name: 'preset_states', cols: Object.freeze(['handle', 'dir_key', 'name', 'namespace', 'doc']) },
  {
    name: 'chats',
    cols: Object.freeze([
      'handle', 'char_dir', 'name', 'is_group', 'group_id', 'doc', 'updated_at', 'created_at',
    ]),
  },
  {
    name: 'chat_states',
    cols: Object.freeze(['handle', 'char_dir', 'name', 'is_group', 'group_id', 'namespace', 'doc']),
  },
]);

/** 表名 → 列清单；固定顺序。 */
export const TABLE_COLUMNS = Object.freeze(Object.fromEntries(
  DUMP_TABLES.map((t) => [t.name, t.cols]),
));

/** 命名文档桶 → 磁盘目录名（注意 `quickReplies` → `QuickReplies`）。 */
export const BUCKET_TO_FOLDER = Object.freeze({
  themes: 'themes',
  movingUI: 'movingUI',
  quickReplies: 'QuickReplies',
});

export const FOLDER_TO_BUCKET = Object.freeze(Object.fromEntries(
  Object.entries(BUCKET_TO_FOLDER).map(([bucket, folder]) => [folder, bucket]),
));

/** 预设 `dir_key` → 磁盘目录名（上游 `constants.js`）。 */
export const PRESET_DIR_KEY_TO_FOLDER = Object.freeze({
  koboldAI_Settings: 'KoboldAI Settings',
  novelAI_Settings: 'NovelAI Settings',
  openAI_Settings: 'OpenAI Settings',
  textGen_Settings: 'TextGen Settings',
  instruct: 'instruct',
  context: 'context',
  sysprompt: 'sysprompt',
  reasoning: 'reasoning',
});

export const PRESET_FOLDER_TO_DIR_KEY = Object.freeze(Object.fromEntries(
  Object.entries(PRESET_DIR_KEY_TO_FOLDER).map(([dirKey, folder]) => [folder, dirKey]),
));

export const SIDECAR_INFIX = '.luker-state.';
export const SIDECAR_EXT = '.json';

/** 磁盘上属于「引擎管理」的顶层路径——FS 目标由其行数据重建，源包同名条目应被替换。 */
export const ENGINE_OWNED_TOP_LEVEL = Object.freeze([
  'settings.json',
  'stats.json',
  'worlds/',
  'groups/',
  'chats/',
  'group chats/',
  'themes/',
  'movingUI/',
  'QuickReplies/',
  ...Object.values(PRESET_DIR_KEY_TO_FOLDER).map((folder) => `${folder}/`),
]);

export function sidecarName(base, namespace) {
  return `${base}${SIDECAR_INFIX}${namespace}${SIDECAR_EXT}`;
}

/** 解出旁车文件名；不是旁车返回 null。 */
export function parseSidecarName(fileName) {
  const index = String(fileName || '').indexOf(SIDECAR_INFIX);
  if (index <= 0 || !fileName.endsWith(SIDECAR_EXT)) return null;
  const namespace = fileName.slice(index + SIDECAR_INFIX.length, fileName.length - SIDECAR_EXT.length);
  if (!namespace) return null;
  return { base: fileName.slice(0, index), namespace };
}

/** 引擎类型归一；未知值返回空串（由调用方如实报「不支持」，不猜）。 */
export function normalizeEngineKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'pg' || kind === 'postgresql') return ENGINE_KINDS.POSTGRES;
  return Object.values(ENGINE_KINDS).includes(kind) ? kind : '';
}

/** 包内条目是否属于引擎承载物（任意目录层级）。 */
export function isEngineCarrierEntry(name) {
  const base = String(name || '').split('/').pop();
  return base === ENGINE_META_ENTRY || base === ENGINE_DUMP_ENTRY || base === SQLITE_DB_ENTRY;
}

/** 建一个空的 canonical 行模型。 */
export function emptyModel() {
  return Object.fromEntries(DUMP_TABLES.map((t) => [t.name, []]));
}

/**
 * doc 参数归一为对象。
 * 上游 dump 里 `doc` 是**序列化后的字符串**（`postgres-engine.js` 的 `normalizeDumpValue`），
 * SQLite 里是 TEXT。解析失败返回 null，由调用方计入警告（不抛）。
 */
export function parseDocValue(value) {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** doc 值序列化为写入列时的文本。 */
export function serializeDocValue(value) {
  return JSON.stringify(value ?? {});
}

/** 按列清单收一行——多余的键丢弃，缺失的键补 null。 */
export function pickRow(table, source) {
  const cols = TABLE_COLUMNS[table];
  if (!cols) throw new Error(`engine-model: 未知表 ${table}`);
  const row = {};
  for (const col of cols) {
    const value = source?.[col];
    row[col] = value === undefined ? null : value;
  }
  return row;
}

/** 行数合计（对账用）。 */
export function countRows(model) {
  return DUMP_TABLES.reduce((sum, t) => sum + (model?.[t.name]?.length || 0), 0);
}

/** 逐表计数，用于对账报告。 */
export function countByTable(model) {
  return Object.fromEntries(DUMP_TABLES.map((t) => [t.name, model?.[t.name]?.length || 0]));
}
