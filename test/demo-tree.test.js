/**
 * 教程占位树结构锁（2026-11-17 用户裁定）：
 * 教程不得维护手写树；必须由真实 buildChartTree 派生，组键/顺序与 CHART_GROUPS 一致。
 * 这样真实分组结构变化时，教程被动跟随，不靠人工同步。
 */
import { describe, expect, it } from 'vitest';
import { CHART_GROUPS } from '../src/core/chart-model.js';
import { demoTree, demoUnknownTree } from '../src/core/demo-tree.js';

const HOSTS = ['st', 'luker', 'tt', 'pt'];
const ENGINES = ['fs', 'postgres', 'mysql', 'sqlite'];

function sumMb(nodes) {
  return (nodes || []).reduce((sum, n) => (
    sum + (n.children && n.children.length ? sumMb(n.children) : (Number(n.mb) || 0))
  ), 0);
}
function leaves(nodes, out = []) {
  for (const n of nodes || []) {
    if (n.children && n.children.length) leaves(n.children, out);
    else out.push(n);
  }
  return out;
}
function groupIds(nodes) {
  return (nodes || []).map((n) => n.id);
}

describe('教程占位树 = 真实 buildChartTree 结构', () => {
  for (const host of HOSTS) {
    for (const engine of ENGINES) {
      it(`${host}/${engine}: 组键与顺序来自 CHART_GROUPS，体积精确`, () => {
        const tree = demoTree(1000, host, engine);
        const ids = groupIds(tree);
        const allowed = new Set(CHART_GROUPS.map((g) => `group:${g.key}`));
        expect(ids.every((id) => allowed.has(id))).toBe(true);
        expect(ids).not.toContain('group:engine');
        const expectedOrder = CHART_GROUPS
          .map((g) => `group:${g.key}`)
          .filter((id) => ids.includes(id));
        expect(ids).toEqual(expectedOrder);
        expect(sumMb(tree)).toBeCloseTo(1000, 1);
      });
    }
  }

  it('四宿主都包含真实一级组：聊天/角色/世界书/图片/预设/扩展/私有/备份/缓存/向量/原生', () => {
    const required = ['chats', 'characters', 'lorebooks', 'images', 'presets', 'extensions', 'private', 'backups', 'cache', 'vectors', 'native'];
    for (const host of HOSTS) {
      const ids = groupIds(demoTree(1000, host, 'fs'));
      for (const key of required) expect(ids).toContain(`group:${key}`);
    }
  });

  it('私有配置叶子必须带 privateConfig；引擎载体只进入真实组，不另造 group:engine', () => {
    for (const host of HOSTS) {
      for (const engine of ['fs', 'postgres', 'mysql', 'sqlite']) {
        const tree = demoTree(1000, host, engine);
        const priv = tree.find((n) => n.id === 'group:private');
        expect(priv).toBeTruthy();
        expect(leaves(priv.children).every((n) => n.privateConfig === true)).toBe(true);
        const allPaths = leaves(tree).map((n) => n.path).join('\n');
        /* 引擎载体只属于 Luker；其它宿主的包不得凭空出现。 */
        if (host !== 'luker' || engine === 'fs') {
          expect(allPaths).not.toMatch(/_engine_(meta|dump)\.bin|luker-storage\.sqlite/);
        } else {
          expect(allPaths).toMatch(engine === 'sqlite' ? /luker-storage\.sqlite/ : /_engine_dump\.bin/);
        }
      }
    }
  });

  it('宿主目录习惯：TT 以 data/ 开头，PT 以 modules/ 开头，ST/Luker 保持扁平', () => {
    for (const engine of ['fs', 'postgres']) {
      const tt = leaves(demoTree(100, 'tt', engine)).map((n) => n.path);
      expect(tt.length).toBeGreaterThan(0);
      expect(tt.every((p) => p.startsWith('data/'))).toBe(true);
      expect(tt.join('\n')).not.toMatch(/_engine_(meta|dump)\.bin|luker-storage\.sqlite/);

      const pt = leaves(demoTree(100, 'pt', engine)).map((n) => n.path);
      expect(pt.length).toBeGreaterThan(0);
      expect(pt.every((p) => p.startsWith('modules/'))).toBe(true);
      expect(pt.join('\n')).not.toMatch(/_engine_(meta|dump)\.bin|luker-storage\.sqlite/);

      for (const host of ['st', 'luker']) {
        const flat = leaves(demoTree(100, host, engine)).map((n) => n.path);
        expect(flat.length).toBeGreaterThan(0);
        expect(flat.every((p) => !p.startsWith('data/') && !p.startsWith('modules/'))).toBe(true);
      }
    }
  });

  it('未识别教程包仍走真实建树，只落在 unknown 组', () => {
    const tree = demoUnknownTree(10);
    expect(groupIds(tree)).toEqual(['group:unknown']);
    expect(sumMb(tree)).toBeCloseTo(10, 1);
  });
});
