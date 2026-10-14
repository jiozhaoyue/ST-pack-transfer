/**
 * 局域网互传 · 纯逻辑核心验收。
 *
 * 只覆盖 `src/core/lan-transfer.js`——WebRTC 与 DOM 装配在浏览器侧，
 * 由独立 Web E2E 与手工双设备验证覆盖，不在此处假装测过。
 */
import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  PICKUP_PREFIX,
  PICKUP_TTL_MS,
  TRANSFER_PHASES,
  chunkCount,
  chunkRange,
  createTransferMachine,
  decodePickupCode,
  encodePickupCode,
  fromBase64Url,
  probeDirectCapability,
  progressPercent,
  toBase64Url,
  verifyTransfer,
} from '../src/core/lan-transfer.js';

describe('base64url 编解码', () => {
  it('往返一致，且不含 + / = 三个 URL 危险字符', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 62, 63]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect([...fromBase64Url(text)]).toEqual([...bytes]);
  });

  it('空输入往返为空', () => {
    expect(fromBase64Url(toBase64Url(new Uint8Array(0))).length).toBe(0);
  });
});

describe('取件码编解码', () => {
  it('往返一致（含中文与长 SDP）', async () => {
    const payload = {
      role: 'offer',
      name: '数据包',
      sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' + 'a=candidate:1 1 udp 2 10.0.0.1 5000 typ host\r\n'.repeat(30),
    };
    const code = await encodePickupCode(payload);
    expect(code.startsWith(`${PICKUP_PREFIX}.`)).toBe(true);
    expect(await decodePickupCode(code)).toEqual(payload);
  });

  it('压缩生效时码比原 JSON 短（SDP 高度重复）', async () => {
    const sdp = 'a=candidate:1 1 udp 2 10.0.0.1 5000 typ host\r\n'.repeat(60);
    const code = await encodePickupCode({ role: 'offer', sdp });
    // 未压缩的 base64 约为 JSON 长度的 4/3；压缩后应显著更短
    expect(code.length).toBeLessThan(JSON.stringify({ role: 'offer', sdp }).length);
  });

  it('前后空白被容忍', async () => {
    const code = await encodePickupCode({ role: 'answer', sdp: 'x' });
    expect(await decodePickupCode(`  ${code}\n`)).toEqual({ role: 'answer', sdp: 'x' });
  });

  it('空码 / 前缀不对 / 段数不对 / 标志位不认识 → 一律抛错，不静默返回空对象', async () => {
    await expect(decodePickupCode('')).rejects.toThrow('取件码为空');
    await expect(decodePickupCode('XXX.n.abc')).rejects.toThrow('取件码格式不对');
    await expect(decodePickupCode(`${PICKUP_PREFIX}.n`)).rejects.toThrow('取件码格式不对');
    await expect(decodePickupCode(`${PICKUP_PREFIX}.q.abc`)).rejects.toThrow('标志位不认识');
  });
});

describe('分块', () => {
  it('块数向上取整；总长为 0 时为 0 块', () => {
    expect(chunkCount(0)).toBe(0);
    expect(chunkCount(CHUNK_SIZE)).toBe(1);
    expect(chunkCount(CHUNK_SIZE + 1)).toBe(2);
  });

  it('块大小为非法值时抛错（不静默产生 Infinity 块）', () => {
    expect(() => chunkCount(10, 0)).toThrow('块大小非法');
    expect(() => chunkCount(10, Number.NaN)).toThrow('块大小非法');
  });

  it('块区间为左闭右开，末块截断到总长，越界返回 null', () => {
    expect(chunkRange(0, 10, 4)).toEqual({ start: 0, end: 4 });
    expect(chunkRange(2, 10, 4)).toEqual({ start: 8, end: 10 });
    expect(chunkRange(3, 10, 4)).toBeNull();
    expect(chunkRange(-1, 10, 4)).toBeNull();
  });
});

describe('进度', () => {
  it('0/50/100 与超额截断', () => {
    expect(progressPercent(0, 200)).toBe(0);
    expect(progressPercent(100, 200)).toBe(50);
    expect(progressPercent(200, 200)).toBe(100);
    expect(progressPercent(999, 200)).toBe(100);
    expect(progressPercent(-5, 200)).toBe(0);
  });

  it('总长为 0 视为已完成（空包不该卡在 0%）', () => {
    expect(progressPercent(0, 0)).toBe(100);
  });
});

describe('传输状态机', () => {
  it('正常链路 idle → waiting → connecting → transferring → done', () => {
    const m = createTransferMachine();
    expect(m.getState().phase).toBe(TRANSFER_PHASES.IDLE);
    m.openPickup({ total: 100 });
    expect(m.getState().phase).toBe(TRANSFER_PHASES.WAITING);
    m.connecting();
    expect(m.getState().phase).toBe(TRANSFER_PHASES.CONNECTING);
    m.start();
    expect(m.getState().phase).toBe(TRANSFER_PHASES.TRANSFERRING);
    m.advanceSent(40);
    expect(m.percent()).toBe(40);
    m.finish();
    expect(m.getState().phase).toBe(TRANSFER_PHASES.DONE);
  });

  it('越阶段操作被拒绝（防止把未握手的作业当成在传）', () => {
    const m = createTransferMachine();
    expect(() => m.start()).toThrow('不允许该操作');
    expect(() => m.advanceSent(1)).toThrow('不允许该操作');
    m.openPickup({ total: 10 });
    expect(() => m.finish()).toThrow('不允许该操作');
  });

  it('已发出的字节数不超过总量', () => {
    const m = createTransferMachine();
    m.openPickup({ total: 10 });
    m.connecting();
    m.start();
    m.advanceSent(999);
    expect(m.getState().sentBytes).toBe(10);
  });

  it('一次性语义：失败即终态，且完成后再失败不覆盖结果', () => {
    const m = createTransferMachine();
    m.openPickup({ total: 10 });
    m.connecting();
    m.start();
    m.fail('断了');
    expect(m.getState().phase).toBe(TRANSFER_PHASES.FAILED);
    expect(m.getState().error).toBe('断了');
    expect(() => m.start()).toThrow('不允许该操作');

    const done = createTransferMachine();
    done.openPickup({ total: 10 });
    done.connecting();
    done.start();
    done.finish();
    done.fail('迟到的错误');
    expect(done.getState().phase).toBe(TRANSFER_PHASES.DONE);
  });

  it('取件码只在等待接入且未过期时有效', () => {
    let clock = 1000;
    const m = createTransferMachine({ now: () => clock });
    m.openPickup({ total: 10, ttlMs: 100 });
    expect(m.isPickupValid()).toBe(true);
    clock = 1200;
    expect(m.isExpired()).toBe(true);
    expect(m.isPickupValid()).toBe(false);
  });

  it('默认有效期为 10 分钟', () => {
    let clock = 0;
    const m = createTransferMachine({ now: () => clock });
    m.openPickup({ total: 1 });
    clock = PICKUP_TTL_MS - 1;
    expect(m.isExpired()).toBe(false);
    clock = PICKUP_TTL_MS + 1;
    expect(m.isExpired()).toBe(true);
  });
});

describe('传输核对', () => {
  it('条目数与字节数都一致才算通过', () => {
    expect(verifyTransfer({ files: 2, bytes: 100 }, { files: 2, bytes: 100 }).ok).toBe(true);
    const byFiles = verifyTransfer({ files: 2, bytes: 100 }, { files: 1, bytes: 100 });
    expect(byFiles.ok).toBe(false);
    expect(byFiles.reason).toContain('条目数不一致');
    const byBytes = verifyTransfer({ files: 2, bytes: 100 }, { files: 2, bytes: 99 });
    expect(byBytes.ok).toBe(false);
    expect(byBytes.reason).toContain('字节数不一致');
  });
});

describe('直连能力探测', () => {
  it('非安全上下文明确不可直连，并给出可读原因', () => {
    const r = probeDirectCapability({ isSecureContext: false, hasRTC: true });
    expect(r.direct).toBe(false);
    expect(r.reason).toContain('安全上下文');
  });

  it('无 WebRTC 明确不可直连', () => {
    const r = probeDirectCapability({ isSecureContext: true, hasRTC: false });
    expect(r.direct).toBe(false);
    expect(r.reason).toContain('不支持直连');
  });

  it('安全上下文 + 有 WebRTC 才可直连', () => {
    expect(probeDirectCapability({ isSecureContext: true, hasRTC: true }))
      .toEqual({ direct: true, reason: '' });
  });
});
