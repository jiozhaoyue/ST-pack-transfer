#!/usr/bin/env node
/**
 * 规则校验入口：npm run verify:rules
 *
 * 用法：
 *   node tooling/rules/run.mjs                 跑全部
 *   node tooling/rules/run.mjs --list          列出规则清单
 *   node tooling/rules/run.mjs --only=css-scope,no-secret-leak
 *   node tooling/rules/run.mjs --json          机器可读输出
 *   node tooling/rules/run.mjs --fast          跳过 SHOULD 级慢检查
 *
 * 退出码：任一 MUST 失败 → 1；仅 SHOULD 失败 → 0（但会显著提示）。
 */
import { checks } from './checks.mjs';

const argv = process.argv.slice(2);
const has = (flag) => argv.some((a) => a === flag || a.startsWith(flag + '='));
const valueOf = (flag) => {
  const hit = argv.find((a) => a.startsWith(flag + '='));
  return hit ? hit.slice(flag.length + 1) : null;
};

const useJson = has('--json');
const fast = has('--fast');
const onlyArg = valueOf('--only');
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;

if (has('--list') || has('-l')) {
  const rows = checks.map((c) => `${c.id.padEnd(26)} ${c.severity.padEnd(7)} ${c.rule.padEnd(7)} ${c.title}`);
  console.log(rows.join('\n'));
  process.exit(0);
}

const selected = checks.filter((c) => (only ? only.has(c.id) : true) && (!fast || c.severity === 'MUST'));

const C = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

async function main() {
  const started = Date.now();
  const results = [];

  for (const check of selected) {
    const t0 = Date.now();
    let outcome;
    try {
      outcome = await check.run();
    } catch (err) {
      outcome = { ok: false, detail: `检查自身抛错：${err && err.message ? err.message : String(err)}`, items: [] };
    }
    results.push({
      id: check.id,
      rule: check.rule,
      title: check.title,
      severity: check.severity,
      ok: Boolean(outcome && outcome.ok),
      detail: (outcome && outcome.detail) || '',
      items: (outcome && outcome.items) || [],
      ms: Date.now() - t0,
    });
  }

  const mustFail = results.filter((r) => !r.ok && r.severity === 'MUST');
  const shouldFail = results.filter((r) => !r.ok && r.severity === 'SHOULD');

  if (useJson) {
    console.log(JSON.stringify({ ok: mustFail.length === 0, total: results.length, results }, null, 2));
  } else {
    console.log('');
    console.log(`${C.cyan}RULES 校验${C.reset}  ${selected.length} 项  ${C.dim}${Date.now() - started}ms${C.reset}`);
    console.log('');
    for (const r of results) {
      const mark = r.ok ? `${C.green}PASS${C.reset}` : r.severity === 'MUST' ? `${C.red}FAIL${C.reset}` : `${C.yellow}WARN${C.reset}`;
      const head = `${mark}  ${r.id.padEnd(26)} ${C.dim}${r.rule.padEnd(6)}${C.reset} ${r.title}`;
      console.log(head);
      if (r.detail) console.log(`      ${C.dim}${r.detail}${C.reset}`);
      for (const item of r.items.slice(0, 8)) {
        const loc = item.line ? `${item.file}:${item.line}` : item.file;
        console.log(`      ${C.red}-${C.reset} ${loc}  ${item.text}`);
      }
      if (r.items.length > 8) console.log(`      ${C.dim}… 另有 ${r.items.length - 8} 项${C.reset}`);
    }
    console.log('');
    if (mustFail.length) {
      console.log(`${C.red}✗ ${mustFail.length} 项 MUST 失败：${mustFail.map((r) => r.id).join(', ')}${C.reset}`);
      console.log(`${C.dim}按 RULES.md 判断：未通过前不得声称完成。${C.reset}`);
    } else {
      console.log(`${C.green}✓ 全部 MUST 通过${C.reset}${shouldFail.length ? `（${shouldFail.length} 项 SHOULD 待处理：${shouldFail.map((r) => r.id).join(', ')}）` : ''}`);
    }
    console.log('');
  }

  process.exit(mustFail.length === 0 ? 0 : 1);
}

main();
