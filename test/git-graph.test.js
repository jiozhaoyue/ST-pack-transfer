import { describe, it, expect } from 'vitest';
import { layoutGitGraph, nodePoint, GRAPH_COLORS } from '../src/core/git-graph.js';

describe('layoutGitGraph', () => {
  it('空列表给零尺寸', () => {
    const g = layoutGitGraph([]);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.width).toBe(0);
    expect(g.height).toBe(0);
  });

  it('线性历史全部在同一条泳道', () => {
    const g = layoutGitGraph([
      { sha: 'c', parents: ['b'] },
      { sha: 'b', parents: ['a'] },
      { sha: 'a', parents: [] },
    ]);
    expect(g.lanes).toBe(1);
    expect(g.nodes.map((n) => n.lane)).toEqual([0, 0, 0]);
    expect(g.edges).toEqual([
      { fromRow: 0, fromLane: 0, toRow: 1, toLane: 0, kind: 'line' },
      { fromRow: 1, fromLane: 0, toRow: 2, toLane: 0, kind: 'line' },
    ]);
  });

  it('合并提交的第二父单独占泳道', () => {
    const g = layoutGitGraph([
      { sha: 'm', parents: ['a', 'b'] },
      { sha: 'a', parents: ['base'] },
      { sha: 'b', parents: ['base'] },
      { sha: 'base', parents: [] },
    ]);
    expect(g.lanes).toBe(2);
    expect(g.nodes.find((n) => n.sha === 'b').lane).toBe(1);
    const merge = g.edges.find((e) => e.kind === 'merge');
    expect(merge).toMatchObject({ fromRow: 0, fromLane: 0, toRow: 2, toLane: 1 });
    expect(g.edges.find((e) => e.fromRow === 2)).toMatchObject({ toRow: 3, toLane: 0 });
  });

  it('父提交在窗口外时给悬空边', () => {
    const g = layoutGitGraph([{ sha: 'c', parents: ['older'] }], { rowHeight: 20, laneWidth: 10 });
    expect(g.edges).toEqual([
      { fromRow: 0, fromLane: 0, toRow: 1, toLane: 0, kind: 'dangling' },
    ]);
    expect(g.height).toBe(20);
    expect(g.width).toBe(10);
  });

  it('重复 sha 只保留第一次', () => {
    const g = layoutGitGraph([
      { sha: 'a', parents: [] },
      { sha: 'a', parents: [] },
    ]);
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it('节点坐标按行高与泳道宽计算，配色循环', () => {
    const g = layoutGitGraph([
      { sha: 'm', parents: ['a', 'b'] },
      { sha: 'a', parents: [] },
      { sha: 'b', parents: [] },
    ], { laneWidth: 10, rowHeight: 24 });
    expect(nodePoint(g.nodes[0], g)).toEqual({ x: 6, y: 12 });
    expect(nodePoint(g.nodes[2], g)).toEqual({ x: 16, y: 60 });
    expect(g.nodes[2].color).toBe(1 % GRAPH_COLORS);
  });
});
