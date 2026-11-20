/**
 * 本地取证（不纳版本控制）：铺满 / 顺序 / 教程浮层 / 开发者页 / 宿主列表折叠 / 安装区向上展开。
 */
const path = require('node:path');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const OUT = process.env.SPT_SHOT_DIR || path.join(process.env.TEMP || '.', 'spt-shots');

(async () => {
  const pw = loadPlaywright();
  const b = await pw.chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app.app-container');
  await p.evaluate(() => {
    /* 只隐藏浮层，保留节点：后面要测「跳过 / 重新打开」。 */
    document.getElementById('tutorial-overlay')?.classList.remove('open');
    const c = document.getElementById('tutorial-card');
    if (c) c.style.display = 'none';
  });
  const shot = async (n) => { await p.screenshot({ path: path.join(OUT, n) }); console.log('[shot]', n); };

  const fullscreen = await p.evaluate(() => {
    const el = document.getElementById('app');
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      vw: window.innerWidth, vh: window.innerHeight,
      margin: getComputedStyle(el).margin, radius: getComputedStyle(el).borderRadius,
      docOverflow: document.documentElement.scrollWidth > window.innerWidth,
      userSelect: getComputedStyle(el).userSelect,
      inputSelectable: getComputedStyle(document.querySelector('#zone-body .text_pole') || document.querySelector('input') || el).userSelect,
    };
  });
  await shot('16-fullscreen.png');

  const order = await p.evaluate(() => [...document.querySelectorAll('#chart-card .view-switch-btn')].map((b) => b.textContent.trim()));

  await p.click('#chart-card [data-wbview="extension"]');
  await p.waitForTimeout(600);
  const ext = await p.evaluate(() => {
    const tabs = [...document.querySelectorAll('#extmgr-tabs .seg-btn')].map((b) => b.textContent.trim());
    const list = document.getElementById('extmgr-install-block');
    const toggle = document.getElementById('extmgr-install-toggle');
    const area = document.getElementById('extmgr-install-area');
    const host = document.querySelector('#extension-body .ext-scroll');
    return {
      tabs,
      hostListIsDetails: !!host,
      hostListOpen: host ? !host.hidden : null,
      installToggleText: toggle?.textContent.trim(),
      areaHidden: area?.hidden,
      toggleBelowArea: !!(list && area && toggle && (area.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING)),
      devModeSelects: document.querySelectorAll('[data-dev]').length,
    };
  });
  await shot('17-extension-dev.png');

  // 教程模式：占位扩展来自数据文件 + 跳过不退出
  const alreadyDemo = await p.evaluate(() => !document.getElementById('tutorial-banner')?.hidden);
  if (!alreadyDemo) { await p.click('#btn-guide'); await p.waitForTimeout(500); }
  await p.evaluate(() => {
    document.getElementById('tutorial-overlay')?.classList.add('open');
    const c = document.getElementById('tutorial-card');
    if (c) c.style.display = '';
  });
  await p.waitForTimeout(200);
  const demoHost = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#extension-body .ext-scroll .ext-entry')];
    return { count: rows.length, names: rows.slice(0, 3).map((r) => r.querySelector('.ext-url')?.textContent.trim()) };
  });
  await p.click('#tutorial-skip');
  await p.waitForTimeout(250);
  const afterSkip = await p.evaluate(() => ({
    overlayOpen: document.getElementById('tutorial-overlay')?.classList.contains('open'),
    bannerVisible: !document.getElementById('tutorial-banner')?.hidden,
    hasReopen: !!document.getElementById('tutorial-banner-reopen'),
    reopenLabel: document.getElementById('tutorial-banner-reopen')?.textContent.trim(),
    hostRows: document.querySelectorAll('#extension-body .ext-scroll .ext-entry').length,
  }));
  await shot('18-demo-banner.png');
  await p.click('#tutorial-banner-reopen');
  await p.waitForTimeout(250);
  const afterReopen = await p.evaluate(() => ({
    overlayOpen: document.getElementById('tutorial-overlay')?.classList.contains('open'),
    bannerVisible: !document.getElementById('tutorial-banner')?.hidden,
  }));
  await shot('19-tutorial-reopen.png');

  console.log(JSON.stringify({ fullscreen, order, ext, demoHost, afterSkip, afterReopen, errors }, null, 2));
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
