/**
 * 目标预检与备份证据（S3 · 纯判定层）。
 *
 * 三件事，全部**不发请求、不读 DOM**（`L1-MR-6`），可在 Node/Vitest 直接测：
 * - `assessTargetConflicts` —— 目标预检：**读得到目标清单才比较**；读不到一律 `unknown`，
 *   **绝不是 0 冲突**（`.trellis/spec/frontend/migration-safety-and-evidence.md` §3.2）。
 * - `buildTargetBackupEvidence` —— 目标备份证据：**自动优先、手动声明保底**；两者**不得互相冒充**
 *   （§3.1）。临时 Blob / 仅触发下载都不算「留存」。
 * - `describe*` —— 面向界面的**呈现**：人工确认与机器验证**分别呈现**；冲突未知**不显示成无冲突**。
 *
 * 本模块只做**判定与呈现**，不做宿主调用 —— 宿主差异仍封装在 `src/ui/host-bridge.js`（`L0-9`）。
 */

/** 冲突状态：`known` = 已读目标清单并比较；`unknown` = 读不到目标清单（**不是 0**）。 */
export const CONFLICT_STATES = Object.freeze({
  KNOWN: 'known',
  UNKNOWN: 'unknown',
});

/** 备份证据级别。`readback-verified` 只能由**机器核对**得出，`user-attested` 只能由**用户确认**得出。 */
export const BACKUP_LEVELS = Object.freeze({
  NONE: 'none',
  USER_ATTESTED: 'user-attested',
  READBACK_VERIFIED: 'readback-verified',
});

/** 备份范围与本次写入的关系。 */
export const BACKUP_SCOPES = Object.freeze(['matches-write', 'partial', 'unknown']);

/** 备份留存态（仅内存生成 / 仅触发下载都不算 `confirmed`）。 */
export const BACKUP_RETENTIONS = Object.freeze(['confirmed', 'unconfirmed']);

/** 目标写入能力三态（与 `migration-plan.js` 的能力维度同源）。 */
export const WRITE_CAPABILITY_STATES = Object.freeze(['available', 'unavailable', 'unknown']);

/** 路径归一：跨平台分隔符 / 大小写 / Unicode 变体统一，避免「同名不同形」漏判冲突。 */
function normalizePath(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

/**
 * 目标预检：把「本次将写入的条目」与「目标现有条目」比对。
 *
 * ⚠️ **读不到目标清单时返回 `state:'unknown'` 且 `conflictCount:null`** —— 调用方**不得**
 * 把 `null` 当作 0（§3.2：「不能把不可访问目标列为 0 冲突」）。也无法由「源包有 N 条」推出
 * 「新增 N 条」。
 *
 * @param {object} [input]
 * @param {{paths?: string[]}|null} [input.targetManifest] 目标现有条目清单；`null` = 读不到
 * @param {string[]} [input.incomingPaths] 本次将写入的条目路径
 * @returns {{state: 'known'|'unknown', conflictCount: number|null, newCount: number|null, conflicts: string[]}}
 */
export function assessTargetConflicts({ targetManifest, incomingPaths } = {}) {
  const incoming = (Array.isArray(incomingPaths) ? incomingPaths : [])
    .map(normalizePath)
    .filter(Boolean);
  const targetPaths = targetManifest && Array.isArray(targetManifest.paths)
    ? targetManifest.paths
    : null;

  if (!targetPaths) {
    return { state: CONFLICT_STATES.UNKNOWN, conflictCount: null, newCount: null, conflicts: [] };
  }

  const target = new Set(targetPaths.map(normalizePath).filter(Boolean));
  const conflicts = [...new Set(incoming.filter((p) => target.has(p)))];
  return {
    state: CONFLICT_STATES.KNOWN,
    conflictCount: conflicts.length,
    newCount: incoming.length - conflicts.length,
    conflicts,
  };
}

/**
 * 构建目标备份证据。**自动优先、手动声明保底**，两条路径**不得互相冒充**（§3.1）。
 *
 * - `mode:'auto'`：仅当「可读 + 范围覆盖本次写入 + 已留存」三者齐备才 `readback-verified`；
 *   否则降级 `none`（**不**部分放行，也**不**退回 user-attested）。
 * - `mode:'manual'`（缺省）：仅当用户**明确确认**才 `user-attested`；**绝不**升级为
 *   `readback-verified`（人工声明不是机器核对）。
 *
 * @param {object} [input]
 * @param {'auto'|'manual'} [input.mode='manual']
 * @param {string|null} [input.targetRef] 备份对应的目标身份（须为**本次将被写入的目标**）
 * @param {{readable?: boolean, retained?: boolean, scope?: string}|null} [input.artifact] 自动备份产物（`mode:'auto'`）
 * @param {boolean} [input.userConfirmed] 用户是否声明「已备份目标数据」（`mode:'manual'`）
 * @returns {{level: string, targetRef: string|null, scope: string, retention: string, reason: string}}
 */
export function buildTargetBackupEvidence({
  mode = 'manual',
  targetRef = null,
  artifact = null,
  userConfirmed = false,
} = {}) {
  const ref = typeof targetRef === 'string' ? targetRef : null;

  if (mode === 'auto') {
    const a = artifact && typeof artifact === 'object' ? artifact : {};
    const scope = BACKUP_SCOPES.includes(a.scope) ? a.scope : 'unknown';
    const retained = a.retained === true;
    const readable = a.readable === true;

    if (readable && scope === 'matches-write' && retained) {
      return {
        level: BACKUP_LEVELS.READBACK_VERIFIED,
        targetRef: ref,
        scope,
        retention: 'confirmed',
        reason: '',
      };
    }
    const missing = [];
    if (!readable) missing.push('备份不可读');
    if (scope !== 'matches-write') missing.push('备份范围未覆盖本次写入');
    if (!retained) missing.push('备份留存未确认');
    return {
      level: BACKUP_LEVELS.NONE,
      targetRef: ref,
      scope,
      retention: retained ? 'confirmed' : 'unconfirmed',
      reason: missing.join('；'),
    };
  }

  if (userConfirmed === true) {
    return {
      level: BACKUP_LEVELS.USER_ATTESTED,
      targetRef: ref,
      scope: 'matches-write',
      retention: 'confirmed',
      reason: '',
    };
  }
  return {
    level: BACKUP_LEVELS.NONE,
    targetRef: ref,
    scope: 'unknown',
    retention: 'unconfirmed',
    reason: '用户未确认已备份目标数据',
  };
}

/**
 * 备份证据 → 界面呈现。**人工确认与机器验证分别呈现**（§3.3）：不得把 `user-attested`
 * 说成已核对。
 *
 * @param {{level?: string}} [backup]
 * @returns {{level: string, label: string, machineVerified: boolean, userAttested: boolean}}
 */
export function describeBackupEvidence(backup = {}) {
  const level = Object.values(BACKUP_LEVELS).includes(backup?.level)
    ? backup.level
    : BACKUP_LEVELS.NONE;

  if (level === BACKUP_LEVELS.READBACK_VERIFIED) {
    return {
      level,
      label: '机器验证：目标备份可读、范围与本次写入一致且已留存',
      machineVerified: true,
      userAttested: false,
    };
  }
  if (level === BACKUP_LEVELS.USER_ATTESTED) {
    return {
      level,
      label: '人工确认：你声明已备份目标数据（未经机器核对）',
      machineVerified: false,
      userAttested: true,
    };
  }
  return { level: BACKUP_LEVELS.NONE, label: '无目标备份证据', machineVerified: false, userAttested: false };
}

/**
 * 冲突评估 → 界面呈现。**未知冲突不显示成无冲突**（§3.2 / `AC-05`）。
 *
 * @param {{state?: string, conflictCount?: number|null}} [conflicts]
 * @returns {{state: string, label: string, showsNoConflict: boolean, showsUnknown: boolean}}
 */
export function describeConflictState(conflicts = {}) {
  if (conflicts?.state === CONFLICT_STATES.KNOWN) {
    const count = Number.isFinite(conflicts.conflictCount) ? conflicts.conflictCount : 0;
    return {
      state: CONFLICT_STATES.KNOWN,
      label: count > 0 ? `目标已有 ${count} 个同名条目，合并写入将更新它们` : '目标无同名条目（新增写入）',
      showsNoConflict: count === 0,
      showsUnknown: false,
    };
  }
  return {
    state: CONFLICT_STATES.UNKNOWN,
    label: '无法读取目标清单：同名条目可能被更新（冲突状态未知，不是 0 冲突）',
    showsNoConflict: false,
    showsUnknown: true,
  };
}

/**
 * 目标写入能力 → 界面呈现与**原生指引**（§3.1 末条 / §4）。
 *
 * `autoWriteConfirmed` 是「**确知**可自动写」；`unknown` 时不得当作可写，也不得以真实破坏性
 * 请求充当探测。注意：写入门禁对 `unknown` 能力**不**硬拒（既有契约「未知不等于不支持」），
 * 本描述符只负责**如实呈现与给替代路径**。
 *
 * @param {{targetWrite?: string}|null} [cell] 能力矩阵中该目标布局的格子
 * @returns {{status: string, autoWriteConfirmed: boolean, guidance: string}}
 */
export function describeTargetWriteCapability(cell) {
  const status = WRITE_CAPABILITY_STATES.includes(cell?.targetWrite) ? cell.targetWrite : 'unknown';
  if (status === 'available') {
    return { status, autoWriteConfirmed: true, guidance: '' };
  }
  if (status === 'unavailable') {
    return {
      status,
      autoWriteConfirmed: false,
      guidance: '该宿主不支持自动写入，请改用宿主原生方式导入（包内 _convert/INSTALL.md 有步骤）',
    };
  }
  return {
    status,
    autoWriteConfirmed: false,
    guidance: '目标写入能力未确认：请先用宿主原生方式导入，或在确认能力后再试自动写入',
  };
}
