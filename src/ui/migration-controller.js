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
import { evaluateWriteGate } from '../core/migration-evidence.js';

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

/**
 * 目标写入的**门禁编排**（S3）：先过 `evaluateWriteGate`，再决定是否写入。
 *
 * 关键不变量：门禁不过时 `restoreFn` **一次都不调用**（零写入）。
 * `restoreFn` 由调用方注入（`() => restoreToHost(...)`），故可在 Node 用端口替身直测。
 * 门禁不吞异常：`restoreFn` 抛错原样上抛。
 *
 * @param {object} params
 * @param {object} params.plan `createMigrationPlan` 产出的冻结快照
 * @param {object} params.evidence `buildTargetEvidence` 产出的证据
 * @param {() => Promise<any>} params.restoreFn 实际写入动作
 * @returns {Promise<{wrote: boolean, reasons: string[], result?: any}>}
 */
export async function guardedRestore({ plan, evidence, restoreFn }) {
  const gate = evaluateWriteGate(plan, evidence);
  if (!gate.allowed) {
    return { wrote: false, reasons: gate.reasons };
  }
  const result = await restoreFn();
  return { wrote: true, result, reasons: [] };
}

/**
 * 构造目标写入的 evidence（S3）。**纯函数**：不 import host-bridge，`inFlight` 由调用方求值后传入。
 *
 * 备份证据两种来源（优先级从高到低）：
 *   ① `backup` —— 已由 `buildTargetBackupEvidence`（`src/core/migration-target.js`）构造的完整证据
 *      （可含 `readback-verified` 自动备份）；
 *   ② `backupConfirmed` —— 旧布尔入口，回落到 `user-attested` 或 `none`（向后兼容）。
 *
 * 字段对齐 `.trellis/spec/frontend/migration-safety-and-evidence.md` §3.1。
 *
 * @param {object} params
 * @param {string} params.platform 宿主平台码
 * @param {string} params.handle 当前用户 handle
 * @param {string} params.planTargetRef 计划生成时的目标身份
 * @param {boolean} [params.backupConfirmed] 用户是否声明「已备份目标数据」（`backup` 缺省时使用）
 * @param {number|string} params.planRevision 当前计划 revision
 * @param {boolean} params.inFlight 是否已有同一写操作在途
 * @param {'granted'|'denied'|'unknown'} [params.permission='granted'] 权限态
 * @param {object|null} [params.backup] 已构造的备份证据（优先于 `backupConfirmed`）
 * @param {{state: string}|null} [params.conflicts] 目标冲突评估（`assessTargetConflicts` 产出）
 * @param {boolean} [params.conflictAcknowledged] 用户是否已确认「冲突未知」风险
 */
export function buildTargetEvidence({
  platform,
  handle,
  planTargetRef,
  backupConfirmed,
  planRevision,
  inFlight,
  permission = 'granted',
  backup = null,
  conflicts = null,
  conflictAcknowledged = false,
}) {
  const targetRef = `${platform}@${handle}`;
  const backupEvidence = backup
    || (backupConfirmed
      ? { level: 'user-attested', targetRef, scope: 'matches-write', retention: 'confirmed' }
      : { level: 'none' });
  return {
    planRevision,
    targetRef,
    planTargetRef,
    permission,
    confirmation: { valid: true, acknowledged: { conflictUnknown: Boolean(conflictAcknowledged) } },
    backup: backupEvidence,
    conflicts,
    inFlight: Boolean(inFlight),
  };
}

/**
 * 向导与高级工作台**共享**的选择/任务状态接缝（S5 第一步）。
 *
 * 存在理由（`10-01/design.md` §3.1）：向导与工作台必须共享同一份「用户意图」，
 * **不得各持一份配置**。本接缝是纯逻辑（无 DOM），故可在 Node 直接测。
 *
 * @returns {{getState: () => object, setSelection: (s: object) => void, setTask: (id: string|null) => void, setPlan: (p: object|null) => void}}
 */
export function createMigrationSession() {
  let state = { selection: {}, taskId: null, plan: null };
  return {
    getState: () => ({
      selection: { ...state.selection },
      taskId: state.taskId,
      plan: state.plan,
    }),
    setSelection: (selection) => { state = { ...state, selection: { ...(selection || {}) } }; },
    setTask: (taskId) => { state = { ...state, taskId: taskId ?? null }; },
    setPlan: (plan) => { state = { ...state, plan: plan ?? null }; },
  };
}
