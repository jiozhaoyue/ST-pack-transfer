/**
 * 局域网互传面板（2026-10-27 按 Luker / TT 的结构重写）
 *
 * 结构对标：
 *   · Luker `public/scripts/lan-sync.js` —— peer row（图标 / 名称 / 元信息 / 动作）、状态行、分场景报错；
 *   · TauriTavern `tt-adapter-sync` —— 阶段 + 进度 + 百分比、原子落盘、自然续传。
 *
 * 协议仍是纯前端唯一可行形态：WebRTC DataChannel + 一次性取件码（两跳手工交换）。
 * 浏览器不能监听端口，故不照搬它们「本机起 HTTP 服务」的实现——这一点在核心层已注明。
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

const SVG_NS = 'http://www.w3.org/2000/svg';
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

/** 图标只用 `createElementNS` 构建——不走 `innerHTML`。 */
const ICONS = {
  send: [{ tag: 'path', attrs: { d: 'M4 12l16-7-7 16-2-7z' } }],
  recv: [
    { tag: 'path', attrs: { d: 'M12 4v12' } },
    { tag: 'path', attrs: { d: 'M7 11l5 5 5-5' } },
    { tag: 'path', attrs: { d: 'M5 20h14' } },
  ],
  pack: [
    { tag: 'rect', attrs: { x: '4', y: '5', width: '16', height: '4', rx: '1' } },
    { tag: 'path', attrs: { d: 'M6 9h12v10H6z' } },
  ],
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'wb-lan-ico');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  for (const spec of ICONS[name] || ICONS.pack) {
    const node = document.createElementNS(SVG_NS, spec.tag);
    for (const [key, value] of Object.entries(spec.attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  return svg;
}

function button(id, label, variant = '') {
  const b = el('button', `menu_button${variant ? ` ${variant}` : ''}`);
  b.type = 'button';
  b.id = id;
  b.textContent = label;
  return b;
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
        // `arrayBuffer()`（摘要 / 入库）抛错并静默退化成「仅核对大小」——
        // 2026-10-27 E2E 实测。清理交给 success 之后的 `discardPartial`。
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

export function mountLanTransferPanel({ root, onReceive = null } = {}) {
  if (!root || typeof document === 'undefined') return null;

  const capability = probeDirectCapability();

  const overlay = el('div', 'wb-lan-overlay');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = el('div', 'wb-lan-card');

  // ── 标题行（Luker 的 peer title 形态）──
  const head = el('div', 'wb-lan-head');
  head.append(el('div', 'wb-lan-title', '局域网互传'));
  const capBadge = el('span', `wb-lan-badge${capability.direct ? '' : ' warn'}`,
    capability.direct ? '可直连' : '不可直连');
  head.append(capBadge);
  const btnCloseTop = el('button', 'wb-lan-close');
  btnCloseTop.type = 'button';
  btnCloseTop.textContent = '×';
  btnCloseTop.title = '关闭';
  head.append(btnCloseTop);
  card.append(head);

  if (!capability.direct) {
    card.append(el('div', 'wb-lan-note', capability.reason));
    card.append(el('div', 'wb-lan-note', '请改用导出文件再手动传入'));
  }

  // ── 角色切换（发送 / 接收）──
  const roleTabs = el('div', 'wb-lan-seg');
  const roleSend = el('button', 'active', '发送');
  roleSend.type = 'button';
  roleSend.id = 'lan-role-send';
  const roleRecv = el('button', '', '接收');
  roleRecv.type = 'button';
  roleRecv.id = 'lan-role-recv';
  roleTabs.append(roleSend, roleRecv);
  card.append(roleTabs);
  card.append(el('div', 'wb-lan-hint', '取件码与应答码各粘贴一次'));

  // ── 发送端 ──
  const sendPane = el('div', 'wb-lan-pane');

  const sendPeer = el('div', 'wb-lan-peer');
  const sendPeerMain = el('div', 'wb-lan-peer-main');
  const sendPeerName = el('div', 'wb-lan-peer-name', '未选择数据包');
  const sendPeerMeta = el('div', 'wb-lan-peer-meta', '选择一个 zip 后生成取件码');
  sendPeerMain.append(sendPeerName, sendPeerMeta);
  const sendPick = el('input');
  sendPick.type = 'file';
  sendPick.accept = '.zip';
  sendPick.id = 'lan-send-file';
  sendPick.hidden = true;
  const btnPick = button('lan-btn-pick', '选择文件');
  sendPeer.append(icon('pack'), sendPeerMain, btnPick, sendPick);

  const sendCodeLabel = el('div', 'wb-lan-field-title', '取件码');
  const sendCode = el('textarea', 'text_pole wb-lan-code');
  sendCode.id = 'lan-send-code';
  sendCode.readOnly = true;
  sendCode.rows = 3;
  sendCode.placeholder = '选择文件后生成';
  const btnCopySend = button('lan-btn-copy-send', '复制取件码', 'wb-lan-wide');

  const answerLabel = el('div', 'wb-lan-field-title', '应答码');
  const answerInput = el('textarea', 'text_pole wb-lan-code');
  answerInput.id = 'lan-answer-input';
  answerInput.rows = 3;
  answerInput.placeholder = '粘贴对方回传的应答码';
  const btnApplyAnswer = button('lan-btn-apply-answer', '开始传输', 'wb-lan-wide');

  const sendProgress = progressRow('lan-send-progress');
  const sendStatus = el('div', 'wb-lan-status');
  sendStatus.id = 'lan-send-status';

  const sendActions = el('div', 'wb-lan-actions');
  const btnRetrySend = button('lan-btn-retry', '重试');
  btnRetrySend.hidden = true;
  const btnCancelSend = button('lan-btn-cancel-send', '取消');
  btnCancelSend.hidden = true;
  sendActions.append(btnRetrySend, btnCancelSend);

  sendPane.append(sendPeer, sendCodeLabel, sendCode, btnCopySend,
    answerLabel, answerInput, btnApplyAnswer, sendProgress.root, sendStatus, sendActions);

  // ── 接收端 ──
  const recvPane = el('div', 'wb-lan-pane');
  recvPane.hidden = true;

  const recvPeer = el('div', 'wb-lan-peer');
  const recvPeerMain = el('div', 'wb-lan-peer-main');
  const recvPeerName = el('div', 'wb-lan-peer-name', '等待取件码');
  const recvPeerMeta = el('div', 'wb-lan-peer-meta', '粘贴发送端的取件码后生成应答码');
  recvPeerMain.append(recvPeerName, recvPeerMeta);
  recvPeer.append(icon('recv'), recvPeerMain);

  const offerLabel = el('div', 'wb-lan-field-title', '取件码');
  const offerInput = el('textarea', 'text_pole wb-lan-code');
  offerInput.id = 'lan-offer-input';
  offerInput.rows = 3;
  offerInput.placeholder = '粘贴发送端的取件码';
  const btnAccept = button('lan-btn-accept', '生成应答码', 'wb-lan-wide');

  const recvCodeLabel = el('div', 'wb-lan-field-title', '应答码');
  const recvCode = el('textarea', 'text_pole wb-lan-code');
  recvCode.id = 'lan-recv-code';
  recvCode.readOnly = true;
  recvCode.rows = 3;
  recvCode.placeholder = '生成后复制给对方';
  const btnCopyRecv = button('lan-btn-copy-recv', '复制应答码', 'wb-lan-wide');

  const recvProgress = progressRow('lan-recv-progress');
  const recvStatus = el('div', 'wb-lan-status');
  recvStatus.id = 'lan-recv-status';

  const recvActions = el('div', 'wb-lan-actions');
  const btnAbandonRecv = button('lan-btn-abandon', '放弃半成品');
  btnAbandonRecv.hidden = true;
  recvActions.append(btnAbandonRecv);

  recvPane.append(recvPeer, offerLabel, offerInput, btnAccept,
    recvCodeLabel, recvCode, btnCopyRecv, recvProgress.root, recvStatus, recvActions);

  const btnClose = button('lan-btn-close', '关闭', 'wb-lan-wide');
  card.append(sendPane, recvPane, btnClose);
  overlay.append(card);
  root.appendChild(overlay);

  // ── 运行时状态 ──
  let pc = null;
  let channel = null;
  let selectedFile = null;
  let machine = createTransferMachine();
  let expiryTimer = null;

  function progressRow(id) {
    const rootEl = el('div', 'wb-lan-progress');
    rootEl.id = id;
    const phase = el('span', 'wb-lan-phase', '准备就绪');
    const bar = el('span', 'wb-lan-bar');
    const fill = el('span', 'wb-lan-fill');
    bar.append(fill);
    const pct = el('span', 'wb-lan-pct', '0%');
    const detail = el('span', 'wb-lan-detail', '');
    rootEl.append(phase, bar, pct, detail);
    return {
      root: rootEl,
      set(value, label, extra = '') {
        const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
        fill.style.width = `${v}%`;
        pct.textContent = `${v}%`;
        if (label) phase.textContent = label;
        detail.textContent = extra;
      },
    };
  }

  const setStatus = (node, text) => { node.textContent = text; };

  // ── 会话状态 ──
  let role = 'send';
  let sendState = 'idle';
  let recvState = 'idle';
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

  function closeSession() {
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    try { channel?.close(); } catch { /* 已关闭 */ }
    try { pc?.close(); } catch { /* 已关闭 */ }
    channel = null;
    pc = null;
    doneWaiter = null;
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

  const copyFrom = async (node, btn) => {
    const text = node.value || '';
    if (!text) return;
    let ok = true;
    try { await navigator.clipboard.writeText(text); } catch { ok = false; node.select?.(); }
    if (!ok || !btn) return;
    const original = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => { btn.textContent = original; }, 1200);
  };

  const showRole = (next) => {
    const isSend = next === 'send';
    sendPane.hidden = !isSend;
    recvPane.hidden = isSend;
    roleSend.classList.toggle('active', isSend);
    roleRecv.classList.toggle('active', !isSend);
    role = next;
  };
  roleSend.addEventListener('click', () => showRole('send'));
  roleRecv.addEventListener('click', () => showRole('recv'));

  // ── 发送端 ──
  const failSend = (message) => {
    sendState = 'failed';
    machine.fail(message);
    setStatus(sendStatus, `失败 ${message}`);
    sendProgress.set(0, '失败', '');
    btnRetrySend.hidden = false;
    btnRetrySend.textContent = '重试';
    btnCancelSend.hidden = true;
    try { channel?.close(); } catch { /* 已关闭 */ }
    try { pc?.close(); } catch { /* 已关闭 */ }
    channel = null;
    pc = null;
  };

  const bindSenderChannel = (dc) => {
    dc.onopen = () => { if (sendState !== 'failed') setStatus(sendStatus, '已连接'); };
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
  };

  const startSend = async (file) => {
    closeSession();
    machine = createTransferMachine();
    cancelRequested = false;
    sendState = 'waiting';
    selectedFile = file;
    sendPeerName.textContent = file.name;
    sendPeerMeta.textContent = `${formatBytes(file.size)} · ${fileIdentity(file)}`;
    btnRetrySend.hidden = true;
    btnCancelSend.hidden = false;
    btnApplyAnswer.disabled = false;
    sendCode.value = '';
    answerInput.value = '';
    sendProgress.set(0, '准备中', '');

    const local = new RTCPeerConnection({ iceServers: [] });
    pc = local;
    bindConnection(local, failSend);
    const dc = local.createDataChannel('pack', { ordered: true });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = LOW_WATER_MARK;
    channel = dc;
    bindSenderChannel(dc);

    machine.openPickup({ total: file.size, ttlMs: PICKUP_TTL_MS });
    setStatus(sendStatus, '等待对端接入');
    sendProgress.set(0, '等待对端', '');
    expiryTimer = setTimeout(() => {
      if (machine.isPickupValid()) failSend('取件码已过期');
    }, PICKUP_TTL_MS);

    const offer = await local.createOffer();
    await local.setLocalDescription(offer);
    await waitIceComplete(local);
    sendCode.value = await encodePickupCode(buildSignalPayload({
      role: 'offer',
      sdp: local.localDescription.sdp,
      file,
    }));
    dbg('offer ready', file.size, local.iceGatheringState);
    setStatus(sendStatus, '把取件码交给对方');
  };

  btnPick.addEventListener('click', () => sendPick.click());
  sendPick.addEventListener('change', () => {
    const file = sendPick.files && sendPick.files[0];
    sendPick.value = '';
    if (file) void startSend(file).catch((err) => failSend(err.message));
  });
  btnCopySend.addEventListener('click', () => void copyFrom(sendCode, btnCopySend));

  btnCancelSend.addEventListener('click', () => {
    cancelRequested = true;
    try { channel?.send(JSON.stringify({ t: 'cancel' })); } catch { /* 通道已断 */ }
    failSend('已取消');
  });

  btnRetrySend.addEventListener('click', () => {
    if (sendState === 'done' || !selectedFile) { sendPick.click(); return; }
    void startSend(selectedFile).catch((err) => failSend(err.message));
  });

  const sendFile = async (resumeFrom) => {
    const dc = channel;
    if (!dc) throw new Error('通道未建立');
    if (dc.readyState !== 'open') {
      const opened = await onceEvent(dc, 'open', OPEN_TIMEOUT_MS);
      if (!opened || dc.readyState !== 'open') throw new Error('通道未打开');
    }

    machine.start();
    sendState = 'sending';
    setStatus(sendStatus, '传输中');
    sendProgress.set(0, '传输中', '');
    btnCancelSend.hidden = false;
    btnRetrySend.hidden = true;

    const file = selectedFile;
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
    if (offset > 0) sendProgress.set(progressPercent(offset, total), '续传中', transferDetail(offset, total));

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
      sendProgress.set(progressPercent(offset, total), '传输中', transferDetail(offset, total));
    }

    dc.send(JSON.stringify({ t: 'done', bytes: total, digest }));
    dbg('send done', total);
    setStatus(sendStatus, '等待对端核对');
    sendProgress.set(100, '等待确认', `${formatBytes(total)}${digest ? ' · 摘要已发送' : ' · 仅核对大小'}`);

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

    machine.finish();
    sendState = 'done';
    setStatus(sendStatus, '已发送');
    sendProgress.set(100, '已完成', digest ? '摘要一致' : '仅核对大小');
    sendCode.value = '';
    answerInput.value = '';
    btnCancelSend.hidden = true;
    btnRetrySend.hidden = false;
    btnRetrySend.textContent = '再传一个';
    // 一次性：完成后立刻断开，旧码不再可用。
    try { channel?.close(); } catch { /* 已关闭 */ }
    try { pc?.close(); } catch { /* 已关闭 */ }
    channel = null;
    pc = null;
  };

  btnApplyAnswer.addEventListener('click', async () => {
    if (sendState === 'done') { setStatus(sendStatus, '已完成，再传请重新选择文件'); return; }
    if (!pc || !selectedFile) { setStatus(sendStatus, '先生成取件码'); return; }
    let payload = null;
    try {
      payload = readSignalPayload(await decodePickupCode(answerInput.value));
    } catch (err) {
      failSend(err.message);
      return;
    }
    if (payload.role !== 'answer') { failSend('不是应答码'); return; }
    try {
      machine.connecting();
      sendState = 'connecting';
      setStatus(sendStatus, '连接中');
      sendProgress.set(0, '连接中', '');
      btnApplyAnswer.disabled = true;
      await withTimeout(pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp }), 12_000, '应用应答码');
      await sendFile(payload.resumeFrom);
    } catch (err) {
      failSend(err.message);
    } finally {
      btnApplyAnswer.disabled = false;
    }
  });

  // ── 接收端 ──
  const failRecv = (message) => {
    // 失败可能由「sink 未就绪」「写链异常」「通道关闭」竞争触发；只认第一次。
    if (recvState === 'failed') return;
    recvState = 'failed';
    try { machine.fail(message); } catch { /* 已终态 */ }
    setStatus(recvStatus, `失败 ${message}`);
    recvProgress.set(0, '失败', incoming ? `已收 ${formatBytes(incoming.sink?.bytes || 0)}` : '');
    btnAccept.disabled = false;
    btnAbandonRecv.hidden = !incoming;
    try { channel?.close(); } catch { /* 已关闭 */ }
    channel = null;
  };

  const finishReceive = async (expectedBytes, expectedDigest) => {
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
    setStatus(recvStatus, verdict.digestChecked ? '已接收 · 摘要一致' : '已接收 · 仅核对大小');
    recvProgress.set(100, '已接收', `${formatBytes(blob.size)}${verdict.digestChecked ? ' · 摘要一致' : ''}`);
    btnAbandonRecv.hidden = true;
    btnAccept.disabled = false;
    incoming = null;
    // 一次性：完成即清空取件码并断开，旧码不再可用（先于入库，避免入库耗时让旧码继续可用）。
    offerInput.value = '';
    recvCode.value = '';
    try { channel?.close(); } catch { /* 已关闭 */ }
    try { pc?.close(); } catch { /* 已关闭 */ }
    channel = null;
    pc = null;
    try {
      if (typeof onReceive === 'function') await onReceive(blob, current.name);
    } catch (err) {
      setStatus(recvStatus, `已接收但入库失败 ${err.message}`);
    }
    void discardPartial(current.fileId);
  };

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
      const existing = partials.get(fileId);
      // 数据帧可能先于 OPFS 打开就到达（实测首 8 块被丢）：用 sinkReady 让写链等待，
      // **绝不丢弃**——丢了就是残缺包且校验只报「摘要不一致」，根因被掩盖。
      entry.sinkReady = (async () => {
        entry.sink = existing || (await opfsSink(fileId)) || memorySink();
        partials.set(fileId, entry.sink);
        dbg('recv sink', entry.sink.kind, entry.sink.bytes);
        recvPeerName.textContent = entry.name;
        recvPeerMeta.textContent = `${formatBytes(size)} · ${fileId}`;
        setStatus(recvStatus, entry.sink.bytes > 0 ? '续传中' : '接收中');
        recvProgress.set(progressPercent(entry.sink.bytes, size), entry.sink.bytes > 0 ? '续传中' : '接收中',
          `${formatBytes(entry.sink.bytes)} / ${formatBytes(size)}`);
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

  const bindReceiverChannel = (dc) => {
    dc.onopen = () => { if (recvState !== 'failed') setStatus(recvStatus, '已连接'); };
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
        recvProgress.set(progressPercent(bytes, current.size), '接收中', transferDetail(bytes, current.size));
        const now = Date.now();
        if (bytes - ackBytes >= ACK_THRESHOLD_BYTES || now - ackAt >= ACK_INTERVAL_MS) {
          ackBytes = bytes;
          ackAt = now;
          try { dc.send(JSON.stringify({ t: 'ack', bytes })); } catch { /* 通道已断 */ }
        }
      }).catch((err) => failRecv(err.message));
    };
  };

  btnAccept.addEventListener('click', async () => {
    closeSession();
    machine = createTransferMachine();
    recvState = 'connecting';
    btnAccept.disabled = true;
    btnAbandonRecv.hidden = true;
    recvCode.value = '';
    let payload = null;
    try {
      payload = readSignalPayload(await decodePickupCode(offerInput.value));
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
      recvCode.value = await encodePickupCode(buildSignalPayload({
        role: 'answer',
        sdp: local.localDescription.sdp,
        fileId,
        resumeFrom,
      }));
      recvPeerName.textContent = pendingOffer.name;
      recvPeerMeta.textContent = resumeFrom > 0
        ? `${formatBytes(pendingOffer.size)} · 续传 ${formatBytes(resumeFrom)}`
        : `${formatBytes(pendingOffer.size)} · ${fileId}`;
      setStatus(recvStatus, resumeFrom > 0 ? '把应答码回传，将从断点继续' : '把应答码回传给对方');
      recvProgress.set(progressPercent(resumeFrom, pendingOffer.size), '等待连接', '');
    } catch (err) {
      failRecv(err.message);
    }
  });

  btnCopyRecv.addEventListener('click', () => void copyFrom(recvCode, btnCopyRecv));

  btnAbandonRecv.addEventListener('click', async () => {
    const fileId = incoming?.fileId || pendingOffer?.fileId;
    if (!fileId) return;
    closeSession();
    partials.delete(fileId);
    await discardPartial(fileId);
    incoming = null;
    recvState = 'idle';
    btnAbandonRecv.hidden = true;
    btnAccept.disabled = false;
    recvProgress.set(0, '已放弃', '');
    setStatus(recvStatus, '半成品已丢弃');
  });

  // ── 生命周期 ──
  btnClose.addEventListener('click', () => close());
  btnCloseTop.addEventListener('click', () => close());

  const onKey = (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey);

  const onPageHide = () => closeSession();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  function open() {
    overlay.hidden = false;
    showRole(role);
    if (!capability.direct) {
      setStatus(sendStatus, capability.reason);
      setStatus(recvStatus, capability.reason);
      btnPick.disabled = true;
      btnAccept.disabled = true;
      btnApplyAnswer.disabled = true;
    }
  }

  function close() {
    overlay.hidden = true;
    closeSession();
    sendCode.value = '';
    answerInput.value = '';
    if (sendState !== 'sending') sendState = 'idle';
    recvState = 'idle';
    btnCancelSend.hidden = true;
    btnRetrySend.hidden = true;
    btnAbandonRecv.hidden = !incoming;
  }

  function destroy() {
    document.removeEventListener('keydown', onKey);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
    closeSession();
    overlay.remove();
  }

  return { open, close, destroy };
}
