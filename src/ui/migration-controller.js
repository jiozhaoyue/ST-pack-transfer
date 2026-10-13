/**
 * 迁移流程控制器（S2 · 源端交付）。
 *
 * 本片只承载**源端三类交付的构建**：把「未转换的源备份 / 转换后的目标包 / 独立报告」
 * 组装成待导出区可直接消费的项。**纯函数**——不读 DOM、不发请求（`L1-MR-6`），
 * 故可在 Node/Vitest 直接测。
 *
 * 为什么需要它（现状缺口，`index.js:1672-1799`）：`handleHostExport` 在转换后
 * 把 `finalBlob` 顶替 `rawBackupBlob`，**原始源包不再入队** ⇒ 用户拿不到保底文件。
 *
 * 契约见 `.trellis/tasks/10-13-migration-source-delivery/design.md` §2。
 */

import { ORIGINS } from '../storage/db.js';

/** 去掉 `.zip` 后缀，供拼接用途标识。 */
function stripZipExt(name) {
  return String(name || '').replace(/\.zip$/i, '');
}

/** 报告文本 → 可领取的 `text/plain` Blob。 */
function reportBlob(text) {
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

/**
 * 构建源端三类交付项（供 `exportQueue.enqueue` 逐项消费）。
 *
 * @param {object} input
 * @param {{blob: Blob, name: string, layout?: string}} input.source 未转换的源备份（必需）
 * @param {{blob: Blob, name: string, layout?: string}|null} [input.target] 转换后的目标包（无转换时为 null）
 * @param {{text: string}|null} [input.report] 报告文本（`Report.toHuman()`）
 * @param {boolean} [input.hasTransform] 是否发生了转换
 * @returns {Array<{name: string, blob: Blob, origin: string, targetLayout: string}>}
 */
export function buildSourceDeliveries({ source, target = null, report = null, hasTransform = false } = {}) {
  if (!source || !source.blob || !source.name) {
    throw new Error('buildSourceDeliveries: 必须提供 source（含 blob 与 name）');
  }
  const base = stripZipExt(source.name);
  const items = [];

  if (hasTransform) {
    // 1. 源备份（保底）：**未转换原包**，字节原样引用（不复制）
    items.push({
      name: `${base}_源备份.zip`,
      blob: source.blob,
      origin: ORIGINS.SOURCE_BACKUP,
      targetLayout: '',
    });
    // 2. 目标包（主产物）：保持既有命名，不加用途后缀；origin 可被调用方覆盖（如 delta 补丁）
    if (target && target.blob) {
      items.push({
        name: target.name,
        blob: target.blob,
        origin: target.origin || ORIGINS.CONVERTED,
        targetLayout: target.layout || '',
      });
    }
  } else {
    // 无转换：源即目标，只入队一份（宿主导出），避免「源备份 == 目标包」两条重复
    items.push({
      name: source.name,
      blob: source.blob,
      origin: ORIGINS.HOST_EXPORT,
      targetLayout: source.layout || '',
    });
  }

  // 3. 独立报告（可领取）
  if (report && typeof report.text === 'string') {
    items.push({
      name: `${base}_报告.txt`,
      blob: reportBlob(report.text),
      origin: ORIGINS.REPORT,
      targetLayout: '',
    });
  }

  return items;
}
