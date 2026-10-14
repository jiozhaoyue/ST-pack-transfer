/**
 * 局域网互传 · 纯逻辑核心（无 DOM / 无网络 / 无 WebRTC）
 *
 * 分层（L1-MR-6）：本文件必须能在 Node/Vitest 直接跑，故不碰 `window` / `RTCPeerConnection` /
 * `document`。浏览器侧装配在 `src/ui/lan-transfer-panel.js`。
 *
 * 参考实现取长补短（2026-10-14 取证）：
 *   · Luker（`src/sync/*`）——一次性配对链接、按条目核对、连不上/认证失败分别报错；
 *   · TauriTavern（`tt-adapter-sync/src/sync/lan/*`）——阶段+进度事件、能力协商、原子落盘、自然续传。
 * **不照搬的**：两者都是「本机起 HTTP 服务、对端连过来」。本插件纯前端，浏览器**不能监听端口**，
 * 故核心换成 WebRTC DataChannel（已实测：无 STUN 时 mDNS 候选可用、DataChannel 可开、32KB 消息可达）。
 *
 * 会话模型＝**一次性取件码**（用户裁定）：传输完成或超时即失效，不留配对记录。
 */

/** 取件码版本前缀。换编码格式时改这个值，旧码自然失效。 */
export const PICKUP_PREFIX = 'SZC1';

/** 取件码默认有效期（毫秒）。 */
export const PICKUP_TTL_MS = 10 * 60 * 1000;

/** DataChannel 单条消息上限保守值：Chrome 实测 `maxMessageSize` 因实现而异，64KB 稳妥。 */
export const CHUNK_SIZE = 64 * 1024;

/** 传输阶段（与 TT 的 phase 语义对齐：阶段 + 进度）。 */
export const TRANSFER_PHASES = Object.freeze({
  IDLE: 'idle',
  WAITING: 'waiting',
  CONNECTING: 'connecting',
  TRANSFERRING: 'transferring',
  DONE: 'done',
  FAILED: 'failed',
});

// ─────────────────────────────────────────────────────────────────────────────
// 取件码编解码
// ─────────────────────────────────────────────────────────────────────────────

/** base64url 编码（无填充）。浏览器与 Node 共用，避免依赖 Buffer。 */
export function toBase64Url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : (typeof Buffer !== 'undefined' ? Buffer.from(arr).toString('base64') : '');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url 解码 → Uint8Array。 */
export function fromBase64Url(text) {
  const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(padded, 'base64'));
  throw new Error('无 base64 解码能力');
}

const utf8Encode = (s) => (typeof TextEncoder !== 'undefined'
  ? new TextEncoder().encode(s)
  : new Uint8Array(Buffer.from(s, 'utf8')));

const utf8Decode = (b) => (typeof TextDecoder !== 'undefined'
  ? new TextDecoder().decode(b)
  : Buffer.from(b).toString('utf8'));

/**
 * deflate 压缩（可用时）。`CompressionStream` 在浏览器与 Node 18+ 都存在，
 * 但**不作为硬依赖**——缺失时返回 null，调用方走未压缩路径。
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array|null>}
 */
async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** deflate 解压（可用时）。 */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * 把信令负载编成一次性取件码。
 *
 * 格式：`<PREFIX>.<flags>.<payload>`
 *   flags = `z`（已 deflate）或 `n`（原样）
 * SDP 含大量重复行，deflate 后通常压到三成左右；压缩不可用时原样携带，功能不缺。
 *
 * @param {object} payload 信令负载（如 `{ role, sdp, name }`）
 * @returns {Promise<string>}
 */
export async function encodePickupCode(payload) {
  const json = JSON.stringify(payload ?? {});
  const raw = utf8Encode(json);
  const packed = await deflateRaw(raw);
  if (packed) return `${PICKUP_PREFIX}.z.${toBase64Url(packed)}`;
  return `${PICKUP_PREFIX}.n.${toBase64Url(raw)}`;
}

/**
 * 解析取件码。**任何形态错误都抛**——静默返回空对象会让用户拿着坏码一路走到超时。
 *
 * @param {string} code
 * @returns {Promise<object>}
 */
export async function decodePickupCode(code) {
  const text = String(code ?? '').trim();
  if (!text) throw new Error('取件码为空');
  const parts = text.split('.');
  if (parts.length !== 3 || parts[0] !== PICKUP_PREFIX) {
    throw new Error('取件码格式不对');
  }
  const [, flags, body] = parts;
  const bytes = fromBase64Url(body);
  if (flags === 'n') return JSON.parse(utf8Decode(bytes));
  if (flags !== 'z') throw new Error(`取件码标志位不认识：${flags}`);
  const inflated = await inflateRaw(bytes);
  if (!inflated) throw new Error('本环境不支持解压取件码');
  return JSON.parse(utf8Decode(inflated));
}

// ─────────────────────────────────────────────────────────────────────────────
// 分块与进度
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 把总字节数切成块数。总长为 0 时返回 0（空包不该产生一个空块）。
 * @param {number} totalBytes
 * @param {number} [chunkSize]
 */
export function chunkCount(totalBytes, chunkSize = CHUNK_SIZE) {
  const total = Number(totalBytes) || 0;
  if (total <= 0) return 0;
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) throw new Error('块大小非法');
  return Math.ceil(total / chunkSize);
}

/**
 * 计算下一个要发的块区间。纯函数，便于断点续传复用。
 * @param {number} index 0 基块下标
 * @param {number} totalBytes
 * @param {number} [chunkSize]
 * @returns {{start: number, end: number} | null} end 为**开区间**；越界返回 null
 */
export function chunkRange(index, totalBytes, chunkSize = CHUNK_SIZE) {
  const total = Number(totalBytes) || 0;
  const start = index * chunkSize;
  if (index < 0 || start >= total) return null;
  return { start, end: Math.min(start + chunkSize, total) };
}

/**
 * 进度读数（0–100，一位小数）。总长为 0 时按 100 处理——空包直接算完成。
 * @param {number} sentBytes
 * @param {number} totalBytes
 */
export function progressPercent(sentBytes, totalBytes) {
  const total = Number(totalBytes) || 0;
  if (total <= 0) return 100;
  const sent = Math.min(Math.max(Number(sentBytes) || 0, 0), total);
  return Math.round((sent / total) * 1000) / 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// 传输状态机（纯）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 一次性传输的状态机。
 *
 * **一次性**（用户裁定）：完成或失败即终态；取件码在终态后失效，不提供「重新连接」——
 * 重传要走一次全新的取件码，避免留下长期可用的配对通道。
 *
 * @param {{now?: () => number}} [opts]
 */
export function createTransferMachine({ now = () => Date.now() } = {}) {
  let phase = TRANSFER_PHASES.IDLE;
  let totalBytes = 0;
  let sentBytes = 0;
  let receivedBytes = 0;
  let error = '';
  let expiresAt = 0;

  const guard = (allowed) => {
    if (!allowed.includes(phase)) {
      throw new Error(`状态 ${phase} 不允许该操作`);
    }
  };

  return {
    getState: () => ({ phase, totalBytes, sentBytes, receivedBytes, error, expiresAt }),

    /** 生成取件码后进入等待接入。 */
    openPickup({ total = 0, ttlMs = PICKUP_TTL_MS } = {}) {
      guard([TRANSFER_PHASES.IDLE]);
      phase = TRANSFER_PHASES.WAITING;
      totalBytes = Number(total) || 0;
      expiresAt = now() + ttlMs;
      return this.getState();
    },

    /** 对端已接入，开始握手。 */
    connecting() {
      guard([TRANSFER_PHASES.WAITING, TRANSFER_PHASES.IDLE]);
      phase = TRANSFER_PHASES.CONNECTING;
      return this.getState();
    },

    /** 通道打开，进入传输。 */
    start() {
      guard([TRANSFER_PHASES.CONNECTING]);
      phase = TRANSFER_PHASES.TRANSFERRING;
      return this.getState();
    },

    /** 发送端上报已发出字节数。 */
    advanceSent(bytes) {
      guard([TRANSFER_PHASES.TRANSFERRING]);
      sentBytes = Math.min(sentBytes + (Number(bytes) || 0), totalBytes);
      return this.getState();
    },

    /** 接收端上报已收字节数。 */
    advanceReceived(bytes) {
      guard([TRANSFER_PHASES.TRANSFERRING]);
      receivedBytes = Math.min(receivedBytes + (Number(bytes) || 0), totalBytes);
      return this.getState();
    },

    finish() {
      guard([TRANSFER_PHASES.TRANSFERRING]);
      phase = TRANSFER_PHASES.DONE;
      return this.getState();
    },

    fail(message) {
      if (phase === TRANSFER_PHASES.DONE) return this.getState();
      phase = TRANSFER_PHASES.FAILED;
      error = String(message ?? '');
      return this.getState();
    },

    /** 取件码是否已过期（等待/连接阶段才有意义）。 */
    isExpired() {
      if (!expiresAt) return false;
      return now() > expiresAt;
    },

    /** 取件码是否仍然可用：只在等待接入阶段且未过期。 */
    isPickupValid() {
      return phase === TRANSFER_PHASES.WAITING && !this.isExpired();
    },

    percent: () => (phase === TRANSFER_PHASES.TRANSFERRING || phase === TRANSFER_PHASES.DONE
      ? progressPercent(sentBytes || receivedBytes, totalBytes)
      : 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 传输核对（借鉴 Luker 的「按条目数核对」）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 核对接收端与源端是否一致。
 *
 * 只看**条目数与总字节数**：这是纯前端能拿到的最强证据。
 * 逐条哈希需要源端把每条的摘要也传过去，属后续增强，本轮不做——**不谎称做了**。
 *
 * @param {{files?: number, bytes?: number}} source
 * @param {{files?: number, bytes?: number}} received
 * @returns {{ok: boolean, reason: string}}
 */
export function verifyTransfer(source = {}, received = {}) {
  const sf = Number(source.files) || 0;
  const rf = Number(received.files) || 0;
  if (sf !== rf) return { ok: false, reason: `条目数不一致 ${sf} ≠ ${rf}` };
  const sb = Number(source.bytes) || 0;
  const rb = Number(received.bytes) || 0;
  if (sb !== rb) return { ok: false, reason: `字节数不一致 ${sb} ≠ ${rb}` };
  return { ok: true, reason: '' };
}

/**
 * 当前环境能否直连。
 *
 * WebRTC 要求**安全上下文**：`https` 或 `localhost` 可用；
 * 用 `http://<局域网IP>` 访问酒馆时**不是**安全上下文，`RTCPeerConnection` 会被拒。
 * 这条不是猜测——浏览器规范如此，且必须**如实告诉用户**，不能假装能连。
 *
 * @param {object} [env] 便于测试注入
 * @param {boolean} [env.isSecureContext]
 * @param {boolean} [env.hasRTC]
 * @returns {{direct: boolean, reason: string}}
 */
export function probeDirectCapability(env = {}) {
  const secure = env.isSecureContext !== undefined
    ? env.isSecureContext
    : (typeof window !== 'undefined' && Boolean(window.isSecureContext));
  const hasRtc = env.hasRTC !== undefined
    ? env.hasRTC
    : (typeof RTCPeerConnection === 'function');

  if (!hasRtc) return { direct: false, reason: '本浏览器不支持直连' };
  if (!secure) return { direct: false, reason: '当前地址不是安全上下文' };
  return { direct: true, reason: '' };
}
