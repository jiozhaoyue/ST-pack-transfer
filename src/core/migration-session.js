/**
 * 迁移会话状态：**强制不兼容**判别与只读解释。
 *
 * 用户裁定（2026-10-13 · U-1）：「禁止兼容旧数据，任何即使没改也要强制不兼容，强制做坏」。
 * 据此本模块**不再做旧会话归一/补齐**——`schemaVersion` 不是当前版本的记录一律作废，
 * **即使字段结构完全相同**也不放行（"看起来一样" 是推断，不是证据）。
 *
 * 作废的是**会话状态**，不是用户的包/半成品文件（那些是磁盘上的用户资产，不删不动）。
 *
 * 契约：`.trellis/spec/frontend/migration-compatibility-and-release.md` §3.1 / §4。
 * 硬约束：不得依赖 DOM / `window` / `fetch`，须能在 Node/Vitest 直接运行（`L1-MR-6`）。
 */

/** 当前会话 schema 版本。**v1 及任何非本值的记录一律作废**。 */
export const SESSION_SCHEMA_VERSION = 2;

/** 兼容判别的两个动作。 */
export const SESSION_ACTIONS = Object.freeze({
  CONTINUE: 'continue-supported',
  REJECT: 'reject-incompatible',
});

/** 统一的「从源重开」提示后缀，避免各处文案漂移。 */
const REOPEN_HINT = '须从源重新选择数据包（磁盘上的包与半成品文件未被删除）';

/**
 * 判别一条工作区会话记录是否可按当前版本继续使用。
 *
 * **只认 `schemaVersion === SESSION_SCHEMA_VERSION`**；其余一律 `reject-incompatible`，
 * 并按原因分类给出可执行的中文说明。
 *
 * @param {unknown} record
 * @returns {{compatible: boolean, action: string, reason: string}}
 */
export function classifySessionCompatibility(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      compatible: false,
      action: SESSION_ACTIONS.REJECT,
      reason: `会话记录无效（不是对象），${REOPEN_HINT}`,
    };
  }

  const version = record.schemaVersion;

  if (version === SESSION_SCHEMA_VERSION) {
    return { compatible: true, action: SESSION_ACTIONS.CONTINUE, reason: '' };
  }

  if (version === undefined || version === null) {
    return {
      compatible: false,
      action: SESSION_ACTIONS.REJECT,
      reason: `旧记录未带版本签名（当前 ${SESSION_SCHEMA_VERSION}），已按不兼容作废，${REOPEN_HINT}`,
    };
  }

  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return {
      compatible: false,
      action: SESSION_ACTIONS.REJECT,
      reason: `会话版本签名非法（${String(version)}），已按不兼容作废，${REOPEN_HINT}`,
    };
  }

  return {
    compatible: false,
    action: SESSION_ACTIONS.REJECT,
    reason: `旧会话版本 ${version} 已作废（当前 ${SESSION_SCHEMA_VERSION}），${REOPEN_HINT}`,
  };
}

/**
 * **只读解释**一条会话记录：原字段**原样带出**（同一个对象引用，不复制、不补默认值），
 * 并附兼容结论。调用方据此决定「拒绝」还是「继续」，但本函数**从不写回**。
 *
 * 与已被删除的 `normalizeLegacySession` 的差别：那个函数缺字段就补 `schemaVersion: 1`
 * 并标 `legacy`，把旧记录"洗成"了可读形态 —— 那正是本次要禁掉的隐式兼容。
 *
 * @param {unknown} record
 * @returns {{record: object|null, compatible: boolean, action: string, reason: string}}
 */
export function readSessionRecord(record) {
  const verdict = classifySessionCompatibility(record);
  const normalized = record && typeof record === 'object' && !Array.isArray(record) ? record : null;
  return { record: normalized, ...verdict };
}

/**
 * 判别会话能否安全续跑。**先过兼容门**——不兼容时连断点都不看，
 * 避免「断点齐全 ⇒ 隐式沿用旧授权/旧半成品」这一类不可解释的续跑。
 *
 * v2 记录仍需三条同时满足才可续跑：
 * ① 版本可识别（已由兼容门保证）；② 有断点清单；③ 有半成品线索（`opfsName` 或 `receivedBytes>0`）。
 *
 * @param {unknown} record
 * @returns {{resumable: boolean, reason: string}}
 */
export function isResumableSession(record) {
  const { record: session, compatible, reason } = readSessionRecord(record);
  if (!compatible) {
    return { resumable: false, reason };
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
