/**
 * Vue 3 渐进式挂载适配器（特性检测 + 静默降级）
 *
 * 设计约束：
 * 1. 绝不破坏纯前端主路径：Vue / .vue 组件一律动态 import 并包 try/catch，
 *    Node / Vitest 下仅 import 本模块不会解析 .vue，零回归；
 * 2. 响应式数据源统一走 store（inspectModalOpen / inspectReport），组件不自行持有状态；
 * 3. 容器为空、非浏览器、Vue 不可用等场景一律返回 null 且仅 console.warn 一次。
 */
import { store, openInspectModal, closeInspectModal } from './store.js';

let app = null;
let mountedHandle = null;
let pendingMount = null;
let warned = false;

function warnOnce(message) {
  if (warned) return;
  warned = true;
  try { console.warn(message); } catch { /* 忽略控制台不可用 */ }
}

function safeCall(fn, ...args) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(...args); } catch { return undefined; }
}

function isBrowserEnv() {
  try {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * 解析挂载容器：
 * - 传入 DOM 节点则直接用；
 * - 传入选择器字符串则 querySelector；
 * - 未传则创建一个独立 div 挂到 body（避免 Vue mount 清空页面既有内容）。
 */
function resolveContainer(container) {
  try {
    if (container && typeof container.appendChild === 'function') return { host: container, autoCreated: false };
    if (typeof container === 'string' && typeof document !== 'undefined') {
      const found = document.querySelector(container);
      return found ? { host: found, autoCreated: false } : null;
    }
    if (!container && typeof document !== 'undefined') {
      const el = document.createElement('div');
      // dom-scope:allow 体检弹窗容器需为 body 直系子节点才能全屏覆盖宿主，随 unmount 一并移除
      document.body.appendChild(el);
      return { host: el, autoCreated: true };
    }
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 挂载体检报告模态。
 * @param {object} options
 * @param {Element|string} [options.container] 挂载容器，缺省时自建独立容器
 * @param {Function} [options.getReport] 读取 report 的回调
 * @param {Function} [options.canSave] 是否允许存入工作区的守卫
 * @param {Function} [options.onSaveToWorkspace] 存入工作区回调
 * @param {Function} [options.onClose] 关闭回调
 * @returns {Promise<{unmount:Function}|null>} 挂载句柄或 null（静默降级）
 */
export async function mountInspectModal(options = {}) {
  const { getReport, canSave, onSaveToWorkspace, onClose } = options;

  // 无论是否已挂载，先把最新 report 写进响应式 store（满足「已挂载只更新 store」语义）。
  const report = safeCall(getReport);
  try { openInspectModal(report); } catch { /* store 异常不向上冒泡 */ }

  // 已挂载：store 已在上方更新，直接复用句柄（此判断放在任何 await 之前）。
  if (mountedHandle) return mountedHandle;
  // 并发守卫：首个调用尚未 resolve 时，后续调用复用同一个 in-flight Promise，
  // 避免两次 createApp 造成重复挂载与 unmount 泄漏。
  if (pendingMount) return pendingMount;

  pendingMount = (async () => {
    try {
      if (!isBrowserEnv()) { warnOnce('[vue-mount] non-browser env, InspectModal skipped'); return null; }

      const resolved = resolveContainer(options.container);
      if (!resolved) { warnOnce('[vue-mount] mount container not found, InspectModal skipped'); return null; }
      const { host, autoCreated } = resolved;

      const [{ createApp, h }, { default: InspectModal }] = await Promise.all([
        import('vue'),
        import('./InspectModal.vue'),
      ]);

      const Root = {
        setup() {
          return () => h(InspectModal, {
            isOpen: store.inspectModalOpen,
            report: store.inspectReport || report,
            title: '',
            onClose: () => {
              try { closeInspectModal(); } catch { /* 忽略 */ }
              safeCall(onClose);
            },
            onSaveToWorkspace: (payload) => {
              if (safeCall(canSave, payload) === false) return;
              safeCall(onSaveToWorkspace, payload);
            },
          });
        },
      };

      app = createApp(Root);
      app.mount(host);

      mountedHandle = {
        unmount() {
          try { app?.unmount(); } catch { /* 忽略 */ }
          app = null;
          mountedHandle = null;
          // 自建容器必须一并移除，否则反复挂载会在 body 累积空 div。
          if (autoCreated) { try { host.remove(); } catch { /* 忽略 */ } }
          try { closeInspectModal(); } catch { /* 忽略 */ }
        },
      };
      return mountedHandle;
    } catch (err) {
      const message = String(err?.message || err);
      // Only expected degradations (dynamic import resolution failures) use the
      // one-shot warning; real mount exceptions must surface on every attempt.
      const isExpectedDegradation =
        err?.code === 'MODULE_NOT_FOUND' ||
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Cannot find module') ||
        message.includes('Failed to resolve module specifier');
      if (isExpectedDegradation) {
        warnOnce('[vue-mount] Vue unavailable or import failed, degraded silently: ' + message);
      } else {
        try { console.warn('[vue-mount] InspectModal mount failed: ' + message); } catch { /* 忽略控制台不可用 */ }
      }
      return null;
    } finally {
      pendingMount = null;
    }
  })();

  return pendingMount;
}
