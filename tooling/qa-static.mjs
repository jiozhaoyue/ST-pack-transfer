/**
 * 一键静态守卫串跑（`npm run qa:static`）——规范化测试流程 L1 层的唯一入口。
 *
 * 按 `docs/TESTING-PROCESS.md` §1 的顺序串行执行 8 条守卫；任何一条非零退出即中止并
 * 以其退出码结束（失败先到先报，不留后续噪音）。全部通过时打印汇总并以 0 退出。
 *
 * 直接以 `node` 拉起各守卫脚本（与 package.json 的 check:* 一一对应），不经 npm/shell 层：
 * 既有守护进程开销，也避开「shell:true + args」的弃用告警。
 */
import { spawnSync } from 'node:child_process';

const GUARDS = [
  ['check:css-scope', 'scripts/css-scope.js'],
  ['check:dom-injection', 'scripts/dom-injection-guard.js'],
  ['check:template-source', 'scripts/single-template-source.js'],
  ['check:dom-scope', 'scripts/dom-scope.js'],
  ['check:control-consumer', 'scripts/control-consumer-guard.js'],
  ['check:no-bundler-only', 'tooling/no-bundler-only.js'],
  ['check:i18n', 'scripts/i18n-guard.js'],
  ['check:copy', 'scripts/copy-audit.js'],
];

const results = [];
for (const [name, script] of GUARDS) {
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  const code = r.status ?? 1;
  results.push([name, code]);
  if (code !== 0) {
    console.error(`\n[qa:static] ${name} 失败（exit ${code}），中止后续守卫。`);
    process.exit(code);
  }
}

console.log('\n[qa:static] 8 条静态守卫全部通过：');
for (const [name] of results) console.log(`  ✓ ${name}`);
