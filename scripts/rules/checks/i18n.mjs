/**
 * i18n：UI 源码零硬编码中文。
 *
 * 刻意**不**重写解析器：直接复用 `scripts/i18n-guard.js` 导出的 `checkI18n()` 与
 * `SCAN_FILES`。注册表负责「汇总与退出码」，既有守卫负责「怎么判」——
 * 这样规则迁移是渐进的，不会因为换入口而改变判定口径。
 */
export async function run(ctx) {
  const guard = await import('../../../scripts/i18n-guard.js');
  const violations = await guard.checkI18n();
  if (violations.length === 0) {
    return { ok: true, detail: `${guard.SCAN_FILES.length} 个 UI 文件无中文字面量` };
  }
  const shown = violations
    .slice(0, 15)
    .map((item) => `${item.file}:${item.line}  ${item.text.slice(0, 70)}`);
  return {
    ok: false,
    detail: [
      `${violations.length} 处硬编码中文（文案应放 src/i18n/locales/**）`,
      ...shown,
      ...(violations.length > shown.length ? [`…另有 ${violations.length - shown.length} 处`] : []),
    ].join('\n'),
  };
}
