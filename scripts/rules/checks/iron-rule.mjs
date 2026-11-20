/**
 * 铁律 0 副本一致性。
 *
 * 现实形态：这条铁律被**手抄**进 4 个 harness 文件，任何一次修订都要改 4 处，
 * 漏一处就会让某个 harness 拿到旧规则。判定方式：抽出每个文件里的 IRON-RULE 块，
 * 统一换行后逐字比较（CRLF/LF 不算差异，那只是 git 行尾设置）。
 *
 * 允许的反例只有一个：块内文案刻意按 harness 定制。当前真实情况是 4 份完全一致，
 * 所以先按「完全一致」立规则；将来真要定制，应拆成「正文真源 + harness 附加段」，
 * 而不是让规则在 4 个文件里各自漂移。
 */
const START_RE = /<!--\s*IRON-RULE:REPORT-ALL-WRITES\s+v(\d+)[^>]*-->/g;
const END_MARKER = '<!-- /IRON-RULE:REPORT-ALL-WRITES -->';

/** 单一定义源（同时是比对基准） */
export const SOURCE_FILE = 'AGENTS.md';

/** 必须承载铁律块的文件（缺失即视为 harness 掉队） */
export const REQUIRED_COPIES = Object.freeze([
  'AGENTS.md',
  'GEMINI.md',
  '.cursor/rules/00-silent-write-iron-rule.mdc',
  '.github/copilot-instructions.md',
]);

/**
 * 抽出一个文件里的铁律块。
 * @param {string} text 已归一化换行的文本
 * @returns {{version: string, block: string} | null}
 */
export function extractBlock(text) {
  START_RE.lastIndex = 0;
  const start = START_RE.exec(text);
  if (!start) return null;
  const endIndex = text.indexOf(END_MARKER, start.index);
  if (endIndex < 0) return null;
  return {
    version: start[1],
    block: text.slice(start.index, endIndex + END_MARKER.length),
  };
}

export async function run(ctx) {
  const missing = [];
  const malformed = [];
  const blocks = new Map();

  for (const rel of REQUIRED_COPIES) {
    if (!(await ctx.exists(rel))) {
      missing.push(`${rel}（文件不存在）`);
      continue;
    }
    const text = await ctx.read(rel);
    const found = extractBlock(text);
    if (!found) {
      malformed.push(`${rel}（缺少 IRON-RULE 起始/结束标记）`);
      continue;
    }
    const occurrences = text.split('<!-- IRON-RULE:REPORT-ALL-WRITES').length - 1;
    if (occurrences > 1) malformed.push(`${rel}（铁律块出现 ${occurrences} 次，应唯一）`);
    if (rel !== SOURCE_FILE) {
      if (!/铁律 0/.test(found.block)) malformed.push(`${rel}（块内缺少「铁律 0」标题）`);
      if (!/禁止静默工具调用/.test(found.block)) malformed.push(`${rel}（块内缺少第 1 条）`);
    }
    blocks.set(rel, found);
  }

  if (missing.length || malformed.length || !blocks.has(SOURCE_FILE)) {
    return {
      ok: false,
      detail: [
        ...missing.map((item) => `缺失：${item}`),
        ...malformed.map((item) => `格式异常：${item}`),
        ...(blocks.has(SOURCE_FILE) ? [] : [`基准文件不可用：${SOURCE_FILE} 无铁律块`]),
      ].join('\n'),
    };
  }

  const base = blocks.get(SOURCE_FILE);
  const versions = new Set([...blocks.values()].map((item) => item.version));
  const drifts = [];

  if (versions.size !== 1) {
    drifts.push(
      `版本号不一致：${[...blocks.entries()].map(([rel, item]) => `${rel}=v${item.version}`).join('，')}`,
    );
  }

  for (const [rel, item] of blocks) {
    if (rel === SOURCE_FILE) continue;
    if (item.block === base.block) continue;
    const a = base.block.split('\n');
    const b = item.block.split('\n');
    const at = a.findIndex((line, i) => line !== b[i]);
    drifts.push(
      `${rel} 与 ${SOURCE_FILE} 不一致（首个差异在第 ${at + 1} 行）\n      ${SOURCE_FILE}: ${(a[at] ?? '<缺行>').trim()}\n      ${rel}: ${(b[at] ?? '<缺行>').trim()}`,
    );
  }

  if (drifts.length) {
    return {
      ok: false,
      detail: drifts.join('\n'),
      evidence: `${blocks.size} 份副本，基准 ${SOURCE_FILE}（${base.block.length} 字符）`,
    };
  }

  return {
    ok: true,
    detail: `${blocks.size} 份副本逐字一致（v${base.version}，${base.block.length} 字符）`,
  };
}
