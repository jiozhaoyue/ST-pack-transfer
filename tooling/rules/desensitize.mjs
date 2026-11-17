#!/usr/bin/env node
/**
 * 脱敏工具：把本地绝对路径 / 用户名 / 邮箱 / 凭据 / 日期 替换为占位符。
 *
 * 用法：
 *   node tooling/rules/desensitize.mjs --dry-run .trellis/spec
 *   node tooling/rules/desensitize.mjs .trellis/spec
 *   node tooling/rules/desensitize.mjs --no-dates .trellis/spec   # 保留日期
 *
 * 占位符：<PATH> <HOME> <USER> <EMAIL> <TOKEN> <DATE>
 * 只处理文本文件；二进制原样跳过。默认不写盘，必须显式 --apply 或省略 --dry-run 的语义见下。
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const stripDates = !argv.includes('--no-dates');
const targets = argv.filter((a) => !a.startsWith('--'));
if (!targets.length) {
  console.error('用法: node tooling/rules/desensitize.mjs [--dry-run] [--no-dates] <路径...>');
  process.exit(2);
}

const TEXT_EXT = /\.(md|markdown|json|jsonl|js|mjs|cjs|ts|txt|yml|yaml|html|css|py|sh|toml|log)$/i;

const RULES = [
  // 本地绝对路径 → <HOME> / <PATH>
  { name: 'win-home', re: /[A-Za-z]:\\\\?Users\\\\?[A-Za-z0-9._-]+/g, to: '<HOME>' },
  { name: 'win-home-fwd', re: /[A-Za-z]:\/Users\/[A-Za-z0-9._-]+/g, to: '<HOME>' },
  { name: 'posix-home', re: /\/c\/Users\/[A-Za-z0-9._-]+/g, to: '<HOME>' },
  { name: 'posix-users', re: /\/Users\/[A-Za-z0-9._-]+/g, to: '<HOME>' },
  { name: 'posix-home2', re: /\/home\/[A-Za-z0-9._-]+/g, to: '<HOME>' },
  // 其它盘符绝对路径（保留盘符语义但去掉具体目录）
  { name: 'drive-path', re: /[A-Za-z]:\\\\?Repo\\\\?[^\s'"`),;\]）】]*/g, to: '<REPO>' },
  { name: 'posix-drive', re: /\/[a-z]\/Repo\/[^\s'"`),;\]）】]*/g, to: '<REPO>' },
  // 通用盘符路径（含 node/playwright 等工具链绝对路径）；排除 http:// 之类协议前缀
  { name: 'drive-any', re: /(?<![A-Za-z])[A-Za-z]:[\\/][A-Za-z0-9_.\-\\/]+/g, to: '<PATH>' },
  // 环境变量展开路径
  { name: 'appdata', re: /%APPDATA%\\\\?[^\s'"`),;]*/gi, to: '<APPDATA>' },
  { name: 'localappdata', re: /%LOCALAPPDATA%\\\\?[^\s'"`),;]*/gi, to: '<LOCALAPPDATA>' },
  // 用户名
  { name: 'user-1', re: /\bcaocaobi\b/gi, to: '<USER>' },
  { name: 'user-2', re: /\bjiozhaoyue\b/gi, to: '<USER>' },
  // 邮箱
  { name: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, to: '<EMAIL>' },
  // 凭据
  { name: 'ghp', re: /ghp_[A-Za-z0-9]{20,}/g, to: '<TOKEN>' },
  { name: 'gh-pat', re: /github_pat_[A-Za-z0-9_]{20,}/g, to: '<TOKEN>' },
  { name: 'glpat', re: /glpat-[A-Za-z0-9_-]{16,}/g, to: '<TOKEN>' },
  { name: 'aws', re: /\bAKIA[0-9A-Z]{16}\b/g, to: '<TOKEN>' },
  { name: 'slack', re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, to: '<TOKEN>' },
  // 内网/私有域名
  { name: 'lan-ip', re: /\b(?:192\.168|10\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, to: '<LAN_IP>' },
];

const DATE_RULES = [
  // 证据列常见形态：`11-05 8a39f8de` → 保留 session，去掉月-日
  { name: 'date-m-d-prefix', re: /\b\d{2}-\d{2}(?:\s*\/\s*\d{2}-\d{2})*\s+(?=[0-9a-z])/g, to: '' },
  { name: 'date-iso', re: /\b20\d{2}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?/g, to: '<DATE>' },
  { name: 'date-cn', re: /20\d{2}\s*年\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?/g, to: '<DATE>' },
  { name: 'date-slash', re: /\b20\d{2}\/\d{1,2}\/\d{1,2}\b/g, to: '<DATE>' },
];

function walk(p) {
  const st = statSync(p);
  if (st.isFile()) return TEXT_EXT.test(p) ? [p] : [];
  const out = [];
  for (const name of readdirSync(p)) {
    if (name === 'node_modules' || name === '.git') continue;
    out.push(...walk(path.join(p, name)));
  }
  return out;
}

const files = targets.flatMap(walk);
const summary = { files: 0, changed: 0, hits: {} };
const details = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.slice(0, 4000).includes('\u0000')) continue;
  summary.files += 1;

  let next = text;
  const local = {};
  const all = stripDates ? [...RULES, ...DATE_RULES] : RULES;
  for (const rule of all) {
    next = next.replace(rule.re, (m) => {
      local[rule.name] = (local[rule.name] || 0) + 1;
      summary.hits[rule.name] = (summary.hits[rule.name] || 0) + 1;
      return rule.to;
    });
  }

  if (next !== text) {
    summary.changed += 1;
    const parts = Object.entries(local).map(([k, v]) => `${k}×${v}`).join(', ');
    details.push(`${file}  ${parts}`);
    if (!dryRun) writeFileSync(file, next, 'utf8');
  }
}

console.log(`${dryRun ? '[DRY-RUN] ' : ''}扫描 ${summary.files} 个文本文件，命中 ${summary.changed} 个`);
console.log('替换统计：');
for (const [k, v] of Object.entries(summary.hits).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${v}`);
}
if (details.length) {
  console.log(`\n受影响文件（前 40 条）：`);
  for (const d of details.slice(0, 40)) console.log('  ' + d);
  if (details.length > 40) console.log(`  … 另有 ${details.length - 40} 个`);
}
console.log(dryRun ? '\n未写入任何文件。去掉 --dry-run 才会落盘。' : '\n已写入。');
