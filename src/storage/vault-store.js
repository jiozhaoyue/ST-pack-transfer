/**
 * 私有格式仓（Vault）：任意酒馆私有格式数据包的**字节精确**存储层。
 *
 * 用户目标（2026-10-26）：在不同酒馆上放各酒馆私有格式文件（互不兼容的包），
 * 存储是**后端**而非浏览器，完整存储、完全存储，可经插件导入导出。
 *
 * 双后端（L0-11 / L1-MR-1 适配器 + 特性检测 + 静默降级）：
 *   · `authority` —— Authority 服务端 blob 分块存储（复用 authority-store 的
 *     putArtifact / getArtifact / deleteArtifact：4MB 分块 + KV 清单 + 代际隔离），
 *     条目元数据与 id 索引存 Authority KV。这是「后端存储」主路径。
 *   · `indexeddb` —— Authority 不可用时的浏览器降级（db.js files store，
 *     origin='vault'）。功能不缺，但数据在浏览器（清缓存即丢），UI 须明示。
 *
 * 字节精确保证：写入走 authority-store 的流式分块（不整包驻留），读出重组后
 * 按条目 `size` 校验；roundtrip 一致性由单测锁定（含 >4MB 跨块文件）。
 */

import {
  getAuthorityClient,
  putArtifact,
  getArtifact,
  deleteArtifact,
  authorityKvGet,
  authorityKvSet,
  authorityKvDelete,
} from './authority-store.js';
import {
  saveFile,
  getFile,
  deleteFile,
  listStoredFiles,
  isStorageSupported,
  ORIGINS,
} from './db.js';

const KV_INDEX_KEY = 'vault-index';
const KV_ENTRY_PREFIX = 'vault-entry:';
/** IndexedDB 侧的仓条目来源标记（db.js ORIGINS 的消费者语义：私有格式仓） */
export const VAULT_ORIGIN = ORIGINS.VAULT;

/** 格式标签全集：st / l / tt / pt 四布局 + raw（原始/未识别） */
export const VAULT_FORMAT_TAGS = Object.freeze(['st', 'l', 'tt', 'pt', 'raw']);

const TAG_SET = new Set(VAULT_FORMAT_TAGS);

/** 归一化格式标签：未识别值一律落 raw */
export function normalizeFormatTag(tag) {
  return TAG_SET.has(tag) ? tag : 'raw';
}

/**
 * 从文件名猜格式标签（纯函数）。
 * 依据是本插件自己的产物命名约定 `{target}_...`（filename-template.js）与
 * 宿主拉取包名；猜不中就是 raw——仓的本义就是「不兼容也原样存」。
 */
export function guessVaultFormat(name) {
  const m = /^(st|l|tt|pt)_/.exec(String(name || ''));
  return m ? m[1] : 'raw';
}

/** 新条目 id：时间戳 36 进制 + 随机段，同毫秒多次写入互不覆盖 */
function newVaultId() {
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** blob 逻辑名里的安全文件名（剥掉路径分隔与 Windows 保留字符，限长防超限） */
function sanitizeName(name) {
  const clean = String(name || '').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 120);
  return clean || 'unnamed';
}

function logicalNameOf(id, name) {
  return `vault:${id}:${sanitizeName(name)}`;
}

/**
 * 当前仓后端。
 * @returns {Promise<'authority'|'indexeddb'|null>} null = 两层都不可用（无 Authority 且无 IndexedDB）
 */
export async function vaultBackend() {
  const client = await getAuthorityClient();
  if (client) return 'authority';
  return isStorageSupported() ? 'indexeddb' : null;
}

/**
 * 存入仓（字节精确，不转换不过滤）。
 * @param {object} params
 * @param {string} params.name 显示名
 * @param {Blob|File} params.blob 数据本体
 * @param {string} [params.formatTag] 格式标签（缺省按文件名猜）
 * @param {string} [params.note] 备注
 * @param {(done:number,total:number)=>void} [params.onProgress] 分块进度（Authority 路径）
 * @returns {Promise<object|null>} 条目；null = 无可用后端
 * @throws Authority 路径写入失败时抛出（调用方决定提示方式；失败不留半成品——
 *         putArtifact 自带回滚；索引与条目写在数据成功之后）
 */
export async function vaultPut({ name, blob, formatTag, note = '', onProgress } = {}) {
  if (!blob) return null;
  const backend = await vaultBackend();
  if (!backend) return null;
  const tag = normalizeFormatTag(formatTag ?? guessVaultFormat(name));
  const displayName = sanitizeName(name);
  const id = newVaultId();

  if (backend === 'authority') {
    const logical = logicalNameOf(id, displayName);
    const res = await putArtifact(logical, blob, { onProgress });
    const entry = {
      id,
      name: displayName,
      logical,
      formatTag: tag,
      note,
      size: res.size,
      chunks: res.chunks,
      savedAt: Date.now(),
    };
    // 顺序：条目先写、索引后写 —— 中断只会留下「有数据无索引」的孤儿（可被
    // 未来的对账清理吸收），不会出现「索引指向空条目」的悬空。
    await authorityKvSet(KV_ENTRY_PREFIX + id, entry);
    const ids = await authorityKvGet(KV_INDEX_KEY);
    const nextIds = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
    nextIds.push(id);
    await authorityKvSet(KV_INDEX_KEY, nextIds);
    return { ...entry, backend };
  }

  const storedId = await saveFile({
    id,
    name: displayName,
    size: blob.size || 0,
    blob,
    origin: VAULT_ORIGIN,
    metadata: { vault: true, formatTag: tag, note },
  });
  if (!storedId) return null;
  return {
    id: storedId,
    name: displayName,
    formatTag: tag,
    note,
    size: blob.size || 0,
    chunks: 1,
    savedAt: Date.now(),
    backend,
  };
}

/**
 * 列出仓内全部条目（新→旧）。
 * @returns {Promise<Array<{id,name,formatTag,note,size,chunks,savedAt,backend}>>}
 */
export async function vaultList() {
  const backend = await vaultBackend();
  if (backend === 'authority') {
    const ids = await authorityKvGet(KV_INDEX_KEY);
    const out = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (typeof id !== 'string') continue;
      const e = await authorityKvGet(KV_ENTRY_PREFIX + id);
      // 索引里指向但条目缺失（写索引前中断的残留形态不会出现；防御历史脏数据）
      if (e && typeof e === 'object' && e.id) out.push({ ...e, backend });
    }
    out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return out;
  }
  if (backend === 'indexeddb') {
    const rows = await listStoredFiles(null, VAULT_ORIGIN);
    return rows
      .filter((r) => r.metadata && r.metadata.vault)
      .map((r) => ({
        id: r.id,
        name: r.name,
        formatTag: normalizeFormatTag(r.metadata.formatTag),
        note: r.metadata.note || '',
        size: r.size,
        chunks: 1,
        savedAt: r.createdAt,
        backend,
      }))
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  }
  return [];
}

/**
 * 取出条目（重组为 Blob）。
 * @param {string} id 条目 id
 * @returns {Promise<{blob: Blob, entry: object}|null>} null = 不存在或后端不可用
 */
export async function vaultGet(id) {
  if (!id) return null;
  const backend = await vaultBackend();
  if (backend === 'authority') {
    const entry = await authorityKvGet(KV_ENTRY_PREFIX + id);
    if (!entry || !entry.logical) return null;
    const blob = await getArtifact(entry.logical);
    if (!blob) return null;
    // 完整性校验：按写入时记录的字节数核对（v1 的完全存储读数；hash 指纹列范围外）
    if (typeof entry.size === 'number' && blob.size !== entry.size) {
      throw new Error(`仓条目「${entry.name}」字节数不符: 期望 ${entry.size}，实际 ${blob.size}`);
    }
    return { blob, entry: { ...entry, backend } };
  }
  if (backend === 'indexeddb') {
    const rec = await getFile(id);
    if (!rec || !rec.metadata?.vault) return null;
    return {
      blob: rec.blob,
      entry: {
        id: rec.id,
        name: rec.name,
        formatTag: normalizeFormatTag(rec.metadata.formatTag),
        note: rec.metadata.note || '',
        size: rec.size,
        chunks: 1,
        savedAt: rec.createdAt,
        backend,
      },
    };
  }
  return null;
}

/**
 * 删除条目（数据 + 元数据 + 索引项）。
 * @returns {Promise<boolean>}
 */
export async function vaultDelete(id) {
  if (!id) return false;
  const backend = await vaultBackend();
  if (backend === 'authority') {
    const entry = await authorityKvGet(KV_ENTRY_PREFIX + id);
    if (entry && entry.logical) await deleteArtifact(entry.logical);
    await authorityKvDelete(KV_ENTRY_PREFIX + id);
    const ids = await authorityKvGet(KV_INDEX_KEY);
    if (Array.isArray(ids)) {
      await authorityKvSet(KV_INDEX_KEY, ids.filter((x) => x !== id));
    }
    return true;
  }
  if (backend === 'indexeddb') {
    await deleteFile(id);
    return true;
  }
  return false;
}
