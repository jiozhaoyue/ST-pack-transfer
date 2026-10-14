import { describe, expect, it } from 'vitest';
import {
  ALIGNMENT,
  buildTargetManifest,
  alignInventories,
  assessInventoryConflicts,
} from '../src/core/target-inventory.js';
import { assessTargetConflicts, CONFLICT_STATES } from '../src/core/migration-target.js';

describe('buildTargetManifest（清单构造）', () => {
  it('归一分隔符、去前导 ./、去目录条目、去重、计数', () => {
    const m = buildTargetManifest([
      'characters\\A.png',
      './characters/A.png',
      'characters/',          // 目录条目：丢弃
      'chats/',
      'settings.json',
      '',                     // 空串：丢弃
      null,                   // 非串：丢弃
    ]);
    expect(m.paths).toEqual(['characters/a.png', 'settings.json']);
    expect(m.count).toBe(2);
    expect(m.truncated).toBe(false);
  });

  it('接受 {name} 对象形态（readZipEntryManifest 的原样输出）', () => {
    const m = buildTargetManifest([
      { name: 'worlds/W.json', crc32: 1 },
      { name: 'characters/B.png', crc32: 2 },
    ]);
    expect(m.paths).toEqual(['characters/b.png', 'worlds/w.json']);
    expect(m.count).toBe(2);
  });

  it('超出上限 ⇒ 截断且 truncated=true（截断清单不可用于比较）', () => {
    const entries = Array.from({ length: 10 }, (_, i) => `chats/c${i}.jsonl`);
    const m = buildTargetManifest(entries, { maxPaths: 4 });
    expect(m.paths.length).toBe(4);
    expect(m.truncated).toBe(true);
  });

  it('空输入 ⇒ 空清单、未截断', () => {
    expect(buildTargetManifest(null)).toEqual({ paths: [], count: 0, truncated: false });
    expect(buildTargetManifest([])).toEqual({ paths: [], count: 0, truncated: false });
  });
});

describe('alignInventories（对齐守卫）', () => {
  const fullTarget = ['settings.json', 'characters/a.png', 'chats/x.jsonl', 'worlds/w.json'];

  it('目标清单为空 ⇒ empty', () => {
    const r = alignInventories({ targetPaths: [], incomingPaths: ['characters/a.png'] });
    expect(r.state).toBe(ALIGNMENT.EMPTY);
  });

  it('目标清单被截断 ⇒ truncated（优先于其它判据）', () => {
    const r = alignInventories({ targetPaths: fullTarget, incomingPaths: ['characters/a.png'], truncated: true });
    expect(r.state).toBe(ALIGNMENT.TRUNCATED);
  });

  it('目标清单缺全部标准根标记 ⇒ partial（备份可能被选择过滤）', () => {
    const r = alignInventories({
      targetPaths: ['some-random-thing/only.txt'],
      incomingPaths: ['some-random-thing/only.txt'],
    });
    expect(r.state).toBe(ALIGNMENT.PARTIAL);
  });

  it('待写入顶层段不在目标清单里 ⇒ mismatch，reason 点名缺失段', () => {
    const r = alignInventories({
      targetPaths: ['settings.json', 'chats/x.jsonl'],
      incomingPaths: ['chats/x.jsonl', 'characters/a.png'],
    });
    expect(r.state).toBe(ALIGNMENT.MISMATCH);
    expect(r.reason).toContain('characters');
  });

  it('顶层段可比 ⇒ aligned', () => {
    const r = alignInventories({
      targetPaths: fullTarget,
      incomingPaths: ['characters/a.png', 'chats/y.jsonl'],
    });
    expect(r.state).toBe(ALIGNMENT.ALIGNED);
    expect(r.reason).toBe('');
  });

  it('待写入为空 ⇒ 无需比较，判 aligned（零写入即零冲突）', () => {
    const r = alignInventories({ targetPaths: fullTarget, incomingPaths: [] });
    expect(r.state).toBe(ALIGNMENT.ALIGNED);
  });
});

describe('assessInventoryConflicts（对齐 + 真实比较）', () => {
  it('【判别力】目标清单只有 chats/（被过滤），待写入含 characters/ ⇒ unknown，绝不报 0 冲突', () => {
    // 这是本片最关键的不变量：伪报「0 冲突」会让用户跳过风险确认
    const r = assessInventoryConflicts({
      targetManifest: buildTargetManifest(['chats/x.jsonl']),
      incomingPaths: ['chats/x.jsonl', 'characters/a.png'],
    });
    expect(r.state).toBe(CONFLICT_STATES.UNKNOWN);
    expect(r.conflictCount).toBeNull();
    expect(r.newCount).toBeNull();
    expect(r.alignment).toBe(ALIGNMENT.MISMATCH);
  });

  it('【判别力】去掉守卫就会变红：同一输入若绕过对齐直接比较，会得到「0 冲突 / 1 新增」', () => {
    const targetPaths = ['chats/x.jsonl'];
    const incoming = ['chats/x.jsonl', 'characters/a.png'];
    const naive = assessTargetConflicts({ targetManifest: { paths: targetPaths }, incomingPaths: incoming });
    expect(naive.state).toBe(CONFLICT_STATES.KNOWN);
    expect(naive.conflictCount).toBe(1);
    // 守卫拦下这条「看着合理、实则不可信」的读数
    const guarded = assessInventoryConflicts({
      targetManifest: buildTargetManifest(targetPaths),
      incomingPaths: incoming,
    });
    expect(guarded.state).toBe(CONFLICT_STATES.UNKNOWN);
  });

  it('未预检（manifest 为 null）⇒ 与 assessTargetConflicts({targetManifest:null}) 逐字段相等', () => {
    const baseline = assessTargetConflicts({ targetManifest: null });
    for (const manifest of [null, undefined]) {
      const r = assessInventoryConflicts({ targetManifest: manifest, incomingPaths: ['characters/a.png'] });
      expect(r.state).toBe(baseline.state);
      expect(r.conflictCount).toBe(baseline.conflictCount);
      expect(r.newCount).toBe(baseline.newCount);
      expect(r.conflicts).toEqual(baseline.conflicts);
    }
  });

  it('对齐成功 ⇒ 真实冲突数与新增数，且新增数不随「源包条数」机械推导', () => {
    const target = buildTargetManifest([
      'settings.json', 'chats/a.jsonl', 'chats/b.jsonl',
    ]);
    const r1 = assessInventoryConflicts({ targetManifest: target, incomingPaths: ['chats/a.jsonl'] });
    expect(r1.state).toBe(CONFLICT_STATES.KNOWN);
    expect(r1.conflictCount).toBe(1);
    expect(r1.newCount).toBe(0);

    // 同样条数的待写入，内容不同 ⇒ 新增数必须不同（不是「源包 N 条 ⇒ 新增 N 条」）
    const r2 = assessInventoryConflicts({ targetManifest: target, incomingPaths: ['chats/c.jsonl'] });
    expect(r2.conflictCount).toBe(0);
    expect(r2.newCount).toBe(1);
  });

  it('截断清单 ⇒ unknown（不完整的比较结果不可用）', () => {
    const target = buildTargetManifest(['settings.json', 'chats/a.jsonl'], { maxPaths: 1 });
    expect(target.truncated).toBe(true);
    const r = assessInventoryConflicts({ targetManifest: target, incomingPaths: ['chats/a.jsonl'] });
    expect(r.state).toBe(CONFLICT_STATES.UNKNOWN);
    expect(r.alignment).toBe(ALIGNMENT.TRUNCATED);
  });

  it('永远附带 alignment 与 alignmentReason（供界面如实呈现原因）', () => {
    const r = assessInventoryConflicts({
      targetManifest: buildTargetManifest(['settings.json', 'chats/a.jsonl']),
      incomingPaths: ['chats/a.jsonl'],
    });
    expect(r.alignment).toBe(ALIGNMENT.ALIGNED);
    expect(typeof r.alignmentReason).toBe('string');
  });
});
