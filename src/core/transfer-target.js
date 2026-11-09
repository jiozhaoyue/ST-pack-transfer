/**
 * 传输目标适配器（S3 / WebDAV 统一接口）
 *
 * 执行器只认 `head / put / get / list / remove / ensureCollection`，
 * 不关心底层协议；S3 与 WebDAV 的差异收敛在这里。
 */

import { createS3Client } from './s3-client.js';
import { createWebdavClient } from './webdav-client.js';

/**
 * @param {{kind?:'s3'|'webdav', config?:object, fetchImpl?:Function}} options
 * @returns {object}
 */
export function createTransferTarget({ kind = 's3', config = {}, fetchImpl = globalThis.fetch } = {}) {
  if (kind === 'webdav') {
    const dav = createWebdavClient({ config, fetchImpl });
    return {
      kind,
      ready: dav.ready,
      head: (key) => dav.headObject(key),
      put: (key, bytes, opts = {}) => dav.putObject(key, bytes, opts),
      get: (key, { start, end } = {}) => dav.getObject(key, {
        range: Number.isFinite(start) && Number.isFinite(end) ? `bytes=${start}-${end}` : undefined,
      }),
      remove: (key) => dav.deleteObject(key),
      ensureCollection: (path) => dav.ensureCollection(path),
      async list(prefix = '') {
        const result = await dav.list(prefix);
        if (!result.ok) return { ok: false, status: result.status, message: result.code || result.message };
        const base = String(prefix || '').replace(/\/+$/, '');
        return {
          ok: true,
          status: result.status,
          items: (result.items || [])
            .filter((item) => item && !item.isDir && item.name)
            .map((item) => ({
              key: base ? `${base}/${item.name}` : item.name,
              size: item.size,
              lastModified: item.lastModified,
            })),
        };
      },
    };
  }

  const s3 = createS3Client({ config, fetchImpl });
  return {
    kind: 's3',
    ready: s3.ready,
    head: (key) => s3.headObject(key),
    put: (key, bytes, opts = {}) => s3.putObject(key, bytes, opts),
    get: (key, { start, end } = {}) => (
      Number.isFinite(start) && Number.isFinite(end)
        ? s3.getObjectRange(key, { start, end })
        : s3.getObject(key)
    ),
    remove: (key) => s3.deleteObject(key),
    list: (prefix = '') => s3.listObjects(prefix),
    ensureCollection: async () => ({ ok: true, results: [] }),
  };
}
