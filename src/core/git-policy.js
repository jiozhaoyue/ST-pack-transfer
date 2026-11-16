/**
 * Git 目录策略（纯函数，无 DOM / 无 zip 依赖）。
 *
 * 转换器与图表体积预测**必须共用这一份判断**：否则「预估大小」会把
 * `gitMode=minimal/strip` 将要剔除的 `.git/objects` 仍算进去，用户看到的数字虚高。
 */

import { GIT_MODES } from './export-modes.js';

/** 归一化 gitMode：未知取值一律回落 KEEP（防御式，不抛错）。 */
export function normalizeGitMode(value) {
  return Object.values(GIT_MODES).includes(value) ? value : GIT_MODES.KEEP;
}

/** `relPath`（相对扩展根）是否属于 `.git` 目录。注意 `.gitkeep` 不算。 */
export function isGitEntry(relPath) {
  return relPath === '.git' || relPath.startsWith('.git/');
}

/**
 * `minimal` 策略下需要保留的 `.git` 条目：
 * `config`（remote URL）/ `HEAD`（分支）/ `index`（使更新后 status 干净）/ `refs/heads/**`（分支指针）。
 * 其余（含 `objects/pack/*.pack` 全部对象存储）一律剔除。
 */
export function isGitMinimalKept(relPath) {
  return relPath === '.git/config'
    || relPath === '.git/HEAD'
    || relPath === '.git/index'
    || relPath.startsWith('.git/refs/heads/');
}

/** 该 `.git` 条目在给定 gitMode 下是否会被剔除（keep 恒 false）。 */
export function isGitEntryDropped(relPath, gitMode) {
  const mode = normalizeGitMode(gitMode);
  if (mode === GIT_MODES.KEEP || !isGitEntry(relPath)) return false;
  if (mode === GIT_MODES.MINIMAL) return !isGitMinimalKept(relPath);
  return true;
}

/** 因 gitMode 剔除条目时的上报文案（两档各自写明代价）。 */
export function gitDropReason(gitMode) {
  return gitMode === GIT_MODES.STRIP
    ? 'gitMode=strip：剔除扩展 Git 历史（接收方需重新 git clone 才能在线更新）'
    : 'gitMode=minimal：仅保留 Git 识别与更新所需最小集，剔除对象存储';
}
