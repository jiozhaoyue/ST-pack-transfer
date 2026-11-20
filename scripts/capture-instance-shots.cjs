#!/usr/bin/env node
/**
 * 实例侧 UI 截图采集（2026-11-14 用户裁定：全部截图落盘存档，**不读内容**）。
 *
 * 错峰纪律（一次只跑一个 dev 实例，与 `run-e2e-instances.cjs` 同源）：
 *   dev-st(8001) → dev-luker(8003) → pt-web(8899)，轮到谁起谁、拍完即停；TT 走 e2e:instances 自带截图。
 * 产物：`test-results/screenshots/instances/<host>-<场景>.png`（.gitignore 覆盖，严禁入库）。
 *
 * 用法：node scripts/capture-instance-shots.cjs [--only dev-st] [--base-out test-results/screenshots/instances]
 * 前置：本机实例仓在标准布局（`../../Instance`，可用 TAVERN_INSTANCES_ROOT 覆盖）。
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const { INSTANCES } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'instances.cjs'));
const { loadPlaywright } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'resolve-playwright.cjs'));
const { openWorkbenchModal } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'workbench-entry.cjs'));

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx > -1 ? argv[onlyIdx + 1] : null;
const outIdx = argv.indexOf('--base-out');
const OUT_DIR = outIdx > -1 ? path.resolve(argv[outIdx + 1])
  : path.join(REPO_ROOT, 'test-results', 'screenshots', 'instances');

function log(msg) { process.stdout.write(`${msg}\n`); }

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1', timeout: 1200 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

async function waitPort(port, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function pidsOn(port) {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((v) => /^\d+$/.test(v)))];
  } catch { return []; }
}

async function startHost(inst) {
  if (await portOpen(inst.port)) { log(`  ▶ ${inst.id} 已在线，复用（收尾不停它）`); return { started: false }; }
  const [bin, ...args] = inst.startCmd;
  const child = spawn(bin, args, { cwd: inst.startCwd, detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
  child.unref();
  log(`  ▶ 已启动 ${inst.id}（PID ${child.pid}）→ :${inst.port}`);
  const ok = await waitPort(inst.port, 300_000);
  if (!ok) throw new Error(`${inst.id}(:${inst.port}) 300s 未就绪`);
  return { started: true };
}

function stopHost(inst, started) {
  if (!started) return; // 别人原本在跑的保持原样
  for (const pid of pidsOn(inst.port)) {
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* 已退出 */ }
  }
  log(`  ⏹ 已停 ${inst.id}`);
}

async function captureHost(inst, browser, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 950 },
    ignoreHTTPSErrors: inst.host === 'luker',
  });
  ctx.setDefaultTimeout(30_000);
  const page = await ctx.newPage();
  const shot = async (name) => {
    const file = path.join(outDir, `${inst.id}-${name}.png`);
    await page.screenshot({ path: file });
    log(`  ✓ ${path.basename(file)}`);
  };
  try {
    await page.goto(inst.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // 宿主就绪：等 splash 关 / 扩展抽屉锚点出现（有界）
    await page.waitForFunction(() => !document.querySelector('#loader.splash-screen')
      && Boolean(document.getElementById('extensions-settings-button')), null, { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await shot('01-loaded');

    // 打开插件态工作台（复用实例 E2E 的同一条真实路径）
    const opened = await openWorkbenchModal(page, { timeout: 60_000 });
    if (opened.ok) {
      await page.waitForTimeout(1500);
      await shot('02-workbench-modal');
      // Git 视图（数据包侧页签）
      const gitTab = page.locator('#zone-side-tabs [data-sidetab="git"]').first();
      if (await gitTab.isVisible().catch(() => false)) {
        await gitTab.click().catch(() => {});
        await page.waitForTimeout(1500);
        await shot('03-git-viz');
      }
      // 迁移与备份面板
      const transferBtn = page.locator('#chart-card .view-switch-btn[data-wbview="transfer"]').first();
      if (await transferBtn.isVisible().catch(() => false)) {
        await transferBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
        await shot('04-transfer');
      }
      // 扩展管理面板
      const extBtn = page.locator('.view-switch-btn[data-wbview="extension"]').first();
      if (await extBtn.isVisible().catch(() => false)) {
        await extBtn.click().catch(() => {});
        await page.waitForTimeout(1500);
        await shot('05-extmgr');
      }
    } else {
      log(`  ⚠ ${inst.id} 工作台未打开：${opened.reason || ''}（已拍就绪态）`);
      await shot('02-workbench-unavailable');
    }
  } catch (e) {
    log(`  ✗ ${inst.id} 采集异常：${e && e.message}`);
    try { await shot('99-error'); } catch { /* 落盘失败就算了 */ }
  } finally {
    await ctx.close();
  }
}

async function main() {
  const ids = only ? [only] : ['dev-st', 'dev-luker', 'pt-web'];
  const browser = await loadPlaywright().chromium.launch();
  for (const id of ids) {
    const inst = INSTANCES[id];
    if (!inst) { log(`未知实例 ${id}`); process.exit(2); }
    log(`── ${id}（:${inst.port}）──`);
    let started = false;
    try {
      ({ started } = await startHost(inst));
      await captureHost(inst, browser, OUT_DIR);
    } catch (e) {
      log(`  ✗ ${id}：${e && e.message}`);
    } finally {
      stopHost(inst, started);
    }
  }
  await browser.close();
  log(`截图采集完成 → ${OUT_DIR}`);
}

main().catch((e) => { console.error('采集异常：', e); process.exit(1); });
