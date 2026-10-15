/**
 * 插件态工作台的**打开路径**（实例侧 E2E 共用）。
 *
 * 2026-10-15 起插件态工作台挂在**全屏模态**里，入口是宿主扩展列表行上的「打开」
 * （`host-bridge.js` 的 `mountExtensionRowButton`）。旧路径 —— 展开
 * `#st_zip_converter_settings` inline-drawer —— 已随该抽屉一并删除，
 * 各 spec 原先自己实现的那份打开逻辑因此全部失效。
 *
 * 三步缺一不可：
 *   ① 点宿主扩展抽屉的原生 toggle，把「扩展」面板滑出来；
 *   ② 点 `#extensions_details` 打开**扩展管理弹层** —— 该弹层是**按需渲染**的，
 *      不点它 DOM 里一个 `.extension_block` 都没有（2026-10-15 在 Dev Luker 8003
 *      与 Dev ST 8001 双宿主实测：初始 `blockCount === 0`，点开后才 60+）；
 *   ③ 点宿主那一行里的 `#st-zip-converter-open-btn`。
 *
 * 全程用**页内 click**（`page.evaluate`）而不是 Playwright 指针点击：宿主 splash 与
 * 第三方扩展的模态 dialog 会拦截指针事件，指针点击会以「element is not visible」超时
 * （与 `scripts/instance-sync/produce-via-plugin.cjs` 同一理由）。
 */

/** 宿主扩展行上我们追加的「打开」按钮 id（`host-bridge.js` mountExtensionRowButton） */
const OPEN_BTN_ID = 'st-zip-converter-open-btn';
/** 全屏工作台覆盖层（`index.js` ensureConverterModal） */
const MODAL_ID = 'st-converter-modal-overlay';

/** 宿主原生扩展抽屉 toggle 的两个已知形态（ST 用前者，部分宿主用后者） */
const HOST_DRAWER_TOGGLES = [
  '#extensions-settings-button .drawer-toggle',
  '.drawer-opener[data-target="extensions-settings-button"]',
];

/**
 * 打开插件态工作台，并确认它**真的渲染出了功能节点**。
 * @param {import('playwright').Page} page
 * @param {{timeout?: number}} [opts]
 * @returns {Promise<{ok: boolean, reason?: string, via: string}>}
 */
async function openWorkbenchModal(page, { timeout = 30_000 } = {}) {
  const clicked = await page.evaluate((toggles) => {
    const hostToggle = toggles.map((sel) => document.querySelector(sel)).find(Boolean);
    if (hostToggle) hostToggle.click();
    return { hostDrawer: Boolean(hostToggle) };
  }, HOST_DRAWER_TOGGLES);
  await page.waitForTimeout(1200);

  const via = await page.evaluate(async (ids) => {
    const details = document.getElementById('extensions_details');
    if (!details) return 'no-extensions-details';
    details.click();
    // 弹层是宿主按需渲染的，给它一拍
    await new Promise((r) => setTimeout(r, 1500));
    const btn = document.getElementById(ids.openBtn);
    if (!btn) return 'no-open-button';
    btn.click();
    return 'open-button';
  }, { openBtn: OPEN_BTN_ID });
  if (via !== 'open-button') {
    return {
      ok: false,
      via,
      reason: via === 'no-extensions-details'
        ? '宿主无 #extensions_details（扩展管理入口不存在）'
        : `宿主扩展行上无 #${OPEN_BTN_ID}（插件未挂载，或宿主扩展列表未渲染）`,
    };
  }

  try {
    await page.waitForFunction((modalId) => {
      const ov = document.getElementById(modalId);
      if (!ov || getComputedStyle(ov).display === 'none') return false;
      // 工作台真的渲染出来了：第一个可交互控件有真实尺寸
      const el = document.getElementById('target-select');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }, MODAL_ID, { timeout });
    return { ok: true, via, hostDrawer: clicked.hostDrawer };
  } catch {
    return {
      ok: false,
      via,
      hostDrawer: clicked.hostDrawer,
      reason: '点了「打开」但模态内 #target-select 始终没有尺寸（工作台未渲染）',
    };
  }
}

/** 关掉全屏工作台（spec 之间复位用）。 */
async function closeWorkbenchModal(page) {
  return page.evaluate((modalId) => {
    const ov = document.getElementById(modalId);
    if (!ov) return false;
    const close = ov.querySelector('#btn-close-converter-modal');
    if (close) close.click();
    else ov.style.display = 'none';
    return true;
  }, MODAL_ID).catch(() => false);
}

module.exports = { openWorkbenchModal, closeWorkbenchModal, OPEN_BTN_ID, MODAL_ID };
