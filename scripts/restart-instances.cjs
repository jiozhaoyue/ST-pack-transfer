/**
 * 重启全部实例 + 强制保证插件为最新（一条命令做完）
 *
 * 为什么需要它：插件在两个宿主族里的"最新"语义不同——
 *  · ST / Luker：扩展目录是指向工作区仓的 junction，**代码天然实时**；
 *    但服务进程是旧的，必须重启才会重新扫描扩展。
 *  · PT：扩展存在浏览器 IndexedDB，是**快照**，不会跟随工作区；
 *    必须删掉旧记录、重新安装，才拿得到最新代码。
 * 所以"保证最新"= 校验 junction + 重装 PT + 重启六个进程。
 *
 * 用法：
 *   node scripts/restart-instances.cjs                 # 全部六个
 *   node scripts/restart-instances.cjs --only dev-st,dev-luker
 *   node scripts/restart-instances.cjs --no-restart    # 只做插件同步，不重启进程
 *   node scripts/restart-instances.cjs --wait-secs 300 # 就绪等待上限（默认 300）
 *
 * 就绪等待为何默认 300s（2026-10-25 实测）：Dev Luker 冷启动 163s——服务端插件
 * 自动更新逐个 SSL 超时（GitHub 不可达，每个 30~100s）会拖住监听。90s 旧默认
 * 会误报"超时未就绪"（实例随后仍会起来），e2e:instances 编排器依赖真实就绪态。
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = REPO_ROOT;
const INSTANCES_ROOT = path.resolve(REPO_ROOT, '..', '..', 'Instance');

/** 六个实例登记（端口为唯一判据） */
const ALL = [
  { id: 'dev-st', dir: 'Dev/SillyTavern', port: 8001, cmd: ['node', 'server.js'], pluginDir: 'public/scripts/extensions/third-party' },
  { id: 'real-st', dir: 'Real/SillyTavern', port: 8002, cmd: ['node', 'server.js'], pluginDir: 'public/scripts/extensions/third-party' },
  { id: 'dev-luker', dir: 'Dev/Luker', port: 8003, cmd: ['node', 'server.js'], pluginDir: 'data/default-user/extensions' },
  { id: 'real-luker', dir: 'Real/Luker', port: 8004, cmd: ['node', 'server.js'], pluginDir: 'data/default-user/extensions' },
  { id: 'dev-pt', dir: 'Dev/PureTavern/apps/web', port: 8899, cmd: ['pnpm', 'dev'], pluginDir: null },
  { id: 'real-pt', dir: 'Real/PureTavern/apps/web', port: 8900, cmd: ['pnpm', 'dev', '--port', '8900'], pluginDir: null },
];

const argv = process.argv.slice(2);
const onlyArg = argv.indexOf('--only');
const only = onlyArg > -1 && argv[onlyArg + 1] ? argv[onlyArg + 1].split(',') : null;
const noRestart = argv.includes('--no-restart');
const waitArg = argv.indexOf('--wait-secs');
const waitSecs = waitArg > -1 && Number(argv[waitArg + 1]) > 0 ? Number(argv[waitArg + 1]) : 300;
const targets = only ? ALL.filter((t) => only.includes(t.id)) : ALL;

const PLUGIN_NAME = 'st-zip-converter';

/** 端口是否已监听 */
function isListening(port) {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** 占用该端口的 PID 列表 */
function pidsOn(port) {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()).filter((v) => /^\d+$/.test(v)))];
  } catch {
    return [];
  }
}

function stopInstance(t) {
  const pids = pidsOn(t.port);
  if (pids.length === 0) {
    console.log(`  ${t.id}: 未运行`);
    return;
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch { /* 已退出 */ }
  }
  console.log(`  ${t.id}: 已停止 (PID ${pids.join(', ')})`);
}

/** 校验 ST/Luker 的插件是否为指向工作区的 junction */
function verifyJunction(t) {
  if (!t.pluginDir) return;
  const link = path.join(INSTANCES_ROOT, t.dir, t.pluginDir, PLUGIN_NAME);
  let st;
  try {
    st = fs.lstatSync(link);
  } catch {
    console.log(`  ${t.id}: 插件目录缺失 -> 重建 junction`);
    recreateJunction(link);
    return;
  }
  if (st.isSymbolicLink()) {
    const target = fs.realpathSync(link);
    const want = fs.realpathSync(SRC);
    console.log(`  ${t.id}: junction OK -> ${target === want ? '工作区' : target}`);
    return;
  }
  // 普通目录 = 旧副本，换成 junction
  console.log(`  ${t.id}: 插件是普通目录（旧副本）-> 换成 junction`);
  fs.rmSync(link, { recursive: true, force: true });
  recreateJunction(link);
}

function recreateJunction(link) {
  execSync(`cmd /c mklink /J "${link}" "${SRC}"`, { stdio: 'ignore' });
}

function startInstance(t) {
  const cwd = path.join(INSTANCES_ROOT, t.dir);
  const [bin, ...args] = t.cmd;
  const child = spawn(bin, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
  console.log(`  ${t.id}: 已启动 (PID ${child.pid}) -> 端口 ${t.port}`);
}

async function waitReady(t, timeoutMs = 300_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isListening(t.port)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

(async () => {
  console.log(`目标实例: ${targets.map((t) => t.id).join(', ')}\n`);

  console.log('[1/3] 停止');
  if (!noRestart) targets.forEach(stopInstance);
  else console.log('  (--no-restart，跳过)');
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\n[2/3] 插件同步（强制最新）');
  targets.forEach(verifyJunction);
  const ptTargets = targets.filter((t) => !t.pluginDir);
  if (ptTargets.length > 0) {
    console.log(`  PT 是快照、不跟随工作区 -> 由 install-pt-extension.cjs 重装：${ptTargets.map((t) => t.id).join(', ')}`);
  }

  console.log('\n[3/3] 启动');
  if (!noRestart) {
    for (const t of targets) startInstance(t);
    for (const t of targets) {
      const ok = await waitReady(t, waitSecs * 1000);
      console.log(`  ${t.id}: ${ok ? '就绪' : '超时未就绪'}`);
    }
  } else {
    console.log('  (--no-restart，跳过)');
  }

  console.log('\n完成。');
  if (ptTargets.length > 0) {
    console.log(`PT 插件重装（需要先删旧记录）请接着跑：`);
    console.log(`  node scripts/install-pt-extension.cjs --only ${ptTargets.map((t) => t.id).join(' --only ')} --replace`);
  }
})();
