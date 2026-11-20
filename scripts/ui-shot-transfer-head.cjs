/**
 * 本地取证截图（不纳版本控制）：迁移面板头同构 + 扩展管理凭据页 / 安装区折叠。
 * 前置：npm run build 后 npm run preview -- --port 4173 --strictPort
 */
const path = require('node:path');
const fs = require('node:fs');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const OUT = process.env.SPT_SHOT_DIR || path.join(process.env.TEMP || '.', 'spt-shots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const shot = async (name) => {
    /* 教程蒙层会遮住面板：截图前关掉蒙层，不改任何业务状态。 */
    await page.evaluate(() => {
      const ov = document.getElementById('tutorial-overlay');
      if (ov) ov.classList.remove('open');
      const card = document.getElementById('tutorial-card');
      if (card) card.style.display = 'none';
    });
    await page.waitForTimeout(80);
    const file = path.join(OUT, name);
    await page.screenshot({ path: file });
  };

  await page.goto(process.env.STPT_PREVIEW_URL || 'http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container', { timeout: 15000 });
  await shot('01-chart-head.png');

  // 迁移与备份：切换行应含三项，头内不得有 ×
  await page.click('#chart-card [data-wbview="transfer"]');
  await page.waitForSelector('#transfer-view:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(150);
  const transferAudit = await page.evaluate(() => {
    const head = document.querySelector('#transfer-view .panel-head');
    return {
      headClass: head ? head.className : null,
      switchLabels: [...document.querySelectorAll('#transfer-view .view-switch-btn')].map((b) => b.textContent.trim()),
      switchActive: document.querySelector('#transfer-view .view-switch-btn.active')?.textContent.trim() || null,
      tabLabels: [...document.querySelectorAll('#transfer-tabs .seg-btn')].map((b) => b.textContent.trim()),
      closeBtnExists: !!document.getElementById('transfer-close-btn'),
      xButtons: [...document.querySelectorAll('#transfer-view button')].filter((b) => b.textContent.trim() === '×').length,
      titleBlockExists: !!document.querySelector('#transfer-view .panel-title'),
      hasSwitchHost: !!document.querySelector('#transfer-view [data-view-switch]'),
    };
  });
  await shot('02-transfer.png');

  // 离开迁移面板：点切换行里的「存储图表」
  await page.click('#transfer-view [data-wbview="chart"]');
  await page.waitForTimeout(120);
  const leftTransfer = await page.evaluate(() => ({
    transferHidden: document.getElementById('transfer-view').hidden,
    chartHidden: document.getElementById('chart-card').hidden,
  }));

  // 扩展管理：页签顺序 + 凭据页内容
  await page.click('#chart-card [data-wbview="extension"]');
  await page.waitForSelector('#extension-view:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(700);
  const extAudit = await page.evaluate(() => {
    const body = document.getElementById('extension-body');
    return {
      tabs: [...document.querySelectorAll('#extmgr-tabs .seg-btn')].map((b) => b.textContent.trim()),
      activeTab: document.querySelector('#extmgr-tabs .seg-btn.active')?.textContent.trim() || null,
      hostHasInstallBlock: !!document.getElementById('extmgr-install-block'),
      installBlockOpen: document.getElementById('extmgr-install-block')?.open ?? null,
      hostHasInstallControls: !!document.querySelector('#extension-body #extmgr-run'),
      bodyTextLength: body ? body.textContent.trim().length : 0,
    };
  });
  await shot('03-extension-host.png');

  // 展开安装区
  await page.click('#extmgr-install-block > summary');
  await page.waitForTimeout(200);
  const expanded = await page.evaluate(() => ({
    open: document.getElementById('extmgr-install-block').open,
    hasRun: !!document.querySelector('#extmgr-install-area #extmgr-run'),
    hasLinks: !!document.querySelector('#extmgr-install-area #extmgr-links'),
  }));
  await shot('04-extension-install-open.png');

  // 凭据页
  await page.click('#extmgr-tabs [data-exttab="cred"]');
  await page.waitForTimeout(300);
  const credAudit = await page.evaluate(() => {
    const body = document.getElementById('extension-body');
    return {
      activeTab: document.querySelector('#extmgr-tabs .seg-btn.active')?.textContent.trim() || null,
      hasAccounts: !!body.querySelector('[data-extaccounts]'),
      hasOauth: !!body.querySelector('[data-oauthstart]'),
      hasInstallControls: !!body.querySelector('#extmgr-run') || !!body.querySelector('#extmgr-links'),
      hasInstallBlock: !!body.querySelector('#extmgr-install-block'),
    };
  });
  await shot('05-extension-cred.png');

  // 手机形态
  await page.setViewportSize({ width: 380, height: 812 });
  await page.waitForTimeout(300);
  await page.click('[data-wbview="transfer"]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);
  await shot('06-mobile-transfer.png');
  const mobileAudit = await page.evaluate(() => ({
    view: document.getElementById('app').dataset.view,
    transferHidden: document.getElementById('transfer-view')?.hidden,
  }));

  console.log(JSON.stringify({ transferAudit, leftTransfer, extAudit, expanded, credAudit, mobileAudit, errors, consoleErrors }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
