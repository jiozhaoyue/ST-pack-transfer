/**
 * Vue 3 渐进式重构构建与响应式契约测试。
 *
 * 验证：
 * 1. src/ui/vue/store.js 具备纯正响应式能力与 Mutations；
 * 2. InspectModal.vue 存在且包含正确的 template 与 Scoped CSS 声明；
 * 3. vite.config.js 正确引入了 @vitejs/plugin-vue 插件；
 * 4. package.json 声明了 vue 与 @vitejs/plugin-vue 依赖。
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  store,
  setPackages,
  setActivePackage,
  togglePackageSelection,
  clearSelection,
  activePackage,
  importPackages,
  exportPackages,
} from '../src/ui/vue/store.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFile(ROOT + rel, 'utf8');

describe('Vue 3 响应式 Store 契约', () => {
  it('setPackages 正确更新列表，计算属性联动更新', () => {
    setPackages([
      { id: 'pkg-1', name: 'st-backup.zip', zone: 'import', size: '10 MB' },
      { id: 'pkg-2', name: 'luker-out.zip', zone: 'export', size: '5 MB' },
    ]);
    expect(store.packages.length).toBe(2);
    expect(importPackages.value.length).toBe(1);
    expect(exportPackages.value.length).toBe(1);
    expect(importPackages.value[0].name).toBe('st-backup.zip');
  });

  it('setActivePackage 与 activePackage 联动', () => {
    setActivePackage('pkg-1');
    expect(store.activePkgId).toBe('pkg-1');
    expect(activePackage.value).not.toBeNull();
    expect(activePackage.value.name).toBe('st-backup.zip');
  });

  it('togglePackageSelection 与 clearSelection 准确维护勾选集合', () => {
    clearSelection();
    expect(store.selectedPkgIds.size).toBe(0);
    togglePackageSelection('pkg-1');
    expect(store.selectedPkgIds.has('pkg-1')).toBe(true);
    togglePackageSelection('pkg-1');
    expect(store.selectedPkgIds.has('pkg-1')).toBe(false);
  });
});

describe('Vue 3 SFC 与构建基座契约', () => {
  it('InspectModal.vue 包含 Scoped CSS 与高价值「存入工作区」动作', async () => {
    const sfc = await read('src/ui/vue/InspectModal.vue');
    expect(sfc).toContain('<style scoped>');
    expect(sfc).toContain('handleSaveToWorkspace');
    expect(sfc).toContain('存入工作区');
    expect(sfc).toContain('verdict-banner');
  });

  it('vite.config.js 包含 @vitejs/plugin-vue 插件配置', async () => {
    const config = await read('vite.config.js');
    expect(config).toContain("import vue from '@vitejs/plugin-vue'");
    expect(config).toContain('plugins: [vue()]');
  });

  it('package.json 引入了 vue 与 @vitejs/plugin-vue 依赖', async () => {
    const pkg = JSON.parse(await read('package.json'));
    const devDeps = pkg.devDependencies || {};
    expect(devDeps).toHaveProperty('vue');
    expect(devDeps).toHaveProperty('@vitejs/plugin-vue');
  });
});
