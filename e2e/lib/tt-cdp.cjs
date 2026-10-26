/**
 * TauriTavern CDP 运行时 —— `e2e:instances` 矩阵 tt-cdp 行的可复用库
 *
 * 事实基线（任务 10-25-tt-cdp-probe 七步取证，2026-10-25，spec/frontend/host-capabilities.md
 * 「TauriTavern（TT）宿主事实」节）：
 *  - TT 扩展发现**跳过 junction** ⇒ 安装 = 真实目录拷贝（四件：manifest/index/style/src）；
 *  - `pnpm tauri dev` 本机 mingw 链接失败（ld 37）⇒ 启动 = 仓内静态 server(1430)
 *    + 旧 debug exe + `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`；
 *  - TT 数据根在 AppData 且含真实数据（P-11 高敏）：一切写操作纯增量、可整删。
 *
 * 不适用 D-12 域名纪律的 HTTP 形态：TT 是桌面 WebView，控制面是本机环回 CDP 口
 * （9223），浏览器目标是 TT 自身 devUrl（1430）——矩阵里单列，不走 guard 的
 * HTTP 白名单路径。
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TT_ROOT = process.env.TAVERN_TT_ROOT
  ? path.resolve(process.env.TAVERN_TT_ROOT)
  : path.resolve(REPO_ROOT, '..', '..', 'Instance', 'Dev', 'TauriTavern');

const CDP_PORT = 9223;
const FRONT_PORT = 1430;
/** TT 数据根（真实数据区——P-11 高敏，写操作只允许纯增量安装目录） */
const TT_EXT_DIR = path.join(
  process.env.APPDATA || '', 'com.tauritavern.client', 'data', 'default-user', 'extensions', 'st-zip-converter',
);

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1', timeout: 1_200 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

async function waitPort(port, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`TT ${label}（:${port}）在 ${timeoutMs / 1000}s 内未就绪`);
}

/** 纯增量安装（幂等）：manifest 在即视为已装；缺则拷四件。绝不删除/覆盖目录外任何内容 */
function ensureInstalled() {
  const manifest = path.join(TT_EXT_DIR, 'manifest.json');
  if (fs.existsSync(manifest)) return { installed: 'already' };
  fs.mkdirSync(TT_EXT_DIR, { recursive: true });
  for (const f of ['manifest.json', 'index.js', 'style.css', 'README.md']) {
    fs.copyFileSync(path.join(REPO_ROOT, f), path.join(TT_EXT_DIR, f));
  }
  fs.cpSync(path.join(REPO_ROOT, 'src'), path.join(TT_EXT_DIR, 'src'), { recursive: true });
  return { installed: 'copied' };
}

let childProcesses = [];

/**
 * 拉起 TT 运行时（幂等）：前端静态服务 + 带 CDP 口的 TT exe。
 * @returns {Promise<{frontPortOpen:boolean, cdpOpen:boolean, started:string[]}>}
 */
async function ensureTtRuntime({ timeoutMs = 90_000 } = {}) {
  const started = [];
  // 1. 前端静态服务（1430）——不在则起（detached，进程随本脚本退出由操作系统回收；幂等探活优先）
  if (!(await portOpen(FRONT_PORT))) {
    const srv = spawn('node', ['scripts/tauri-dev-server.mjs'], {
      cwd: TT_ROOT, detached: true, stdio: 'ignore', shell: process.platform === 'win32',
    });
    srv.unref();
    childProcesses.push(srv);
    started.push(`dev-server(pid=${srv.pid})`);
    await waitPort(FRONT_PORT, 30_000, '前端静态服务');
  }
  // 2. CDP 口——不在则启动 TT exe（已有进程则直接复用）
  if (!(await portOpen(CDP_PORT))) {
    ensureInstalled();
    const exe = spawn(path.join(TT_ROOT, 'src-tauri', 'target', 'debug', 'tauritavern.exe'), [], {
      cwd: TT_ROOT, detached: true, stdio: 'ignore',
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}` },
    });
    exe.unref();
    childProcesses.push(exe);
    started.push(`tauritavern.exe(pid=${exe.pid})`);
    await waitPort(CDP_PORT, timeoutMs, 'CDP 调试口');
  }
  return { frontPortOpen: true, cdpOpen: true, started };
}

/**
 * CDP 冒烟（矩阵 tt-cdp 行）：connectOverCDP → 插件痕迹/工作台挂载断言 → 截图。
 * 页面错误只计**可归因本插件**的（TT 自身的扩展更新检查 GitHub 失败是背景噪声，
 * 2026-10-25 实测——判定口径与 harness.isPluginRef 一致由调用方复用）。
 * @returns {Promise<{pass:boolean, details:object, shot?:string}>}
 */
async function ttCdpSmoke({ loadPlaywright, shotPath = '', readyTimeoutMs = 120_000 } = {}) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 15_000 });
  try {
    const pages = browser.contexts().flatMap((c) => c.pages());
    const tt = pages.find((p) => /localhost:1430|tauri:/i.test(p.url()));
    if (!tt) return { pass: false, details: { error: '未找到 TT 前端页面', pages: pages.map((p) => p.url()) } };

    const pluginErrors = [];
    tt.on('pageerror', (e) => { if (/zip-converter|st-zip/i.test(String(e))) pluginErrors.push(String(e).slice(0, 150)); });

    // 前端就绪有界等待（2026-10-25 实测：exe 起来 ≠ WebView 加载完——连 __TAURITAVERN__
    // 全局都还没有就断言会整轮误判 FAIL）。就绪判据=宿主全局出现（detectHost 同款）。
    const ready = await tt.waitForFunction(
      () => typeof window.__TAURITAVERN__ !== 'undefined' || /TauriTavern/i.test(document.title),
      null, { timeout: 60_000 },
    ).then(() => true).catch(() => false);
    if (!ready) return { pass: false, details: { error: 'TT 前端 60s 未就绪（宿主全局未出现）' } };

    // TT 第三方扩展是**延迟激活**（extensions.js `activateDeferredThirdPartyExtensions`：
    // 在 APP_READY 之后 nextPaint → initTokenizers → initScrapers 才加载），
    // 冷启动实测宿主全局出现后约 **25–30s** 本插件才注入痕迹（2026-10-26 复现）。
    // ⇒ 断言前必须有界等待本插件自己的信号，不能读一次就判死。
    //
    // 判据用插件**自注入**的节点（TT/Luker 模式只往宿主扩展行加「打开」+ 扩展菜单项，
    // 不常驻 `.app-container`）：`#st-zip-converter-menu-item` 在扩展菜单容器存在时注入，
    // 之后 `.app-container` / `[class*="st-converter"]` 随工作台挂载出现。
    const pluginSignal = () => tt.evaluate(() => ({
      hasTauriTavernGlobal: typeof window.__TAURITAVERN__ !== 'undefined',
      menuItem: !!document.getElementById('st-zip-converter-menu-item'),
      openBtn: !!document.getElementById('st-zip-converter-open-btn'),
      hasDrawerApp: !!document.querySelector('[class*="st-converter"]'),
      hasAppContainer: !!document.querySelector('.app-container'),
      mentionsPlugin: /数据包互转|st-zip-converter/i.test(document.documentElement.innerHTML),
    }));
    const isLoaded = (r) => r.menuItem || r.openBtn || r.hasDrawerApp || r.hasAppContainer;

    const t0 = Date.now();
    let trace = await pluginSignal();
    while (!isLoaded(trace) && Date.now() - t0 < readyTimeoutMs) {
      await tt.waitForTimeout(3_000);
      trace = await pluginSignal();
    }
    const waitedMs = Date.now() - t0;

    if (shotPath) await tt.screenshot({ path: shotPath }).catch(() => undefined);

    // 「插件痕迹」文本命中（`mentionsPlugin`）单独留档：它可能来自扩展面板列表里的
    // 显示名而**不代表已加载**，只作诊断，不作主判据。
    const pass = trace.hasTauriTavernGlobal && isLoaded(trace) && pluginErrors.length === 0;
    return { pass, details: { ...trace, waitedMs, pluginErrors, pages: pages.length } };
  } finally {
    await browser.close(); // 只断开 CDP 连接，不关 TT 窗口
  }
}

module.exports = { ensureTtRuntime, ensureInstalled, ttCdpSmoke, CDP_PORT, FRONT_PORT, TT_ROOT, TT_EXT_DIR };
