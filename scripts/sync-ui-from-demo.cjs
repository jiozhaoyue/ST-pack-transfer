/**
 * UI 单一源同步器：`ui-demo.html` → 运行时三件套
 *
 * 约定（用户 2026-10-27 裁定）：
 *   · demo html 是 **唯一可编辑的 UI 源**；运行时不得手写第二份。
 *   · 三个标记区内的内容被**逐字复制**到运行时文件，零转义、零改写。
 *   · `--check` 只比对；不一致时退出码 1（CI / 测试用）。
 *
 * 用法：
 *   node scripts/sync-ui-from-demo.cjs            # 写入
 *   node scripts/sync-ui-from-demo.cjs --check    # 只校验
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEMO = path.join(ROOT, 'src/ui/ui-demo.html');
const OUT = {
  css: path.join(ROOT, 'style.css'),
  html: path.join(ROOT, 'src/ui/workbench-template.js'),
  js: path.join(ROOT, 'src/ui/workbench-view.js'),
};

const MARK = {
  css: ['/* SZC:UI:CSS:BEGIN */', '/* SZC:UI:CSS:END */'],
  html: ['<!-- SZC:UI:HTML:BEGIN -->', '<!-- SZC:UI:HTML:END -->'],
  js: ['// SZC:UI:JS:BEGIN', '// SZC:UI:JS:END'],
};

function slice(source, kind) {
  const [start, end] = MARK[kind];
  const a = source.indexOf(start);
  const b = source.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error(`demo 缺少 ${kind} 标记（${start} / ${end}）`);
  const body = source.slice(a + start.length, b).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  if (body.includes(start) || body.includes(end)) throw new Error(`${kind} 区域嵌套了标记`);
  return body;
}

function build() {
  const demo = fs.readFileSync(DEMO, 'utf8').replace(/\r\n/g, '\n');
  const css = slice(demo, 'css');
  const html = slice(demo, 'html');
  const js = slice(demo, 'js');
  if (html.includes('`') || html.includes('${')) {
    throw new Error('HTML 区域含反引号或 ${ —— 无法原样放进模板字符串');
  }
  const template = `/**
 * 数据包转运 · HTML 模板
 *
 * 由 \`npm run sync:ui\` 从定稿 UI 页生成。**不要手改本文件**。
 */

export function getWorkbenchHtml() {
  return \`${html}\`;
}
`;
  return {
    css: `${css}\n`,
    html: template,
    js: `${js}\n`,
  };
}

function main() {
  const check = process.argv.includes('--check');
  const built = build();
  let drift = 0;
  for (const [kind, file] of Object.entries(OUT)) {
    const next = built[kind];
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const same = prev.replace(/\r\n/g, '\n') === next;
    if (!same) {
      drift += 1;
      if (check) console.error(`UI 漂移：${path.relative(ROOT, file)} 与 demo 不一致`);
      else { fs.writeFileSync(file, next); console.log(`已同步：${path.relative(ROOT, file)}`); }
    }
  }
  if (check) {
    if (drift) process.exit(1);
    console.log('UI 与 demo 完全一致（html / css / js 三件套逐字相同）');
  } else if (!drift) {
    console.log('三件套已是最新，无需写入');
  }
}

main();
