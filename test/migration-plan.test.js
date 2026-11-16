import { describe, expect, it, beforeEach } from 'vitest';
import * as zip from '@zip.js/zip.js';
import { generatePlan } from '../src/core/plan-preview.js';
import {
  createMigrationPlan,
  isMigrationPlan,
  STANDARD_CATEGORIES,
  SPECIAL_CATEGORY_KEYS,
  __resetRevisionCounter,
} from '../src/core/migration-plan.js';
import { stEntries } from '../fixtures/gen.js';

async function createFixtureBlob(entries) {
  const blobWriter = new zip.BlobWriter('application/zip');
  const writer = new zip.ZipWriter(blobWriter);
  for (const [name, data] of entries) {
    await writer.add(name, new zip.Uint8ArrayReader(new Uint8Array(data)));
  }
  await writer.close();
  return blobWriter.getData();
}

/** 10 标准类目全选的显式请求快照（对齐 D-07 的「默认全选」口径）。 */
function fullSelection() {
  return Object.fromEntries(STANDARD_CATEGORIES.map((c) => [c, true]));
}

beforeEach(() => {
  __resetRevisionCounter();
});

describe('createMigrationPlan（S1 统一迁移计划）', () => {
  it('AC1 默认全选：requested 与 effective 分列且可核', async () => {
    const source = await createFixtureBlob(stEntries());
    const basePlan = await generatePlan(source, 'tt', { selection: fullSelection() });

    const plan = createMigrationPlan({
      source: { layout: 'st', handle: 'default-user' },
      target: { layout: 'tt' },
      requestedSelection: fullSelection(),
      basePlan,
    });

    // requested：逐类目布尔快照，与输入一致
    for (const cat of STANDARD_CATEGORIES) {
      expect(plan.requested.selection[cat]).toBe(true);
    }
    // effective：来自 basePlan 映射，不是从 requested 推导
    expect(plan.effective.source).toBe('base-plan');
    expect(plan.effective.selectedCount).toBe(basePlan.expectedOutputFiles);
    expect(plan.effective.selectedBytes).toBe(basePlan.expectedOutputBytes);
    expect(Object.keys(plan.effective.byCategory).length).toBeGreaterThan(0);
  });

  it('AC2 污染隔离：不可用类目（count=0）不改写 requested', async () => {
    // 造一个 basePlan，其中 characters 类目 count=0（模拟 renderCategoryStats 会写回 false 的场景）
    const source = await createFixtureBlob(stEntries());
    const basePlan = await generatePlan(source, 'tt', { selection: fullSelection() });
    basePlan.categories.characters = { count: 0, sizeBytes: 0, selectedCount: 0, selectedSizeBytes: 0, items: [] };

    const requested = fullSelection();
    const plan = createMigrationPlan({
      source: { layout: 'st' },
      target: { layout: 'tt' },
      requestedSelection: requested,
      basePlan,
    });

    // 关键：effective 里 characters 为 0，但 requested 仍是用户显式传入的 true
    expect(plan.effective.byCategory.characters.count).toBe(0);
    expect(plan.requested.selection.characters).toBe(true);

    // 反证：显式传入 false 时 requested 就是 false（只认输入，不猜）
    const plan2 = createMigrationPlan({
      source: { layout: 'st' },
      target: { layout: 'tt' },
      requestedSelection: { ...requested, characters: false },
      basePlan,
    });
    expect(plan2.requested.selection.characters).toBe(false);
  });

  it('AC5 effective 与既有 generatePlan 的选中集合一致', async () => {
    const source = await createFixtureBlob(stEntries());
    const selection = { ...fullSelection(), secrets: false };
    const excludedPaths = new Set();
    const basePlan = await generatePlan(source, 'pt', { selection, excludedPaths });

    const plan = createMigrationPlan({
      source: { layout: 'st' },
      target: { layout: 'pt' },
      requestedSelection: selection,
      excludedPaths: [...excludedPaths],
      basePlan,
    });

    // 逐类目比对 selectedCount / selectedSizeBytes
    for (const [catKey, catData] of Object.entries(basePlan.categories)) {
      const mapped = plan.effective.byCategory[catKey];
      expect(mapped.selectedCount).toBe(catData.selectedCount);
      expect(mapped.selectedSizeBytes).toBe(catData.selectedSizeBytes);
      expect(mapped.count).toBe(catData.count);
    }
    // 排除项数量 = basePlan 中 selected===false 的条目数
    const expectedExclusions = Object.values(basePlan.categories)
      .flatMap((c) => c.items || [])
      .filter((it) => it.selected === false).length;
    expect(plan.effective.exclusions.length).toBe(expectedExclusions);
  });

  it('返回深度冻结快照，且 revision 单调递增', () => {
    const a = createMigrationPlan({ source: { layout: 'st' }, target: { layout: 'tt' } });
    const b = createMigrationPlan({ source: { layout: 'st' }, target: { layout: 'tt' } });
    expect(isMigrationPlan(a)).toBe(true);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.requested)).toBe(true);
    expect(Object.isFrozen(a.requested.selection)).toBe(true);
    expect(b.revision).toBeGreaterThan(a.revision);
  });

  it('无 basePlan 时 effective 诚实标记来源缺失（不伪造为 0 覆盖）', () => {
    const plan = createMigrationPlan({
      source: { layout: 'st' },
      target: { layout: 'l' },
      requestedSelection: fullSelection(),
    });
    expect(plan.basePlanProvided).toBe(false);
    expect(plan.effective.source).toBe('none');
    expect(plan.effective.selectedCount).toBe(0);
  });

  it('特殊类目走独立标志，不进标准 selection', () => {
    const plan = createMigrationPlan({
      source: { layout: 'st' },
      target: { layout: 'tt' },
      requestedSelection: fullSelection(),
      specials: { backups: true, cache: false, appPrivate: true },
    });
    expect(plan.requested.specials.backups).toBe(true);
    expect(plan.requested.specials.cache).toBe(false);
    expect(plan.requested.specials.appPrivate).toBe(true);
    // 标准 selection 里不含特殊类目键
    for (const key of SPECIAL_CATEGORY_KEYS) {
      expect(key in plan.requested.selection).toBe(false);
    }
  });

  it('非法 source/target layout 抛错（pt-native 现为合法源）', () => {
    expect(() => createMigrationPlan({ source: { layout: 'pt-native' }, target: { layout: 'tt' } }))
      .not.toThrow();
    expect(() => createMigrationPlan({ source: { layout: 'unknown' }, target: { layout: 'tt' } }))
      .toThrow(/source\.layout/);
    expect(() => createMigrationPlan({ source: { layout: 'st' }, target: { layout: 'unknown' } }))
      .toThrow(/target\.layout/);
    // pt-native 只能作源，不能作目标
    expect(() => createMigrationPlan({ source: { layout: 'st' }, target: { layout: 'pt-native' } }))
      .toThrow(/target\.layout/);
  });

  it('能力矩阵缺省为全 unknown（unknown 不是 available）', () => {
    const plan = createMigrationPlan({ source: { layout: 'st' }, target: { layout: 'st' } });
    const cell = plan.capabilities.st;
    expect(cell.sourceRead).toBe('unknown');
    expect(cell.targetWrite).toBe('unknown');
    expect(cell.permission).toBe('unknown');
  });
});
