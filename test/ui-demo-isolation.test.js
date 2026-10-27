/**
 * demo 隔离守卫：demo 只消费正式代码，正式代码不引用 demo。
 *
 * 规则（用户 2026-10-27 裁定）：demo 可以 import 正式模块；
 * 正式源码 / 构建 / 测试 / CI 不得依赖或引用 demo 文件。
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = 'src/ui/ui-demo.html';
const SELF = 'test/ui-demo-isolation.test.js';
const SKIP_DIRS = new Set(['node_modules', '.git', '.trellis', 'dist', 'dist-offline', 'out', 'test-results', '.history']);

const read = (rel) => readFile(path.join(ROOT, rel), 'utf8').then((s) => s.replace(/\r\n/g, '\n'));

async function walk(rel, acc = []) {
  const entries = await readdir(path.join(ROOT, rel), { withFileTypes: true });
  for (const entry of entries) {
    const child = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(child, acc);
      continue;
    }
    acc.push(child);
  }
  return acc;
}

const CODE_EXT = /\.(?:js|cjs|mjs|html|css|json|yml|yaml)$/;

describe('demo 隔离（正式代码零引用）', () => {
  it('正式源码不出现 ui-demo 引用', async () => {
    const dirs = ['src', 'scripts', 'public', 'e2e', 'test', '.github'];
    const roots = ['index.js', 'index.html', 'manifest.json', 'vite.config.js', 'style.css'];
    const files = [...roots];
    for (const dir of dirs) files.push(...(await walk(dir)));

    const offenders = [];
    for (const rel of files) {
      if (rel === DEMO || rel === SELF || !CODE_EXT.test(rel)) continue;
      const body = await read(rel);
      if (/ui-demo/i.test(body)) offenders.push(rel);
    }
    expect(offenders, `以下正式文件引用了 demo：${offenders.join(', ')}`).toEqual([]);
  });

  it('package.json 不再保留 demo 同步命令', async () => {
    const pkg = JSON.parse(await read('package.json'));
    expect(Object.keys(pkg.scripts)).not.toContain('sync:ui');
    expect(Object.keys(pkg.scripts)).not.toContain('check:ui-sync');
  });
});

describe('demo 只消费正式代码', () => {
  it('demo 引用正式样式与两个正式模块', async () => {
    const body = await read(DEMO);
    expect(body).toContain('href="../../style.css"');
    expect(body).toContain("from './workbench-template.js'");
    expect(body).toContain("from './workbench-view.js'");
    expect(body).toContain('getWorkbenchHtml()');
  });

  it('demo 不再内联正式实现副本', async () => {
    const body = await read(DEMO);
    expect(body).not.toContain('SZC:UI:');
    expect(body).not.toContain('export function createWorkbenchView');
  });

  it('正式三件套不含 demo / 演示 / DEMO_ 字样', async () => {
    for (const rel of ['style.css', 'src/ui/workbench-template.js', 'src/ui/workbench-view.js']) {
      const body = await read(rel);
      expect(body, `${rel} 含 demo 字样`).not.toMatch(/\bdemo\b/i);
      expect(body, `${rel} 含演示字样`).not.toContain('演示');
      expect(body, `${rel} 含 DEMO_ 常量`).not.toContain('DEMO_');
    }
  });
});
