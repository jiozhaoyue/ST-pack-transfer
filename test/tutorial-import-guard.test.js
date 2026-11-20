/**
 * D2 教程态导入防护与退出恢复测试。
 *
 * 验证：
 * 1. 教程模式下导入真实包时，importFiles 头部直接拦截：不写 IndexedDB、不 syncPackages，
 *    仅提示 settings.dataImportTutorial 并返回 0；普通与 remote 路径都覆盖；
 * 2. 非教程态正常调用 saveFile / syncPackages 各一次；
 * 3. i18n 字典对称定义 tutorial.importedNotice；
 * 4. workbench-view exitTutorialMode 正确重置 tutorialMode 并触发 onTutorialExit。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import enUS from '../src/i18n/locales/en-US.js';
import zhCN from '../src/i18n/locales/zh-CN.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFile(ROOT + rel, 'utf8');

/** 从源码中按花括号配对提取 importFiles 完整函数文本。 */
function extractImportFiles(code) {
  const marker = 'async function importFiles';
  const start = code.indexOf(marker);
  if (start < 0) throw new Error('importFiles 未找到');
  // 跳过参数解构的花括号，从签名结束后的函数体 '{' 开始配对
  const paramsEnd = code.indexOf(') {', start);
  if (paramsEnd < 0) throw new Error('importFiles 签名未找到');
  const bodyStart = paramsEnd + 2;
  let depth = 0;
  for (let i = bodyStart; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error('importFiles 花括号未闭合');
}

/** 注入受控依赖，构造可执行 importFiles，避开整份 index.js 的 DOM/宿主副作用。 */
function makeImportFiles(code, { tutorial, saveFile, syncPackages, toast }) {
  const source = extractImportFiles(code);
  const factory = new Function(
    'view', 'logger', 't', 'isStorageSupported', 'state', 'recordActivity',
    'saveFile', 'syncPackages', 'ORIGINS', 'ensurePlan', 'settings', 'loadSettings', 'uniqueRemoteName',
    `${source}\nreturn importFiles;`,
  );
  const view = {
    isTutorialMode: () => tutorial,
    toast,
    setZone: vi.fn(),
    applySettings: vi.fn(),
    setActivePackage: vi.fn(),
  };
  return factory(
    view,
    { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
    (key) => key,
    () => true,
    { packages: [] },
    () => ({ update: vi.fn(), done: vi.fn() }),
    saveFile,
    syncPackages,
    { LAN: 'lan', UPLOAD: 'upload' },
    vi.fn(),
    {},
    () => ({}),
    (name) => name,
  );
}

describe('D2 教程态防护与恢复契约', () => {
  it('i18n 字典定义了 tutorial.importedNotice 且中英文对称', () => {
    const zh = zhCN['tutorial.importedNotice'];
    const en = enUS['tutorial.importedNotice'];
    expect(zh).toBeTruthy();
    expect(en).toBeTruthy();
    expect(zh).toContain('演示模式');
    expect(en.toLowerCase()).toContain('tutorial demo');
  });

  it('教程态 importFiles 阻断真实写入：saveFile / syncPackages 调用次数为 0', async () => {
    const code = await read('index.js');
    for (const opts of [{}, { remote: true }]) {
      const saveFile = vi.fn();
      const syncPackages = vi.fn();
      const toast = vi.fn();
      const importFiles = makeImportFiles(code, { tutorial: true, saveFile, syncPackages, toast });
      const result = await importFiles([{ name: 'real.zip', size: 1 }], opts);
      expect(result).toBe(0);
      expect(saveFile).toHaveBeenCalledTimes(0);
      expect(syncPackages).toHaveBeenCalledTimes(0);
      expect(toast).toHaveBeenCalledWith('settings.dataImportTutorial');
    }
  });

  it('非教程态 importFiles 正常写入：saveFile / syncPackages 各调用 1 次', async () => {
    const code = await read('index.js');
    const saveFile = vi.fn().mockResolvedValue(undefined);
    const syncPackages = vi.fn().mockResolvedValue(undefined);
    const toast = vi.fn();
    const importFiles = makeImportFiles(code, { tutorial: false, saveFile, syncPackages, toast });
    const result = await importFiles([{ name: 'real.zip', size: 1 }]);
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(syncPackages).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
    expect(toast).not.toHaveBeenCalledWith('settings.dataImportTutorial');
  });

  it('教程态拦截判断位于 saveFile 调用之前', async () => {
    const code = await read('index.js');
    const body = extractImportFiles(code);
    expect(body.indexOf('isTutorialMode')).toBeLessThan(body.indexOf('saveFile({'));
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
