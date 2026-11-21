import { describe, it, expect } from 'vitest';
import {
  canRestoreLayout,
  describeLayout,
  NEED_CONVERT_REASON,
} from '../src/core/restore-compat.js';

const HOST_PLATFORMS = ['st', 'luker', 'tt', 'pt'];
const LAYOUTS = ['st', 'l', 'tt', 'pt', '', 'unknown'];

// 期望矩阵：宿主目录族 {st,luker}=flat、{tt,pt}=prefixed；
// 布局族 {st,l}=flat、{tt,pt}=prefixed、{'',unknown}=未知（拒）。
const FLAT_HOSTS = new Set(['st', 'luker']);
const FLAT_LAYOUTS = new Set(['st', 'l']);
const PREFIXED_HOSTS = new Set(['tt', 'pt']);
const PREFIXED_LAYOUTS = new Set(['tt', 'pt']);

function expectedOk(host, layout) {
  return (FLAT_HOSTS.has(host) && FLAT_LAYOUTS.has(layout))
    || (PREFIXED_HOSTS.has(host) && PREFIXED_LAYOUTS.has(layout));
}

describe('canRestoreLayout · 全组合矩阵', () => {
  for (const host of HOST_PLATFORMS) {
    for (const layout of LAYOUTS) {
      const label = `${host} × ${layout || '<空>'}`;
      it(label, () => {
        expect(canRestoreLayout(host, layout).ok).toBe(expectedOk(host, layout));
      });
    }
  }
});

describe('canRestoreLayout · 未知布局一律拒绝', () => {
  for (const host of HOST_PLATFORMS) {
    it(`空 layout 被 ${host} 拒绝`, () => {
      expect(canRestoreLayout(host, '').ok).toBe(false);
      expect(canRestoreLayout(host, '').reasonKey).toBe(NEED_CONVERT_REASON);
    });
    it(`unknown layout 被 ${host} 拒绝`, () => {
      expect(canRestoreLayout(host, 'unknown').ok).toBe(false);
      expect(canRestoreLayout(host, 'unknown').reasonKey).toBe(NEED_CONVERT_REASON);
    });
  }
});

describe('canRestoreLayout · l 与 luker 等价', () => {
  it("layout 'l' 与 'luker' 等价", () => {
    for (const host of HOST_PLATFORMS) {
      expect(canRestoreLayout(host, 'l')).toEqual(canRestoreLayout(host, 'luker'));
    }
  });
  it("hostPlatform 'l' 与 'luker' 等价", () => {
    for (const layout of [...LAYOUTS, 'luker']) {
      expect(canRestoreLayout('l', layout)).toEqual(canRestoreLayout('luker', layout));
    }
  });
});

describe('canRestoreLayout · reasonKey 与 ok 严格互斥', () => {
  it('全组合下 ok 为真当且仅当 reasonKey 为空串', () => {
    for (const host of HOST_PLATFORMS) {
      for (const layout of [...LAYOUTS, 'luker']) {
        const { ok, reasonKey } = canRestoreLayout(host, layout);
        if (ok) {
          expect(reasonKey).toBe('');
        } else {
          expect(reasonKey).toBe(NEED_CONVERT_REASON);
        }
        expect(ok === (reasonKey === '')).toBe(true);
      }
    }
  });
});

describe('describeLayout', () => {
  it("'l' 归一为 'luker'", () => {
    expect(describeLayout('l')).toBe('luker');
  });
  it("'luker' 幂等返回 'luker'", () => {
    expect(describeLayout('luker')).toBe('luker');
  });
  it('其它布局原样返回', () => {
    expect(describeLayout('st')).toBe('st');
    expect(describeLayout('tt')).toBe('tt');
    expect(describeLayout('pt')).toBe('pt');
  });
});
