/**
 * user/files 上传登记表。
 *
 * 宿主没有「列出 user/files」的端点（只有 upload / delete / verify），
 * 所以「列出」只能靠本插件自己的登记：每次上传成功记一条，删除成功后移除。
 * 存储用 localStorage（与设置同源），读写失败一律静默降级为空表/不写。
 */

const STORAGE_KEY = 'st-pack-transfer:user-files';
const MAX_ENTRIES = 200;

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function normalize(entry) {
  if (!entry || typeof entry.path !== 'string' || !entry.path) return null;
  return {
    name: String(entry.name || entry.path.split('/').pop() || ''),
    path: entry.path,
    uploadedAt: Number(entry.uploadedAt) || 0,
    sizeBytes: Number(entry.sizeBytes) || 0,
    sourceName: String(entry.sourceName || ''),
  };
}

/** @returns {Array<{name:string,path:string,uploadedAt:number,sizeBytes:number,sourceName:string}>} */
export function loadPrivateFiles() {
  const store = storage();
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(normalize).filter(Boolean);
  } catch {
    return [];
  }
}

export function savePrivateFiles(list) {
  const store = storage();
  if (!store) return false;
  try {
    const clean = (list || []).map(normalize).filter(Boolean).slice(0, MAX_ENTRIES);
    store.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

/** 同一 path 重复上传视为覆盖（宿主同名写入同样会覆盖）。 */
export function addPrivateFile(entry) {
  const item = normalize(entry);
  if (!item) return loadPrivateFiles();
  const rest = loadPrivateFiles().filter((existing) => existing.path !== item.path);
  const next = [item, ...rest].slice(0, MAX_ENTRIES);
  savePrivateFiles(next);
  return next;
}

export function removePrivateFile(path) {
  const next = loadPrivateFiles().filter((entry) => entry.path !== path);
  savePrivateFiles(next);
  return next;
}
