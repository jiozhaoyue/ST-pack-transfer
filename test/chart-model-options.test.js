import { describe, expect, it } from 'vitest';
import { EXTENSION_MODES, GIT_MODES, deriveExportOptions } from '../src/core/chart-model.js';

function tree() {
  return [
    { id: 'group:backups', children: [{ id: 'b1', leaf: true }, { id: 'b2', leaf: true }] },
    { id: 'group:cache', children: [{ id: 'c1', leaf: true }, { id: 'c2', leaf: true }] },
    { id: 'group:private', children: [{ id: 'p1', leaf: true }] },
    { id: 'group:native', children: [{ id: 'n1', leaf: true }, { id: 'n2', leaf: true }] },
  ];
}
const checkedBy = (sel) => (node) => !!sel[node.id];

describe('deriveExportOptions（图表 → 转换器 options）', () => {
  it('组内任一叶子勾选 ⇒ 该维度包含', () => {
    const out = deriveExportOptions({
      nodes: tree(),
      isChecked: checkedBy({ b2: true, c1: true, p1: true }),
      ui: { target: 'TauriTavern' },
    });
    expect(out.includeBackups).toBe(true);
    expect(out.includeCache).toBe(true);
    expect(out.includeAppPrivate).toBe(true);
  });

  it('全不勾 ⇒ 三个 include 为 false，原生资产被清理', () => {
    const out = deriveExportOptions({ nodes: tree(), isChecked: () => false, ui: { target: 'SillyTavern' } });
    expect(out.includeBackups).toBe(false);
    expect(out.includeCache).toBe(false);
    expect(out.includeAppPrivate).toBe(false);
    expect(out.pruneBuiltinAssets).toBe(true);
  });

  it('原生资产是正向节点：勾选 ⇒ pruneBuiltinAssets=false', () => {
    const out = deriveExportOptions({ nodes: tree(), isChecked: checkedBy({ n1: true }), ui: {} });
    expect(out.pruneBuiltinAssets).toBe(false);
  });

  it('非 TT 目标不包含 TT 应用私有', () => {
    const out = deriveExportOptions({ nodes: tree(), isChecked: checkedBy({ p1: true }), ui: { target: 'SillyTavern' } });
    expect(out.includeAppPrivate).toBe(false);
  });

  it('压缩 / 扩展 / Git / 构建配置透传并归一', () => {
    const out = deriveExportOptions({
      nodes: [],
      isChecked: () => false,
      ui: { compression: '9', extensionMode: 'manifest', gitMode: 'bogus', keepDev: true },
    });
    expect(out.compressionLevel).toBe(9);
    expect(out.extensionMode).toBe(EXTENSION_MODES.MANIFEST);
    expect(out.gitMode).toBe(GIT_MODES.KEEP);
    expect(out.keepDevFiles).toBe(true);
  });
});
