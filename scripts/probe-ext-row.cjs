/**
 * 临时验证：宿主扩展行「打开」入口 + 全屏工作台（2.7 方案甲）
 * 用法：node scripts/probe-ext-row.cjs https://dev-luker.localhost:8003 --shot out.png
 */
const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const url = process.argv[2];
const shot = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--no-proxy-server'],
  });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(10_000);

  // 打开宿主扩展管理弹层
  // 先关掉挡路的公告弹层（其他扩展/宿主弹的，会拦下所有点击）
  for (const label of ['我知道了', 'OK', 'Close', '关闭']) {
    const el = await page.$(`text=${label}`).catch(() => null);
    if (el) { await el.click().catch(() => {}); await page.waitForTimeout(600); }
  }
  await page.evaluate(() => {
    document.querySelectorAll('.popup, .dialogue_popup').forEach((p) => { p.style.display = 'none'; });
  });
  await page.waitForTimeout(400);

  await page.click('#extensions-settings-button .drawer-toggle').catch(() => {});
  await page.waitForTimeout(2000);
  await page.click('#extensions-settings-button').catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const e = document.getElementById('extensions_details'); if (e) e.click(); });
  await page.waitForTimeout(3500);
  await page.waitForTimeout(4000);

  const listState = await page.evaluate(() => {
    const block = [...document.querySelectorAll('.extension_block')]
      .find((b) => (b.dataset.name || '').includes('ST-pack-transfer'));
    const panel = document.getElementById('st-pack-transfer-settings-panel');
    const drawer = document.getElementById('st_zip_converter_settings');
    const btn = document.getElementById('st-pack-transfer-open-btn');
    return {
      blockFound: !!block,
      blockName: block ? block.dataset.name : null,
      blockText: block ? block.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) : null,
      nativeToggles: block ? block.querySelectorAll('.extension_toggle input').length : 0,
      openBtnInBlock: !!(block && btn && block.contains(btn)),
      openBtnLabel: btn ? btn.textContent.trim() : null,
      legacyPanel: !!panel,
      legacyDrawer: !!drawer,
      modalExists: !!document.getElementById('st-converter-modal-overlay'),
    };
  });
  console.log('扩展列表:', JSON.stringify(listState, null, 2));
  if (shot) {
    // 直接对工作台容器截图，避免宿主扩展弹层遮挡
    const app = await page.$('#st-converter-modal-overlay #app.app-container').catch(() => null);
    if (app) await app.screenshot({ path: shot }).catch(() => undefined);
    else await page.screenshot({ path: shot }).catch(() => undefined);
  }
  console.log('errors:', errors.slice(0, 5));
  await browser.close();
})();
