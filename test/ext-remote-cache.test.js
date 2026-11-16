import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXT_SCAN_CACHE_KEY,
  loadExtScanCache,
  saveExtScanCache,
  formatLastScanTime,
  formatFullTimestamp,
} from '../src/ui/workbench-view.js';
import { t } from '../src/i18n/index.js';

describe('扩展远端信息持久化与检查时间提醒', () => {
  let store = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { store = {}; },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('缓存键名为 st-pack-transfer:ext-scan-cache', () => {
    expect(EXT_SCAN_CACHE_KEY).toBe('st-pack-transfer:ext-scan-cache');
  });

  it('loadExtScanCache 面对损坏数据或空数据能安全回退', () => {
    store[EXT_SCAN_CACHE_KEY] = 'invalid json {';
    const broken = loadExtScanCache();
    expect(broken).toEqual({ lastScanAt: 0, results: {} });

    delete store[EXT_SCAN_CACHE_KEY];
    const empty = loadExtScanCache();
    expect(empty).toEqual({ lastScanAt: 0, results: {} });
  });

  it('saveExtScanCache 与 loadExtScanCache 能够持久化并读取扫描结果', () => {
    const mockCache = {
      lastScanAt: 1731750000000,
      results: {
        'test-ext-1': {
          localVersion: '1.0.0',
          remoteVersion: '1.2.0',
          status: 'update',
          reason: '',
          url: 'https://github.com/example/test-ext-1',
          scannedAt: 1731750000000,
        },
        'test-ext-2': {
          localVersion: '2.0.0',
          remoteVersion: '2.0.0',
          status: 'latest',
          reason: '',
          url: 'https://github.com/example/test-ext-2',
          scannedAt: 1731750000000,
        },
      },
    };

    saveExtScanCache(mockCache);
    const loaded = loadExtScanCache();

    expect(loaded.lastScanAt).toBe(mockCache.lastScanAt);
    expect(loaded.results['test-ext-1'].status).toBe('update');
    expect(loaded.results['test-ext-1'].remoteVersion).toBe('1.2.0');
    expect(loaded.results['test-ext-2'].status).toBe('latest');
  });

  it('formatLastScanTime 与 formatFullTimestamp 格式化时间准确友好', () => {
    const now = Date.now();
    expect(formatLastScanTime(0)).toBe(t('extmgr.scanNever'));
    expect(formatLastScanTime(now - 20000)).toBe(t('extmgr.scanJustNow'));
    expect(formatLastScanTime(now - 5 * 60 * 1000)).toBe(t('extmgr.scanMinutesAgo', { n: 5 }));
    expect(formatLastScanTime(now - 3 * 3600 * 1000)).toBe(t('extmgr.scanHoursAgo', { n: 3 }));
    expect(formatLastScanTime(now - 2 * 86400 * 1000)).toBe(t('extmgr.scanDaysAgo', { n: 2 }));

    expect(formatFullTimestamp(0)).toBe(t('extmgr.scanNever'));
    const d = new Date(1731750000000);
    const full = formatFullTimestamp(1731750000000);
    expect(full).toContain(String(d.getFullYear()));
  });

  it('i18n 包含上次检查与单项懒加载相关的文案', () => {
    expect(t('extmgr.scanScanning')).toBeTruthy();
    expect(t('extmgr.lastCheckTip', { time: '5 分钟前' })).toContain('5 分钟前');
    expect(t('extmgr.lastCheckTimeFull', { time: '2026-11-16 19:00:00' })).toContain('2026-11-16 19:00:00');
    expect(t('extmgr.scanNever')).toBeTruthy();
    expect(t('extmgr.scanJustNow')).toBeTruthy();
    expect(t('extmgr.singleScanHint')).toBeTruthy();
    expect(t('extmgr.tabPackage')).toBeTruthy();
    expect(t('empty.selectPkgDesktop')).toBeTruthy();
    expect(t('empty.selectPkgMobile')).toBeTruthy();
  });
});
