import { describe, expect, it } from 'vitest';
import { queueControls } from '../src/core/task-queue-controls.js';

describe('task-queue-controls · 队列控件', () => {
  it('生成任务运行中：暂停 + 中断；暂停后：继续 + 中断', () => {
    expect(queueControls({ status: 'running', canPause: true, canAbort: true }))
      .toMatchObject({ pause: true, resume: false, abort: true });
    expect(queueControls({ status: 'paused', canPause: true, canAbort: true }))
      .toMatchObject({ pause: false, resume: true, abort: true });
  });

  it('拉取 / 恢复 / 云端（canPause=false）只显示中断，不伪装可暂停', () => {
    for (const type of ['pull', 'restore', 'cloud']) {
      expect(queueControls({ type, status: 'running', canPause: false, canAbort: true }))
        .toMatchObject({ pause: false, resume: false, abort: true });
    }
  });

  it('排队可排序/移出；结束可移出；不可中断的任务不显示中断', () => {
    expect(queueControls({ status: 'queued' })).toMatchObject({ up: true, down: true, remove: true });
    expect(queueControls({ status: 'done' })).toMatchObject({ pause: false, abort: false, remove: true });
    expect(queueControls({ status: 'running', canAbort: false })).toMatchObject({ abort: false });
  });
});
