import { describe, expect, it } from 'vitest';
import { applyProxy, normalizeProxyUrl } from '../src/core/net-proxy.js';

describe('可选 CORS 代理', () => {
  it('留空即直连', () => {
    expect(applyProxy('https://api.github.com/user', '')).toBe('https://api.github.com/user');
    expect(applyProxy('https://api.github.com/user', '   ')).toBe('https://api.github.com/user');
    expect(normalizeProxyUrl('')).toBe('');
  });

  it('无占位符时按结尾形态拼接', () => {
    /* 以 = 结尾：直接追加编码目标（?url= 型） */
    expect(applyProxy('https://a.example/x?y=1', 'https://proxy.example/?url='))
      .toBe('https://proxy.example/?url=https%3A%2F%2Fa.example%2Fx%3Fy%3D1');
    /* 以 / 结尾：路径前缀型，原样追加 */
    expect(applyProxy('https://a.example/x', 'https://proxy.example/'))
      .toBe('https://proxy.example/https://a.example/x');
    /* 其它：追加 ?url= / &url= */
    expect(applyProxy('https://a.example/x', 'https://proxy.example/p?k=1'))
      .toBe('https://proxy.example/p?k=1&url=https%3A%2F%2Fa.example%2Fx');
    expect(applyProxy('https://a.example/x', 'https://proxy.example/fetch'))
      .toBe('https://proxy.example/fetch?url=https%3A%2F%2Fa.example%2Fx');
  });

  it('有 {url} 占位符时替换', () => {
    expect(applyProxy('https://a.example/x', 'https://proxy.example/fetch/{url}'))
      .toBe('https://proxy.example/fetch/https%3A%2F%2Fa.example%2Fx');
  });

  it('补协议、末尾斜杠收敛为一个', () => {
    expect(normalizeProxyUrl('proxy.example/?url=')).toBe('https://proxy.example/?url=');
    expect(normalizeProxyUrl('http://proxy.example//')).toBe('http://proxy.example/');
    expect(normalizeProxyUrl('proxy.example')).toBe('https://proxy.example');
  });
});
