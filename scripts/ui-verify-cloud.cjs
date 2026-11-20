/**
 * 云端备份面板 UI 验收（本地静态服务器，脱离酒馆运行时）
 *
 * 前置：`npm run build` 后 `npm run preview -- --port 4173 --strictPort`。
 * 产出：`test-results/cloud-ui-*.png` 截图 + 屏幕读数 JSON。
 */
const { loadPlaywright, warnOnVersionDrift } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(process.cwd(), 'test-results');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const playwright = loadPlaywright();
  warnOnVersionDrift(playwright);
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container', { timeout: 10_000 });

  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(100);
  }

  await page.locator('#transfer-open-btn').click();
  await page.locator('[data-transfer-tab="cloud"]').click();
  await page.waitForSelector('#cloud-view', { state: 'visible', timeout: 5000 });

  const checks = {};
  checks.modeOptions = await page.locator('#cloud-mode-select option').count();
  checks.modeValue = await page.locator('#cloud-mode-select').inputValue();
  checks.setName = await page.locator('#cloud-set-name').count();
  checks.retention = await page.locator('#cloud-retention').count();
  checks.encryptNote = (await page.locator('[data-i18n="cloud.encryptNote"]').first().textContent()) || '';
  checks.backupBtn = await page.locator('#cloud-backup-selected').count();
  checks.uploadBtn = await page.locator('#cloud-upload').count();
  checks.pickBtn = await page.locator('#cloud-pick').count();
  checks.fileInput = await page.locator('#cloud-file').count();

  const fieldBox = await page.locator('#cloud-mode-row .cloud-field').first().boundingBox();
  const selectBox = await page.locator('#cloud-mode-select').boundingBox();
  checks.controlsAligned = Boolean(
    fieldBox && selectBox && selectBox.y >= fieldBox.y && selectBox.y < fieldBox.y + fieldBox.height
  );
  const overflow = await page.locator('#cloud-view').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  checks.noHorizontalOverflow = overflow.scrollWidth <= overflow.clientWidth + 1;
  checks.overflow = overflow;

  await page.screenshot({ path: path.join(OUT, 'cloud-ui-full.png'), fullPage: true });
  await page.locator('#cloud-view').screenshot({ path: path.join(OUT, 'cloud-ui-full-mode.png') });

  await page.locator('#cloud-mode-select').selectOption('set');
  await page.locator('#cloud-set-name').fill('daily');
  await page.locator('#cloud-retention').fill('7');
  await page.waitForTimeout(100);
  checks.setModeValue = await page.locator('#cloud-mode-select').inputValue();
  checks.setNameValue = await page.locator('#cloud-set-name').inputValue();
  checks.retentionValue = await page.locator('#cloud-retention').inputValue();
  await page.locator('#cloud-view').screenshot({ path: path.join(OUT, 'cloud-ui-set-mode.png') });

  await page.locator('[data-cloud-provider="webdav"]').click();
  await page.waitForTimeout(100);
  checks.webdavVisible = await page.locator('#cloud-webdav-pane').isVisible();
  checks.webdavEncryptNote = await page.locator('[data-i18n="cloud.encryptNote"]').first().isVisible();
  await page.locator('#cloud-view').screenshot({ path: path.join(OUT, 'cloud-ui-webdav.png') });

  checks.errors = errors;
  checks.ok = checks.modeOptions === 2
    && checks.modeValue === 'full'
    && checks.setName === 1
    && checks.retention === 1
    && checks.encryptNote.length > 0
    && checks.backupBtn === 1
    && checks.uploadBtn === 1
    && checks.pickBtn === 0
    && checks.fileInput === 0
    && checks.controlsAligned
    && checks.noHorizontalOverflow
    && checks.setModeValue === 'set'
    && checks.setNameValue === 'daily'
    && checks.retentionValue === '7'
    && checks.webdavVisible
    && checks.webdavEncryptNote
    && errors.length === 0;

  process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
  await browser.close();
  process.exit(checks.ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
