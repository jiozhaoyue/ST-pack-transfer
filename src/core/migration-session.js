/**
 * 旧会话兼容与共享状态（S5 第一步 · 纯逻辑）。
 *
 * 兑现 `R-10`：升级后旧工作区夹具仍可读；无法续跑的旧任务给**明确安全重开路径**，
 * **不猜着续跑**（`.trellis/spec/frontend/migration-compatibility-and-release.md` §4）。
 *
 * 硬约束：本模块不得依赖 DOM / `window` / `fetch`，须能在 Node/Vitest 直接运行（`L1-MR-6`）。
 */

/** 已知会话 schema 版本（用于判别「版本可识别」）。 */
export const KNOWN_SESSION_SCHEMAS = Object.freeze([1]);

/**
 * 归一一条工作区会话记录（旧/缺字段一律补默认，**不丢任何原字段**）。
 *
 * @param {object} record
 * @returns {object|null} 非对象 ⇒ `null`
 */
export function normalizeLegacySession(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const hasSchema = Object.prototype.hasOwnProperty.call(record, 'schemaVersion');
  return {
    ...record,
    schemaVersion: hasSchema ? record.schemaVersion : 1,
    legacy: !hasSchema,
  };
}

/**
 * 判别旧会话能否安全续跑。**三条同时满足**才可续跑：
 * ① 版本可识别；② 有断点清单；③ 有半成品线索（`opfsName` 或 `receivedBytes>0`）。
 *
 * @param {object} record
 * @returns {{resumable: boolean, reason: string}}
 */
export function isResumableSession(record) {
  const session = normalizeLegacySession(record);
  if (!session) return { resumable: false, reason: '会话记录无效' };

  if (!KNOWN_SESSION_SCHEMAS.includes(session.schemaVersion)) {
    return { resumable: false, reason: `未知会话版本 ${session.schemaVersion}，不猜着续跑` };
  }

  const cp = session.checkpoint;
  if (!cp || typeof cp !== 'object' || Array.isArray(cp) || Object.keys(cp).length === 0) {
    return { resumable: false, reason: '缺少断点清单' };
  }

  const hasPartial = Boolean(cp.opfsName) || Number(cp.receivedBytes) > 0;
  if (!hasPartial) {
    return { resumable: false, reason: '断点无半成品线索（无 opfsName 且 receivedBytes=0）' };
  }

  return { resumable: true, reason: '' };
}
