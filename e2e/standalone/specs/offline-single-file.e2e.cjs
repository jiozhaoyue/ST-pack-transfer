/**
 * file:// 单文件离线产物（S7）：**真的双击能用**，不是提示页。
 *
 * 与 `file-protocol.e2e.cjs` 的分工：
 *  - 那个 spec 钉的是**既有 HTTP 构建产物**在 `file://` 下的边界（module 脚本被 CORS 拒 ⇒ 白屏 + 提示页）；
 *  - 本 spec 钉的是**离线单文件产物**（`npm run build:offline` 的产出）在 `file://` 下**确实可用**：
 *    工作台渲染、零外部资源请求、能完成一次真实「选包 → 转换 → 领取结果」。
 *
 * 判定纪律（本仓栽过的坑）：
 *  - 「触发了下载」≠「文件已保存」⇒ 这里把产物**落盘后读回条目**再断言；
 *  - 跨源/失败请求必须为 **0**——「自包含」不是靠嘴说的，是靠请求读数说的；
 *  - 前置门：先要一条非空读数（工作台就绪、计划就绪），否则两侧同为 0 时断言恒真。
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');
const common = require('../lib/common.cjs');

const OFFLINE_HTML = path.join('dist-offline', 'st-zip-converter-offline.html');

/** 源码里最新的 mtime（与运行器的判据同源：只看得见「改」，看不见「删」） */
function newestSourceMtime(repoRoot) {
  let newest = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      const m = fs.statSync(p).mtimeMs;
      if (m > newest) newest = m;
    }
  };
  for (const f of ['index.js', 'index.html', 'style.css', 'package.json']) {
    const p = path.join(repoRoot, f);
    if (fs.existsSync(p)) newest = Math.max(newest, fs.statSync(p).mtimeMs);
  }
  walk(path.join(repoRoot, 'src'));
  walk(path.join(repoRoot, 'scripts', 'offline'));
  return newest;
}

function ensureOfflineBuild(repoRoot, t) {
  const out = path.join(repoRoot, OFFLINE_HTML);
  const stale = !fs.existsSync(out) || newestSourceMtime(repoRoot) > fs.statSync(out).mtimeMs;
  if (!stale) {
    t.log('  · 离线产物是新的，跳过构建');
    return out;
  }
  t.log(`  · ${fs.existsSync(out) ? '离线产物比源码旧' : '离线产物不存在'}，执行 npm run build:offline ...`);
  const res = spawnSync('npm', ['run', 'build:offline'], { cwd: repoRoot, stdio: 'inherit', shell: true });
  if (res.status !== 0) throw new Error(`build:offline 失败（exit=${res.status}）`);
  return out;
}

module.exports = {
  name: 'file:// 单文件离线产物：真双击可用（渲染 + 零外部请求 + 完成一次转换）',
  async run(t, h, ctx) {
    const { page, rec } = h;

    const offlinePath = ensureOfflineBuild(ctx.repoRoot, t);
    t.ok('O1 离线单文件产物存在（前置门）', fs.existsSync(offlinePath), offlinePath);

    const html = fs.readFileSync(offlinePath, 'utf8');
    t.ok('O2 产物是**单文件**（不含指向本地 assets/ 的外部引用）',
      !/(?:src|href)\s*=\s*"(?!data:|#|https:\/\/github\.com)[^"]+"/.test(html));
    t.ok('O3 产物内联了离线标记（worker-client 据此确定走主线程降级）',
      html.includes('__ST_ZIP_OFFLINE__'));

    const fileUrl = pathToFileURL(offlinePath).href;

    // 「自包含」的判据必须是**网络层**读数：数 `http(s)://` 请求。
    // 不能沿用夹具的 `rec.crossOrigin`——它的基准 origin 取自**运行器传进来的 HTTP 站点**
    // （本 spec 自己导航到 file://），于是文档本身与 blob: 全被误记成「跨源」
    // （2026-10-13 实测：8 条里 7 条是产物自己的 blob: 下载 URL）。口径错了，读数就无意义。
    //
    // 另外必须**先离开运行器打开的 HTTP 页面**再挂监听：那个页面的懒加载资源（字体）
    // 会在 domcontentloaded 之后才发请求，否则会被算进本 spec 的读数里
    // （2026-10-13 实测：1 条 `http://127.0.0.1:4173/.../fa-solid-900.woff2`，来自运行器的 dist 站点）。
    await page.goto('about:blank').catch(() => {});

    const externalRequests = [];
    page.on('request', (req) => {
      const u = req.url();
      if (/^https?:/i.test(u)) externalRequests.push(u);
    });

    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(500);

    t.eq('O4 确实在 file:// 协议下（读数有效）', await page.evaluate(() => location.protocol), 'file:');

    const ready = await ctx.waitForReady(page);
    t.ok('O5 工作台**真的初始化了**（`#env-badge` 脱离「检测中...」）', Boolean(ready), String(ready));

    const shell = await page.evaluate(() => ({
      appChildren: (document.getElementById('app') || { children: [] }).children.length,
      hasFileInput: Boolean(document.getElementById('file-input')),
      hasConvertBtn: Boolean(document.getElementById('btn-convert')),
      hasWizardRail: Boolean(document.getElementById('wizard-rail')),
      railSteps: document.querySelectorAll('#wizard-rail [data-wb-step]').length,
      view: (document.getElementById('app') || {}).dataset?.wbView || '',
      step: (document.getElementById('app') || {}).dataset?.wbStep || '',
    }));
    t.log(`  · 外壳读数：${JSON.stringify(shell)}`);
    t.ge('O6 `#app` 已被工作台填充（不是白屏）', shell.appChildren, 1);
    t.eq('O7 关键控件就绪（`#file-input`）', shell.hasFileInput, true);
    t.eq('O8 转换按钮存在（`#btn-convert`）', shell.hasConvertBtn, true);
    t.eq('O9 向导步骤条渲染（6 步）', shell.railSteps, 6);
    t.eq('O10 默认入口是**向导**视图', shell.view, 'wizard');
    t.eq('O11 向导起始步是「来源」', shell.step, 'source');

    // ── 真实转换：选包 → 转换 → 领取结果（**沿向导步骤条走**，不是绕开它）──
    const fixtures = await common.ensureFixtures(ctx.fixtureDir);
    await page.setInputFiles('#file-input', fixtures['fixture-st.zip']);
    t.ok('O12 上传源包后计划预览就绪', await common.waitForPlan(page));

    // 向导把非当前步的区块隐藏起来（这正是它的作用）⇒ 必须逐步导航，
    // 不能像高级模式那样一次点到底。这本身就是对向导导航的验证。
    const gotoStep = async (step) => {
      await page.click(`#wizard-rail [data-wb-step="${step}"]`);
      await page.waitForFunction((s) => {
        const app = document.getElementById('app');
        return Boolean(app) && app.dataset.wbStep === s;
      }, step, { timeout: 10_000 });
      return page.evaluate(() => document.getElementById('app').dataset.wbStep);
    };

    t.eq('O13 向导可跳到「目标」步', await gotoStep('target'), 'target');
    const targetVisible = await page.isVisible('#target-select');
    t.eq('O14 跳到「目标」步后目标选择器**可见**（步骤披露生效）', targetVisible, true);
    await page.selectOption('#target-select', 'l');

    t.eq('O15 向导可跳到「范围」步', await gotoStep('scope'), 'scope');
    const scopeVisible = await page.isVisible('#category-panel');
    t.eq('O16 「范围」步显示类目面板', scopeVisible, true);

    t.eq('O17 向导可跳到「检查」步', await gotoStep('check'), 'check');
    const checkText = await page.$eval('#wizard-check-summary', (el) => el.textContent.trim());
    t.ok('O18 「检查」步给出了计划读数（非空前置门）', checkText.length > 0, checkText);

    t.eq('O19 向导可跳到「执行」步', await gotoStep('run'), 'run');
    await page.click('#btn-convert');

    t.eq('O20 向导可跳到「核对」步', await gotoStep('verify'), 'verify');
    const names = await common.waitForQueue(page, 1, 180_000);
    t.ok('O21 转换产出进入待导出区', Array.isArray(names) && names.length >= 1,
      JSON.stringify(names));

    const saved = await common.downloadFirstRow(page, ctx.fixtureDir, 'offline-out.zip');
    const zip = await common.readZip(saved);
    t.ge('O22 领取的产物是**可读的 zip**（落盘后读回条目，不只看「触发了下载」）',
      zip.names.length, 1);

    // 「高级模式」切换：同一份 DOM，不复制第二套 UI
    await page.click('#btn-wb-view-toggle');
    const advanced = await page.evaluate(() => ({
      view: document.getElementById('app').dataset.wbView,
      targetVisible: !!(document.getElementById('target-select') || {}).offsetParent,
      queueVisible: !!(document.getElementById('export-queue-panel') || {}).offsetParent,
    }));
    t.eq('O23 切到「高级模式」后视图码正确', advanced.view, 'advanced');
    t.eq('O24 高级模式下各步区块**同时可见**（回到既有全量展示）', advanced.targetVisible, true);

    // ── 自包含读数（必须在**所有**交互之后取：交互过程中才可能暴露外部依赖）──
    t.log(`  · 外部 http(s) 请求：${externalRequests.length} 条 ${JSON.stringify(externalRequests.slice(0, 5))}`);
    t.log(`  · 失败请求：${rec.failedRequests.length} 条 ${JSON.stringify(rec.failedRequests.slice(0, 3))}`);
    t.log(`  · 4xx/5xx 响应：${rec.badResponses.length} 条`);
    t.log(`  · 控制台错误：${rec.consoleErrors.length} 条 ${JSON.stringify(rec.consoleErrors.slice(0, 3))}`);

    t.eq('O25 全程**零外部 http(s) 请求**（自包含，不是「碰巧没触发」）',
      externalRequests.length, 0, JSON.stringify(externalRequests.slice(0, 5)));
    t.eq('O26 全程**零失败请求**', rec.failedRequests.length, 0,
      JSON.stringify(rec.failedRequests.slice(0, 5)));
    t.eq('O27 全程零 4xx/5xx 响应', rec.badResponses.length, 0,
      JSON.stringify(rec.badResponses.slice(0, 5)));
    t.eq('O28 全程零页面错误', rec.pageErrors.length, 0,
      JSON.stringify(rec.pageErrors.slice(0, 3)));
  },
};
