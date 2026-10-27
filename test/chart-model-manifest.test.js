import { describe, expect, it } from 'vitest';
import { EXTENSION_MODES, chartTreeFor, manifestExtensionGroup } from '../src/core/chart-model.js';

const EXTENSIONS = [
  { name: 'a', manifest: { display_name: 'A' }, gitMeta: { remoteUrl: 'https://github.com/x/a' } },
  { name: 'b', manifest: { display_name: 'B' }, gitMeta: {} },
];

describe('chartTreeFor（仅清单子树）', () => {
  it('manifest 模式把扩展组替换为扩展条目列表', () => {
    const pkg = {
      nodes: [
        { id: 'group:extensions', label: '扩展', children: [{ id: 'leaf:x', leaf: true }] },
        { id: 'group:chats', children: [] },
      ],
      extensions: EXTENSIONS,
    };
    const tree = chartTreeFor(pkg, EXTENSION_MODES.MANIFEST);
    const ext = tree.find((node) => node.id === 'group:extensions');
    expect(ext.children.map((child) => child.id)).toEqual(['ext:a', 'ext:b']);
    expect(ext.children[0].availability).toBe('installable');
    expect(ext.children[1].availability).toBe('unavailable');
    expect(ext.children[0].url).toBe('https://github.com/x/a');
  });

  it('完整模式返回原始树（不替换）', () => {
    const pkg = { nodes: [{ id: 'group:extensions', children: [{ id: 'leaf:x' }] }], extensions: EXTENSIONS };
    expect(chartTreeFor(pkg, EXTENSION_MODES.FULL)).toBe(pkg.nodes);
  });

  it('无扩展时不产生空扩展组', () => {
    const pkg = { nodes: [{ id: 'group:extensions', children: [{ id: 'leaf:x' }] }], extensions: [] };
    expect(chartTreeFor(pkg, EXTENSION_MODES.MANIFEST).some((node) => node.id === 'group:extensions')).toBe(false);
  });

  it('manifestExtensionGroup 在无条目时返回 null', () => {
    expect(manifestExtensionGroup([])).toBeNull();
  });
});
