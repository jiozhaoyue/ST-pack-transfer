/**
 * `peerSend` 行为测试：await 生效 · 入队字段 · N 目标 N 次 · 空列表提示。
 *
 * ## 为什么需要（2026-11-19 审计）
 *
 * 全仓 `test/` 与 `e2e/` 对 `peerSend` / `peerGenerate` / `getSendTargets`
 * 命中 **0**。把实现里的 `await` 去掉、`async` 去掉，全量测试仍然全绿——
 * 而线上后果是：`getSendTargets()` 返回 Promise，同步读 `.length` 为
 * `undefined` ⇒ 恒判「未勾选」⇒ 点发送无反应。
 *
 * ## 为什么这条测试能抓到
 *
 * 用**真实 async** 的 `getSendTargets`（返回 Promise<File[]>）调用真实的
 * `mountLanTransferPanel`。若实现退回到同步读：
 *  - `targets` 是 Promise ⇒ `!targets.length` 为真 ⇒ 走「未勾选」分支；
 *  - 队列为空、toast 是 selectPacksToSend ⇒ 本文件全部入队断言变红。
 *
 * ## 边界
 *
 * 用 `test/helpers/minimal-dom.js` 的最小桩：不布局、不算样式、不触发事件。
 * 它证明的是**控制流与数据接线**，不是像素。像素另有
 * `tooling/verify-checkbox-centering.cjs` 与截图审计。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installMinimalDom } from './helpers/minimal-dom.js';
import { mountLanTransferPanel } from '../src/ui/lan-transfer-panel.js';
import { t } from '../src/i18n/index.js';

let uninstall = null;

/** 真实 view 的最小子集：state 合并语义与 workbench-view 的 setLan 一致。 */
function makeView() {
  const state = { send: {}, recv: {}, peer: {} };
  const toasts = [];
  const logs = [];
  return {
    state,
    toasts,
    logs,
    setLan(patch = {}) {
      for (const key of ['send', 'recv', 'peer']) {
        if (patch[key]) Object.assign(state[key], patch[key]);
      }
    },
    toast(msg) { toasts.push(String(msg)); },
    pushLog(level, msg) { logs.push([level, String(msg)]); },
  };
}

/** 最后一份 peer 队列快照（syncPeerUi 会把 sendQueue 写回 setLan）。 */
function peerQueue(view) {
  return Array.isArray(view.state.peer.queue) ? view.state.peer.queue : [];
}

beforeEach(() => {
  uninstall = installMinimalDom();
});

afterEach(() => {
  if (uninstall) uninstall();
  uninstall = null;
});

describe('peerSend', () => {
  it('必须 await async getSendTargets 并逐个入队', async () => {
    const view = makeView();
    const files = [
      new File([new Uint8Array(1024)], 'alpha.zip'),
      new File([new Uint8Array(2048)], 'beta.zip'),
    ];
    /* 真实 async：返回 Promise<File[]>，不是数组。同步读会得到 Promise 本身。 */
    const getSendTargets = async () => files;

    const panel = mountLanTransferPanel({ view, getSendTargets });
    expect(panel).toBeTruthy();
    expect(typeof panel.peerSend).toBe('function');

    await panel.peerSend();

    const queue = peerQueue(view);
    expect(queue).toHaveLength(2);
    /* 若 await 丢失：targets 是 Promise ⇒ length undefined ⇒ 不入队 ⇒ 上一行先红。 */
    expect(queue.map((item) => item.name)).toEqual(['alpha.zip', 'beta.zip']);
    expect(view.toasts).toContain(t('lan.toast.tasksQueued', { n: 2 }));
    expect(view.toasts).not.toContain(t('lan.toast.selectPacksToSend'));
  });

  it('入队字段必须取自 File：size 与 blob 都不能错配', async () => {
    const view = makeView();
    const file = new File([new Uint8Array(3210)], 'payload.zip');
    const panel = mountLanTransferPanel({
      view,
      getSendTargets: async () => [file],
    });

    await panel.peerSend();

    const [task] = peerQueue(view);
    expect(task).toBeTruthy();
    /* 旧实现读 pkg.sizeBytes / pkg.blob：File 上都是 undefined ⇒ size=0、blob=undefined。 */
    expect(task.size).toBe(file.size);
    expect(task.size).toBe(3210);
    expect(task.file.blob).toBe(file);
    expect(task.file.blob).toBeInstanceOf(File);
    expect(task.name).toBe('payload.zip');
  });

  it('N 个目标必须入队 N 次（不能只入第一个）', async () => {
    const view = makeView();
    const files = Array.from({ length: 5 }, (_, i) =>
      new File([new Uint8Array(10 + i)], `pack-${i}.zip`));

    const panel = mountLanTransferPanel({
      view,
      getSendTargets: async () => files,
    });
    await panel.peerSend();

    const queue = peerQueue(view);
    expect(queue).toHaveLength(files.length);
    expect(queue.map((item) => item.file.blob)).toEqual(files);
    expect(view.toasts).toContain(t('lan.toast.tasksQueued', { n: files.length }));
  });

  it('空列表必须提示「未勾选」且不入队', async () => {
    const view = makeView();
    const panel = mountLanTransferPanel({
      view,
      getSendTargets: async () => [],
    });

    await panel.peerSend();

    expect(peerQueue(view)).toHaveLength(0);
    expect(view.toasts).toContain(t('lan.toast.selectPacksToSend'));
  });

  it('未注入 getSendTargets 时必须按空列表处理，不抛错', async () => {
    const view = makeView();
    const panel = mountLanTransferPanel({ view });

    await expect(panel.peerSend()).resolves.toBeUndefined();

    expect(peerQueue(view)).toHaveLength(0);
    expect(view.toasts).toContain(t('lan.toast.selectPacksToSend'));
  });
});
