/**
 * TAVERN-RULES 块：单一正文真源 + 已批准基线。
 *
 * 这个块由 `tavern-harness` 生成后**原样承载全文**，目前存在于 AGENTS.md 与 CLAUDE.md。
 * 2026-11-17 实测：两份正文已经不同（L0-16 端口：AGENTS.md 写 `4173`，CLAUDE.md 写 `3040`，
 * 而本地端口真源 vite.config.js 是 3040），但两份声明的哈希**仍同为**
 * `sha256:bc9d1c8c1b43de49`——说明「声明哈希」从来没被任何脚本校验过，它只是装饰。
 *
 * 因此本检查做三件事：
 *   1. 头部元数据一致：版本号 + 声明哈希必须两份相同（真源漂移时至少能看出来）；
 *   2. 正文一致：去掉头部注释与「项目覆盖」节后逐字比较（口径与块头声明一致）；
 *   3. 基线一致：正文 sha256 必须等于 baseline.json 中的人工批准值。
 *      改规则 → 同时改两份 → `node scripts/rules/run.mjs --update-baseline` 并提交基线，
 *      漂移才会重新变绿；单纯改一个文件永远过不了。
 */
import { createHash } from 'node:crypto';

export const SOURCE_FILE = 'AGENTS.md';
export const MIRROR_FILES = Object.freeze(['CLAUDE.md']);
export const BASELINE_KEY = 'tavern-rules-core';

const START_RE = /<!-- TAVERN-RULES:START v([\d.]+) -->/;
const END_MARKER = '<!-- TAVERN-RULES:END -->';

/**
 * 抽块并拆成「头部元数据 / 正文」。
 * @param {string} text 已归一化换行的文本
 */
export function parseBlock(text) {
  const start = START_RE.exec(text);
  if (!start) return null;
  const endIndex = text.indexOf(END_MARKER, start.index);
  if (endIndex < 0) return null;

  const header = text.slice(start.index, start.index + start[0].length + 1);
  const inner = text.slice(start.index + start[0].length, endIndex);
  const headerLines = inner.split('\n').filter((line) => line.startsWith('<!--'));
  const beforeBody = inner.indexOf('# 统一开发规则');
  if (beforeBody < 0) return null;

  let body = inner.slice(beforeBody);
  const overrideAt = body.indexOf('## 项目覆盖');
  if (overrideAt >= 0) body = body.slice(0, overrideAt);
  body = body.replace(/\s+$/, '');

  const hashLine = headerLines.find((line) => line.includes('内容哈希'));
  const declaredHash = hashLine ? (/sha256:([0-9a-f]+)/.exec(hashLine) || [])[1] || null : null;

  return {
    version: start[1],
    declaredHash,
    body,
    bodyHash: createHash('sha256').update(body).digest('hex'),
    header,
  };
}

/** 首个差异行（供失败信息定位） */
function firstDiff(a, b) {
  const left = a.split('\n');
  const right = b.split('\n');
  const at = left.findIndex((line, i) => line !== right[i]);
  return { at, left: left[at] ?? '<缺行>', right: right[at] ?? '<缺行>' };
}

export async function run(ctx) {
  const parsed = new Map();
  const problems = [];

  for (const rel of [SOURCE_FILE, ...MIRROR_FILES]) {
    if (!(await ctx.exists(rel))) {
      problems.push(`${rel} 不存在`);
      continue;
    }
    const found = parseBlock(await ctx.read(rel));
    if (!found) {
      problems.push(`${rel} 缺少 TAVERN-RULES:START/END 或正文标题`);
      continue;
    }
    parsed.set(rel, found);
  }

  if (problems.length) return { ok: false, detail: problems.join('\n') };

  const base = parsed.get(SOURCE_FILE);

  for (const rel of MIRROR_FILES) {
    const mirror = parsed.get(rel);
    if (mirror.version !== base.version) {
      problems.push(`版本不一致：${SOURCE_FILE}=v${base.version}，${rel}=v${mirror.version}`);
    }
    if (mirror.declaredHash !== base.declaredHash) {
      problems.push(
        `声明哈希不一致：${SOURCE_FILE}=${base.declaredHash ?? '<缺失>'}，${rel}=${mirror.declaredHash ?? '<缺失>'}`,
      );
    }
    if (mirror.body !== base.body) {
      const diff = firstDiff(base.body, mirror.body);
      problems.push(
        `正文漂移（首个差异在正文第 ${diff.at + 1} 行）\n      ${SOURCE_FILE}: ${diff.left.trim().slice(0, 120)}\n      ${rel}: ${diff.right.trim().slice(0, 120)}`,
      );
    }
  }

  const approved = ctx.baseline[BASELINE_KEY];
  if (ctx.updateBaseline) {
    ctx.pendingBaseline[BASELINE_KEY] = base.bodyHash;
  } else if (!approved) {
    problems.push(
      `baseline.json 缺少 ${BASELINE_KEY}；确认正文无误后运行 --update-baseline 并提交基线`,
    );
  } else if (approved !== base.bodyHash) {
    problems.push(
      `正文哈希与已批准基线不符：baseline=${approved.slice(0, 12)}…，当前=${base.bodyHash.slice(0, 12)}…\n      若这是有意改规则，两份文件同步后运行 --update-baseline`,
    );
  }

  if (problems.length) {
    return {
      ok: false,
      detail: problems.join('\n'),
      evidence: `正文 ${base.body.length} 字符，声明哈希 ${base.declaredHash ?? '<缺失>'}`,
    };
  }

  return {
    ok: true,
    detail: [
      `${parsed.size} 份正文一致（v${base.version}，${base.body.length} 字符）`,
      ctx.updateBaseline
        ? `已更新基线 ${BASELINE_KEY}=${base.bodyHash.slice(0, 12)}…`
        : `正文哈希与基线一致（${base.bodyHash.slice(0, 12)}…）`,
    ].join('；'),
  };
}
