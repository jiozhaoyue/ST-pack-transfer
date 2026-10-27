/**
 * UI 单一源守卫：`ui-demo.html` 与运行时三件套必须逐字一致。
 *
 * 背景（用户 2026-10-27 裁定）：demo html 是唯一可编辑的 UI 源；运行时不得手写第二份。
 * 本测试就是「不存在例外情况」的机器判据——任何一方被单独改动都会红。
 */
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getWorkbenchHtml } from '../src/ui/workbench-template.js';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8').then((s) => s.replace(/\r\n/g, '\n'));

const MARK = {
  css: ['/* SZC:UI:CSS:BEGIN */', '/* SZC:UI:CSS:END */'],
  html: ['<!-- SZC:UI:HTML:BEGIN -->', '<!-- SZC:UI:HTML:END -->'],
  js: ['// SZC:UI:JS:BEGIN', '// SZC:UI:JS:END'],
};

function slice(source, kind) {
  const [start, end] = MARK[kind];
  const a = source.indexOf(start);
  const b = source.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error(`demo 缺少 ${kind} 标记`);
  return source.slice(a + start.length, b).replace(/^\n/, '').replace(/\n$/, '');
}

describe('UI 单一源（demo → 运行时逐字一致）', () => {
  const demoPath = '../src/ui/ui-demo.html';

  it('demo 三个标记区都存在于同一份文件', async () => {
    const demo = await read(demoPath);
    for (const [start, end] of Object.values(MARK)) {
      expect(demo.indexOf(start)).toBeGreaterThanOrEqual(0);
      expect(demo.indexOf(end)).toBeGreaterThan(demo.indexOf(start));
    }
  });

  it('style.css 与 demo 的 CSS 区域逐字相同', async () => {
    const [demo, css] = await Promise.all([read(demoPath), read('../style.css')]);
    expect(css.trimEnd()).toBe(slice(demo, 'css').trimEnd());
  });

  it('workbench-view.js 与 demo 的 JS 区域逐字相同', async () => {
    const [demo, view] = await Promise.all([read(demoPath), read('../src/ui/workbench-view.js')]);
    expect(view.trimEnd()).toBe(slice(demo, 'js').trimEnd());
  });

  it('getWorkbenchHtml() 返回 demo 的 HTML 区域，一字不差', async () => {
    const demo = await read(demoPath);
    expect(getWorkbenchHtml()).toBe(slice(demo, 'html'));
  });

  it('HTML 区域不含模板字符串保留字，能原样放进模板字符串', async () => {
    const html = slice(await read(demoPath), 'html');
    expect(html).not.toContain('`');
    expect(html).not.toContain('${');
  });

  it('正式三件套不含任何 demo / 测试专用物', async () => {
    const demo = await read(demoPath);
    for (const kind of ['css', 'html', 'js']) {
      const body = slice(demo, kind);
      expect(body, `${kind} 区域含 demo 字样`).not.toMatch(/\bdemo\b/i);
      expect(body, `${kind} 区域含演示字样`).not.toContain('演示');
      expect(body, `${kind} 区域含 DEMO_ 常量`).not.toContain('DEMO_');
    }
  });
});
