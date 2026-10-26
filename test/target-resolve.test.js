/**
 * `resolveTargetLayout` —— 目标选择器原始值 → 布局码的归一
 *
 * 历史缺陷 N-1（2026-09-26）：旧版下拉里的 `native` 表示「宿主原生格式」，
 * 若原样交给转换器，会退化成**原样直通**——ST 宿主上恰好等价所以看不出来，
 * Luker 宿主上则拿到未经布局转换的结果。
 *
 * 2026-10-27 R1.2 删除 `native` 选项后，归一规则改为：
 * **只有四个布局码被接受，其余一律回落到当前宿主布局**。
 * 因此旧版存档/旧模板里残留的 `'native'` 仍然落到「宿主那一项」，缺陷不会复活。
 */

import { describe, expect, it } from 'vitest';
import { hostLayoutCode, resolveTargetLayout } from '../src/ui/host-bridge.js';

describe('resolveTargetLayout：四个布局码原样通过', () => {
  it('st / l / tt / pt 都不被改写', () => {
    for (const code of ['st', 'l', 'tt', 'pt']) {
      expect(resolveTargetLayout(code, 'luker')).toBe(code);
      expect(resolveTargetLayout(code, 'st')).toBe(code);
    }
  });

  it('显式布局码不受宿主影响（跨宿主指定目标是合法用法）', () => {
    expect(resolveTargetLayout('pt', 'luker')).toBe('pt');
    expect(resolveTargetLayout('tt', 'st')).toBe('tt');
  });
});

describe('resolveTargetLayout：空值与未知值回落到宿主布局', () => {
  it('空 / undefined / null / 纯空白 ⇒ 当前宿主布局', () => {
    for (const empty of ['', undefined, null, '   ']) {
      expect(resolveTargetLayout(empty, 'st')).toBe('st');
      expect(resolveTargetLayout(empty, 'luker')).toBe('l');
    }
  });

  it('旧版 `native` 残留 ⇒ 宿主布局（N-1 的守护：绝不原样返回 native）', () => {
    expect(resolveTargetLayout('native', 'luker')).toBe('l');
    expect(resolveTargetLayout('native', 'st')).toBe('st');
    expect(resolveTargetLayout('  native  ', 'luker')).toBe('l');
  });

  it('任意脏值都不透传', () => {
    expect(resolveTargetLayout('garbage', 'luker')).toBe('l');
    expect(resolveTargetLayout('st ', 'luker')).toBe('st');
  });

  it('宿主不是布局码（standalone）时用 fallback', () => {
    expect(resolveTargetLayout('', 'standalone', 'pt')).toBe('pt');
    expect(resolveTargetLayout('native', 'standalone')).toBe('l');
  });

  it('宿主与 fallback 都不可用时兜底 st', () => {
    expect(resolveTargetLayout('', undefined, 'oops')).toBe('st');
  });

  it('归一结果与 hostLayoutCode 直接调用一致（不留第二套映射）', () => {
    for (const p of ['st', 'luker']) {
      expect(resolveTargetLayout('', p)).toBe(hostLayoutCode(p));
    }
  });
});
