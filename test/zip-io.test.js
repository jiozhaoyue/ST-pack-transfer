import { describe, it, expect } from 'vitest';
import * as zip from '../src/vendor/zip.js';
import { zipIo } from '../src/core/zip-io.js';

/**
 * zip-io 写入器专项（2026-11-18 新增，首个 zip-io 专项测试文件）。
 *
 * 背景：分卷阈值同源修复（F-01）引入「BlobWriter 计数包装」——
 * `getWritten()` 是 splitter 预算制判定的数据源，必须与最终 `blob.size` 精确锁步。
 * 这里把锁步关系、单调性、形态降级钉成契约。
 */
describe('zip-io createWriter 计数包装（getWritten 同源契约）', () => {
  it('BlobWriter 形态：close() 后 getWritten() === blob.size（精确相等）', async () => {
    const target = new zip.BlobWriter('application/zip');
    const w = await zipIo.createWriter(target, { level: 5 });
    expect(w.getWritten()).toBe(0);
    await w.add('a.txt', new TextEncoder().encode('hello world '.repeat(100)));
    await w.add('b.bin', new Uint8Array(64 * 1024).fill(7));
    await w.add('c.jpg', new Uint8Array(16 * 1024).fill(3));
    const dest = await w.close();
    const blob = await target.getData();
    expect(w.getWritten()).toBe(blob.size);
    expect(dest).toBe(target);
  });

  it('getWritten() 在条目间单调不减，且 close 前不含中央目录（< blob.size）', async () => {
    const target = new zip.BlobWriter('application/zip');
    const w = await zipIo.createWriter(target, { level: 5 });
    const marks = [];
    await w.add('x.json', new TextEncoder().encode('{"a":1}'));
    marks.push(w.getWritten());
    await w.add('y.bin', new Uint8Array(8 * 1024).fill(1));
    marks.push(w.getWritten());
    await w.add('z.txt', new TextEncoder().encode('tail'));
    marks.push(w.getWritten());
    expect(marks[0]).toBeGreaterThan(0);
    expect(marks[1]).toBeGreaterThanOrEqual(marks[0]);
    expect(marks[2]).toBeGreaterThanOrEqual(marks[1]);
    await w.close();
    const blob = await target.getData(); // getData 必须在 close 之后（BlobWriter 等收口）
    expect(marks[2]).toBeLessThan(blob.size); // close 前无中央目录
    expect(blob.size - marks[2]).toBeGreaterThan(0);
  });

  it('addLazy 流式条目同样计入 getWritten()（直通零拷贝路径）', async () => {
    const target = new zip.BlobWriter('application/zip');
    const w = await zipIo.createWriter(target, { level: 5 });
    await w.addLazy('big.bin', (cb) => {
      cb(null, new Blob([new Uint8Array(32 * 1024).fill(9)]).stream());
    }, 32 * 1024);
    await w.close();
    const blob = await target.getData();
    expect(w.getWritten()).toBe(blob.size);
  });

  it('文件路径形态：不包装 ⇒ getWritten() === -1（防御性降级，splitter 回退旧估算）', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zipio-test-'));
    const filePath = path.join(dir, 'out.zip');
    const w = await zipIo.createWriter(filePath);
    expect(w.getWritten()).toBe(-1);
    await w.add('x.json', new TextEncoder().encode('{"ok":true}'));
    expect(w.getWritten()).toBe(-1);
    const ret = await w.close();
    expect(ret).toBe(filePath);
  });
});
