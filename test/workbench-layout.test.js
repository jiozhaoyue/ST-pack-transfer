import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FLOWS,
  FLOW_IDS,
  FLOW_VARIANT_MODULES,
  MODULE_IDS,
  MOBILE_MAX_WIDTH,
  SHARED_CORE_MODULES,
  SHELL,
  STAGES,
  resolveLayout,
  stageOf,
  visibleModules,
} from '../src/ui/workbench-layout.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const CSS = read('../style.css');
const TEMPLATE = read('../src/ui/workbench-template.js');

/**
 * 三层声明层（模块 / 流程 / 外壳）的不变量守护。
 *
 * 为什么要锁这些：`design.md` §2 的三层分离**只有在声明自洽时才有复用价值**。
 * 一旦「两个流程的差异不止 options 槽」，复用就退化成两份实现——那正是本次重构
 * 要消除的东西（用户 2026-10-15：「我想要模块都可以复用，不用出重复的」）。
 * 声明层是纯数据，所以这些不变量可以零桩断言，不需要 DOM。
 */

describe('流程声明：共享内核一致，分歧只准落在声明的三个模块上', () => {
  it('每个流程的模块都在 MODULE_IDS 全集内，且无重复', () => {
    for (const id of FLOW_IDS) {
      const mods = FLOWS[id].modules;
      expect(new Set(mods).size).toBe(mods.length);
      for (const m of mods) expect(MODULE_IDS).toContain(m);
    }
  });

  it('选项槽本身是合法模块 id，且两侧互不相同', () => {
    expect(MODULE_IDS).toContain(FLOWS.out.options);
    expect(MODULE_IDS).toContain(FLOWS.in.options);
    expect(FLOWS.out.options).not.toBe(FLOWS.in.options);
  });

  it('共享内核（quota/source/action/products/log）在两个流程里都存在', () => {
    for (const id of FLOW_IDS) {
      for (const core of SHARED_CORE_MODULES) {
        expect(FLOWS[id].modules).toContain(core);
      }
    }
  });

  it('两流程的分歧**不超出** scope/pack/restore —— 超出即「流程各自长出了实现」', () => {
    const out = new Set(FLOWS.out.modules);
    const inn = new Set(FLOWS.in.modules);
    const onlyOut = [...out].filter((m) => !inn.has(m));
    const onlyIn = [...inn].filter((m) => !out.has(m));
    for (const m of [...onlyOut, ...onlyIn]) {
      expect(FLOW_VARIANT_MODULES).toContain(m);
    }
  });

  it('分歧非空（否则上一条会因「两流程全同」而假绿）', () => {
    expect(FLOWS.out.modules).not.toEqual(FLOWS.in.modules);
  });

  it('每个流程都声明了自己的选项槽（否则 options 无从解析）', () => {
    for (const id of FLOW_IDS) {
      expect(FLOWS[id].modules).toContain(FLOWS[id].options);
    }
  });
});

describe('阶段门控：初始态只给「上传 + 选项槽」（用户 2026-10-15 裁定）', () => {
  it('idle = 配额 + 上传槽 + 选项槽 + 常驻日志，且不含范围/产物/执行条', () => {
    for (const flow of FLOW_IDS) {
      const v = visibleModules('idle', flow);
      expect([...v].sort()).toEqual(['quota', 'source', 'log', FLOWS[flow].options].sort());
      for (const absent of ['scope', 'products', 'action']) {
        expect(v).not.toContain(absent);
      }
    }
  });

  it('日志是常驻模块：任何阶段都不消失（它是出错时唯一的可见反馈）', () => {
    for (const stage of STAGES) {
      for (const flow of FLOW_IDS) {
        expect(visibleModules(stage, flow)).toContain('log');
      }
    }
  });

  it('scanned 追加范围与执行条', () => {
    const v = visibleModules('scanned', 'out');
    expect(v).toContain('scope');
    expect(v).toContain('action');
    expect(v).not.toContain('products');
  });

  it('running 收掉范围与产物，只留配额 + 上传槽 + 执行条 + 日志', () => {
    expect([...visibleModules('running', 'out')].sort())
      .toEqual(['action', 'log', 'quota', 'source']);
  });

  it('awaiting（等用户确认文件树）必须保留 scope —— 藏掉它用户就看不到确认条', () => {
    const v = visibleModules('awaiting', 'out');
    expect(v).toContain('scope');
    expect(v).toContain('action');
    expect(v).not.toContain('products');
  });

  it('导入流程**永不**出现 scope —— 恢复走整包写回，类目勾选在那里不生效', () => {
    for (const stage of STAGES) {
      expect(visibleModules(stage, 'in')).not.toContain('scope');
      expect(visibleModules(stage, 'in')).not.toContain('pack');
    }
  });

  it('running 只留配额 + 上传槽 + 执行条（在途时进度压倒一切）', () => {
    expect([...visibleModules('running', 'out')].sort()).toEqual(['action', 'log', 'quota', 'source']);
  });

  it('done 含产物与日志', () => {
    const v = visibleModules('done', 'out');
    expect(v).toContain('products');
    expect(v).toContain('log');
  });

  it('每个阶段 × 每个流程的组合都有定义（无空洞）', () => {
    for (const stage of STAGES) {
      for (const flow of FLOW_IDS) {
        expect(visibleModules(stage, flow).length).toBeGreaterThan(0);
      }
    }
  });

  it('未知流程返回空集而不是抛错（调用方无需分支）', () => {
    expect([...visibleModules('idle', 'nope')]).toEqual([]);
  });
});

describe('阶段派生：等待确认 > 在途 > 产物 > 计划 > 空（纯函数，无 DOM）', () => {
  it('优先级：isAwaiting 压倒 isRunning —— 等用户拍板时界面必须把待确认的东西摆出来', () => {
    expect(stageOf({ isAwaiting: true, isRunning: true, hasProducts: true })).toBe('awaiting');
  });

  it('优先级：isRunning 压倒 hasProducts 与 hasPlan', () => {
    expect(stageOf({ isRunning: true, hasProducts: true, hasPlan: true })).toBe('running');
  });

  it('产物比计划更「新」⇒ done', () => {
    expect(stageOf({ hasProducts: true, hasPlan: true })).toBe('done');
  });

  it('有计划无产物 ⇒ scanned；全空 ⇒ idle', () => {
    expect(stageOf({ hasPlan: true })).toBe('scanned');
    expect(stageOf({})).toBe('idle');
  });

  it('入参缺省不抛错（外壳可在早期无状态时调用）', () => {
    expect(stageOf()).toBe('idle');
    expect(stageOf(null)).toBe('idle');
  });
});

describe('外壳摆法：解析 options 占位符，且只返回**可见**模块', () => {
  it('桌面：左右两栏，占位符换成当前流程的选项槽', () => {
    const out = resolveLayout('out', 'desktop', 'scanned');
    expect(out.columns.length).toBe(2);
    expect(out.columns[1]).toContain('pack');
    expect(out.columns[1]).not.toContain('restore');

    const inn = resolveLayout('in', 'desktop', 'scanned');
    expect(inn.columns[1]).toContain('restore');
    expect(inn.columns[1]).not.toContain('pack');
  });

  it('不可见模块**不出现**在任何位置（外壳据此翻 hidden）', () => {
    const idle = resolveLayout('out', 'desktop', 'idle');
    const flat = idle.columns.flat();
    expect(flat).not.toContain('scope');
    expect(flat).not.toContain('products');
    expect(flat).not.toContain('action');
    expect(flat).toContain('source');
    expect(flat).toContain('pack');
    expect(flat).toContain('log');
  });

  it('桌面左右两栏的并集 == 该阶段可见模块全集（无遗漏、无重复）', () => {
    for (const flow of FLOW_IDS) {
      for (const stage of STAGES) {
        const layout = resolveLayout(flow, 'desktop', stage);
        const flat = layout.columns.flat();
        expect(new Set(flat).size).toBe(flat.length); // 无重复
        expect([...flat].sort()).toEqual([...visibleModules(stage, flow)].sort());
      }
    }
  });

  it('移动：单列顺序跟随 FLOWS[flow].modules，且已过滤不可见项', () => {
    const layout = resolveLayout('out', 'mobile', 'scanned');
    const expected = FLOWS.out.modules.filter((m) => visibleModules('scanned', 'out').includes(m));
    expect([...layout.order]).toEqual(expected);
  });

  it('移动：吸底与折叠清单只含可见模块', () => {
    const idle = resolveLayout('out', 'mobile', 'idle');
    expect([...idle.sticky]).toEqual([]);              // idle 无 action ⇒ 无吸底
    expect([...idle.collapsible]).toEqual(['log']);    // 选项槽在初始态是主内容，不可折叠

    const scanned = resolveLayout('out', 'mobile', 'scanned');
    expect(scanned.sticky).toContain('action');
    expect(scanned.collapsible).toContain('scope');
  });

  it('未知流程退回空两栏而不是抛错', () => {
    const bad = resolveLayout('nope', 'desktop', 'idle');
    expect(bad.columns.flat()).toEqual([]);
  });
});

describe('声明与 CSS 同源：断点常量必须与媒体查询一致', () => {
  it(`MOBILE_MAX_WIDTH(${MOBILE_MAX_WIDTH}) 在 style.css 中存在对应媒体查询`, () => {
    expect(CSS).toContain(`@media (max-width: ${MOBILE_MAX_WIDTH}px)`);
  });

  it('移动外壳声明的吸底模块确实由 sticky/fixed 承载（防止声明与样式脱节）', () => {
    expect(SHELL.mobile.sticky).toContain('action');
  });
});

describe('声明与模板同源：每个模块 id 都要有 data-wb-module 容器', () => {
  it('模板声明的模块 id 集合 == MODULE_IDS（同一模块可有多处容器，如 pack 含打包+清理+差量）', () => {
    const declared = [...TEMPLATE.matchAll(/data-wb-module="([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);
    expect([...new Set(declared)].sort()).toEqual([...MODULE_IDS].sort());
  });

  it('每个模块 id 至少有一处容器（无声明即无从渲染）', () => {
    for (const id of MODULE_IDS) {
      expect(TEMPLATE).toContain(`data-wb-module="${id}"`);
    }
  });

  it('方向开关必须嵌在 #wb-shell 内部 —— 外壳靠 shell.querySelector 找它', () => {
    // 2026-10-15 实测踩过：开关写在 shell 外面（兄弟节点）不会报错，
    // 只会让 syncFlowTabs 静默找不到按钮 ⇒ 方向切换整个失效。
    // 单测夹具当时把开关放进了 shell 内，所以夹具绿而真页面红 —— 这条按模板源码补上。
    const shellOpen = TEMPLATE.indexOf('id="wb-shell"');
    const switchIdx = TEMPLATE.indexOf('id="wb-flow-switch"');
    const colLeftIdx = TEMPLATE.indexOf('id="wb-col-left"');
    expect(shellOpen).toBeGreaterThan(-1);
    expect(switchIdx).toBeGreaterThan(shellOpen);
    expect(switchIdx).toBeLessThan(colLeftIdx);
  });

  it('两个栏目容器都存在于模板中（外壳按 id 取它们）', () => {
    expect(TEMPLATE).toContain('id="wb-col-left"');
    expect(TEMPLATE).toContain('id="wb-col-right"');
  });
});
