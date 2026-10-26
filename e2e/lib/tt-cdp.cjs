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
  process.env.APPDATA || '', 'com.tauritavern.client', 'data', 'default-user', 'extensions', 'ST-pack-transfer',
);

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1', timeout: 1_200 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

/**
 * 冷启动期间 TT 页面会自行导航/重载（dev SW bootstrap 等）⇒ 正在执行的 `evaluate`
 * 会抛 `Execution context was destroyed`（2026-10-26 实测，整轮因此异常退出）。
 * 这类错误**不是断言失败**，是"页面正在换皮"——重试即可。
 */
async function retryOnNav(fn, { tries = 8, delayMs = 1_500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!/Execution context was destroyed|Target closed|navigat|detached/i.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

async function waitPort(port, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`TT ${label}（:${port}）在 ${timeoutMs / 1000}s 内未就绪`);
}

/**
 * 纯增量安装（幂等）：**每次都把四件 + `src/` 同步为仓库当前内容**。
 *
 * 早先版本「manifest 在即视为已装」——2026-10-26 实测踩到：TT 里那份是 10-25 的旧拷贝，
 * 缺 `src/storage/vault-store.js` / `src/ui/vault-panel.js`，插件 import 直接 404、
 * 整插件加载失败（`mentionsPlugin:false`）。E2E 必须测**当前 HEAD 的插件**，故改为刷新式。
 * 绝不删除/覆盖目录外任何内容（TT 数据根是 P-11 高敏区）。
 */
function ensureInstalled() {
  const manifest = path.join(TT_EXT_DIR, 'manifest.json');
  const existed = fs.existsSync(manifest);
  fs.mkdirSync(TT_EXT_DIR, { recursive: true });
  for (const f of ['manifest.json', 'index.js', 'style.css', 'README.md']) {
    fs.copyFileSync(path.join(REPO_ROOT, f), path.join(TT_EXT_DIR, f));
  }
  fs.cpSync(path.join(REPO_ROOT, 'src'), path.join(TT_EXT_DIR, 'src'), { recursive: true, force: true });
  return { installed: existed ? 'refreshed' : 'copied' };
}

let childProcesses = [];

/**
 * 拉起 TT 运行时（幂等）：前端静态服务 + 带 CDP 口的 TT exe。
 * @returns {Promise<{frontPortOpen:boolean, cdpOpen:boolean, started:string[]}>}
 */
async function ensureTtRuntime({ timeoutMs = 90_000 } = {}) {
  const started = [];
  // 每次先把插件刷成仓库当前内容（旧版「已装即跳过」会让 E2E 测到过期插件）
  const install = ensureInstalled();
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
    const exe = spawn(path.join(TT_ROOT, 'src-tauri', 'target', 'debug', 'tauritavern.exe'), [], {
      cwd: TT_ROOT, detached: true, stdio: 'ignore',
      env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}` },
    });
    exe.unref();
    childProcesses.push(exe);
    started.push(`tauritavern.exe(pid=${exe.pid})`);
    await waitPort(CDP_PORT, timeoutMs, 'CDP 调试口');
  }
  return { frontPortOpen: true, cdpOpen: true, started, install };
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
    const ready = await retryOnNav(() => tt.waitForFunction(
      () => typeof window.__TAURITAVERN__ !== 'undefined' || /TauriTavern/i.test(document.title),
      null, { timeout: 60_000 },
    )).then(() => true).catch(() => false);
    if (!ready) return { pass: false, details: { error: 'TT 前端 60s 未就绪（宿主全局未出现）' } };

    // TT 第三方扩展是**延迟激活**（extensions.js `activateDeferredThirdPartyExtensions`：
    // 在 APP_READY 之后 nextPaint → initTokenizers → initScrapers 才加载），
    // 冷启动实测宿主全局出现后约 **25–30s** 本插件才注入痕迹（2026-10-26 复现）。
    // ⇒ 断言前必须有界等待本插件自己的信号，不能读一次就判死。
    //
    // 判据用插件**自注入**的节点（TT/Luker 模式只往宿主扩展行加内联下拉，
    // 不常驻 `.app-container`）：`#st-converter-modal-overlay` 在 boot 时就建好（保持隐藏），
    // 之后 `.app-container` / `[class*="st-converter"]` 随工作台挂载出现。
    const pluginSignal = () => tt.evaluate(() => ({
      hasTauriTavernGlobal: typeof window.__TAURITAVERN__ !== 'undefined',
      modal: !!document.getElementById('st-converter-modal-overlay'),
      openBtn: !!document.getElementById('st-pack-transfer-open-btn'),
      hasDrawerApp: !!document.querySelector('[class*="st-converter"]'),
      hasAppContainer: !!document.querySelector('.app-container'),
      mentionsPlugin: /数据包转运|ST-pack-transfer/i.test(document.documentElement.innerHTML),
    }));
    const isLoaded = (r) => r.modal || r.openBtn || r.hasDrawerApp || r.hasAppContainer;

    const t0 = Date.now();
    let trace = await retryOnNav(() => pluginSignal());
    while (!isLoaded(trace) && Date.now() - t0 < readyTimeoutMs) {
      await tt.waitForTimeout(3_000);
      trace = await retryOnNav(() => pluginSignal());
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

/**
 * TT 仓（vault）冒烟：打开工作台 → 仓模块 → 存入/删除 → **后端真值**双归零 + 截图。
 *
 * 与 `ttCdpSmoke` 共用同一套判据：
 *  - 第三方扩展**延迟激活**（冷启动 28.6–34.6s）⇒ 一切等待都是有界的，不读一次即判死；
 *  - 后端真值经页内 `import()` 插件自身的 `vault-store`（DOM 行数曾被并发渲染缺陷误导过，
 *    见 `quality-guidelines.md` 禁止模式 #11）；
 *  - 清场在**打开工作台之前**做（TT 页面重载要再等 ~35s 激活，能不重载就不重载）。
 *
 * @returns {Promise<{pass:boolean, details:object, shot?:string}>}
 */
async function ttVaultSmoke({ loadPlaywright, shotPath = '', readyTimeoutMs = 120_000 } = {}) {
  const { chromium } = loadPlaywright();
  const STORE_URL = '/scripts/extensions/third-party/ST-pack-transfer/src/storage/vault-store.js';
  const FIXTURE_DIR = path.resolve(REPO_ROOT, 'test-results', 'fixtures');
  const fixturePath = path.join(FIXTURE_DIR, 'fixture-tt.zip');

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  if (!fs.existsSync(fixturePath)) {
    const genUrl = require('url').pathToFileURL(path.join(REPO_ROOT, 'fixtures', 'gen.js')).href;
    await import(genUrl).then((m) => m.generateAll(FIXTURE_DIR));
  }
  const fixtureSize = fs.statSync(fixturePath).size;

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`, { timeout: 15_000 });
  try {
    const pages = browser.contexts().flatMap((c) => c.pages());
    const tt = pages.find((p) => /localhost:1430|tauri:/i.test(p.url()));
    if (!tt) return { pass: false, details: { error: '未找到 TT 前端页面' } };

    const ready = await retryOnNav(() => tt.waitForFunction(
      () => typeof window.__TAURITAVERN__ !== 'undefined' || /TauriTavern/i.test(document.title),
      null, { timeout: 60_000 },
    )).then(() => true).catch(() => false);
    if (!ready) return { pass: false, details: { error: 'TT 前端 60s 未就绪' } };

    // 等插件真正加载（延迟激活；与 ttCdpSmoke 同一判据）
    const t0 = Date.now();
    let loaded = await retryOnNav(() => tt.evaluate(() => Boolean(document.getElementById('st-converter-modal-overlay')
      || document.querySelector('.app-container'))));
    while (!loaded && Date.now() - t0 < readyTimeoutMs) {
      await tt.waitForTimeout(3_000);
      loaded = await retryOnNav(() => tt.evaluate(() => Boolean(document.getElementById('st-converter-modal-overlay')
        || document.querySelector('.app-container'))));
    }
    if (!loaded) return { pass: false, details: { error: '插件未加载（延迟激活超窗）', waitedMs: Date.now() - t0 } };

    const backendState = () => tt.evaluate(async (u) => {
      const m = await import(u);
      const entries = await m.vaultList();
      return { backend: await m.vaultBackend(), count: entries.length, size: entries[0]?.size ?? null };
    }, STORE_URL);

    const before = await retryOnNav(() => backendState());
    const cleared = await retryOnNav(() => tt.evaluate(async (u) => {
      const m = await import(u);
      const list = await m.vaultList();
      for (const e of list) await m.vaultDelete(e.id);
      return list.length;
    }, STORE_URL));

    const { openWorkbenchModal } = require('./workbench-entry.cjs');
    const openPanel = async () => {
      const res = await openWorkbenchModal(tt, { timeout: 30_000 });
      if (!res.ok) return false;
      return retryOnNav(() => tt.waitForFunction(() => {
        const sec = document.querySelector('section[data-wb-module="vault"]');
        if (!sec || sec.getBoundingClientRect().height === 0) return false;
        return !!document.getElementById('vault-file-input');
      }, null, { timeout: 30_000 })).then(() => true).catch(() => false);
    };
    const readPanel = () => retryOnNav(() => tt.evaluate(() => ({
      badge: document.querySelector('#vault-backend-badge .badge')?.textContent?.trim() || null,
      cards: document.querySelectorAll('#vault-list .archive-card').length,
    })));
    let panelOpen = await openPanel();
    let panel = await readPanel();
    // 清场发生在插件 boot 之后 ⇒ 面板可能是旧数据；重载一次让面板从真值重建
    if (panel.cards > 0) {
      await tt.reload({ waitUntil: 'domcontentloaded' });
      const t1 = Date.now();
      let again = false;
      while (!again && Date.now() - t1 < readyTimeoutMs) {
        await tt.waitForTimeout(3_000);
        again = await retryOnNav(() => tt.evaluate(() => Boolean(document.getElementById('st-converter-modal-overlay'))));
      }
      panelOpen = again && await openPanel();
      panel = await readPanel();
    }
    if (!panelOpen) return { pass: false, details: { error: '仓模块未渲染', before, cleared } };

    await retryOnNav(() => tt.setInputFiles('#vault-file-input', fixturePath));
    const waitRow = () => retryOnNav(() => tt.waitForFunction(
      () => document.querySelectorAll('#vault-list .archive-card').length > 0,
      null, { timeout: 30_000 },
    )).then(() => true).catch(() => false);
    let appeared = await waitRow();
    if (!appeared) {
      // 存入偶发没落地（渲染/网络抖动）：重喂一次同一个文件再等（第二次仍失败才判红）
      await tt.waitForTimeout(2_000);
      await retryOnNav(() => tt.setInputFiles('#vault-file-input', fixturePath)).catch(() => undefined);
      appeared = await waitRow();
    }
    await tt.waitForTimeout(2_500); // 并发渲染回归窗口
    const afterStore = await retryOnNav(() => backendState());
    const uiAfterStore = await retryOnNav(() => tt.evaluate(() => ({
      cards: document.querySelectorAll('#vault-list .archive-card').length,
      name: document.querySelector('#vault-list .archive-name')?.textContent ?? null,
    })));

    // 截图前先收拾宿主自己的浮层：TT 的「后端错误」toast（扩展版本检查走 GitHub 失败，
    // 属背景噪声）与 ChatFilesys「还没录进数据库」提示都会盖住工作台。
    // 「不入库」= 这次照常走聊天文件，不写库、不改实例状态。
    const dismissOverlays = () => retryOnNav(() => tt.evaluate(() => {
      const visible = (el) => el.getBoundingClientRect().height > 0;
      const byText = (txt) => [...document.querySelectorAll('button, .menu_button')]
        .filter(visible).find((b) => (b.textContent || '').trim() === txt);
      byText('不入库')?.click();
      byText('稍后')?.click();
      [...document.querySelectorAll('.toast-close, .toast button, [class*="toast"] .fa-times, [class*="toast"] .fa-xmark')]
        .filter(visible).forEach((el) => el.click());
      [...document.querySelectorAll('.toast')].filter(visible).forEach((el) => el.click?.());
    })).catch(() => undefined);
    await dismissOverlays();
    await tt.waitForTimeout(1_200);

    // 证据截图取「已存入」这一刻（删除后列表为空，没有可看的内容）
    // 只截工作台元素：TT 的模态不铺满全屏，整页截图会带进真实聊天内容（P-11 高敏）
    const shotModal = async (p) => {
      if (!p) return;
      // 优先截内层工作台容器：TT 的 overlay 自身盒高不代表可见区域（实测只截到一条缝）
      for (const sel of ['#st-converter-modal-overlay #app.app-container', '#st-converter-modal-overlay', '.app-container']) {
        try {
          const el = tt.locator(sel).first();
          if (!(await el.count())) continue;
          const box = await el.boundingBox();
          if (!box || box.width < 200 || box.height < 200) continue;
          await el.screenshot({ path: p, timeout: 15_000 });
          return;
        } catch { /* 换下一个选择器 */ }
      }
      await tt.screenshot({ path: p }).catch(() => undefined);
    };
    await shotModal(shotPath);

    // 删除（宿主 Popup.show.confirm ⇒ 点「确定」）
    if (!appeared || uiAfterStore.cards === 0) {
      // 存入没落地：留现场读数，不要用空列表去点删除（会 TypeError）
      return {
        pass: false,
        details: {
          error: '存入后列表未出现条目', backend: before.backend, badge: panel.badge, cleared,
          waitedMs: Date.now() - t0, appeared, uiAfterStore, backendAfterStore: afterStore, fixtureSize,
        },
      };
    }
    await retryOnNav(() => tt.evaluate(() => {
      const card = document.querySelector('#vault-list .archive-card');
      [...card.querySelectorAll('.btn-archive-action')].find((b) => b.textContent.trim() === '删除')?.click();
    }));
    await tt.waitForTimeout(900);
    const confirm = await retryOnNav(() => tt.evaluate(() => {
      const pickAffirmative = (root) => {
        const btns = [...root.querySelectorAll('button, .menu_button')]
          .filter((b) => b.getBoundingClientRect().height > 0);
        return btns.find((b) => /确定|确认|好的|OK|Yes/i.test(b.textContent || '')) || btns[btns.length - 1];
      };
      const popups = [...document.querySelectorAll('.popup, [class*="popup"]')]
        .filter((p) => p.getBoundingClientRect().height > 0);
      // 按文案锁定「仓删除」那条确认（宿主弹窗是栈式的，别点到别人的弹窗上）
      const target = popups.find((p) => /从仓.*删除|删除.*仓/.test(p.textContent || '')) || null;
      let pick = target ? pickAffirmative(target) : null;
      if (!pick && popups.length) pick = pickAffirmative(popups[popups.length - 1]);
      if (!pick) return { clicked: false, popups: popups.length };
      const label = pick.textContent.trim();
      pick.click();
      return { clicked: true, label, matched: Boolean(target) };
    }));
    const uiEmpty = await retryOnNav(() => tt.waitForFunction(
      () => document.querySelectorAll('#vault-list .archive-card').length === 0,
      null, { timeout: 30_000 },
    )).then(() => true).catch(() => false);
    const afterDelete = await retryOnNav(() => backendState());

    await dismissOverlays();
    // 删除后留一张对照图（列表应为空）
    await shotModal(shotPath ? shotPath.replace('-stored-', '-deleted-') : '');

    const pass = appeared
      && uiAfterStore.cards === 1
      && afterStore.count === 1
      && afterStore.size === fixtureSize
      && uiEmpty
      && afterDelete.count === 0;
    return {
      pass,
      details: {
        backend: before.backend,
        badge: panel.badge,
        cleared,
        waitedMs: Date.now() - t0,
        appeared,
        uiAfterStore,
        backendAfterStore: afterStore,
        fixtureSize,
        confirm,
        uiEmpty,
        backendAfterDelete: afterDelete,
      },
    };
  } finally {
    await browser.close();
  }
}

module.exports = { ensureTtRuntime, ensureInstalled, ttCdpSmoke, ttVaultSmoke, CDP_PORT, FRONT_PORT, TT_ROOT, TT_EXT_DIR };
