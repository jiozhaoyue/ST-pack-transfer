/** 当前 UI 截图（临时取证，不纳版本控制）。 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');
const URL = process.env.STPT_PREVIEW_URL || 'http://localhost:4173/';

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  fs.mkdirSync('test-results/shots', { recursive: true });

  async function open(width, height) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app.app-container');
    await page.waitForTimeout(500);
    return page;
  }

  // 1. 正常模式（先退出演示）
  {
    const page = await open(1280, 900);
    const exit = page.locator('#tutorial-banner-exit');
    if (await exit.isVisible().catch(() => false)) { await exit.click(); await page.waitForTimeout(400); }
    await page.screenshot({ path: 'test-results/shots/01-normal-1280.png' });
    // 2. 配额收起
    await page.locator('#quota-head').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/shots/02-quota-collapsed-1280.png' });
    // 3. 配额展开（当前内联实现）
    await page.locator('#quota-head [data-quota-kind="browser"]').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/shots/03-quota-expanded-1280.png' });
    await page.close();
  }

  // 4. 手机 380：配额展开
  {
    const page = await open(380, 760);
    const exit = page.locator('#tutorial-banner-exit');
    if (await exit.isVisible().catch(() => false)) { await exit.click(); await page.waitForTimeout(400); }
    const sw = page.locator('.view-switch-btn:visible', { hasText: '存储图表' }).first();
    if (await sw.isVisible().catch(() => false)) { await sw.click(); await page.waitForTimeout(200); }
    await page.locator('#quota-head').scrollIntoViewIfNeeded();
    await page.locator('#quota-head [data-quota-kind="browser"]').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/shots/04-quota-expanded-380.png' });
    await page.close();
  }

  // 5. 教程演示模式（进入后不退出）
  {
    const page = await open(1280, 900);
    await page.screenshot({ path: 'test-results/shots/05-tutorial-demo-1280.png' });
    await page.locator('[data-tutgoal="convert"]').click().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/shots/06-tutorial-step-1280.png' });
    await page.close();
  }

  await browser.close();
  console.log(fs.readdirSync('test-results/shots').join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });
