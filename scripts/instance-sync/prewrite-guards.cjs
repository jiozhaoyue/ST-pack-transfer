/**
 * 写入前三道守卫（`design.md` D4.1；`implement.md` §4）
 *
 * 顺序铁律（`design.md` D3）：`产包 → 备份 → 只读快照 → 灌入`。本脚本覆盖「快照之后、灌入之前」
 * 的三道**只读**断言，**不做任何写入**：
 *
 * | 守卫 | 判据 | 失败语义 |
 * | --- | --- | --- |
 * | §4.1 链接守卫 | `lib/link-guard.cjs` 的 `findLinkedRoots` 扫写入根 | **报告**（写入时默认逐条跳过 / 前置拒绝），非中止 |
 * | §4.3 宿主源码禁改断言 | 写入根下的探针路径必须被实例仓 `.gitignore` 覆盖（`git check-ignore -v` **有输出**） | **中止**（落在源码面 = 改宿主源码，`L0-1` 红线） |
 * | §4.5 `.git/objects` 只读冲突预检 | 产物内 `extensions/<扩展>/.git/objects/...` 对应的目标文件若**已存在且带 ReadOnly** ⇒ 原生整包恢复会 `EPERM` 中断 | **中止**（先决定处置，不得先写再撞） |
 *
 * ## 为什么 §4.3 用「子路径探针」而不是直接 `check-ignore <根目录>`
 *
 * 2026-10-13 实测（本机四实例）：`git check-ignore -v data/default-user` **命中**（`.gitignore:52:/data`），
 * 但 `git check-ignore -v public/scripts/extensions/third-party` **不命中** —— 该目录自身的规则
 * （`.gitignore:18` 带尾斜杠、`:54` 不带）对**目录路径**不返回匹配，而对其**子路径**返回
 * （`public/scripts/extensions/third-party/ST-pack-transfer/index.js` ⇒ `.gitignore:54`）。
 * ⇒ 判据统一改成**在写入根下探一个子路径**：只要 `<root>/<任意子>` 被忽略，则 `<root>/<实际子>` 必被忽略
 * （gitignore 语义：忽略目录即忽略其全部内容）。这样对「根自身命中」与「仅子路径命中」两种形态都成立。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/instance-sync/prewrite-guards.cjs                       # 四个有磁盘数据目录的目标
 * node scripts/instance-sync/prewrite-guards.cjs --id dev-st --id real-st
 * node scripts/instance-sync/prewrite-guards.cjs --pack <产物包>        # 附带 §4.5 预检
 * node scripts/instance-sync/prewrite-guards.cjs --out <json>          # 覆盖读数落点
 * ```
 *
 * 读数 → `research/pre-write-guards.json`（`.trellis/tasks/<任务>/research/*.json` 已被 `.gitignore:59` 排除，**不入库**）。
 *
 * @module scripts/instance-sync/prewrite-guards
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { getInstance, REPO_ROOT } = require('../../e2e/lib/instances.cjs');
const { findLinkedRoots } = require('./lib/link-guard.cjs');
const { getNodeIo } = require('./lib/node-zip-io.cjs');

const DEFAULT_OUT = path.join(
  REPO_ROOT, '.trellis', 'tasks', '09-27-plugin-driven-instance-sync', 'research', 'pre-write-guards.json',
);

/** 探针名：刻意用一个**绝不与真实内容同名**的路径 */
const PROBE = '__prewrite_guard_probe__';

/**
 * 每个目标的**写入根**（相对实例仓）。
 *
 * 依据：`import-st.cjs` 的 `RAW_WRITE_ROUTES`（`extensions` → `public/scripts/extensions/third-party`，
 * 其余裸落盘类目 → `userDir/<key>`）+ 端点类目（`characters/chats/worlds/backgrounds/User Avatars`
 * 由宿主服务端写在 `userDir` 下）+ `restore-luker.cjs` 的原生整包恢复（写在 `userDir` 下）。
 * 故 ST 两个根、Luker 一个根即可覆盖**全部**落点。
 */
const WRITE_ROOTS = Object.freeze({
  st: ['data/default-user', 'public/scripts/extensions/third-party'],
  luker: ['data/default-user'],
});

/** 宿主为 null（PT）或无磁盘目录时跳过 */
function rootsOf(inst) {
  return WRITE_ROOTS[inst.host] || [];
}

function parseArgs(argv) {
  const out = { ids: [], pack: '', out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--id') out.ids.push(argv[++i] || '');
    else if (argv[i] === '--pack') out.pack = argv[++i] || '';
    else if (argv[i] === '--out') out.out = argv[++i] || '';
  }
  return out;
}

/** `git check-ignore -v <path>` 是否**有输出**（有 = 被忽略 = 落在数据面） */
function isIgnored(repoDir, relPath) {
  try {
    const out = execFileSync('git', ['-C', repoDir, 'check-ignore', '-v', relPath], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return { ignored: out.length > 0, detail: out };
  } catch (e) {
    // exit 1 = 未命中（`check-ignore` 用退出码表达「不忽略」），不是执行失败
    if (e.status === 1) return { ignored: false, detail: '' };
    return { ignored: false, detail: `执行失败: ${e.message}`, error: true };
  }
}

/** §4.1 + §4.3：逐目标扫链接子树 + 断言写入根落在 `.gitignore` 覆盖面内 */
async function guardTarget(inst) {
  const roots = rootsOf(inst);
  const userDir = path.join(inst.dir, inst.userDir);

  // —— §4.1 链接子树 ——
  const linked = [];
  for (const r of roots) {
    const abs = path.join(inst.dir, ...r.split('/'));
    if (!fs.existsSync(abs)) continue;
    for (const l of await findLinkedRoots(abs)) {
      linked.push({ root: r, rel: `${r}/${l.rel}`, target: l.target || '(断链)' });
    }
  }

  // —— §4.3 宿主源码禁改断言（子路径探针）——
  const sourceFace = [];
  for (const r of roots) {
    const probe = `${r}/${PROBE}`;
    const { ignored, detail, error } = isIgnored(inst.dir, probe);
    if (!ignored) {
      sourceFace.push({ root: r, probe, reason: error ? 'check-ignore 执行失败' : '未被 .gitignore 覆盖（落在源码面）', detail });
    }
  }

  return {
    instance: inst.id, side: inst.side, host: inst.host, port: inst.port,
    repoDir: inst.dir, userDir,
    writeRoots: roots,
    linkGuard: { linked, count: linked.length },
    sourceFace: { violations: sourceFace, pass: sourceFace.length === 0 },
  };
}

/**
 * §4.5 `.git/objects` 只读冲突预检。
 *
 * 只在**产物含** `extensions/**​/.git/objects/**` 时才有对象可查；`--git-mode minimal` 下通常已剥掉，
 * 此时记 `applicable:false`（**不是通过**，是「无对象」——两者必须分清）。
 */
async function guardGitObjects(inst, packPath) {
  const mapEntryToTarget = (n) => {
    if (!n.startsWith('extensions/')) return null;
    const sub = n.slice('extensions/'.length);
    if (inst.host === 'st') return path.join(inst.dir, 'public', 'scripts', 'extensions', 'third-party', ...sub.split('/'));
    if (inst.host === 'luker') return path.join(inst.dir, inst.userDir, 'extensions', ...sub.split('/'));
    return null;
  };

  const io = await getNodeIo();
  const reader = await io.openReader(packPath);
  let scanned = 0;
  const readonlyHits = [];
  const existing = [];
  for await (const e of reader.entries()) {
    if (e.fileName.endsWith('/')) { e.skip(); continue; }
    const n = e.fileName.replace(/\\/g, '/');
    if (!/\/\.git\/objects\//.test(n)) { e.skip(); continue; }
    scanned += 1;
    const dest = mapEntryToTarget(n);
    if (!dest) { e.skip(); continue; }
    if (fs.existsSync(dest)) {
      existing.push(n);
      const st = fs.statSync(dest);
      if ((st.mode & 0o200) === 0) readonlyHits.push({ entry: n, dest, mode: st.mode.toString(8) });
    }
    e.skip();
  }
  await reader.close();
  return {
    applicable: scanned > 0,
    gitObjectsEntries: scanned,
    targetFilesExisting: existing.length,
    readonlyHits,
    pass: readonlyHits.length === 0,
  };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const ids = args.ids.length ? args.ids : ['dev-st', 'real-st', 'dev-luker', 'real-luker'];

  const report = {
    takenAt: new Date().toISOString(),
    pack: args.pack || null,
    targets: [],
    summary: {},
  };

  for (const id of ids) {
    const inst = getInstance(id);
    if (!inst.userDir) {
      console.log(`[${id}] 跳过：无磁盘用户数据目录（纯前端 Profile 存储）`);
      continue;
    }
    const t = await guardTarget(inst);
    if (args.pack) t.gitObjects = await guardGitObjects(inst, args.pack);
    report.targets.push(t);
    console.log(`[${id}] 写入根 ${t.writeRoots.join(' / ')}`);
    console.log(`        §4.1 链接子树 ${t.linkGuard.count} 条`
      + (t.linkGuard.count ? `（${t.linkGuard.linked.map((l) => l.rel).join(', ')}）` : ''));
    console.log(`        §4.3 源码面断言 ${t.sourceFace.pass ? 'PASS' : 'FAIL'}`
      + (t.sourceFace.pass ? '' : ` —— ${t.sourceFace.violations.map((v) => v.probe).join(', ')}`));
    if (t.gitObjects) {
      console.log(`        §4.5 .git/objects 条目 ${t.gitObjects.gitObjectsEntries}`
        + `（目标已存在 ${t.gitObjects.targetFilesExisting} / 只读命中 ${t.gitObjects.readonlyHits.length}）`);
    }
  }

  const sourceFail = report.targets.filter((t) => !t.sourceFace.pass);
  const roFail = report.targets.filter((t) => t.gitObjects && !t.gitObjects.pass);
  report.summary = {
    targets: report.targets.length,
    linkRootsTotal: report.targets.reduce((a, t) => a + t.linkGuard.count, 0),
    sourceFaceViolations: sourceFail.length,
    gitObjectsReadonlyHits: roFail.length,
    ok: sourceFail.length === 0 && roFail.length === 0,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n读数 → ${args.out}`);
  console.log(`判定：${report.summary.ok ? 'PASS（可进入写入）' : 'FAIL（中止写入，先处置）'}`);

  if (!report.summary.ok) process.exit(1);
})().catch((e) => {
  console.error('守卫执行异常：', e && e.stack ? e.stack : e);
  process.exit(2);
});
