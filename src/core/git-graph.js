/**
 * Git 提交泳道布局（纯逻辑，不碰 DOM、不 fetch、不做 i18n）。
 *
 * 输入是**同一 ref 的最近 N 条提交**（newest → oldest），每条带 `parents`。
 * 输出直接可画的几何：节点（行 / 泳道）、边（起止行 / 泳道）、泳道数。
 *
 * 布局算法参照 gitgraph 类库的「活跃泳道」做法：
 * - 每行先认领一条含自己 sha 的泳道；没有就占第一条空泳道；
 * - 第一父提交继承当前泳道，其余父提交各占一条新泳道（合并线）；
 * - 父提交落在窗口外时给一条悬空边（向下延伸），**不伪造**被截断的历史。
 */

/** 配色档位（CSS 侧有对应 `.gg-c0 … .gg-c5`）。 */
export const GRAPH_COLORS = 6;

/**
 * @param {Array<{sha:string, parents?:string[]}>} commits 新→旧
 * @param {{laneWidth?:number, rowHeight?:number}} [options]
 * @returns {{
 *   nodes: Array<{sha:string,row:number,lane:number,color:number}>,
 *   edges: Array<{fromRow:number,fromLane:number,toRow:number,toLane:number,kind:'line'|'merge'|'dangling'}>,
 *   lanes:number, laneWidth:number, rowHeight:number, width:number, height:number
 * }}
 */
export function layoutGitGraph(commits, { laneWidth = 12, rowHeight = 24 } = {}) {
  const list = (Array.isArray(commits) ? commits : []).filter((c) => c && c.sha);
  if (!list.length) {
    return { nodes: [], edges: [], lanes: 0, laneWidth, rowHeight, width: 0, height: 0 };
  }
  const active = [];
  const laneOf = new Map();
  const rowOf = new Map();
  const nodes = [];

  const takeFreeLane = () => {
    const free = active.indexOf(null);
    if (free >= 0) return free;
    active.push(null);
    return active.length - 1;
  };
  const parentList = (row) => (Array.isArray(row.parents) ? row.parents : [])
    .map((p) => String(p || '')).filter(Boolean);

  list.forEach((commit, row) => {
    const sha = String(commit.sha);
    if (rowOf.has(sha)) return;
    rowOf.set(sha, row);
    let lane = active.indexOf(sha);
    if (lane < 0) {
      lane = takeFreeLane();
      active[lane] = sha;
    }
    laneOf.set(sha, lane);
    nodes.push({ sha, row, lane, color: lane % GRAPH_COLORS });

    const parents = parentList(commit);
    if (!parents.length) {
      active[lane] = null;
      return;
    }
    active[lane] = parents[0];
    /* 第一父已在别的泳道上 ⇒ 本泳道到此为止，线要拐到那条泳道。 */
    if (active.indexOf(parents[0]) !== lane) active[lane] = null;
    for (let i = 1; i < parents.length; i += 1) {
      if (active.includes(parents[i])) continue;
      active[takeFreeLane()] = parents[i];
    }
  });

  const edges = [];
  const seenEdges = new Set();
  for (const node of nodes) {
    const commit = list[node.row];
    const parents = parentList(commit);
    parents.forEach((parent, index) => {
      const toRow = rowOf.has(parent) ? rowOf.get(parent) : list.length;
      const toLane = laneOf.has(parent) ? laneOf.get(parent) : node.lane;
      const kind = toRow === list.length ? 'dangling' : (index === 0 ? 'line' : 'merge');
      const key = `${node.row}:${node.lane}>${toRow}:${toLane}:${kind}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      edges.push({ fromRow: node.row, fromLane: node.lane, toRow, toLane, kind });
    });
  }

  const lanes = nodes.reduce((max, node) => Math.max(max, node.lane + 1), 1);
  return {
    nodes,
    edges,
    lanes,
    laneWidth,
    rowHeight,
    width: lanes * laneWidth,
    height: list.length * rowHeight,
  };
}

/** 节点圆心的像素坐标（渲染层与测试共用同一口径）。 */
export function nodePoint(node, graph, { padX = 6, padY = 0 } = {}) {
  return {
    x: padX + node.lane * graph.laneWidth,
    y: padY + node.row * graph.rowHeight + graph.rowHeight / 2,
  };
}
