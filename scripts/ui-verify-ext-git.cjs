/**
 * 扩展管理：URL 归一 / 私有仓安装前提示 / 账号区 / 存储位置 的 UI 取证（本地专属）。
 * 网络一律拦截，避免真的打到 GitHub。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const URL_BASE = process.env.STPT_PREVIEW_URL || 'http://localhost:4173/';

(async () => {
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('https://api.github.com/**', (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: '{}',
  }));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container');
  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(80); }
  await page.locator('.view-switch-btn:visible', { hasText: '扩展管理' }).first().click();
  await page.waitForTimeout(150);

  // 1) /tree/dev → 根 + ref
  await page.fill('#extmgr-links', 'https://github.com/Owner/Repo/tree/dev');
  await page.click('#extmgr-parse');
  await page.waitForTimeout(600);
  const row = page.locator('#extension-body .ext-pack-entry').first();
  const shownUrl = await row.locator('.ext-url').getAttribute('title');
  const refValue = await row.locator('[data-extbranch]').inputValue();
  const subText = await row.locator('.ext-sub').innerText();

  // 2) 未登录时点安装 → 必须出现「私有仓库」显式提示
  await page.click('#extmgr-run');
  await page.waitForTimeout(300);
  const modalOpen = await page.locator('#confirm-dialog').isVisible().catch(() => false);
  const modalTitle = await page.locator('#modal-title').innerText().catch(() => '');
  const modalBody = await page.locator('#modal-extra').innerText().catch(() => '');
  if (modalOpen) await page.locator('#modal-close').click();
  await page.waitForTimeout(150);

  // 3) 账号：仅浏览器 + 添加
  await page.locator('[data-accstorage="browser"]').check();
  await page.waitForTimeout(200);
  await page.fill('[data-accsecret]', 'ghp_testtoken123456');
  await page.fill('[data-acclabel]', 'demo');
  await page.click('[data-accadd]');
  await page.waitForTimeout(700);
  const accRows = await page.locator('#extension-body .acc-row').count();
  const accText = accRows ? await page.locator('#extension-body .acc-row').first().innerText() : '';

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('st-pack-transfer:settings');
    return raw ? JSON.parse(raw) : null;
  });

  const result = {
    shownUrl, refValue, subText, modalOpen, modalTitle, modalBody: modalBody.slice(0, 80),
    accRows, accText,
    storage: stored?.gitCredentialStorage,
    storedAccounts: Array.isArray(stored?.gitAccounts) ? stored.gitAccounts.length : null,
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/ext-git-accounts.png' });
  await browser.close();
  const ok = shownUrl === 'https://github.com/Owner/Repo'
    && refValue === 'dev'
    && modalOpen && /私有/.test(modalTitle)
    && accRows === 1
    && accText.includes('…') && !accText.includes('ghp_testtoken123456')
    && result.storage === 'browser'
    && result.storedAccounts === 1
    && errors.length === 0;
  if (!ok) { console.error('EXT GIT CHECK FAILED'); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
