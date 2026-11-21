/**
 * 零覆盖模块补测 · opfs-files（src/storage/opfs-files.js）
 *
 * 依据：docs/HANDOFF-2026-11-21-quality-pass.md:85 列为「零测试模块」次之项。
 * 本模块是 Web API 薄封装，用内存版 FileSystemDirectoryHandle mock 覆盖：
 *   ① supportsOpfs 特性检测（有/无 getDirectory，以及抛异常的极端情形）；
 *   ② 目录/文件句柄的打开（含 create=false 不自动创建）；
 *   ③ 读文件、删条目、清空目录，以及环境不支持/不存在时的安全降级（返回 null / 静默）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  supportsOpfs,
  opfsDirectory,
  opfsFileHandle,
  opfsReadFile,
  opfsRemove,
  opfsClearDir,
} from '../src/storage/opfs-files.js';

/** 内存版 OPFS：目录名 → Map(文件名 → { content, type }) */
function installOpfsMock({ throwGetDirectory = false } = {}) {
  const dirs = new Map();
  const root = {
    async getDirectoryHandle(name, { create = true } = {}) {
      if (!dirs.has(name)) {
        if (!create) throw new DOMException('not found', 'NotFoundError');
        dirs.set(name, new Map());
      }
      return makeDir(dirs.get(name));
    },
  };
  const nav = {
    storage: {
      getDirectory: throwGetDirectory
        ? async () => { throw new Error('storage blocked'); }
        : async () => root,
    },
  };
  vi.stubGlobal('navigator', nav);
  return { dirs, root, nav };
}

/** 把 Map 包装成 FileSystemDirectoryHandle 形状 */
function makeDir(files) {
  return {
    files,
    async getFileHandle(name, { create = true } = {}) {
      if (!files.has(name)) {
        if (!create) throw new DOMException('not found', 'NotFoundError');
        files.set(name, { content: '', type: '' });
      }
      return makeFile(name, files);
    },
    async removeEntry(name) {
      if (!files.has(name)) throw new DOMException('not found', 'NotFoundError');
      files.delete(name);
    },
    async *entries() {
      for (const key of [...files.keys()]) yield [key, { kind: 'file' }];
    },
  };
}

/** 把 Map 项包装成 FileSystemFileHandle 形状 */
function makeFile(name, files) {
  return {
    name,
    async getFile() {
      const rec = files.get(name);
      if (!rec) throw new DOMException('not found', 'NotFoundError');
      return { name, content: rec.content, type: rec.type, size: rec.content.length };
    },
    async createWritable() {
      return {
        write: async () => {},
        close: async () => {},
      };
    },
  };
}

describe('opfs-files · 特性检测', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('① 有 navigator.storage.getDirectory ⇒ true', () => {
    installOpfsMock();
    expect(supportsOpfs()).toBe(true);
  });

  it('① 无 storage / 无 getDirectory ⇒ false', () => {
    vi.stubGlobal('navigator', {});
    expect(supportsOpfs()).toBe(false);
    vi.stubGlobal('navigator', { storage: {} });
    expect(supportsOpfs()).toBe(false);
  });

  it('① getDirectory 属性读取抛异常 ⇒ false（不向外抛）', () => {
    vi.stubGlobal('navigator', {
      get storage() { throw new Error('blocked'); },
    });
    expect(supportsOpfs()).toBe(false);
  });
});

describe('opfs-files · 目录与文件句柄', () => {
  let env;

  beforeEach(() => { env = installOpfsMock(); });
  afterEach(() => vi.unstubAllGlobals());

  it('② opfsDirectory 打开（默认 create=true）并缓存目录', async () => {
    const dir = await opfsDirectory('cache');
    expect(dir).not.toBeNull();
    expect(env.dirs.has('cache')).toBe(true);
    expect(typeof dir.getFileHandle).toBe('function');
  });

  it('② create=false 且目录不存在 ⇒ null（不自动创建）', async () => {
    expect(await opfsDirectory('missing', false)).toBeNull();
    expect(env.dirs.has('missing')).toBe(false);
  });

  it('② 环境不支持 OPFS 时一律返回 null', async () => {
    vi.stubGlobal('navigator', {});
    expect(await opfsDirectory('cache')).toBeNull();
    expect(await opfsFileHandle('cache', 'a')).toBeNull();
  });

  it('② opfsFileHandle 取句柄；create=false 且不存在 ⇒ null', async () => {
    const h = await opfsFileHandle('cache', 'a.txt');
    expect(h?.name).toBe('a.txt');
    expect(await opfsFileHandle('cache', 'nope.txt', false)).toBeNull();
  });
});

describe('opfs-files · 读写与清理', () => {
  let env;

  beforeEach(() => {
    env = installOpfsMock();
    // 预置三个文件供读/删/清空使用
    for (const [name, content] of [['a.txt', 'A'], ['b.txt', 'B'], ['c.txt', 'C']]) {
      env.dirs.set('data', env.dirs.get('data') || new Map());
      env.dirs.get('data').set(name, { content, type: 'text/plain' });
    }
  });
  afterEach(() => vi.unstubAllGlobals());

  it('③ opfsReadFile 返回 File 内容；不存在返回 null', async () => {
    const file = await opfsReadFile('data', 'a.txt');
    expect(file?.content).toBe('A');
    expect(file?.type).toBe('text/plain');
    expect(await opfsReadFile('data', 'nope.txt')).toBeNull();
  });

  it('③ opfsRemove 删除指定条目；删不存在的条目静默', async () => {
    await opfsRemove('data', 'a.txt');
    expect(env.dirs.get('data').has('a.txt')).toBe(false);
    await expect(opfsRemove('data', 'a.txt')).resolves.toBeUndefined();
  });

  it('③ opfsClearDir 清空全部条目但保留目录本身', async () => {
    await opfsClearDir('data');
    expect(env.dirs.get('data').size).toBe(0);
    expect(env.dirs.has('data')).toBe(true);
  });

  it('③ 目录不存在时 remove/clear 静默返回（不抛错）', async () => {
    await expect(opfsRemove('nope', 'a.txt')).resolves.toBeUndefined();
    await expect(opfsClearDir('nope')).resolves.toBeUndefined();
  });

  it('③ getDirectory 抛异常时全部操作安全降级', async () => {
    vi.stubGlobal('navigator', {
      storage: { getDirectory: async () => { throw new Error('blocked'); } },
    });
    expect(await opfsReadFile('data', 'a.txt')).toBeNull();
    await expect(opfsRemove('data', 'a.txt')).resolves.toBeUndefined();
    await expect(opfsClearDir('data')).resolves.toBeUndefined();
  });
});
