import { describe, expect, it, beforeEach } from 'vitest';
import { guardedRestore, buildTargetEvidence } from '../src/ui/migration-controller.js';
import { createMigrationPlan, STANDARD_CATEGORIES, __resetRevisionCounter } from '../src/core/migration-plan.js';
import { GATE_REASONS } from '../src/core/migration-evidence.js';

function makePlan() {
  return createMigrationPlan({
    source: { layout: 'st' },
    target: { layout: 'l' },
    requestedSelection: Object.fromEntries(STANDARD_CATEGORIES.map((c) => [c, true])),
  });
}

/** 记录调用次数的「端口替身」。 */
function countingRestore() {
  const port = {
    calls: 0,
    lastArgs: null,
    async fn(...args) {
      port.calls += 1;
      port.lastArgs = args;
      return { ok: true, wrote: 5 };
    },
  };
  return port;
}

beforeEach(() => {
  __resetRevisionCounter();
});

describe('guardedRestore（S3 目标写入门禁）', () => {
  it('AC2 门禁通过 ⇒ restoreFn 恰调用一次，返回值透传', async () => {
    const plan = makePlan();
    const port = countingRestore();
    const evidence = buildTargetEvidence({
      platform: 'luker', handle: 'default-user', planTargetRef: 'luker@default-user',
      backupConfirmed: true, planRevision: plan.revision, inFlight: false,
    });

    const res = await guardedRestore({ plan, evidence, restoreFn: port.fn });

    expect(port.calls).toBe(1);
    expect(res.wrote).toBe(true);
    expect(res.result).toEqual({ ok: true, wrote: 5 });
  });

  it('AC1 无备份 ⇒ 零写入', async () => {
    const plan = makePlan();
    const port = countingRestore();
    const evidence = buildTargetEvidence({
      platform: 'luker', handle: 'default-user', planTargetRef: 'luker@default-user',
      backupConfirmed: false, planRevision: plan.revision, inFlight: false,
    });

    const res = await guardedRestore({ plan, evidence, restoreFn: port.fn });

    expect(port.calls).toBe(0);
    expect(res.wrote).toBe(false);
    expect(res.reasons).toContain(GATE_REASONS.NO_TARGET_BACKUP);
  });

  it('AC1 确认过期 ⇒ 零写入', async () => {
    const plan = makePlan();
    const port = countingRestore();
    const evidence = buildTargetEvidence({
      platform: 'luker', handle: 'default-user', planTargetRef: 'luker@default-user',
      backupConfirmed: true, planRevision: plan.revision + 999, inFlight: false,
    });

    const res = await guardedRestore({ plan, evidence, restoreFn: port.fn });

    expect(port.calls).toBe(0);
    expect(res.reasons).toContain(GATE_REASONS.CONFIRMATION_STALE);
  });

  it('AC1 目标身份变化 ⇒ 零写入', async () => {
    const plan = makePlan();
    const port = countingRestore();
    const evidence = buildTargetEvidence({
      platform: 'luker', handle: 'other-user', planTargetRef: 'luker@default-user',
      backupConfirmed: true, planRevision: plan.revision, inFlight: false,
    });

    const res = await guardedRestore({ plan, evidence, restoreFn: port.fn });

    expect(port.calls).toBe(0);
    expect(res.reasons).toContain(GATE_REASONS.TARGET_CHANGED);
  });

  it('AC1 有在途写入 ⇒ 零写入', async () => {
    const plan = makePlan();
    const port = countingRestore();
    const evidence = buildTargetEvidence({
      platform: 'luker', handle: 'default-user', planTargetRef: 'luker@default-user',
      backupConfirmed: true, planRevision: plan.revision, inFlight: true,
    });

    const res = await guardedRestore({ plan, evidence, restoreFn: port.fn });

    expect(port.calls).toBe(0);
    expect(res.reasons).toContain(GATE_REASONS.RESTORE_IN_FLIGHT);
  });

  it('门禁不吞异常：restoreFn 抛错原样上抛', async () => {
    const plan = makePlan();
    const evidence = buildTargetEvidence({
      platform: 'luker', handle: 'default-user', planTargetRef: 'luker@default-user',
      backupConfirmed: true, planRevision: plan.revision, inFlight: false,
    });

    await expect(guardedRestore({
      plan, evidence, restoreFn: async () => { throw new Error('boom'); },
    })).rejects.toThrow('boom');
  });
});

describe('buildTargetEvidence（S3 证据构造）', () => {
  it('AC3 覆盖六字段；勾选 ⇒ user-attested 且对应当前目标', () => {
    const ev = buildTargetEvidence({
      platform: 'st', handle: 'u1', planTargetRef: 'st@u1',
      backupConfirmed: true, planRevision: 7, inFlight: false,
    });

    expect(ev.planRevision).toBe(7);
    expect(ev.targetRef).toBe('st@u1');
    expect(ev.planTargetRef).toBe('st@u1');
    expect(ev.permission).toBe('granted');
    expect(ev.confirmation.valid).toBe(true);
    expect(ev.backup.level).toBe('user-attested');
    expect(ev.backup.targetRef).toBe('st@u1');
    expect(ev.backup.scope).toBe('matches-write');
    expect(ev.backup.retention).toBe('confirmed');
    expect(ev.inFlight).toBe(false);
  });

  it('AC3 不勾选 ⇒ level=none（门禁将拒绝）', () => {
    const ev = buildTargetEvidence({
      platform: 'st', handle: 'u1', planTargetRef: 'st@u1',
      backupConfirmed: false, planRevision: 1, inFlight: false,
    });
    expect(ev.backup.level).toBe('none');
  });

  it('权限可显式覆盖', () => {
    const ev = buildTargetEvidence({
      platform: 'st', handle: 'u1', planTargetRef: 'st@u1',
      backupConfirmed: true, planRevision: 1, inFlight: false, permission: 'denied',
    });
    expect(ev.permission).toBe('denied');
  });
});
