import { describe, it, expect } from 'vitest';
import {
  resolveFilename,
  previewFilename,
  sanitizeFilename,
  formatDate,
  formatTime,
  formatDateTime,
  hostDisplayName,
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_PRESETS,
  PLACEHOLDERS,
  TARGET_PLATFORMS,
} from '../src/core/naming.js';

describe('命名引擎 · 占位符语义（R6.5 / AC-4）', () => {
  const ctx = {
    host: 'luker',
    target: 'pt',
    handle: 'alice',
    part: 'part2',
    mode: 'split',
    category: 'core',
    sourceName: 'backup.zip',
    count: 42,
    date: '2026-10-27',
    time: '14-05-09',
    datetime: '2026-10-27_14-05-09',
  };

  it('规范占位符集合恰为 11 项', () => {
    expect(PLACEHOLDERS).toHaveLength(11);
    expect(new Set(PLACEHOLDERS).size).toBe(11);
  });

  it('{host} 输出当前宿主英文全称', () => {
    expect(resolveFilename('{host}.zip', ctx)).toBe('Luker.zip');
  });

  it('{target} 输出目标平台英文全称', () => {
    expect(resolveFilename('{target}.zip', ctx)).toBe('PureTavern.zip');
  });

  it('{user} 输出用户标识', () => {
    expect(resolveFilename('{user}.zip', ctx)).toBe('alice.zip');
  });

  it('{part} 输出分卷标识', () => {
    expect(resolveFilename('{part}.zip', ctx)).toBe('part2.zip');
  });

  it('{date} 只输出日期', () => {
    expect(resolveFilename('{date}.zip', ctx)).toBe('2026-10-27.zip');
  });

  it('{time} 只输出时间（文件名安全，无冒号）', () => {
    expect(resolveFilename('{time}.zip', ctx)).toBe('14-05-09.zip');
  });

  it('{datetime} 输出日期时间，精确到秒', () => {
    expect(resolveFilename('{datetime}.zip', ctx)).toBe('2026-10-27_14-05-09.zip');
  });

  it('{mode} 输出打包模式', () => {
    expect(resolveFilename('{mode}.zip', ctx)).toBe('split.zip');
  });

  it('{category} 输出类目标识', () => {
    expect(resolveFilename('{category}.zip', ctx)).toBe('core.zip');
  });

  it('{source} 输出去掉 .zip 的源包名', () => {
    expect(resolveFilename('{source}.zip', ctx)).toBe('backup.zip');
  });

  it('{count} 输出条目数', () => {
    expect(resolveFilename('{count}.zip', ctx)).toBe('42.zip');
  });

  it('date / time / datetime 三者互不冒充', () => {
    const out = resolveFilename('@{date}@{time}@{datetime}.zip', ctx);
    expect(out).toBe('@2026-10-27@14-05-09@2026-10-27_14-05-09.zip');
  });

  it('未知占位符原样保留，便于暴露拼写错误', () => {
    expect(resolveFilename('{target}_{nope}.zip', ctx)).toBe('PureTavern_{nope}.zip');
  });

  it('单次扫描：占位符取值中的占位符不会被二次替换', () => {
    const out = resolveFilename('{user}.zip', { ...ctx, handle: '{target}' });
    expect(out).toBe('{target}.zip');
  });
});

describe('命名引擎 · 默认模板与时间格式（AC-4）', () => {
  it('默认模板为 {target}_{user}_{part}_{datetime}.zip', () => {
    expect(DEFAULT_FILENAME_TEMPLATE).toBe('{target}_{user}_{part}_{datetime}.zip');
  });

  it('模板为空时套用默认模板并按 datetime 精确到秒', () => {
    const out = resolveFilename('', { target: 'st', handle: 'bob' });
    expect(out).toMatch(/^SillyTavern_bob_part1_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/);
  });

  it('formatDate / formatTime / formatDateTime 输出固定宽度', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(formatDate(d)).toBe('2026-01-02');
    expect(formatTime(d)).toBe('03-04-05');
    expect(formatDateTime(d)).toBe('2026-01-02_03-04-05');
  });

  it('Date 对象传入 date 时按 YYYY-MM-DD 格式化（不落 Date.toString）', () => {
    const out = resolveFilename('{date}.zip', { date: new Date(2026, 8, 7, 2, 6, 38) });
    expect(out).toBe('2026-09-07.zip');
  });
});

describe('命名引擎 · 宿主全称与目标平台表（R1.2 / R6.5）', () => {
  it('四个布局码各有英文全称', () => {
    expect(hostDisplayName('st')).toBe('SillyTavern');
    expect(hostDisplayName('l')).toBe('Luker');
    expect(hostDisplayName('tt')).toBe('TauriTavern');
    expect(hostDisplayName('pt')).toBe('PureTavern');
  });

  it('平台码 luker 归一为同一全称', () => {
    expect(hostDisplayName('luker')).toBe('Luker');
  });

  it('目标平台选择器固定四项英文全称', () => {
    expect(TARGET_PLATFORMS.map((t) => t.name)).toEqual([
      'SillyTavern',
      'Luker',
      'TauriTavern',
      'PureTavern',
    ]);
  });
});

describe('命名引擎 · 清洗与兼容', () => {
  it('过滤跨平台非法字符', () => {
    const clean = sanitizeFilename('bad:file/name*with?illegal"chars<and>pipes|end.zip');
    for (const ch of [':', '/', '*', '?', '"', '<', '>', '|']) {
      expect(clean).not.toContain(ch);
    }
  });

  it('自动补齐 .zip 扩展名', () => {
    expect(resolveFilename('{target}_{user}', { target: 'tt', handle: 'bob' })).toBe('TauriTavern_bob.zip');
  });

  it('空值不留连续下划线', () => {
    expect(resolveFilename('{source}_{count}.zip', { sourceName: '', count: '' })).toBe('archive.zip');
  });

  it('保留历史别名（username / platform / timestamp）', () => {
    const out = resolveFilename('{username}_{platform}_{timestamp}.zip', {
      handle: 'bob',
      target: 'tt',
      date: '2026-10-27',
    });
    expect(out).toBe('bob_TauriTavern_2026-10-27.zip');
  });

  it('预设模板均使用 datetime', () => {
    expect(FILENAME_PRESETS.SPLIT).toContain('{datetime}');
    expect(FILENAME_PRESETS.CORE).toContain('{datetime}');
    expect(FILENAME_PRESETS.FULL).toContain('{datetime}');
  });

  it('previewFilename 与 resolveFilename 同源', () => {
    const ctx = { target: 'st', handle: 'bob', date: '2026-10-27' };
    expect(previewFilename('{date}_{user}.zip', ctx)).toBe(resolveFilename('{date}_{user}.zip', ctx));
  });
});
