/**
 * i18n 守卫：UI 文案必须来自 `src/i18n/locales/**`。
 *
 * 扫描正式工作台 UI 文件，跳过注释，禁止字符串/模板字面量出现中文字符。
 * 技术性日志/宿主适配层（host-bridge / chat-store / core）不在本守卫范围。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SCAN_FILES = Object.freeze([
  'index.js',
  'src/ui/workbench-template.js',
  'src/ui/workbench-view.js',
  'src/ui/settings-panel.js',
  'src/ui/lan-transfer-panel.js',
  'src/ui/export-queue.js',
  'src/ui/qr.js',
]);

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

export async function checkI18n(files = SCAN_FILES) {
  const violations = [];
  for (const rel of files) {
    const source = await readFile(path.join(ROOT, rel), 'utf8');
    for (const item of findCjkLiterals(source)) {
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
