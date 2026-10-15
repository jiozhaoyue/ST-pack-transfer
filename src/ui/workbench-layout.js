/**
 * 工作台分层：**模块 / 流程 / 外壳**（`design.md` §2）。
 *
 * 本文件是三层里的**声明层**——只有数据，没有 DOM、没有副作用，因此可零桩单测。
 * 三层的职责边界（违反即失去复用价值，见 `design.md` §2.1）：
 *
 *   模块层  各模块的渲染实现（`category-filter.js` / `export-queue.js` / …）
 *           —— 唯一实现，四形态（独立/抽屉/模态）× 双端（桌面/移动）共用
 *   流程层  本文件的 `FLOWS`：只声明「哪些模块参与、选项槽填谁」
 *   外壳层  本文件的 `SHELL` + `resolveLayout()`：只声明「同一批模块怎么摆」
 *
 * 为什么要有这层：现状是 8 个区块平铺常驻（`workbench-template.js`），
 * 于是 ① 内容必然超出模态的 `max-height:92vh` ⇒ 外层滚动条；② 桌面与移动若要
 * 分别裁剪就得各写一份显隐逻辑 ⇒ 双端分叉。把「谁参与 / 谁可见 / 怎么摆」抽成
 * 纯声明后，双端只是同一份声明喂给不同的摆法。
 *
 * 与既有实现的关系：`index.js` 的 `computeActionAvailability()`（`index.js:556`）是
 * **同一思路的局部先例**——把按钮可见性收成纯函数求值，禁止在业务分支里散落写
 * `style.display`（历史上有 14 处分散写点）。本模块把那套做法从「三枚按钮」推广到
 * 「整页模块」。
 */

/**
 * 模块 id 全集。每个 id 必须对应模板里一处 `data-wb-module="<id>"` 的容器，
 * 以及一个渲染实现——由 `test/workbench-layout.test.js` 对账模板源码，防声明与 DOM 漂移。
 */
export const MODULE_IDS = Object.freeze([
  'quota',     // 配额与数据分布（顶部常驻）
  'source',    // 上传槽 / 宿主源槽
  'scope',     // 内容范围（13 类目）
  'pack',      // 打包选项（仅导出流程）
  'restore',   // 恢复选项（仅导入流程）
  'action',    // 主操作条 + 进度
  'products',  // 产物列表
  'log',       // 日志控制台
]);

/**
 * 流程声明。
 *
 * **不变式（可判定）**：两个流程可以组合不同模块，但
 * ① 共享内核（`quota` / `source` / `action` / `products` / `log`）**必须完全一致**；
 * ② 差异**只准**落在 `scope` / `pack` / `restore` 三个模块上。
 *
 * 这条替换了 `design.md` §2 初稿里「唯一差异是选项槽」的写法——那句**与真实功能边界不符**：
 * 恢复（导入）走的是整包写回，不认类目勾选，因此 `scope` 本就不该出现在导入流程里。
 * 强行让两流程同构只会造出一个「选了也不生效」的假控件（本仓已有死控件前科，
 * 见 `check:control-consumer` 的注释：守卫只强制「声明存在」，不验证声明为真）。
 *
 * 真正要防的是**模块实现出第二份**——那才是用户 2026-10-15 说的
 * 「我想要模块都可以复用，不用出重复的」。
 */
export const FLOWS = Object.freeze({
  out: Object.freeze({
    label: '导出',
    options: 'pack',
    modules: Object.freeze(['quota', 'source', 'scope', 'pack', 'action', 'products', 'log']),
  }),
  in: Object.freeze({
    label: '导入',
    options: 'restore',
    modules: Object.freeze(['quota', 'source', 'restore', 'action', 'products', 'log']),
  }),
});

/** 两个流程必须完全一致的共享内核（顺序无关）。 */
export const SHARED_CORE_MODULES = Object.freeze(['quota', 'source', 'action', 'products', 'log']);

/** 允许两流程分歧的模块——超出这个集合即视为「流程各自长出了实现」。 */
export const FLOW_VARIANT_MODULES = Object.freeze(['scope', 'pack', 'restore']);

/** 流程 id 全集，顺序即方向开关的渲染顺序。 */
export const FLOW_IDS = Object.freeze(Object.keys(FLOWS));

/** 阶段 id 全集，顺序即生命周期顺序。 */
export const STAGES = Object.freeze(['idle', 'scanned', 'running', 'awaiting', 'done']);

/**
 * 阶段门控：**这是「初始只有上传和打包区」与「禁止滚动条」的同一处解**。
 *
 * 现状 8 个区块常驻 ⇒ 内容必然超 `max-height:92vh`（`style.css:1919-1924`）⇒ 外层滚动条。
 * 把滚动挪到内层 div 只是换个位置显示同一根滚动条；真正的解法是**同时可见的模块变少**。
 *
 * @param {'idle'|'scanned'|'running'|'done'} stage
 * @param {'out'|'in'} flow
 * @returns {ReadonlyArray<string>} 该阶段应当渲染的模块 id
 */
export function visibleModules(stage, flow) {
  const spec = FLOWS[flow];
  if (!spec) return Object.freeze([]);
  const base = ['quota', 'source'];
  // `log` 是**常驻模块**：它是一条折叠着的单行抽屉，几乎不占版面，
  // 却是扫描/转换出错时唯一的可见反馈。按阶段藏起来会让人「看不到错误」——
  // 与「初始只有上传和打包区」并不冲突（那句话针对的是**内容区块**，不是状态条）。
  const persistent = ['log'];
  let ids;
  switch (stage) {
    case 'idle':
      // 用户 2026-10-15：初始只有上传和打包区，上方显示配额与数据分布
      ids = [...base, spec.options, ...persistent];
      break;
    case 'scanned':
      ids = [...base, 'scope', spec.options, 'action', ...persistent];
      break;
    case 'running':
      // 执行期只留「我在干什么」——进度在 action 内，范围/选项/产物一律让位
      ids = [...base, 'action', ...persistent];
      break;
    case 'awaiting':
      // 「执行到一半停下来等用户拍板」——宿主拉取要渲染统一文件树并等确认。
      // 这不是 running：running 藏掉 scope 会让文件树确认条不在视野里 ⇒ 用户无从确认。
      ids = [...base, 'scope', 'action', ...persistent];
      break;
    case 'done':
      ids = [...base, 'products', 'action', ...persistent];
      break;
    default:
      ids = [];
  }
  // 必须再按流程的模块清单过滤：否则导入流程会冒出 `scope` ——
  // 恢复走整包写回、不认类目勾选，那个面板在导入屏上是个「选了也不生效」的假控件。
  return Object.freeze(ids.filter((id) => spec.modules.includes(id)));
}

/**
 * 由工作台实况派生阶段（纯函数，无 DOM）。
 *
 * 判据优先级即语义优先级：**等待用户拍板压倒一切**（此时界面必须把待确认的东西摆出来，
 * 藏起来就是死锁）；**在途任务次之**（此时用户最需要看进度，而不是看到上一次的产物）；
 * 有产物即 `done`（产物比计划更「新」）；有计划即 `scanned`；否则 `idle`。
 *
 * @param {{hasPlan?: boolean, isRunning?: boolean, isAwaiting?: boolean, hasProducts?: boolean}} s
 * @returns {'idle'|'scanned'|'running'|'awaiting'|'done'}
 */
export function stageOf(state) {
  const { hasPlan = false, isRunning = false, isAwaiting = false, hasProducts = false } = state || {};
  if (isAwaiting) return 'awaiting';
  if (isRunning) return 'running';
  if (hasProducts) return 'done';
  if (hasPlan) return 'scanned';
  return 'idle';
}

/**
 * 外壳声明。`options` 是占位符，由 `FLOWS[flow].options` 解析——
 * 这是「打包区 vs 恢复区不产生第二个模块」的落点（`design.md` §2.3）。
 */
export const SHELL = Object.freeze({
  desktop: Object.freeze({
    // 左 = 数据侧（进/出），右 = 决策侧（范围/选项/执行）
    left: Object.freeze(['quota', 'source', 'products', 'log']),
    right: Object.freeze(['scope', 'options', 'action']),
  }),
  mobile: Object.freeze({
    order: 'flow',                        // 按 FLOWS[flow].modules 顺序单列
    sticky: Object.freeze(['action']),    // 吸底，不随滚动跑掉
    collapsible: Object.freeze(['scope', 'pack', 'restore', 'log']),
  }),
});

/**
 * 解析外壳摆法：把 `options` 占位符换成当前流程的实际模块，并过滤掉本阶段不可见的模块。
 *
 * 返回的每个位置都只含**可见**模块——外壳不负责「隐藏」，只负责「不渲染」。
 * 这条是 AC-2.3 的实现依据：切屏与切阶段都是**移出 DOM**，不是 `display:none`。
 *
 * @param {'out'|'in'} flow
 * @param {'desktop'|'mobile'} formFactor
 * @param {'idle'|'scanned'|'running'|'done'} stage
 * @returns {{formFactor: string, columns?: Array<ReadonlyArray<string>>, order?: ReadonlyArray<string>,
 *            sticky?: ReadonlyArray<string>, collapsible?: ReadonlyArray<string>}}
 */
export function resolveLayout(flow, formFactor, stage) {
  const spec = FLOWS[flow];
  if (!spec) return Object.freeze({ formFactor, columns: Object.freeze([Object.freeze([]), Object.freeze([])]) });

  const visible = new Set(visibleModules(stage, flow));
  const fill = (slot) => (slot === 'options' ? spec.options : slot);
  const keep = (list) => Object.freeze(list.map(fill).filter((id) => visible.has(id)));

  if (formFactor === 'mobile') {
    const collapsible = SHELL.mobile.collapsible.filter((id) => visible.has(id));
    return Object.freeze({
      formFactor: 'mobile',
      order: Object.freeze(spec.modules.filter((id) => visible.has(id))),
      sticky: Object.freeze(SHELL.mobile.sticky.filter((id) => visible.has(id))),
      // 初始态只有三个模块，选项槽是**主内容**而非次要内容 ——
      // 折叠它等于把当前唯一能配的东西藏起来（用户 2026-10-15：初始只有上传和打包区）。
      collapsible: Object.freeze(
        stage === 'idle' ? collapsible.filter((id) => id !== spec.options) : collapsible,
      ),
    });
  }
  return Object.freeze({
    formFactor: 'desktop',
    columns: Object.freeze([keep(SHELL.desktop.left), keep(SHELL.desktop.right)]),
  });
}

/**
 * 断点判据：与 `style.css` 的媒体查询**必须同源**。
 * 改这里必须同时改 CSS，反之亦然——由 `test/workbench-layout.test.js` 对账。
 */
export const MOBILE_MAX_WIDTH = 480;
