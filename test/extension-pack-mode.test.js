import { describe, expect, it } from 'vitest';
import {
  applyExtensionPackModes,
  extensionPackModeSummary,
  extensionPackNames,
  manifestExtensionNames,
} from '../src/core/extension-pack-mode.js';

function tree() {
  return [{
    id: 'group:extensions',
    label: '扩展',
    icon: 'puzzle',
    mb: 0,
    leaf: false,
    children: [
      {
        id: 'dir:extensions:alpha',
        label: 'alpha',
        icon: 'folder',
        mb: 3,
        leaf: false,
        children: [
          { id: 'leaf:extensions/alpha/index.js', path: 'extensions/alpha/index.js', label: 'index.js', mb: 2, leaf: true, checked: true },
          { id: 'leaf:extensions/alpha/manifest.json', path: 'extensions/alpha/manifest.json', label: 'manifest.json', mb: 1, leaf: true, checked: true },
        ],
      },
      {
        id: 'dir:extensions:third-party',
        label: 'third-party',
        icon: 'folder',
        mb: 5,
        leaf: false,
        children: [
          {
            id: 'dir:extensions:third-party/beta',
            label: 'beta',
            icon: 'folder',
            mb: 5,
            leaf: false,
            children: [
              { id: 'leaf:extensions/third-party/beta/index.js', path: 'extensions/third-party/beta/index.js', label: 'index.js', mb: 5, leaf: true, checked: true },
            ],
          },
        ],
      },
    ],
  }];
}

describe('extension-pack-mode · 目录级双模式', () => {
  it('只有完整 / 清单两种模式；组级读数为三态', () => {
    const modes = { alpha: 'manifest', beta: 'full' };
    expect(extensionPackModeSummary(['alpha'], (n) => modes[n])).toBe('manifest');
    expect(extensionPackModeSummary(['beta'], (n) => modes[n])).toBe('full');
    expect(extensionPackModeSummary(['alpha', 'beta'], (n) => modes[n])).toBe('mixed');
  });

  it('清单扩展折叠为一条 0 体积叶子，完整扩展保持文件树，原树不被修改', () => {
    const source = tree();
    const out = applyExtensionPackModes(source, {
      modeOf: (name) => (name === 'alpha' ? 'manifest' : 'full'),
      manifestLabel: '仅清单',
    });
    const group = out[0];
    expect(group.extModeScope).toBe('group');
    expect(group.extModeNames).toEqual(['alpha', 'beta']);
    const alpha = group.children.find((n) => n.extModeName === 'alpha');
    expect(alpha.packMode).toBe('manifest');
    expect(alpha.mb).toBe(0);
    expect(alpha.children).toHaveLength(1);
    expect(alpha.children[0]).toMatchObject({ manifestOnly: true, mirrorId: alpha.id, mb: 0, label: '仅清单' });
    const third = group.children.find((n) => n.id === 'dir:extensions:third-party');
    const beta = third.children.find((n) => n.extModeName === 'beta');
    expect(beta.packMode).toBe('full');
    expect(beta.children).toHaveLength(1);
    expect(source[0].children[0].children).toHaveLength(2);
    expect(source[0].children[0].mb).toBe(3);
  });

  it('导出名单只含清单目录，且组内名字完整', () => {
    const source = tree();
    expect(extensionPackNames(source)).toEqual(['alpha', 'beta']);
    expect(manifestExtensionNames(source, (n) => (n === 'alpha' ? 'manifest' : 'full'))).toEqual(['alpha']);
  });
});
