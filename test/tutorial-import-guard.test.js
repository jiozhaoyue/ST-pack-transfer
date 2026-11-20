/**
 * D2 教程态导入防护与退出恢复测试。
 *
 * 验证：
 * 1. 教程模式下导入真实包时，发出明确提示（tutorial.importedNotice）告知包已保存但演示态不直接覆盖；
 * 2. 退出教程模式时，onTutorialExit 必须显式触发 syncPackages 恢复真实包；
 * 3. i18n 字典对称定义 tutorial.importedNotice；
 * 4. workbench-view exitTutorialMode 正确重置 tutorialMode 并触发 onTutorialExit。
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import enUS from '../src/i18n/locales/en-US.js';
import zhCN from '../src/i18n/locales/zh-CN.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFile(ROOT + rel, 'utf8');

describe('D2 教程态防护与恢复契约', () => {
  it('i18n 字典定义了 tutorial.importedNotice 且中英文对称', () => {
    const zh = zhCN['tutorial.importedNotice'];
    const en = enUS['tutorial.importedNotice'];
    expect(zh).toBeTruthy();
    expect(en).toBeTruthy();
    expect(zh).toContain('演示模式');
    expect(en.toLowerCase()).toContain('tutorial demo');
  });

  it('index.js importFiles 包含教程态提示分支', async () => {
    const code = await read('index.js');
    expect(code).toContain('view.isTutorialMode');
    expect(code).toContain("t('tutorial.importedNotice')");
  });

  it('index.js onTutorialExit 显式调用 syncPackages 重新恢复数据', async () => {
    const code = await read('index.js');
    const match = /onTutorialExit:\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\}/.exec(code);
    expect(match).not.toBeNull();
    const body = match[1];
    expect(body).toContain('await syncPackages()');
    expect(body).toContain('maybeShowChangelog');
  });

  it('workbench-view.js exitTutorialMode 重置 tutorialMode 并调用 onTutorialExit', async () => {
    const code = await read('src/ui/workbench-view.js');
    expect(code).toContain('state.tutorialMode=false;');
    expect(code).toContain('actions.onTutorialExit?.();');
  });
});
