import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWorkbenchHtml } from '../src/ui/workbench-template.js';

/**
 * 按钮动词封闭集守卫（R-A3，权威表述见 .trellis/spec/frontend/ui-orchestration-rules.md §2）：
 * 界面按钮文案只能取自封闭集——新增按钮**先扩表（改 spec 页）再写码**。
 * 单字符符号（? × ⋯）是图标等价物，豁免。
 */

const VERB_TABLE = new Set([
  // 模板面
  '丢弃', '中止', '取消', '暂停', '继续', '全选', '全不选', '反选',
  '导入', '导出', '导出扩展清单', '开始转换', '继续转换', '从宿主拉取', '从聊天库导出',
  '恢复到当前宿主', '恢复到当前用户', '确认恢复', '发送到另一台设备',
  '选择基准 ZIP', '自动备份并预检目标', '存储', '引导',
  // 列表模块生成面
  '载入', '载入为源', '下载', '全部下载', '批量转换', '删除', '移除', '清空',
  '存工作区', '全部存入工作区', '选位置导出', '写回宿主',
  '取消批量恢复', '取消恢复', '重试失败项', '刷新页面生效',
  // 帮助/分组/引导层
  '帮助', '展开', '收起', '退出',
  // 拉取前预览
  '确认拉取',
]);

/** 是否图标等价符号（单字符且非 CJK） */
const isGlyphSymbol = (text) => text.length <= 1 && !/[\u4e00-\u9fa5]/.test(text);

/** 从 HTML 提取按钮可见文案（去标签/实体/空白） */
function buttonLabelsFromHtml(html) {
  const labels = new Set();
  for (const m of html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) {
    const text = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&times;/g, '×')
      .replace(/&[a-z]+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) labels.add(text);
  }
  return labels;
}

describe('按钮动词封闭集（模板面）', () => {
  const html = getWorkbenchHtml({ isStandalone: true }) + getWorkbenchHtml({ isModal: true });
  const labels = buttonLabelsFromHtml(html);

  it('模板按钮文案 ⊆ 封闭集（新增按钮先扩表——spec 页与本文件两处）', () => {
    expect(labels.size).toBeGreaterThan(0); // 提取器失效守卫
    const illegal = [...labels].filter((t) => !isGlyphSymbol(t) && !VERB_TABLE.has(t));
    expect(illegal, `未登记按钮文案：${illegal.join(' / ')}——先扩 ui-orchestration-rules.md §2 再写码`).toEqual([]);
  });
});

describe('按钮动词封闭集（列表模块生成面）', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

  it('stash-list / export-queue 的按钮工厂产出的中文文案 ⊆ 封闭集', () => {
    const sources = ['../src/ui/stash-list.js', '../src/ui/export-queue.js']
      .map(read)
      .join('\n');
    // 只扫按钮工厂调用（mkBtn / mkSelBtn / mkBarBtn）。取**第一个非纯 ASCII 标识符的字符串实参**
    // ——那才是可见文案（含 ⋯ 这类图标等价符号）；后续中文实参是 title 悬停名（另有 ≤8 字规则管）。
    const labels = new Set();
    for (const call of sources.matchAll(/mk(?:Sel|Bar)?Btn\(([^)]*)\)/g)) {
      const args = [...call[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
      const visible = args.map((a) => a.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .find((t) => t && !/^[\x20-\x7e]*$/.test(t));
      if (visible) labels.add(visible);
    }
    expect(labels.size).toBeGreaterThan(0);
    const illegal = [...labels].filter((t) => !isGlyphSymbol(t) && !VERB_TABLE.has(t));
    expect(illegal, `未登记按钮文案：${illegal.join(' / ')}`).toEqual([]);
  });
});
