/**
 * 二维码适配器（正式侧）
 *
 * 编码：**静态 ESM 导入**本地 `qrcode-generator`（vendor 末尾追加了 `export default qrcode`）。
 * 不再向 `document.head` 注入 classic script——宿主里其它扩展可能占用 `window.qrcode`，
 * 或 CSP 拒绝动态脚本，旧实现会静默返回空串，导致局域网互传不显示二维码（2026-11-17 事故）。
 *
 * 解码：jsQR 仍是 UMD，只在扫码时以 classic `<script>` 注入；失败由调用方如实提示，
 * 不影响「生成二维码 / 复制取件码」主路径。
 */

import qrcodeFactory from '../vendor/qrcode-generator.js';
import { t } from '../i18n/index.js';
import { PICKUP_PREFIX } from '../core/lan-transfer.js';

/** 扫码识别框判定：文本是否本工具的局域网取件码（`SZC1.<flag>.<body>`）。 */
export function isOurCode(text) {
  return typeof text === 'string' && text.startsWith(`${PICKUP_PREFIX}.`);
}

const VENDOR = {
  decode: new URL('../vendor/jsqr.js', import.meta.url),
};

let loading = null;

/** 编码器是否可用（纯 ESM，恒可用；保留函数供调用方显式判断）。 */
export function encodeReady() {
  return typeof qrcodeFactory === 'function';
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error(t('qr.noDocument'))); return; }
    const script = document.createElement('script');
    script.src = url.href;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(t('qr.loadFailed')));
    // dom-scope:allow classic vendor 脚本必须挂到 document.head 才能得到全局 window.qrcode / window.jsQR；文件为本仓本地副本，不写宿主节点
    document.head.appendChild(script);
  });
}

/** 确保扫码解码库就绪；失败后允许下次重试。生成二维码不依赖本函数。 */
export function ready() {
  if (typeof window === 'undefined') return Promise.reject(new Error(t('qr.noWindow')));
  if (typeof window.jsQR === 'function') return Promise.resolve();
  if (loading) return loading;
  loading = loadScript(VENDOR.decode).then(() => {
    if (typeof window.jsQR !== 'function') throw new Error(t('qr.decodeUnavailable'));
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** 同步生成 SVG；编码失败返回空串，调用方据此显示明确占位（粘贴始终可用）。 */
export function encodeSvg(text) {
  if (typeof qrcodeFactory !== 'function') return '';
  try {
    // 纠错等级 L：容量最大，避免长取件码在 M 级直接溢出（版本 40-L 可容纳约 2.9 KB）。
    const q = qrcodeFactory(0, 'L');
    q.addData(String(text || ''));
    q.make();
    return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
  } catch {
    return '';
  }
}

/**
 * 调摄像头扫二维码。返回停止函数；任何失败都经 `onError` 如实上报，
 * 粘贴输入不受影响。所有等待/循环都有明确出口。
 */
export async function scan({ video, canvas, onResult, onError, onDetect, signal } = {}) {
  if (signal?.aborted) return () => {};
  try {
    await ready();
  } catch (err) {
    onError?.(err?.message || t('qr.unavailable'));
    return () => {};
  }
  if (signal?.aborted) return () => {};
  if (!video || !canvas) {
    onError?.(t('qr.canvasUnavailable'));
    return () => {};
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    onError?.(t('qr.cameraUnsupported'));
    return () => {};
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    onError?.(t('qr.cameraFailed', { msg: err?.message || t('qr.permissionDenied') }));
    return () => {};
  }

  if (signal?.aborted) {
    try { stream?.getTracks().forEach((track) => track.stop()); } catch {}
    try { video.srcObject = null; } catch {}
    return () => {};
  }

  video.srcObject = stream;
  await video.play().catch(() => {});

  if (signal?.aborted) {
    try { stream?.getTracks().forEach((track) => track.stop()); } catch {}
    try { video.srcObject = null; } catch {}
    try { video.pause(); } catch {}
    return () => {};
  }

  let stopped = false;
  let raf = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    try { stream?.getTracks().forEach((track) => track.stop()); } catch { /* 已停止 */ }
    try { video.srcObject = null; } catch { /* 已失效 */ }
    try { video.pause(); } catch {}
  };

  if (signal) {
    signal.addEventListener('abort', stop, { once: true });
  }

  const tick = () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width && height) {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        const hit = window.jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
        if (hit?.data) {
          /* 每帧命中都上报，驱动识别框三态提示。onDetect 返回 false 表示"非本工具码，继续扫"；
             未传 onDetect 或返回非 false 则接受：停流 + onResult（保持旧行为的即时跳出）。 */
          const accept = onDetect ? onDetect(hit.data) !== false : true;
          if (!accept) {
            raf = requestAnimationFrame(tick);
            return;
          }
          stop();
          onResult?.(hit.data);
          return;
        }
      }
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return stop;
}

export const qr = { ready, encodeReady, encodeSvg, scan, isOurCode };
