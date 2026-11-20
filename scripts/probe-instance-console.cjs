/**
 * 实例探针 —— 打开某个实例，抓浏览器侧 console / 页面错误 / 失败请求，可选截图
 *
 * 用途：用户手测报问题时，用它把"浏览器里到底报了什么"变成可读证据（服务端日志看不到前端错误）。
 *
 * 用法：
 *   node scripts/probe-instance-console.cjs http://dev-st.localhost:8001
 *   node scripts/probe-instance-console.cjs https://dev-luker.localhost:8003 --headed --wait 12000
 *   node scripts/probe-instance-console.cjs http://dev-pt.localhost:8899 --headed --shot out.png
 *
 * 注意：**PT 必须 --headed** —— headless 下 PT 渲染进程会 Target crashed（2026-10-15 实测）。
 * 不新装任何包：Playwright 复用本机全局安装（见 e2e/lib/resolve-playwright.cjs）。
 */

const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const argv = process.argv.slice(2);
const url = argv.find((a) => !a.startsWith('--'));
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

if (!url) {
  console.error('用法: node scripts/probe-instance-console.cjs <url> [--headed] [--wait ms] [--shot file.png]');
  process.exit(2);
}

const headed = has('--headed');
const waitMs = Number(valueOf('--wait', '12000'));
const shotPath = valueOf('--shot', '');

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: !headed,
    // --no-proxy-server：本机有 127.0.0.1:7891 代理，避免本地实例请求被代理接管（保险，非必需）。
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--no-proxy-server'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  const errors = [];
  const warns = [];
  const failedRequests = [];

  page.on('console', (m) => {
    const line = `${m.type()}: ${m.text()}`;
    if (m.type() === 'error') errors.push(line);
    else if (m.type() === 'warning') warns.push(line);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));

  console.log(`打开 ${url}  (headless=${!headed}, wait=${waitMs}ms)`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(waitMs);
  } catch (error) {
    console.log(`导航/等待异常: ${String(error).slice(0, 300)}`);
  }

  // 插件是否被宿主挂上：查 ST 扩展的常见挂载痕迹
  let pluginTrace = null;
  try {
    pluginTrace = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      return {
        mentionsPlugin: /ST-pack-transfer|数据包转运|zip-converter/i.test(html),
        hasAppContainer: !!document.querySelector('.app-container'),
        drawerCount: document.querySelectorAll('[class*="st-converter"]').length,
      };
    });
  } catch (error) {
    pluginTrace = { evaluateError: String(error).slice(0, 200) };
  }

  if (shotPath) {
    await page.screenshot({ path: shotPath, fullPage: has('--full') }).catch(() => undefined);
    console.log(`截图: ${shotPath}${has('--full') ? ' (fullPage)' : ''}`);
  }

  const show = (label, list, limit) => {
    console.log(`\n--- ${label} (${list.length}) ---`);
    list.slice(-limit).forEach((l) => console.log(`  ${l.slice(0, 300)}`));
  };
  show('console error / pageerror', errors, 15);
  show('请求失败', failedRequests, 10);
  show('console warn', warns, 8);
  console.log(`\n插件痕迹: ${JSON.stringify(pluginTrace)}`);

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})();
