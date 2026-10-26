/**
 * e2e:instances 统一入口 —— 「guard 断言 → 错峰逐宿主冒烟矩阵 → 产物落盘」
 *
 * 矩阵（任务 10-25-e2e-instances-runner / 父任务 R-C2；TT 行依 10-25-tt-cdp-probe 结论并入）：
 *   dev-st    8001 http  ：smoke（挂载/注入点/零本插件报错）+ matrix（上传-转换-下载等 M1-M9）
 *   dev-luker 8003 https ：smoke + matrix（含宿主拉取 selection 透传读数）
 *   dev-pt    8899 http  ：pt-load（插件加载/注入/工作台渲染；persistent context 天然 headed）
 *   tt-cdp    9223 cdp   ：ensureTtRuntime + ttCdpSmoke（挂载/工作台/零本插件报错）
 *
 * 设计约束：
 *  - **错峰执行（2026-10-25 用户裁定，计入规则 spec/guides/e2e-instances-runner.md）**：
 *    同一时刻**只保被测宿主在线**——轮到谁才起谁、其余停机；收尾默认全停（--keep-up 保留）。
 *    宿主服务常驻 ×4 + Playwright 叠加是 dev-luker 偶发挂载失败与单测超时 flake 的实测负载根源。
 *  - **单宿主失败不阻断其余**（AC-2）：逐宿主独立捕获 + 失败 spec 重试一次；任一失败退出码 1。
 *  - HTTP 宿主全部经 `e2e/run.cjs`（内置 guard 域名强制/实例解析），TT 走 `e2e/lib/tt-cdp.cjs`。
 *  - guard 阶段为纯静态断言，零宿主负载，最先跑。
 *  - 产物：`test-results/instances/<host>-<date>.md` + `summary-*.md` + tt 截图。
 *
 * 用法：
 *   npm run e2e:instances
 *   node scripts/run-e2e-instances.cjs --skip-restart   # 宿主启停照旧，但跳过 PT 重装前的全量重启
 *   node scripts/run-e2e-instances.cjs --only dev-st,tt-cdp
 *   node scripts/run-e2e-instances.cjs --keep-up        # 收尾不停宿主
 */

const { execFileSync, execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'test-results', 'instances');
const { INSTANCES } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'instances.cjs'));
const ttCdp = require(path.join(REPO_ROOT, 'e2e', 'lib', 'tt-cdp.cjs'));

const argv = process.argv.slice(2);
const onlyArg = argv.indexOf('--only');
const onlyHosts = onlyArg > -1 && argv[onlyArg + 1] ? argv[onlyArg + 1].split(',') : null;
const skipRestart = argv.includes('--skip-restart');
const keepUp = argv.includes('--keep-up');

/** 宿主矩阵声明：spec 为 e2e/run.cjs 的参数序列（逐条独立跑，累计判定） */
const HOSTS = [
  { id: 'dev-st', label: 'Dev SillyTavern (8001, http)', specs: [['smoke', ['--only', 'smoke', '--instance', 'dev-st']], ['matrix', ['--only', 'matrix', '--instance', 'dev-st']], ['vault', ['--only', 'vault', '--instance', 'dev-st']]] },
  { id: 'dev-luker', label: 'Dev Luker (8003, https)', specs: [['smoke', ['--only', 'smoke', '--instance', 'dev-luker']], ['matrix', ['--only', 'matrix', '--instance', 'dev-luker']], ['vault', ['--only', 'vault', '--instance', 'dev-luker']]] },
  { id: 'dev-pt', label: 'Dev PureTavern (8899, http, headed)', specs: [['pt-load', ['--only', 'pt-load', '--instance', 'pt-web']], ['vault', ['--only', 'vault', '--instance', 'pt-web']]] },
  { id: 'tt-cdp', label: 'TauriTavern (9223, CDP)', specs: null },
];

const stamp = new Date().toISOString().slice(0, 10);
const results = [];

function log(msg) { process.stdout.write(`${msg}\n`); }

function writeHostReport(host, lines) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${host}-${stamp}.md`);
  fs.writeFileSync(file, [`# ${host} · ${new Date().toISOString()}`, '', ...lines, ''].join('\n'));
  return file;
}

/** execFileSync 的 timeout 兜底：子进程若被孙进程（headed Chrome 等）持有 stdio 管道，
 *  execFileSync 会等 EOF 永不返回（2026-10-25 实测挂死形态）——超时强杀并抛错。 */
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 8 * 60_000, ...opts });
}

// ────────────────────────── 错峰启停（同一时刻只保被测宿主） ──────────────────────────

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
  throw new Error(`${label}（:${port}）在 ${timeoutMs / 1000}s 内未就绪`);
}

function pidsOn(port) {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((v) => /^\d+$/.test(v)))];
  } catch { return []; }
}

/** 实例登记键映射（编排器宿主 id → instances.cjs 键；PT 在登记表里叫 pt-web） */
const INSTANCE_KEY = { 'dev-st': 'dev-st', 'dev-luker': 'dev-luker', 'dev-pt': 'pt-web' };

/** 停一个 HTTP 宿主（端口判据；Luker 冷启动重启的开销由「轮到才起」承担） */
function stopHttpHost(id) {
  const inst = INSTANCES[INSTANCE_KEY[id] || id];
  if (!inst) return;
  const pids = pidsOn(inst.port);
  for (const pid of pids) {
    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* 已退出 */ }
  }
  if (pids.length) log(`  ⏹ 已停 ${id}（PID ${pids.join(',')}）`);
}

/** 起 HTTP 宿主（instances.cjs 登记的 startCmd；Luker 冷启动最长 300s——插件自动更新 SSL 超时实测 163s） */
async function startHttpHost(id) {
  const inst = INSTANCES[INSTANCE_KEY[id] || id];
  if (!inst) throw new Error(`未知宿主 ${id}`);
  if (await portOpen(inst.port)) { log(`  ▶ ${id} 已在线，复用`); return; }
  const [bin, ...args] = inst.startCmd;
  const child = spawn(bin, args, { cwd: inst.startCwd, detached: true, stdio: 'ignore', shell: process.platform === 'win32' });
  child.unref();
  log(`  ▶ 已启动 ${id}（PID ${child.pid}）→ :${inst.port}`);
  await waitPort(inst.port, 300_000, `${id} 就绪`);
}

/** 停 TT 运行时（exe + 静态 dev server） */
function stopTtRuntime() {
  try { execSync('taskkill /IM tauritavern.exe /T /F', { stdio: 'ignore' }); log('  ⏹ 已停 TauriTavern'); } catch { /* 未在跑 */ }
  for (const port of [ttCdp.FRONT_PORT, ttCdp.CDP_PORT]) {
    for (const pid of pidsOn(port)) {
      try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* 已退出 */ }
    }
  }
}

/** 错峰调度：轮到 keepId——停其余（HTTP 三家互斥 + TT 与全部 HTTP 互斥） */
async function isolateHost(keepId) {
  const httpIds = ['dev-st', 'dev-luker', 'dev-pt'];
  for (const id of httpIds.filter((h) => h !== keepId)) stopHttpHost(id);
  if (keepId !== 'tt-cdp') stopTtRuntime();
}

/** 全停（收尾默认；--keep-up 保留） */
function stopAll() {
  for (const id of ['dev-st', 'dev-luker', 'dev-pt']) stopHttpHost(id);
  stopTtRuntime();
}

// ────────────────────────── PT 本地 zip 安装（正名 + 持久档案 + spawn 异步） ──────────────────────────

async function installPtExtension() {
  const zipPath = path.join(OUT_DIR, 'ST-pack-transfer.zip'); // zip 名=扩展目录名（folderName 实测取自文件名）
  fs.mkdirSync(OUT_DIR, { recursive: true });
  run('git', ['archive', '--format=zip', '-o', zipPath, 'HEAD']);
  const http = require('http');
  const serve = http.createServer((req, res) => {
    // ACAO：PT 页面（dev-pt.localhost:8899）跨源拉本 zip，无此头被浏览器 CORS 拦（2026-10-25 实测）
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': fs.statSync(zipPath).size,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(zipPath).pipe(res);
  });
  await new Promise((r) => serve.listen(0, '127.0.0.1', r));
  const port = serve.address().port;
  // ⚠ 必须用异步 spawn：execFileSync 会阻塞本进程事件循环，同进程 http server
  // 无法响应 PT 的 zip 拉取 ⇒ 死锁挂死（2026-10-25 实测两轮）。
  const installOnce = () => new Promise((resolve) => {
    const child = spawn('node', ['scripts/install-pt-extension.cjs', '--only', 'dev-pt', '--replace'], {
      cwd: REPO_ROOT,
      env: { ...process.env, PT_EXT_URL: `http://127.0.0.1:${port}/ST-pack-transfer.zip` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* 已退出 */ } }, 5 * 60_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
  try {
    let r = await installOnce();
    if (r.code !== 0) {
      log(`  ⎇ PT 重装首试失败（exit ${r.code}），重试：\n${r.out.slice(-300)}`);
      r = await installOnce();
    }
    if (r.code !== 0) throw new Error(`exit ${r.code}\n${r.out.slice(-400)}`);
    log(r.out.trim().split('\n').slice(-2).join('\n'));
  } finally {
    serve.close();
  }
}

// ────────────────────────── 主流程 ──────────────────────────

(async () => {
  const targets = onlyHosts ? HOSTS.filter((h) => onlyHosts.includes(h.id)) : HOSTS;

  // ── 阶段 1：guard（纯静态断言，零宿主负载）──
  log('\n[1/2] guard 断言');
  let guardPass = false;
  try {
    const out = run('node', ['e2e/run.cjs', '--only', 'guard']);
    guardPass = !/\[FAIL\]/.test(out) && /\[OK\]/.test(out);
    log(out.trim().split('\n').slice(-3).join('\n'));
  } catch (e) {
    log(`  guard 异常：${String(e.stdout || e.message).slice(0, 300)}`);
  }
  results.push({ host: 'guard', pass: guardPass, detail: guardPass ? '全绿' : '见上方输出' });

  // ── 阶段 2：错峰矩阵（同一时刻只保被测宿主在线）──
  for (const host of targets) {
    log(`\n──── 矩阵 · ${host.label} ────`);
    const lines = [];
    let pass = true;

    // 错峰：停其余 → 起被测
    try {
      await isolateHost(host.id);
      if (host.id === 'tt-cdp') {
        const rt = await ttCdp.ensureTtRuntime({ timeoutMs: 120_000 });
        log(`  ▶ TT 就绪：${rt.started.length ? `新起 ${rt.started.join(' / ')}` : '复用既有进程'}`);
      } else {
        await startHttpHost(host.id);
        if (host.id === 'dev-pt' && !skipRestart) {
          // PT 扩展是浏览器快照：每轮重装才拿得到当前 HEAD（--replace + 本地 zip + 持久档案）
          log('  ⚙ PT 扩展重装（--replace + 本地 zip 源）');
          await installPtExtension();
        }
      }
    } catch (e) {
      log(`  ⚠ 宿主准备失败：${String(e).slice(0, 200)}`);
      results.push({ host: host.id, pass: false, detail: `宿主准备失败: ${String(e).slice(0, 150)}` });
      continue;
    }

    if (host.id === 'tt-cdp') {
      try {
        const { loadPlaywright } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'resolve-playwright.cjs'));
        const shot = path.join(OUT_DIR, `tt-cdp-${stamp}.png`);
        const r = await ttCdp.ttCdpSmoke({ loadPlaywright, shotPath: shot });
        pass = r.pass;
        lines.push(`- ttCdpSmoke: ${r.pass ? 'PASS' : 'FAIL'}`, `- 读数: ${JSON.stringify(r.details)}`, `- 截图: ${shot}`);
        log(`  tt-cdp: ${r.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(r.details).slice(0, 160)}`);

        // 仓（vault）行：与加载冒烟共用同一 TT 进程（TT 冷启动一次 ~35s，重开代价高）
        const vaultShot = path.join(OUT_DIR, `vault-tt-cdp-stored-${stamp}.png`);
        const v = await ttCdp.ttVaultSmoke({ loadPlaywright, shotPath: vaultShot });
        if (!v.pass) pass = false;
        lines.push(`- ttVaultSmoke: ${v.pass ? 'PASS' : 'FAIL'}`, `- 读数: ${JSON.stringify(v.details)}`, `- 截图: ${vaultShot}`);
        log(`  tt-vault: ${v.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(v.details).slice(0, 200)}`);
      } catch (e) {
        pass = false;
        lines.push(`- 异常: ${String(e).slice(0, 300)}`);
        log(`  tt-cdp 异常: ${String(e).slice(0, 200)}`);
      }
    } else {
      for (const [name, args] of host.specs) {
        const runSpec = () => {
          try {
            const out = run('node', ['e2e/run.cjs', ...args]);
            return { ok: !/\[FAIL\]/.test(out), out };
          } catch (e) {
            return { ok: false, out: String(e.stdout || '') + String(e.message || '') };
          }
        };
        // 连跑下的时序脆弱（2026-10-25 实测：dev-luker 轮偶发「插件未挂载」）⇒ 失败重试一次再判死
        let r = runSpec();
        if (!r.ok) {
          log(`  ${name}: 首试失败，重试一次（时序吸收）`);
          r = runSpec();
        }
        const oks = (r.out.match(/\[OK\]/g) || []).length;
        lines.push(`- ${name}: ${r.ok ? 'PASS' : 'FAIL'}（${oks} [OK]）`);
        r.out.trim().split('\n').filter((l) => /\[FAIL\]|\[OK\]/.test(l)).slice(0, 40).forEach((l) => lines.push(`  ${l.trim()}`));
        log(`  ${name}: ${r.ok ? 'PASS' : 'FAIL'}（${oks} [OK]）`);
        if (!r.ok) { pass = false; lines.push('```', r.out.trim().slice(0, 2_000), '```'); }
      }
    }
    const file = writeHostReport(host.id, lines);
    results.push({ host: host.id, pass, detail: file });
  }

  // ── 收尾：默认全停（--keep-up 保留）──
  if (!keepUp) {
    log('\n[收尾] 停全部测试宿主（--keep-up 可保留）');
    stopAll();
  }

  const failed = results.filter((r) => !r.pass);
  const summary = [
    `# e2e:instances 汇总（错峰执行） · ${new Date().toISOString()}`, '',
    '| 宿主 | 结果 | 产物 |', '| --- | --- | --- |',
    ...results.map((r) => `| ${r.host} | ${r.pass ? '✅' : '❌'} | ${r.detail} |`),
    '',
    failed.length ? `**${failed.length} 项失败**：${failed.map((f) => f.host).join(', ')}` : '**全绿**',
  ].join('\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `summary-${stamp}.md`), summary);
  log(`\n${summary}\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  log(`编排器异常: ${e}`);
  if (!keepUp) { try { stopAll(); } catch { /* 尽力 */ } }
  process.exit(1);
});
