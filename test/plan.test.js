import { describe, expect, it } from 'vitest';
import * as zip from '@zip.js/zip.js';
import { generatePlan, ACTIONS, SPECIAL_CATEGORIES } from '../src/core/plan-preview.js';
import { lEntries, stEntries, ttEntries } from '../fixtures/gen.js';

async function createFixtureBlob(entries) {
  const blobWriter = new zip.BlobWriter('application/zip');
  const writer = new zip.ZipWriter(blobWriter);
  for (const [name, data] of entries) {
    await writer.add(name, new zip.Uint8ArrayReader(new Uint8Array(data)));
  }
  await writer.close();
  return blobWriter.getData();
}

describe('完全扫描与转换动作预测引擎 (generatePlan)', () => {
  it('从 ST 转换到 TT: 正确预测 ROUTE、DROP 缓存、合成项与分类条目', async () => {
    const sourceBlob = await createFixtureBlob(stEntries());
    const plan = await generatePlan(sourceBlob, 'tt', {
      includeCache: false,
      includeBackups: true,
    });

    expect(plan.sourceLayout).toBe('st');
    expect(plan.targetLayout).toBe('tt');
    expect(plan.totalSourceFiles).toBeGreaterThanOrEqual(10);

    // 缩略图缓存应被预测为 DROP
    const cacheItems = plan.categories[SPECIAL_CATEGORIES.CACHE].items;
    expect(cacheItems.length).toBeGreaterThanOrEqual(1);
    expect(cacheItems.every((item) => item.action === ACTIONS.DROP)).toBe(true);

    // 角色卡应被预测为 ROUTE (从 characters/ -> data/default-user/characters/)
    const charItems = plan.categories.characters.items;
    expect(charItems.length).toBe(1);
    expect(charItems[0].action === ACTIONS.ROUTE).toBe(true);
    expect(charItems[0].targetPath).toContain('data/default-user/characters/');

    // 用户级扩展转换到 TT 时保留作用域：落 data/default-user/extensions/（2026-11-12 裁定）
    const extItems = plan.categories.extensions.items;
    expect(extItems.length).toBe(2);
    expect(extItems[0].targetPath).toContain('data/default-user/extensions/');

    // 统计数据
    expect(plan.actionStats[ACTIONS.ROUTE]).toBeGreaterThan(0);
    expect(plan.actionStats[ACTIONS.DROP]).toBeGreaterThan(0);
  });

  it('单项穿透反选与类目反选: 正确标记 FILTER 状态与预估输出体积', async () => {
    const sourceBlob = await createFixtureBlob(lEntries());
    const excludedPaths = new Set(['characters/Fixture Character.png']);

    const plan = await generatePlan(sourceBlob, 'pt', {
      selection: {
        secrets: false, // 类目级排除
      },
      excludedPaths,   // 单项穿透排除
    });

    // 角色卡因单项排除标记为 FILTER
    const charItem = plan.categories.characters.items[0];
    expect(charItem.selected).toBe(false);
    expect(charItem.action).toBe(ACTIONS.FILTER);
    expect(charItem.reason).toContain('单项穿透反选');

    // secrets 因类目排除标记为 FILTER
    const secretItem = plan.categories.secrets.items[0];
    expect(secretItem.selected).toBe(false);
    expect(secretItem.action).toBe(ACTIONS.FILTER);
    expect(secretItem.reason).toContain('所属类目未勾选');

    // 输出预期文件数应扣除这些条目
    expect(plan.expectedOutputFiles).toBeLessThan(plan.totalSourceFiles);
  });

  it('TT 源含 tauritavern-settings.json + ST 目标 + 默认选项：规划为 ROUTE 且落到 _compat/tt/（P2 规划漂移）', async () => {
    const sourceBlob = await createFixtureBlob([
      ...ttEntries(),
      ['data/default-user/tauritavern-settings.json', Buffer.from('{"lanSync":true}', 'utf8')],
    ]);
    // 默认选项：includeCache/includeBackups/includeAppPrivate/keepAll 全为 false
    const plan = await generatePlan(sourceBlob, 'st');

    const appPrivate = plan.categories[SPECIAL_CATEGORIES.APP_PRIVATE].items
      .find((item) => item.hubPath === 'tauritavern-settings.json');
    expect(appPrivate).toBeDefined();
    // 不再因默认选项报 DROP；与 transform 产物一致：ROUTE 到 _compat/tt/ 沙箱。
    expect(appPrivate.action).toBe(ACTIONS.ROUTE);
    expect(appPrivate.rawAction).toBe(ACTIONS.ROUTE);
    expect(appPrivate.targetPath).toBe('_compat/tt/tauritavern-settings.json');
    expect(appPrivate.selected).toBe(true);
  });
});
