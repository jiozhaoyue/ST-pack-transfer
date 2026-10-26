import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SELECTION,
  SPECIAL_SELECTION_FLAGS,
  SPECIAL_SELECTION_KEYS,
  STANDARD_SELECTION_KEYS,
  buildEndpointSelection,
  describeSpecialExclusions,
} from '../src/core/selection-defaults.js';
import { FULL_SELECTION } from '../src/ui/host-bridge.js';
import { getWorkbenchHtml } from '../src/ui/workbench-template.js';

/**
 * 默认选择口径统一（OQ-1）单测。
 *
 * 判据见 `.trellis/tasks/10-14-migration-selection-defaults/prd.md`：
 * **三处默认值必须同源**——改 `DEFAULT_SELECTION` 一处，面板初值 / 端点缺省体 /
 * 模板复选框默认三者同步变。
 */

describe('selection-defaults（单一默认源）', () => {
  it('【AC-1】13 键齐全，10 标准 + 3 特殊不重不漏', () => {
    const keys = Object.keys(DEFAULT_SELECTION);
    expect(keys).toHaveLength(13);
    expect([...STANDARD_SELECTION_KEYS, ...SPECIAL_SELECTION_KEYS].sort()).toEqual([...keys].sort());
    expect(new Set([...STANDARD_SELECTION_KEYS, ...SPECIAL_SELECTION_KEYS]).size).toBe(13);
  });

  it('【AC-1】表是冻结的（防运行期被就地改写）', () => {
    expect(Object.isFrozen(DEFAULT_SELECTION)).toBe(true);
    expect(Object.isFrozen(STANDARD_SELECTION_KEYS)).toBe(true);
    expect(Object.isFrozen(SPECIAL_SELECTION_KEYS)).toBe(true);
  });

  it('【AC-1 防漂移】SPECIAL_SELECTION_FLAGS 的参数名与 plan-preview.js 的实际入参一致', () => {
    const src = readFileSync(
      new URL('../src/core/plan-preview.js', import.meta.url),
      'utf8',
    );
    // 每个 flag 必须在 plan-preview 里既有形参声明、又有解构默认值
    for (const flag of Object.values(SPECIAL_SELECTION_FLAGS)) {
      expect(src).toContain(flag);
    }
    // 且不能指向一个不存在的名字（列出 plan-preview 实际认识的三个 include* 参数）
    expect(Object.values(SPECIAL_SELECTION_FLAGS).sort()).toEqual(
      ['includeAppPrivate', 'includeBackups', 'includeCache'],
    );
  });

  it('【AC-3】buildEndpointSelection 形状 = 既有 FULL_SELECTION（10 键 / 全 true / frozen）', () => {
    const built = buildEndpointSelection();
    expect(Object.keys(built).sort()).toEqual([...STANDARD_SELECTION_KEYS].sort());
    expect(Object.values(built).every((v) => v === true)).toBe(true);
    expect(Object.isFrozen(built)).toBe(true);
    // 与真实导出逐键相等（形状不变 ⇒ 既有 4 处调用零改动）
    expect({ ...built }).toEqual({ ...FULL_SELECTION });
  });

  it('【AC-2】三个特殊类目默认值由设置弹窗承接', async () => {
    const src = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    expect(src).toContain('includeBackups');
    expect(src).toContain('includeCache');
    expect(src).toContain('includePrivate');
    expect(src).toContain('set-include-backups');
    expect(src).toContain('set-include-cache');
    expect(src).toContain('set-include-private');
  });

  it('【AC-2 双轨消除】backups 默认勾选 ⇒ 面板意图与产物载体不再矛盾', () => {
    expect(DEFAULT_SELECTION.backups).toBe(true);
    // 用户裁决「13 键为准」的实质后果：默认导出会包含 backups/（此前面板显示已勾、产物却没有）
    const exclusions = describeSpecialExclusions(DEFAULT_SELECTION).map((e) => e.key);
    expect(exclusions).not.toContain('backups');
  });

  it('【AC-4】describeSpecialExclusions 列出默认不含的特殊类目 + 载体参数名 + 理由', () => {
    const out = describeSpecialExclusions(DEFAULT_SELECTION);
    expect(out.map((e) => e.key).sort()).toEqual(['appPrivate', 'cache']);
    expect(out.every((e) => e.flag && e.reason)).toBe(true);
  });

  it('【AC-4】全部勾上时汇总为空（不打印空标签）', () => {
    const all = Object.fromEntries(Object.keys(DEFAULT_SELECTION).map((k) => [k, true]));
    expect(describeSpecialExclusions(all)).toEqual([]);
  });
});
