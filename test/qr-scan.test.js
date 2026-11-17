import { describe, it, expect } from 'vitest';
import { isOurCode } from '../src/ui/qr.js';
import { PICKUP_PREFIX, encodePickupCode, buildSignalPayload } from '../src/core/lan-transfer.js';

/**
 * 全屏扫码识别框判定（2026-11-17 用户裁定）：
 * - 只有本工具取件码（SZC1.<flag>.<body>）才算命中，驱动"已识别"高亮后跳出；
 * - 其他二维码提示"不是本工具的二维码"并继续扫描。
 */
describe('qr 全屏扫码：本工具码识别', () => {
  it('前缀常量即工具标识', () => {
    expect(PICKUP_PREFIX).toBe('SZC1');
  });

  it('真实取件码判为本工具码', async () => {
    const code = await encodePickupCode(buildSignalPayload({ role: 'offer', sdp: 'v=0\r\nfake' }));
    expect(code.startsWith(`${PICKUP_PREFIX}.`)).toBe(true);
    expect(isOurCode(code)).toBe(true);
  });

  it('其他常见二维码内容判为非本工具码', () => {
    const others = [
      'https://example.com',
      '{"role":"offer"}',
      'SZC1',             // 缺分隔符
      'SZC2.z.abc',       // 前缀不同
      ' xxSZC1.z.abc',    // 前缀不在开头
      '',
      null,
      undefined,
    ];
    for (const s of others) expect(isOurCode(s)).toBe(false);
  });

  it('三种标志位（z/n）的码都识别', () => {
    expect(isOurCode('SZC1.z.AAAA')).toBe(true);
    expect(isOurCode('SZC1.n.AAAA')).toBe(true);
  });
});
