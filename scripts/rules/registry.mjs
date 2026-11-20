/**
 * 规则注册表（single executable entry 的真源）。
 *
 * 每条规则 = 元数据 + 一个**纯函数** check(ctx)。
 * check 返回 `{ ok, detail, evidence? }`，允许 async；不得 exit / 不得写 stdout。
 * 失败汇总与退出码由 `run.mjs` 统一负责——这样规则可以被 JSON 消费、被 --only 单跑、
 * 也可以在测试里直接 import 断言，不必依赖子进程退出码。
 *
 * 加一条新规则：见 ./README.md（3 步）。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const EOL = /\r\n/g;
/** 统一换行，避免同一份文本因 CRLF/LF 被判为漂移 */
export const normalizeEol = (text) => text.replace(EOL, '\n');

/**
 * 构造规则上下文。所有 IO 走这里，规则本身不直接碰 fs：
 * 便于在测试中注入只读快照，也避免每条规则各写一套路径拼接。
 * @param {{root?: string, baseline?: object, updateBaseline?: boolean}} [options]
 */
export function createContext(options = {}) {
  const root = options.root || ROOT;
  const abs = (rel) => path.join(root, rel);
  return {
    root,
    baseline: options.baseline || {},
    updateBaseline: Boolean(options.updateBaseline),
    /** 记录新基线（仅在 --update-baseline 时由 run.mjs 落盘） */
    pendingBaseline: {},
    async read(rel) {
      return normalizeEol(await readFile(abs(rel), 'utf8'));
    },
    async readJson(rel) {
      return JSON.parse(await readFile(abs(rel), 'utf8'));
    },
    async exists(rel) {
      try {
        return (await stat(abs(rel))).isFile();
      } catch {
        return false;
      }
    },
    /** 递归列出文件（相对 root、正斜杠、按扩展名过滤） */
    async list(relDir, extensions = ['.js', '.mjs', '.cjs']) {
      const out = [];
      const walk = async (dir) => {
        let entries;
        try {
          entries = await readdir(abs(dir), { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const rel = `${dir}/${entry.name}`;
          if (entry.isDirectory()) await walk(rel);
          else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(rel);
        }
      };
      await walk(relDir);
      return out.sort();
    },
  };
}

/**
 * 规则条目：
 *   id        稳定标识，供 --only / baseline 引用（kebab-case，不得重命名）
 *   title     人类可读标题
 *   severity  'MUST' | 'SHOULD'（MUST 失败 → 进程退出码 1）
 *   statement 规则原文（一句话，可判定）
 *   evidence  判定依据 / 事故来源 / 证据文件
 *   check     (ctx) => { ok, detail, evidence? }
 */
export const RULES = Object.freeze([
  {
    id: 'iron-rule-copies',
    title: '铁律 0 各 harness 副本必须逐字一致',
    severity: 'MUST',
    statement:
      'AGENTS.md / GEMINI.md / .cursor/rules/*.mdc / .github/copilot-instructions.md 中的 IRON-RULE 块必须存在且内容一致（仅忽略换行符差异）。',
    evidence: '铁律 0 第 2 条：harness 配置不得各自演化；2026-11-17 审计发现 4 份手抄副本。',
    check: (ctx) => import('./checks/iron-rule.mjs').then((m) => m.run(ctx)),
  },
  {
    id: 'tavern-rules-core',
    title: 'TAVERN-RULES 正文单一真源 + 已批准基线',
    severity: 'MUST',
    statement:
      'AGENTS.md 与 CLAUDE.md 的 TAVERN-RULES 块版本、声明哈希必须一致，正文（不含头部注释与「项目覆盖」节）必须逐字一致，且 AGENTS.md 正文哈希等于 baseline.json 记录的已批准值。',
    evidence: '2026-11-17 实测：两份正文已漂移（L0-16 端口 4173 vs 3040），但声明哈希仍同为 sha256:bc9d1c8c…。',
    check: (ctx) => import('./checks/tavern-rules.mjs').then((m) => m.run(ctx)),
  },
  {
    id: 'version-single-source',
    title: '版本号四处真源一致',
    severity: 'MUST',
    statement:
      'package.json、manifest.json、src/core/app-version.js（APP_VERSION / APP_COMMIT）、src/core/changelog.js（最新发布条目）的版本号必须相同。',
    evidence: '宿主直装读 manifest.json，独立态读 APP_VERSION，更新日志读 changelog；任一处落后都会对用户显示错版本。',
    check: (ctx) => import('./checks/version.mjs').then((m) => m.run(ctx)),
  },
  {
    id: 'i18n-no-cjk-literals',
    title: 'UI 源码零硬编码中文字面量',
    severity: 'MUST',
    statement:
      'scripts/i18n-guard.js 的 SCAN_FILES 中，字符串/模板字面量不得出现中文（注释除外）；文案必须来自 src/i18n/locales/**。',
    evidence: '复用 scripts/i18n-guard.js 的 checkI18n()，不另写一套解析。',
    check: (ctx) => import('./checks/i18n.mjs').then((m) => m.run(ctx)),
  },
  {
    id: 'no-git-add-all',
    title: '可执行文件中禁止 git add -A / -u / .',
    severity: 'MUST',
    statement:
      '仓库内可执行脚本（scripts/ tooling/ e2e/ .github/ package.json）不得出现 `git add -A` / `--all` / `-u` / `git add .`，只允许显式 pathspec。',
    evidence: 'L0-7：暂存区全仓唯一，2026-09-26 并发事故；AGENTS.md:173。散文中的禁令不算违规（只扫可执行文件）。',
    check: (ctx) => import('./checks/git-add-all.mjs').then((m) => m.run(ctx)),
  },
  {
    id: 'guard-aggregation-coverage',
    title: '静态守卫必须进聚合入口与 CI',
    severity: 'SHOULD',
    statement:
      'package.json 中每个 check:* 静态守卫都应出现在 tooling/qa-static.mjs 的 GUARDS 列表；CI 应调用 npm run verify:rules。',
    evidence: '2026-11-17 审计：check:docs-privacy 未进 qa-static；.github/workflows/checks.yml 只跑 5 条守卫。',
    check: (ctx) => import('./checks/qa-static-coverage.mjs').then((m) => m.run(ctx)),
  },
]);

/** 按 id 或序号取规则 */
export function selectRules(only) {
  if (!only || only.length === 0) return [...RULES];
  const wanted = new Set(only.flatMap((item) => String(item).split(',')).map((s) => s.trim()));
  return RULES.filter((rule) => wanted.has(rule.id));
}
