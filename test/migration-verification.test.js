import { describe, expect, it, beforeEach } from 'vitest';
import {
  classifyOutcome,
  buildVerificationEvidence,
  MIGRATION_OUTCOMES,
  assessRetry,
  RETRY_REASONS,
} from '../src/core/migration-evidence.js';
import {
  buildRestoreVerification,
  summarizeVerification,
  selectRetryCandidates,
} from '../src/core/migration-verification.js';
import { createMigrationPlan, STANDARD_CATEGORIES, __resetRevisionCounter } from '../src/core/migration-plan.js';
import { buildTargetEvidence } from '../src/ui/migration-controller.js';

function ev(overrides = {}) {
  return buildVerificationEvidence({
    scopeRef: 'pkg.zip', unit: 'archive-entry', method: 'automatic',
    coverage: 'full', status: 'confirmed', reason: '', ...overrides,
  });
}

describe('buildVerificationEvidence（S4 核对证据）', () => {
  it('AC3 非法/缺失值按保守默认回落（不抛错、不猜）', () => {
    const e = buildVerificationEvidence({});
    expect(e.unit).toBe('archive-entry');
    expect(e.method).toBe('user-attested');
    expect(e.coverage).toBe('unknown');
    expect(e.status).toBe('unknown');
    expect(e.scopeRef).toBe('');
  });

  it('合法值原样保留', () => {
    const e = ev({ unit: 'chat', coverage: 'sampled', status: 'accepted-exclusion', reason: 'r' });
    expect(e).toEqual({
      scopeRef: 'pkg.zip', unit: 'chat', method: 'automatic',
      coverage: 'sampled', status: 'accepted-exclusion', reason: 'r',
    });
  });
});

describe('classifyOutcome（S4 MigrationOutcome 四态）', () => {
  it('AC1 空证据 ⇒ needs-verification（未知不是完成）', () => {
    expect(classifyOutcome({ verification: [] })).toBe(MIGRATION_OUTCOMES.NEEDS_VERIFICATION);
    expect(classifyOutcome({})).toBe(MIGRATION_OUTCOMES.NEEDS_VERIFICATION);
  });

  it('AC1 全 confirmed ⇒ completed', () => {
    expect(classifyOutcome({ verification: [ev(), ev()] })).toBe(MIGRATION_OUTCOMES.COMPLETED);
  });

  it('AC1 有 accepted-exclusion ⇒ completed-with-exclusions', () => {
    expect(classifyOutcome({ verification: [ev(), ev({ status: 'accepted-exclusion' })] }))
      .toBe(MIGRATION_OUTCOMES.COMPLETED_WITH_EXCLUSIONS);
  });

  it('AC1 有 unknown ⇒ needs-verification', () => {
    expect(classifyOutcome({ verification: [ev(), ev({ status: 'unknown' })] }))
      .toBe(MIGRATION_OUTCOMES.NEEDS_VERIFICATION);
  });

  it('AC1 有 failed ⇒ failed（优先级最高）', () => {
    expect(classifyOutcome({ verification: [ev({ status: 'failed' }), ev({ status: 'unknown' })] }))
      .toBe(MIGRATION_OUTCOMES.FAILED);
    expect(classifyOutcome({ verification: [ev({ status: 'failed' }), ev({ status: 'accepted-exclusion' })] }))
      .toBe(MIGRATION_OUTCOMES.FAILED);
  });
});

describe('AC2「服务器写一半后客户端断开」夹具', () => {
  it('未确认写入 ⇒ needs-verification，且不可自动重试', () => {
    const verification = [ev({ status: 'unknown', coverage: 'unknown', reason: '响应体不可解析，写入状态未知' })];
    expect(classifyOutcome({ verification })).toBe(MIGRATION_OUTCOMES.NEEDS_VERIFICATION);

    const retry = assessRetry({
      observedState: 'unknown',
      repeatSafe: false,
      currentTargetMatches: true,
      currentPlanMatches: true,
    });
    expect(retry.allowed).toBe(false);
    expect(retry.reason).toBe(RETRY_REASONS.UNKNOWN_WRITE_STATE);
  });

  it('已证未应用且可重复安全 ⇒ 可重试候选', () => {
    const retry = assessRetry({
      observedState: 'not-applied', repeatSafe: true, currentTargetMatches: true, currentPlanMatches: true,
    });
    expect(retry.allowed).toBe(true);
    expect(retry.reason).toBe(RETRY_REASONS.SAFE_TO_RETRY);
  });
});

describe('buildRestoreVerification（由写入返回体构造证据）', () => {
  it('响应体不可解析 ⇒ unknown（写入状态未知，不宣布完成/回滚）', () => {
    const v = buildRestoreVerification('pkg.zip', { unconfirmed: true });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ status: 'unknown', coverage: 'unknown', method: 'automatic', unit: 'archive-entry' });
    expect(classifyOutcome({ verification: v })).toBe(MIGRATION_OUTCOMES.NEEDS_VERIFICATION);
  });

  it('宿主 200 但零写入 ⇒ failed（不谎报成功）', () => {
    const v = buildRestoreVerification('pkg.zip', { nothingRestored: true });
    expect(v[0].status).toBe('failed');
    expect(classifyOutcome({ verification: v })).toBe(MIGRATION_OUTCOMES.FAILED);
  });

  it('宿主确认写入 ⇒ confirmed，但 reason 明示「未逐条读回核对」', () => {
    const v = buildRestoreVerification('pkg.zip', { ok: true });
    expect(v[0]).toMatchObject({ status: 'confirmed', coverage: 'full' });
    expect(v[0].reason).toContain('未逐条读回核对');
  });
});

describe('summarizeVerification（机器核对与人工确认分别呈现）', () => {
  it('空证据 ⇒ total 0 / coverage unknown', () => {
    expect(summarizeVerification([])).toMatchObject({ total: 0, machineVerified: 0, userAttested: 0, coverage: 'unknown' });
  });

  it('混合自动与人工 ⇒ 分别计数；覆盖率混合 ⇒ mixed', () => {
    const s = summarizeVerification([
      ev({ method: 'automatic', coverage: 'full' }),
      ev({ method: 'user-attested', coverage: 'sampled', status: 'confirmed' }),
    ]);
    expect(s.machineVerified).toBe(1);
    expect(s.userAttested).toBe(1);
    expect(s.coverage).toBe('mixed');
  });

  it('全 full ⇒ coverage full；状态计数正确', () => {
    const s = summarizeVerification([ev(), ev({ status: 'accepted-exclusion' })]);
    expect(s.coverage).toBe('full');
    expect(s.byStatus.confirmed).toBe(1);
    expect(s.byStatus['accepted-exclusion']).toBe(1);
  });
});

describe('selectRetryCandidates（双重门：证据 + 重新过写入门）', () => {
  beforeEach(() => __resetRevisionCounter());

  function plan() {
    return createMigrationPlan({
      source: { layout: 'st' }, target: { layout: 'l' },
      requestedSelection: Object.fromEntries(STANDARD_CATEGORIES.map((c) => [c, true])),
    });
  }
  function gateEvidence(p) {
    return buildTargetEvidence({
      platform: 'luker', handle: 'u1', planTargetRef: 'luker@u1',
      backupConfirmed: true, planRevision: p.revision, inFlight: false,
    });
  }

  it('无可重试项 ⇒ 不请求写入门（gateAllowed=false，不误导）', () => {
    const r = selectRetryCandidates({
      items: [{ observedState: 'unknown', repeatSafe: false, currentTargetMatches: true, currentPlanMatches: true }],
      plan: plan(), evidence: {},
    });
    expect(r.candidates).toEqual([]);
    expect(r.gateAllowed).toBe(false);
    expect(r.rejected).toHaveLength(1);
  });

  it('有可重试项且写入门放行 ⇒ 返回候选', () => {
    const p = plan();
    const r = selectRetryCandidates({
      items: [{ observedState: 'not-applied', repeatSafe: true, currentTargetMatches: true, currentPlanMatches: true }],
      plan: p, evidence: gateEvidence(p),
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.gateAllowed).toBe(true);
  });

  it('【判别力】有可重试项但写入门不过（无备份）⇒ 候选为空（重试不绕门）', () => {
    const p = plan();
    const noBackup = buildTargetEvidence({
      platform: 'luker', handle: 'u1', planTargetRef: 'luker@u1',
      backupConfirmed: false, planRevision: p.revision, inFlight: false,
    });
    const r = selectRetryCandidates({
      items: [{ observedState: 'not-applied', repeatSafe: true, currentTargetMatches: true, currentPlanMatches: true }],
      plan: p, evidence: noBackup,
    });
    expect(r.candidates).toEqual([]);
    expect(r.gateAllowed).toBe(false);
    expect(r.gateReasons).toContain('no-target-backup');
  });
});
