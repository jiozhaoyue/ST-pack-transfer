/**
 * `git add -A` / `-u` / `git add .` 禁令的可执行检查（L0-7）。
 *
 * 只扫**可执行文件**（scripts / tooling / e2e / .github / package.json / *.sh）。
 * 规则散文里出现 `禁止 git add -A` 不算违规——那正是规则本身；把 markdown 全扫一遍
 * 会让检查永远红着，从而被无视。可执行文件要放行某处，就在同一行写
 * `git-add-all:allow <理由>`（同样式于 dom-injection-guard 的豁免注释）。
 */
const SCAN_DIRS = ['scripts', 'tooling', 'e2e', '.github'];
const SCAN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.yml', '.yaml', '.sh'];
const SCAN_FILES = ['package.json'];

const ALLOW_MARKER = 'git-add-all:allow';
const GIT_ADD_RE = /\bgit\s+add\b/g;
const FORBIDDEN = /^(?:-A|--all|-u|\.)$/;

/** 从 `git add` 起到行尾的 token 里找禁止项 */
function inspect(line) {
  GIT_ADD_RE.lastIndex = 0;
  const match = GIT_ADD_RE.exec(line);
  if (!match) return null;
  const rest = line
    .slice(match.index + match[0].length)
    .split(/[;&|`#]/)[0]
    .trim();
  if (!rest) return null;
  const tokens = rest.split(/\s+/).filter(Boolean);
  const hit = tokens.find((token) => FORBIDDEN.test(token));
  return hit || null;
}

export async function run(ctx) {
  const files = [];
  for (const dir of SCAN_DIRS) files.push(...(await ctx.list(dir, SCAN_EXTENSIONS)));
  for (const rel of SCAN_FILES) if (await ctx.exists(rel)) files.push(rel);

  const violations = [];
  for (const rel of files) {
    const lines = (await ctx.read(rel)).split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.includes(ALLOW_MARKER)) continue;
      const hit = inspect(line);
      if (hit) violations.push(`${rel}:${i + 1}  git add ${hit} → 只允许显式 pathspec`);
    }
  }

  if (violations.length) {
    return { ok: false, detail: violations.join('\n') };
  }
  return {
    ok: true,
    detail: `${files.length} 个可执行文件未见 git add -A / -u / .`,
  };
}
