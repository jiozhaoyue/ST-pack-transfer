import { describe, expect, it } from 'vitest';
import { HELP_TOPICS } from '../src/ui/help-topics.js';
import { getWorkbenchHtml } from '../src/ui/workbench-template.js';

/**
 * HELP_TOPICS 守卫（R-A2）：
 *  ① 双向不悬空——主题 key 必须对应模板里的 `data-wb-module`，反向模块也必须有主题
 *    （新增模块不改帮助 ⇒ 红；删模块不改帮助 ⇒ 红）；
 *  ② 帮助文案受同一文案铁律约束（无括号补充、无分号、无冒号长句；标题 ≤ 8 字、要点 ≤ 5 行）。
 * 挂载行为（按钮注入/浮层开合）由 E2E 在真浏览器断言，不做 DOM 桩。
 */

const moduleKeys = (() => {
  const html = getWorkbenchHtml({ isStandalone: true }) + getWorkbenchHtml({ isModal: true });
  return new Set([...html.matchAll(/data-wb-module="([^"]+)"/g)].map((m) => m[1]));
})();

describe('HELP_TOPICS 双向不悬空', () => {
  it('每个帮助主题都有对应模块（无死数据）', () => {
    for (const key of Object.keys(HELP_TOPICS)) {
      expect(moduleKeys.has(key), `悬空帮助主题：模板中没有 data-wb-module="${key}"`).toBe(true);
    }
  });

  it('每个模块都有帮助主题（新增模块必须同步写帮助）', () => {
    for (const key of moduleKeys) {
      expect(HELP_TOPICS[key], `模块 ${key} 没有帮助主题`).toBeTruthy();
    }
  });
});

describe('HELP_TOPICS 文案铁律', () => {
  it('标题 ≤ 8 字，与铁律的 title 约束一致', () => {
    for (const [key, topic] of Object.entries(HELP_TOPICS)) {
      expect(topic.title.length, `${key}.title=${topic.title}`).toBeLessThanOrEqual(8);
    }
  });

  it('要点 ≤ 5 行且每行 ≤ 16 字', () => {
    for (const [key, topic] of Object.entries(HELP_TOPICS)) {
      expect(topic.points.length, `${key}`).toBeLessThanOrEqual(5);
      for (const point of topic.points) {
        expect(point.length, `${key}: ${point}`).toBeLessThanOrEqual(16);
      }
    }
  });

  it('无括号补充、无分号、无冒号（说明只活在引导与帮助层，但仍不说解释句）', () => {
    for (const [key, topic] of Object.entries(HELP_TOPICS)) {
      const all = [topic.title, ...topic.points].join('\n');
      expect(all, `${key}: ${all}`).not.toMatch(/[（）()；;：:]/);
    }
  });
});
