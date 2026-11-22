/**
 * i18n 守卫：UI 文案必须来自 `src/i18n/locales/**`。
 *
 * 扫描全部正式 UI 文件（index.js + src/ui/*.js + src/ui/vue/*.vue），跳过注释，
 * 禁止字符串/模板字面量出现中文字符。注释豁免与 `// i18n-guard:allow` 行豁免均保留。
 * 面向排障的技术消息文件纳入清单以约束新增 UI 文案，但按 spec 定案豁免其中文技术串。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SCAN_FILES = Object.freeze([
  'index.js',
  'src/ui/chart-prefs.js',
  'src/ui/chat-store-bridge.js',
  'src/ui/chat-store-inject.js',
  'src/ui/escape.js',
  'src/ui/export-queue.js',
  'src/ui/fetch-bounds.js',
  'src/ui/git-icons.js',
  'src/ui/git-remote.js',
  'src/ui/host-bridge.js',
  'src/ui/inspect-view.js',
  'src/ui/issue-report.js',
  'src/ui/lan-transfer-panel.js',
  'src/ui/migration-controller.js',
  'src/ui/plugin-data.js',
  'src/ui/private-files-store.js',
  'src/ui/qr.js',
  'src/ui/settings-panel.js',
  'src/ui/settings-store.js',
  'src/ui/storage-inspector-browser.js',
  'src/ui/workbench-session.js',
  'src/ui/workbench-template.js',
  'src/ui/workbench-view.js',
  'src/ui/vue/InspectModal.vue',
]);

/**
 * 技术消息文件：错误串 / 诊断串面向排障，不进 locale。
 * 依据 `.trellis/spec/frontend/i18n-and-settings.md` 2026-10-27 定案。
 * 这些文件仍在 SCAN_FILES 内以约束新增 UI 文案，只豁免其中的中文技术串。
 */
const TECHNICAL_MESSAGE_FILES = new Set([
  'src/ui/host-bridge.js',
  'src/ui/chat-store-bridge.js',
  'src/ui/chat-store-inject.js',
  'src/ui/fetch-bounds.js',
  'src/ui/issue-report.js',
  'src/ui/migration-controller.js',
  'src/ui/workbench-session.js',
]);

/** `logger.*(...)` 调用中的中文属技术日志，同样豁免（spec 技术消息不进 locale）。 */
const TECHNICAL_LOG_CALL = /\blogger\.(?:error|warn|info|debug|log)\s*\(/;

const CJK = /[一-鿿]/;

/**
 * 提取源码中含中文的字符串/模板静态片段（跳过注释）。
 * @param {string} source
 * @returns {Array<{line:number,text:string}>}
 */
export function findCjkLiterals(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  let line = 1;

  const push = (text, atLine) => {
    if (CJK.test(text)) out.push({ line: atLine, text: text.trim() });
  };

  while (i < n) {
    const c = source[i];
    if (c === '\n') { line += 1; i += 1; continue; }

    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const at = line;
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < n) {
        const d = source[j];
        if (d === '\\') { buf += source[j] + (source[j + 1] || ''); j += 2; continue; }
        if (d === quote) { closed = true; break; }
        if (d === '\n') break;
        buf += d;
        j += 1;
      }
      if (closed) push(buf, at);
      i = closed ? j + 1 : j;
      continue;
    }

    if (c === '`') {
      let j = i + 1;
      let buf = '';
      let at = line;
      while (j < n) {
        const d = source[j];
        if (d === '\\') { buf += source[j] + (source[j + 1] || ''); j += 2; continue; }
        if (d === '$' && source[j + 1] === '{') {
          push(buf, at);
          buf = '';
          let depth = 1;
          j += 2;
          while (j < n && depth > 0) {
            if (source[j] === '{') depth += 1;
            else if (source[j] === '}') depth -= 1;
            if (source[j] === '\n') line += 1;
            j += 1;
          }
          at = line;
          continue;
        }
        if (d === '`') { push(buf, at); j += 1; break; }
        if (d === '\n') line += 1;
        buf += d;
        j += 1;
      }
      i = j;
      continue;
    }

    i += 1;
  }

  return out;
}

/**
 * 剥离 .vue 里不参与文案校验的区域：<style> 块与 <!-- --> 注释。
 * 用等长空格替换非换行字符，保持行号与原文一致，便于精准报错。
 * @param {string} source
 * @returns {string}
 */
export function stripVueNonText(source) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, blank);
}

/** `// i18n-guard:allow` 行豁免标记：紧邻该行的中文字面量放行（注释豁免机制的显式扩展）。 */
const ALLOW_MARKER = /i18n-guard:\s*allow/;

/**
 * 判定某条违规是否应豁免：
 * 1. 技术消息文件整文件豁免（spec 定案：中文错误串面向排障，不进 locale）；
 * 2. `logger.*(...)` 调用行属技术日志，豁免；
 * 3. 该行或上一行带 `i18n-guard:allow` 注释标记，豁免。
 */
function isExempt(rel, sourceLines, item) {
  if (TECHNICAL_MESSAGE_FILES.has(rel)) return true;
  const line = sourceLines[item.line - 1] || '';
  if (TECHNICAL_LOG_CALL.test(line)) return true;
  const prev = sourceLines[item.line - 2] || '';
  if (ALLOW_MARKER.test(line) || ALLOW_MARKER.test(prev)) return true;
  return false;
}

export async function checkI18n(files = SCAN_FILES) {
  const violations = [];
  for (const rel of files) {
    const source = await readFile(path.join(ROOT, rel), 'utf8');
    if (rel.endsWith('.vue')) {
      const text = stripVueNonText(source);
      text.split('\n').forEach((line, idx) => {
        if (CJK.test(line)) {
          violations.push({ file: rel, line: idx + 1, text: line.trim() });
        }
      });
      continue;
    }
    const sourceLines = source.split('\n');
    for (const item of findCjkLiterals(source)) {
      if (isExempt(rel, sourceLines, item)) continue;
      violations.push({ file: rel, line: item.line, text: item.text });
    }
  }
  return violations;
}

async function main() {
  const violations = await checkI18n();
  if (violations.length === 0) {
    console.log('i18n 守卫通过：UI 文案零中文字面量');
    return;
  }
  for (const v of violations) {
    console.error(`${v.file}:${v.line}  硬编码中文: ${v.text.slice(0, 80)}`);
  }
  console.error(`\ni18n 守卫失败：${violations.length} 处硬编码中文。请迁移到 src/i18n/locales/。`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
