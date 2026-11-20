/**
 * 本地取证截图（不纳版本控制）：迁移 ? 教程、演示数据多宿主多包、恢复模式归位。
 * 前置：npm run build 后 npm run preview -- --port 4173 --strictPort
 */
const path = require('node:path');
const fs = require('node:fs');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const OUT = process.env.SPT_SHOT_DIR || path.join(process.env.TEMP || '.', 'spt-shots');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const pw = loadPlaywright();
  const b = await pw.chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const shot = async (name) => {
    await p.evaluate(() => {
      const ov = document.getElementById('tutorial-overlay');
      if (ov) ov.classList.remove('open');
      const card = document.getElementById('tutorial-card');
      if (card) card.style.display = 'none';
    });
    await p.waitForTimeout(80);
    await p.screenshot({ path: path.join(OUT, name) });
    console.log('[shot]', name);
  };

  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app.app-container');

  // 迁移面板：? 教程
  await p.click('#chart-card [data-wbview="transfer"]');
  await p.waitForTimeout(150);
  const transferHelp = await p.evaluate(() => ({
    hasHelpBtn: !!document.querySelector('#transfer-view .help-btn[data-help="transfer"]'),
    xCount: [...document.querySelectorAll('#transfer-view button')].filter((n) => n.textContent.trim() === '×').length,
    switchLabels: [...document.querySelectorAll('#transfer-view .view-switch-btn')].map((n) => n.textContent.trim()),
  }));
  await shot('11-transfer-help.png');
  await p.click('#transfer-view .help-btn[data-help="transfer"]');
  await p.waitForTimeout(200);
  const helpAudit = await p.evaluate(() => ({
    title: document.getElementById('help-title')?.textContent || '',
    sections: [...document.querySelectorAll('#help-body h4, #help-body .help-sec-title')].map((n) => n.textContent.trim()).slice(0, 4),
  }));
  await shot('12-transfer-guide.png');
  await p.click('#help-close');

  // 演示模式：导入区多宿主多包
  const alreadyDemo = await p.evaluate(() => !document.getElementById('tutorial-banner')?.hidden);
  if (!alreadyDemo) { await p.click('#btn-guide'); await p.waitForTimeout(400); }
  await p.evaluate(() => {
    document.getElementById('tutorial-overlay')?.classList.remove('open');
    const card = document.getElementById('tutorial-card');
    if (card) card.style.display = 'none';
  });
  const importAudit = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#zone-body .pkg-card')];
    return {
      count: cards.length,
      names: cards.map((c) => c.querySelector('.pkg-name-txt')?.textContent.trim() || ''),
      hosts: cards.map((c) => c.querySelector('.pkg-host-tag')?.textContent.trim() || ''),
      meta: cards.map((c) => c.querySelector('.pkg-meta')?.textContent.trim().replace(/\s+/g, ' ') || ''),
      zoneTabsText: document.getElementById('zone-tabs')?.textContent.replace(/\s+/g, ' ').trim(),
      modeRowInsideTabs: !!document.querySelector('#zone-tabs #zone-mode-row'),
      pendingBlock: !!document.getElementById('pending-exports'),
    };
  });
  await shot('13-demo-import.png');

  await p.click('#zone-tabs [data-zone="export"]');
  await p.waitForTimeout(200);
  const exportAudit = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#zone-body .pkg-card')];
    return {
      count: cards.length,
      names: cards.map((c) => c.querySelector('.pkg-name-txt')?.textContent.trim() || ''),
      pendingCards: document.querySelectorAll('#zone-body [data-pending]').length,
      modeVisible: !document.getElementById('zone-mode-row')?.hidden,
      deltaLabelsHidden: [...document.querySelectorAll('.zone-delta-label, #delta-toggle')].every((el) => el.hidden === false),
    };
  });
  await shot('14-demo-export.png');

  console.log(JSON.stringify({ transferHelp, helpAudit, importAudit, exportAudit, errors }, null, 2));
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
