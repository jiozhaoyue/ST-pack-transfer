import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('宿主图表降级与设置入口静态守卫', () => {
  it('宿主图表不再出现说明文案', async () => {
    const body = await read('src/ui/workbench-view.js');
    expect(body).not.toContain('当前形态没有存储清单端点');
    expect(body).not.toContain('不新增该宿主专用后端');
  });

  it('降级图表带 is-disabled，并接受 disabled: degraded', async () => {
    const body = await read('src/ui/workbench-view.js');
    expect(body).toContain('is-disabled');
    expect(body).toContain('disabled: degraded');
    expect(body).toContain('aria-disabled');
  });

  it('设置按钮是齿轮，不再是太阳射线', async () => {
    const body = await read('src/ui/workbench-template.js');
    const match = /id="btn-settings"[\s\S]*?<\/button>/.exec(body);
    expect(match).toBeTruthy();
    expect(match[0]).not.toContain('M12 2v3M12 19v3M2 12h3M19 12h3');
    expect(match[0]).toContain('19.4 15');
  });
});
