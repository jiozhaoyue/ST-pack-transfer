#!/usr/bin/env node
/**
 * 文档站截图：**只从教程演示模式采集**，绝不加载真实数据包。
 *
 * 产物：docs/assets/shots/<viewport>-<nn>-<name>.png（入库，公开文档使用）
 * 用法：npm run build && npm run docs:shots [-- --port 3040] [-- --only desktop|mobile]
 *
 * 依赖本地开发工具（e2e/ 不入库）：e2e/standalone/lib/static-server.cjs、
 * e2e/lib/resolve-playwright.cjs。CI 只跑 docs:verify，不跑本脚本。
 */

const fs = require('node:fs');
const path = require('node:path');
const { startStaticServer, DEFAULT_PORT } = require('../e2e/standalone/lib/static-server.cjs');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'assets', 'shots');

function parseArgs(argv) {
  const out = { port: DEFAULT_PORT, out: DEFAULT_OUT, only: 'all' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port') out.port = Number(argv[++i]) || DEFAULT_PORT;
    else if (argv[i] === '--out') out.out = path.resolve(argv[++i]);
    else if (argv[i] === '--only') out.only = String(argv[++i] || 'all');
  }
  return out;
}

async function clickIf(page, selector, timeout = 5000) {
  try {
    const loc = page.locator(selector).first();
    if (await loc.count() === 0) return false;
    await loc.click({ timeout });
    return true;
  } catch {
    // 兜底：页面存在多组同选择器按钮（头/图表卡/底栏），.first() 可能点到不可见或被裁切的那组，
    // 导致视图切换静默失败、所有截图截成同一张（真实事故）。DOM click 能可靠触发 click handler。
    try {
      return await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.click();
        return true;
      }, selector);
    } catch {
      return false;
    }
  }
}

async function clickVisible(page, selector, timeout = 5000) {
  try {
    const loc = page.locator(`${selector}:visible`).first();
    if (await loc.count() === 0) return false;
    await loc.click({ timeout });
    return true;
  } catch {
    return false;
  }
}

function makeShot(page, outDir, viewport) {
  let seq = 0;
  return async (name) => {
    seq += 1;
    const file = path.join(outDir, `${viewport}-${String(seq).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    process.stdout.write(`  ✓ ${path.basename(file)}\n`);
  };
}

async function openTutorial(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const el = document.querySelector('#host-badge-text');
    return el && el.textContent && el.textContent.trim().length > 0;
  }, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  const overlayOpen = await page.locator('#st-pt-tutorial-overlay.open').count();
  const bannerVisible = await page.locator('#tutorial-banner:not([hidden])').count();
  if (!overlayOpen && !bannerVisible) {
    await clickIf(page, '#btn-guide');
    await page.waitForTimeout(700);
  }
}

async function enterDemo(page, shot) {
  await clickIf(page, '.tut-goal[data-tutgoal="convert"]');
  await page.waitForTimeout(600);
  await shot('tutorial-step');
  await clickIf(page, '#tutorial-skip');
  await page.waitForTimeout(500);
  await shot('workbench-demo');
}

async function captureDesktop(browser, url, outDir) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    colorScheme: 'light',
    acceptDownloads: true,
  });
  // 关掉首次加载自动弹出的更新日志弹窗（<dialog open>）：它会拦截教程/视图切换点击，
  // 而 clickIf 会静默吞掉失败，导致所有视图都截成同一张图（实测事故）。
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('st-pack-transfer:settings', JSON.stringify({ showChangelogOnUpdate: false }));
    } catch { /* 隐私模式 */ }
  });
  const page = await ctx.newPage();
  const shot = makeShot(page, outDir, 'desktop');
  const failures = [];
  page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));

  await openTutorial(page, url);
  await shot('tutorial-goal');
  await enterDemo(page, shot);

  // 导出区
  await clickIf(page, '#zone-tabs [data-zone="export"]');
  await page.waitForTimeout(450);
  await shot('export-area');

  // 扩展管理：先宿主页、再包内页，两张必须不同（页签真实值为 package，非 pack）
  await clickIf(page, '.view-switch-btn[data-wbview="extension"]');
  await page.waitForTimeout(500);
  await clickIf(page, '#extmgr-tabs [data-exttab="host"]');
  await page.waitForTimeout(450);
  await shot('extension-manager');
  await clickIf(page, '#extmgr-tabs [data-exttab="package"]');
  await page.waitForTimeout(450);
  // 独立 Web 无宿主页签（会被强制回 package），故用「勾选若干扩展的待打包态」区别于列表态
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.ext-pkg-row [data-extsel]')].slice(0, 2);
    boxes.forEach((b) => { if (!b.checked) b.click(); });
  });
  await page.waitForTimeout(350);
  await shot('extension-pack');

  // 迁移与备份
  await clickIf(page, '.view-switch-btn[data-wbview="transfer"]');
  await page.waitForTimeout(500);
  await shot('transfer-lan');
  await clickIf(page, '#transfer-tabs [data-transfer-tab="cloud"]');
  await page.waitForTimeout(450);
  await shot('transfer-cloud');
  await clickIf(page, '#cloud-provider-tabs [data-cloud-provider="webdav"]');
  await page.waitForTimeout(400);
  await shot('transfer-webdav');
  await clickIf(page, '.view-switch-btn[data-wbview="chart"]');
  await page.waitForTimeout(400);

  // 存储审查（必须先在可见的图表视图，点真实配额行）
  await clickVisible(page, '.view-switch-btn[data-wbview="chart"]');
  await page.waitForSelector('#chart-card:not([hidden])', { timeout: 5000 }).catch(() => {});
  await clickVisible(page, '#quota-head .quota-row');
  await page.waitForSelector('#storage-inspector-view:not([hidden])', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(650);
  await shot('storage-inspector');
  await clickVisible(page, '[data-si-key="localStorage"]');
  await page.waitForTimeout(500);
  await shot('storage-localstorage');
  await clickIf(page, '#si-close');
  await page.waitForTimeout(350);

  // 日志三态：0 收起 → 1 半展开任务队列 → 2 全展开日志/队列双页签
  await clickIf(page, '#workbench-progress'); // → half
  await page.waitForTimeout(450);
  await clickIf(page, '#workbench-progress'); // → full
  await page.waitForTimeout(450);
  await clickIf(page, '#log-tabs [data-logtab="log"]');
  await page.waitForTimeout(350);
  await shot('log-view');
  await clickIf(page, '#log-close'); // → closed
  await page.waitForTimeout(300);
  await clickIf(page, '#workbench-progress'); // → half
  await page.waitForTimeout(450);
  await shot('task-queue');
  await clickIf(page, '#log-close');
  await page.waitForTimeout(300);

  // 设置 / 更新日志
  await clickIf(page, '#btn-settings');
  await page.waitForTimeout(450);
  await shot('settings');
  await clickIf(page, '#settings-version');
  await page.waitForTimeout(650);
  await shot('changelog');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  await ctx.close();
  return failures;
}

async function captureMobile(browser, url, outDir) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'zh-CN',
    colorScheme: 'light',
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  // 同桌面：关掉更新日志弹窗，避免拦截点击导致所有视图截成同一张图。
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('st-pack-transfer:settings', JSON.stringify({ showChangelogOnUpdate: false }));
    } catch { /* 隐私模式 */ }
  });
  const page = await ctx.newPage();
  const shot = makeShot(page, outDir, 'mobile');
  const failures = [];
  page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));

  await openTutorial(page, url);
  await shot('tutorial-goal');
  await enterDemo(page, shot);

  await clickIf(page, '.view-switch-btn[data-wbview="extension"]');
  await page.waitForTimeout(500);
  await clickIf(page, '#extmgr-tabs [data-exttab="host"]');
  await page.waitForTimeout(450);
  await shot('extension-manager');
  await clickIf(page, '#extmgr-tabs [data-exttab="package"]');
  await page.waitForTimeout(450);
  // 独立 Web 无宿主页签（会被强制回 package），故用「勾选若干扩展的待打包态」区别于列表态
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.ext-pkg-row [data-extsel]')].slice(0, 2);
    boxes.forEach((b) => { if (!b.checked) b.click(); });
  });
  await page.waitForTimeout(350);
  await shot('extension-pack');

  await clickIf(page, '.view-switch-btn[data-wbview="transfer"]');
  await page.waitForTimeout(500);
  await shot('transfer');

  await clickIf(page, '.view-switch-btn[data-wbview="chart"]');
  await page.waitForTimeout(400);
  await clickIf(page, '#zone-tabs [data-zone="export"]');
  await page.waitForTimeout(400);
  await shot('export-area');

  // 手机日志三态：半展开任务队列 + 全展开日志
  await clickIf(page, '#workbench-progress');
  await page.waitForTimeout(450);
  await shot('task-queue');
  await clickIf(page, '#workbench-progress');
  await page.waitForTimeout(450);
  await clickIf(page, '#log-tabs [data-logtab="log"]');
  await page.waitForTimeout(350);
  await shot('log-view');
  await clickIf(page, '#log-close');
  await page.waitForTimeout(300);

  await ctx.close();
  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dist = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(dist)) {
    console.error('缺少 dist/index.html，请先运行 npm run build');
    process.exit(1);
  }
  fs.rmSync(args.out, { recursive: true, force: true });
  fs.mkdirSync(args.out, { recursive: true });

  const server = await startStaticServer({
    port: args.port,
    mounts: [{ prefix: '/ST-pack-transfer/', root: path.join(ROOT, 'dist') }],
  });
  const url = server.mounts[0].url;
  process.stdout.write(`文档截图：${url} → ${args.out}\n`);

  const pw = loadPlaywright();
  const browser = await pw.chromium.launch();
  const failures = [];
  try {
    if (args.only === 'all' || args.only === 'desktop') {
      failures.push(...await captureDesktop(browser, url, args.out));
    }
    if (args.only === 'all' || args.only === 'mobile') {
      failures.push(...await captureMobile(browser, url, args.out));
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const files = fs.readdirSync(args.out).filter((name) => name.endsWith('.png'));
  process.stdout.write(`\n完成：${files.length} 张截图\n`);
  if (failures.length) {
    process.stdout.write(`⚠ 页面错误 ${failures.length} 条（不阻断截图，但需人工复核）：\n`);
    for (const item of failures) process.stdout.write(`  - ${item}\n`);
  }
}

main().catch((error) => {
  console.error('文档截图失败：', error);
  process.exit(1);
});
