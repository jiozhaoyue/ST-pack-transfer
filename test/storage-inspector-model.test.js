import { describe, expect, it } from 'vitest';
import {
  categoryColorClass, dotFill, entriesTotal, formatSize, formatSizeOrUnknown,
  iconKey, joinPath, maxEntrySize, normalizeResponse, stackSegments,
} from '../src/core/storage-inspector-model.js';

describe('storage-inspector-model · 尺寸格式', () => {
  it('按 B/KB/MB/GB 分级，非有限值给占位横线', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(1073741824)).toBe('1.0 GB');
    expect(formatSize(null)).toBe('—');
    expect(formatSize('nope')).toBe('—');
  });

  it('null / undefined 显示 ?，绝不显示假 0', () => {
    expect(formatSizeOrUnknown(null)).toBe('?');
    expect(formatSizeOrUnknown(undefined)).toBe('?');
    expect(formatSizeOrUnknown(0)).toBe('0 B');
    expect(formatSizeOrUnknown(2048)).toBe('2.0 KB');
  });
});

describe('storage-inspector-model · 堆叠条与点阵', () => {
  const entries = [
    { key: 'a', sizeBytes: 75 },
    { key: 'b', sizeBytes: 25 },
    { key: 'c', sizeBytes: null },
  ];

  it('分段宽度按本层已测总量，null 不占色块', () => {
    const segs = stackSegments(entries);
    expect(segs).toHaveLength(2);
    expect(segs[0].pct).toBeCloseTo(75, 5);
    expect(segs[1].pct).toBeCloseTo(25, 5);
    expect(segs[0].colorClass).toMatch(/^vc-c\d+$/);
  });

  it('全为 null 时不产生分段（避免除零）', () => {
    expect(stackSegments([{ key: 'x', sizeBytes: null }])).toEqual([]);
  });

  it('点阵按最大条目比例填充，null 为 0', () => {
    expect(dotFill(100, 100, 8)).toBe(8);
    expect(dotFill(50, 100, 8)).toBe(4);
    expect(dotFill(1, 100, 8)).toBe(0);
    expect(dotFill(null, 100, 8)).toBe(0);
    expect(dotFill(10, 0, 8)).toBe(0);
  });

  it('总量与最大值只统计有限正数', () => {
    expect(entriesTotal(entries)).toBe(100);
    expect(maxEntrySize(entries)).toBe(75);
    expect(entriesTotal(null)).toBe(0);
  });
});

describe('storage-inspector-model · 类目配色与图标', () => {
  it('同类目跨调用稳定，且落在 12 色内', () => {
    expect(categoryColorClass('chats')).toBe(categoryColorClass('chats'));
    expect(categoryColorClass('chats')).toMatch(/^vc-c([1-9]|1[0-2])$/);
    expect(categoryColorClass('quota')).toMatch(/^vc-c([1-9]|1[0-2])$/);
  });

  it('未知类目固定最后一色，不越界', () => {
    expect(categoryColorClass('nope')).toMatch(/^vc-c12$/);
    expect(categoryColorClass(undefined)).toMatch(/^vc-c12$/);
  });

  it('FA 名映射到本插件线性图标，未知回落 file', () => {
    expect(iconKey('hard-drive')).toBe('db');
    expect(iconKey('database')).toBe('db');
    expect(iconKey('puzzle-piece')).toBe('puzzle');
    expect(iconKey('nope')).toBe('file');
    expect(iconKey(null)).toBe('file');
  });
});

describe('storage-inspector-model · 响应归一', () => {
  it('缺字段给安全默认值', () => {
    const resp = normalizeResponse(null, 'browser');
    expect(resp).toEqual({
      source: 'browser',
      unavailable: false,
      path: [],
      breadcrumbs: [],
      quota: null,
      entries: [],
      isLeaf: false,
    });
  });

  it('quota 为 0 视为未知总量（不冒充 0）', () => {
    const resp = normalizeResponse({ quota: { usedBytes: 100, quotaBytes: 0 } });
    expect(resp.quota.quotaBytes).toBeNull();
    expect(resp.quota.usedBytes).toBe(100);
  });

  it('used 超过 quota 时标记 over', () => {
    const resp = normalizeResponse({ quota: { usedBytes: 200, quotaBytes: 100 } });
    expect(resp.quota.over).toBe(true);
  });

  it('保留 unavailable 与路径字符串', () => {
    const resp = normalizeResponse({ unavailable: true, path: ['indexeddb', 7] });
    expect(resp.unavailable).toBe(true);
    expect(resp.path).toEqual(['indexeddb', '7']);
  });

  it('joinPath 追加一层且不改原数组', () => {
    const base = ['a'];
    expect(joinPath(base, 'b')).toEqual(['a', 'b']);
    expect(base).toEqual(['a']);
    expect(joinPath(null, 1)).toEqual(['1']);
  });
});
