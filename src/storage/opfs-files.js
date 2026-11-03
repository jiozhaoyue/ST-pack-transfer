/**
 * OPFS 文件存取（存储层，Web API）。
 *
 * 与 `host-bridge.js` 的临时流职责分开：本模块只做「按目录名打开/读取/删除」，
 * 供 IndexedDB 记录按名引用大包（host-export）使用，避免 GB 级内容二次拷入 IDB。
 */

/** 当前环境是否提供 OPFS（安全上下文 + navigator.storage.getDirectory）。 */
export function supportsOpfs() {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.storage?.getDirectory === 'function';
  } catch {
    return false;
  }
}

/**
 * 打开 OPFS 根下的子目录。
 * @param {string} dirName
 * @param {boolean} [create=true]
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function opfsDirectory(dirName, create = true) {
  if (!supportsOpfs()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(dirName, { create });
  } catch {
    return null;
  }
}

/**
 * 取子目录中的文件句柄。
 * @param {string} dirName
 * @param {string} name
 * @param {boolean} [create=true]
 * @returns {Promise<FileSystemFileHandle|null>}
 */
export async function opfsFileHandle(dirName, name, create = true) {
  const dir = await opfsDirectory(dirName, create);
  if (!dir) return null;
  try {
    return await dir.getFileHandle(name, { create });
  } catch {
    return null;
  }
}

/**
 * 读取子目录中的文件（不存在/不可用返回 null）。
 * @param {string} dirName
 * @param {string} name
 * @returns {Promise<File|null>}
 */
export async function opfsReadFile(dirName, name) {
  const handle = await opfsFileHandle(dirName, name, false);
  if (!handle) return null;
  try {
    return await handle.getFile();
  } catch {
    return null;
  }
}

/**
 * 删除子目录中的条目（不存在时静默）。
 * @param {string} dirName
 * @param {string} name
 */
export async function opfsRemove(dirName, name) {
  const dir = await opfsDirectory(dirName, false);
  if (!dir) return;
  try {
    await dir.removeEntry(name);
  } catch {
    // 不存在或目录不可达：无需处理
  }
}

/**
 * 清空子目录（仅删除条目不删目录本身）。
 * @param {string} dirName
 */
export async function opfsClearDir(dirName) {
  const dir = await opfsDirectory(dirName, false);
  if (!dir) return;
  try {
    const names = [];
    for await (const [name] of dir.entries()) names.push(name);
    await Promise.all(names.map((name) => dir.removeEntry(name).catch(() => {})));
  } catch {
    // 目录不可达：静默
  }
}
