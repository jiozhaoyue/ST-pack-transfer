/**
 * TT CDP 注入冒烟探针（任务 10-25-tt-cdp-probe · R-C1/D-11）
 *
 * 前提：Dev TT 已带 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 启动。
 * 步骤（对齐 PRD R2~R4）：
 *   1. chromium.connectOverCDP('http://127.0.0.1:9223') 枚举页面，定位 TT 前端上下文；
 *   2. 页面读数：URL、宿主全局（window.__TAURITAVERN__ 等 detectHost 判据）、插件痕迹；
 *   3. 冒烟链（尽力而为，每步独立 try）：开扩展面板 → 找本插件行 → 打开工作台 → 零异常读数。
 *
 * 用法：node .trellis/tasks/10-25-tt-cdp-probe/research/cdp-smoke.cjs [--shot out.png]
 * 注意：CDP 端口只在本机环回探活（D-12 管的是浏览器目标域名，CDP 控制面不适用）。
 */

const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const CDP = 'http://127.0.0.1:9223';

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP, { timeout: 15_000 });
  console.log(`[connectOverCDP] OK — browser: ${browser.version()}`);

  const contexts = browser.contexts();
  console.log(`[contexts] ${contexts.length}`);
  const pages = contexts.flatMap((c) => c.pages());
  for (const p of pages) {
    console.log(`  page: ${p.url()}`);
  }

  // 定位 TT 前端页：tauri 协议或 vite devUrl
  const tt = pages.find((p) => /tauri:|localhost:\d+|tauritavern/i.test(p.url()));
  if (!tt) {
    console.log('[verdict] 未找到 TT 前端页面（页面清单见上）');
    await browser.close();
    process.exit(2);
  }
  console.log(`[tt-page] ${tt.url()}`);

  // 页面环境读数（detectHost 判据 + 插件痕迹）
  const env = await tt.evaluate(() => ({
    hasTauriTavernGlobal: typeof window.__TAURITAVERN__ !== 'undefined',
    hasSillyTavernGlobal: typeof window.SillyTavern !== 'undefined',
    hasPureTavernGlobal: typeof globalThis.__PURE_TAVERN__ !== 'undefined',
    title: document.title,
    mentionsPlugin: /st-zip-converter|数据包互转|zip-converter/i.test(document.documentElement.innerHTML),
    hasAppContainer: !!document.querySelector('.app-container'),
    hasDrawerApp: !!document.querySelector('[class*="st-converter"]'),
  }));
  console.log('[env]', JSON.stringify(env, null, 1));

  // 冒烟链：开扩展设置（尽力而为——TT 兼容 ST 扩展面板形态，选择器可能不同，逐段独立 try）
  const steps = [];
  const safe = async (name, fn) => {
    try { steps.push({ name, ok: true, detail: await fn() }); }
    catch (e) { steps.push({ name, ok: false, detail: String(e).slice(0, 200) }); }
  };

  await safe('open-extensions-panel', async () => {
    const btn = tt.locator('#extensions_menu_button, [id*="extensions"]').first();
    await btn.click({ timeout: 8_000 });
    await tt.waitForTimeout(1_500);
    const drawer = await tt.evaluate(() => !!document.querySelector('#extensionsMenu, .extensions_menu, [class*="extensions"]'));
    return `drawer=${drawer}`;
  });

  await safe('find-plugin-row', async () => {
    const row = await tt.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const hit = /st-zip-converter|数据包互转/i.exec(html);
      return hit ? hit[0] : null;
    });
    return row ? `插件痕迹=${row}` : '无插件痕迹（TT 可能未装本插件）';
  });

  await safe('open-workbench', async () => {
    // 若插件行有「打开/使用」按钮则点；找不到就如实报
    const btn = tt.locator('text=/数据包互转|zip.?converter/i').first();
    if (!(await btn.count())) return '无入口可点';
    await btn.click({ timeout: 8_000 });
    await tt.waitForTimeout(2_000);
    return `appContainer=${await tt.evaluate(() => !!document.querySelector('.app-container, [class*="st-converter"]'))}`;
  });

  // 错误读数（连接前后整页的 console 已无法回溯——只收当下 evaluate 试错）
  const shot = process.argv.includes('--shot')
    ? process.argv[process.argv.indexOf('--shot') + 1] : '';
  if (shot) { await tt.screenshot({ path: shot }).catch(() => undefined); console.log(`[shot] ${shot}`); }

  console.log('[steps]', JSON.stringify(steps, null, 1));
  await browser.close(); // connectOverCDP 的 close 只断开连接，不关 TT 窗口
  console.log('[verdict] CDP 通道全程可用');
})().catch((e) => { console.error('冒烟失败:', String(e).slice(0, 400)); process.exit(1); });
