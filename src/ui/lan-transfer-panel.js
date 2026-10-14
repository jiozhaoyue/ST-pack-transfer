/**
 * 局域网互传面板（2026-10-14）。
 *
 * 纯前端直连：**WebRTC DataChannel**。浏览器不能监听端口，故 Luker/TT 那种
 * 「本机起 HTTP 服务、对端连过来」的形态无法照搬（见 `src/core/lan-transfer.js` 头部说明）。
 *
 * 会话模型＝**一次性取件码**（用户裁定）：传输完成或超时即失效，不留配对记录。
 *
 * 信令是**两跳手工交换**（无服务器时的唯一可行形态）：
 *   发送端 → 取件码（含 offer） → 接收端
 *   接收端 → 应答码（含 answer） → 发送端
 * 装了 Authority 时可换成中继把两跳并成一跳，本轮不做——**不谎称已是一步**。
 *
 * 文案纪律：无括号说明、无分号、无长句、无解释。
 */

import {
  CHUNK_SIZE,
  PICKUP_TTL_MS,
  createTransferMachine,
  decodePickupCode,
  encodePickupCode,
  probeDirectCapability,
  progressPercent,
  verifyTransfer,
} from '../core/lan-transfer.js';

/** 发送端在数据通道上先发一条 JSON 头，再发二进制块。 */
const HEADER_KIND = 'szc-header';

/** 等 ICE 收集完成的兜底上限（毫秒）。 */
const ICE_TIMEOUT_MS = 6000;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(id, label) {
  const b = el('button', 'menu_button');
  b.type = 'button';
  b.id = id;
  b.textContent = label;
  return b;
}

/** 等 ICE 收集完（非 trickle）。这正是二维码/取件码信令的真实形态。 */
function waitIceComplete(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, ICE_TIMEOUT_MS);
  });
}

/**
 * 装配互传面板。
 *
 * @param {object} params
 * @param {ParentNode} params.root 工作台根容器
 * @param {(blob: Blob, name: string) => void} [params.onReceive] 接收完成回调
 * @returns {{open: Function, close: Function, destroy: Function} | null}
 */
export function mountLanTransferPanel({ root, onReceive = null } = {}) {
  if (!root || typeof document === 'undefined') return null;

  const capability = probeDirectCapability();

  const overlay = el('div', 'wb-lan-overlay');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const card = el('div', 'wb-lan-card');
  card.append(el('div', 'wb-lan-title', '局域网互传'));

  if (!capability.direct) {
    card.append(el('div', 'wb-lan-note', capability.reason));
    card.append(el('div', 'wb-lan-note', '请改用导出文件再手动传入'));
  }

  // ── 发送 ──
  const sendSec = el('section', 'wb-lan-sec');
  sendSec.append(el('div', 'wb-lan-sec-title', '发送'));
  const sendPick = el('input');
  sendPick.type = 'file';
  sendPick.id = 'lan-send-file';
  sendPick.hidden = true;
  const btnPick = button('lan-btn-pick', '选择文件');
  const sendCode = el('textarea', 'text_pole wb-lan-code');
  sendCode.id = 'lan-send-code';
  sendCode.readOnly = true;
  sendCode.rows = 3;
  const btnCopySend = button('lan-btn-copy-send', '复制取件码');
  const answerInput = el('textarea', 'text_pole wb-lan-code');
  answerInput.id = 'lan-answer-input';
  answerInput.rows = 3;
  answerInput.placeholder = '粘贴应答码';
  const btnApplyAnswer = button('lan-btn-apply-answer', '开始传输');
  const sendStatus = el('div', 'wb-lan-status');
  sendStatus.id = 'lan-send-status';
  sendSec.append(sendPick, btnPick, sendCode, btnCopySend, answerInput, btnApplyAnswer, sendStatus);

  // ── 接收 ──
  const recvSec = el('section', 'wb-lan-sec');
  recvSec.append(el('div', 'wb-lan-sec-title', '接收'));
  const offerInput = el('textarea', 'text_pole wb-lan-code');
  offerInput.id = 'lan-offer-input';
  offerInput.rows = 3;
  offerInput.placeholder = '粘贴取件码';
  const btnAccept = button('lan-btn-accept', '生成应答码');
  const recvCode = el('textarea', 'text_pole wb-lan-code');
  recvCode.id = 'lan-recv-code';
  recvCode.readOnly = true;
  recvCode.rows = 3;
  const btnCopyRecv = button('lan-btn-copy-recv', '复制应答码');
  const recvStatus = el('div', 'wb-lan-status');
  recvStatus.id = 'lan-recv-status';
  recvSec.append(offerInput, btnAccept, recvCode, btnCopyRecv, recvStatus);

  const btnClose = button('lan-btn-close', '关闭');
  card.append(sendSec, recvSec, btnClose);
  overlay.append(card);
  root.appendChild(overlay);

  // ── 运行时状态 ──
  let pc = null;
  let channel = null;
  let selectedFile = null;
  let machine = createTransferMachine();
  let expiryTimer = null;

  const setStatus = (node, text) => { node.textContent = text; };

  const teardown = () => {
    if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
    try { channel?.close(); } catch { /* 已关闭 */ }
    try { pc?.close(); } catch { /* 已关闭 */ }
    channel = null;
    pc = null;
    machine = createTransferMachine();
  };

  const copyFrom = async (node) => {
    const text = node.value || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      node.select?.();
    }
  };

  // ── 发送端 ──
  const startSend = async (file) => {
    teardown();
    selectedFile = file;
    const local = new RTCPeerConnection({ iceServers: [] });
    pc = local;
    const dc = local.createDataChannel('pack');
    dc.binaryType = 'arraybuffer';
    channel = dc;

    machine.openPickup({ total: file.size, ttlMs: PICKUP_TTL_MS });
    setStatus(sendStatus, '等待对端');
    expiryTimer = setTimeout(() => {
      if (machine.isPickupValid()) {
        machine.fail('取件码已过期');
        setStatus(sendStatus, '取件码已过期');
        teardown();
      }
    }, PICKUP_TTL_MS);

    const offer = await local.createOffer();
    await local.setLocalDescription(offer);
    await waitIceComplete(local);

    sendCode.value = await encodePickupCode({
      role: 'offer',
      sdp: local.localDescription.sdp,
    });
    setStatus(sendStatus, '把取件码给对方');
  };

  btnPick.addEventListener('click', () => sendPick.click());
  sendPick.addEventListener('change', () => {
    const file = sendPick.files && sendPick.files[0];
    if (file) void startSend(file);
  });
  btnCopySend.addEventListener('click', () => void copyFrom(sendCode));

  btnApplyAnswer.addEventListener('click', async () => {
    if (!pc) { setStatus(sendStatus, '先生成取件码'); return; }
    try {
      const payload = await decodePickupCode(answerInput.value);
      if (payload.role !== 'answer' || !payload.sdp) throw new Error('不是应答码');
      machine.connecting();
      setStatus(sendStatus, '连接中');
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      await sendFile();
    } catch (err) {
      machine.fail(err.message);
      setStatus(sendStatus, `失败 ${err.message}`);
    }
  });

  const sendFile = async () => {
    const dc = channel;
    if (!dc) { setStatus(sendStatus, '通道未建立'); return; }
    if (dc.readyState !== 'open') {
      await new Promise((resolve) => {
        dc.addEventListener('open', resolve, { once: true });
        setTimeout(resolve, 10000);
      });
    }
    if (dc.readyState !== 'open') {
      machine.fail('通道未打开');
      setStatus(sendStatus, '通道未打开');
      return;
    }

    machine.start();
    setStatus(sendStatus, '传输中 0%');
    dc.send(JSON.stringify({
      kind: HEADER_KIND,
      name: selectedFile.name,
      size: selectedFile.size,
    }));

    const buffer = await selectedFile.arrayBuffer();
    const view = new Uint8Array(buffer);
    let offset = 0;
    const HWM = CHUNK_SIZE * 8;

    while (offset < view.length) {
      if (dc.bufferedAmount > HWM) {
        await new Promise((resolve) => {
          dc.addEventListener('bufferedamountlow', resolve, { once: true });
          setTimeout(resolve, 200);
        });
        continue;
      }
      const end = Math.min(offset + CHUNK_SIZE, view.length);
      dc.send(view.subarray(offset, end));
      machine.advanceSent(end - offset);
      offset = end;
      setStatus(sendStatus, `传输中 ${progressPercent(offset, view.length)}%`);
    }

    dc.send(JSON.stringify({ kind: 'szc-done' }));
    machine.finish();
    setStatus(sendStatus, '已发送');
  };

  // ── 接收端 ──
  btnAccept.addEventListener('click', async () => {
    teardown();
    try {
      const payload = await decodePickupCode(offerInput.value);
      if (payload.role !== 'offer' || !payload.sdp) throw new Error('不是取件码');

      const local = new RTCPeerConnection({ iceServers: [] });
      pc = local;
      local.ondatachannel = (event) => {
        channel = event.channel;
        channel.binaryType = 'arraybuffer';
        wireReceiver(channel);
      };

      await local.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      const answer = await local.createAnswer();
      await local.setLocalDescription(answer);
      await waitIceComplete(local);

      recvCode.value = await encodePickupCode({
        role: 'answer',
        sdp: local.localDescription.sdp,
      });
      setStatus(recvStatus, '把应答码给对方');
    } catch (err) {
      setStatus(recvStatus, `失败 ${err.message}`);
    }
  });

  btnCopyRecv.addEventListener('click', () => void copyFrom(recvCode));

  let incoming = null;

  const wireReceiver = (dc) => {
    dc.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.kind === HEADER_KIND) {
          incoming = { name: msg.name || 'received.zip', size: Number(msg.size) || 0, parts: [] };
          machine.openPickup({ total: incoming.size });
          machine.connecting();
          machine.start();
          setStatus(recvStatus, '接收中 0%');
          return;
        }
        if (msg.kind === 'szc-done' && incoming) {
          const blob = new Blob(incoming.parts);
          const verdict = verifyTransfer(
            { files: 1, bytes: incoming.size },
            { files: 1, bytes: blob.size },
          );
          machine.finish();
          if (!verdict.ok) {
            setStatus(recvStatus, `核对失败 ${verdict.reason}`);
            return;
          }
          if (typeof onReceive === 'function') onReceive(blob, incoming.name);
          setStatus(recvStatus, '已接收');
          incoming = null;
        }
        return;
      }
      // 二进制块
      if (!incoming) return;
      const chunk = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data;
      incoming.parts.push(chunk);
      machine.advanceReceived(chunk.byteLength || chunk.length || 0);
      setStatus(recvStatus, `接收中 ${progressPercent(machine.getState().receivedBytes, incoming.size)}%`);
    });
  };

  btnClose.addEventListener('click', () => close());

  const onKey = (event) => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey);

  function open() {
    overlay.hidden = false;
    if (!capability.direct) {
      setStatus(sendStatus, capability.reason);
      setStatus(recvStatus, capability.reason);
    }
  }

  function close() {
    overlay.hidden = true;
    teardown();
  }

  function destroy() {
    document.removeEventListener('keydown', onKey);
    teardown();
    overlay.remove();
  }

  return { open, close, destroy };
}
