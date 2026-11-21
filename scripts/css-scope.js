import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

/**
 * 允许作为**作用域根**（第一个复合选择器）的选择器：本插件自有容器 / 覆盖层。
 *
 * 2026-09-25 变更（两处，均有实机/合成页证据）：
 * 1. **新增 `#st-converter-modal-overlay`**（模态态工作台的自家覆盖层）。
 * 2. **独立态/模态态根由 `.app-container` 收紧为 `#app.app-container`**：只用类名时，
 *    任何第三方只要挂了 `.app-container` 就会被本插件的列宽/间距与后代规则命中
 *    （合成页实测：第三方容器被压成 840px 列）。本插件自己的两处根
 *    （`index.html` 骨架、`index.js` 模态容器）**都带 `id="app"`**，故以 id + 类双条件限定。
 * 3. **移除**原 `body:has(> .app-container)` 豁免——那条豁免允许以 `body` 为主体的规则，
 *    而 `body` 属宿主页面元素（宿主仓内确有第三方扩展使用 `.app-container` 类名）。
 *
 * 2026-10-15 变更（两处）：
 * 1. **新增 `#wb-detail-overlay`**（类目明细全屏面板）。理由与模态覆盖层同源：
 *    它是挂在 `document.body` 上的自绘浮层，**不在** `#app.app-container` 之内 ——
 *    双前缀写法命中不了它，只能用自有 id 作作用域根。
 *    允许 id 作根是安全的：`#wb-detail-overlay` 是本插件独有的 id，宿主与第三方不会撞。
 * 2. **移除 `.st-converter-drawer-app`**：插件态工作台 2026-10-15 起改挂在全屏模态里
 *    （宿主扩展抽屉注入已删除），三种形态的根统一为 `#app.app-container`。
 *    该前缀在 style.css 里已无任何规则，白名单留着会让「根选择器」形同虚设。
 */
const ALLOWED_ROOTS = [
  /^#app\.app-container(?=$|[\s>+~.#:[\]])/,
  /^#st-converter-modal-overlay(?=$|[\s>+~.#:[\]])/,
  /^#wb-detail-overlay(?=$|[\s>+~.#:[\]])/,
  // 第 4 根 #st-pt-tutorial-overlay 为教程浮层，需同步登记到 iron-rules.md 铁律 7
  /^#st-pt-tutorial-overlay(?=$|[\s>+~.#:[\]])/,
];

/**
 * 全局元素作**主体**：`body`/`html`/`:root` 永远不可能位于本插件容器内部，出现即外泄面。
 * （`*` 不列入：`.app-container *` 这种「容器内通配」是安全且必要的；
 *   裸 `* { … }` 会被下面的「作用域根」检查拦下。）
 */
const GLOBAL_SUBJECT = /^(?:body|html)(?=$|[\s>+~.#:[\]])|^:root(?=$|[\s>+~.#:[\]])/;

/** 取选择器的「主体」＝ 最后一个顶层复合选择器（逗号已在外层切分） */
function subjectOf(selector) {
  let depth = 0;
  let quote = null;
  let start = 0;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (depth === 0 && (char === ' ' || char === '>' || char === '+' || char === '~')) start = index + 1;
  }

  return selector.slice(start).trim();
}

function hasAllowedRoot(selector) {
  return ALLOWED_ROOTS.some((pattern) => pattern.test(selector));
}

function splitSelectors(selector) {
  const selectors = [];
  let start = 0;
  let depth = 0;
  let quote = null;

  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === ',' && depth === 0) {
      selectors.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(selector.slice(start).trim());
  return selectors;
}

function insideKeyframes(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true;
  }
  return false;
}

export function checkCssScope(css, file = '<css>') {
  const violations = [];
  let root;

  try {
    root = postcss.parse(css, { from: file });
  } catch (error) {
    violations.push({
      file,
      line: error.line ?? 1,
      column: error.column ?? 1,
      selector: '<CSS 语法>',
      message: `解析失败：${error.reason ?? error.message}`,
    });
    return violations;
  }

  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;

    for (const selector of splitSelectors(rule.selector)) {
      const normalized = selector.trim();
      if (!normalized) continue;

      // ① 主体不得是全局元素（会落到宿主页面）
      const subject = subjectOf(normalized);
      if (GLOBAL_SUBJECT.test(subject)) {
        violations.push({
          file,
          line: rule.source?.start?.line ?? 1,
          column: rule.source?.start?.column ?? 1,
          selector: normalized,
          message: '样式主体不得是 body/html/:root/*（本文件与插件态共用，会落到宿主页面）',
        });
        continue;
      }

      // ② 作用域根必须是本插件自有容器
      if (!hasAllowedRoot(normalized)) {
        violations.push({
          file,
          line: rule.source?.start?.line ?? 1,
          column: rule.source?.start?.column ?? 1,
          selector: normalized,
          message: '选择器必须以 #app.app-container / #st-converter-modal-overlay / #wb-detail-overlay / #st-pt-tutorial-overlay 为作用域根',
        });
      }
    }
  });

  return violations;
}

/**
 * 递归收集目录下所有 `.vue` 文件（按路径排序，保证报告稳定）。
 * 目录不存在返回空数组——守卫不应因目标目录缺失而崩溃。
 */
async function collectVueFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectVueFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.vue')) files.push(full);
  }
  return files.sort();
}

/**
 * 解析 `<style …>` 开始标签：返回属性名集合与标签结束位置。
 *
 * 旧实现用 `<style\b([^>]*)>` 抓属性串 + `/\bscoped\b/` 判 scoped，有两处盲区：
 * ① 属性值含 `>`（如 `data-q="a>b"`）会把属性串提前截断；
 * ② 属性值含 scoped 字样（如 `data-note="scoped"`）会被误判成 scoped 属性，
 *    让本该按铁律 7 检查的全局样式被静默放行——这是真正的作用域绕过。
 *
 * 按字符扫描，只把「引号外、作为属性名出现」的 scoped 计入；与 subjectOf /
 * splitSelectors 同风格，不引入新的 HTML 解析依赖（G-12）。
 */
function parseStyleOpenTag(source, start) {
  const names = new Set();
  const n = source.length;
  let i = start + '<style'.length;
  let ok = false;

  while (i < n) {
    while (i < n && /\s/.test(source[i])) i += 1;
    if (i >= n) break;

    const ch = source[i];
    if (ch === '>') { ok = true; i += 1; break; }
    if (ch === '/') { i += 1; continue; }

    let name = '';
    while (i < n && !/[\s=/>]/.test(source[i])) { name += source[i]; i += 1; }
    if (name) names.add(name.toLowerCase());

    while (i < n && /\s/.test(source[i])) i += 1;
    if (source[i] !== '=') continue;

    i += 1;
    while (i < n && /\s/.test(source[i])) i += 1;
    const quote = source[i];
    if (quote === '"' || quote === "'") {
      i += 1;
      while (i < n && source[i] !== quote) i += 1;
      if (i < n) i += 1;
    } else {
      while (i < n && !/[\s>]/.test(source[i])) i += 1;
    }
  }

  return { names, end: i, ok };
}

/** 解析 `<style …>…</style>` 块，`scoped` 只认开始标签上的独立属性名 */
function extractStyleBlocks(vueSource) {
  const blocks = [];
  const openRe = /<style\b/gi;
  const closeRe = /<\/style\s*>/gi;
  let match;

  while ((match = openRe.exec(vueSource)) !== null) {
    const tag = parseStyleOpenTag(vueSource, match.index);
    if (!tag.ok) break;

    closeRe.lastIndex = tag.end;
    const close = closeRe.exec(vueSource);
    if (!close) break;

    blocks.push({
      scoped: tag.names.has('scoped'),
      css: vueSource.slice(tag.end, close.index),
    });
    openRe.lastIndex = close.index + close[0].length;
  }
  return blocks;
}

/**
 * 扫描 `src/ui/vue/**\/*.vue` 的 `<style>` 块（铁律 7 的 Vue scoped 盲区补防）。
 *
 * 判定三条：
 * ① `scoped` 块：选择器由 Vue 注入的 data-v 属性物理隔离，视为合法（不要求挂四根），
 *    但计入 `totalSelectors` 以便报告可观测。
 * ② 非 `scoped` 块：按铁律 7 判定——必须挂四根之一，否则报错（防未来写全局样式绕过）。
 * ③ 目录/文件不存在：返回空结果，不抛错。
 */
export async function checkVueScopes(vueDir) {
  const result = { scannedFiles: [], totalSelectors: 0, violations: [] };
  const files = await collectVueFiles(vueDir);

  for (const file of files) {
    const label = relative(process.cwd(), file).replace(/\\/g, '/') || file;
    const source = await readFile(file, 'utf8');
    const blocks = extractStyleBlocks(source);
    let fileSelectors = 0;

    for (const block of blocks) {
      let root;
      try {
        root = postcss.parse(block.css, { from: label });
      } catch (error) {
        result.violations.push({
          file: label,
          line: error.line ?? 1,
          column: error.column ?? 1,
          selector: '<CSS 语法>',
          message: `解析失败：${error.reason ?? error.message}`,
        });
        continue;
      }

      root.walkRules((rule) => {
        if (insideKeyframes(rule)) return;
        for (const selector of splitSelectors(rule.selector)) {
          if (!selector.trim()) continue;
          fileSelectors += 1;
          if (block.scoped) continue; // ① data-v 隔离，合法
          result.violations.push(...checkCssScopeOnRule(selector, rule, label)); // ②
        }
      });
    }

    result.scannedFiles.push({ file: label, scoped: blocks.some((b) => b.scoped), selectors: fileSelectors });
    result.totalSelectors += fileSelectors;
  }

  return result;
}

/** 对单个选择器套用铁律 7（供非 scoped Vue 块复用，文案与 checkCssScope 完全一致） */
function checkCssScopeOnRule(normalized, rule, file) {
  const out = [];
  const subject = subjectOf(normalized);
  if (GLOBAL_SUBJECT.test(subject)) {
    out.push({
      file,
      line: rule.source?.start?.line ?? 1,
      column: rule.source?.start?.column ?? 1,
      selector: normalized,
      message: '样式主体不得是 body/html/:root/*（本文件与插件态共用，会落到宿主页面）',
    });
    return out;
  }
  if (!hasAllowedRoot(normalized)) {
    out.push({
      file,
      line: rule.source?.start?.line ?? 1,
      column: rule.source?.start?.column ?? 1,
      selector: normalized,
      message: '选择器必须以 #app.app-container / #st-converter-modal-overlay / #wb-detail-overlay / #st-pt-tutorial-overlay 为作用域根',
    });
  }
  return out;
}

async function main() {
  const file = fileURLToPath(new URL('../style.css', import.meta.url));
  const css = await readFile(file, 'utf8');
  const violations = checkCssScope(css, 'style.css');

  const vueDir = fileURLToPath(new URL('../src/ui/vue', import.meta.url));
  const vue = await checkVueScopes(vueDir);
  violations.push(...vue.violations);

  if (violations.length) {
    for (const item of violations) {
      console.error(`${item.file}:${item.line}:${item.column}: ${item.selector} - ${item.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('CSS 作用域检查通过：style.css');
  console.log(`Vue <style> 作用域检查通过：${vue.scannedFiles.length} 个文件，${vue.totalSelectors} 个选择器`);
  for (const item of vue.scannedFiles) {
    const kind = item.scoped ? 'scoped(data-v 隔离)' : '非 scoped';
    console.log(`  - ${item.file}: ${item.selectors} 个选择器 [${kind}]`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
