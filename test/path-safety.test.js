import { describe, it, expect } from 'vitest';
import { sanitizeRelativePath } from '../src/core/path-safety.js';
import { encodePath, objectKey } from '../src/core/s3-client.js';
import { encodeDavPath, joinDavUrl } from '../src/core/webdav-client.js';

/**
 * 功能审计 F-03 回归：备份集名可含 `../`，不得越出用户填写的远端前缀目录。
 * 判据：段级净化后，编码结果里不再出现 `.` / `..` 段。
 */
describe('远端路径段净化（防目录穿越）', () => {
  it('净化点段与空段', () => {
    expect(sanitizeRelativePath('a/../b')).toBe('a/_/b');
    expect(sanitizeRelativePath('/x//y/')).toBe('x/y');
    expect(sanitizeRelativePath('..\\..\\z')).toBe('_/_/z');
    expect(sanitizeRelativePath('./.')).toBe('_/_');
  });

  it('S3 编码不保留 .. 段', () => {
    expect(encodePath('pre/../evil')).toBe('pre/_/evil');
    expect(encodePath('../evil')).toBe('_/evil');
    expect(objectKey('set', '../../x')).toBe('set/../../x'); // 拼接层保持原样，编码层负责净化
    expect(encodePath(objectKey('set', '../../x'))).toBe('set/_/_/x');
  });

  it('WebDAV 编码与 URL 拼接不保留 .. 段', () => {
    expect(encodeDavPath('dir/../file.zip')).toBe('dir/_/file.zip');
    expect(joinDavUrl('https://dav.example/root', '../file.zip'))
      .toBe('https://dav.example/root/_/file.zip');
    expect(encodeDavPath('a%2e%2e/b')).toBe('a%252e%252e/b'); // 二次编码，不会被服务端解码成 ..
  });

  it('合法路径保持原样', () => {
    expect(encodePath('backup/2026/07-17/pack.zip')).toBe('backup/2026/07-17/pack.zip');
    expect(encodeDavPath('备份/2026-11/pack.zip')).toBe(encodeURI('备份') + '/2026-11/pack.zip');
  });
});
