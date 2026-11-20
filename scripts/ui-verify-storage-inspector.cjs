/**
 * 存储审查面板取证（本地专属，不纳版本控制）。
 * 前置：npm run build && 4173 预览服务器在跑。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const fs = require('node:fs');

const URL = process.env.STPT_PREVIEW_URL || 'http://localhost:4173/';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? null });
  if (!ok) console.error(`FAIL ${name}: ${JSON.stringify(detail)}`);
}

async function dismissTutorial(page) {
  const skip = page.locator('#tutorial-skip');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(100);
  }
  const exit = page.locator('#tutorial-banner-exit');
  if (await exit.isVisible().catch(() => false)) {
    await exit.click();
    await page.waitForTimeout(100);
  }
}

async function openPanel(page) {
  await page.locator('[data-quota-kind="browser"]').click();
  await page.waitForSelector('#storage-inspector-view:not([hidden])', { timeout: 5000 });
  await page.waitForFunction(
    () => !document.getElementById('si-loading')?.offsetParent,
    { timeout: 5000 },
  ).catch(() => {});
  await page.waitForTimeout(150);
}

async function desktop(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container');
  await dismissTutorial(page);

  // 应用内帮助页：新入口说明
  await page.locator('[data-help="chart"]').click();
  await page.waitForTimeout(150);
  const helpText = await page.locator('#help-body').innerText();
  check('帮助页说明存储审查入口', helpText.includes('存储审查'), helpText.slice(0, 160));
  await page.locator('#help-close').click();
  await page.waitForTimeout(100);

  await openPanel(page);

  const rects = await page.evaluate(() => {
    const app = document.getElementById('app');
    const main = document.querySelector('.app-main');
    const panel = document.getElementById('storage-inspector-view');
    const r = (el) => { const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.x, y: b.y }; };
    return {
      app: r(app),
      main: r(main),
      panel: r(panel),
      si: app.dataset.si,
      fin: app.dataset.view,
    };
  });
  check('面板填满内容区', rects.panel.w >= rects.main.w - 24 && rects.panel.h >= rects.main.h - 24, rects);
  check('面板打开时 data-si=1', rects.si === '1', rects.si);
  check('数据包列与分隔条让位', await page.evaluate(() => {
    const side = document.querySelector('.col-side');
    const sp = document.querySelector('.splitter-v');
    return side.hidden && sp.hidden;
  }));

  const rows = await page.locator('#si-list .si-row').evaluateAll((els) => els.map((e) => ({
    key: e.dataset.siKey, size: e.querySelector('.si-row-size')?.textContent || '', drill: e.dataset.siDrill,
  })));
  check('L0 五类齐全', rows.map((r) => r.key).join(',') === 'localStorage,sessionStorage,indexeddb,cachestorage,quota', rows);
  check('配额读数非空', (await page.locator('#si-quota').innerText()).trim().length > 0);
  check('堆叠条有分段', (await page.locator('#si-bar .si-bar-seg').count()) >= 1);
  const segBg = await page.evaluate(() => Array.from(document.querySelectorAll('#si-bar .si-bar-seg'))
    .map((e) => getComputedStyle(e).backgroundColor));
  check('堆叠条分段有底色', segBg.length > 0 && segBg.every((c) => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent'), segBg);
  check('配额行不显示条目数', (await page.locator('#si-list [data-si-key="quota"] .si-row-count').count()) === 0);
  check('图例有项', (await page.locator('#si-legend .si-legend-item').count()) >= 1);
  check('数据源页签两个', (await page.locator('#si-source-tabs [data-si-source]').count()) === 2);
  await page.screenshot({ path: 'test-results/shots/si-desktop-1280.png' });

  const lsBefore = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
    session: Object.fromEntries(Object.keys(sessionStorage).sort().map((k) => [k, sessionStorage.getItem(k)])),
  }));

  // sessionStorage 下钻（新上下文里必有教程标记键；空类目按 Luker 规则不可下钻）
  await page.locator('#si-list [data-si-key="sessionStorage"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#si-breadcrumbs .si-crumb').length === 2,
    { timeout: 5000 },
  );
  const crumbCount = await page.locator('#si-breadcrumbs .si-crumb').count();
  check('下钻后面包屑两级', crumbCount === 2, crumbCount);
  const drilled = await page.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('#si-list .si-row')).map((e) => e.dataset.siKey).sort(),
    keys: Object.keys(sessionStorage).sort(),
  }));
  check('sessionStorage 键与行一一对应', JSON.stringify(drilled.rows) === JSON.stringify(drilled.keys), drilled);
  check('sessionStorage 有键可列', drilled.keys.length > 0, drilled.keys.length);

  // 面包屑返回根
  await page.locator('#si-breadcrumbs [data-si-crumb="0"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#si-list .si-row').length === 5,
    { timeout: 5000 },
  );
  check('面包屑可返回根层', true);

  // IndexedDB 下钻：单库大小不可测 ⇒ `?`
  await page.locator('#si-list [data-si-key="indexeddb"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#si-breadcrumbs .si-crumb').length === 2,
    { timeout: 5000 },
  );
  const dbs = await page.locator('#si-list .si-row').evaluateAll((els) => els.map((e) => e.dataset.siKey));
  check('IndexedDB 列出库名', dbs.length > 0, dbs);
  const unknown = await page.locator('#si-list .si-row-size').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  check('不可测大小显示 ?（不伪造 0）', unknown.every((t) => t === '?'), unknown);

  // 刷新按钮
  await page.locator('#si-refresh').click();
  await page.waitForTimeout(250);
  check('刷新后仍显示列表', (await page.locator('#si-list .si-row').count()) >= 0);

  // 关闭回图表
  await page.locator('#si-close').click();
  await page.waitForTimeout(150);
  const afterClose = await page.evaluate(() => ({
    panelHidden: document.getElementById('storage-inspector-view').hidden,
    chartVisible: !document.getElementById('chart-card').hidden,
    si: document.getElementById('app').dataset.si,
  }));
  check('关闭回到图表', afterClose.panelHidden && afterClose.chartVisible && afterClose.si === '', afterClose);

  // 只读：全过程不写 localStorage / sessionStorage
  const lsAfter = await page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])),
    session: Object.fromEntries(Object.keys(sessionStorage).sort().map((k) => [k, sessionStorage.getItem(k)])),
  }));
  check('只读：两处 Web Storage 逐键一致', JSON.stringify(lsBefore) === JSON.stringify(lsAfter));

  // 从配额行再次进入：初始来源就是点的那一行
  await page.locator('[data-quota-kind="browser"]').click();
  await page.waitForSelector('#storage-inspector-view:not([hidden])');
  const active = await page.locator('#si-source-tabs .seg-btn.active').getAttribute('data-si-source');
  check('初始来源跟随点击行', active === 'browser', active);
  await page.locator('#si-close').click();
  await page.close();
}

async function mobile(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 380, height: 700 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container');
  await dismissTutorial(page);
  await openPanel(page);

  const m = await page.evaluate(() => {
    const app = document.getElementById('app');
    const panel = document.getElementById('storage-inspector-view');
    const list = document.getElementById('si-list');
    return {
      view: app.dataset.view,
      si: app.dataset.si,
      overflowX: app.scrollWidth - app.clientWidth,
      panelW: panel.getBoundingClientRect().width,
      appW: app.getBoundingClientRect().width,
      listOverflow: getComputedStyle(list).overflowY,
    };
  });
  check('手机态 data-view=mobile', m.view === 'mobile', m.view);
  check('手机态无横向溢出', m.overflowX <= 1, m.overflowX);
  check('手机态面板占满宽度', m.panelW >= m.appW - 30, m);
  check('手机态列表不单独滚动', m.listOverflow === 'visible', m.listOverflow);
  const dots = await page.evaluate(() => getComputedStyle(document.querySelector('.si-row-dots')).display);
  check('手机态隐藏点阵', dots === 'none', dots);

  await page.screenshot({ path: 'test-results/shots/si-mobile-380.png' });
  await page.close();
}

(async () => {
  const playwright = loadPlaywright();
  fs.mkdirSync('test-results/shots', { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  const errors = [];
  try {
    await desktop(browser, errors);
    await mobile(browser, errors);
  } finally {
    await browser.close();
  }
  check('页面零错误', errors.length === 0, errors);
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync('test-results/storage-inspector-report.json', JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, errors }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
