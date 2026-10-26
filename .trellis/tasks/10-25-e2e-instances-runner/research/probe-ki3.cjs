/**
 * KI-3 现场探针：TT 重启后为何看不到本插件痕迹
 *
 * 只读：连 CDP，dump 页面状态 / 扩展面板行 / 控制台错误，不写 TT 数据。
 * 用法：node .trellis/tasks/10-25-e2e-instances-runner/research/probe-ki3.cjs
 */
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ttCdp = require(path.join(REPO_ROOT, 'e2e', 'lib', 'tt-cdp.cjs'));
const { loadPlaywright } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'resolve-playwright.cjs'));

const OUT = __dirname;

(async () => {
  const rt = await ttCdp.ensureTtRuntime({ timeoutMs: 120_000 });
  console.log('[runtime]', JSON.stringify(rt));

  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${ttCdp.CDP_PORT}`, { timeout: 15_000 });
  try {
    const pages = browser.contexts().flatMap((c) => c.pages());
    console.log('[pages]', pages.map((p) => p.url()));
    const tt = pages.find((p) => /localhost:1430|tauri:/i.test(p.url()));
    if (!tt) { console.log('NO TT PAGE'); return; }

    const logs = [];
    tt.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
    tt.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));

    await tt.waitForFunction(
      () => typeof window.__TAURITAVERN__ !== 'undefined' || /TauriTavern/i.test(document.title),
      null, { timeout: 60_000 },
    ).catch(() => console.log('READY TIMEOUT'));
    console.log('[ready] title=', await tt.title());

    const dump = async (tag) => {
      const r = await tt.evaluate(() => {
        const html = document.documentElement.innerHTML;
        const names = [...document.querySelectorAll('[data-name]')]
          .map((el) => el.getAttribute('data-name')).filter(Boolean).slice(0, 80);
        return {
          hasGlobal: typeof window.__TAURITAVERN__ !== 'undefined',
          globalKeys: typeof window.__TAURITAVERN__ === 'object' ? Object.keys(window.__TAURITAVERN__).slice(0, 30) : null,
          mentionsPlugin: /数据包互转|st-zip-converter/i.test(html),
          hasDrawerApp: !!document.querySelector('[class*="st-converter"]'),
          hasAppContainer: !!document.querySelector('.app-container'),
          extMenuBtn: !!document.getElementById('extensions_menu_button'),
          dataNames: names.filter((n) => /zip|数据包/i.test(n)),
          dataNameCount: names.length,
          bodyLen: html.length,
        };
      });
      console.log(`[dump:${tag}]`, JSON.stringify(r));
      return r;
    };

    await dump('initial');

    // 等 20s 看自动激活是否迟到
    await tt.waitForTimeout(20_000);
    await dump('after-20s');

    // 打开扩展面板 → 管理扩展
    await tt.evaluate(() => document.getElementById('extensions_menu_button')?.click());
    await tt.waitForTimeout(1_500);
    await tt.evaluate(() => {
      const el = [...document.querySelectorAll('span,button,a')]
        .find((n) => /管理扩展|Manage [Ee]xtensions/i.test(n.textContent || ''));
      el?.click();
    });
    await tt.waitForTimeout(2_500);
    await dump('manage-panel');

    // 面板里所有行 + 本插件相关文本
    const panel = await tt.evaluate(() => {
      const rows = [...document.querySelectorAll('.extension_container, [class*="extension"]')].slice(0, 40).map((el) => ({
        cls: el.className,
        name: (el.getAttribute('data-name') || ''),
        text: (el.textContent || '').trim().slice(0, 80),
      }));
      const zip = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && /st-zip|数据包互转/i.test(el.textContent || '')).slice(0, 10).map((el) => el.outerHTML.slice(0, 300));
      return { rows, zip };
    });
    console.log('[panel]', JSON.stringify(panel, null, 1).slice(0, 4000));

    await tt.screenshot({ path: path.join(OUT, 'ki3-manage-panel.png'), fullPage: false });
    console.log('[shot] ki3-manage-panel.png');

    console.log('[console tail]', JSON.stringify(logs.slice(-25), null, 1));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAILED:', String(e).slice(0, 500)); process.exit(1); });
