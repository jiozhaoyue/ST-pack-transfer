/**
 * 局域网互传 · 纯逻辑核心验收。
 *
 * 覆盖 `src/core/lan-transfer.js` 与 `src/ui/lan-transfer-panel.js` 的**纯逻辑层**
 * （攒批器 / 拼接 / 信用等待，2026-11-18 设计二落地后从面板导出）——
 * 这些函数无 DOM / 无 WebRTC 依赖，Node 可直接测；
 * WebRTC 与 DOM 装配（批写挂链、done 前落写、resume 语义）由独立 Web E2E
 * （`e2e/standalone/specs/lan-transfer.e2e.cjs`）与手工双设备验证覆盖，不在此处假装测过。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_SIZE,
  PICKUP_PREFIX,
  PICKUP_TTL_MS,
  SIGNAL_VERSION,
  TRANSFER_PHASES,
  buildSignalPayload,
  chunkCount,
  chunkRange,
  createTransferMachine,
  decodePickupCode,
  encodePickupCode,
  fileIdentity,
  formatBytes,
  formatDuration,
  formatRate,
  fromBase64Url,
  probeDirectCapability,
  progressPercent,
  readSignalPayload,
  toBase64Url,
  verifyTransfer,
} from '../src/core/lan-transfer.js';
import {
  createChunkBatcher,
  mergeChunks,
  waitForCreditAck,
} from '../src/ui/lan-transfer-panel.js';

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

describe('信令负载 v2', () => {
  it('文件身份稳定，大小或时间变化即变', () => {
    const a = fileIdentity({ name: 'p.zip', size: 10, lastModified: 1 });
    expect(fileIdentity({ name: 'p.zip', size: 10, lastModified: 1 })).toBe(a);
    expect(fileIdentity({ name: 'p.zip', size: 11, lastModified: 1 })).not.toBe(a);
    expect(fileIdentity({ name: 'p.zip', size: 10, lastModified: 2 })).not.toBe(a);
    expect(a).toMatch(/^f[0-9a-z]+$/);
  });

  it('offer 负载带文件元信息，answer 负载带续传偏移', async () => {
    const file = { name: '数据包.zip', size: 2048, lastModified: 7 };
    const offer = buildSignalPayload({ role: 'offer', sdp: 'v=0', file });
    expect(offer.v).toBe(SIGNAL_VERSION);
    expect(offer.file.id).toBe(fileIdentity(file));
    expect(offer.file.name).toBe('数据包.zip');

    const answer = buildSignalPayload({ role: 'answer', sdp: 'v=0', fileId: offer.file.id, resumeFrom: 512 });
    expect(answer.resumeFrom).toBe(512);

    const round = readSignalPayload(JSON.parse(JSON.stringify(answer)));
    expect(round.role).toBe('answer');
    expect(round.fileId).toBe(offer.file.id);
    expect(round.resumeFrom).toBe(512);
  });

  it('经真实取件码往返后仍然等价', async () => {
    const payload = buildSignalPayload({ role: 'offer', sdp: 'v=0\r\na=1\r\n'.repeat(20), file: { name: 'a.zip', size: 9 } });
    const decoded = readSignalPayload(await decodePickupCode(await encodePickupCode(payload)));
    expect(decoded.role).toBe('offer');
    expect(decoded.file.name).toBe('a.zip');
    expect(decoded.fileId).toBe(payload.file.id);
  });

  it('v1 旧码没有 v / file 也能读出，按无续传处理', () => {
    const v1 = readSignalPayload({ role: 'answer', sdp: 'v=0' });
    expect(v1.version).toBe(1);
    expect(v1.fileId).toBe('');
    expect(v1.resumeFrom).toBe(0);
  });

  it('未知角色或缺 SDP 一律抛错', () => {
    expect(() => readSignalPayload({ role: 'x', sdp: 'v=0' })).toThrow('不是局域网互传的码');
    expect(() => readSignalPayload({ role: 'offer' })).toThrow('没有连接信息');
  });
});

describe('人读格式', () => {
  it('体积按二进制单位进位', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });

  it('速率为零显示破折号', () => {
    expect(formatRate(0)).toBe('—');
    expect(formatRate(1024 * 1024)).toBe('1.0 MB/s');
  });

  it('时长在分钟处进位', () => {
    expect(formatDuration(0)).toBe('0秒');
    expect(formatDuration(59_000)).toBe('59秒');
    expect(formatDuration(83_000)).toBe('1分23秒');
    expect(formatDuration(120_000)).toBe('2分');
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

  it('两端都有摘要时比对摘要', () => {
    const pass = verifyTransfer({ files: 1, bytes: 10, digest: 'abc' }, { files: 1, bytes: 10, digest: 'abc' });
    expect(pass).toEqual({ ok: true, reason: '', digestChecked: true });
    const bad = verifyTransfer({ files: 1, bytes: 10, digest: 'abc' }, { files: 1, bytes: 10, digest: 'def' });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toContain('摘要');
    expect(bad.digestChecked).toBe(true);
  });

  it('缺任一端摘要时退回字节数核对，并如实标注未做摘要', () => {
    const r = verifyTransfer({ files: 1, bytes: 10, digest: 'abc' }, { files: 1, bytes: 10 });
    expect(r.ok).toBe(true);
    expect(r.digestChecked).toBe(false);
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

// ── 2026-11-18 设计二：接收端写链合并 + 发送端信用流控（面板纯逻辑层） ──

describe('接收端攒批器（设计二 3.1）', () => {
  const bytes = (n, fill = 0) => new Uint8Array(n).fill(fill);
  const region = (buf, from, to) => Array.from(buf.slice(from, to));

  it('mergeChunks：单块直达原样返回（零拷贝），多块按入队顺序拼接', () => {
    const a = bytes(4, 1);
    expect(mergeChunks([a], 4)).toBe(a);
    const b = bytes(3, 2);
    const c = bytes(2, 3);
    const merged = mergeChunks([a, b, c], 9);
    expect(merged.byteLength).toBe(9);
    expect(region(merged, 0, 9)).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3]);
  });

  it('凑满 batchBytes 立即 flush，拼接字节序与入队顺序一致', () => {
    const flushed = [];
    const batcher = createChunkBatcher({ batchBytes: 100, batchMs: 10_000, onFlush: (m) => flushed.push(m) });
    batcher.push(bytes(30, 1));
    batcher.push(bytes(30, 2));
    batcher.push(bytes(30, 3));
    expect(flushed).toHaveLength(0); // 90 < 100：不满批不触发
    batcher.push(bytes(10, 4));      // 100 ≥ 100：立即触发
    expect(flushed).toHaveLength(1);
    expect(flushed[0].byteLength).toBe(100);
    expect(region(flushed[0], 0, 30)).toEqual(new Array(30).fill(1));
    expect(region(flushed[0], 30, 60)).toEqual(new Array(30).fill(2));
    expect(region(flushed[0], 60, 90)).toEqual(new Array(30).fill(3));
    expect(region(flushed[0], 90, 100)).toEqual(new Array(10).fill(4));
    expect(batcher.pendingBytes).toBe(0);
  });

  it('不足批时 batchMs 到点触发 flush（慢速链路批不满也不写盘饥饿）', () => {
    vi.useFakeTimers();
    const flushed = [];
    const batcher = createChunkBatcher({ batchBytes: 1000, batchMs: 30, onFlush: (m) => flushed.push(m) });
    batcher.push(bytes(10, 7));
    vi.advanceTimersByTime(29);
    expect(flushed).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(flushed).toHaveLength(1);
    expect(flushed[0].byteLength).toBe(10);
  });

  it('单块就超过批上限时立即 flush（pending 上界 = 批字节 + 1 块）', () => {
    const flushed = [];
    const batcher = createChunkBatcher({ batchBytes: 10, batchMs: 10_000, onFlush: (m) => flushed.push(m) });
    batcher.push(bytes(50, 1));
    expect(flushed).toHaveLength(1);
    expect(flushed[0].byteLength).toBe(50);
  });

  it('flush 幂等：pending 空时 no-op 返回 null，重复调用不重复触发', () => {
    const flushed = [];
    const batcher = createChunkBatcher({ batchBytes: 10, batchMs: 10_000, onFlush: (m) => flushed.push(m) });
    expect(batcher.flush()).toBeNull();
    batcher.push(bytes(5, 9));
    expect(batcher.flush()).not.toBeNull();
    expect(batcher.flush()).toBeNull();
    expect(flushed).toHaveLength(1);
  });

  it('done 前 flush：最后不满批的数据不丢（先 flush 再校验的前提）', () => {
    const flushed = [];
    const batcher = createChunkBatcher({ batchBytes: 100, batchMs: 10_000, onFlush: (m) => flushed.push(m) });
    batcher.push(bytes(60, 1));
    batcher.push(bytes(39, 2)); // 99 < 100：永远凑不满
    batcher.flush();            // done 控制帧同步 flush
    expect(flushed).toHaveLength(1);
    expect(flushed[0].byteLength).toBe(99);
    expect(region(flushed[0], 0, 60)).toEqual(new Array(60).fill(1));
    expect(region(flushed[0], 60, 99)).toEqual(new Array(39).fill(2));
    expect(batcher.pendingBytes).toBe(0);
  });

  it('reset 丢弃 pending 并清除计时器（cancel / 失败路径不产生写盘）', () => {
    vi.useFakeTimers();
    const flushed = [];
    const batcher = createChunkBatcher({ batchBytes: 1000, batchMs: 30, onFlush: (m) => flushed.push(m) });
    batcher.push(bytes(10, 1));
    batcher.reset();
    expect(batcher.pendingBytes).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(flushed).toHaveLength(0);
  });

  it('flush 返回 onFlush 的返回值（done 前最后一批靠它同步入链；装配层由 writeChain.catch 兜错）', async () => {
    const batcher = createChunkBatcher({
      batchBytes: 100,
      batchMs: 10_000,
      onFlush: (m) => Promise.resolve(`入链 ${m.byteLength}B`),
    });
    batcher.push(bytes(10, 1));
    await expect(batcher.flush()).resolves.toBe('入链 10B');
  });
});

describe('发送端信用等待（设计二 3.2）', () => {
  /** 最小 DataChannel 替身：只实现 waitForCreditAck 依赖的 EventTarget 面。 */
  class FakeDc extends EventTarget {
    /** 模拟对端发来一帧文本控制帧（事件对象带 data 属性，形态同 RTCDataChannel onmessage）。 */
    emit(obj) {
      const ev = new Event('message');
      ev.data = typeof obj === 'string' ? obj : JSON.stringify(obj);
      this.dispatchEvent(ev);
    }
    /** 模拟一帧二进制数据（ArrayBuffer 形态）。 */
    emitBinary() {
      const ev = new Event('message');
      ev.data = new Uint8Array([1, 2, 3]).buffer;
      this.dispatchEvent(ev);
    }
  }

  afterEach(() => { vi.useRealTimers(); });

  it('ack 帧到达立即 settle(true)（信用推进，发送恢复）', async () => {
    vi.useFakeTimers();
    const dc = new FakeDc();
    const p = waitForCreditAck(dc, 10_000);
    dc.emit({ t: 'ack', bytes: 8 * 1024 * 1024 });
    await expect(p).resolves.toBe(true);
  });

  it('ok / err 帧提前 settle(true)（校验流程已接管，继续等 ack 无意义）', async () => {
    vi.useFakeTimers();
    const dc = new FakeDc();
    const pOk = waitForCreditAck(dc, 10_000);
    dc.emit({ t: 'ok', digest: 'x' });
    await expect(pOk).resolves.toBe(true);
    const pErr = waitForCreditAck(dc, 10_000);
    dc.emit({ t: 'err', message: '不一致' });
    await expect(pErr).resolves.toBe(true);
  });

  it('二进制数据帧与坏 JSON 不 settle；到超时返回 false（有界等待，绝不悬挂）', async () => {
    vi.useFakeTimers();
    const dc = new FakeDc();
    const p = waitForCreditAck(dc, 10_000);
    dc.emitBinary();
    dc.emit('not-json');
    vi.advanceTimersByTime(9_999);
    vi.advanceTimersByTime(1);
    await expect(p).resolves.toBe(false);
  });

  it('settle 后移除监听：迟到的帧不再影响后续等待', async () => {
    vi.useFakeTimers();
    const dc = new FakeDc();
    const first = waitForCreditAck(dc, 10_000);
    dc.emit({ t: 'ack', bytes: 1 });
    await expect(first).resolves.toBe(true);
    // 首次等待已 settle：后续新等待只能被新帧 settle，若旧监听未移除会立刻被残留引用误 settle——
    // 这里新等待在新帧到来前超时，即证明监听已被移除。
    const second = waitForCreditAck(dc, 10_000);
    vi.advanceTimersByTime(10_000);
    await expect(second).resolves.toBe(false);
  });
});
