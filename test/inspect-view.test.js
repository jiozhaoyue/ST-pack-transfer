import { describe, expect, it } from 'vitest';
import { INSPECT_VERDICTS } from '../src/core/inspect.js';
import { renderInspectReport } from '../src/ui/inspect-view.js';
import { t } from '../src/i18n/index.js';

/** 造一份最小 InspectReport，只覆盖渲染需要的字段。 */
function reportOf(code, extra = {}) {
  return {
    ok: true,
    verdict: { code, severity: 'ok', key: 'inspect.ok' },
    bytes: { size: 1024, headHex: '', hasEocd: true, eocdOffset: 0 },
    entries: { total: 3, zeroByteCount: 0, zeroByteSamples: [], methods: {} },
    layout: { detected: 'st', evidence: [], isSplit: false, isEmpty: false },
    convertible: { planOk: true, sourceEntries: 3, selectedEntries: 3, outputEntries: 3 },
    warnings: [],
    ...extra,
  };
}

describe('renderInspectReport · 13 个 verdict 文案', () => {
  const codes = Object.values(INSPECT_VERDICTS);

  it('verdict 枚举恰好 13 个', () => {
    expect(codes).toHaveLength(13);
  });

  for (const code of codes) {
    it(`${code} 产出非空文案`, () => {
      const html = renderInspectReport(reportOf(code));
      expect(typeof html).toBe('string');
      expect(html.trim().length).toBeGreaterThan(0);
      // 结论行必须落在 badge 里，且不是原始 key 回退（不应出现 inspect.verdict.）
      expect(html).toContain('class="badge"');
      expect(html).not.toContain('inspect.verdict.');
    });
  }
});

describe('renderInspectReport · 转义', () => {
  it('危险字符 <script> 被转义', () => {
    const html = renderInspectReport(reportOf(INSPECT_VERDICTS.OK, {
      warnings: ['<script>alert(1)</script>'],
    }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('报告缺失字段时不抛异常', () => {
    expect(() => renderInspectReport(null)).not.toThrow();
    expect(() => renderInspectReport({})).not.toThrow();
  });
});

describe('renderInspectReport · 语义', () => {
  it('0 字节包（empty-file）结论包含「空文件」语义', () => {
    const html = renderInspectReport(reportOf(INSPECT_VERDICTS.EMPTY_FILE));
    // zh-CN 默认文案为「空文件」
    expect(html).toMatch(/空文件|Empty file/);
  });

  it('关键读数标签齐全', () => {
    const html = renderInspectReport(reportOf(INSPECT_VERDICTS.OK));
    // 语言无关：CI 为英文 locale，标签文案必须与渲染同源（t() 同 key），不得硬编码中文。
    for (const key of ['inspect.size', 'inspect.entries', 'inspect.emptyEntries', 'inspect.layout', 'inspect.convertible']) {
      expect(html).toContain(t(key));
    }
  });
});
