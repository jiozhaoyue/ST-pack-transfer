import { describe, expect, it, beforeEach } from 'vitest';
import {
  createMigrationPlan,
  STANDARD_CATEGORIES,
  __resetRevisionCounter,
} from '../src/core/migration-plan.js';
import {
  evaluateWriteGate,
  assessRetry,
  GATE_REASONS,
  RETRY_REASONS,
} from '../src/core/migration-evidence.js';

function makePlan({ target = 'l', capabilities } = {}) {
  return createMigrationPlan({
    source: { layout: 'st' },
    target: { layout: target },
    requestedSelection: Object.fromEntries(STANDARD_CATEGORIES.map((c) => [c, true])),
    capabilities,
  });
}

/** 「全绿」证据基线：单独改一项即制造对应负例（字段对齐 spec §3.1）。 */
function okEvidence(plan, overrides = {}) {
  return {
    planRevision: plan.revision,
    targetRef: 'luker@8004',
    planTargetRef: 'luker@8004',
    permission: 'granted',
    confirmation: { valid: true },
    backup: { level: 'readback-verified', targetRef: 'luker@8004', scope: 'matches-write', retention: 'confirmed' },
    inFlight: false,
    ...overrides,
  };
}

beforeEach(() => {
  __resetRevisionCounter();
});

describe('evaluateWriteGate（S1 写入安全门）', () => {
  it('全绿证据放行', () => {
    const plan = makePlan();
    const result = evaluateWriteGate(plan, okEvidence(plan));
    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('AC3 无计划 / 非冻结计划 ⇒ no-plan', () => {
    expect(evaluateWriteGate(null, {}).reasons).toContain(GATE_REASONS.NO_PLAN);
    expect(evaluateWriteGate({ revision: 1 }, {}).reasons).toContain(GATE_REASONS.NO_PLAN);
  });

  it('AC3 计划 revision 过期 ⇒ confirmation-stale', () => {
    const plan = makePlan();
    const ev = okEvidence(plan, { planRevision: plan.revision + 999 });
    expect(evaluateWriteGate(plan, ev).allowed).toBe(false);
    expect(evaluateWriteGate(plan, ev).reasons).toContain(GATE_REASONS.CONFIRMATION_STALE);
  });

  it('AC3 当前操作未确认 ⇒ confirmation-invalid', () => {
    const plan = makePlan();
    expect(evaluateWriteGate(plan, okEvidence(plan, { confirmation: { valid: false } })).reasons)
      .toContain(GATE_REASONS.CONFIRMATION_INVALID);
    expect(evaluateWriteGate(plan, okEvidence(plan, { confirmation: undefined })).reasons)
      .toContain(GATE_REASONS.CONFIRMATION_INVALID);
  });

  it('AC3 无目标备份证据 ⇒ no-target-backup', () => {
    const plan = makePlan();
    expect(evaluateWriteGate(plan, okEvidence(plan, { backup: { level: 'none' } })).reasons)
      .toContain(GATE_REASONS.NO_TARGET_BACKUP);
    expect(evaluateWriteGate(plan, okEvidence(plan, { backup: undefined })).reasons)
      .toContain(GATE_REASONS.NO_TARGET_BACKUP);
  });

  it('AC3 备份指向别的目标 / 范围不匹配 / 留存未确认分别报码', () => {
    const plan = makePlan();
    expect(evaluateWriteGate(plan, okEvidence(plan, {
      backup: { level: 'readback-verified', targetRef: 'st@8001', scope: 'matches-write', retention: 'confirmed' },
    })).reasons).toContain(GATE_REASONS.BACKUP_WRONG_TARGET);
    expect(evaluateWriteGate(plan, okEvidence(plan, {
      backup: { level: 'user-attested', targetRef: 'luker@8004', scope: 'partial', retention: 'confirmed' },
    })).reasons).toContain(GATE_REASONS.BACKUP_SCOPE_MISMATCH);
    expect(evaluateWriteGate(plan, okEvidence(plan, {
      backup: { level: 'user-attested', targetRef: 'luker@8004', scope: 'matches-write', retention: 'unconfirmed' },
    })).reasons).toContain(GATE_REASONS.BACKUP_RETENTION_UNCONFIRMED);
  });

  it('AC3 目标身份变化 ⇒ target-changed', () => {
    const plan = makePlan();
    const ev = okEvidence(plan, { targetRef: 'st@8001' });
    expect(evaluateWriteGate(plan, ev).reasons).toContain(GATE_REASONS.TARGET_CHANGED);
  });

  it('AC3 有在途写入 ⇒ restore-in-flight', () => {
    const plan = makePlan();
    const ev = okEvidence(plan, { inFlight: true });
    expect(evaluateWriteGate(plan, ev).reasons).toContain(GATE_REASONS.RESTORE_IN_FLIGHT);
  });

  it('AC3 目标宿主无写入能力（ST 硬 unavailable）⇒ target-write-unsupported', () => {
    const plan = makePlan({ target: 'st', capabilities: { st: { targetWrite: 'unavailable' } } });
    const ev = okEvidence(plan);
    expect(evaluateWriteGate(plan, ev).allowed).toBe(false);
    expect(evaluateWriteGate(plan, ev).reasons).toContain(GATE_REASONS.TARGET_WRITE_UNSUPPORTED);
  });

  it('AC3 权限未知与权限拒绝分开报', () => {
    const plan = makePlan();
    expect(evaluateWriteGate(plan, okEvidence(plan, { permission: 'unknown' })).reasons)
      .toContain(GATE_REASONS.PERMISSION_UNKNOWN);
    expect(evaluateWriteGate(plan, okEvidence(plan, { permission: 'denied' })).reasons)
      .toContain(GATE_REASONS.PERMISSION_DENIED);
  });

  it('AC3 多缺项同时列出（不短路）', () => {
    const plan = makePlan();
    const ev = okEvidence(plan, {
      planRevision: -1,
      backup: { level: 'none' },
      inFlight: true,
    });
    const { allowed, reasons } = evaluateWriteGate(plan, ev);
    expect(allowed).toBe(false);
    expect(reasons).toEqual(expect.arrayContaining([
      GATE_REASONS.CONFIRMATION_STALE,
      GATE_REASONS.NO_TARGET_BACKUP,
      GATE_REASONS.RESTORE_IN_FLIGHT,
    ]));
  });

  it('targetWrite=unknown 不拒绝（未知不等于不支持），但备份门仍独立生效', () => {
    const plan = makePlan({ target: 'tt', capabilities: { tt: { targetWrite: 'unknown' } } });
    // 有备份 + 全绿 ⇒ 放行（unknown 不拦）
    expect(evaluateWriteGate(plan, okEvidence(plan)).allowed).toBe(true);
    // 无备份 ⇒ 仍拒绝
    expect(evaluateWriteGate(plan, okEvidence(plan, { backup: { level: 'none' } })).allowed).toBe(false);
  });

  it('AC5 冲突未知且未确认 ⇒ 拒绝（无目标清单不是 0 冲突）', () => {
    const plan = makePlan();
    const unacked = evaluateWriteGate(plan, okEvidence(plan, { conflicts: { state: 'unknown' } }));
    expect(unacked.allowed).toBe(false);
    expect(unacked.reasons).toContain(GATE_REASONS.CONFLICT_UNKNOWN_UNACKNOWLEDGED);
  });

  it('AC5 冲突未知但已显式确认风险 ⇒ 放行；冲突已读清单 ⇒ 不触发该门', () => {
    const plan = makePlan();
    const acked = evaluateWriteGate(plan, okEvidence(plan, {
      conflicts: { state: 'unknown' },
      confirmation: { valid: true, acknowledged: { conflictUnknown: true } },
    }));
    expect(acked.allowed).toBe(true);
    // known 状态不需要该确认
    const known = evaluateWriteGate(plan, okEvidence(plan, { conflicts: { state: 'known', conflictCount: 0 } }));
    expect(known.reasons).not.toContain(GATE_REASONS.CONFLICT_UNKNOWN_UNACKNOWLEDGED);
  });

  it('未提供 conflicts ⇒ 该门不生效（既有调用零变化）', () => {
    const plan = makePlan();
    expect(evaluateWriteGate(plan, okEvidence(plan)).reasons)
      .not.toContain(GATE_REASONS.CONFLICT_UNKNOWN_UNACKNOWLEDGED);
  });
});

describe('assessRetry（S1 重试资格判定）', () => {
  const matched = { currentTargetMatches: true, currentPlanMatches: true };

  it('目标/计划未证明仍匹配 ⇒ invalidated（优先级最高）', () => {
    expect(assessRetry({ observedState: 'not-applied', repeatSafe: true, currentTargetMatches: false, currentPlanMatches: true }).reason).toBe(RETRY_REASONS.INVALIDATED);
    expect(assessRetry({ observedState: 'not-applied', repeatSafe: true, currentTargetMatches: true, currentPlanMatches: false }).reason).toBe(RETRY_REASONS.INVALIDATED);
    expect(assessRetry({ observedState: 'not-applied', repeatSafe: true }).reason).toBe(RETRY_REASONS.INVALIDATED);
  });

  it('AC4 未知写入状态（含未提供）⇒ 不自动重试', () => {
    expect(assessRetry({ ...matched, observedState: 'unknown', repeatSafe: true }).allowed).toBe(false);
    expect(assessRetry({ ...matched, observedState: 'unknown', repeatSafe: true }).reason).toBe(RETRY_REASONS.UNKNOWN_WRITE_STATE);
    expect(assessRetry({ ...matched, repeatSafe: true }).reason).toBe(RETRY_REASONS.UNKNOWN_WRITE_STATE);
  });

  it('AC4 已应用 ⇒ 不重复写', () => {
    expect(assessRetry({ ...matched, observedState: 'applied', repeatSafe: true }).reason).toBe(RETRY_REASONS.ALREADY_APPLIED);
  });

  it('AC4 已证未应用且可重复安全 ⇒ 放行', () => {
    const r = assessRetry({ ...matched, observedState: 'not-applied', repeatSafe: true });
    expect(r.allowed).toBe(true);
    expect(r.reason).toBe(RETRY_REASONS.SAFE_TO_RETRY);
  });

  it('AC4 已证未应用但操作非幂等/不可拆分 ⇒ 不放行', () => {
    expect(assessRetry({ ...matched, observedState: 'not-applied', repeatSafe: false }).reason).toBe(RETRY_REASONS.NOT_REPEAT_SAFE);
  });
});
