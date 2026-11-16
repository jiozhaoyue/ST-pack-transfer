import { describe, expect, it } from 'vitest';
import { beginHostPull, beginNativePull } from '../src/app/pull-entry.js';

describe('pull-entry 拉取入口顺序契约', () => {
  it('工作台拉取顺序固定为：流量警告 → 原生指引 → 打开面板', async () => {
    const events = [];
    const result = await beginHostPull({
      trafficPrompt: true,
      nativePullNotice: true,
      confirmTraffic: async () => { events.push('traffic'); return true; },
      showNativeNotice: async () => { events.push('notice'); },
      openNativeUi: async () => { events.push('open'); return true; },
      isBusy: () => false,
      notifyBusy: () => events.push('busy'),
      fallbackPull: async () => events.push('fallback'),
    });
    expect(events).toEqual(['traffic', 'notice', 'open']);
    expect(result).toEqual({ opened: true });
  });

  it('取消流量警告则不打开原生面板', async () => {
    const events = [];
    const result = await beginHostPull({
      trafficPrompt: true,
      nativePullNotice: true,
      confirmTraffic: async () => { events.push('traffic'); return false; },
      showNativeNotice: async () => events.push('notice'),
      openNativeUi: async () => { events.push('open'); return true; },
      isBusy: () => false,
      notifyBusy: () => events.push('busy'),
      fallbackPull: async () => events.push('fallback'),
    });
    expect(events).toEqual(['traffic']);
    expect(result).toEqual({ cancelled: true });
  });

  it('关闭原生指引设置后跳过指引，但仍按警告 → 开面板', async () => {
    const events = [];
    await beginHostPull({
      trafficPrompt: true,
      nativePullNotice: false,
      confirmTraffic: async () => { events.push('traffic'); return true; },
      showNativeNotice: async () => events.push('notice'),
      openNativeUi: async () => { events.push('open'); return true; },
      isBusy: () => false,
      notifyBusy: () => events.push('busy'),
      fallbackPull: async () => events.push('fallback'),
    });
    expect(events).toEqual(['traffic', 'open']);
  });

  it('原生入口缺失时在忙态探针通过后回退拉取', async () => {
    const events = [];
    const result = await beginHostPull({
      trafficPrompt: false,
      nativePullNotice: false,
      confirmTraffic: async () => { events.push('traffic'); return true; },
      showNativeNotice: async () => events.push('notice'),
      openNativeUi: async () => { events.push('open'); return false; },
      isBusy: () => { events.push('busy-check'); return false; },
      notifyBusy: () => events.push('busy'),
      fallbackPull: async () => events.push('fallback'),
    });
    expect(events).toEqual(['open', 'busy-check', 'fallback']);
    expect(result).toEqual({ fallback: true });
  });

  it('宿主原生导出在途时不回退拉取', async () => {
    const events = [];
    const result = await beginHostPull({
      trafficPrompt: false,
      nativePullNotice: false,
      confirmTraffic: async () => true,
      showNativeNotice: async () => {},
      openNativeUi: async () => false,
      isBusy: () => true,
      notifyBusy: () => events.push('busy'),
      fallbackPull: async () => events.push('fallback'),
    });
    expect(events).toEqual(['busy']);
    expect(result).toEqual({ busy: true });
  });

  it('原生按钮拉取：先警告，再读勾选，再关面板，最后拉取', async () => {
    const events = [];
    const result = await beginNativePull({
      trafficPrompt: true,
      confirmTraffic: async () => { events.push('traffic'); return true; },
      readSelection: () => { events.push('read'); return { characters: true }; },
      closeNativeUi: () => events.push('close'),
      isBusy: () => { events.push('busy-check'); return false; },
      notifyBusy: () => events.push('busy'),
      pull: async (selection) => { events.push(`pull:${selection.characters}`); },
    });
    expect(events).toEqual(['traffic', 'read', 'close', 'busy-check', 'pull:true']);
    expect(result).toEqual({ pulled: true });
  });

  it('原生按钮取消流量警告时面板保持原样，不读勾选也不关面板', async () => {
    const events = [];
    const result = await beginNativePull({
      trafficPrompt: true,
      confirmTraffic: async () => { events.push('traffic'); return false; },
      readSelection: () => { events.push('read'); return {}; },
      closeNativeUi: () => events.push('close'),
      isBusy: () => false,
      notifyBusy: () => events.push('busy'),
      pull: async () => events.push('pull'),
    });
    expect(events).toEqual(['traffic']);
    expect(result).toEqual({ cancelled: true });
  });
});
