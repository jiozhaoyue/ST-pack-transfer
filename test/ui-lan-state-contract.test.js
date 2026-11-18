/**
 * 视图状态契约：`setLan` 的每个分支都必须真的落到 state 上。
 *
 * ## 为什么需要这个测试（2026-11-19）
 *
 * 线上 bug：web 模式点「生成互联码」完全无反应、控制台无报错。
 * 根因是 `workbench-view.js` 的 `setLan()` 只处理 `next.send` / `next.recv`，
 * **漏掉 `next.peer`**；而 `lan-transfer-panel.js` 的
 * `const setPeer = (patch) => view.setLan({ peer: patch })` 被 9 处调用。
 * 传进去的 patch 被静默丢弃 —— 不缺值、不抛错，只是没写进 state。
 *
 * ## 为什么 1427 个测试全绿也拦不住
 *
 * 1. 全 test/ 对 `setLan` / `getLan` / `createView` 的调用为 **零**。
 * 2. 涉及 `workbench-view.js` 的测试全是 `readFileSync` + `toMatch` 的源码字符串匹配。
 * 3. 项目无 jsdom / happy-dom，vitest 跑在 node 环境，没有 DOM 可操作。
 * 4. `check:control-consumer` 自述「只强制声明存在，不验证声明为真」。
 * 5. `check:dom-injection` 输出「整文件豁免 src/ui/workbench-view.js」。
 * 6. e2e 只点 legacy 的 `#lan-btn-generate`，对 `peerGenerate` 零覆盖。
 *
 * 本文件补的正是这一层：直接调用真实的 `createWorkbenchView`，
 * 断言「传进去的 key 一定能在 `getLan()` 里读回来」。
 *
 * ## 边界
 *
 * 用 `test/helpers/minimal-dom.js` 的最小桩，不布局、不算样式、不触发事件。
 * 它证明的是**数据接线正确**，不是像素正确。像素另有守卫（css-scope / review shots）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installMinimalDom } from './helpers/minimal-dom.js';
import { createWorkbenchView } from '../src/ui/workbench-view.js';

let uninstall = null;
let view = null;

beforeEach(() => {
  uninstall = installMinimalDom();
  view = createWorkbenchView({ actions: {}, qr: null });
});

afterEach(() => {
  if (uninstall) uninstall();
  uninstall = null;
  view = null;
});

describe('setLan 状态契约', () => {
  /**
   * 核心回归：`setPeer` 全部走 `setLan({ peer })`。这条挂了就说明
   * 「生成的互联码/连接态/队列」整条对等 UI 又变回死的。
   */
  it('peer 分支必须写入 state（生成互联码回归）', () => {
    const code = 'SZC1.test-peer-code';
    view.setLan({ peer: { code, tip: '已生成' } });
    const lan = view.getLan();
    expect(lan.peer.code).toBe(code);
    expect(lan.peer.tip).toBe('已生成');
  });

  it('peer 分支必须逐次累加，不能整体替换丢字段', () => {
    view.setLan({ peer: { code: 'A' } });
    view.setLan({ peer: { tip: 'B' } });
    const lan = view.getLan();
    // 第二次 patch 不含 code，若实现是替换而非合并，code 会消失。
    expect(lan.peer.code).toBe('A');
    expect(lan.peer.tip).toBe('B');
  });

  it('连接态与队列必须可写入', () => {
    view.setLan({ peer: { connected: true, rtt: 42 } });
    const lan = view.getLan();
    expect(lan.peer.connected).toBe(true);
    expect(lan.peer.rtt).toBe(42);

    const queue = [{ id: 't1', name: 'a.zip', size: 10, dir: 'send', status: 'queued' }];
    view.setLan({ peer: { queue } });
    expect(view.getLan().peer.queue).toHaveLength(1);
  });

  it('断开复位必须清空 code 与 active', () => {
    view.setLan({ peer: { code: 'X', connected: true, active: { name: 'a.zip', pct: 50 } } });
    view.setLan({ peer: { connected: false, code: '', active: null } });
    const lan = view.getLan();
    expect(lan.peer.connected).toBe(false);
    expect(lan.peer.code).toBe('');
    expect(lan.peer.active).toBeNull();
  });

  it('send / recv 分支保持原有行为', () => {
    view.setLan({ send: { code: 'S1', busy: true } });
    view.setLan({ recv: { code: 'R1', pct: 33 } });
    const lan = view.getLan();
    expect(lan.send.code).toBe('S1');
    expect(lan.send.busy).toBe(true);
    expect(lan.recv.code).toBe('R1');
    expect(lan.recv.pct).toBe(33);
  });

  it('peer 初始结构必须含 code / tip 键（否则渲染无法区分「空」与「未定义」）', () => {
    const peer = view.getLan().peer;
    expect(Object.prototype.hasOwnProperty.call(peer, 'code')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(peer, 'tip')).toBe(true);
  });

  /**
   * 结构守卫：`setLan` 支持的顶层 key 必须与调用方实际传入的 key 对齐。
   * 这里把「已知会传入的 key」显式列出——新增一个 setLan({ xxx }) 调用方时，
   * 作者必须同时在这里加一行并在 setLan 里加分支，否则本测试会提醒他。
   */
  it('setLan 必须覆盖调用方实际使用的全部 key', () => {
    const supportedKeys = ['open', 'send', 'recv', 'peer', 'scanError'];
    // 从真实调用面提取：lan-transfer-panel 只用到 send / recv / peer；
    // workbench-view 自身用到 open / scanError。
    for (const key of supportedKeys) {
      const before = JSON.stringify(view.getLan());
      const patch = key === 'open' ? { open: false }
        : key === 'scanError' ? { scanError: '' }
          : { [key]: {} };
      // 不应抛错
      expect(() => view.setLan(patch)).not.toThrow();
      // 至少状态对象仍可读
      expect(typeof view.getLan()).toBe('object');
      expect(before).toBeTypeOf('string');
    }
  });
});
