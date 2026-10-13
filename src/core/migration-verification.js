/**
 * 迁移核对证据构造与重试候选（S4 · 纯判定层）。
 *
 * 从 `index.js` 抽出（原为内联函数，不可单测），并补齐 S4 契约的两块纯逻辑：
 * - `buildRestoreVerification` —— **写入返回后**才进入核对：由宿主返回体构造 `VerificationEvidence`。
 *   现状**无目标侧读回**，`coverage` 只到「宿主确认写入」，**不得**表述为「已逐条核对」。
 * - `summarizeVerification` —— 按 `method`（automatic / user-attested）与 `status` 汇总，
 *   供界面**分别呈现**机器核对与人工确认（`migration-safety-and-evidence.md` §3.3）。
 * - `selectRetryCandidates` —— 从「部分失败」的项里筛出**可自动重试**的候选：① 每项过
 *   `assessRetry`（证据驱动）；② 整体**重新过写入门** `evaluateWriteGate`（§3.4）。
 *
 * 硬约束（`L1-MR-6`）：本模块**不发请求、不读 DOM**，可在 Node/Vitest 直接测。
 */

import { buildVerificationEvidence, assessRetry, evaluateWriteGate } from './migration-evidence.js';

const VERIFICATION_STATUSES = Object.freeze(['confirmed', 'accepted-exclusion', 'failed', 'unknown']);

/**
 * 由宿主**写入返回体**构造核对证据（`scopeRef` = 本次写入的范围引用，如包名）。
 *
 * 三种已知形态（`restoreToHostInner` 的返回值）：
 * - `unconfirmed` —— 响应体不可解析 ⇒ 写入状态**未知**（可能已写入）。
 * - `nothingRestored` —— 宿主 200 但一个条目都没写 ⇒ **失败**（不谎报成功）。
 * - 其余 —— 宿主确认写入；`coverage:'full'` 指**本请求范围**被宿主整体接受，
 *   **不是**逐条读回核对（`reason` 明示）。
 *
 * @param {string} scopeRef
 * @param {{unconfirmed?: boolean, nothingRestored?: boolean, reason?: string}|null} restoreResult
 * @returns {Array<object>} 单元素数组（与 `classifyOutcome({verification})` 的入参同形）
 */
export function buildRestoreVerification(scopeRef, restoreResult) {
  if (restoreResult && restoreResult.unconfirmed) {
    return [buildVerificationEvidence({
      scopeRef, unit: 'archive-entry', method: 'automatic', coverage: 'unknown', status: 'unknown',
      reason: '响应体不可解析，写入状态未知',
    })];
  }
  if (restoreResult && restoreResult.nothingRestored) {
    return [buildVerificationEvidence({
      scopeRef, unit: 'archive-entry', method: 'automatic', coverage: 'full', status: 'failed',
      reason: '宿主返回成功但未写入任何条目',
    })];
  }
  return [buildVerificationEvidence({
    scopeRef, unit: 'archive-entry', method: 'automatic', coverage: 'full', status: 'confirmed',
    reason: '宿主确认写入（未逐条读回核对）',
  })];
}

/**
 * 汇总核对证据，供界面**分别呈现**机器核对与人工确认（§3.3）。
 *
 * 覆盖率口径：全为 `full` ⇒ `full`；全为 `sampled` ⇒ `sampled`；含 `unknown` 或多种混合 ⇒ `mixed`；
 * 空证据 ⇒ `unknown`。**不同 unit 不得相加当覆盖率** —— 本汇总只做呈现，不做「无损」推断。
 *
 * @param {Array<object>} [verification]
 * @returns {{total:number, machineVerified:number, userAttested:number,
 *   byStatus:Record<string,number>, coverage:string}}
 */
export function summarizeVerification(verification = []) {
  const list = Array.isArray(verification) ? verification : [];
  const byStatus = Object.fromEntries(VERIFICATION_STATUSES.map((s) => [s, 0]));
  const coverages = new Set();
  let machineVerified = 0;
  let userAttested = 0;

  for (const v of list) {
    if (v?.method === 'automatic') machineVerified += 1;
    else userAttested += 1;
    const status = VERIFICATION_STATUSES.includes(v?.status) ? v.status : 'unknown';
    byStatus[status] += 1;
    coverages.add(v?.coverage || 'unknown');
  }

  let coverage;
  if (coverages.size === 0) coverage = 'unknown';
  else if (coverages.size === 1) coverage = [...coverages][0];
  else coverage = 'mixed';

  return { total: list.length, machineVerified, userAttested, byStatus, coverage };
}

/**
 * 从「部分失败」的项里筛出**可自动重试**的候选（§3.4）。
 *
 * 双重门（缺一不可）：
 *   ① **逐项** `assessRetry` —— 只认证据：`not-applied` + `repeatSafe` + 目标/计划仍匹配；
 *   ② **整体** `evaluateWriteGate` —— 当前目标/计划/备份仍有效（重试不得绕过写入门）。
 *
 * 无可重试项时**不**请求写入门（省一次判定，且返回 `gateAllowed:false` 不误导）。
 *
 * @param {object} [input]
 * @param {Array<object>} [input.items] 每项：`{observedState, repeatSafe, currentTargetMatches, currentPlanMatches}`
 * @param {object} input.plan `createMigrationPlan` 冻结快照
 * @param {object} [input.evidence] 当前写入门证据（`buildTargetEvidence` 产出）
 * @returns {{candidates:Array<object>, rejected:Array<{item:object, reason:string}>, gateAllowed:boolean, gateReasons:string[]}}
 */
export function selectRetryCandidates({ items = [], plan, evidence = {} } = {}) {
  const list = Array.isArray(items) ? items : [];
  const evaluated = list.map((item) => {
    const verdict = assessRetry({
      observedState: item?.observedState,
      repeatSafe: item?.repeatSafe,
      currentTargetMatches: item?.currentTargetMatches,
      currentPlanMatches: item?.currentPlanMatches,
    });
    return { item, allowed: verdict.allowed, reason: verdict.reason };
  });

  const allowed = evaluated.filter((e) => e.allowed);
  const rejected = evaluated.filter((e) => !e.allowed).map(({ item, reason }) => ({ item, reason }));
  if (allowed.length === 0) {
    return { candidates: [], rejected, gateAllowed: false, gateReasons: [] };
  }

  const gate = evaluateWriteGate(plan, evidence);
  if (!gate.allowed) {
    return { candidates: [], rejected, gateAllowed: false, gateReasons: gate.reasons };
  }
  return { candidates: allowed.map((e) => e.item), rejected, gateAllowed: true, gateReasons: [] };
}
