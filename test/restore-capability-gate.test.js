/**
 * F5 死按钮防护单测：宿主整包恢复能力静态判据（2026-11-21 端点实测事实）。
 *
 * 锁定三条契约：
 * ① 仅 luker 可整包恢复；st / tt / pt 均不可用并带 i18n 原因 key；
 * ② 未知宿主按保守不可用处理（不臆造能力）；
 * ③ 中英 i18n 均定义 restore.unsupported.* 三条文案（避免 disabled 后 title 落空）。
 */
import { describe, it, expect } from 'vitest';
import { hostRestoreCapability } from '../src/ui/host-bridge.js';
import zhCN from '../src/i18n/locales/zh-CN.js';
import enUS from '../src/i18n/locales/en-US.js';

describe('F5 · hostRestoreCapability 静态能力判据', () => {
  it('① luker 可用，st / tt / pt 不可用且各带原因 key', () => {
    expect(hostRestoreCapability('luker')).toEqual({ supported: true, reasonKey: '' });
    for (const host of ['st', 'tt', 'pt']) {
      const cap = hostRestoreCapability(host);
      expect(cap.supported).toBe(false);
      expect(cap.reasonKey).toBe(`restore.unsupported.${host}`);
    }
  });

  it('② 未知宿主保守不可用，回退通用原因 key（不臆造能力）', () => {
    const cap = hostRestoreCapability('totally-unknown-host');
    expect(cap.supported).toBe(false);
    expect(cap.reasonKey).toBeTruthy();
  });

  it('③ 中英 i18n 均定义三条不支持原因', () => {
    for (const host of ['st', 'tt', 'pt']) {
      const key = `restore.unsupported.${host}`;
      expect(typeof zhCN[key]).toBe('string');
      expect(zhCN[key].length).toBeGreaterThan(0);
      expect(typeof enUS[key]).toBe('string');
      expect(enUS[key].length).toBeGreaterThan(0);
    }
  });
});
