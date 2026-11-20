/**
 * 统一 UI 验收：本地静态服务器 + 无头浏览器 DOM 取证
 *
 * 前置：`npm run build` 后 `npm run preview -- --port 4173 --strictPort`。
 * 本脚本只做单页小规模检查（非全量测试、低内存），验证：
 *   - 工作台骨架与图表面板存在；
 *   - 迁移与备份面板、一级/二级 tab、WebDAV pane 可切换；
 *   - 设置里不再有旧「导出扩展清单」按钮，但有 nativePullNotice 开关；
 *   - 空态有宿主资产列表导出按钮。
 *
 * 本文件属于本地专属目录（不纳版本控制）。
 */
const { loadPlaywright, warnOnVersionDrift } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');

(async () => {
  const playwright = loadPlaywright();
  warnOnVersionDrift(playwright);
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto(process.env.STPT_PREVIEW_URL || 'http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container', { timeout: 10_000 });

  // 首装教程会自动打开并拦截点击；先跳过它再验业务 UI。
  const tutorialSkip = page.locator('#tutorial-skip');
  if (await tutorialSkip.isVisible().catch(() => false)) {
    await tutorialSkip.click();
    await page.waitForTimeout(100);
  }

  const checks = {};
  checks.app = await page.locator('#app.app-container').count();
  checks.chart = await page.locator('#chart-card').count();
  checks.zone = await page.locator('#zone-card').count();
  checks.transferBtn = await page.locator('#transfer-open-btn').count();
  checks.emptyAssetBtn = await page.locator('#btn-assetlist-host').count();

  // 静态服务器没有宿主扩展端点：必须如实提示，不得产生假文件/假成功。
  await page.locator('#btn-assetlist-host').click();
  const guideConfirm = page.locator('#modal-actions .btn.accent');
  if (await guideConfirm.isVisible().catch(() => false)) await guideConfirm.click();
  await page.waitForTimeout(300);
  checks.hostAssetToast = await page.locator('#toast').textContent();

  // 导入最小夹具，验证「每个图表卡」的资产列表导出确实产出官方扁平数组。
  await page.setInputFiles('#file-input', 'fixtures/fixture-st.zip');
  await page.waitForSelector('.vol-card', { timeout: 10_000 });
  checks.chartCards = await page.locator('.vol-card').count();
  checks.canvasCount = await page.locator('.chart-canvas').count();
  const cardBox = await page.locator('.vol-card').first().boundingBox();
  const canvasBox = await page.locator('.chart-canvas').first().boundingBox();
  checks.cardFills = !!cardBox && !!canvasBox
    && Math.abs(cardBox.width - canvasBox.width) <= 2
    && Math.abs(cardBox.height - canvasBox.height) <= 2;

  await page.locator('#chart-pref-btn').click();
  checks.prefRows = await page.locator('[data-prefgroup]').count();
  checks.prefChecked = await page.locator('[data-prefgroup]:checked').count();
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/chart-prefs.png' });
  await page.locator('#pref-cancel').click();
  checks.prefClosed = (await page.locator('[data-prefgroup]').count()) === 0;

  await page.locator('[data-volmax]').first().click();
  const maxBox = await page.locator('.vol-card.is-max').first().boundingBox();
  checks.maxFills = !!maxBox && maxBox.width >= 1200 && maxBox.height >= 800;
  await page.screenshot({ path: 'test-results/chart-max.png' });
  await page.locator('[data-volmax]').first().click();
  await page.screenshot({ path: 'test-results/chart-normal.png' });

  checks.assetListButtons = await page.locator('[data-assetlist]').count();
  checks.actionHostAssetBtn = await page.locator('#btn-host-assetlist').count();
  const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
  checks.assetBtnVisible = await page.locator('[data-assetlist]').first().isVisible().catch(() => false);
  checks.assetBtnBox = await page.locator('[data-assetlist]').first().boundingBox().catch(() => null);
  await page.locator('[data-assetlist]').first().click();
  const guideConfirm2 = page.locator('#modal-actions .btn.accent');
  if (await guideConfirm2.isVisible().catch(() => false)) await guideConfirm2.click();
  let download = null;
  try {
    download = await downloadPromise;
  } catch (err) {
    checks.downloadError = String(err && err.message ? err.message : err);
  }
  if (download) {
  const downloaded = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  checks.assetListIsArray = Array.isArray(downloaded);
  checks.assetListCount = downloaded.length;
  checks.assetListKeys = downloaded[0] ? Object.keys(downloaded[0]).sort().join(',') : '';
  checks.assetListUrl = downloaded[0]?.url || '';
  }

  await page.locator('#transfer-open-btn').click();
  checks.transferVisible = await page.locator('#transfer-view').isVisible();
  checks.tabs = await page.locator('[data-transfer-tab]').count();

  await page.locator('[data-transfer-tab="cloud"]').click();
  checks.cloudVisible = await page.locator('#cloud-view').isVisible();
  checks.providerTabs = await page.locator('[data-cloud-provider]').count();

  await page.locator('[data-cloud-provider="webdav"]').click();
  checks.webdavVisible = await page.locator('#cloud-webdav-pane').isVisible();
  checks.webdavInputs = await page.locator('#webdav-base-url').count();

  await page.locator('#transfer-close-btn').click();
  checks.transferClosed = !(await page.locator('#transfer-view').isVisible());

  await page.locator('#btn-settings').click();
  checks.settingsVisible = await page.locator('#view-settings').isVisible();
  checks.oldExportButton = await page.locator('[data-action="export-extensions"]').count();
  checks.nativePullNotice = await page.locator('[data-setting="nativePullNotice"]').count();

  const ok = checks.app === 1
    && checks.chart === 1
    && checks.zone === 1
    && checks.transferBtn === 1
    && checks.emptyAssetBtn === 1
    && typeof checks.hostAssetToast === 'string' && checks.hostAssetToast.length > 0
    && checks.chartCards >= 1
    && checks.canvasCount === 1
    && checks.cardFills === true
    && checks.prefRows === 12
    && checks.prefChecked === 10
    && checks.prefClosed === true
    && checks.maxFills === true
    && checks.assetListButtons >= 1
    && checks.actionHostAssetBtn === 1
    && checks.assetListIsArray === true
    && checks.assetListCount === 1
    && checks.assetListKeys === 'description,id,name,type,url'
    && checks.assetListUrl === 'https://github.com/example/test-extension'
    && checks.transferVisible
    && checks.tabs === 2
    && checks.cloudVisible
    && checks.providerTabs === 2
    && checks.webdavVisible
    && checks.webdavInputs === 1
    && checks.transferClosed
    && checks.settingsVisible
    && checks.oldExportButton === 0
    && checks.nativePullNotice === 1
    && errors.length === 0;

  process.stdout.write(`${JSON.stringify({ ok, checks, errors }, null, 2)}\n`);
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
