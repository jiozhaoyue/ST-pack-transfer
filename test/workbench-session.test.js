/**
 * 工作台会话与检查面板（2026-10-14 由 `migration-wizard.test.js` 改造）。
 *
 * 原「迁移向导」外壳已按用户裁定整体删除，故本文件不再覆盖六步定义 / 步骤邻接 /
 * 视图切换 / 不兼容门——那些功能连同其实现一并消失。现在锁的是**留下的那部分**：
 * 陈旧标记、会话兼容判定、检查面板写入，以及**模板里不得再出现向导残留**。
 *
 * DOM 装配（`writeCheckPanel`）不在本文件覆盖——本仓 Vitest 默认 `environment: 'node'`，
 * 无 jsdom；DOM 行为由静态守卫（`check:template-source` / `check:control-consumer`）
 * 与独立 Web E2E 覆盖，此处只锁**可纯判定的部分**。
 */
import { describe, expect, it } from 'vitest';
import {
  createStaleFlag,
  evaluateSavedSession,
  formatSpecialExclusionSummary,
} from '../src/ui/workbench-session.js';
import { getWorkbenchHtml } from '../src/ui/workbench-template.js';
import { SESSION_SCHEMA_VERSION } from '../src/core/migration-session.js';

/**
 * 断言对象是**渲染结果**，不是文件源码。
 * 2026-10-14 踩过：按源码正则断言会把注释里的说明文字一并算进来（「文案纪律」全部误报）。
 */
const TEMPLATE = getWorkbenchHtml({ isStandalone: true });

describe('createStaleFlag（关键输入已变标记）', () => {
  it('初始不陈旧', () => {
    expect(createStaleFlag().isStale()).toBe(false);
  });

  it('mark 置位、clear 复位', () => {
    const flag = createStaleFlag();
    flag.mark();
    expect(flag.isStale()).toBe(true);
    flag.clear();
    expect(flag.isStale()).toBe(false);
  });
});

describe('evaluateSavedSession（会话兼容判定）', () => {
  it('从未保存过会话 ⇒ 不拦（那不是「旧数据」，是「没有数据」）', () => {
    expect(evaluateSavedSession(null)).toEqual({ blocked: false, message: '' });
    expect(evaluateSavedSession(undefined)).toEqual({ blocked: false, message: '' });
  });

  it('当前版本签名 ⇒ 放行且无提示', () => {
    const verdict = evaluateSavedSession({ schemaVersion: SESSION_SCHEMA_VERSION });
    expect(verdict.blocked).toBe(false);
    expect(verdict.message).toBe('');
  });

  it('未带版本签名 ⇒ 拦下并给出原因', () => {
    const verdict = evaluateSavedSession({ someField: 1 });
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toContain('旧记录未带版本签名');
  });

  it('旧版本号 ⇒ 拦下', () => {
    const verdict = evaluateSavedSession({ schemaVersion: SESSION_SCHEMA_VERSION - 1 });
    expect(verdict.blocked).toBe(true);
    expect(verdict.message).toContain('已作废');
  });

  it('版本号非法 ⇒ 拦下', () => {
    expect(evaluateSavedSession({ schemaVersion: 'v2' }).blocked).toBe(true);
  });

  it('非对象记录 ⇒ 拦下', () => {
    expect(evaluateSavedSession([]).blocked).toBe(true);
    expect(evaluateSavedSession(42).blocked).toBe(true);
  });

  it('判定结果只含 blocked / message（门控 UI 已删除，不再返回 title / canReopen）', () => {
    const verdict = evaluateSavedSession({ schemaVersion: 1 });
    expect(Object.keys(verdict).sort()).toEqual(['blocked', 'message']);
  });
});

describe('formatSpecialExclusionSummary（检查面板「本次不含」汇总 · OQ-1 配套）', () => {
  it('列出特殊类目 + 载体参数名 + 理由', () => {
    const s = formatSpecialExclusionSummary([
      { key: 'cache', flag: 'includeCache', reason: '导入后会自动重建' },
      { key: 'appPrivate', flag: 'includeAppPrivate', reason: '目标平台不消费' },
    ]);
    expect(s).toContain('本次不含：');
    expect(s).toContain('cache（includeCache=false');
    expect(s).toContain('appPrivate（includeAppPrivate=false');
    expect(s).toContain('导入后会自动重建');
  });

  it('无排除 ⇒ 空串（不打印空标签）', () => {
    expect(formatSpecialExclusionSummary([])).toBe('');
    expect(formatSpecialExclusionSummary()).toBe('');
    expect(formatSpecialExclusionSummary(null)).toBe('');
  });

  it('缺 reason 也不产生悬空分隔符', () => {
    const s = formatSpecialExclusionSummary([{ key: 'cache', flag: 'includeCache' }]);
    expect(s).toBe('本次不含：cache（includeCache=false）');
  });

  it('忽略缺 key 的畸形条目', () => {
    expect(formatSpecialExclusionSummary([null, {}, { flag: 'x' }])).toBe('');
  });
});

describe('模板不得再含迁移向导残留（用户 2026-10-14 裁定整体删除）', () => {
  it('无步骤归属属性 data-wb-step', () => {
    expect(TEMPLATE).not.toMatch(/data-wb-step/);
  });

  it('无视图切换与步骤条控件', () => {
    for (const id of ['btn-wb-view-toggle', 'wizard-rail', 'btn-wizard-prev', 'btn-wizard-next', 'wizard-step-counter']) {
      expect(TEMPLATE).not.toContain(id);
    }
  });

  it('无不兼容门（从源重开）', () => {
    expect(TEMPLATE).not.toContain('wizard-gate');
    expect(TEMPLATE).not.toContain('btn-wizard-reopen');
    expect(TEMPLATE).not.toContain('从源重开');
  });

  it('无并排 radio 组（一律改枚举）', () => {
    expect(TEMPLATE).not.toMatch(/name="extension-mode"/);
    expect(TEMPLATE).not.toMatch(/name="git-mode"/);
    expect(TEMPLATE).not.toMatch(/name="restore-mode"/);
  });

  it('枚举控件存在', () => {
    for (const id of ['extension-mode-select', 'git-mode-select', 'restore-mode-select']) {
      expect(TEMPLATE).toContain(id);
    }
  });

  it('引导按钮存在', () => {
    expect(TEMPLATE).toContain('id="btn-guide"');
  });

  it('上传区与产物区都有列表挂载点', () => {
    expect(TEMPLATE).toContain('id="stash-list"');
    expect(TEMPLATE).toContain('id="export-queue-panel"');
  });
});

describe('模板文案纪律（用户 2026-10-14 死命令）', () => {
  it('无教学性 title 长句（title 只允许短状态词）', () => {
    const titles = [...TEMPLATE.matchAll(/\stitle="([^"]*)"/g)].map((m) => m[1]);
    for (const t of titles) {
      expect(t.length).toBeLessThanOrEqual(8);
    }
  });

  it('无括号补充文案（不出现中文全角括号解释）', () => {
    expect(TEMPLATE).not.toMatch(/（[^）]{8,}）/);
  });
});
