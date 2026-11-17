/**
 * 实例对管理库 —— 跨宿主 E2E 专用，强制「最多两个实例在线」。
 *
 * 强制点（见 .trellis/spec/guides/instance-testing-discipline.md §1）：
 *   1) startPair 启动前：已有监听数 + 本次启动数 > 2 ⇒ 直接抛错，绝不启动；
 *   2) assertAtMostTwoRunning：扫描注册表端口 8001–8004/8899，>2 监听即抛错；
 *   3) 目标端口已有监听 ⇒ 抛错；两个 id 端口相同 ⇒ 抛错。
 *
 * 只 spawn e2e/lib/instances.cjs 注册表里的 startCmd/startCwd，
 * 绝不写实例目录或配置；日志只落 test-results/e2e-flows/instances/<id>.log。
 * 端口一律取注册表登记值，禁止 3040 / 8000。只用 Node 内置模块。
 *
 * CLI：node tooling/e2e-flows/instance-pair.cjs dev-st dev-luker
 *      启动后打印 JSON 并保持运行；Ctrl+C 时清理本次实例。
 */

'use strict';

const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const { getInstance, INSTANCES } = require(path.join(ROOT, 'e2e', 'lib', 'instances.cjs'));

const LOG_ROOT = path.join(ROOT, 'test-results', 'e2e-flows', 'instances');
/** 强制点：并发上限硬编码为 2，不接受调用方覆盖。 */
const MAX_INSTANCES = 2;
/** 强制点：只扫描注册表涉及的端口（Dev 8001/8003、Real 8002/8004、PT 8899）。 */
const WATCHED_PORTS = Object.values(INSTANCES).map((i) => i.port);
const PORT_TO_ID = new Map(Object.values(INSTANCES).map((i) => [i.port, i.id]));

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const logPathOf = (id) => path.join(LOG_ROOT, `${id}.log`);

/** 单次 TCP 连接探测；连上即视为有监听。 */
function probePort(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

/** 同时探测 IPv4/IPv6 回环，任一成功即视为端口被监听。 */
async function isPortListening(port, timeoutMs = 400) {
  const flags = await Promise.all(['127.0.0.1', '::1'].map((h) => probePort(port, h, timeoutMs)));
  return flags.some(Boolean);
}

/**
 * 强制点：扫描全部登记端口，返回现有监听清单；
 * 若监听数 > 2 直接抛错（不修、不杀、不绕过）。
 */
async function assertAtMostTwoRunning() {
  const checks = await Promise.all(
    WATCHED_PORTS.map(async (port) => ({
      port,
      id: PORT_TO_ID.get(port) || null,
      listening: await isPortListening(port),
    })),
  );
  const listening = checks.filter((c) => c.listening);
  if (listening.length > MAX_INSTANCES) {
    const detail = listening
      .map((c) => `${c.port}${c.id ? `(${c.id})` : ''}`)
      .join(', ');
    throw new Error(
      `已有 ${listening.length} 个实例端口在监听，超过上限 ${MAX_INSTANCES}：${detail}`,
    );
  }
  return listening.map((c) => ({ port: c.port, id: c.id }));
}

/** 工具：轮询直到端口释放；超时抛错。 */
async function waitPortClosed(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortListening(port))) return;
    await delay(200);
  }
  throw new Error(`端口 ${port} 在 ${timeoutMs}ms 内未释放`);
}

/** 单次 HTTP(S) 就绪探测：https 局部忽略自签证书校验。 */
function probeUrl(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let mod;
    try {
      mod = url.startsWith('https:') ? https : http;
    } catch {
      resolve({ ok: false, reason: 'bad-url' });
      return;
    }
    const opts = { timeout: timeoutMs };
    // Luker 自签证书：仅本探针忽略校验，不改进程其它请求行为。
    if (mod === https) opts.rejectUnauthorized = false;
    const req = mod.get(url, opts, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode });
    });
    req.once('timeout', () => {
      req.destroy();
      resolve({ ok: false, reason: 'timeout' });
    });
    req.once('error', (e) => resolve({ ok: false, reason: e.code || e.message }));
  });
}

/**
 * 就绪探测：首选注册表 url；域名不可解析时回退 127.0.0.1:port。
 * 协议仍由注册表 url 决定（ST=HTTP、Luker=HTTPS、PT=HTTP），不靠猜。
 */
async function probeReady(inst, timeoutMs) {
  const first = await probeUrl(inst.url, timeoutMs);
  if (first.ok) return first;
  if (first.reason === 'ENOTFOUND' || first.reason === 'EAI_AGAIN' || first.reason === 'ENODATA') {
    const fallback = new URL(inst.url);
    fallback.hostname = '127.0.0.1';
    return probeUrl(fallback.toString(), timeoutMs);
  }
  return first;
}

/** spawn 注册表命令；日志独立落 test-results，绝不碰实例目录。 */
function spawnInstance(inst) {
  fs.mkdirSync(LOG_ROOT, { recursive: true });
  const logFile = logPathOf(inst.id);
  const logFd = fs.openSync(logFile, 'a');
  const proc = spawn(inst.startCmd[0], inst.startCmd.slice(1), {
    cwd: inst.startCwd,
    windowsHide: true,
    detached: true, // POSIX 独立进程组便于整组终止；Windows 用 taskkill /T 杀树
    stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd); // 子进程已继承 fd，父进程释放自己的副本
  return { proc, logFile };
}

/** 兜底强杀：Windows 用 taskkill /T /F 杀整棵树；POSIX 杀进程组。 */
function forceKill(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      try {
        process.kill(-proc.pid, 'SIGKILL');
      } catch {
        proc.kill('SIGKILL');
      }
    }
  } catch {
    // 进程可能已退出，忽略
  }
}

/** 先 SIGTERM，5s 未退再强杀。 */
async function terminate(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      forceKill(proc);
      finish();
    }, 5000);
    proc.once('exit', finish);
    try {
      if (process.platform === 'win32') proc.kill('SIGTERM');
      else process.kill(-proc.pid, 'SIGTERM');
    } catch {
      forceKill(proc);
      finish();
    }
  });
}

/** 轮询就绪；进程提前退出或超时立即失败，并带日志路径。 */
async function waitReady(inst, proc, timeoutMs, logFile) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null || proc.signalCode !== null) {
      throw new Error(
        `实例 ${inst.id} 进程提前退出（code=${proc.exitCode}, signal=${proc.signalCode}），日志：${rel(logFile)}`,
      );
    }
    const r = await probeReady(inst, 2000);
    if (r.ok) return { status: r.status };
    last = r;
    await delay(500);
  }
  throw new Error(
    `实例 ${inst.id} 就绪超时 ${timeoutMs}ms（url=${inst.url}，最后探针=${JSON.stringify(last)}，日志：${rel(logFile)}）`,
  );
}

async function stopOne(inst, proc) {
  await terminate(proc);
  await waitPortClosed(inst.port, 10000);
}

/**
 * 启动一对（或单个）实例。强制点全部在 spawn 之前完成，失败不产生残留进程。
 * @param {string[]} ids 注册表 id，长度 1–2
 * @param {{readyTimeoutMs?: number}} opts
 */
async function startPair(ids, { readyTimeoutMs = 120000 } = {}) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_INSTANCES) {
    throw new Error(`一次只能启动 1–${MAX_INSTANCES} 个实例（收到 ${Array.isArray(ids) ? ids.length : '非数组'} 个）`);
  }
  const insts = ids.map(getInstance); // 未知 id 直接抛错
  if (new Set(ids).size !== ids.length) throw new Error('实例 id 重复');
  if (new Set(insts.map((i) => i.port)).size !== insts.length) throw new Error('目标实例端口冲突');
  for (const i of insts) {
    // 强制点：默认端口以注册表为准，禁止 3040 / 8000
    if (i.port === 3040 || i.port === 8000) throw new Error(`禁止端口 ${i.port}`);
  }

  // 强制点：启动前确认目标端口无监听
  for (const i of insts) {
    if (await isPortListening(i.port)) {
      throw new Error(`目标端口 ${i.port}（${i.id}）已被监听，拒绝启动`);
    }
  }

  // 强制点：已有实例 + 本次启动数不得超过 2
  const running = await assertAtMostTwoRunning();
  if (running.length + insts.length > MAX_INSTANCES) {
    throw new Error(
      `已有 ${running.length} 个实例在线，再启动 ${insts.length} 个将超过上限 ${MAX_INSTANCES}：${running.map((r) => r.port).join(', ')}`,
    );
  }

  const spawned = [];
  try {
    for (const inst of insts) spawned.push({ inst, ...spawnInstance(inst) });
    const instances = [];
    for (const s of spawned) {
      const ready = await waitReady(s.inst, s.proc, readyTimeoutMs, s.logFile);
      instances.push({
        id: s.inst.id,
        url: s.inst.url,
        port: s.inst.port,
        pid: s.proc.pid,
        log: rel(s.logFile),
        proc: s.proc,
        ready,
        stop: () => stopOne(s.inst, s.proc),
      });
    }
    return {
      instances,
      stopAll: async () => {
        await Promise.all(instances.map((i) => i.stop()));
      },
    };
  } catch (err) {
    // 失败清理：不等端口完全释放（可能根本没监听），只终止已 spawn 的进程
    await Promise.all(
      spawned.map(async (s) => {
        try {
          await terminate(s.proc);
        } catch {
          // 忽略清理异常，保留原始错误
        }
      }),
    );
    throw err;
  }
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0 || ids.length > MAX_INSTANCES) {
    console.error(`用法：node ${rel(__filename)} <idA> [idB]（最多 ${MAX_INSTANCES} 个）`);
    console.error(`可用 id：${Object.keys(INSTANCES).join(', ')}`);
    process.exitCode = 2;
    return;
  }
  let pair;
  try {
    pair = await startPair(ids);
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }, null, 2));
    process.exitCode = 1;
    return;
  }
  const running = await assertAtMostTwoRunning();
  console.log(
    JSON.stringify(
      {
        instances: pair.instances.map((i) => ({
          id: i.id,
          url: i.url,
          port: i.port,
          pid: i.pid,
          readyStatus: i.ready.status,
          log: i.log,
        })),
        runningPorts: running,
        note: `最多 ${MAX_INSTANCES} 个实例上限已生效；Ctrl+C 停止本次实例`,
      },
      null,
      2,
    ),
  );

  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await pair.stopAll();
      console.error('[instance-pair] 本次实例已停止，端口已释放');
    } catch (e) {
      console.error(`[instance-pair] 清理失败：${e.message}`);
      process.exitCode = 1;
    }
  };
  const onSignal = () => {
    cleanup().finally(() => process.exit(process.exitCode || 0));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
}

module.exports = {
  assertAtMostTwoRunning,
  startPair,
  waitPortClosed,
  isPortListening,
  MAX_INSTANCES,
  WATCHED_PORTS,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(JSON.stringify({ error: e.message }, null, 2));
    process.exitCode = 1;
  });
}
