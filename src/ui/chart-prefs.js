/**
 * 图表偏好（数据包默认选择 + 顶部控件默认值）。
 *
 * 用户 2026-11-09 裁定：偏好在图表区就地编辑，保存后只对**以后导入**的包生效；
 * 设置页不再承载任何打包选项。
 */
import { CHART_GROUPS } from '../core/chart-model.js';

export const CHART_PREF_STORAGE_KEY = 'stpt.chartPrefs';

const GROUP_KEYS = CHART_GROUPS.map((g) => g.key);
const DEFAULT_CHECKED = GROUP_KEYS.filter((k) => k !== 'backups' && k !== 'native');

export const CHART_PREF_DEFAULTS = Object.freeze({
  version: 1,
  checkedGroups: DEFAULT_CHECKED,
  target: 'auto',
  compression: '5',
  splitMb: '',
  filenameTemplate: '{target}_{user}_{part}_{datetime}.zip',
  delta: 'overwrite',
  extensionMode: 'full',
  gitMode: 'minimal',
  keepDev: false,
});

export function normalizeChartPrefs(input) {
  const out = { ...CHART_PREF_DEFAULTS, checkedGroups: [...DEFAULT_CHECKED] };
  if (!input || typeof input !== 'object') return out;
  if (Array.isArray(input.checkedGroups)) {
    const seen = new Set();
    out.checkedGroups = input.checkedGroups.filter((k) => GROUP_KEYS.includes(k) && !seen.has(k) && seen.add(k));
  }
  if (['auto', 'st', 'luker', 'tt', 'pt'].includes(input.target)) out.target = input.target;
  if (['0', '1', '5', '9'].includes(String(input.compression))) out.compression = String(input.compression);
  const split = Number(input.splitMb);
  if (input.splitMb === '' || !Number.isFinite(split) || split <= 0) out.splitMb = '';
  else out.splitMb = String(Math.max(32, Math.min(2048, Math.round(split))));
  if (typeof input.filenameTemplate === 'string' && input.filenameTemplate.trim()) {
    out.filenameTemplate = input.filenameTemplate.trim();
  }
  if (['overwrite', 'incremental'].includes(input.delta)) out.delta = input.delta;
  if (['full', 'manifest'].includes(input.extensionMode)) out.extensionMode = input.extensionMode;
  if (['keep', 'minimal', 'strip'].includes(input.gitMode)) out.gitMode = input.gitMode;
  if (typeof input.keepDev === 'boolean') out.keepDev = input.keepDev;
  return out;
}

export function loadChartPrefs() {
  try {
    if (typeof localStorage === 'undefined') return normalizeChartPrefs(null);
    const raw = localStorage.getItem(CHART_PREF_STORAGE_KEY);
    return normalizeChartPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeChartPrefs(null);
  }
}

export function saveChartPrefs(prefs) {
  const normalized = normalizeChartPrefs(prefs);
  try { localStorage.setItem(CHART_PREF_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* 隐私模式仅本会话 */ }
  return normalized;
}
