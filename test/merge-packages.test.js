import { describe, expect, it } from 'vitest';
import * as zip from '@zip.js/zip.js';
import {
  mergeChartTrees,
  findEntryConflicts,
  mergeConvertedBlobs,
} from '../src/core/merge-packages.js';

async function zipOf(entries) {
  const blobWriter = new zip.BlobWriter('application/zip');
  const writer = new zip.ZipWriter(blobWriter);
  for (const [name, data] of entries) {
    await writer.add(name, new zip.Uint8ArrayReader(new Uint8Array(data)));
  }
  await writer.close();
  return blobWriter.getData();
}

async function namesOf(blob) {
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();
  const names = entries.map((e) => e.filename).sort();
  await reader.close();
  return names;
}

describe('合并模式：图表树', () => {
  const treeOf = (pkgId, path, mb) => ({
    pkgId,
    nodes: [{
      id: 'group:chats',
      label: '聊天',
      suggest: 'keep',
      mb,
      children: [{
        id: `leaf:${path}`, label: path.split('/').pop(), path, mb, leaf: true, suggest: 'keep',
      }],
    }],
  });

  const leaves = (nodes) => nodes.flatMap((n) => (n.leaf ? [n] : leaves(n.children || [])));

  it('同一个一级组跨包合并为一组，叶子保留来源包前缀', () => {
    const merged = mergeChartTrees([
      treeOf('A', 'chats/x/a.jsonl', 2),
      treeOf('B', 'chats/x/b.jsonl', 3),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('group:chats');
    expect(merged[0].mb).toBe(5);
    const nodes = leaves(merged[0].children);
    expect(nodes.map((n) => n.id).sort()).toEqual([
      'leaf:A|chats/x/a.jsonl',
      'leaf:B|chats/x/b.jsonl',
    ]);
    expect(nodes.map((n) => n.srcPkgId).sort()).toEqual(['A', 'B']);
  });

  it('同名路径在两包里各占一行（导出阶段才拦）', () => {
    const merged = mergeChartTrees([
      treeOf('A', 'settings.json', 1),
      treeOf('B', 'settings.json', 1),
    ]);
    const nodes = leaves(merged[0].children);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map((n) => n.srcPkgId)).size).toBe(2);
  });
});

describe('合并模式：同名即停', () => {
  it('检出跨来源同名并给出份数', () => {
    const conflicts = findEntryConflicts([
      ['a.txt', 'same.json'],
      ['b.txt', 'same.json'],
      ['same.json'],
    ]);
    expect(conflicts).toEqual([{ path: 'same.json', sources: [0, 1, 2] }]);
  });

  it('无同名时返回空数组', () => {
    expect(findEntryConflicts([['a.txt'], ['b.txt']])).toEqual([]);
  });
});

describe('合并模式：产物合并', () => {
  it('两个包合成一个，条目齐全', async () => {
    const a = await zipOf([['characters/a.png', [1, 2, 3]], ['settings.json', [4]]]);
    const b = await zipOf([['worlds/w.json', [5, 6]]]);
    const merged = await mergeConvertedBlobs([a, b]);
    expect(merged.ok).toBe(true);
    expect(merged.fileCount).toBe(3);
    expect(await namesOf(merged.blob)).toEqual(['characters/a.png', 'settings.json', 'worlds/w.json']);
  });

  it('同名路径时返回冲突且不产出包', async () => {
    const a = await zipOf([['settings.json', [1]]]);
    const b = await zipOf([['settings.json', [2]]]);
    const merged = await mergeConvertedBlobs([a, b]);
    expect(merged.ok).toBe(false);
    expect(merged.conflicts).toEqual([{ path: 'settings.json', sources: [0, 1] }]);
    expect(merged.blob).toBeUndefined();
  });
});
