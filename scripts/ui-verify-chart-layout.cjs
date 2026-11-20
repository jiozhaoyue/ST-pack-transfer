/**
 * 图表布局专项验收：1–5 张卡的宫格 / 拖拽条 / 滚动 / 拖拽比例。
 * 本地专属脚本（不纳版本控制）。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');

const BASE = process.env.STPT_PREVIEW_URL || 'http://localhost:4174/';
const FIXTURES = ['fixture-st.zip', 'fixture-pt.zip', 'fixture-tt.zip', 'fixture-l.zip'];

function payloads(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const path = `fixtures/${FIXTURES[i % FIXTURES.length]}`;
    const buffer = fs.readFileSync(path);
    out.push({ name: `case-${i + 1}-${FIXTURES[i % FIXTURES.length]}`, mimeType: 'application/zip', buffer });
  }
  return out;
}

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const results = [];
  const cases = (process.env.STPT_CASES || '1,2,3,4,5').split(',').map(Number).filter(Boolean);
  for (const n of cases) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const skip = page.locator('#tutorial-skip');
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.setInputFiles('#file-input', payloads(n));
    await page.waitForFunction((count) => document.querySelectorAll('.pkg-card').length >= count, n, { timeout: 30_000 });

    // importFiles 只扫描最新包；逐个激活以拿到真实类目树，再全选让 N 张图同时出现。
    const ids = await page.locator('.pkg-card').evaluateAll((els) => els.map((e) => e.dataset.pkg));
    for (const id of ids) {
      await page.locator(`.pkg-card[data-pkg="${id}"]`).click();
      await page.waitForFunction(() => document.querySelectorAll('.chart-tree .tree-row').length > 0, null, { timeout: 20_000 });
    }
    for (const id of ids) {
      const cb = page.locator(`[data-pkgcheck="${id}"]`);
      if (await cb.count()) await cb.check();
    }
    const diag = await page.evaluate(() => ({
      pkgChecks: document.querySelectorAll('[data-pkgcheck]').length,
      checked: document.querySelectorAll('[data-pkgcheck]:checked').length,
      cards: document.querySelectorAll('.vol-card').length,
      pkgs: [...document.querySelectorAll('.pkg-card')].map((e) => e.dataset.pkg),
    }));
    console.error(`case ${n} diag ${JSON.stringify(diag)}`);
    await page.waitForFunction((count) => document.querySelectorAll('.vol-card').length >= count, n, { timeout: 30_000 });
    await page.waitForTimeout(150);

    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('.chart-canvas');
      const stack = document.querySelector('.chart-stack');
      const cards = [...document.querySelectorAll('.vol-card')];
      return {
        cards: cards.length,
        count: canvas ? canvas.dataset.count : null,
        rows: canvas ? canvas.dataset.rows : null,
        splitV: document.querySelectorAll('.chart-split-v').length,
        splitH: document.querySelectorAll('.chart-split-h').length,
        scrollable: !!stack && stack.scrollHeight > stack.clientHeight + 1,
        places: cards.map((c) => c.style.gridColumn + '/' + c.style.gridRow),
        boxes: cards.map((c) => {
          const r = c.getBoundingClientRect();
          const q = (sel) => {
            const el = c.querySelector(sel);
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) };
          };
          return {
            key: c.dataset.volkey,
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            height: Math.round(r.height),
            head: q('.vol-head'),
            ext: q('.vol-body > .extension-tools'),
            chart: q('.vol-chart'),
            tree: q('.chart-tree'),
            foot: q('.chart-foot'),
            extStyle: (() => {
              const e = c.querySelector('.vol-body > .extension-tools');
              if (!e) return null;
              const s = getComputedStyle(e);
              return {
                flexWrap: s.flexWrap,
                overflowX: s.overflowX,
                height: Math.round(e.getBoundingClientRect().height),
                children: [...e.children].map((ch) => ({
                  cls: String(ch.className || ''),
                  h: Math.round(ch.getBoundingClientRect().height),
                })),
              };
            })(),
          };
        }),
      };
    });

    let dragOk = true;
    if (n >= 2) {
      const bar = page.locator('.chart-split-v').first();
      const box = await bar.boundingBox();
      const before = await page.locator('.vol-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
      await page.mouse.move(box.x + 3, box.y + 30);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + 30, { steps: 6 });
      await page.mouse.up();
      const after = await page.locator('.vol-card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
      dragOk = after[0] > before[0] + 20;
    }

    if (n === 4 || n === 5) {
      fs.mkdirSync('test-results', { recursive: true });
      await page.screenshot({ path: `test-results/chart-${n}-cards.png` });
    }

    results.push({ n, layout, dragOk, errors });
    await context.close();
  }
  await browser.close();

  const expect = {
    1: { rows: '1', splitV: 0, splitH: 0, scrollable: false },
    2: { rows: '1', splitV: 1, splitH: 0, scrollable: false },
    3: { rows: '2', splitV: 1, splitH: 1, scrollable: false },
    4: { rows: '2', splitV: 1, splitH: 2, scrollable: false },
    5: { rows: '3', splitV: 1, splitH: 3, scrollable: true },
  };
  const ok = results.every(({ n, layout, dragOk, errors }) => {
    const e = expect[n];
    return layout.cards === n
      && layout.count === String(n)
      && layout.rows === e.rows
      && layout.splitV === e.splitV
      && layout.splitH === e.splitH
      && layout.scrollable === e.scrollable
      && dragOk
      && errors.length === 0;
  });
  process.stdout.write(`${JSON.stringify({ ok, results }, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
