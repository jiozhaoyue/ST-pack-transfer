import { describe, expect, it } from 'vitest';
import { STAGE_LABELS, createStageRecorder } from '../src/core/stage-timings.js';

/** 可控时钟：手动推进，读数精确可断言（不依赖真实时间）。 */
function fakeClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

describe('createStageRecorder（分段计时记录器）', () => {
  it('begin/end 累加 ms 与 count', () => {
    const clock = fakeClock();
    const rec = createStageRecorder({ now: clock.now });

    rec.begin('transfer');
    clock.advance(250);
    rec.end('transfer');
    rec.begin('transfer');
    clock.advance(50);
    rec.end('transfer');

    expect(rec.snapshot().transfer).toEqual({ ms: 300, count: 2 });
  });

  it('未 begin 就 end ⇒ no-op（不产生负值、不污染读数）', () => {
    const clock = fakeClock();
    const rec = createStageRecorder({ now: clock.now });

    rec.end('convert');
    expect(rec.snapshot().convert).toBeUndefined();
    expect(rec.summary()).not.toContain('convert');
  });

  it('重复 begin 不重入（保留首次起点，不静默覆盖）', () => {
    const clock = fakeClock();
    const rec = createStageRecorder({ now: clock.now });

    rec.begin('transfer');
    clock.advance(100);
    rec.begin('transfer'); // 嵌套/重复：不得把起点推到此刻
    clock.advance(100);
    rec.end('transfer');

    expect(rec.snapshot().transfer).toEqual({ ms: 200, count: 1 });
  });

  it('snapshot 只含已闭合的段（进行中的段不出现）', () => {
    const clock = fakeClock();
    const rec = createStageRecorder({ now: clock.now });

    rec.begin('credentials');
    clock.advance(10);
    rec.end('credentials');
    rec.begin('host-generate'); // 一直开着

    const snap = rec.snapshot();
    expect(snap.credentials).toEqual({ ms: 10, count: 1 });
    expect(snap['host-generate']).toBeUndefined();
  });

  it('summary 按声明顺序输出、省略未出现的段', () => {
    const clock = fakeClock();
    const rec = createStageRecorder({ now: clock.now });

    rec.begin(STAGE_LABELS.TRANSFER);
    clock.advance(1500);
    rec.end(STAGE_LABELS.TRANSFER);
    rec.begin(STAGE_LABELS.CREDENTIALS);
    clock.advance(20);
    rec.end(STAGE_LABELS.CREDENTIALS);

    const s = rec.summary();
    // 声明顺序是 credentials → host-generate → transfer，故凭证在传输之前
    expect(s.indexOf('credentials')).toBeLessThan(s.indexOf('transfer'));
    expect(s).not.toContain('host-generate'); // 未出现 ⇒ 省略
    expect(s).toContain('1.50s');
    expect(s).toContain('20ms');
  });

  it('reset 清空全部读数（含未闭合的段）', () => {
    const clock = fakeClock();
    const rec = createStageRecorder({ now: clock.now });

    rec.begin('transfer');
    clock.advance(10);
    rec.end('transfer');
    rec.begin('convert');
    rec.reset();

    expect(rec.snapshot()).toEqual({});
    clock.advance(10);
    rec.end('convert'); // reset 后未重新 begin ⇒ no-op
    expect(rec.snapshot()).toEqual({});
  });
});
