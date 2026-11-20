/**
 * Vue 3 响应式状态中心（渐进式重构）
 *
 * 核心目标：
 * 1. 彻底终结原有 9100 行中命令式手动调用 renderAll/renderZones 的痛点；
 * 2. 状态变更自动触发关联组件微秒级定向局部更新；
 * 3. 严格单向数据流与可预测 mutation。
 */
import { reactive, computed, ref } from 'vue';

export const store = reactive({
  packages: [],
  selectedPkgIds: new Set(),
  activePkgId: '',
  zone: 'import',
  tutorialMode: false,
  storage: {
    browser: { used: 0, total: 0 },
    host: null,
  },
  logs: [],
  inspectReport: null,
  inspectModalOpen: false,
  issueModalOpen: false,
});

/** 计算属性 */
export const activePackage = computed(() => {
  return store.packages.find((p) => p.id === store.activePkgId) || null;
});

export const importPackages = computed(() => {
  return store.packages.filter((p) => p.zone === 'import');
});

export const exportPackages = computed(() => {
  return store.packages.filter((p) => p.zone === 'export');
});

export const selectedCount = computed(() => {
  return store.selectedPkgIds.size;
});

/** Mutations / Actions */
export function setPackages(list) {
  store.packages = Array.isArray(list) ? list.map((p) => ({ ...p })) : [];
}

export function setActivePackage(id) {
  store.activePkgId = id || '';
}

export function togglePackageSelection(id) {
  if (store.selectedPkgIds.has(id)) {
    store.selectedPkgIds.delete(id);
  } else {
    store.selectedPkgIds.add(id);
  }
}

export function selectAllPackages(zone = store.zone) {
  const targetList = zone === 'import' ? importPackages.value : exportPackages.value;
  store.selectedPkgIds = new Set(targetList.map((p) => p.id));
}

export function clearSelection() {
  store.selectedPkgIds.clear();
}

export function setTutorialMode(on) {
  store.tutorialMode = !!on;
}

export function setStorageQuota(quota) {
  store.storage = { ...store.storage, ...(quota || {}) };
}

export function openInspectModal(report) {
  store.inspectReport = report;
  store.inspectModalOpen = true;
}

export function closeInspectModal() {
  store.inspectModalOpen = false;
  store.inspectReport = null;
}
