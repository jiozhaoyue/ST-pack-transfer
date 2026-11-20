/**
 * 离线包体检 · 渲染与面板挂载（纯 UI）
 *
 * 只负责把 `inspectPackage()` 返回的 InspectReport 渲染成可读 HTML，
 * 以及把「选本地文件」面板挂到指定容器。不含任何体检逻辑，也不访问存储。
 *
 * 所有插值一律经 escapeHtml()；最终 HTML 由调用点用 trustedStaticMarkup()
 * 标注后写入 innerHTML（内容已安全转义）。配套守卫：npm run check:dom-injection。
 */
import { escapeHtml, trustedStaticMarkup } from './escape.js';
import { hasKey, t } from '../i18n/index.js';
import { formatBytes } from './export-queue.js';

/**
 * 把 InspectReport 渲染成 HTML 片段。
 * @param {object} report inspectPackage() 的返回值
 * @returns {string}
 */
export function renderInspectReport(report) {
  const r = report || {};
  const verdict = r.verdict || {};
  const bytes = r.bytes || {};
  const entries = r.entries || {};
  const layout = r.layout || {};
  const convertible = r.convertible || {};
  const warnings = Array.isArray(r.warnings) ? r.warnings : [];

  // 结论按 verdict.code 映射到 i18n；未知 code 回退为转义后的原始码。
  const vKey = 'inspect.verdict.' + String(verdict.code || '');
  const verdictText = hasKey(vKey) ? t(vKey) : escapeHtml(verdict.code || '');
  const sKey = 'inspect.severity.' + String(verdict.severity || '');
  const sevText = hasKey(sKey) ? t(sKey) : '';

  const warningRows = warnings.length
    ? warnings.map((w) => `<div class="ext-note is-warn">${escapeHtml(w)}</div>`).join('')
    : `<div class="ext-note">${escapeHtml(t('inspect.noWarnings'))}</div>`;

  return `<div class="set-group" open>`
    + `<summary class="set-group-head">${escapeHtml(t('inspect.conclusion'))}</summary>`
    + `<div class="set-group-body">`
    + `<div class="ext-note"><span class="badge">${escapeHtml(sevText)}</span> ${escapeHtml(verdictText)}</div>`
    + `</div></div>`
    + `<div class="set-group" open>`
    + `<summary class="set-group-head">${escapeHtml(t('inspect.metrics'))}</summary>`
    + `<div class="set-group-body">`
    + `<div class="ext-note">${escapeHtml(t('inspect.size'))}: ${escapeHtml(formatBytes(bytes.size))}</div>`
    + `<div class="ext-note">${escapeHtml(t('inspect.entries'))}: ${escapeHtml(entries.total ?? 0)}</div>`
    + `<div class="ext-note">${escapeHtml(t('inspect.emptyEntries'))}: ${escapeHtml(entries.zeroByteCount ?? 0)}</div>`
    + `<div class="ext-note">${escapeHtml(t('inspect.layout'))}: ${escapeHtml(layout.detected ?? '')}</div>`
    + `<div class="ext-note">${escapeHtml(t('inspect.convertible'))}: ${escapeHtml(convertible.selectedEntries ?? 0)}</div>`
    + `</div></div>`
    + `<div class="set-group" open>`
    + `<summary class="set-group-head">${escapeHtml(t('inspect.warnings'))}</summary>`
    + `<div class="set-group-body">${warningRows}</div>`
    + `</div>`;
}

/**
 * 把体检结果面板挂到容器（仅展示结果，不再提供外部文件选择入口）。
 * onPickFile 已废弃：外部文件体检整条链已移除，参数保留仅为兼容既有调用方。
 * @param {{container: Element, onPickFile?: Function}} opts
 * @returns {{setBusy: Function, render: Function, setError: Function}|null}
 */
export function mountInspectPanel({ container, onPickFile } = {}) {
  void onPickFile; // 已废弃，保留形参避免调用方报错
  if (!container) return null;
  container.hidden = false;
  container.innerHTML = `<div data-inspect-result></div>`;
  const resultBox = container.querySelector('[data-inspect-result]');
  return {
    setBusy() {
      if (resultBox) resultBox.innerHTML = `<div class="ext-note">${escapeHtml(t('inspect.reading'))}</div>`;
    },
    render(report) {
      if (resultBox) resultBox.innerHTML = trustedStaticMarkup(renderInspectReport(report));
    },
    setError(msg) {
      if (resultBox) resultBox.innerHTML = `<div class="ext-note is-warn">${escapeHtml(msg || t('inspect.readFailed'))}</div>`;
    },
  };
}
