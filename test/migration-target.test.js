import { describe, expect, it } from 'vitest';
import {
  assessTargetConflicts,
  buildTargetBackupEvidence,
  describeBackupEvidence,
  describeConflictState,
  describeTargetWriteCapability,
  CONFLICT_STATES,
  BACKUP_LEVELS,
} from '../src/core/migration-target.js';

describe('assessTargetConflicts（目标预检）', () => {
  it('读得到目标清单 ⇒ 比较出同名冲突与新增数', () => {
    const r = assessTargetConflicts({
      targetManifest: { paths: ['characters/A.png', 'settings.json'] },
      incomingPaths: ['characters/A.png', 'worlds/W.json', 'settings.json'],
    });
    expect(r.state).toBe(CONFLICT_STATES.KNOWN);
    expect(r.conflictCount).toBe(2);
    expect(r.newCount).toBe(1);
    expect(r.conflicts.sort()).toEqual(['characters/a.png', 'settings.json']);
  });

  it('读得到清单且无同名 ⇒ 0 冲突（此时才可显示无冲突）', () => {
    const r = assessTargetConflicts({
      targetManifest: { paths: ['characters/A.png'] },
      incomingPaths: ['worlds/W.json'],
    });
    expect(r.state).toBe(CONFLICT_STATES.KNOWN);
    expect(r.conflictCount).toBe(0);
  });

  it('【反例】读不到目标清单 ⇒ state=unknown 且 conflictCount=null（绝不是 0）', () => {
    const r = assessTargetConflicts({ targetManifest: null, incomingPaths: ['a.json'] });
    expect(r.state).toBe(CONFLICT_STATES.UNKNOWN);
    expect(r.conflictCount).toBeNull();
    expect(r.newCount).toBeNull();
    expect(r.conflicts).toEqual([]);
  });

  it('路径归一：分隔符 / 大小写 / Unicode 变体都算同一路径', () => {
    const r = assessTargetConflicts({
      targetManifest: { paths: ['User Avatars\\X.PNG'] },
      incomingPaths: ['user avatars/x.png'],
    });
    expect(r.conflictCount).toBe(1);
  });

  it('缺失入参按空处理，不抛错', () => {
    expect(assessTargetConflicts().state).toBe(CONFLICT_STATES.UNKNOWN);
    expect(assessTargetConflicts({ targetManifest: { paths: [] } }).state).toBe(CONFLICT_STATES.KNOWN);
  });
});

describe('buildTargetBackupEvidence（目标备份证据）', () => {
  it('自动备份三条件齐备 ⇒ readback-verified', () => {
    const b = buildTargetBackupEvidence({
      mode: 'auto',
      targetRef: 'luker@8003',
      artifact: { readable: true, retained: true, scope: 'matches-write' },
    });
    expect(b.level).toBe(BACKUP_LEVELS.READBACK_VERIFIED);
    expect(b.retention).toBe('confirmed');
    expect(b.reason).toBe('');
  });

  it('自动备份缺任一条件 ⇒ 降级 none 并给出缺项（不部分放行）', () => {
    const cases = [
      { artifact: { readable: false, retained: true, scope: 'matches-write' }, need: '不可读' },
      { artifact: { readable: true, retained: false, scope: 'matches-write' }, need: '留存' },
      { artifact: { readable: true, retained: true, scope: 'partial' }, need: '范围' },
    ];
    for (const { artifact, need } of cases) {
      const b = buildTargetBackupEvidence({ mode: 'auto', targetRef: 'l@1', artifact });
      expect(b.level).toBe(BACKUP_LEVELS.NONE);
      expect(b.reason).toContain(need);
    }
  });

  it('自动备份无产物 ⇒ none（不因「自动」二字放行）', () => {
    expect(buildTargetBackupEvidence({ mode: 'auto', artifact: null }).level).toBe(BACKUP_LEVELS.NONE);
  });

  it('手动声明且用户确认 ⇒ user-attested', () => {
    const b = buildTargetBackupEvidence({ mode: 'manual', targetRef: 'l@1', userConfirmed: true });
    expect(b.level).toBe(BACKUP_LEVELS.USER_ATTESTED);
    expect(b.scope).toBe('matches-write');
  });

  it('手动声明未确认 ⇒ none', () => {
    expect(buildTargetBackupEvidence({ mode: 'manual', userConfirmed: false }).level).toBe(BACKUP_LEVELS.NONE);
  });

  it('【判别力】手动路径**永不**产出 readback-verified（人工声明不是机器核对）', () => {
    for (const userConfirmed of [true, false]) {
      const b = buildTargetBackupEvidence({ mode: 'manual', userConfirmed });
      expect(b.level).not.toBe(BACKUP_LEVELS.READBACK_VERIFIED);
    }
    // 即使误传 artifact，手动路径也不看它
    const b = buildTargetBackupEvidence({
      mode: 'manual',
      userConfirmed: true,
      artifact: { readable: true, retained: true, scope: 'matches-write' },
    });
    expect(b.level).toBe(BACKUP_LEVELS.USER_ATTESTED);
  });
});

describe('describeBackupEvidence（人工确认与机器验证分别呈现）', () => {
  it('readback-verified ⇒ machineVerified=true 且 userAttested=false', () => {
    const d = describeBackupEvidence({ level: 'readback-verified' });
    expect(d.machineVerified).toBe(true);
    expect(d.userAttested).toBe(false);
  });

  it('user-attested ⇒ userAttested=true 且 machineVerified=false（不得说成已核对）', () => {
    const d = describeBackupEvidence({ level: 'user-attested' });
    expect(d.userAttested).toBe(true);
    expect(d.machineVerified).toBe(false);
    expect(d.label).toContain('未经机器核对');
  });

  it('未知级别 / 缺失 ⇒ none', () => {
    expect(describeBackupEvidence({ level: 'bogus' }).level).toBe('none');
    expect(describeBackupEvidence().level).toBe('none');
  });
});

describe('describeConflictState（未知冲突不显示成无冲突）', () => {
  it('known + 0 ⇒ showsNoConflict=true', () => {
    const d = describeConflictState({ state: 'known', conflictCount: 0 });
    expect(d.showsNoConflict).toBe(true);
    expect(d.showsUnknown).toBe(false);
  });

  it('known + N>0 ⇒ 明确列出将被更新的条目数', () => {
    const d = describeConflictState({ state: 'known', conflictCount: 3 });
    expect(d.showsNoConflict).toBe(false);
    expect(d.label).toContain('3');
  });

  it('【反例】unknown ⇒ 既不显示「无冲突」也不显示 0', () => {
    const d = describeConflictState({ state: 'unknown', conflictCount: null });
    expect(d.showsNoConflict).toBe(false);
    expect(d.showsUnknown).toBe(true);
    expect(d.label).toContain('不是 0 冲突');
  });
});

describe('describeTargetWriteCapability（自动写能力与原生指引）', () => {
  it('available ⇒ 确知可自动写，无指引', () => {
    const d = describeTargetWriteCapability({ targetWrite: 'available' });
    expect(d.autoWriteConfirmed).toBe(true);
    expect(d.guidance).toBe('');
  });

  it('unavailable ⇒ 给原生导入指引', () => {
    const d = describeTargetWriteCapability({ targetWrite: 'unavailable' });
    expect(d.autoWriteConfirmed).toBe(false);
    expect(d.guidance).toContain('原生方式导入');
  });

  it('unknown ⇒ 不当作可写，给替代路径（且**不**以真实请求探测）', () => {
    const d = describeTargetWriteCapability({ targetWrite: 'unknown' });
    expect(d.autoWriteConfirmed).toBe(false);
    expect(d.guidance).toContain('未确认');
    expect(describeTargetWriteCapability(null).status).toBe('unknown');
  });
});
