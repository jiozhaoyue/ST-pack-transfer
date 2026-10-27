import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map();
vi.stubGlobal('localStorage', {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: (key) => { memory.delete(key); },
});

const {
  loadPrivateFiles,
  savePrivateFiles,
  addPrivateFile,
  removePrivateFile,
} = await import('../src/ui/private-files-store.js');

describe('user/files 上传登记表', () => {
  beforeEach(() => memory.clear());

  it('空表与坏数据都回退为空数组', () => {
    expect(loadPrivateFiles()).toEqual([]);
    memory.set('st-pack-transfer:user-files', '{not-json');
    expect(loadPrivateFiles()).toEqual([]);
    memory.set('st-pack-transfer:user-files', '{"a":1}');
    expect(loadPrivateFiles()).toEqual([]);
  });

  it('新增即置顶，同一路径视为覆盖', () => {
    addPrivateFile({ name: 'a.zip', path: '/user/files/a.zip', uploadedAt: 1, sizeBytes: 10 });
    addPrivateFile({ name: 'b.zip', path: '/user/files/b.zip', uploadedAt: 2, sizeBytes: 20 });
    let list = loadPrivateFiles();
    expect(list.map((entry) => entry.name)).toEqual(['b.zip', 'a.zip']);

    addPrivateFile({ name: 'a2.zip', path: '/user/files/a.zip', uploadedAt: 3, sizeBytes: 30 });
    list = loadPrivateFiles();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ name: 'a2.zip', uploadedAt: 3 });
  });

  it('删除只移除指定路径', () => {
    addPrivateFile({ name: 'a.zip', path: '/user/files/a.zip' });
    addPrivateFile({ name: 'b.zip', path: '/user/files/b.zip' });
    const left = removePrivateFile('/user/files/a.zip');
    expect(left.map((entry) => entry.name)).toEqual(['b.zip']);
  });

  it('缺少 path 的记录被丢弃', () => {
    savePrivateFiles([{ name: 'x' }, null, { name: 'ok.zip', path: '/user/files/ok.zip' }]);
    expect(loadPrivateFiles()).toHaveLength(1);
  });
});
