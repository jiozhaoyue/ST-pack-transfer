import { describe, expect, it } from 'vitest';
import {
  applyExtensionPackModes,
  extensionPackModeSummary,
  extensionPackNames,
  manifestExtensionNames,
  fullExtensionNames,
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
  it('组级读数返回完整 / 清单两个独立开关（可同时为真）', () => {
    const modes = { alpha: 'manifest', beta: 'full', gamma: 'both' };
    const onlyManifest = extensionPackModeSummary(['alpha'], (n) => modes[n]);
    expect(onlyManifest).toMatchObject({ full: false, manifest: true, allFull: false, allManifest: true });
    const onlyFull = extensionPackModeSummary(['beta'], (n) => modes[n]);
    expect(onlyFull).toMatchObject({ full: true, manifest: false, allFull: true, allManifest: false });
    const mixed = extensionPackModeSummary(['alpha', 'beta'], (n) => modes[n]);
    expect(mixed).toMatchObject({ full: true, manifest: true, allFull: false, allManifest: false });
    const both = extensionPackModeSummary(['gamma'], (n) => modes[n]);
    expect(both).toMatchObject({ full: true, manifest: true, allFull: true, allManifest: true, mode: 'both' });
  });

  it('双选扩展保留完整文件树（不折叠）', () => {
    const source = tree();
    const out = applyExtensionPackModes(source, {
      modeOf: () => 'both',
      manifestLabel: '清单',
    });
    const alpha = out[0].children.find((n) => n.extModeName === 'alpha');
    expect(alpha.packMode).toBe('both');
    expect(alpha.children).toHaveLength(2);
    expect(alpha.children.some((n) => n.manifestOnly)).toBe(false);
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

  it('导出名单：清单 / 完整各自独立，双选同时进两个名单', () => {
    const source = tree();
    expect(extensionPackNames(source)).toEqual(['alpha', 'beta']);
    const modeOf = (n) => ({ alpha: 'manifest', beta: 'both' })[n] || 'full';
    expect(manifestExtensionNames(source, modeOf)).toEqual(['alpha', 'beta']);
    expect(fullExtensionNames(source, modeOf)).toEqual(['beta']);
  });
});
