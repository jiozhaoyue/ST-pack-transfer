/**
 * 二维码适配器（正式侧）
 *
 * `qrcode-generator` 是普通脚本：顶层 `var qrcode` 在 ES module 里不会挂到 window，
 * 所以这里以 classic `<script>` 注入本地 vendor（与 demo 的加载方式一致）。
 * jsQR 是 UMD，同样以 classic 注入；两者都是本地文件，无 CDN。
 */

const VENDOR = {
  encode: new URL('../vendor/qrcode-generator.js', import.meta.url),
  decode: new URL('../vendor/jsqr.js', import.meta.url),
};

let loading = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('无 document')); return; }
    const script = document.createElement('script');
    script.src = url.href;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('二维码库加载失败'));
    // dom-scope:allow classic vendor 脚本必须挂到 document.head 才能得到全局 window.qrcode / window.jsQR；文件为本仓本地副本，不写宿主节点
    document.head.appendChild(script);
  });
}

/** 确保编码 / 解码库都已就绪；失败后允许下次重试。 */
export function ready() {
  if (typeof window === 'undefined') return Promise.reject(new Error('无 window'));
  if (typeof window.qrcode === 'function' && typeof window.jsQR === 'function') return Promise.resolve();
  if (loading) return loading;
  loading = Promise.all([
    typeof window.qrcode === 'function' ? null : loadScript(VENDOR.encode),
    typeof window.jsQR === 'function' ? null : loadScript(VENDOR.decode),
  ]).then(() => {
    if (typeof window.qrcode !== 'function') throw new Error('二维码编码库不可用');
    if (typeof window.jsQR !== 'function') throw new Error('二维码解码库不可用');
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** 同步生成 SVG；库未就绪时返回空串，由调用方隐藏二维码（粘贴始终可用）。 */
export function encodeSvg(text) {
  if (typeof window === 'undefined' || typeof window.qrcode !== 'function') return '';
  try {
    const q = window.qrcode(0, 'M');
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
export async function scan({ video, canvas, onResult, onError } = {}) {
  try {
    await ready();
  } catch (err) {
    onError?.(err?.message || '二维码库不可用');
    return () => {};
  }
  if (!video || !canvas) {
    onError?.('扫码画布不可用');
    return () => {};
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    onError?.('当前环境不支持摄像头');
    return () => {};
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    onError?.('相机不可用：' + (err?.message || '权限被拒绝'));
    return () => {};
  }

  video.srcObject = stream;
  await video.play().catch(() => {});

  let stopped = false;
  let raf = 0;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    try { stream.getTracks().forEach((track) => track.stop()); } catch { /* 已停止 */ }
    try { video.srcObject = null; } catch { /* 已失效 */ }
  };

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

export const qr = { ready, encodeSvg, scan };
