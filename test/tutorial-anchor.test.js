import { describe, expect, it } from 'vitest';
import { tutorialAnchor } from '../src/ui/workbench-view.js';

const overlay = { left: 100, top: 50, width: 800, height: 600 };

describe('tutorialAnchor（教程高亮锚点几何）', () => {
  it('普通视口：ring 跟随目标，card 在下方', () => {
    const out = tutorialAnchor({ left: 200, top: 150, width: 120, height: 40 }, overlay, { width: 330, height: 180 });
    expect(out.ring).toEqual({ left: 95, top: 95, width: 130, height: 50 });
    expect(out.card.left).toBe(100);
    expect(out.card.top).toBe(150);
  });

  it('transform 容器：坐标以 overlay 原点为基准', () => {
    const out = tutorialAnchor({ left: 300, top: 250, width: 100, height: 30 }, overlay, { width: 330, height: 180 });
    expect(out.ring.left).toBe(195);
    expect(out.ring.top).toBe(195);
  });

  it('下方空间不足时卡片翻到上方', () => {
    const out = tutorialAnchor({ left: 200, top: 600, width: 120, height: 40 }, overlay, { width: 330, height: 180 });
    expect(out.card.top).toBeLessThan(600);
  });

  it('卡片始终 clamp 在 overlay 内', () => {
    const out = tutorialAnchor({ left: 900, top: 700, width: 120, height: 40 }, overlay, { width: 330, height: 180 });
    expect(out.card.left).toBeLessThanOrEqual(overlay.width - out.card.width);
    expect(out.card.top).toBeGreaterThanOrEqual(0);
    expect(out.card.top + 180).toBeLessThanOrEqual(overlay.height);
  });
});
