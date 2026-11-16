import { describe, expect, it } from 'vitest';
import {
  ASSET_TYPE,
  buildAssetList,
  extensionToAsset,
  folderNameOf,
  manifestToExtension,
  manifestUrlOf,
  mergeAssetLists,
  normalizeDiscoverResponse,
  summarizeExtensions,
} from '../src/core/asset-list.js';

const ext = (over = {}) => ({
  id: 'demo',
  name: 'Demo Extension',
  displayName: 'Demo Extension',
  description: 'demo',
  url: 'https://github.com/owner/demo',
  ...over,
});

describe('asset-list 官方资产列表契约', () => {
  it('只输出官方五键并过滤非 http(s) 地址', () => {
    expect(extensionToAsset(ext())).toEqual({
      id: 'demo',
      type: ASSET_TYPE.EXTENSION,
      name: 'Demo Extension',
      description: 'demo',
      url: 'https://github.com/owner/demo',
    });
    expect(extensionToAsset(ext({ url: 'ftp://example.com/demo' }))).toBeNull();
    expect(extensionToAsset(ext({ url: '' }))).toBeNull();
  });

  it('按 id 去重并按名称稳定排序', () => {
    const list = buildAssetList([
      ext({ id: 'b', name: 'Zeta', displayName: 'Zeta' }),
      ext({ id: 'a', name: 'Alpha', displayName: 'Alpha' }),
      ext({ id: 'b', name: 'Zeta 2', displayName: 'Zeta 2' }),
    ]);
    expect(list.map((item) => item.id)).toEqual(['a', 'b']);
    expect(list.find((item) => item.id === 'b').name).toBe('Zeta 2');
  });

  it('接受裸数组与 {extensions} 两种 discover 形状', () => {
    expect(normalizeDiscoverResponse([{ name: 'third-party/a', type: 'local' }]))
      .toEqual([{ name: 'third-party/a', sourceType: 'local' }]);
    expect(normalizeDiscoverResponse({ extensions: [{ name: 'b', type: 'global' }] }))
      .toEqual([{ name: 'b', sourceType: 'global' }]);
  });

  it('不认识的 discover 形状返回 null，不伪造空清单', () => {
    expect(normalizeDiscoverResponse({ foo: 1 })).toBeNull();
    expect(normalizeDiscoverResponse('not-json')).toBeNull();
    expect(normalizeDiscoverResponse(null)).toBeNull();
  });

  it('manifest 无 homePage 时保留条目但 url 为空', () => {
    const item = manifestToExtension('third-party/foo', { display_name: 'Foo', version: '1.2.3' });
    expect(item).toMatchObject({
      id: 'foo',
      folder: 'foo',
      name: 'Foo',
      version: '1.2.3',
      url: '',
      sourceType: 'local',
    });
  });

  it('保留 loading_order 作为只读加载顺序事实（缺失/非法为 null）', () => {
    expect(manifestToExtension('third-party/foo', { loading_order: 5 }).loadingOrder).toBe(5);
    expect(manifestToExtension('third-party/foo', { loading_order: 0 }).loadingOrder).toBe(0);
    expect(manifestToExtension('third-party/foo', {}).loadingOrder).toBeNull();
    expect(manifestToExtension('third-party/foo', { loading_order: 'abc' }).loadingOrder).toBeNull();
  });

  it('manifestUrlOf 支持 third-party/ 前缀并做段级编码', () => {
    expect(manifestUrlOf('third-party/foo')).toBe('/scripts/extensions/third-party/foo/manifest.json');
    expect(manifestUrlOf('third-party/a b')).toBe('/scripts/extensions/third-party/a%20b/manifest.json');
    expect(folderNameOf('third-party/foo')).toBe('foo');
  });

  it('buildAssetList 输出官方扁平数组（Array.isArray 可直接被宿主接受）', () => {
    const list = buildAssetList([manifestToExtension('third-party/foo', {
      display_name: 'Foo',
      description: 'd',
      homePage: 'https://github.com/owner/foo',
    })]);
    expect(Array.isArray(list)).toBe(true);
    expect(list[0]).toEqual({
      id: 'foo',
      type: 'extension',
      name: 'Foo',
      description: 'd',
      url: 'https://github.com/owner/foo',
    });
  });

  it('mergeAssetLists 合并后仍为官方形状', () => {
    const merged = mergeAssetLists(
      buildAssetList([ext({ id: 'a', name: 'A', displayName: 'A' })]),
      buildAssetList([ext({ id: 'b', name: 'B', displayName: 'B' })]),
    );
    expect(merged.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('summarizeExtensions 区分可导入与缺地址', () => {
    expect(summarizeExtensions([
      { url: 'https://github.com/a' },
      { url: '' },
      { url: 'file:///x' },
    ])).toEqual({ total: 3, installable: 1, missingUrl: 2 });
  });
});
