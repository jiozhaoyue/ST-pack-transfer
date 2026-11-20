/**
 * 静态守卫的「聚合覆盖」检查（SHOULD）。
 *
 * 背景：本仓已有 10+ 条守卫，但入口是三层——package.json 的 check:*、
 * tooling/qa-static.mjs 的 GUARDS 数组、.github/workflows/checks.yml 的 step。
 * 三层各自维护名单，必然漏：2026-11-17 审计时 `check:docs-privacy` 不在 qa-static，
 * CI 只跑了 5 条（css-scope / dom-injection / dom-scope / control-consumer / i18n / copy 全缺失）。
 *
 * 判定：package.json 每个 check:* 必须出现在 qa-static 的 GUARDS；被登记的脚本文件必须存在；
 * CI 应调用 `npm run verify:rules`（单一入口）。
 * 这条是 SHOULD：漏登记不会让代码坏掉，但会让「以为跑了」变成「其实没跑」。
 */
const GUARDS_RE = /\[\s*'(check:[^']+)'\s*,\s*'([^']+)'\s*\]/g;

export async function run(ctx) {
  const pkg = await ctx.readJson('package.json');
  const scripts = pkg.scripts || {};
  const declared = Object.keys(scripts).filter((name) => name.startsWith('check:')).sort();

  const qaStatic = await ctx.read('tooling/qa-static.mjs');
  const aggregated = new Map();
  let match;
  while ((match = GUARDS_RE.exec(qaStatic)) !== null) aggregated.set(match[1], match[2]);

  const missingInAggregate = declared.filter((name) => !aggregated.has(name));
  const staleEntries = [...aggregated].filter(([name]) => !declared.includes(name)).map(([name]) => name);
  const missingFiles = [];
  for (const [name, rel] of aggregated) {
    if (!(await ctx.exists(rel))) missingFiles.push(`${name} → ${rel} 不存在`);
  }

  const ci = (await ctx.exists('.github/workflows/checks.yml'))
    ? await ctx.read('.github/workflows/checks.yml')
    : '';
  const ciRunsHarness = /npm run verify:rules|node scripts\/rules\/run\.mjs/.test(ci);

  const problems = [];
  if (missingInAggregate.length) {
    problems.push(`未进 qa-static：${missingInAggregate.join(', ')}`);
  }
  if (staleEntries.length) {
    problems.push(`qa-static 登记了不存在的 script：${staleEntries.join(', ')}`);
  }
  if (missingFiles.length) problems.push(...missingFiles);
  if (!ciRunsHarness) problems.push('CI (.github/workflows/checks.yml) 未调用 npm run verify:rules');

  if (problems.length) {
    return {
      ok: false,
      detail: problems.join('\n'),
      evidence: `package.json 声明 ${declared.length} 条 check:*，qa-static 聚合 ${aggregated.size} 条`,
    };
  }
  return { ok: true, detail: `${declared.length} 条 check:* 全部进 qa-static，CI 已接 verify:rules` };
}
