/**
 * docs 隐私守卫：公开文档站只允许面向外人的说明文档。
 *
 * 硬规则（用户裁定）：
 * - docs/ 会被 GitHub Pages 原样部署，绝对不允许出现日期、Trellis/计划/交接/研究内容；
 * - 不允许本机绝对路径、实例目录、环回地址、本机端口、邮箱、真实凭据形态；
 * - 文件名与文件内容都检查，避免“改个名字藏进去”。
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const DOCS = join(ROOT, 'docs');
const TEXT_EXT = new Set(['.md', '.markdown', '.yml', '.yaml', '.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.txt']);

const FORBIDDEN_NAMES = [
  /^plan[\s._-]/i,
  /^.*[\s._-]plan[\s._-]?/i,
  /^handoff/i,
  /^todo/i,
  /^wip/i,
  /^research/i,
  /^tasks?$/i,
  /^\.trellis$/i,
];

const CONTENT_RULES = [
  {
    id: '日期',
    re: /\b(?:19|20)\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b/g,
    message: '绝对日期（年-月-日 / 年/月/日 / 年.月.日）',
  },
  {
    id: '日期',
    re: /\b(?:19|20)\d{2}年(?:\d{1,2}月(?:\d{1,2}日)?)?/g,
    message: '中文日期（年/月/日）',
  },
  {
    id: '相对日期',
    re: /(今天|昨天|明天|本周|上周|下周|最后更新|更新时间|更新日期|近期更新)/g,
    message: '相对日期或更新时间表述',
  },
  {
    id: 'Trellis / 内部流程',
    re: /(\.trellis\b|\bTrellis\b|\bHANDOFF-|\bPLAN-|superpowers|\bPRD\b|\.spec\/)/gi,
    message: 'Trellis、计划、交接、研究或内部规范引用',
  },
  {
    id: '本机绝对路径',
    re: /\b[A-Za-z]:[\\/]/g,
    message: 'Windows 盘符绝对路径',
  },
  {
    id: '本机实例',
    re: /(Instance\/(?:Dev|Real)|\b127\.0\.0\.1\b|\blocalhost\b)/gi,
    message: '本机实例目录、环回地址或 localhost',
  },
  {
    id: '本机端口',
    re: /:(?:3000|3040|4173|800[1-4]|8233|6080|9223)\b/g,
    message: '本机实例或调试端口',
  },
  {
    id: '邮箱',
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    message: '邮箱地址',
  },
  {
    id: '凭据',
    re: /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,})/g,
    message: '真实凭据形态',
  },
];

const hits = [];

function walk(dir, prefix = 'docs') {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    console.error(`docs 隐私守卫无法读取 ${prefix}：${error.message}`);
    process.exit(1);
  }
  for (const entry of entries) {
    const rel = `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (FORBIDDEN_NAMES.some((re) => re.test(entry.name))) {
        hits.push(`${rel} —— 目录名命中内部资料规则`);
        continue;
      }
      walk(full, rel);
      continue;
    }
    if (FORBIDDEN_NAMES.some((re) => re.test(entry.name))) {
      hits.push(`${rel} —— 文件名命中内部资料规则`);
      continue;
    }
    if (!TEXT_EXT.has(extname(entry.name).toLowerCase())) continue;
    const text = readFileSync(full, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      for (const rule of CONTENT_RULES) {
        rule.re.lastIndex = 0;
        const match = rule.re.exec(lines[i]);
        if (!match) continue;
        hits.push(`${rel}:${i + 1} —— ${rule.message}：${match[0]}`);
      }
    }
  }
}

let topEntries = [];
try {
  topEntries = readdirSync(DOCS);
} catch (error) {
  console.error(`docs 隐私守卫无法读取 docs/：${error.message}`);
  process.exit(1);
}
walk(DOCS);

if (hits.length) {
  console.error(`docs 隐私守卫失败：公开文档站出现 ${hits.length} 处禁止内容：`);
  for (const hit of hits) console.error(`  - ${hit}`);
  console.error('日期 / Trellis / 本机路径 / 实例端口 / 邮箱 / 凭据都不得进入 docs/。');
  process.exit(1);
}

console.log(`docs 隐私守卫通过：${topEntries.length} 个公开条目，无日期 / Trellis / 本机路径 / 凭据内容`);
