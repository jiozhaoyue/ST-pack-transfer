/**
 * TT CDP 冒烟 · 第二步：管理扩展面板里找本插件并启用
 *
 * 首轮发现：TT 扩展面板只列内置扩展；第三方扩展在「管理扩展」里。
 * 本探针：开扩展面板 → 点「管理扩展」→ 截图 + 枚举第三方扩展条目 →
 * 若有 st-zip-converter：尝试启用/打开；再回主界面找插件痕迹。
 *
 * 用法：node .trellis/tasks/10-25-tt-cdp-probe/research/cdp-manage-ext.cjs
 */
const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const CDP = 'http://127.0.0.1:9223';

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15_000 });
  const pages = browser.contexts().flatMap((c) => c.pages());
  const tt = pages.find((p) => /localhost:1430|tauri:/i.test(p.url()));
  if (!tt) throw new Error('TT 页面未找到');

  // 1. 打开扩展面板（若未开）：宽松选择器，失败不致命（面板可能已开）
  try {
    await tt.locator('#extensions_menu_button').first().click({ timeout: 4_000 });
    await tt.waitForTimeout(1_000);
  } catch { /* 面板可能已开或按钮形态不同，继续找管理入口 */ }

  // 2. 点「管理扩展」
  const manage = tt.locator('text=/管理扩展|Manage Extensions/i').first();
  const has = await manage.count();
  console.log(`[manage-btn] count=${has}`);
  if (!has) {
    await tt.screenshot({ path: path.resolve(__dirname, 'tt-manage-missing.png') });
    console.log('未找到「管理扩展」按钮，截图 tt-manage-missing.png');
    await browser.close();
    return;
  }
  await manage.click({ timeout: 8_000, force: true }).catch(async () => {
    await manage.evaluate((el) => el.click());
  });
  await tt.waitForTimeout(2_000);
  await tt.screenshot({ path: path.resolve(__dirname, 'tt-manage-panel.png'), fullPage: false });
  console.log('[shot] tt-manage-panel.png');

  // 3. 枚举面板里的第三方扩展条目（找 st-zip-converter）
  const found = await tt.evaluate(() => {
    const html = document.body.innerHTML;
    const names = [];
    // 尽量抓扩展名行（TT 兼容 ST 的 .extension_container 形态则直接枚举）
    document.querySelectorAll('.extension_container, [class*="extension"] .extension_name, .ext_name').forEach((el) => names.push(el.textContent.trim().slice(0, 60)));
    return {
      containerCount: names.length,
      names: names.slice(0, 30),
      mentionsZip: /st-zip-converter|数据包互转/i.test(html),
    };
  });
  console.log('[ext-list]', JSON.stringify(found, null, 1));

  await browser.close();
})().catch((e) => { console.error('失败:', String(e).slice(0, 300)); process.exit(1); });
