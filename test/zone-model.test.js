import { describe, expect, it } from 'vitest';
import {
  ZONES,
  actionsForZone,
  actionEnabled,
  zoneOfOrigin,
  copyBackRecord,
  ORIGIN_ZONE,
} from '../src/core/zone-model.js';

describe('分区状态机', () => {
  it('导入区与导出区的动作集合互不越界', () => {
    expect(actionsForZone(ZONES.IMPORT)).toEqual(['fetch', 'generate', 'merge', 'libraryExport', 'lan']);
    expect(actionsForZone(ZONES.EXPORT)).toEqual(['download', 'restore', 'copyBack']);
    expect(actionsForZone('unknown')).toEqual(actionsForZone(ZONES.IMPORT));
  });

  it('动作可用性只看选择数（R3.7 按区限定）', () => {
    expect(actionEnabled(ZONES.IMPORT, 'fetch', { selectedCount: 0 })).toBe(true);
    expect(actionEnabled(ZONES.IMPORT, 'generate', { selectedCount: 0 })).toBe(false);
    expect(actionEnabled(ZONES.IMPORT, 'generate', { selectedCount: 1 })).toBe(true);
    expect(actionEnabled(ZONES.IMPORT, 'merge', { selectedCount: 1 })).toBe(false);
    expect(actionEnabled(ZONES.IMPORT, 'merge', { selectedCount: 2 })).toBe(true);
    expect(actionEnabled(ZONES.EXPORT, 'download', { selectedCount: 0 })).toBe(false);
    expect(actionEnabled(ZONES.EXPORT, 'copyBack', { selectedCount: 1 })).toBe(true);
    /* 导出区不得出现导入区动作，反之亦然。 */
    expect(actionEnabled(ZONES.EXPORT, 'generate', { selectedCount: 3 })).toBe(false);
    expect(actionEnabled(ZONES.IMPORT, 'download', { selectedCount: 3 })).toBe(false);
  });
});

describe('origin → 分区', () => {
  it('所有已知 origin 都有归属', () => {
    for (const origin of Object.keys(ORIGIN_ZONE)) {
      expect(['import', 'export']).toContain(zoneOfOrigin(origin));
    }
    expect(zoneOfOrigin('export-copy')).toBe('import');
    expect(zoneOfOrigin('converted')).toBe('export');
    expect(zoneOfOrigin('unknown-origin')).toBe('import');
  });
});

describe('复制回导入区（解耦）', () => {
  it('生成独立记录：新 id + export-copy 来源 + 指向源包', () => {
    const record = copyBackRecord({ id: 'src-1', name: 'a.zip' }, { now: 1700000000000, random: () => 0.123456 });
    expect(record.id).not.toBe('src-1');
    expect(record.id.startsWith('pkg-1700000000000-')).toBe(true);
    expect(record.origin).toBe('export-copy');
    expect(record.metadata).toEqual({ copiedFrom: 'src-1' });
    expect(record.name).toBe('a.zip');
    expect(record.role).toBe('source');
  });

  it('两次复制得到不同 id（删除任一侧不联动）', () => {
    const pkg = { id: 'src-1', name: 'a.zip' };
    const a = copyBackRecord(pkg, { now: 1, random: () => 0.1 });
    const b = copyBackRecord(pkg, { now: 1, random: () => 0.9 });
    expect(a.id).not.toBe(b.id);
  });
});
