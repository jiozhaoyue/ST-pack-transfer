import { describe, expect, it } from 'vitest';
import {
  USER_FILE_MAX_BYTES,
  sanitizeUserFileName,
  uploadUserFile,
  userFileUrl,
  userFilesSupported,
} from '../src/ui/host-bridge.js';

describe('宿主 user/files 适配器', () => {
  it('只有 ST / Luker 支持原生 files 接口', () => {
    expect(userFilesSupported('st')).toBe(true);
    expect(userFilesSupported('luker')).toBe(true);
    expect(userFilesSupported('pt')).toBe(false);
    expect(userFilesSupported('tt')).toBe(false);
  });

  it('文件名白名单：非 [a-zA-Z0-9._-] 一律替换，且去掉目录前缀', () => {
    expect(sanitizeUserFileName('a/b/c.zip')).toBe('c.zip');
    expect(sanitizeUserFileName('私有 配置.zip')).toBe('_____.zip');
    expect(sanitizeUserFileName('')).toBe('');
  });

  it('userFileUrl 走静态 user/files 路径', () => {
    expect(userFileUrl('a b.zip')).toBe('/user/files/a%20b.zip');
  });

  it('不支持的宿主直接拒绝，不发请求', async () => {
    const result = await uploadUserFile('x.zip', new Blob([new Uint8Array([1])]), { platform: 'pt' });
    expect(result).toEqual({ ok: false, reason: 'unsupported-host' });
  });

  it('超过 500 MB 直接拒绝，不发请求', async () => {
    const big = new Blob([new Uint8Array([1])]);
    Object.defineProperty(big, 'size', { value: USER_FILE_MAX_BYTES + 1 });
    const result = await uploadUserFile('x.zip', big, { platform: 'st' });
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });
});
