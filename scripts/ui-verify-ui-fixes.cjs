/**
 * 本地取证：U1–U6 + 目标任务式教程（不纳版本控制）。
 * 前置：npm run build 且 4173 预览服务器在跑。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const URL = process.env.STPT_PREVIEW_URL || 'http://localhost:4173/';

async function openApp(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#app.app-container', { timeout: 10000 });
  const overlay = page.locator('#tutorial-overlay');
  if (await overlay.evaluate((el) => el.classList.contains('open')).catch(() => false)) {
    await page.locator('#tutorial-skip').click();
    await page.waitForTimeout(60);
  }
  return { page, errors };
}

(async () => {
  const playwright = loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const out = {};

  for (const w of [1280, 800, 500, 380]) {
    const { page, errors } = await openApp(browser, w, w <= 500 ? 760 : 900);
    const view = await page.locator('#app').getAttribute('data-view');
    const badge = (await page.locator('#host-badge-text').innerText()).trim();
    const titleVisible = await page.locator('.app-title').isVisible();
    const btns = page.locator('.header-actions .icon-btn');
    const n = await btns.count();
    const boxes = [];
    for (let i = 0; i < n; i++) {
      if (await btns.nth(i).isVisible()) boxes.push(await btns.nth(i).boundingBox());
    }
    const sameRow = boxes.every((b) => b && Math.abs(b.y - boxes[0].y) < 1);
    const fullSize = boxes.every((b) => b && b.width >= 27.5 && b.height >= 27.5);
    const overflowX = await page.evaluate(() => {
      const el = document.getElementById('app');
      return el ? el.scrollWidth - el.clientWidth : 0;
    });
    const headerOverflow = await page.evaluate(() => {
      const h = document.querySelector('.app-header');
      return h ? h.scrollWidth - h.clientWidth : 0;
    });

    await page.locator('#filename-toggle').click();
    await page.waitForTimeout(80);
    const rowVisible = await page.locator('#filename-row').isVisible();
    const toggleText = (await page.locator('#filename-toggle').innerText()).trim();
    const expanded = await page.locator('#filename-toggle').getAttribute('aria-expanded');
    const ta = await page.locator('#filename-template').boundingBox();
    const pv = await page.locator('#filename-preview').boundingBox();
    const previewBelow = ta && pv ? pv.y >= ta.y + ta.height - 1 : false;
    const previewFull = ta && pv ? pv.width >= ta.width * 0.9 : false;

    const quotaText = (await page.locator('#quota-head').innerText()).trim();

    out['w' + w] = {
      view, badge, titleVisible, iconBtns: n, sameRow, fullSize,
      overflowX, headerOverflow, rowVisible, toggleText, expanded,
      previewBelow, previewFull, quotaText, errors,
    };
    await page.close();
  }

  // 教程：菜单 → 选「数据包转换」→ 连续下一步，卡片不得消失
  {
    const { page, errors } = await openApp(browser, 1280, 900);
    if (!(await page.locator('#tutorial-overlay').evaluate((el) => el.classList.contains('open')))) {
      await page.locator('#btn-guide').click();
      await page.waitForTimeout(100);
    }
    const goals = await page.locator('#tutorial-goals .tut-goal').allInnerTexts();
    const goalVisible = await page.locator('#tutorial-goals').isVisible();
    await page.locator('[data-tutgoal="convert"]').click();
    await page.waitForTimeout(120);
    const steps = [];
    for (let i = 0; i < 8; i++) {
      const cardVisible = await page.locator('#tutorial-card').isVisible();
      const box = await page.locator('#tutorial-card').boundingBox();
      steps.push({ i, cardVisible, cardW: box && Math.round(box.width), title: await page.locator('#tutorial-title').innerText() });
      if (!(await page.locator('#tutorial-next').isVisible())) break;
      await page.locator('#tutorial-next').click();
      await page.waitForTimeout(140);
      const stillOpen = await page.locator('#tutorial-overlay').evaluate((el) => el.classList.contains('open'));
      if (!stillOpen) { steps.push({ closedAt: i + 1 }); break; }
    }
    out.tutorialFlow = { goals, goalVisible, steps, errors };
    await page.close();
  }

  // 教程：桌面 → 手机上目标自动切到数据包页
  {
    const { page } = await openApp(browser, 1280, 900);
    await page.locator('#btn-guide').click();
    await page.waitForTimeout(100);
    await page.locator('[data-tutgoal="convert"]').click();
    await page.waitForTimeout(100);
    await page.locator('#tutorial-next').click(); // step1 chart-stack
    await page.waitForTimeout(100);
    await page.locator('#tutorial-next').click(); // step2 delta (zone view)
    await page.waitForTimeout(150);
    await page.locator('#tutorial-ring').evaluate(() => {});
    const ringBefore = await page.locator('#tutorial-ring').isVisible();
    await page.setViewportSize({ width: 380, height: 700 });
    await page.waitForTimeout(300);
    const view = await page.locator('#app').getAttribute('data-view');
    const deltaVisible = await page.locator('#delta-toggle').isVisible();
    const ringAfter = await page.locator('#tutorial-ring').isVisible();
    const cardVisible = await page.locator('#tutorial-card').isVisible();
    out.tutorialMobile = { ringBefore, view, deltaVisible, ringAfter, cardVisible };
    await page.close();
  }

  // 偏好二次点击：无改动直接退出；有改动弹确认
  {
    const { page } = await openApp(browser, 1280, 900);
    await page.locator('#chart-pref-btn').click();
    await page.waitForTimeout(100);
    const entered = await page.locator('#chart-stack').evaluate((el) => el.classList.contains('is-prefs'));
    await page.locator('#chart-pref-btn').click();
    await page.waitForTimeout(100);
    const exitedClean = !(await page.locator('#chart-stack').evaluate((el) => el.classList.contains('is-prefs')));
    await page.locator('#chart-pref-btn').click();
    await page.waitForTimeout(100);
    const cb = page.locator('#chart-stack [data-prefgroup]').first();
    if (await cb.count()) { await cb.click().catch(() => {}); }
    await page.locator('#chart-pref-btn').click();
    await page.waitForTimeout(120);
    const dialogOpen = await page.locator('#confirm-dialog').evaluate((el) => el.open || el.hasAttribute('open'));
    const dialogTitle = dialogOpen ? await page.locator('#modal-title').innerText() : '';
    out.prefsToggle = { entered, exitedClean, dialogOpen, dialogTitle };
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(out, null, 2));

  const bad = [];
  for (const w of [1280, 800, 500, 380]) {
    const v = out['w' + w];
    if (!v.badge) bad.push(`${w}: 徽标无文字`);
    if (w <= 800 && v.titleVisible) bad.push(`${w}: 手机态仍显示标题`);
    if (!v.sameRow || !v.fullSize) bad.push(`${w}: 页头按钮被压缩/换行`);
    if (v.overflowX > 1 || v.headerOverflow > 1) bad.push(`${w}: 横向溢出`);
    if (!v.rowVisible || !v.expanded) bad.push(`${w}: 包名行未展开`);
    if (!v.toggleText) bad.push(`${w}: 包名按钮无文字`);
    if (!v.previewBelow || !v.previewFull) bad.push(`${w}: 预览未独占下一行`);
    if (!v.quotaText) bad.push(`${w}: 配额无读数`);
    if (v.errors.length) bad.push(`${w}: 页面错误 ${v.errors.join(';')}`);
  }
  if (!out.tutorialFlow.goalVisible || out.tutorialFlow.goals.length < 3) bad.push('教程目标菜单异常');
  if (out.tutorialFlow.steps.some((s) => s.cardVisible === false)) bad.push('教程某一步卡片消失');
  if (out.tutorialMobile.view !== 'mobile' || !out.tutorialMobile.deltaVisible || !out.tutorialMobile.cardVisible) {
    bad.push('窄屏教程未跟到数据包页');
  }
  if (!out.prefsToggle.entered || !out.prefsToggle.exitedClean || !out.prefsToggle.dialogOpen) {
    bad.push('偏好二次点击行为不符');
  }
  if (bad.length) { console.error('ISSUES:', bad.join(' | ')); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exit(1); });
