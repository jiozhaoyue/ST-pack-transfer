/**
 * 四宿主扩展作用域与同名去重（2026-11-12）。
 *
 * 锁住三件事：
 * ① 五种源形态 → 作用域分类（含宿主自带插件）；
 * ② 四目标落点矩阵（ST/L 平铺、TT 保留作用域、PT 一律 third-party）；
 * ③ 同名时用户级优先（与 ST/Luker/TT 宿主加载语义一致）。
 */
import { describe, it, expect } from 'vitest';
import {
  routeSource, targetEntryPath, extensionScopeOf, thirdPartyFolderOf,
} from '../src/core/transform.js';
import { LAYOUTS } from '../src/core/detect.js';

describe('extensionScopeOf：源路径 → 作用域', () => {
  it('用户级（ST/Luker 摊平）', () => {
    expect(extensionScopeOf('extensions/foo/index.js', LAYOUTS.ST)).toEqual({ name: 'foo', scope: 'user' });
  });

  it('全局（ST/Luker 错误嵌套 third-party）', () => {
    expect(extensionScopeOf('extensions/third-party/bar/index.js', LAYOUTS.ST))
      .toEqual({ name: 'bar', scope: 'global' });
  });

  it('全局（ST/Luker 宿主真实路径 public/scripts/extensions/third-party）', () => {
    expect(extensionScopeOf('public/scripts/extensions/third-party/baz/a.js', LAYOUTS.L))
      .toEqual({ name: 'baz', scope: 'global' });
  });

  it('宿主自带插件', () => {
    expect(extensionScopeOf('public/scripts/extensions/regex/index.js', LAYOUTS.ST))
      .toEqual({ name: 'regex', scope: 'builtin' });
  });

  it('TT 用户级（local）与全局（third-party）', () => {
    expect(extensionScopeOf('data/default-user/extensions/q/index.js', LAYOUTS.TT))
      .toEqual({ name: 'q', scope: 'user' });
    expect(extensionScopeOf('data/extensions/third-party/w/a.js', LAYOUTS.TT))
      .toEqual({ name: 'w', scope: 'global' });
  });

  it('散文件不算扩展', () => {
    expect(extensionScopeOf('extensions/.gitkeep', LAYOUTS.ST)).toBeNull();
    expect(extensionScopeOf('public/scripts/extensions/shared.js', LAYOUTS.ST)).toBeNull();
  });

  it('thirdPartyFolderOf 只认全局', () => {
    expect(thirdPartyFolderOf('extensions/third-party/bar/a.js', LAYOUTS.ST)).toBe('bar');
    expect(thirdPartyFolderOf('extensions/foo/a.js', LAYOUTS.ST)).toBeNull();
  });
});

describe('routeSource：扩展条目分类', () => {
  it('ST 全局三方扩展 → extension-pkg/global，hub 去 third-party', () => {
    expect(routeSource('public/scripts/extensions/third-party/Baz/index.js', LAYOUTS.ST))
      .toMatchObject({ kind: 'extension-pkg', hubPath: 'extensions/Baz/index.js', extScope: 'global' });
  });

  it('宿主自带插件 → builtin-ext（不冒充扩展）', () => {
    const r = routeSource('public/scripts/extensions/regex/index.js', LAYOUTS.ST);
    expect(r.kind).toBe('builtin-ext');
    expect(r.extName).toBe('regex');
  });

  it('TT 用户级扩展是 extension-pkg/user（不再当普通用户文件）', () => {
    expect(routeSource('data/default-user/extensions/foo/index.js', LAYOUTS.TT))
      .toMatchObject({ kind: 'extension-pkg', hubPath: 'extensions/foo/index.js', extScope: 'user' });
  });

  it('TT 全局扩展是 extension-pkg/global', () => {
    expect(routeSource('data/extensions/third-party/bar/a.js', LAYOUTS.TT))
      .toMatchObject({ kind: 'extension-pkg', hubPath: 'extensions/bar/a.js', extScope: 'global' });
  });
});

describe('targetEntryPath：四目标落点矩阵', () => {
  const userPath = 'extensions/foo/a.js';
  const globalPath = 'extensions/bar/a.js';

  it('ST / L：两种作用域都平铺成 extensions/<n>（宿主用户级优先）', () => {
    expect(targetEntryPath(userPath, 'st', 'user')).toBe(userPath);
    expect(targetEntryPath(globalPath, 'st', 'global')).toBe(globalPath);
    expect(targetEntryPath(userPath, 'l', 'user')).toBe(userPath);
    expect(targetEntryPath(globalPath, 'l', 'global')).toBe(globalPath);
  });

  it('TT：保留作用域', () => {
    expect(targetEntryPath(userPath, 'tt', 'user')).toBe('data/default-user/extensions/foo/a.js');
    expect(targetEntryPath(globalPath, 'tt', 'global')).toBe('data/extensions/third-party/bar/a.js');
  });

  it('PT：一律 third-party（PT 无用户级扩展目录）', () => {
    expect(targetEntryPath(userPath, 'pt', 'user')).toBe('data/extensions/third-party/foo/a.js');
    expect(targetEntryPath(globalPath, 'pt', 'global')).toBe('data/extensions/third-party/bar/a.js');
  });

  it('未传作用域时按用户级（历史 hub 语义）', () => {
    expect(targetEntryPath(userPath, 'tt')).toBe('data/default-user/extensions/foo/a.js');
    expect(targetEntryPath(userPath, 'pt')).toBe('data/extensions/third-party/foo/a.js');
  });
});
