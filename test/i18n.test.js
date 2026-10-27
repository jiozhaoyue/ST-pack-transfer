import { describe, expect, it } from 'vitest';
import { FALLBACK, keysOf, localeOf, normalizeLocale, t } from '../src/i18n/index.js';
import { findCjkLiterals } from '../scripts/i18n-guard.js';

describe('i18n 键与插值', () => {
  it('zh-CN 与 en-US 键完全一致', () => {
    const zh = keysOf('zh-CN').slice().sort();
    const en = keysOf('en-US').slice().sort();
    expect(en).toEqual(zh);
  });

  it('没有空文案', () => {
    for (const locale of ['zh-CN', 'en-US']) {
      const dict = localeOf(locale);
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value, key).toBe('string');
        expect(value.trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it('每个 key 在两份 locale 中都能取到（不返回 key 本身）', () => {
    for (const key of keysOf(FALLBACK)) {
      for (const locale of ['zh-CN', 'en-US']) {
        const dict = localeOf(locale);
        expect(dict[key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  it('插值替换 {param}', () => {
    const value = t('chart.selected', { count: 3, size: '12 MB' });
    expect(value).toContain('3');
    expect(value).toContain('12 MB');
    expect(value).not.toContain('{count}');
  });

  it('语言归一：zh / en / 未知', () => {
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
    expect(normalizeLocale('en-GB')).toBe('en-US');
    expect(normalizeLocale('fr-FR')).toBe(FALLBACK);
  });
});

describe('i18n 守卫 tokenizer', () => {
  it('提取字符串与模板静态片段，跳过注释', () => {
    const source = [
      "const a = '中文'; // 这是注释",
      'const b = "plain only";',
      '/* 块注释中文 */',
      'const c = `前缀 ${a} 后缀`;',
    ].join('\n');
    const found = findCjkLiterals(source);
    expect(found.map((x) => x.text)).toEqual(['中文', '前缀', '后缀']);
  });
});
