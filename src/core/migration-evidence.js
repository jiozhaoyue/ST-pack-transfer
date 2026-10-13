/**
 * 迁移写入门与重试判定（S1 · 纯判定层）。
 *
 * 两个纯函数，**不发网络请求、不读 DOM**：
 * - `evaluateWriteGate(plan, evidence)` —— 目标写入前的**唯一**安全门（`10-01/design.md` §3.4）。
 *   它是核心调用前的门禁，**不得**用「UI 禁用按钮」代替调用本函数。
 * - `assessRetry(itemEvidence)` —— 部分失败后的重试资格判定（`research/retry-boundaries.md` §3）。
 *
 * 判据矩阵见 `10-13-migration-plan-and-write-gate/design.md` §3.2 / §5.2。
 */

import { isMigrationPlan } from './migration-plan.js';

/** 写入门拒绝码（字段与判定对齐 `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.1/§4）。 */
export const GATE_REASONS = Object.freeze({
  NO_PLAN: 'no-plan',
  CONFIRMATION_STALE: 'confirmation-stale',
  CONFIRMATION_INVALID: 'confirmation-invalid',
  TARGET_CHANGED: 'target-changed',
  NO_TARGET_BACKUP: 'no-target-backup',
  BACKUP_WRONG_TARGET: 'backup-wrong-target',
  BACKUP_SCOPE_MISMATCH: 'backup-scope-mismatch',
  BACKUP_RETENTION_UNCONFIRMED: 'backup-retention-unconfirmed',
  RESTORE_IN_FLIGHT: 'restore-in-flight',
  TARGET_WRITE_UNSUPPORTED: 'target-write-unsupported',
  PERMISSION_UNKNOWN: 'permission-unknown',
  PERMISSION_DENIED: 'permission-denied',
});

/** 重试拒绝/放行码（对齐 spec §3.4）。 */
export const RETRY_REASONS = Object.freeze({
  INVALIDATED: 'invalidated',
  UNKNOWN_WRITE_STATE: 'unknown-write-state',
  ALREADY_APPLIED: 'already-applied',
  SAFE_TO_RETRY: 'safe-to-retry',
  NOT_REPEAT_SAFE: 'not-repeat-safe',
});

/**
 * 目标写入安全门。**任一拒绝条件命中即 `allowed=false`**，`reasons` 列出全部缺项（不短路）。
 *
 * 字段与判定对齐 `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.1 / §4。
 * `evidence` 只在**本地运行流程**中构造，**不得**直接信任导入 JSON / 旧会话保存的授权。
 *
 * @param {object} plan `createMigrationPlan` 产出的冻结快照
 * @param {object} [evidence]
 * @param {number|string} [evidence.planRevision] 必须等于 `plan.revision`
 * @param {string} [evidence.targetRef] 当前目标身份（宿主+用户）
 * @param {string} [evidence.planTargetRef] 计划生成时的目标身份
 * @param {'granted'|'denied'|'unknown'} [evidence.permission] 权限态
 * @param {{valid?: boolean}} [evidence.confirmation] 当前操作的明确确认
 * @param {{level?: 'none'|'user-attested'|'readback-verified', targetRef?: string,
 *          scope?: 'matches-write'|'partial'|'unknown',
 *          retention?: 'confirmed'|'unconfirmed'}} [evidence.backup] 目标备份证据
 * @param {boolean} [evidence.inFlight] 是否已有同一写操作在途
 * @returns {{allowed: boolean, reasons: string[]}}
 */
export function evaluateWriteGate(plan, evidence = {}) {
  if (!isMigrationPlan(plan)) {
    return { allowed: false, reasons: [GATE_REASONS.NO_PLAN] };
  }
  const ev = evidence && typeof evidence === 'object' ? evidence : {};
  const reasons = [];

  // 1. 计划 revision 必须等于当前计划 —— 换任一关键输入即失效（R-05）。
  if (ev.planRevision !== plan.revision) {
    reasons.push(GATE_REASONS.CONFIRMATION_STALE);
  }

  // 2. 当前操作的明确确认必须有效（不可从源端授权继承，spec §3.1）。
  if (!(ev.confirmation && ev.confirmation.valid === true)) {
    reasons.push(GATE_REASONS.CONFIRMATION_INVALID);
  }

  // 3. 目标身份（当前宿主+用户）必须与计划生成时一致。
  const targetRef = ev.targetRef ?? null;
  const planTargetRef = ev.planTargetRef ?? null;
  if (targetRef !== planTargetRef) {
    reasons.push(GATE_REASONS.TARGET_CHANGED);
  }

  // 4. 无在途写入（防双击/重复入口并发写同一用户目录，host-bridge.js:908-911）。
  if (ev.inFlight === true) {
    reasons.push(GATE_REASONS.RESTORE_IN_FLIGHT);
  }

  // 5. 目标宿主明确无自动写入能力（如 ST：两恢复端点 404）—— 硬 `unavailable` 不是「未知」。
  const targetCell = plan.capabilities && plan.capabilities[plan.target?.layout];
  if (targetCell && targetCell.targetWrite === 'unavailable') {
    reasons.push(GATE_REASONS.TARGET_WRITE_UNSUPPORTED);
  }

  // 6. 权限：仅 `granted` 放行；`unknown` 与 `denied` 分开报（unknown 不等于 granted）。
  if (ev.permission === 'granted') {
    // 放行
  } else if (ev.permission === 'denied') {
    reasons.push(GATE_REASONS.PERMISSION_DENIED);
  } else {
    reasons.push(GATE_REASONS.PERMISSION_UNKNOWN);
  }

  // 7. 备份证据必须对**本次写入的目标**适用且已确认留存（spec §3.1 / §4）。
  const backup = ev.backup && typeof ev.backup === 'object' ? ev.backup : {};
  if (!backup.level || backup.level === 'none') {
    reasons.push(GATE_REASONS.NO_TARGET_BACKUP);
  } else {
    if (backup.targetRef !== targetRef) {
      reasons.push(GATE_REASONS.BACKUP_WRONG_TARGET);
    }
    if (backup.scope !== 'matches-write') {
      reasons.push(GATE_REASONS.BACKUP_SCOPE_MISMATCH);
    }
    if (backup.retention !== 'confirmed') {
      reasons.push(GATE_REASONS.BACKUP_RETENTION_UNCONFIRMED);
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

/**
 * 重试资格判定。判据**只认证据**，不认界面态（`retry-boundaries.md` §3 的禁令）。
 * 字段与判定对齐 `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.4。
 *
 * @param {object} [itemEvidence]
 * @param {'not-applied'|'applied'|'unknown'} [itemEvidence.observedState] 该项的观测写入状态（证据）
 * @param {boolean} [itemEvidence.repeatSafe] 该操作是否幂等或可拆分（来自操作契约，非 HTTP 方法）
 * @param {boolean} [itemEvidence.currentTargetMatches] 当前目标是否仍与该项一致
 * @param {boolean} [itemEvidence.currentPlanMatches] 当前计划是否仍与该项一致
 * @returns {{allowed: boolean, reason: string}}
 */
export function assessRetry(itemEvidence = {}) {
  const ev = itemEvidence && typeof itemEvidence === 'object' ? itemEvidence : {};

  // 1. 目标/计划未证明仍匹配 ⇒ 旧重试资格整体失效（优先级最高，spec §3.4）。
  if (ev.currentTargetMatches !== true || ev.currentPlanMatches !== true) {
    return { allowed: false, reason: RETRY_REASONS.INVALIDATED };
  }

  // 2. 未知写入状态（含未提供）一律不自动重试 —— 响应丢失 ≠ 没写入。
  if (ev.observedState === 'unknown' || ev.observedState === undefined || ev.observedState === null) {
    return { allowed: false, reason: RETRY_REASONS.UNKNOWN_WRITE_STATE };
  }

  // 3. 已应用：不重复写。
  if (ev.observedState === 'applied') {
    return { allowed: false, reason: RETRY_REASONS.ALREADY_APPLIED };
  }

  // 4. 已证未应用且操作幂等/可拆分 ⇒ 可安全重试。
  if (ev.observedState === 'not-applied' && ev.repeatSafe === true) {
    return { allowed: true, reason: RETRY_REASONS.SAFE_TO_RETRY };
  }

  // 5. 其余（已证未应用但操作非幂等/不可拆分）⇒ 不自动重试。
  return { allowed: false, reason: RETRY_REASONS.NOT_REPEAT_SAFE };
}
