/**
 * D1 回归守卫：体积格式化不得把非零字节显示成 0 KB。
 *
 * 事故背景（2026-11-19 用户实测）：
 *   TauriTavern 里导入的包在插件卡片上显示 `0 KB`，而文件管理器中该文件真实存在。
 *   根因之一是 `fmtMB` 对 < 512 字节一律 `Math.round(mb * 1000)` → `0 KB`，
 *   使「真正 0 字节的空文件」与「462 字节的小包/残缺包」在界面上**无法区分**。
 *
 * 判据（铁律 5 数据正确性 / 禁假 0）：
 *   1. `0` 必须显示 `0 B`（不是 `0 KB`）。
 *   2. 非零且 < 1 KB 的字节数必须显示真实字节数（`462 B`），不得取整成 0。
 *   3. >= 1 KB 维持既有 KB/MB/GB 口径，不得回归。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// 包卡负载的唯一真源：index.js 从这里 import fmMB 并写入 p.size。
import { fmtMB as chartFmtMB } from '../src/core/chart-model.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEW_SRC = readFileSync(resolve(ROOT, 'src/ui/workbench-view.js'), 'utf8');

/**
 * 从源码中提取 `fmtMB` 函数体并求值，避免为了测试把私有函数改成导出。
 * 这是项目既有的「源码断言」测试风格（见 ui-viewport-guard.test.js）。
 */
function loadFmtMB() {
  const start = VIEW_SRC.indexOf('function fmtMB(mb)');
  expect(start, 'src/ui/workbench-view.js 中必须存在 fmtMB 函数').toBeGreaterThan(-1);
  // 取到匹配的右花括号
  let depth = 0;
  let i = VIEW_SRC.indexOf('{', start);
  const bodyStart = i;
  for (; i < VIEW_SRC.length; i += 1) {
    if (VIEW_SRC[i] === '{') depth += 1;
    else if (VIEW_SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = VIEW_SRC.slice(bodyStart, i + 1);
  // eslint-disable-next-line no-new-func
  return new Function(`return (function fmtMB(mb)${body})`)();
}

const MB = 1024 * 1024;

describe('D1 体积格式化：禁假 0', () => {
  const fmtMB = loadFmtMB();

  it('真实 0 字节显示 0 B（不是 0 KB）', () => {
    expect(fmtMB(0)).toBe('0 B');
  });

  it('非零小体积显示真实字节数，不得取整成 0', () => {
    expect(fmtMB(1 / MB)).toBe('1 B');
    expect(fmtMB(22 / MB)).toBe('22 B');
    expect(fmtMB(462 / MB)).toBe('462 B');
    expect(fmtMB(512 / MB)).toBe('512 B');
    expect(fmtMB(1023 / MB)).toBe('1023 B');
  });

  it('0 与 462 字节必须可区分（本次事故的核心判据）', () => {
    expect(fmtMB(0)).not.toBe(fmtMB(462 / MB));
    expect(fmtMB(462 / MB)).toContain('462');
  });

  it('>= 1 KB 维持既有口径', () => {
    expect(fmtMB(1024 / MB)).toBe('1 KB');
    expect(fmtMB(1536 / MB)).toBe('1 KB');
    expect(fmtMB(1)).toBe('1 MB');
    expect(fmtMB(1.5)).toBe('1.5 MB');
    expect(fmtMB(1024)).toBe('1.0 GB');
  });

  it('任何非零输入都不得输出 0 KB', () => {
    for (const bytes of [1, 22, 100, 462, 511, 512, 700, 1000, 1023]) {
      const out = fmtMB(bytes / MB);
      expect(out, `${bytes} 字节不应显示为 0 KB`).not.toBe('0 KB');
    }
  });
});

/**
 * 包卡体积的真源是 `src/core/chart-model.js` 的 `fmtMB`：
 * `index.js:16` import 它，`:349` 写入 `p.size`，`workbench-view.js` 的 `pkgCard`
 * 直接渲染 `<span>${p.size}</span>`。只修 workbench-view.js 不会改变卡片显示。
 */
describe('D1 包卡体积真源（chart-model.fmtMB）', () => {
  it('真实 0 字节显示 0 B', () => {
    expect(chartFmtMB(0)).toBe('0 B');
  });

  it('非零小体积显示真实字节数（事故值 462 字节）', () => {
    expect(chartFmtMB(1 / MB)).toBe('1 B');
    expect(chartFmtMB(22 / MB)).toBe('22 B');
    expect(chartFmtMB(462 / MB)).toBe('462 B');
    expect(chartFmtMB(1023 / MB)).toBe('1023 B');
  });

  it('0 与 462 字节必须可区分', () => {
    expect(chartFmtMB(0)).not.toBe(chartFmtMB(462 / MB));
  });

  it('>= 1 KB 口径不变（真实大包不受影响）', () => {
    expect(chartFmtMB(1024 / MB)).toBe('1 KB');
    expect(chartFmtMB(1)).toBe('1 MB');
    expect(chartFmtMB(20975162 / MB)).toBe('20 MB');
    expect(chartFmtMB(1024)).toBe('1.0 GB');
  });
});
