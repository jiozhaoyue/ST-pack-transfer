/**
 * 规则目录自动校验器 —— 规则注册表
 *
 * 设计原则：
 * 1. 每条检查都是纯函数，返回 { ok, detail, items }，不修改任何文件。
 * 2. 检查 ID 与规则目录「校验矩阵」一一对应。
 * 3. 新规则必须同时在此登记检查，否则规则目录的条数上限机制失效。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* ---------- 工具函数 ---------- */

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitSafe(args) {
  try {
    return git(args);
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

function trackedFiles() {
  return gitSafe(['ls-files']).split('\n').map((s) => s.trim()).filter(Boolean);
}

function readText(rel) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, 'utf8');
}

function isBinary(text) {
  return text.slice(0, 8000).includes('\u0000');
}

/** 逐行匹配，返回 [{file, line, text}] */
function grepLines(relPath, regex, opts = {}) {
  const text = readText(relPath);
  if (text === null || isBinary(text)) return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (opts.skipComment && /^\s*(\/\/|\*|#|<!--)/.test(line)) return;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      out.push({ file: relPath, line: i + 1, text: line.trim().slice(0, 200), match: m[0] });
      if (!re.global) break;
    }
  });
  return out;
}

function walk(dirRel, filter) {
  const out = [];
  const abs = path.join(ROOT, dirRel);
  if (!existsSync(abs)) return out;
  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of readdirSync(cur)) {
      const full = path.join(cur, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === '.git') continue;
        stack.push(full);
      } else if (filter(name)) {
        out.push(path.relative(ROOT, full).split(path.sep).join('/'));
      }
    }
  }
  return out;
}

function runNode(scriptRel, args = [], timeout = 120000) {
  try {
    const stdout = execFileSync(process.execPath, [scriptRel, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, detail: tail(stdout) };
  } catch (err) {
    const out = ((err.stdout || '') + (err.stderr || '')).trim();
    return { ok: false, detail: tail(out) || `exit code ${err.status ?? 'unknown'}` };
  }
}

function tail(s, n = 12) {
  if (!s) return '';
  const lines = s.trim().split(/\r?\n/);
  return lines.slice(-n).join('\n');
}

/* ---------- 常量 ---------- */

const HARNESS_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
];

/** 规则真源（唯一）：判据与校验映射 */
const RULES_FILE = '.trellis/spec/guides/rule-catalog.md';
/** 技术细则清单 */
const DETAILS_FILE = '.trellis/spec/guides/rule-details.md';
/** 注入源（hook 读取的铁律） */
const IRON_FILE = '.trellis/spec/guides/iron-rules.md';
/** 触发词索引 */
const TRIGGERS_FILE = '.trellis/spec/guides/rule-triggers.md';

const POINTER_MARK = 'RULES-POINTER v1';

const SECRET_PATTERNS = [
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub classic PAT'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub fine-grained PAT'],
  [/glpat-[A-Za-z0-9_-]{20,}/, 'GitLab PAT'],
  [/sk-[A-Za-z0-9]{32,}/, 'OpenAI 类密钥'],
  [/AKIA[0-9A-Z]{16}/, 'AWS Access Key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack Token'],
];

/* ---------- 检查项 ---------- */

export const checks = [
  {
    id: 'pointer-consistency',
    rule: 'R-01',
    title: '指针协议：规则只存一份，其余文件只放指针',
    severity: 'MUST',
    run() {
      const rulesText = readText(RULES_FILE);
      if (!rulesText) return { ok: false, detail: '规则目录（rule-catalog.md）不存在' };

      const items = [];
      const cursorDir = path.join(ROOT, '.cursor/rules');
      const targets = [...HARNESS_FILES];
      if (existsSync(cursorDir)) {
        for (const f of readdirSync(cursorDir)) {
          if (f.endsWith('.mdc')) targets.push(`.cursor/rules/${f}`);
        }
      }

      for (const rel of targets) {
        const text = readText(rel);
        if (text === null) {
          items.push({ file: rel, line: 0, text: '文件不存在' });
          continue;
        }
        if (!text.includes(POINTER_MARK)) {
          items.push({ file: rel, line: 0, text: `缺少指针标记 ${POINTER_MARK}` });
        }
      }

      // 禁止复制：规则目录中的长条文不得逐字出现在其它规则文件
      const longLines = rulesText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 40 && !s.startsWith('|') && !s.startsWith('#') && !s.startsWith('```'))
        // 指针模板本身就是要求各文件逐字一致，不算「复制条文」
        .filter((s) => !/RULES-POINTER|唯一真源|不得复制 RULES\.md/.test(s));
      for (const rel of targets) {
        const text = readText(rel);
        if (!text) continue;
        for (const line of longLines) {
          if (text.includes(line)) {
            items.push({ file: rel, line: 0, text: `逐字复制了规则目录条文：${line.slice(0, 60)}…` });
            break;
          }
        }
      }

      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `${targets.length} 个规则文件指针一致，无逐字复制` : `${items.length} 处不符合指针协议`,
        items,
      };
    },
  },

  {
    id: 'tavern-block-integrity',
    rule: 'R-01',
    title: '基石规则块完整性：声明哈希必须与正文一致（禁止静默漂移）',
    severity: 'MUST',
    run() {
      const files = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'];
      const START = '<!-- TAVERN-RULES:START';
      const END = '<!-- TAVERN-RULES:END -->';
      const HASH_RE = /内容哈希:\s*sha256:([0-9a-f]{64})/;
      // 与 tavern-harness/scripts/modules/rules_sync.py 的 norm()+sha() 完全一致：
      // norm = text.replace("\r\n","\n")；sha = sha256(norm(text).encode("utf-8")).hexdigest()
      const sha = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

      const items = [];
      const bodies = new Map();

      for (const rel of files) {
        const text = readText(rel);
        if (text === null) {
          items.push({ file: rel, line: 0, text: '文件不存在' });
          continue;
        }
        const s = text.indexOf(START);
        const e = text.indexOf(END, s);
        if (s < 0 || e < 0) {
          items.push({ file: rel, line: 0, text: '缺少 TAVERN-RULES 块边界' });
          continue;
        }
        const lines = text.slice(s, e).split('\n');
        const hi = lines.findIndex((l) => HASH_RE.test(l));
        if (hi < 0) {
          items.push({ file: rel, line: 0, text: '块内缺少声明哈希' });
          continue;
        }
        const declared = HASH_RE.exec(lines[hi])[1];
        const oi = lines.findIndex((l, i) => i > hi && /^##\s*项目覆盖\s*$/.test(l.trim()));
        if (oi < 0) {
          items.push({ file: rel, line: 0, text: '块内缺少「项目覆盖」节' });
          continue;
        }
        // 正文范围：声明哈希行之后 → 「项目覆盖」标题之前的末尾空行之前，
        // 与 render_body() 的 "\n".join(lines) 加尾部换行一致。
        const body = lines.slice(hi + 1, oi - 1).join('\n') + '\n';
        bodies.set(rel, body);
        const actual = sha(body);
        if (declared !== actual) {
          items.push({
            file: rel,
            line: text.slice(0, s).split('\n').length + hi,
            text: '声明哈希与实际正文不符',
          });
        }
      }

      // 三份文件的「规则正文」必须一致（防止只改了一个）
      const present = [...bodies.values()];
      if (present.length > 1) {
        const first = present[0];
        for (const [rel, body] of bodies) {
          if (body !== first) {
            items.push({ file: rel, line: 0, text: '规则正文与其它 harness 文件不一致' });
          }
        }
      }

      return {
        ok: items.length === 0,
        detail:
          items.length === 0
            ? `${files.length} 份 harness 规则块声明哈希与正文一致，且正文互相同步`
            : `${items.length} 处基石规则块完整性异常`,
        items,
      };
    },
  },

  {
    id: 'rule-paths-resolve',
    rule: 'R-01',
    title: '规则引用可达：规则文件内引用的路径必须存在（禁止陈旧/断联）',
    severity: 'MUST',
    run() {
      // 扫描目标：harness 文件、规则真源四件套，以及规则目录 / 校验器目录下的文件
      const targets = [
        ...HARNESS_FILES,
        RULES_FILE,
        DETAILS_FILE,
        IRON_FILE,
        TRIGGERS_FILE,
        ...walk('.trellis/spec/guides', (n) => n.endsWith('.md')),
        ...walk('tooling/rules', (n) => /\.(mjs|cjs|js)$/.test(n)),
      ];
      // 去重，避免同一文件被重复报告
      const files = [...new Set(targets)];

      // 陈旧字面量：用拼接构造，避免校验器源码自身命中该判据
      const staleLiterals = ['RULES' + '.md', 'RULES-DETAILS' + '.md'];
      // 反引号内 token：只保留形如仓库相对路径、且带受支持扩展名的片段
      const tokenRe = /`([^`\n]+)`/g;
      const pathExtRe = /\.(md|mjs|cjs|js|json)$/;
      /* 只把「明确表达路径」的 token 当路径校验，避免把裸文件名误报成断联：
         - 含 `/` 或 `\` 的相对/绝对路径
         - 或以仓库已知顶层目录开头（src/、tooling/、.trellis/ …）
         裸文件名（如 `transform.js`、`delta.js`）是可读性写法，语义是「某个模块」而非路径，
         对它做存在性判定必然大量误报，最终会让守卫本身被忽略。 */
      const KNOWN_TOP_DIRS = [
        'src', 'tooling', 'test', 'docs', 'scripts', 'e2e', 'fixtures', 'public', 'download',
        'dist', 'dist-offline', 'out', 'zip', 'data-zip', 'tmp', '.trellis', '.github', '.cursor',
      ];
      const looksLikePath = (token) =>
        token.includes('/') || token.includes('\\')
        || KNOWN_TOP_DIRS.some((dir) => token === dir || token.startsWith(dir + '/'));
      // 仅校验「规则真源自身」的指针可达性：harness 指针块与规则四件套。
      // 其余 spec 文档里的示例路径属说明性引用，不在本检查的强制面内。
      const strictFiles = new Set([...HARNESS_FILES, RULES_FILE, DETAILS_FILE, IRON_FILE, TRIGGERS_FILE]);
      let checked = 0;

      const items = [];
      for (const rel of files) {
        const text = readText(rel);
        if (text === null || isBinary(text)) continue;
        const absFile = path.join(ROOT, rel);

        // 额外硬判：文件内出现陈旧的旧规则文件名，且仓库根无同名文件 → 陈旧路径引用
        text.split(/\r?\n/).forEach((line, i) => {
          for (const lit of staleLiterals) {
            if (line.includes(lit) && !existsSync(path.join(ROOT, lit))) {
              items.push({ file: rel, line: i + 1, text: `陈旧路径引用：${lit}（仓库根无同名文件）` });
            }
          }
        });

        // 路径可达性：仅对指针/真源文件执行；先按仓库根解析，再按当前文件目录解析
        if (!strictFiles.has(rel)) continue;
        let m;
        tokenRe.lastIndex = 0;
        while ((m = tokenRe.exec(text)) !== null) {
          const token = m[1];
          if (!pathExtRe.test(token)) continue;
          if (/[\s*…<>|]/.test(token)) continue;
          if (/^(http|~|\$)/.test(token)) continue;
          // 陈旧字面量由上面的硬判统一报告，避免同一处被重复计数
          if (staleLiterals.includes(token)) continue;
          // 裸文件名不是路径引用，跳过（避免误报）
          if (!looksLikePath(token)) continue;
          checked += 1;
          /* 解析基准（按顺序尝试，任一命中即视为可达）：
             ① 仓库根 —— `src/core/x.js` 这类全仓相对路径
             ② 当前文件所在目录 —— 同目录内的相对引用
             ③ `.trellis/spec/` —— `guides/foo.md` / `frontend/bar.md` 是 spec 内的简写，
                在 rule-triggers.md 等索引类文档里大量使用；漏掉这一基准会产生整片误报，
                误报多了守卫就会被忽略，反而失去意义。 */
          const candidates = [
            path.join(ROOT, token),
            path.resolve(path.dirname(absFile), token),
            path.join(ROOT, '.trellis/spec', token),
          ];
          if (!candidates.some((p) => existsSync(p))) {
            const line = text.slice(0, m.index).split(/\r?\n/).length;
            items.push({ file: rel, line, text: `路径断联：${token}` });
          }
        }
      }

      return {
        ok: items.length === 0,
        detail: `扫描 ${files.length} 个文件（硬校验 ${strictFiles.size} 个指针/真源文件，校验 ${checked} 条路径引用），发现 ${items.length} 处断联`,
        items,
      };
    },
  },

  {
    id: 'deliverable-tracked',
    rule: 'R-07',
    title: '交付落点：规范与校验器必须能被 git 跟踪',
    severity: 'MUST',
    run() {
      const required = [RULES_FILE, DETAILS_FILE, IRON_FILE, TRIGGERS_FILE, 'tooling/rules/run.mjs', 'tooling/rules/checks.mjs'];
      const items = [];
      for (const rel of required) {
        if (!existsSync(path.join(ROOT, rel))) {
          items.push({ file: rel, line: 0, text: '文件不存在' });
          continue;
        }
        const ignored = gitSafe(['check-ignore', '-v', rel]).trim();
        if (ignored) items.push({ file: rel, line: 0, text: `被 gitignore 忽略（不算交付）：${ignored}` });
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `${required.length} 个交付物均未被忽略` : `${items.length} 个交付物落在忽略区`,
        items,
      };
    },
  },

  {
    id: 'no-secret-leak',
    rule: 'R-08',
    title: '零泄露：追踪文件内无凭据令牌与本地绝对路径',
    severity: 'MUST',
    run() {
      const skip = [
        /^package-lock\.json$/,
        /^node_modules\//,
        /^test\//,
        /^src\/vendor\//,
        /^download\//,
        /^dist/,
        /^out\//,
        /^_migrate-backup/,
        /\.(png|jpg|jpeg|gif|webp|zip|woff2?|ttf|ico|wasm)$/i,
      ];
      const items = [];
      for (const rel of trackedFiles()) {
        if (skip.some((re) => re.test(rel))) continue;
        let text;
        try {
          text = readText(rel);
        } catch {
          continue;
        }
        if (text === null || isBinary(text)) continue;
        for (const [re, label] of SECRET_PATTERNS) {
          const hit = grepLines(rel, re);
          if (hit.length) items.push({ file: rel, line: hit[0].line, text: `${label} 疑似泄露` });
        }
        const home = grepLines(rel, /[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+/);
        if (home.length) items.push({ file: rel, line: home[0].line, text: '本地绝对路径（Windows 用户目录）' });
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `扫描 ${trackedFiles().length} 个追踪文件，无泄露` : `${items.length} 处疑似泄露`,
        items,
      };
    },
  },

  {
    id: 'no-estimated-numbers',
    rule: 'R-05',
    title: '数值必须真实：禁止 ~ 估算与占位假数',
    severity: 'MUST',
    run() {
      const targets = [
        ...walk('src', (n) => /\.(js|mjs|cjs|css|json|html)$/.test(n)),
        ...walk('docs', (n) => /\.md$/.test(n)),
        'README.md',
      ];
      const items = [];
      for (const rel of targets) {
        const hits = grepLines(rel, /~\s*\d+(?:\.\d+)?\s*(?:[KMGT]?B)\b/);
        for (const h of hits) {
          // 跳过：代码注释（内部实测记录不算对外数值）、禁止性说明、以及已有的实测标注
          if (/^\s*(\/\/|\*|\/\*|<!--)/.test(h.text)) continue;
          if (/禁用|禁止|不得|不要|严禁/.test(h.text)) continue;
          if (/实测|约|瓶颈|吞吐|RSS|耗时|基准/.test(h.text)) continue;
          items.push(h);
        }
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `扫描 ${targets.length} 个文件，无估算数值` : `${items.length} 处使用了 ~ 估算数值`,
        items,
      };
    },
  },

  {
    id: 'no-git-add-all',
    rule: 'R-12',
    title: 'Git 纪律：脚本内禁止 git add -A / -u / .',
    severity: 'MUST',
    run() {
      const targets = walk('.', (n) => /\.(sh|bash|mjs|cjs|js|ps1)$/.test(n)).filter(
        (rel) =>
          !rel.startsWith('node_modules/') &&
          !rel.startsWith('.git/') &&
          // 检查器自身与其描述文本不算违规
          !rel.startsWith('tooling/rules/') &&
          !rel.startsWith('scripts/rules/'),
      );
      const items = [];
      for (const rel of targets) {
        const hits = grepLines(rel, /git\s+add\s+(-A|--all|-u|\.)(?:\s|$)/);
        for (const h of hits) {
          if (/禁止|never|do not|don't|严禁|不得|未见|detail|检测|违规/i.test(h.text)) continue;
          items.push(h);
        }
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `扫描 ${targets.length} 个脚本，无 git add -A` : `${items.length} 处违规 git add`,
        items,
      };
    },
  },

  {
    id: 'vendor-untouched',
    rule: 'R-23',
    title: '依赖自包含：src/vendor 不得改动',
    severity: 'MUST',
    run() {
      if (!existsSync(path.join(ROOT, 'src/vendor'))) return { ok: true, detail: '无 src/vendor 目录' };
      const out = gitSafe(['status', '--porcelain', '--', 'src/vendor']).trim();
      const items = out
        ? out.split('\n').map((s) => ({ file: s.slice(3).trim(), line: 0, text: `状态 ${s.slice(0, 2).trim()}` }))
        : [];
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? 'src/vendor 无改动' : `${items.length} 个 vendor 文件被改动`,
        items,
      };
    },
  },

  {
    id: 'port-policy',
    rule: 'R-24',
    title: '端口策略：禁 8000 / 3000，本地统一 3040',
    severity: 'MUST',
    run() {
      const targets = [
        'vite.config.js',
        ...walk('src', (n) => /\.(js|mjs|json)$/.test(n)),
        ...walk('tooling', (n) => /\.(mjs|cjs|js)$/.test(n)),
      ];
      const items = [];
      for (const rel of targets) {
        for (const h of grepLines(rel, /(?:port|PORT)\s*[:=]\s*['"]?(8000|3000)\b/)) {
          if (/禁用|禁止|保留/.test(h.text)) continue;
          items.push(h);
        }
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `扫描 ${targets.length} 个文件，无违规端口` : `${items.length} 处绑定禁用端口`,
        items,
      };
    },
  },

  {
    id: 'no-duplicate-sections',
    rule: 'R-01',
    title: '规则文件不得出现重复章节标题',
    severity: 'MUST',
    run() {
      const items = [];
      for (const rel of [...HARNESS_FILES, RULES_FILE]) {
        const text = readText(rel);
        if (text === null) continue;
        const seen = new Map();
        text.split(/\r?\n/).forEach((line, i) => {
          const m = /^##\s+(.+?)\s*$/.exec(line);
          if (!m) return;
          // 归一化：去掉括注后缀，把「项目覆盖」与「项目覆盖（…追加）」视为同名
          const title = m[1].replace(/[（(][^（()）]*[)）]\s*$/, '').trim();
          if (seen.has(title)) {
            items.push({ file: rel, line: i + 1, text: `重复标题「${title}」（首次在第 ${seen.get(title)} 行）` });
          } else {
            seen.set(title, i + 1);
          }
        });
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? '无重复章节' : `${items.length} 个重复章节标题`,
        items,
      };
    },
  },

  {
    id: 'iron-rule-refs-valid',
    rule: 'R-01',
    title: '规则引用必须存在：不得出现悬空「铁律 N」',
    severity: 'MUST',
    run() {
      const targets = [...HARNESS_FILES, ...(existsSync(path.join(ROOT, '.cursor/rules'))
        ? readdirSync(path.join(ROOT, '.cursor/rules')).filter((f) => f.endsWith('.mdc')).map((f) => `.cursor/rules/${f}`)
        : [])];
      const defined = new Set();
      const refs = [];
      for (const rel of targets) {
        const text = readText(rel);
        if (text === null) continue;
        text.split(/\r?\n/).forEach((line, i) => {
          for (const m of line.matchAll(/^\s*#{1,3}\s*铁律\s*(\d+)/g)) defined.add(m[1]);
          for (const m of line.matchAll(/铁律\s*(\d+)/g)) refs.push({ file: rel, line: i + 1, num: m[1], text: line.trim().slice(0, 120) });
        });
      }
      const items = refs
        .filter((r) => !defined.has(r.num))
        .map((r) => ({ file: r.file, line: r.line, text: `引用的「铁律 ${r.num}」无定义：${r.text}` }));
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `已定义铁律 ${[...defined].join(',') || '无'}；${refs.length} 处引用均有效` : `${items.length} 处悬空引用`,
        items,
      };
    },
  },

  {
    id: 'plan-open-items',
    rule: 'R-04',
    title: '收尾门：最新计划文件不得留有未完成项',
    severity: 'SHOULD',
    run() {
      const candidates = [
        ...walk('.private/plans', (n) => /\.md$/.test(n)),
        ...walk('docs', (n) => /^PLAN-.*\.md$/i.test(n)),
      ]
        .map((rel) => ({ rel, mtime: statSync(path.join(ROOT, rel)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (!candidates.length) return { ok: true, detail: '未找到计划文件（跳过）' };
      const latest = candidates[0].rel;
      const items = [];
      readText(latest).split(/\r?\n/).forEach((line, i) => {
        if (/^\s*[-*]\s*\[\s\]\s+/.test(line)) items.push({ file: latest, line: i + 1, text: line.trim().slice(0, 120) });
      });
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `${latest} 无未完成项` : `${latest} 尚有 ${items.length} 项未完成`,
        items,
      };
    },
  },

  {
    id: 'css-scope',
    rule: 'R-18',
    title: 'CSS 双前缀：复用现有 PostCSS AST 守卫',
    severity: 'MUST',
    run() {
      if (!existsSync(path.join(ROOT, 'scripts/css-scope.js'))) return { ok: true, detail: 'scripts/css-scope.js 不存在（跳过）' };
      const r = runNode('scripts/css-scope.js');
      return { ok: r.ok, detail: r.detail || 'css-scope 通过' };
    },
  },

  {
    id: 'dom-injection',
    rule: 'R-17',
    title: 'DOM 注入守卫：复用现有守卫脚本',
    severity: 'MUST',
    run() {
      const script = 'scripts/dom-injection-guard.js';
      if (!existsSync(path.join(ROOT, script))) return { ok: true, detail: `${script} 不存在（跳过）` };
      const r = runNode(script);
      return { ok: r.ok, detail: r.detail || 'dom-injection 通过' };
    },
  },

  {
    id: 'template-source',
    rule: 'R-22',
    title: '单一模板源：复用现有守卫脚本',
    severity: 'MUST',
    run() {
      const script = 'scripts/single-template-source.js';
      if (!existsSync(path.join(ROOT, script))) return { ok: true, detail: `${script} 不存在（跳过）` };
      const r = runNode(script);
      return { ok: r.ok, detail: r.detail || 'template-source 通过' };
    },
  },

  {
    id: 'docs-sync',
    rule: 'R-11',
    title: '文档同步：docs 与 README 一致',
    severity: 'SHOULD',
    run() {
      const script = 'tooling/docs-sync.mjs';
      if (!existsSync(path.join(ROOT, script))) return { ok: true, detail: `${script} 不存在（跳过）` };
      const r = runNode(script, ['--verify'], 180000);
      return { ok: r.ok, detail: r.detail || 'docs 同步通过' };
    },
  },

  {
    id: 'details-coverage',
    rule: 'ALL',
    title: '细则挂载完整性：每条细则必须指向存在的规则',
    severity: 'MUST',
    run() {
      const details = readText(DETAILS_FILE);
      const rules = readText(RULES_FILE);
      if (details === null) return { ok: false, detail: '细则文件（rule-details.md）不存在' };
      if (rules === null) return { ok: false, detail: '规则目录（rule-catalog.md）不存在' };

      const defined = new Set([...rules.matchAll(/^###\s+(R-\d+)/gm)].map((m) => m[1]));
      const items = [];
      const seen = new Map();

      details.split(/\r?\n/).forEach((line, i) => {
        const m = /^\|\s*(D-\d+)\s*\|\s*(R-\d+)\s*\|/.exec(line);
        if (!m) return;
        const [, did, rid] = m;
        if (seen.has(did)) {
          items.push({ file: DETAILS_FILE, line: i + 1, text: `重复细则 ID ${did}（首次在第 ${seen.get(did)} 行）` });
        } else {
          seen.set(did, i + 1);
        }
        if (!defined.has(rid)) {
          items.push({ file: DETAILS_FILE, line: i + 1, text: `细则 ${did} 指向不存在的规则 ${rid}` });
        }
      });

      return {
        ok: items.length === 0,
        detail:
          items.length === 0
            ? `${seen.size} 条细则全部挂到存在的规则（共 ${defined.size} 条规则）`
            : `${items.length} 处细则挂载异常`,
        items,
      };
    },
  },

  {
    id: 'perf-budget',
    rule: 'R-25',
    title: '性能预算：R-25 必须保留可判定的数值门槛',
    severity: 'MUST',
    run() {
      const rules = readText(RULES_FILE);
      if (rules === null) return { ok: false, detail: '规则目录（rule-catalog.md）不存在' };
      const required = ['100ms', '10s'];
      const missing = required.filter((n) => !rules.includes(n));
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? '性能预算数值完整（100ms / 10s）' : `R-25 缺少数值门槛：${missing.join('、')}`,
      };
    },
  },

  {
    id: 'host-native-first',
    rule: 'R-26',
    title: '宿主原生优先：能力盘点必须落盘',
    severity: 'SHOULD',
    run() {
      const rel = '.trellis/spec/frontend/host-capabilities.md';
      const text = readText(rel);
      if (text === null) return { ok: false, detail: `${rel} 不存在（D-75 要求落盘能力盘点）` };
      const rows = text.split(/\r?\n/).filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l)).length;
      return { ok: rows >= 6, detail: `能力盘点表 ${rows} 行（要求 ≥ 6 行）` };
    },
  },

  {
    id: 'no-dates-in-rules',
    rule: 'R-36',
    title: '规则正文不带日期',
    severity: 'MUST',
    run() {
      const targets = [IRON_FILE, RULES_FILE, DETAILS_FILE, TRIGGERS_FILE, '.trellis/spec/guides/scroll-containers.md'];
      const items = [];
      for (const rel of targets) {
        if (readText(rel) === null) continue;
        for (const h of grepLines(rel, /\b20\d{2}-\d{2}-\d{2}\b/)) items.push(h);
      }
      return {
        ok: items.length === 0,
        detail: items.length === 0 ? `${targets.length} 个规则文件均无日期` : `${items.length} 处日期残留`,
        items,
      };
    },
  },

  {
    id: 'tests-tracked',
    rule: 'R-07',
    title: '所有测试必须入库跟踪',
    severity: 'MUST',
    run() {
      if (!existsSync(path.join(ROOT, 'test'))) return { ok: true, detail: '无 test 目录' };
      const ignored = gitSafe(['check-ignore', 'test']).trim();
      if (ignored) return { ok: false, detail: `test/ 被忽略：${ignored}` };
      const tracked = gitSafe(['ls-files', 'test']).split('\n').filter(Boolean).length;
      const untracked = gitSafe(['ls-files', '--others', '--exclude-standard', 'test']).split('\n').filter(Boolean);
      return {
        ok: untracked.length === 0,
        detail: `已跟踪 ${tracked} 个；未跟踪 ${untracked.length} 个`,
        items: untracked.slice(0, 20).map((f) => ({ file: f, line: 0, text: '未入库' })),
      };
    },
  },

  {
    id: 'spec-tracked',
    rule: 'R-07',
    title: 'spec 必须入库，research/workspace 必须不入库',
    severity: 'MUST',
    run() {
      const items = [];
      const specIgnored = gitSafe(['check-ignore', '.trellis/spec']).trim();
      if (specIgnored) items.push({ file: '.trellis/spec', line: 0, text: `被忽略：${specIgnored}` });
      const specTracked = gitSafe(['ls-files', '.trellis/spec']).split('\n').filter(Boolean).length;
      if (specTracked === 0) items.push({ file: '.trellis/spec', line: 0, text: '零文件入库' });
      const specUntracked = gitSafe(['ls-files', '--others', '--exclude-standard', '.trellis/spec']).split('\n').filter(Boolean);
      for (const f of specUntracked.slice(0, 20)) items.push({ file: f, line: 0, text: 'spec 文件未入库' });
      const leaked = gitSafe(['ls-files', '.trellis/research', '.trellis/workspace', '.trellis/tasks']).split('\n').filter(Boolean);
      for (const f of leaked.slice(0, 20)) items.push({ file: f, line: 0, text: '不该入库的 trellis 目录被跟踪' });
      return {
        ok: items.length === 0,
        detail: `spec 已跟踪 ${specTracked} 个；越界 ${leaked.length} 个；未跟踪 ${specUntracked.length} 个`,
        items,
      };
    },
  },

  {
    id: 'login-state-copy',
    rule: 'R-39',
    title: '顶部徽标禁止登录态缺失（酒馆运行时一定有用户）',
    severity: 'MUST',
    run() {
      /* 铁律 39：顶部身份徽标必须显示用户名，不存在「未登录 / 游客 / 匿名态」；
         把「未登录」改写成近义词属于同一违规。范围只限徽标——Git/云盘凭据措辞另算，
         不得扩大化（用户裁定）。判据由 tooling/login-state-guard.mjs 承担。 */
      const script = path.join(ROOT, 'tooling', 'login-state-guard.mjs');
      if (!existsSync(script)) {
        return { ok: false, detail: '守卫脚本缺失：tooling/login-state-guard.mjs' };
      }
      let out = '';
      let code = 0;
      try {
        out = execFileSync(process.execPath, [script, '--json'], {
          cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        code = err.status === undefined ? 1 : err.status;
        out = (err.stdout || '') + (err.stderr || '');
      }
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* 输出不是 JSON，按失败处理 */ }
      if (!parsed) {
        return { ok: false, detail: `守卫无法解析输出（退出码 ${code}）`, items: [{ file: 'tooling/login-state-guard.mjs', line: 0, text: out.trim().slice(0, 300) }] };
      }
      const hits = Array.isArray(parsed.hits) ? parsed.hits : [];
      return {
        ok: hits.length === 0,
        detail: hits.length === 0 ? '无登录态语义绕过' : `${hits.length} 处违反铁律 39`,
        items: hits.slice(0, 20).map((h) => ({ file: h.file, line: h.line, text: `[${h.label}] ${h.text}` })),
      };
    },
  },
];
