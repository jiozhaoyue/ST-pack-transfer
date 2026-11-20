/**
 * 图表视觉取证：用 25MB 合成包让类目有真实体积，截图单卡/偏好/全屏。
 * 本地专属脚本（不纳版本控制）。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');

const BASE = process.env.STPT_PREVIEW_URL || 'http://localhost:4174/';

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.setInputFiles('#file-input', process.env.STPT_FIXTURE || 'fixtures/fixture-st-large.zip');
  await page.waitForFunction(() => document.querySelectorAll('.chart-tree .tree-row').length > 0, null, { timeout: 60_000 });
  await page.waitForTimeout(500);
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/chart-data.png' });
  const chart = await page.evaluate(() => {
    const segs = [...document.querySelectorAll('.vc-seg')];
    return {
      prefs: JSON.parse(localStorage.getItem('stpt.chartPrefs') || 'null'),
      chatsChildren: [...document.querySelectorAll('.chart-tree > .tree-row')]
        .find((r) => (r.querySelector('.tree-label')?.textContent || '').includes('聊天记录'))
        ?.nextElementSibling?.querySelectorAll?.('.tree-row')?.length || 0,
      segs: segs.length,
      colors: segs.map((s) => getComputedStyle(s).backgroundColor),
      widths: segs.map((s) => Math.round(s.getBoundingClientRect().width)),
      dots: document.querySelectorAll('.tree-dot').length,
      headHeight: Math.round(document.querySelector('.vol-head').getBoundingClientRect().height),
      extHeight: Math.round(document.querySelector('.vol-body > .extension-tools')?.getBoundingClientRect().height || 0),
      rows: [...document.querySelectorAll('.chart-tree > .tree-row')].map((r) => {
        const dot = r.querySelector('.tree-dot');
        const occ = r.querySelector('.tree-occ > i');
        return {
          label: (r.querySelector('.tree-label')?.textContent || '').trim(),
          checked: r.querySelector('.tree-check')?.checked,
          dot: dot ? getComputedStyle(dot).backgroundColor : '',
          occ: occ ? getComputedStyle(occ).backgroundColor : '',
        };
      }),
    };
  });
  await page.locator('#chart-pref-btn').click();
  await page.screenshot({ path: 'test-results/chart-prefs.png' });
  await page.locator('#pref-cancel').click();
  await page.locator('[data-volmax]').first().click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/chart-max.png' });
  await browser.close();
  process.stdout.write(`${JSON.stringify({ chart, errors }, null, 2)}\n`);
  process.exit(errors.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
