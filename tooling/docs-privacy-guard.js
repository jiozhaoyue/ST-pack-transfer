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
import { execFileSync } from 'node:child_process';

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

/**
 * 公开文档站的真实发布口径 = GitHub Pages 工作流检出的**已入库**内容。
 *
 * `deploy.yml` 用 `actions/checkout` 检出后 `source: ./docs` 交给 Jekyll 构建，
 * 被 `.gitignore` 忽略的文件不在检出树里，永远不会上传，例如 `/docs/PLAN-*`。
 * 本地守卫若仍扫它们，就会在「本地干净、CI 也干净」的情况下报假失败，
 * 并诱导把约定内的计划文件搬离 `docs/`——所以这里按同一口径跳过被忽略项。
 *
 * 失败方向必须收紧：git 不可用时返回空集合，等于「一个都不跳过」，全量检查。
 */
function ignoredInDocs() {
  const set = new Set();
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', 'docs'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const line of out.split(/\r?\n/)) {
      const rel = line.trim().replace(/\\/g, '/');
      if (rel) set.add(rel);
    }
  } catch {
    return set;
  }
  return set;
}

const IGNORED = ignoredInDocs();
const skipped = [];

/** 目录整体被忽略时，git 只列目录里的文件，故按前缀判断。 */
function isIgnoredDir(rel) {
  const prefix = `${rel}/`;
  for (const item of IGNORED) {
    if (item.startsWith(prefix)) return true;
  }
  return false;
}

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
        if (isIgnoredDir(rel)) {
          skipped.push(`${rel}/`);
          continue;
        }
        hits.push(`${rel} —— 目录名命中内部资料规则`);
        continue;
      }
      walk(full, rel);
      continue;
    }
    if (FORBIDDEN_NAMES.some((re) => re.test(entry.name))) {
      if (IGNORED.has(rel)) {
        skipped.push(rel);
        continue;
      }
      hits.push(`${rel} —— 文件名命中内部资料规则`);
      continue;
    }
    if (!TEXT_EXT.has(extname(entry.name).toLowerCase())) continue;
    if (IGNORED.has(rel)) {
      skipped.push(rel);
      continue;
    }
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
if (skipped.length) {
  console.log(`按 .gitignore 跳过 ${skipped.length} 项（不进 Pages 检出树）：`);
  for (const item of skipped) console.log(`  - ${item}`);
}
