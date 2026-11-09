/**
 * 从宿主拉取的入口编排（顺序契约）
 *
 * 用户裁定（2026-11-09）：点「从宿主拉取」的顺序必须是
 * **流量警告 → 原生界面操作指引 → 打开原生界面**。
 *
 * 为什么不是「先开面板再提示」：Luker 2.9 的账户窗口是 `dialog.dw-layer`（顶层图层），
 * 先开窗口会把随后的 `Popup.show.text` 压在后面，用户看不到指引；而账户窗口已开时
 * 再调 `openAccountWindow` 只会导航、不会重建，于是第二次点拉取「像是什么也没发生」。
 * 把提示放在开窗**之前**，两个症状一起消失。
 *
 * 本模块只做顺序编排，不碰 DOM / 网络，便于单测锁死顺序。
 */

/**
 * 工作台「从宿主拉取」入口。
 * @param {object} deps
 * @param {boolean} deps.trafficPrompt 是否先弹流量警告
 * @param {boolean} deps.nativePullNotice 是否弹「去原生界面点拉取」指引
 * @param {() => Promise<boolean>} deps.confirmTraffic 返回 true 表示继续
 * @param {() => Promise<void>} deps.showNativeNotice 原生操作指引
 * @param {() => Promise<boolean>} deps.openNativeUi 是否已打开到可操作状态
 * @param {() => boolean} deps.isBusy 宿主原生导出是否在途
 * @param {() => void} deps.notifyBusy 忙态提示
 * @param {() => Promise<void>} deps.fallbackPull 原生入口不可用时的插件侧拉取
 * @param {() => void} [deps.onOpened]
 * @param {() => void} [deps.onMissing]
 * @returns {Promise<{cancelled?:boolean,opened?:boolean,busy?:boolean,fallback?:boolean}>}
 */
export async function beginHostPull({
  trafficPrompt,
  nativePullNotice,
  confirmTraffic,
  showNativeNotice,
  openNativeUi,
  isBusy,
  notifyBusy,
  fallbackPull,
  onOpened,
  onMissing,
} = {}) {
  if (trafficPrompt) {
    const proceed = await confirmTraffic();
    if (!proceed) return { cancelled: true };
  }
  if (nativePullNotice) await showNativeNotice();

  const opened = await openNativeUi();
  if (opened) {
    onOpened?.();
    return { opened: true };
  }

  onMissing?.();
  if (isBusy()) {
    notifyBusy();
    return { busy: true };
  }
  await fallbackPull();
  return { fallback: true };
}

/**
 * 原生界面里注入的「从宿主拉取」按钮入口。
 *
 * 勾选必须先读、再关面板（关掉后读不到）；流量警告必须在关面板**之前**，
 * 用户取消时原生面板保持原样，不产生「关了面板却没拉」的半途状态。
 * @param {object} deps
 * @param {boolean} deps.trafficPrompt
 * @param {() => Promise<boolean>} deps.confirmTraffic
 * @param {() => any} deps.readSelection
 * @param {() => void} deps.closeNativeUi
 * @param {() => boolean} deps.isBusy
 * @param {() => void} deps.notifyBusy
 * @param {(selection:any) => Promise<void>} deps.pull
 * @returns {Promise<{cancelled?:boolean,busy?:boolean,pulled?:boolean}>}
 */
export async function beginNativePull({
  trafficPrompt,
  confirmTraffic,
  readSelection,
  closeNativeUi,
  isBusy,
  notifyBusy,
  pull,
} = {}) {
  if (trafficPrompt) {
    const proceed = await confirmTraffic();
    if (!proceed) return { cancelled: true };
  }

  const selection = readSelection();
  closeNativeUi();
  if (isBusy()) {
    notifyBusy();
    return { busy: true };
  }
  await pull(selection);
  return { pulled: true };
}
