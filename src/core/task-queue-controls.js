/**
 * 任务队列行控件判定（纯函数，无 DOM）。
 *
 * 只有生成任务支持「暂停 / 继续」；宿主拉取、恢复写回、云端备份等长任务
 * 不支持暂停，但必须能在队列里看到运行状态并「中断」。
 */

export function queueControls(item = {}) {
  const status = String(item.status || 'queued');
  const running = status === 'running';
  const paused = status === 'paused';
  const queued = status === 'queued';
  const finished = status === 'done' || status === 'failed' || status === 'aborted';
  return {
    pause: running && item.canPause !== false,
    resume: paused && item.canPause !== false,
    abort: (running || paused) && item.canAbort !== false,
    up: queued,
    down: queued,
    remove: queued || finished,
  };
}
