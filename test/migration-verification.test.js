import { describe, expect, it } from 'vitest';
import {
  classifyOutcome,
  buildVerificationEvidence,
  MIGRATION_OUTCOMES,
  assessRetry,
  RETRY_REASONS,
} from '../src/core/migration-evidence.js';

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
