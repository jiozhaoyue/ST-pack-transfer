/**
 * 局域网互传 · 运行时控制器（执行卡内联）
 *
 * 2026-10-27 重写：不再自建浮层 / 角色页签 / 文件选择器。
 * UI 由 `workbench-view.js` 的模板与 `view.setLan()` 驱动；本文件只做协议与状态。
 *
 * 数据来源：`getSendTargets()` —— 导入区当前勾选的包（index.js 提供）。
 * 接收落地：`onReceive(blob, name)` —— index.js 以 `ORIGINS.LAN` 入库并自动选中。
 *
 * 协议仍是纯前端唯一可行形态：WebRTC DataChannel + 一次性取件码（两跳手工交换）。
 */

import {
  CHUNK_SIZE,
  DIGEST_MAX_BYTES,
  PICKUP_TTL_MS,
  buildSignalPayload,
  createTransferMachine,
  decodePickupCode,
  encodePickupCode,
  fileIdentity,
  formatBytes,
  formatDuration,
  formatRate,
  probeDirectCapability,
  progressPercent,
  readSignalPayload,
  verifyTransfer,
} from '../core/lan-transfer.js';
import { qr } from './qr.js';

const ICE_TIMEOUT_MS = 6000;
const OPEN_TIMEOUT_MS = 15000;
const ACK_INTERVAL_MS = 250;
const ACK_THRESHOLD_BYTES = 1024 * 1024;
const HIGH_WATER_MARK = CHUNK_SIZE * 64;
const LOW_WATER_MARK = CHUNK_SIZE * 16;
const DISCONNECT_GRACE_MS = 8000;

/** 排障日志：`localStorage.setItem('lan-debug','1')` 后刷新页面才输出。 */
function dbg(...args) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('lan-debug') === '1') {
      console.log('[lan]', ...args);
    }
  } catch { /* 隐私模式 */ }
}

/** 有界等待：到点返回 false，调用方据此报错——**不允许 promise 永远 pending**（L1-MR-7）。 */
function onceEvent(target, type, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      target.removeEventListener(type, onEvent);
      clearTimeout(timer);
      resolve(ok);
    };
    const onEvent = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    target.addEventListener(type, onEvent, { once: true });
  });
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) { dbg('sha256 不可用（无 crypto.subtle）'); return ''; }
  try {
    const buf = await subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    dbg('sha256 失败', err?.message || String(err));
    return '';
  }
}

function memorySink() {
  const parts = [];
  let bytes = 0;
  return {
    kind: 'memory',
    get bytes() { return bytes; },
    async write(chunk) { parts.push(chunk); bytes += chunk.byteLength; },
    async finalize() { return new Blob(parts); },
    async close() {},
  };
}

/** OPFS 增量落盘；不可用或配额拒绝时返回 null，调用方回落内存。 */
async function opfsSink(fileId) {
  try {
    if (typeof navigator?.storage?.getDirectory !== 'function') return null;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('lan-transfer', { create: true });
    const name = `${fileId}.part`;
    const handle = await dir.getFileHandle(name, { create: true });
    const existing = await handle.getFile();
    let bytes = existing.size;
    const writable = await handle.createWritable({ keepExistingData: true });
    let closed = false;
    const closeWriter = async () => {
      if (closed) return;
      closed = true;
      try { await writable.close(); } catch { /* 已关闭 */ }
    };
    return {
      kind: 'opfs',
      get bytes() { return bytes; },
      async write(chunk) {
        await writable.write({ type: 'write', position: bytes, data: chunk });
        bytes += chunk.byteLength;
      },
      async finalize() {
        await closeWriter();
        // **不在这里删 .part**：OPFS 的 File 可能仍是惰性读取，先删会让后续
        // `arrayBuffer()`（摘要 / 入库）抛错并静默退化成「仅核对大小」。
        // 清理交给 success 之后的 `discardPartial`。
        return handle.getFile();
      },
      async close() { await closeWriter(); },
    };
  } catch {
    return null;
  }
}

async function partialBytes(fileId) {
  if (!fileId) return 0;
  try {
    if (typeof navigator?.storage?.getDirectory !== 'function') return 0;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('lan-transfer', { create: false });
    const handle = await dir.getFileHandle(`${fileId}.part`, { create: false });
    return (await handle.getFile()).size;
  } catch {
    return 0;
  }
}

/** 丢弃某个包的半成品（用户主动放弃，或核对失败后确定内容已坏）。 */
async function discardPartial(fileId) {
  if (!fileId) return;
  try {
    if (typeof navigator?.storage?.getDirectory !== 'function') return;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('lan-transfer', { create: false });
    await dir.removeEntry(`${fileId}.part`);
  } catch {
    /* 不存在即视为已丢弃 */
  }
}

/** 等 ICE 收集完成；上限 `ICE_TIMEOUT_MS`，到点即使未完成也继续（非 trickle 的真实形态）。 */
async function waitIceComplete(pc) {
  const deadline = Date.now() + ICE_TIMEOUT_MS;
  while (pc.iceGatheringState !== 'complete' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return pc.iceGatheringState === 'complete';
}

/** 给任意 promise 加上限——超时抛错，调用方据此报失败。 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}超时`)), ms)),
  ]);
}

export function mountLanTransferPanel({ view, getSendTargets = null, onReceive = null } = {}) {
  if (!view || typeof document === 'undefined') return null;

  const capability = probeDirectCapability();
  const setSend = (patch) => view.setLan({ send: patch });
  const setRecv = (patch) => view.setLan({ recv: patch });
  const toast = (msg) => view.toast(msg);
  const log = (level, msg) => view.pushLog(level, msg);

  // ── 运行时状态 ──
  let pc = null;
  let channel = null;
  let machine = createTransferMachine();
  let expiryTimer = null;
  let currentFile = null;
  let queue = [];
  let queueIndex = 0;

  let sendState = 'idle'; // idle | waiting | connecting | sending | done | failed | cancelled
  let recvState = 'idle'; // idle | connecting | receiving | done | failed
  let incoming = null;
  let pendingOffer = null;
  let writeChain = Promise.resolve();
  let doneWaiter = null;
  let cancelRequested = false;
  let rateSamples = [];
  let ackBytes = 0;
  let ackAt = 0;
  /** 内存兜底时的半成品；键为 fileId。OPFS 半成品直接读盘，不进这个表。 */
  const partials = new Map();

  if (!capability.direct) {
    setSend({ phase: capability.reason, detail: '请改用导出文件再手动传入', error: false });
    setRecv({ phase: capability.reason, detail: '请改用导出文件再手动传入' });
  }

  const isActiveSend = () => sendState === 'waiting' || sendState === 'connecting' || sendState === 'sending';

  function closeSession() {
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    try { channel?.close(); } catch { /* 已关闭 */ }
    try { pc?.close(); } catch { /* 已关闭 */ }
    channel = null;
    pc = null;
    // 发送端可能正卡在「等待对端核对」：必须显式 settle，不能把 promise 留悬。
    if (doneWaiter) {
      const cb = doneWaiter;
      doneWaiter = null;
      cb(false, '连接已关闭');
    }
    if (incoming?.sink) {
      void incoming.sink.close();
      if (incoming.sink.kind === 'opfs') partials.delete(incoming.fileId);
    }
  }

  function bindConnection(local, onFail) {
    local.addEventListener('connectionstatechange', () => {
      const state = local.connectionState;
      dbg('connection', state, local.iceConnectionState);
      if (state === 'failed') onFail('连接失败');
      if (state === 'disconnected') {
        setTimeout(() => {
          if (pc === local && local.connectionState === 'disconnected') onFail('连接中断');
        }, DISCONNECT_GRACE_MS);
      }
    });
  }

  function rateOf(bytes, total) {
    const now = Date.now();
    rateSamples.push({ t: now, b: bytes });
    while (rateSamples.length > 2 && now - rateSamples[0].t > 3000) rateSamples.shift();
    const first = rateSamples[0];
    const dt = now - first.t;
    if (dt < 300) return { rate: 0, eta: 0 };
    const rate = ((bytes - first.b) / dt) * 1000;
    const eta = rate > 0 ? ((total - bytes) / rate) * 1000 : 0;
    return { rate, eta };
  }

  function transferDetail(bytes, total) {
    const { rate, eta } = rateOf(bytes, total);
    const tail = rate > 0 ? ` · ${formatRate(rate)} · 剩余 ${formatDuration(eta)}` : '';
    return `${formatBytes(bytes)} / ${formatBytes(total)}${tail}`;
  }

  async function ensureQrReady() {
    try { await qr.ready(); } catch (err) { dbg('二维码库不可用', err?.message || String(err)); }
  }

  // ── 发送端 ──
  function failSend(message) {
    if (sendState === 'failed' || sendState === 'cancelled') return;
    sendState = 'failed';
    try { machine.fail(message); } catch { /* 已终态 */ }
    setSend({
      code: '', answer: '', phase: '失败', detail: message,
      pct: 0, busy: false, waiting: false, done: false, error: true,
    });
    closeSession();
    log('ERROR', `局域网发送失败：${message}`);
  }

  function finishSend(detail) {
    try { machine.finish(); } catch { /* 已终态 */ }
    sendState = 'done';
    setSend({
      code: '', answer: '', phase: '已发送', detail,
      pct: 100, busy: false, waiting: false, done: true, error: false,
    });
    closeSession();
    log('INFO', `局域网发送完成：${currentFile?.name || ''}`);
    queueIndex += 1;
    if (queueIndex < queue.length) {
      const next = queue[queueIndex];
      setTimeout(() => {
        if (sendState !== 'done' || queueIndex >= queue.length) return;
        void startSend(next).catch((err) => failSend(err.message));
      }, 350);
    } else {
      queue = [];
      queueIndex = 0;
    }
  }

  function bindSenderChannel(dc) {
    dc.onopen = () => {
      if (sendState === 'connecting') setSend({ phase: '已连接，准备传输', detail: '' });
    };
    dc.onclose = () => { if (sendState === 'sending') failSend('通道已关闭'); };
    dc.onerror = () => { if (sendState === 'sending' || sendState === 'connecting') failSend('通道错误'); };
    dc.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let msg = null;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.t === 'ack') { ackBytes = Number(msg.bytes) || 0; return; }
      if (msg.t === 'ok' && doneWaiter) { const cb = doneWaiter; doneWaiter = null; cb(true, ''); return; }
      if (msg.t === 'err' && doneWaiter) { const cb = doneWaiter; doneWaiter = null; cb(false, msg.message || '对端核对失败'); }
    };
  }

  async function startSend(file) {
    if (!file) throw new Error('没有可发送的包');
    closeSession();
    machine = createTransferMachine();
    cancelRequested = false;
    sendState = 'waiting';
    currentFile = file;
    rateSamples = [];
    await ensureQrReady();

    const queueLabel = queue.length > 1 ? `第 ${queueIndex + 1}/${queue.length} 个 · ` : '';
    setSend({
      code: '', answer: '', phase: '准备中', detail: `${queueLabel}${file.name} · ${formatBytes(file.size)}`,
      pct: 0, busy: false, waiting: true, done: false, error: false,
    });

    const local = new RTCPeerConnection({ iceServers: [] });
    pc = local;
    bindConnection(local, failSend);
    const dc = local.createDataChannel('pack', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = LOW_WATER_MARK;
    channel = dc;
    bindSenderChannel(dc);

    machine.openPickup({ total: file.size, ttlMs: PICKUP_TTL_MS });
    expiryTimer = setTimeout(() => {
      if (machine.isPickupValid()) failSend('取件码已过期');
    }, PICKUP_TTL_MS);

    const offer = await local.createOffer();
    await local.setLocalDescription(offer);
    await waitIceComplete(local);
    if (sendState !== 'waiting') return;
    const code = await encodePickupCode(buildSignalPayload({
      role: 'offer',
      sdp: local.localDescription.sdp,
      file,
    }));
    setSend({
      code, phase: '把取件码交给对方',
      detail: `${queueLabel}${file.name} · ${formatBytes(file.size)}`,
      busy: false, waiting: true,
    });
    log('INFO', `取件码已生成：${file.name}`);
    dbg('offer ready', file.size, local.iceGatheringState);
  }

  async function sendFile(resumeFrom) {
    const dc = channel;
    if (!dc) throw new Error('通道未建立');
    if (dc.readyState !== 'open') {
      const opened = await onceEvent(dc, 'open', OPEN_TIMEOUT_MS);
      if (!opened || dc.readyState !== 'open') throw new Error('通道未打开');
    }

    machine.start();
    sendState = 'sending';
    setSend({ busy: true, waiting: false, phase: '传输中', pct: 0, detail: '' });

    const file = currentFile;
    const total = file.size;
    const fileId = fileIdentity(file);

    let digest = '';
    if (total <= DIGEST_MAX_BYTES) {
      try { digest = await sha256Hex(new Uint8Array(await file.arrayBuffer())); } catch { digest = ''; }
    }

    dc.send(JSON.stringify({ t: 'meta', name: file.name, size: total, fileId, digest }));
    dbg('send meta', { total, fileId, digest: Boolean(digest), resumeFrom });

    let offset = Math.max(0, Math.min(Number(resumeFrom) || 0, total));
    rateSamples = [{ t: Date.now(), b: offset }];
    if (offset > 0) setSend({ pct: progressPercent(offset, total), phase: '续传中', detail: transferDetail(offset, total) });

    while (offset < total) {
      if (cancelRequested) throw new Error('已取消');
      if (dc.readyState !== 'open') throw new Error('通道已关闭');
      if (dc.bufferedAmount > HIGH_WATER_MARK) {
        await onceEvent(dc, 'bufferedamountlow', 250);
        continue;
      }
      const end = Math.min(offset + CHUNK_SIZE, total);
      const chunk = await file.slice(offset, end).arrayBuffer();
      if (dc.readyState !== 'open') throw new Error('通道已关闭');
      dc.send(chunk);
      offset = end;
      try { machine.advanceSent(chunk.byteLength); } catch { /* 状态已终态 */ }
      setSend({ pct: progressPercent(offset, total), phase: '传输中', detail: transferDetail(offset, total) });
    }

    dc.send(JSON.stringify({ t: 'done', bytes: total, digest }));
    dbg('send done', total);
    setSend({ phase: '等待对端核对', pct: 100, detail: `${formatBytes(total)}${digest ? ' · 摘要已发送' : ' · 仅核对大小'}` });

    const waitMs = Math.max(30_000, 5_000 + (total / (1024 * 1024)) * 2_000);
    const confirmed = await new Promise((resolve) => {
      doneWaiter = (success, message) => resolve({ success, message });
      setTimeout(() => {
        if (!doneWaiter) return;
        doneWaiter = null;
        resolve({ success: false, message: '等待对端确认超时' });
      }, waitMs);
    });
    if (!confirmed.success) throw new Error(confirmed.message || '对端未确认');

    finishSend(digest ? '摘要一致' : '仅核对大小');
  }

  async function generate() {
    if (!capability.direct) { toast(capability.reason); return; }
    if (isActiveSend()) { toast('正在传输，请先取消或完成当前任务'); return; }
    let targets = [];
    try {
      targets = typeof getSendTargets === 'function' ? await getSendTargets() : [];
    } catch (err) {
      toast(`读取包失败：${err.message}`);
      return;
    }
    if (!targets.length) { toast('先在数据包区勾选要发送的包'); return; }
    queue = targets;
    queueIndex = 0;
    sendState = 'idle';
    void startSend(queue[0]).catch((err) => failSend(err.message));
  }

  async function applyAnswer(code) {
    if (!capability.direct) { toast(capability.reason); return; }
    if (sendState === 'done') { toast('已完成，再传请重新生成取件码'); return; }
    if (!pc || !currentFile) { toast('先生成取件码'); return; }
    if (sendState === 'connecting' || sendState === 'sending') return;

    let payload = null;
    try {
      payload = readSignalPayload(await decodePickupCode(code));
    } catch (err) {
      failSend(err.message);
      return;
    }
    if (payload.role !== 'answer') { failSend('不是应答码'); return; }

    try {
      machine.connecting();
      sendState = 'connecting';
      setSend({ answer: String(code || '').trim(), busy: true, waiting: false, phase: '连接中', pct: 0, detail: '' });
      await withTimeout(pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp }), 12_000, '应用应答码');
      await sendFile(payload.resumeFrom);
    } catch (err) {
      failSend(err.message);
    }
  }

  function cancel() {
    cancelRequested = true;
    try { channel?.send(JSON.stringify({ t: 'cancel' })); } catch { /* 通道已断 */ }
    queue = [];
    queueIndex = 0;
    sendState = 'cancelled';
    setSend({ code: '', answer: '', phase: '已取消', detail: '', pct: 0, busy: false, waiting: false, done: false, error: false });
    closeSession();
    log('INFO', '局域网发送已取消');
  }

  function retry() {
    if (!capability.direct) { toast(capability.reason); return; }
    if (isActiveSend()) return;
    if (!currentFile) { void generate(); return; }
    if (!queue.length) { queue = [currentFile]; queueIndex = 0; }
    sendState = 'idle';
    void startSend(currentFile).catch((err) => failSend(err.message));
  }

  // ── 接收端 ──
  function failRecv(message) {
    if (recvState === 'failed') return;
    recvState = 'failed';
    try { machine.fail(message); } catch { /* 已终态 */ }
    const received = incoming?.sink?.bytes || 0;
    setRecv({
      code: '', phase: '失败',
      detail: message + (received ? ` · 已收 ${formatBytes(received)}` : ''),
      pct: 0, busy: false, done: false,
    });
    closeSession();
    log('ERROR', `局域网接收失败：${message}`);
  }

  async function finishReceive(expectedBytes, expectedDigest) {
    const current = incoming;
    if (!current) return;
    await writeChain;
    const sink = current.sink || await current.sinkReady;
    if (!sink) { failRecv('落盘不可用'); return; }
    let blob = null;
    try {
      blob = await sink.finalize();
    } catch (err) {
      failRecv(`落盘失败 ${err.message}`);
      return;
    }

    let digest = '';
    if (expectedBytes <= DIGEST_MAX_BYTES) {
      try { digest = await sha256Hex(new Uint8Array(await blob.arrayBuffer())); } catch (err) {
        dbg('digest 计算失败', err?.message || String(err));
        digest = '';
      }
    }
    const verdict = verifyTransfer(
      { files: 1, bytes: expectedBytes, digest: expectedDigest },
      { files: 1, bytes: blob.size, digest },
    );
    dbg('recv verify', { expectedBytes, size: blob.size, digestChecked: Boolean(digest), ok: verdict.ok });
    if (!verdict.ok) {
      try { channel?.send(JSON.stringify({ t: 'err', message: verdict.reason })); } catch { /* 通道已断 */ }
      partials.delete(current.fileId);
      void discardPartial(current.fileId);
      failRecv(`核对失败 ${verdict.reason}`);
      return;
    }

    // 先回执再断链：发送端靠这一帧结束「等待对端确认」。
    try { channel?.send(JSON.stringify({ t: 'ok', digest })); } catch { /* 通道已断 */ }

    try { machine.finish(); } catch { /* 已终态 */ }
    recvState = 'done';
    partials.delete(current.fileId);
    setRecv({
      offer: '', code: '',
      phase: verdict.digestChecked ? '已接收 · 摘要一致' : '已接收 · 仅核对大小',
      detail: `正在保存 ${current.name}`, pct: 100, busy: true, done: true,
    });
    incoming = null;
    pendingOffer = null;
    closeSession();

    try {
      if (typeof onReceive === 'function') await onReceive(blob, current.name);
      setRecv({ detail: `${formatBytes(blob.size)}${verdict.digestChecked ? ' · 摘要一致' : ''}`, busy: false });
      log('INFO', `局域网接收完成：${current.name}`);
    } catch (err) {
      setRecv({ phase: '已接收但入库失败', detail: err.message, busy: false });
      log('ERROR', `接收包入库失败：${err.message}`);
    }
    void discardPartial(current.fileId);
  }

  const handleReceiverControl = (text, dc) => {
    let msg = null;
    try { msg = JSON.parse(text); } catch { return; }

    if (msg.t === 'meta') {
      const size = Number(msg.size) || 0;
      const fileId = msg.fileId || pendingOffer?.fileId || fileIdentity({ name: msg.name, size });
      const entry = {
        name: msg.name || pendingOffer?.name || 'received.zip',
        size,
        fileId,
        digest: typeof msg.digest === 'string' ? msg.digest : '',
        sink: null,
      };
      try { machine.openPickup({ total: size }); machine.connecting(); machine.start(); } catch { /* 已开过 */ }
      recvState = 'receiving';
      ackBytes = 0;
      ackAt = Date.now();
      rateSamples = [{ t: Date.now(), b: 0 }];
      writeChain = Promise.resolve();
      incoming = entry;
      dbg('recv meta', { size, fileId, digest: Boolean(entry.digest) });
      setRecv({ phase: '接收中', pct: 0, detail: `${formatBytes(0)} / ${formatBytes(size)}`, busy: true, done: false });
      const existing = partials.get(fileId);
      // 数据帧可能先于 OPFS 打开就到达（实测首 8 块被丢）：用 sinkReady 让写链等待，
      // **绝不丢弃**——丢了就是残缺包且校验只报「摘要不一致」，根因被掩盖。
      entry.sinkReady = (async () => {
        entry.sink = existing || (await opfsSink(fileId)) || memorySink();
        partials.set(fileId, entry.sink);
        dbg('recv sink', entry.sink.kind, entry.sink.bytes);
        setRecv({
          phase: entry.sink.bytes > 0 ? '续传中' : '接收中',
          pct: progressPercent(entry.sink.bytes, size),
          detail: `${formatBytes(entry.sink.bytes)} / ${formatBytes(size)}`,
        });
        return entry.sink;
      })();
      entry.sinkReady.catch((err) => failRecv(`落盘不可用 ${err.message}`));
      return;
    }

    if (msg.t === 'done' && incoming) {
      const expected = Number(msg.bytes) || incoming.size;
      dbg('recv done frame', expected);
      writeChain.then(() => finishReceive(expected, msg.digest || incoming.digest))
        .catch((err) => failRecv(err.message));
      return;
    }

    if (msg.t === 'cancel') {
      if (incoming?.sink) partials.set(incoming.fileId, incoming.sink);
      failRecv('对方已取消');
    }
  };

  function bindReceiverChannel(dc) {
    dc.onopen = () => { if (recvState === 'connecting') setRecv({ phase: '已连接，等待数据', detail: '' }); };
    dc.onclose = () => { if (recvState === 'receiving') failRecv('通道已关闭'); };
    dc.onerror = () => { if (recvState === 'receiving') failRecv('通道错误'); };
    dc.onmessage = (event) => {
      if (typeof event.data === 'string') { handleReceiverControl(event.data, dc); return; }
      if (!incoming) return;
      const chunk = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : new Uint8Array(event.data?.buffer || event.data || []);
      const current = incoming;
      writeChain = writeChain.then(async () => {
        // 等 sink 就绪再写：数据帧可以来得比 OPFS 打开更早（实测首 8 块）。
        const sink = current.sink || await current.sinkReady;
        if (!sink) { dbg('chunk dropped: sink 不可用', chunk.byteLength); return; }
        await sink.write(chunk);
        const bytes = sink.bytes;
        current.chunks = (current.chunks || 0) + 1;
        if (current.chunks % 8 === 0) dbg('recv chunk', current.chunks, bytes, current.size);
        try { machine.advanceReceived(chunk.byteLength); } catch { /* 状态已终态 */ }
        setRecv({ phase: '接收中', pct: progressPercent(bytes, current.size), detail: transferDetail(bytes, current.size) });
        const now = Date.now();
        if (bytes - ackBytes >= ACK_THRESHOLD_BYTES || now - ackAt >= ACK_INTERVAL_MS) {
          ackBytes = bytes;
          ackAt = now;
          try { dc.send(JSON.stringify({ t: 'ack', bytes })); } catch { /* 通道已断 */ }
        }
      }).catch((err) => failRecv(err.message));
    };
  }

  async function acceptOffer(code) {
    if (!capability.direct) { toast(capability.reason); return; }
    if (recvState === 'connecting' || recvState === 'receiving') { toast('正在接收，请先放弃当前任务'); return; }
    const text = String(code || '').trim();
    if (!text) { toast('先粘贴取件码'); return; }

    closeSession();
    machine = createTransferMachine();
    recvState = 'connecting';
    incoming = null;
    pendingOffer = null;
    setRecv({ offer: text, code: '', phase: '解析取件码', detail: '', pct: 0, busy: true, done: false });

    let payload = null;
    try {
      payload = readSignalPayload(await decodePickupCode(text));
    } catch (err) {
      failRecv(err.message);
      return;
    }
    if (payload.role !== 'offer') { failRecv('不是取件码'); return; }

    const fileId = payload.fileId || fileIdentity(payload.file || {});
    const resumeFrom = partials.get(fileId)?.bytes || await partialBytes(fileId);
    pendingOffer = { fileId, size: Number(payload.file?.size) || 0, name: payload.file?.name || 'received.zip' };

    const local = new RTCPeerConnection({ iceServers: [] });
    pc = local;
    bindConnection(local, failRecv);
    local.ondatachannel = (event) => {
      channel = event.channel;
      channel.binaryType = 'arraybuffer';
      bindReceiverChannel(channel);
    };

    try {
      await withTimeout(local.setRemoteDescription({ type: 'offer', sdp: payload.sdp }), 12_000, '应用取件码');
      const answer = await local.createAnswer();
      await local.setLocalDescription(answer);
      await waitIceComplete(local);
      await ensureQrReady();
      if (recvState !== 'connecting') return;
      const code2 = await encodePickupCode(buildSignalPayload({
        role: 'answer',
        sdp: local.localDescription.sdp,
        fileId,
        resumeFrom,
      }));
      setRecv({
        code: code2,
        phase: resumeFrom > 0 ? '把应答码回传，将从断点继续' : '把应答码回传给对方',
        detail: `${pendingOffer.name} · ${formatBytes(pendingOffer.size)}${resumeFrom > 0 ? ` · 续传 ${formatBytes(resumeFrom)}` : ''}`,
        pct: progressPercent(resumeFrom, pendingOffer.size),
        busy: true,
      });
      log('INFO', `应答码已生成：${pendingOffer.name}`);
    } catch (err) {
      failRecv(err.message);
    }
  }

  async function abandon() {
    const fileId = incoming?.fileId || pendingOffer?.fileId;
    closeSession();
    incoming = null;
    pendingOffer = null;
    recvState = 'idle';
    if (fileId) {
      partials.delete(fileId);
      await discardPartial(fileId);
    }
    setRecv({ offer: '', code: '', phase: '半成品已放弃', detail: '', pct: 0, busy: false, done: false });
    log('INFO', '局域网接收半成品已放弃');
  }

  const onPageHide = () => closeSession();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  function destroy() {
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
    closeSession();
  }

  return { generate, applyAnswer, acceptOffer, retry, cancel, abandon, destroy };
}
