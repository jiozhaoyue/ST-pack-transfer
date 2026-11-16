import { describe, it, expect } from 'vitest';
import { extensionUnitName, extensionUnitsOf, suggestPackMode } from '../src/core/ext-pack.js';

describe('extensionUnitName', () => {
  it('识别用户级扩展', () => {
    expect(extensionUnitName('extensions/foo/index.js')).toBe('foo');
    expect(extensionUnitName('extensions/foo')).toBe('foo');
  });

  it('third-party 优先于 extensions/<n>', () => {
    expect(extensionUnitName('extensions/third-party/bar/manifest.json')).toBe('bar');
    expect(extensionUnitName('public/scripts/extensions/third-party/baz/a.js')).toBe('baz');
    expect(extensionUnitName('data/extensions/third-party/qux/a.js')).toBe('qux');
    expect(extensionUnitName('_tauritavern/extension-sources/quux.json')).toBe('quux');
  });

  it('非扩展路径返回空串', () => {
    expect(extensionUnitName('chats/a/b.jsonl')).toBe('');
    expect(extensionUnitName('')).toBe('');
  });
});

describe('extensionUnitsOf', () => {
  const leaf = (path, mb = 1) => ({ id: `leaf:${path}`, path, leaf: true, mb });
  const group = {
    id: 'group:extensions',
    children: [
      { id: 'dir:extensions:foo', children: [leaf('extensions/foo/a.js', 2), leaf('extensions/foo/b.js', 3)] },
      { id: 'dir:extensions:third-party', children: [
        { id: 'dir:extensions:third-party/bar', children: [leaf('extensions/third-party/bar/c.js', 5)] },
      ] },
    ],
  };

  it('按扩展折叠，体积求和', () => {
    const units = extensionUnitsOf(group);
    expect(units.map((u) => u.name)).toEqual(['bar', 'foo']);
    const foo = units.find((u) => u.name === 'foo');
    expect(foo.files).toBe(2);
    expect(foo.mb).toBe(5);
    expect(foo.leaves.map((n) => n.path)).toEqual(['extensions/foo/a.js', 'extensions/foo/b.js']);
  });

  it('仅清单模式的 ext:<name> 叶子也能折', () => {
    const manifest = {
      id: 'group:extensions',
      children: [{ id: 'ext:alpha', path: 'ext:alpha', leaf: true, mb: 0 }],
    };
    expect(extensionUnitsOf(manifest).map((u) => u.name)).toEqual(['alpha']);
  });

  it('无扩展时返回空数组', () => {
    expect(extensionUnitsOf(null)).toEqual([]);
    expect(extensionUnitsOf({ id: 'group:extensions', children: [] })).toEqual([]);
  });
});

describe('suggestPackMode（打包建议 · 图表行内徽标同源）', () => {
  it('插件自身建议原件', () => {
    expect(suggestPackMode('ST-pack-transfer', 'https://github.com/a/b').mode).toBe('full');
  });
  it('无远端建议原件', () => {
    expect(suggestPackMode('foo', '').mode).toBe('full');
  });
  it('URL 内嵌凭据建议原件', () => {
    expect(suggestPackMode('foo', 'https://user:tok@github.com/a/b').mode).toBe('full');
  });
  it('调用方声明私有凭据建议原件', () => {
    expect(suggestPackMode('foo', 'https://github.com/a/b', { hasPrivateCredential: true }).mode).toBe('full');
  });
  it('公开远端建议清单', () => {
    expect(suggestPackMode('foo', 'https://github.com/a/b').mode).toBe('manifest');
  });
});
