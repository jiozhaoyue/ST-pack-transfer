import { describe, expect, it } from 'vitest';
import { decryptBytes, encryptBytes, isEncrypted } from '../src/core/s3-crypto.js';

const bytes = new TextEncoder().encode('数据包内容 payload');

describe('包体加密', () => {
  it('加密后带 SPT1 头，解密还原原文', async () => {
    const packed = await encryptBytes(bytes, 'passphrase');
    expect(isEncrypted(packed)).toBe(true);
    const plain = await decryptBytes(packed, 'passphrase');
    expect(new TextDecoder().decode(plain)).toBe('数据包内容 payload');
  });

  it('同一段明文两次加密的密文不同（随机盐与 IV）', async () => {
    const a = await encryptBytes(bytes, 'p');
    const b = await encryptBytes(bytes, 'p');
    expect([...a]).not.toEqual([...b]);
  });

  it('口令错误时解密失败', async () => {
    const packed = await encryptBytes(bytes, 'right');
    await expect(decryptBytes(packed, 'wrong')).rejects.toBeTruthy();
  });

  it('未加密数据不被误判', () => {
    expect(isEncrypted(bytes)).toBe(false);
    expect(isEncrypted(new Uint8Array(0))).toBe(false);
  });

  it('缺少口令直接拒绝', async () => {
    await expect(encryptBytes(bytes, '')).rejects.toThrow('passphrase-required');
  });
});
