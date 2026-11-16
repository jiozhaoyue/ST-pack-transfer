import { describe, expect, it } from 'vitest';
import { auditLocale } from '../scripts/copy-audit.js';

describe('文案审查规则', () => {
  it('中文面板正文里的括号说明被标记', () => {
    const issues = auditLocale('zh-CN', { 'chart.foo': '导出区只读（可复制回导入区）' });
    expect(issues.some((issue) => issue.rule === 'paren')).toBe(true);
  });

  it('help / tutorial / log 豁免', () => {
    const issues = auditLocale('zh-CN', {
      'help.chart.p1': '图表是唯一工作台（含配额）',
      'tutorial.basic.0.desc': '四个酒馆；当前宿主标（宿主）',
      'log.scanStart': '扫描开始（{size} MB）',
    });
    expect(issues).toEqual([]);
  });

  it('单位与占位符括号不算说明', () => {
    const issues = auditLocale('zh-CN', { 'chart.limit': '单卷上限（MB）' });
    expect(issues).toEqual([]);
  });

  it('中文分号长句被标记，英文分号不查', () => {
    const zh = auditLocale('zh-CN', { 'chart.foo': '这里是第一句；这里是第二句，而且很长很长' });
    expect(zh.some((issue) => issue.rule === 'semicolon')).toBe(true);
    const en = auditLocale('en-US', { 'chart.foo': 'This is one sentence; this is another one' });
    expect(en.filter((issue) => issue.rule === 'semicolon')).toEqual([]);
  });

  it('同区域重复长文案被标记，跨区域不算', () => {
    const same = auditLocale('zh-CN', {
      'chart.a': '这一句文案相当长需要被检查一下',
      'chart.b': '这一句文案相当长需要被检查一下',
    });
    expect(same.filter((issue) => issue.rule === 'duplicate')).toHaveLength(1);

    const cross = auditLocale('zh-CN', {
      'chart.a': '这一句文案相当长需要被检查一下',
      'zones.b': '这一句文案相当长需要被检查一下',
    });
    expect(cross.filter((issue) => issue.rule === 'duplicate')).toEqual([]);
  });
});
