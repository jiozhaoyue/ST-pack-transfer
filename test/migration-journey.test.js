import { describe, expect, it } from 'vitest';
import { buildSourceDeliveries } from '../src/ui/migration-controller.js';
import { ORIGINS } from '../src/storage/db.js';

function zipBlob(content) {
  return new Blob([content], { type: 'application/zip' });
}

describe('buildSourceDeliveries（S2 源端三类交付）', () => {
  it('AC1 有转换 ⇒ 三项：源备份 + 目标包 + 报告，且 blob 为同一引用', () => {
    const source = { blob: zipBlob('src'), name: 'backup.zip', layout: 'l' };
    const target = { blob: zipBlob('tgt'), name: 'luker-pack.zip', layout: 'l' };
    const report = { text: '报告内容' };

    const items = buildSourceDeliveries({ source, target, report, hasTransform: true });

    expect(items).toHaveLength(3);
    expect(items.map((it) => it.origin)).toEqual([
      ORIGINS.SOURCE_BACKUP,
      ORIGINS.CONVERTED,
      ORIGINS.REPORT,
    ]);
    // 不复制 blob（AC-05：目标包字节不变）
    expect(items[0].blob).toBe(source.blob);
    expect(items[1].blob).toBe(target.blob);
    expect(items[1].targetLayout).toBe('l');
  });

  it('AC2 无转换 ⇒ 两项（宿主导出 + 报告），不重复源/目标', () => {
    const source = { blob: zipBlob('src'), name: 'backup.zip', layout: 'st' };
    const items = buildSourceDeliveries({ source, target: null, report: { text: 'r' }, hasTransform: false });

    expect(items).toHaveLength(2);
    expect(items[0].origin).toBe(ORIGINS.HOST_EXPORT);
    expect(items[0].blob).toBe(source.blob);
    expect(items[1].origin).toBe(ORIGINS.REPORT);
  });

  it('无报告 ⇒ 省略报告项', () => {
    const source = { blob: zipBlob('src'), name: 'backup.zip', layout: 'st' };
    const items = buildSourceDeliveries({ source, target: null, report: null, hasTransform: false });

    expect(items).toHaveLength(1);
    expect(items[0].origin).toBe(ORIGINS.HOST_EXPORT);
  });

  it('AC3 命名可区分用途：源备份带标识、报告为 .txt', () => {
    const source = { blob: zipBlob('src'), name: 'mybackup.zip', layout: 'l' };
    const target = { blob: zipBlob('tgt'), name: 'mybackup_l.zip', layout: 'l' };

    const items = buildSourceDeliveries({ source, target, report: { text: 'r' }, hasTransform: true });

    expect(items[0].name).toContain('源备份');
    expect(items[0].name).toMatch(/\.zip$/);
    expect(items[1].name).toBe('mybackup_l.zip'); // 目标包保持主产物命名
    expect(items[2].name).toContain('报告');
    expect(items[2].name).toMatch(/\.txt$/);
  });

  it('AC6 新增 origin 在枚举中存在', () => {
    expect(ORIGINS.SOURCE_BACKUP).toBe('source-backup');
    expect(ORIGINS.REPORT).toBe('report');
  });

  it('报告 blob 为 text/plain 且内容为报告文本', async () => {
    const source = { blob: zipBlob('src'), name: 'b.zip', layout: 'st' };
    const items = buildSourceDeliveries({ source, target: null, report: { text: 'hello report' }, hasTransform: false });
    const reportItem = items.find((it) => it.origin === ORIGINS.REPORT);

    expect(reportItem.blob.type).toContain('text/plain');
    expect(await reportItem.blob.text()).toBe('hello report');
  });

  it('缺 source 抛错（契约边界）', () => {
    expect(() => buildSourceDeliveries({ hasTransform: false })).toThrow(/source/);
  });
});
