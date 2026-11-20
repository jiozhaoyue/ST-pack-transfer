/**
 * 本轮追加需求取证（本地专属，不纳版本控制）。
 * 前提：npm run build 已完成，4173 静态预览在跑。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(process.env.STPT_PREVIEW_URL || 'http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container', { timeout: 10000 });
  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(120); }

  const out = { errors };

  // 1) 扩展管理 → 安装页：OAuth 区块、回调地址、GitHub 限制说明
  await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
  await page.waitForTimeout(150);
  out.tabs = await page.locator('#extmgr-tabs .seg-btn').allInnerTexts();
  out.closeBtn = await page.locator('#extension-close-btn').count();
  await page.locator('#extmgr-tabs .seg-btn', { hasText: '安装' }).click();
  await page.waitForTimeout(120);
  await page.locator('[data-extaccounts]').evaluate((el) => { el.open = true; });
  await page.locator('[data-extoauth]').evaluate((el) => { el.open = true; });
  await page.waitForTimeout(80);
  out.oauthBlock = await page.locator('[data-extoauth]').count();
  out.redirectText = await page.locator('[data-oauthredirect]').innerText();
  out.expectRedirect = await page.evaluate(() => location.origin + location.pathname);
  out.oauthHint = await page.locator('[data-extoauth] .ext-note').last().innerText();
  out.oauthFields = await page.locator('[data-oauthclient], [data-oauthsecret], [data-oauthproxy], [data-oauthstart], [data-tokenguide]').count();
  // 整个插件的数据导入导出在「设置 → 数据」
  await page.locator('#btn-settings').click();
  await page.waitForTimeout(150);
  await page.locator('[data-group="data"]').evaluate((el) => { el.open = true; });
  await page.waitForTimeout(80);
  out.settingsDataButtons = await page.locator('[data-action="plugin-export"], [data-action="plugin-import"]').count();
  out.credsChecked = await page.locator('#set-include-creds').isChecked();
  out.oauthDisabled = await page.locator('#set-include-oauth').isDisabled();
  await page.locator('#set-include-creds').check();
  out.oauthEnabledAfterCreds = await page.locator('#set-include-oauth').isEnabled();
  out.settingsTopActionsHidden = await page.locator('#top-actions').isHidden();
  await page.locator('#settings-close').click();
  await page.waitForTimeout(120);
  await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
  await page.waitForTimeout(120);
  await page.locator('#extmgr-tabs .seg-btn', { hasText: '安装' }).click();
  await page.waitForTimeout(120);

  // 2) 令牌指引：帮助视图 + 可点击链接
  await page.locator('[data-extaccounts]').evaluate((el) => { el.open = true; });
  await page.locator('[data-extoauth]').evaluate((el) => { el.open = true; });
  await page.waitForTimeout(80);
  await page.locator('[data-tokenguide]').click();
  await page.waitForTimeout(150);
  out.helpVisible = await page.locator('#view-help').isVisible();
  out.helpLinks = await page.locator('#view-help .help-links a').count();
  out.helpHrefs = await page.locator('#view-help .help-links a').evaluateAll((els) => els.map((a) => a.href));
  out.topActionsHiddenInHelp = await page.locator('#top-actions').isHidden();

  // 3) 报告常驻底部：不在页签里；展开占满扩展管理正文区
  await page.locator('#help-close').click();
  await page.waitForTimeout(100);
  await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
  await page.waitForTimeout(120);
  out.reportTab = await page.locator('#extmgr-tabs .seg-btn', { hasText: '报告' }).count();
  out.reportBar = await page.locator('#extmgr-report-bar').innerText();  await page.locator('#extmgr-report-bar').click();
  await page.waitForTimeout(150);
  out.reportOpen = await page.locator('#extmgr-report-panel').isVisible();
  out.bodyHiddenWhenReport = await page.locator('#extension-body').isHidden();
  out.reportOpenLogBtn = await page.locator('#extmgr-open-log2').count();
  out.reportSeparateLog = await page.locator('.extension-view pre.ext-log').count();

  // 4) 全局日志：整页占满，动作条隐藏
  await page.locator('#extmgr-open-log2').click();
  await page.waitForTimeout(150);
  out.logVisible = await page.locator('#view-log').isVisible();
  out.topActionsHiddenInLog = await page.locator('#top-actions').isHidden();
  out.logRect = await page.evaluate(() => {
    const v = document.getElementById('view-log');
    const a = document.getElementById('app');
    const h = document.querySelector('.app-header');
    if (!v || !a || !h) return null;
    const vr = v.getBoundingClientRect();
    return { top: Math.round(vr.top), headerBottom: Math.round(h.getBoundingClientRect().bottom), width: Math.round(vr.width), appWidth: Math.round(a.getBoundingClientRect().width) };
  });

  await page.screenshot({ path: 'test-results/oauth-log-desktop.png' });
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
