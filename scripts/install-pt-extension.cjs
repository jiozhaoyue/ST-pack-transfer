/**
 * PureTavern 扩展自动化安装 —— 走 PT 内部 legacy 路由 `/api/extensions/install`
 *
 * 为什么是这条路（2026-10-15 取证）：
 *  - PT 是纯前端，扩展落在浏览器 IndexedDB，**没有文件系统目录可部署**（不像 ST/Luker）。
 *  - 但它保留了 ST 的 legacy 扩展路由：`register-routes.ts` 注册 `POST /api/extensions/install`，
 *    请求体 `{ url, global?, branch? }`，由 `ExtensionService.installRemote()` 处理。
 *  - `parseSourceLocation()` 明确允许「HTTPS，或 localhost 上的 HTTP（开发用）」⇒
 *    GitHub 仓库 URL 与本地 zip URL 都可作为来源。
 *
 * 用法：
 *   node scripts/install-pt-extension.cjs                    # 装到 dev-pt + real-pt
 *   node scripts/install-pt-extension.cjs --only dev-pt      # 只装一个
 *   PT_EXT_URL=http://127.0.0.1:9999/pkg.zip node ...        # 换来源（本地 zip）
 *
 * 不新装任何包：Playwright 复用本机全局安装（见 e2e/lib/resolve-playwright.cjs）。
 */

const path = require('path');
const { loadPlaywright } = require(path.resolve(__dirname, '..', 'e2e', 'lib', 'resolve-playwright.cjs'));

const EXT_URL = process.env.PT_EXT_URL || 'https://github.com/jiozhaoyue/st-zip-converter';

/** PT 实例登记（端口为唯一判据；8899 dev / 8900 real——real 用 CLI 覆盖端口，见本仓 AGENTS） */
const TARGETS = [
  { id: 'dev-pt', url: 'http://dev-pt.localhost:8899' },
  { id: 'real-pt', url: 'http://real-pt.localhost:8900' },
];

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? process.argv[onlyArg + 1] : null;
const has = (flag) => process.argv.includes(flag);
const targets = only ? TARGETS.filter((t) => t.id === only) : TARGETS;

if (targets.length === 0) {
  console.error(`--only 指定的实例不存在。可用：${TARGETS.map((t) => t.id).join(', ')}`);
  process.exit(2);
}

(async () => {
  const { chromium } = loadPlaywright();
  // PT 前端体量大，headless 下渲染进程 Target crashed（2026-10-15 实测两次）；
  // 改有头模式——仍是脚本驱动，不需要人操作。
  //
  // ⚠ 必须用**持久化档案**（2026-10-25 实测定位）：PT 前端的扩展可见性绑定浏览器
  // IndexedDB——`browser.newContext()` 临时档装完即丢，e2e 的 `.pw-profile-dev` 看不到
  // （此前 pt-load 的绿靠早期人工装进该档案的旧记录）。与 `e2e/lib/instances.cjs`
  // 的登记共用同一档案，装完即对矩阵可见。
  const { PROFILES } = require(path.resolve(__dirname, '..', 'e2e', 'lib', 'instances.cjs'));
  const PROFILE_BY_ID = { 'dev-pt': PROFILES.dev, 'real-pt': PROFILES.real };
  let failed = 0;

  for (const t of targets) {
    const context = await chromium.launchPersistentContext(PROFILE_BY_ID[t.id] || PROFILES.dev, {
      headless: false,
      ignoreHTTPSErrors: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer'],
    });
    const page = context.pages()[0] || await context.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

    console.log(`\n=== ${t.id}  ${t.url}`);
    try {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      // PT 首启要导入内置扩展（JS-Slash-Runner / Prompt Template），路由就绪晚于 DOM
      await page.waitForTimeout(10_000);

      const probe = await page.evaluate(() => ({ href: location.href, fetchType: typeof fetch }));
      console.log(`  probe -> ${JSON.stringify(probe)}`);

      const result = await page.evaluate(async ({ extUrl, replace }) => {
        const out = {};
        // --replace：先删旧记录再装。PT 的扩展是快照，改代码后必须重装才拿得到最新版；
        // 不删会撞 ExtensionConflictError（同 folder 已存在）。
        if (replace) {
          try {
            const del = await fetch('/api/extensions/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ extensionName: 'third-party/st-zip-converter' }),
            });
            out.delete = { status: del.status, body: (await del.text()).slice(0, 200) };
          } catch (e) {
            out.delete = { error: String(e) };
          }
        }
        try {
          const res = await fetch('/api/extensions/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: extUrl, global: false }),
          });
          const text = await res.text();
          out.install = { status: res.status, body: text.slice(0, 1000) };
        } catch (e) {
          out.install = { fetchError: String(e) };
        }
        return out;
      }, { extUrl: EXT_URL, replace: has('--replace') });

      console.log(`  delete  -> HTTP ${result.delete?.status ?? '(未执行)'} ${result.delete?.body ?? result.delete?.error ?? ''}`);
      console.log(`  install -> HTTP ${result.install?.status ?? '(no status)'}`);
      console.log(`  body    -> ${result.install?.body ?? result.install?.fetchError}`);
      if (result.install?.status !== 200) failed++;
    } catch (error) {
      failed++;
      console.log(`  FAILED: ${String(error).slice(0, 400)}`);
    }

    if (logs.length > 0) {
      console.log(`  console(尾部): ${logs.slice(-6).join(' | ').slice(0, 600)}`);
    }
    await context.close();
  }

  console.log(`\n完成：${targets.length - failed}/${targets.length} 成功`);
  process.exit(failed > 0 ? 1 : 0);
})();
