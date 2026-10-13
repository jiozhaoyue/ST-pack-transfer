/**
 * 迁移向导（S5 第二步）：纯状态机 / 步骤邻接 / 不兼容门判据 / 模板归属完整性。
 *
 * DOM 装配（`mountMigrationWizard`）不在本文件覆盖——本仓 Vitest 默认 `environment: 'node'`，
 * 无 jsdom；DOM 行为由静态守卫（`check:template-source` / `check:control-consumer`）与
 * 独立 Web E2E 覆盖，此处只锁**可纯判定的部分**。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WIZARD_STEPS,
  WIZARD_VIEWS,
  stepIndexOf,
  nextStepId,
  prevStepId,
  createWizardMachine,
  buildSessionGateVerdict,
  extractStepOwners,
  unknownStepOwners,
} from '../src/ui/migration-wizard.js';
import { SESSION_SCHEMA_VERSION } from '../src/core/migration-session.js';

const TEMPLATE = readFileSync(new URL('../src/ui/workbench-template.js', import.meta.url), 'utf8');

describe('WIZARD_STEPS（六步定义）', () => {
  it('恰好六步，顺序为 来源→目标→范围→检查→执行→核对', () => {
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual(['source', 'target', 'scope', 'check', 'run', 'verify']);
    expect(WIZARD_STEPS.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Object.isFrozen(WIZARD_STEPS)).toBe(true);
  });

  it('每步都有标题与用途（检查页要显示给用户）', () => {
    for (const s of WIZARD_STEPS) {
      expect(s.title).toBeTruthy();
      expect(s.purpose).toBeTruthy();
    }
  });
});

describe('stepIndexOf / nextStepId / prevStepId', () => {
  it('未知 id ⇒ -1', () => {
    expect(stepIndexOf('nope')).toBe(-1);
    expect(stepIndexOf(undefined)).toBe(-1);
  });

  it('邻接：两端返回 null，不环绕', () => {
    expect(prevStepId('source')).toBeNull();
    expect(nextStepId('verify')).toBeNull();
    expect(nextStepId('source')).toBe('target');
    expect(prevStepId('verify')).toBe('run');
  });

  it('链式 next 覆盖全部六步', () => {
    const walked = [];
    let cur = 'source';
    while (cur) { walked.push(cur); cur = nextStepId(cur); }
    expect(walked).toEqual(WIZARD_STEPS.map((s) => s.id));
  });
});

describe('createWizardMachine', () => {
  it('初始为第一步，visited 含它', () => {
    const m = createWizardMachine();
    expect(m.getState().stepId).toBe('source');
    expect(m.getState().visited).toEqual(['source']);
    expect(m.getState().stale).toBe(false);
  });

  it('非法初始值回落第一步（不抛错）', () => {
    expect(createWizardMachine({ initial: 'nope' }).getState().stepId).toBe('source');
  });

  it('goTo 非法 id ⇒ false 且状态不变', () => {
    const m = createWizardMachine();
    expect(m.goTo('nope')).toBe(false);
    expect(m.getState().stepId).toBe('source');
  });

  it('next/prev 在两端返回 false 且不越界', () => {
    const m = createWizardMachine();
    expect(m.prev()).toBe(false);
    expect(m.getState().stepId).toBe('source');
    m.goTo('verify');
    expect(m.next()).toBe(false);
    expect(m.getState().stepId).toBe('verify');
  });

  it('visited 去重且保序', () => {
    const m = createWizardMachine();
    m.goTo('target');
    m.goTo('source');
    m.goTo('target');
    expect(m.getState().visited).toEqual(['source', 'target']);
  });

  it('getState 返回拷贝：外部改动不回写', () => {
    const m = createWizardMachine();
    m.getState().visited.push('hacked');
    expect(m.getState().visited).toEqual(['source']);
  });

  it('markStale / clearStale 切换关键输入失效标记', () => {
    const m = createWizardMachine();
    m.markStale();
    expect(m.getState().stale).toBe(true);
    m.clearStale();
    expect(m.getState().stale).toBe(false);
  });
});

describe('buildSessionGateVerdict（U-1 硬拒绝的界面判据）', () => {
  it('无会话（null/undefined）⇒ 不拦（没有数据不是旧数据）', () => {
    expect(buildSessionGateVerdict(null).blocked).toBe(false);
    expect(buildSessionGateVerdict(undefined).blocked).toBe(false);
  });

  it('当前版本会话 ⇒ 不拦', () => {
    const v = buildSessionGateVerdict({ schemaVersion: SESSION_SCHEMA_VERSION });
    expect(v.blocked).toBe(false);
    expect(v.canReopen).toBe(false);
  });

  it('v1 会话 ⇒ 拦，且给出可执行原因与「从源重开」', () => {
    const v = buildSessionGateVerdict({ schemaVersion: 1, checkpoint: { opfsName: 'p.zip' } });
    expect(v.blocked).toBe(true);
    expect(v.canReopen).toBe(true);
    expect(v.title).toContain('作废');
    expect(v.message).toBeTruthy();
  });

  it('缺版本签名的记录 ⇒ 拦', () => {
    expect(buildSessionGateVerdict({ sourceName: 'a.zip' }).blocked).toBe(true);
  });
});

describe('模板步骤归属（防止向导把区块漏在门外）', () => {
  it('模板里每个 data-wb-step 都是已知步骤', () => {
    expect(unknownStepOwners(TEMPLATE)).toEqual([]);
  });

  it('六个步骤在模板里都有归属区块', () => {
    const owners = extractStepOwners(TEMPLATE);
    for (const step of WIZARD_STEPS) {
      expect(owners.get(step.id), `步骤 ${step.id} 没有任何 data-wb-step 归属`).toBeGreaterThan(0);
    }
  });

  it('执行步包含动作行与进度条（用户点得动、看得见进度）', () => {
    const actionIdx = TEMPLATE.indexOf('data-wb-step="run"');
    expect(actionIdx).toBeGreaterThan(-1);
    expect(TEMPLATE).toContain('id="btn-convert"');
    expect(TEMPLATE).toContain('id="progress-container" data-wb-step="run"');
  });

  it('核对步包含报告面板与待导出区', () => {
    expect(TEMPLATE).toContain('id="report-panel" data-wb-step="verify"');
    expect(TEMPLATE).toContain('id="export-queue-panel"');
    const verifyZone = TEMPLATE.indexOf('<div class="zone-card" data-wb-step="verify">');
    expect(verifyZone).toBeGreaterThan(-1);
  });
});

describe('向导骨架节点齐备', () => {
  const requiredIds = [
    'wizard-chrome',
    'wizard-rail',
    'btn-wb-view-toggle',
    'btn-wizard-prev',
    'btn-wizard-next',
    'wizard-step-counter',
    'wizard-gate',
    'wizard-gate-title',
    'wizard-gate-reason',
    'btn-wizard-reopen',
    'wizard-check-panel',
    'wizard-check-summary',
    'wizard-check-exclusions',
  ];

  for (const id of requiredIds) {
    it(`模板含 id="${id}"`, () => {
      expect(TEMPLATE).toContain(`id="${id}"`);
    });
  }

  it('步骤条含全部六步按钮', () => {
    for (const step of WIZARD_STEPS) {
      expect(TEMPLATE).toContain(`data-wb-step="${step.id}"`);
    }
    const railBlock = TEMPLATE.slice(TEMPLATE.indexOf('id="wizard-rail"'), TEMPLATE.indexOf('id="wizard-step-counter"'));
    expect((railBlock.match(/class="menu_button wb-step-btn"/g) || []).length).toBe(WIZARD_STEPS.length);
  });

  it('不兼容门默认 hidden（不挡正常用户）', () => {
    expect(TEMPLATE).toContain('id="wizard-gate" hidden');
  });

  /**
   * 回归防线（2026-10-13 实测踩到）：披露规则写作 `.wb-block [data-wb-step]:not(...)`，
   * 步骤条**自己的按钮**也带 `data-wb-step` ⇒ 若向导外壳落进 `.wb-block` 内，
   * 6 个步骤按钮会被自己的规则全部 `display:none`，向导直接无法导航。
   */
  it('向导外壳必须落在 `.wb-block` **之外**（否则步骤条会被自己的披露规则隐藏）', () => {
    const chromeAt = TEMPLATE.indexOf('id="wizard-chrome"');
    const firstBlockAt = TEMPLATE.indexOf('class="wb-block');
    expect(chromeAt).toBeGreaterThan(-1);
    expect(firstBlockAt).toBeGreaterThan(-1);
    expect(chromeAt).toBeLessThan(firstBlockAt);
  });
});

describe('WIZARD_VIEWS', () => {
  it('两视图码固定', () => {
    expect(WIZARD_VIEWS.WIZARD).toBe('wizard');
    expect(WIZARD_VIEWS.ADVANCED).toBe('advanced');
  });
});
