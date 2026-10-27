/**
 * 存储图表工作台 demo 截图校对脚本
 *
 * 用法（在仓库根或任意目录）：
 *   node .trellis/tasks/10-26-storage-chart-workbench/deliverables/shot-demo.cjs
 *
 * 产出：test-results/ui4/*.png（gitignored）+ 控制台错误清单
 * 判据：最后一行必须打印 `CONSOLE ERRORS: none`；截图人工过一遍有没有贴边/交错。
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../../../..');
const DEMO = path.join(HERE, 'ui-demo.html');
const OUT = path.join(ROOT, 'test-results/ui4');

function loadChromium() {
  // 1) 项目自带解析器（会去找全局安装的 playwright）
  try {
    const { loadPlaywright } = require(path.join(ROOT, 'e2e/lib/resolve-playwright.cjs'));
    const pw = loadPlaywright();
    if (pw && pw.chromium) return pw.chromium;
  } catch (_) { /* 落到下面的候选路径 */ }
  // 2) 常见全局安装位置
  const candidates = [
    'playwright',
    'C:/nvm4w/nodejs/node_modules/playwright',
    path.join(process.env.APPDATA || '', 'npm/node_modules/playwright'),
  ];
  for (const c of candidates) {
    try {
      const pw = require(c);
      if (pw && pw.chromium) return pw.chromium;
    } catch (_) { /* 继续下一个 */ }
  }
  throw new Error('找不到 playwright：请先 `npm i -g playwright`（或在本仓安装）');
}

(async () => {
  const chromium = loadChromium();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1340, height: 940 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  const shot = name => page.screenshot({ path: path.join(OUT, name) });

  await page.goto(pathToFileURL(DEMO).href);
  await page.waitForTimeout(600);

  // 0. 首次自动弹出的基础教程：先截下来再关掉
  if (await page.locator('#tutorial-overlay.open').count()) {
    await shot('00-tutorial.png');
    await page.click('#tutorial-adv');
    await page.waitForTimeout(200);
    await shot('00b-tutorial-adv.png');
    await page.click('#tutorial-adv');
    await page.waitForTimeout(150);
    await page.click('#tutorial-skip');
    await page.waitForTimeout(200);
  }

  // 1. 桌面默认（Luker 宿主）
  await shot('01-desktop-host.png');

  // 2. 点包卡 → 单包图表
  await page.click('[data-pkg="p1"]');
  await page.waitForTimeout(250);
  await shot('02-package-chart.png');

  // 3. 分卷 300 MB → 多图表
  await page.fill('#split-input', '300');
  await page.waitForTimeout(300);
  await shot('03-split-volumes.png');

  // 4. 多选两个包 → 批量条 + 多组图表
  await page.fill('#split-input', '');
  await page.waitForTimeout(150);
  await page.click('[data-pkgcheck="p1"]');
  await page.click('[data-pkgcheck="p3"]');
  await page.waitForTimeout(300);
  await shot('04-multi-package.png');

  // 5. 目标平台下拉
  await page.click('#target-btn');
  await page.waitForTimeout(200);
  await shot('05-target-picker.png');
  await page.keyboard.press('Escape');
  await page.click('#target-btn');
  await page.waitForTimeout(200);

  // 6. 四宿主品牌色（先清空选择看宿主图表）
  await page.click('[data-pkgcheck="p1"]');
  await page.click('[data-pkgcheck="p3"]');
  for (const h of ['pt', 'tt', 'st']) {
    await page.click('#demo-host button[data-host="' + h + '"]');
    await page.waitForTimeout(250);
    await shot('06-host-' + h + '.png');
  }
  await page.click('#demo-host button[data-host="luker"]');
  await page.waitForTimeout(200);

  // 7. 浅色主题
  await page.click('#demo-theme button[data-theme="light"]');
  await page.waitForTimeout(300);
  await shot('07-light.png');
  await page.click('#demo-theme button[data-theme="dark"]');
  await page.waitForTimeout(200);

  // 8. 移动端多卷折叠（先在桌面选包，再切移动）
  await page.click('[data-pkg="p1"]');
  await page.waitForTimeout(200);
  await page.fill('#split-input', '300');
  await page.waitForTimeout(250);
  await page.click('#demo-view button[data-view="mobile"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '08-mobile-split.png'), fullPage: true });

  // 9. Web 模式
  await page.click('#demo-view button[data-view="desktop"]');
  await page.fill('#split-input', '');
  await page.click('[data-pkgcheck="p1"]');
  await page.click('#demo-mode button[data-mode="web"]');
  await page.waitForTimeout(300);
  await shot('09-web-mode.png');

  // 10. 导出区
  await page.click('#demo-mode button[data-mode="plugin"]');
  await page.waitForTimeout(150);
  await page.click('#zone-tabs .zone-tab[data-zone="export"]');
  await page.waitForTimeout(250);
  await shot('10-export-zone.png');

  // 11. 日志弹窗 + 弹窗内帮助键
  await page.click('#btn-log');
  await page.waitForTimeout(250);
  await shot('11-log-modal.png');
  await page.click('.log-modal-head [data-help="log"]');
  await page.waitForTimeout(250);
  await shot('11b-log-help.png');
  await page.click('#log-close');
  await page.waitForTimeout(150);

  // 12. 拖拽左右分隔条
  const vb = await page.locator('#split-v').boundingBox();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + 200);
  await page.mouse.down();
  await page.mouse.move(vb.x - 150, vb.y + 200, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await shot('12-split-v.png');

  // 13. 拖拽右栏上下分隔
  const hb = await page.locator('#split-h').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 130, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await shot('13-split-h.png');

  // 14. 多包 × 多卷 批量生成导出包
  await page.click('#demo-reset');
  await page.waitForTimeout(300);
  await page.click('[data-pkgcheck="p1"]');
  await page.click('[data-pkgcheck="p3"]');
  await page.fill('#split-input', '300');
  await page.waitForTimeout(300);
  await shot('14a-batch-before.png');
  await page.click('#batch-generate');
  await page.waitForTimeout(400);
  await shot('14b-batch-export.png');

  console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  await browser.close();
})();
