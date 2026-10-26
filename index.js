/**
 * 数据包转运 · 控制器（2026-10-27 全面重写）
 *
 * 界面：`src/ui/workbench-view.js` = UI 定稿 demo 的原样搬运。
 * 本文件只做三件事：宿主探测、包仓库读写、把真实动作接到视图的 `actions`。
 */

import { runConversionTask, runPlanTask } from './src/core/worker-client.js';
import { logger } from './src/core/logger.js';
import { zipIo } from './src/core/zip-io.js';
import { splitArchiveEntries } from './src/core/splitter.js';
import {
  ORIGINS, isStorageSupported, saveFile, getFile, deleteFile, listStoredFiles, getStorageUsage,
} from './src/storage/db.js';
import { buildChartTree, fmtMB, splitLimitOf } from './src/core/chart-model.js';
import { DEFAULT_FILENAME_TEMPLATE, TARGET_PLATFORMS, resolveFilename, namedBlob } from './src/core/naming.js';
import { trustedStaticMarkup } from './src/ui/escape.js';
import { getWorkbenchHtml } from './src/ui/workbench-template.js';
import { createWorkbenchView } from './src/ui/workbench-view.js';
import {
  detectHost, hostLayoutCode, fetchHostBackup, restoreToHost, restoreToLuker,
  confirmDialog, mountExtensionRowButton,
} from './src/ui/host-bridge.js';
import { exportLibraryToPack, importRestoredChatsIntoLibrary } from './src/ui/chat-store-inject.js';
import { mountLanTransferPanel } from './src/ui/lan-transfer-panel.js';
import { probeChatStore } from './src/ui/chat-store-bridge.js';
import { mountDebugProbe } from './src/app/task-runtime.js';

export {
  TASK_KINDS, TASK_PREFIX, taskKindOf, partialNameFor, hasRoomForPartial,
  persistPartial, createCheckpointThrottle, resumedNote, convertExitForAbort,
  attachConversionProgress, runBatchItems, batchResumeVerdict, seedEntriesFor,
} from './src/app/task-runtime.js';
export { mountDebugProbe };

const ZONE_OF_ORIGIN = {
  [ORIGINS.UPLOAD]: 'import',
  [ORIGINS.HOST_EXPORT]: 'import',
  [ORIGINS.SOURCE_BACKUP]: 'import',
  [ORIGINS.CONVERTED]: 'export',
  [ORIGINS.DELTA]: 'export',
  [ORIGINS.SPLIT_PART]: 'export',
};

const HOST_CODE = { st: 'st', luker: 'luker', l: 'luker', tt: 'tt', pt: 'pt' };
const HOST_LABEL = { st: 'SillyTavern', luker: 'Luker', l: 'Luker', tt: 'TauriTavern', pt: 'PureTavern' };

function targetCodeOf(name) {
  return TARGET_PLATFORMS.find((p) => p.name === name)?.code || 'st';
}

function clockOf(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

let initialized = false;

function ensureConverterModal() {
  let overlay = document.getElementById('st-converter-modal-overlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'st-converter-modal-overlay';
  const app = document.createElement('div');
  app.className = 'app-container';
  app.id = 'app';
  app.innerHTML = trustedStaticMarkup(getWorkbenchHtml({ isModal: true }));
  overlay.appendChild(app);
  document.body.appendChild(overlay); // dom-scope:allow 自绘全屏模态必须挂 body
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
  });
  if (!initialized) { initialized = true; main(app); }
  return overlay;
}

export function openConverterModal() {
  if (typeof document === 'undefined') return;
  ensureConverterModal().style.display = 'flex';
}

async function main(root) {
  const host = detectHost();
  const hostKey = host.isPlugin ? (HOST_CODE[host.platform] || 'st') : 'st';
  root.dataset.host = hostKey;

  const settings = {
    compression: '5',
    extensionMode: 'full',
    gitMode: 'keep',
    keepDev: false,
    includeBackups: false,
    includeCache: false,
    includePrivate: false,
    pruneBuiltin: true,
    keepExport: true,
    trafficPrompt: true,
    autoTutorial: true,
  };

  const state = {
    packages: [],
    nodesById: new Map(),
    layoutById: new Map(),
    planCache: new Map(),
    busy: false,
  };

  const pkgById = (id) => state.packages.find((pkg) => pkg.id === id) || null;

  async function blobOf(pkg) {
    if (!pkg) return null;
    if (pkg.blob) return pkg.blob;
    const record = await getFile(pkg.id);
    pkg.blob = record?.blob || null;
    return pkg.blob;
  }

  function toPackage(record) {
    const zone = ZONE_OF_ORIGIN[record.origin] || 'import';
    const layout = state.layoutById.get(record.id) || record.layout || 'unknown';
    const sizeBytes = record.size || 0;
    return {
      id: record.id,
      zone,
      host: HOST_CODE[layout] || 'unknown',
      name: record.name || record.id,
      size: fmtMB(sizeBytes / (1024 * 1024)),
      mb: sizeBytes / (1024 * 1024),
      ts: record.createdAt || Date.now(),
      time: clockOf(record.createdAt),
      origin: record.origin === ORIGINS.UPLOAD ? '上传'
        : record.origin === ORIGINS.HOST_EXPORT ? '宿主导出'
          : record.origin === ORIGINS.SPLIT_PART ? '分卷'
            : '导出副本',
      readonly: zone === 'export',
      unrecognized: layout === 'unknown',
      split: 0,
      nodes: state.nodesById.get(record.id) || [],
      blob: null,
    };
  }

  async function syncPackages() {
    if (!isStorageSupported()) { state.packages = []; view.setPackages([]); return; }
    try {
      const records = await listStoredFiles();
      state.packages = records.filter((r) => ZONE_OF_ORIGIN[r.origin]).map(toPackage);
      view.setPackages(state.packages);
    } catch (err) {
      logger.warn(`读取工作区失败: ${err.message}`);
      state.packages = [];
      view.setPackages([]);
    }
  }

  async function ensurePlan(pkgId, targetName = null) {
    const pkg = pkgById(pkgId);
    if (!pkg) return null;
    const code = targetCodeOf(targetName || view.getState().target);
    const key = `${pkgId}::${code}`;
    if (state.planCache.has(key)) return state.planCache.get(key);
    const blob = await blobOf(pkg);
    if (!blob) { logger.warn(`扫描跳过：${pkg.name} 的字节不在工作区`); return null; }
    view.setProgress(6, `扫描中 · ${pkg.name}`);
    logger.info(`扫描开始：${pkg.name}（${(blob.size / 1048576).toFixed(1)} MB → ${code.toUpperCase()}）`);
    try {
      const plan = await runPlanTask({
        source: blob,
        target: code,
        options: {
          selection: {},
          excludedPaths: new Set(),
          includeCache: settings.includeCache,
          includeBackups: settings.includeBackups,
          includeAppPrivate: settings.includePrivate,
          pruneBuiltinAssets: settings.pruneBuiltin,
          keepDevFiles: settings.keepDev,
          extensionMode: settings.extensionMode,
          gitMode: settings.gitMode,
        },
      });
      const tree = buildChartTree(plan);
      state.planCache.set(key, { plan, tree, target: code });
      state.nodesById.set(pkgId, tree);
      if (plan.sourceLayout) state.layoutById.set(pkgId, plan.sourceLayout);
      const live = pkgById(pkgId);
      if (live) {
        live.nodes = tree;
        live.host = HOST_CODE[plan.sourceLayout] || live.host;
        live.unrecognized = plan.totalSourceFiles === 0;
      }
      view.setPackages(state.packages);
      view.setProgress(0, '扫描完成');
      logger.info(`扫描完成：${pkg.name} · ${plan.totalSourceFiles} 个文件 · ${tree.length} 个分组`);
      return state.planCache.get(key);
    } catch (err) {
      logger.error(`扫描失败：${pkg.name} · ${err.message}`);
      view.setProgress(0, '扫描失败');
      return null;
    }
  }

  async function importFiles(files) {
    const list = [...(files || [])];
    if (!list.length) return;
    if (!isStorageSupported()) { view.toast('当前浏览器不支持本地存储'); return; }
    for (const file of list) {
      const id = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await saveFile({
        id, name: file.name, size: file.size, blob: file, role: 'source',
        origin: ORIGINS.UPLOAD, metadata: { importedAt: Date.now() },
      });
      logger.info(`已导入 ${file.name}`);
    }
    await syncPackages();
    const newest = state.packages.filter((p) => p.zone === 'import').sort((a, b) => b.ts - a.ts)[0];
    if (newest) { await ensurePlan(newest.id); view.setActivePackage(newest.id); }
    view.toast(`已导入 ${list.length} 个包`);
  }

  async function downloadSelected(ids) {
    for (const id of ids) {
      const pkg = pkgById(id);
      const blob = await blobOf(pkg);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = pkg.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  async function copyBack(ids) {
    let count = 0;
    for (const id of ids) {
      const pkg = pkgById(id);
      const blob = await blobOf(pkg);
      if (!blob) continue;
      await saveFile({
        id: `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: pkg.name, size: blob.size, blob, role: 'source',
        origin: ORIGINS.UPLOAD, metadata: { copiedFrom: id },
      });
      count += 1;
    }
    await syncPackages();
    view.toast(`已复制 ${count} 个包回导入区`);
  }

  async function deleteSelected(ids) {
    if (!ids.length) { view.toast('先选择要删除的包'); return; }
    const ok = await confirmDialog(`确定删除选中的 ${ids.length} 个包吗？此操作不可撤销。`);
    if (!ok) return;
    for (const id of ids) {
      try { await deleteFile(id); } catch { /* 已不存在 */ }
      state.nodesById.delete(id);
      state.layoutById.delete(id);
    }
    await syncPackages();
    view.toast('已删除');
  }

  async function restoreSelected(ids) {
    if (!host.isPlugin) { view.toast('只有插件形态可以回传宿主'); return; }
    const targets = ids.map(pkgById).filter((p) => p && p.zone === 'export');
    if (!targets.length) { view.toast('先选择一个导出包'); return; }
    const ok = await confirmDialog(`将 ${targets[0].name} 恢复到当前宿主？覆盖前请确认已备份。`);
    if (!ok) return;
    if (state.busy) return;
    state.busy = true;
    try {
      view.setProgress(25, '正在回传宿主...');
      const blob = await blobOf(targets[0]);
      const result = host.platform === 'luker'
        ? await restoreToLuker(blob, {})
        : await restoreToHost(blob, { mode: 'merge', platform: host.platform });
      if (result && result.nothingRestored) throw new Error('宿主未写入任何条目');
      try { await importRestoredChatsIntoLibrary(blob); } catch { /* 纯库模式可选 */ }
      view.setProgress(100, '恢复完成');
      logger.info(`已恢复 ${targets[0].name}`);
      view.toast('恢复完成');
    } catch (err) {
      logger.error(`恢复失败：${err.message}`);
      view.setProgress(0, '恢复失败');
    } finally {
      state.busy = false;
    }
  }

  async function fetchFromHost() {
    if (!host.isPlugin) { view.toast('独立 Web 模式没有宿主数据源'); return; }
    if (state.busy) return;
    state.busy = true;
    try {
      view.setProgress(5, '正在请求宿主打包...');
      const blob = await fetchHostBackup(host.platform, null, {
        onPhase: (phase, received, total) => {
          if (phase === 'host-generating') view.setProgress(12, '宿主打包中...');
          else if (phase === 'transferring') {
            const pct = total > 0 ? 15 + Math.round((received / total) * 20) : 20;
            view.setProgress(pct, `接收中 ${(received / 1048576).toFixed(1)} MB`);
          }
        },
      });
      const name = `${HOST_LABEL[host.platform] || 'Host'}_host-export_${Date.now()}.zip`;
      const id = `pkg-${Date.now()}`;
      await saveFile({
        id, name, size: blob.size, blob: namedBlob(blob, name),
        layout: hostLayoutCode(host.platform), role: 'source',
        origin: ORIGINS.HOST_EXPORT, metadata: { fetchedAt: Date.now() },
      });
      state.layoutById.set(id, hostLayoutCode(host.platform));
      await syncPackages();
      await ensurePlan(id);
      view.setActivePackage(id);
      view.setProgress(100, '宿主拉取完成');
      view.toast('宿主拉取完成');
    } catch (err) {
      logger.error(`宿主拉取失败：${err.message}`);
      view.setProgress(0, '宿主拉取失败');
    } finally {
      state.busy = false;
    }
  }

  async function generate({ packages, target, splitMb, filenameTemplate }) {
    if (state.busy) return;
    if (!packages?.length) { view.toast('先选择要导出的包'); return; }
    state.busy = true;
    const code = targetCodeOf(target);
    const limit = splitLimitOf(splitMb);
    const created = [];
    try {
      for (const pkg of packages) {
        const blob = await blobOf(pkg);
        if (!blob) continue;
        const cached = await ensurePlan(pkg.id, target);
        if (!cached) continue;
        const excluded = view.getExcludedPaths(pkg);
        view.setProgress(3, `转换中 · ${pkg.name}`);
        const { resultBlob } = await runConversionTask({
          source: blob,
          target: code,
          options: {
            excludedPaths: excluded,
            compressionLevel: Number(settings.compression),
            extensionMode: settings.extensionMode,
            gitMode: settings.gitMode,
            keepDevFiles: settings.keepDev,
            includeCache: settings.includeCache,
            includeBackups: settings.includeBackups,
            includeAppPrivate: settings.includePrivate,
            pruneBuiltinAssets: settings.pruneBuiltin,
          },
          onProgress: (current, total, filename) => {
            const pct = total ? Math.round((current / total) * 92) : 10;
            view.setProgress(pct, `转换中 ${current}/${total}${filename ? ` · ${filename}` : ''}`);
          },
        });
        if (!resultBlob) continue;
        if (limit) {
          const entries = [];
          const reader = await zipIo.openReader(resultBlob);
          try {
            for await (const entry of reader.entries()) {
              if (entry.isDirectory) { entry.skip(); continue; }
              entries.push({ path: entry.fileName, blob: await entry.read() });
              entry.skip();
            }
          } finally { await reader.close(); }
          const split = await splitArchiveEntries(entries, {
            thresholdMB: limit, target: code, handle: 'default-user',
            filenameTemplate: filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
          });
          for (const part of split.parts) {
            created.push({ blob: part.blob, name: part.partName });
          }
        } else {
          const name = resolveFilename(filenameTemplate || DEFAULT_FILENAME_TEMPLATE, {
            sourceName: pkg.name, target: code, handle: 'default-user',
            part: 'part1', category: 'all', mode: 'single',
          });
          created.push({ blob: resultBlob, name });
        }
        logger.info(`已转换 ${pkg.name}`);
      }
      for (const item of created) {
        await saveFile({
          id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: item.name, size: item.blob.size, blob: namedBlob(item.blob, item.name),
          layout: code, role: 'output', origin: ORIGINS.CONVERTED,
          metadata: { convertedAt: Date.now() },
        });
      }
      await syncPackages();
      view.setProgress(100, '导出包已就绪');
      view.toast(`已生成 ${created.length} 个导出包`);
      if (created.length) view.setZone('export');
    } catch (err) {
      logger.error(`转换失败：${err.message}`);
      view.setProgress(0, '转换失败');
      view.toast('转换失败，详见日志');
    } finally {
      state.busy = false;
    }
  }

  async function exportLibrary() {
    try {
      const pack = await exportLibraryToPack({});
      if (!pack?.ok || !pack.blob) { view.toast(pack?.reason || '没有可导出的聊天'); return; }
      const id = `lib-${Date.now()}`;
      await saveFile({
        id, name: pack.name || 'library-export.zip', size: pack.blob.size,
        blob: pack.blob, role: 'source', origin: ORIGINS.UPLOAD,
        metadata: { libraryExport: true },
      });
      await syncPackages();
      await ensurePlan(id);
      view.toast('聊天库已导出到导入区');
    } catch (err) {
      logger.error(`聊天库导出失败：${err.message}`);
    }
  }

  function openSettings() {
    const v = settings;
    view.openModal('设置', '这些选项会记住。', [
      '<div class="settings-grid">',
      `<label class="set-row"><span>压缩</span><select id="set-compression" class="text_pole">`
        + ['0|不压缩', '1|快速', '5|标准', '9|最大'].map((x) => { const [k, t] = x.split('|'); return `<option value="${k}"${v.compression === k ? ' selected' : ''}>${t}</option>`; }).join('')
        + '</select></label>',
      `<label class="set-row"><span>扩展包</span><select id="set-extension-mode" class="text_pole">`
        + `<option value="manifest"${v.extensionMode === 'manifest' ? ' selected' : ''}>只导出清单</option>`
        + `<option value="full"${v.extensionMode === 'full' ? ' selected' : ''}>完整扩展包</option>`
        + '</select></label>',
      `<label class="set-row"><span>Git 历史</span><select id="set-git-mode" class="text_pole">`
        + `<option value="keep"${v.gitMode === 'keep' ? ' selected' : ''}>保留历史</option>`
        + `<option value="minimal"${v.gitMode === 'minimal' ? ' selected' : ''}>只留更新所需</option>`
        + `<option value="strip"${v.gitMode === 'strip' ? ' selected' : ''}>不含历史</option>`
        + '</select></label>',
      `<label class="check"><input type="checkbox" id="set-keep-dev"${v.keepDev ? ' checked' : ''}> 保留构建配置</label>`,
      `<label class="check"><input type="checkbox" id="set-include-backups"${v.includeBackups ? ' checked' : ''}> 打包 backups 快照</label>`,
      `<label class="check"><input type="checkbox" id="set-include-cache"${v.includeCache ? ' checked' : ''}> 打包派生缓存</label>`,
      `<label class="check"><input type="checkbox" id="set-include-private"${v.includePrivate ? ' checked' : ''}> 打包私有配置</label>`,
      `<label class="check"><input type="checkbox" id="set-prune-builtin"${v.pruneBuiltin ? ' checked' : ''}> 清理原生重复资产</label>`,
      `<label class="check"><input type="checkbox" id="set-keep-export"${v.keepExport ? ' checked' : ''}> 导出后在导出区保留包</label>`,
      `<label class="check"><input type="checkbox" id="set-traffic"${v.trafficPrompt ? ' checked' : ''}> 后端上下传流量提示</label>`,
      `<label class="check"><input type="checkbox" id="set-auto-tutorial"${v.autoTutorial ? ' checked' : ''}> 基础教程自动打开</label>`,
      '</div>',
    ], [
      { label: '关闭', onClick: () => view.closeModal() },
      {
        label: '保存',
        primary: true,
        onClick: () => {
          const q = (sel2) => root.querySelector(sel2);
          settings.compression = q('#set-compression')?.value || settings.compression;
          settings.extensionMode = q('#set-extension-mode')?.value || settings.extensionMode;
          settings.gitMode = q('#set-git-mode')?.value || settings.gitMode;
          settings.keepDev = !!q('#set-keep-dev')?.checked;
          settings.includeBackups = !!q('#set-include-backups')?.checked;
          settings.includeCache = !!q('#set-include-cache')?.checked;
          settings.includePrivate = !!q('#set-include-private')?.checked;
          settings.pruneBuiltin = !!q('#set-prune-builtin')?.checked;
          settings.keepExport = !!q('#set-keep-export')?.checked;
          settings.trafficPrompt = !!q('#set-traffic')?.checked;
          settings.autoTutorial = !!q('#set-auto-tutorial')?.checked;
          view.closeModal();
          view.toast('设置已保存');
        },
      },
    ]);
  }

  const view = createWorkbenchView({
    actions: {
      fetch: fetchFromHost,
      generate,
      restore: restoreSelected,
      copyBack,
      deleteSelected,
      download: downloadSelected,
      libraryExport: exportLibrary,
      lan: () => lanPanel?.open?.(),
      settings: openSettings,
      uploadRequest: () => root.querySelector('#file-input')?.click(),
      uploadPrivate: (name) => { logger.info(`私有配置上传请求：${name}`); view.toast(`私有配置：${name}`); },
      onActivePackage: (id) => { ensurePlan(id).then(() => view.setActivePackage(id)); },
      close: () => {
        const overlay = document.getElementById('st-converter-modal-overlay');
        if (overlay) overlay.style.display = 'none';
      },
    },
  });

  logger.subscribe((entry) => {
    view.pushLog(entry.level === 'SUCCESS' ? 'INFO' : entry.level, entry.message);
  });

  view.setHost(hostKey, host.isPlugin ? 'plugin' : 'web');
  try { view.setLibraryExport(probeChatStore().present); } catch { /* 外部库可选 */ }

  root.querySelector('#file-input')?.addEventListener('change', async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    await importFiles(files);
  });

  for (const target of [root, root.querySelector('#chart-card')]) {
    target?.addEventListener('dragover', (event) => event.preventDefault());
    target?.addEventListener('drop', async (event) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files || [])].filter((f) => f.name.toLowerCase().endsWith('.zip'));
      if (files.length) await importFiles(files);
    });
  }

  const lanPanel = mountLanTransferPanel({
    root,
    onReceive: async (blob, name) => importFiles([new File([blob], name || `lan-${Date.now()}.zip`)]),
  });

  await syncPackages();
  if (isStorageSupported()) {
    getStorageUsage().then((usage) => logger.info(`浏览器配额占用 ${((usage?.totalBytes || 0) / (1024 ** 3)).toFixed(2)} GB`)).catch(() => {});
  }
  view.setProgress(0, '准备就绪');
  logger.info(`工作台已就绪 · ${host.isPlugin ? (HOST_LABEL[host.platform] || '宿主') + ' 插件' : '独立 Web'}`);
}

function bootstrap() {
  mountDebugProbe();
  const host = detectHost();
  if (host.isPlugin) {
    ensureConverterModal();
    mountExtensionRowButton(() => openConverterModal());
    return;
  }
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.add('app-standalone');
  if (!app.hasChildNodes()) app.innerHTML = trustedStaticMarkup(getWorkbenchHtml({ isStandalone: true }));
  if (!initialized) { initialized = true; main(app); }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
}
