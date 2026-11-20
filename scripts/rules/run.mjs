#!/usr/bin/env node
/**
 * 规则可执行验证入口。
 *
 * 用法：
 *   node scripts/rules/run.mjs                   # 跑全部规则
 *   node scripts/rules/run.mjs --list            # 列出规则（不执行）
 *   node scripts/rules/run.mjs --only=a,b        # 只跑指定 id
 *   node scripts/rules/run.mjs --json            # 机器可读（CI / 其他 agent 消费）
 *   node scripts/rules/run.mjs --verbose         # 连通过项的 detail 一起打印
 *   node scripts/rules/run.mjs --update-baseline # 人工确认后刷新 approved 基线
 *
 * 退出码：0 = 全部通过（SHOULD 失败只警告）；1 = 存在 MUST 失败；2 = 用法错误。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { RULES, ROOT, createContext, selectRules } from './registry.mjs';

const BASELINE_FILE = 'scripts/rules/baseline.json';
const USE_COLOR = process.stdout.isTTY && !process.env.NO_COLOR;

const paint = (code, text) => (USE_COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (t) => paint('32', t);
const red = (t) => paint('31', t);
const yellow = (t) => paint('33', t);
const dim = (t) => paint('2', t);
const bold = (t) => paint('1', t);

/** 终端显示宽度：CJK / 全角按 2 列计，否则表格会被中文挤歪 */
function width(text) {
  let n = 0;
  for (const char of text) {
    n += /[\u1100-\u115f\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(char)
      ? 2
      : 1;
  }
  return n;
}

const pad = (text, target) => `${text}${' '.repeat(Math.max(0, target - width(text)))}`;

function parseArgs(argv) {
  const options = { json: false, list: false, verbose: false, updateBaseline: false, only: [], help: false };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--verbose' || arg === '-v') options.verbose = true;
    else if (arg === '--update-baseline') options.updateBaseline = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--only=')) options.only.push(arg.slice('--only='.length));
    else {
      console.error(`未知参数：${arg}`);
      options.help = true;
      options.bad = true;
    }
  }
  return options;
}

async function loadBaseline() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, BASELINE_FILE), 'utf8'));
  } catch {
    return {};
  }
}

function printTable(results, verbose) {
  const idWidth = Math.max(...results.map((r) => width(r.rule.id)), 22);
  console.log(
    `${pad('规则', idWidth)}  ${pad('级别', 6)}  ${pad('结果', 6)}  ${pad('耗时', 7)}  说明`,
  );
  console.log(dim('─'.repeat(idWidth + 34)));
  for (const item of results) {
    const status = item.error ? red('ERROR') : item.result.ok ? green('PASS') : red('FAIL');
    const level = item.rule.severity === 'MUST' ? bold(item.rule.severity) : yellow(item.rule.severity);
    const summary = item.error ? item.error : item.result.detail.split('\n')[0];
    console.log(
      `${pad(item.rule.id, idWidth)}  ${pad(level, 6)}  ${pad(status, 6)}  ${pad(`${item.ms}ms`, 7)}  ${dim(summary.slice(0, 90))}`,
    );
    if (verbose && !item.error && item.result.detail && item.result.detail.includes('\n')) {
      for (const line of item.result.detail.split('\n').slice(1)) console.log(`    ${line}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(
      [
        '用法: node scripts/rules/run.mjs [选项]',
        '',
        '  --list             列出规则 id / 级别 / 标题',
        '  --only=<id[,id]>   只跑指定规则',
        '  --json             输出 JSON（含每条 detail）',
        '  --verbose          打印通过项的完整 detail',
        '  --update-baseline  人工确认后刷新 approved 基线',
        '  --help             本帮助',
      ].join('\n'),
    );
    process.exit(options.bad ? 2 : 0);
  }

  const rules = selectRules(options.only);
  if (rules.length === 0) {
    console.error(`没有匹配的规则：${options.only.join(',')}`);
    console.error(`可用：${RULES.map((rule) => rule.id).join(', ')}`);
    process.exit(2);
  }

  if (options.list) {
    const idWidth = Math.max(...RULES.map((rule) => width(rule.id)));
    for (const rule of RULES) {
      const level = rule.severity === 'MUST' ? bold(rule.severity) : yellow(rule.severity);
      console.log(`${pad(rule.id, idWidth)}  ${pad(level, 6)}  ${rule.title}`);
    }
    process.exit(0);
  }

  const ctx = createContext({ baseline: await loadBaseline(), updateBaseline: options.updateBaseline });
  const results = [];

  for (const rule of rules) {
    const started = Date.now();
    try {
      const result = await rule.check(ctx);
      results.push({
        rule,
        result: { ok: Boolean(result.ok), detail: String(result.detail ?? ''), evidence: result.evidence },
        ms: Date.now() - started,
      });
    } catch (error) {
      results.push({
        rule,
        error: `${error && error.message ? error.message : error}`,
        ms: Date.now() - started,
      });
    }
  }

  const pending = Object.entries(ctx.pendingBaseline);
  if (pending.length) {
    const baseline = { ...(await loadBaseline()) };
    for (const [key, value] of pending) baseline[key] = value;
    await mkdir(path.join(ROOT, 'scripts/rules'), { recursive: true });
    await writeFile(
      path.join(ROOT, BASELINE_FILE),
      `${JSON.stringify({ ...baseline, _comment: '人工批准的规则正文哈希；改动规则后须重新确认（--update-baseline）' }, null, 2)}\n`,
      'utf8',
    );
  }

  const mustFail = results.filter((item) => item.rule.severity === 'MUST' && !(item.result && item.result.ok));
  const shouldFail = results.filter(
    (item) => item.rule.severity === 'SHOULD' && !(item.result && item.result.ok),
  );
  const ok = mustFail.length === 0;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          root: ROOT,
          ok,
          counts: { total: results.length, passed: results.length - mustFail.length - shouldFail.length, mustFail: mustFail.length, shouldFail: shouldFail.length },
          results: results.map((item) => ({
            id: item.rule.id,
            title: item.rule.title,
            severity: item.rule.severity,
            statement: item.rule.statement,
            ok: item.error ? false : item.result.ok,
            ms: item.ms,
            detail: item.error ? item.error : item.result.detail,
            evidence: item.error ? undefined : item.result.evidence ?? item.rule.evidence,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(ok ? 0 : 1);
  }

  console.log(bold(`\n规则验证 · ${path.relative(process.cwd(), ROOT) || '.'} · ${results.length} 条\n`));
  printTable(results, options.verbose);

  if (pending.length) {
    console.log(dim(`\n基线已更新：${pending.map(([key]) => key).join(', ')}（请连同 ${BASELINE_FILE} 一起提交）`));
  }

  const failures = results.filter((item) => !(item.result && item.result.ok));
  if (failures.length) {
    console.log(`\n${bold('失败明细')}`);
    for (const item of failures) {
      const level = item.rule.severity;
      console.log(`\n${level === 'MUST' ? red('✗') : yellow('!')} ${bold(item.rule.id)} ${dim(`(${level})`)} — ${item.rule.title}`);
      console.log(`  规则：${item.rule.statement}`);
      const detail = item.error || item.result.detail || '(无 detail)';
      for (const line of detail.split('\n')) console.log(`  ${line}`);
      if (item.rule.evidence) console.log(dim(`  依据：${item.rule.evidence}`));
    }
  }

  console.log(
    `\n${ok ? green('PASS') : red('FAIL')}  共 ${results.length} 条 · 通过 ${results.length - mustFail.length - shouldFail.length} · MUST 失败 ${mustFail.length} · SHOULD 失败 ${shouldFail.length}`,
  );
  if (!ok) console.log(dim('有 MUST 失败 → 退出码 1'));
  process.exit(ok ? 0 : 1);
}

await main();
