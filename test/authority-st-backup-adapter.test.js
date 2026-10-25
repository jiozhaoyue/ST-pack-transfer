import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Authority ST 增强通道适配器单测（任务 10-24-ui-orchestration-r2 AC-6 本仓半）。
 * 两态覆盖（L0-11）：装了（probe stBackup:true → 走 /host/st-backup）与
 * 未装（probe 404 / 无标记 / 网络失败 → 原生 /api/users/backup 全量）。
 */

const fetchMock = vi.fn();

vi.mock('../src/core/logger.js', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, success: () => undefined },
}));

const { probeAuthorityStBackup, fetchHostBackup } = await import('../src/ui/host-bridge.js');

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null, forEach: () => undefined },
    json: async () => data,
    text: async () => JSON.stringify(data),
    body: null,
  };
}

/** 流式 zip 响应桩（fetchHostBackup 走 res.body reader；**读一次即 done**，防死循环） */
function zipResponse() {
  let finished = false;
  const chunk = new Uint8Array([0x50, 0x4b]);
  return {
    ok: true,
    status: 200,
    headers: { get: () => null, forEach: () => undefined },
    json: async () => ({}),
    body: {
      getReader: () => ({
        read: async () => {
          if (finished) return { done: true, value: undefined };
          finished = true;
          return { done: false, value: chunk };
        },
        cancel: async () => undefined,
      }),
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeAuthorityStBackup（特性检测）', () => {
  it('probe 200 且 stBackup:true ⇒ supported', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { online: true, stBackup: true }));
    const r = await probeAuthorityStBackup();
    expect(r.supported).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/plugins/authority/probe', expect.objectContaining({ method: 'POST' }),
    );
  });

  it('probe 404（未装 Authority）⇒ 不支持且不抛', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'Not found' }));
    const r = await probeAuthorityStBackup();
    expect(r.supported).toBe(false);
  });

  it('probe 200 但无 stBackup 标记（旧版 Authority）⇒ 不支持', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { online: true }));
    const r = await probeAuthorityStBackup();
    expect(r.supported).toBe(false);
    expect(r.reason).toContain('无 stBackup 标记');
  });

  it('网络失败 ⇒ 不支持且不抛（纯前端主路径零依赖后端）', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await probeAuthorityStBackup();
    expect(r.supported).toBe(false);
    expect(r.reason).toBe('Authority 不可达');
  });
});

describe('fetchHostBackup st 平台两态（AC-6）', () => {
  // fetchHostBackup 前置 getCsrfToken/getHandle 两次 fetch，之后才是备份请求
  function stubCredentials() {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { token: 't' }))   // /csrf-token
      .mockResolvedValueOnce(jsonResponse(200, { handle: 'default-user' })); // /api/users/me
  }

  it('装了（stBackup:true）⇒ 备份请求打 Authority /host/st-backup 且 body 只含 selection', async () => {
    stubCredentials();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { online: true, stBackup: true })); // probe
    fetchMock.mockResolvedValueOnce(zipResponse()); // st-backup

    const r = await fetchHostBackup('st', { characters: true, chats: false });
    expect(r).toBeTruthy();

    const backupCall = fetchMock.mock.calls[3];
    expect(backupCall[0]).toBe('/api/plugins/authority/host/st-backup');
    const sent = JSON.parse(backupCall[1].body);
    expect(sent).toEqual({ selection: { characters: true, chats: false } }); // 不含 handle（会话侧提供）
  });

  it('未装（probe 404）⇒ 走原生 /api/users/backup（全量+插件内过滤，零行为变化）', async () => {
    stubCredentials();
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {})); // probe
    fetchMock.mockResolvedValueOnce(zipResponse()); // 原生

    const r = await fetchHostBackup('st', { characters: true });
    expect(r).toBeTruthy();

    const backupCall = fetchMock.mock.calls[3];
    expect(backupCall[0]).toBe('/api/users/backup');
    const sent = JSON.parse(backupCall[1].body);
    expect(sent.handle).toBe('default-user');
    expect(sent.selection).toEqual({ characters: true });
  });

  it('增强通道请求失败（探测过但 502）⇒ 静默回退原生再试一次', async () => {
    stubCredentials();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { stBackup: true })); // probe
    fetchMock.mockResolvedValueOnce(jsonResponse(502, { error: 'boom' })); // 增强失败
    fetchMock.mockResolvedValueOnce(zipResponse()); // 原生回退

    const r = await fetchHostBackup('st', { characters: true });
    expect(r).toBeTruthy();

    // 调用序：creds×2 → probe → 增强（失败）→ 原生回退
    expect(fetchMock.mock.calls[3][0]).toBe('/api/plugins/authority/host/st-backup');
    expect(fetchMock.mock.calls[4][0]).toBe('/api/users/backup');
  });

  it('非 st 平台（luker）⇒ 不探测 Authority，直走原生透传', async () => {
    stubCredentials();
    fetchMock.mockResolvedValueOnce(zipResponse());

    await fetchHostBackup('luker', { characters: true });
    expect(fetchMock).toHaveBeenCalledTimes(3); // creds×2 + backup（无探测）
    expect(fetchMock.mock.calls[2][0]).toBe('/api/users/backup');
  });
});
