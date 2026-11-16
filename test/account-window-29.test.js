import { afterEach, describe, expect, it } from 'vitest';
import {
  accountWindowCapability,
  isHostAccountWindowAvailable,
  listHostExtensions,
  openHostStoragePage,
  readNativeBackupSelection,
} from '../src/ui/host-bridge.js';

/**
 * Luker 2.9 账户窗口 / 存储页 / 扩展清单（2026-11-09）。
 * 只测纯判定与形状；不引入 jsdom（项目最小桩风格）。
 */

const g = globalThis;
const originals = {
  document: Object.getOwnPropertyDescriptor(g, 'document'),
  fetch: Object.getOwnPropertyDescriptor(g, 'fetch'),
  SillyTavern: Object.getOwnPropertyDescriptor(g, 'SillyTavern'),
};

function installDocument({ chips = [], legacy = [] } = {}) {
  const doc = {
    querySelectorAll(sel) {
      if (String(sel).includes('userBackupManager')) return legacy;
      if (String(sel).includes('dw-chip')) return chips;
      return [];
    },
    querySelector() { return null; },
  };
  Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
  return doc;
}

function chip(id, on) {
  return { dataset: { id }, classList: { contains: (c) => c === 'on' && Boolean(on) } };
}

afterEach(() => {
  for (const [key, desc] of Object.entries(originals)) {
    if (desc) Object.defineProperty(g, key, desc);
    else delete g[key];
  }
});

describe('Luker 2.9 账户窗口能力声明', () => {
  it('显式声明表：st/tt/pt 确认没有，luker 有，未知平台待探测', () => {
    expect(accountWindowCapability('st')).toEqual({ supported: false, known: true });
    expect(accountWindowCapability('tt')).toEqual({ supported: false, known: true });
    expect(accountWindowCapability('pt')).toEqual({ supported: false, known: true });
    expect(accountWindowCapability('luker')).toEqual({ supported: true, known: true });
    expect(accountWindowCapability('future-host')).toEqual({ supported: false, known: false });
  });

  it('已声明没有的宿主不发起探测（不产生 404 噪音）', async () => {
    expect(await isHostAccountWindowAvailable('st')).toBe(false);
    expect(await isHostAccountWindowAvailable('pt')).toBe(false);
  });

  it('宿主没有存储页时返回 host-missing，不打开窗口', async () => {
    const result = await openHostStoragePage('browser', 'st');
    expect(result).toEqual({ ok: false, reason: 'host-missing' });
  });
});

describe('readNativeBackupSelection 兼容两版界面', () => {
  it('旧版优先读 checkbox', () => {
    installDocument({
      legacy: [
        { value: 'settings', checked: true },
        { value: 'chats', checked: false },
      ],
    });
    expect(readNativeBackupSelection()).toEqual({ settings: true, chats: false });
  });

  it('2.9 读 dw-chip 的 .on 类', () => {
    installDocument({ chips: [chip('settings', true), chip('chats', false), chip('secrets', true)] });
    expect(readNativeBackupSelection()).toEqual({ settings: true, chats: false, secrets: true });
  });

  it('两版都不存在时返回 null', () => {
    installDocument();
    expect(readNativeBackupSelection()).toBeNull();
  });
});

describe('listHostExtensions', () => {
  it('把数组响应归一成 id/name/sourceType/version，并过滤空名', async () => {
    installDocument();
    g.SillyTavern = {
      getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'token' }) }),
    };
    g.fetch = async () => ({
      ok: true,
      json: async () => ([
        { name: 'ext-a', type: 'local', manifest: { name: 'ext-a', version: '1.2.0' } },
        { name: 'ext-b', type: 'global' },
        { name: '' },
      ]),
    });
    const result = await listHostExtensions();
    expect(result.ok).toBe(true);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'ext-a', name: 'ext-a', sourceType: 'local', version: '1.2.0' }),
      expect.objectContaining({ id: 'ext-b', name: 'ext-b', sourceType: 'global', version: '' }),
    ]);
  });

  it('HTTP 非 2xx 如实失败，不返回空清单', async () => {
    installDocument();
    g.SillyTavern = {
      getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'token' }) }),
    };
    g.fetch = async () => ({ ok: false, status: 501 });
    const result = await listHostExtensions();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(501);
  });
});
