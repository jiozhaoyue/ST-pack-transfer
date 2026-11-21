import { describe, it, expect } from 'vitest';
import * as zip from '../src/vendor/zip.js';
import { splitArchiveEntries } from '../src/core/splitter.js';
import { zipIo } from '../src/core/zip-io.js';
import { detectLayout, LAYOUTS } from '../src/core/detect.js';

/**
 * 分卷包 target 判据回归（红队证实的硬阻塞）。
 *
 * 病根：splitter 写 split-manifest 时不含 target/source，而 detect 读的正是这两字段
 * ⇒ 自产分卷包整段判据失效，Luker 分卷包只能靠文件名/目录特征回退，常被误判为 ST。
 *
 * 测试构造用**中性条目**（misc/notes.txt、misc/extra.bin）+ **中性文件名**（part.zip）：
 * 既不命中 detect 的目录特征，也不命中文件名启发 ⇒ 无 target 时回退必得 UNKNOWN。
 * 这样「靠 manifest 判出 st/l/tt」与「回退不假成功」两件事才能被真正区分验证。
 */
function neutralEntries() {
  return [
    { path: 'misc/notes.txt', data: new TextEncoder().encode('neutral payload'.repeat(64)) },
    { path: 'misc/extra.bin', data: new Uint8Array(256) },
  ];
}

async function makeSplitBlob(target) {
  const result = await splitArchiveEntries(neutralEntries(), {
    thresholdMB: 10, // 不强制多卷；单卷同样写 manifest，足以验证判据
    target,
    handle: 'default-user',
    filenameTemplate: 'part_{part}.zip',
  });
  expect(result.parts.length).toBeGreaterThan(0);
  return result.parts[0].blob;
}

async function readSplitManifest(blob) {
  const reader = await zipIo.openReader(blob);
  try {
    for await (const entry of reader.entries()) {
      if (entry.fileName === '_convert/split-manifest.json') {
        return JSON.parse(new TextDecoder().decode(await entry.read()));
      }
      entry.skip();
    }
    return null;
  } finally {
    await reader.close();
  }
}

/** 把原包的 split-manifest 替换为给定对象，其余条目原样搬运，重建一个 zip Blob。 */
async function rebuildWithManifest(blob, manifest) {
  const reader = await zipIo.openReader(blob);
  const target = new zip.BlobWriter('application/zip');
  const writer = await zipIo.createWriter(target);
  try {
    for await (const entry of reader.entries()) {
      if (entry.fileName === '_convert/split-manifest.json') {
        await writer.add(entry.fileName, new TextEncoder().encode(JSON.stringify(manifest)));
      } else {
        await writer.add(entry.fileName, await entry.read());
      }
    }
    await writer.close();
    return await target.getData();
  } finally {
    await reader.close();
  }
}

describe('split-manifest target 判据（分卷包布局识别）', () => {
  it('① 新产 manifest 含 target 字段，值等于调用方传入的 target', async () => {
    for (const target of ['st', 'l', 'tt', 'pt']) {
      const manifest = await readSplitManifest(await makeSplitBlob(target));
      expect(manifest, `target=${target} 应有 split-manifest`).not.toBeNull();
      expect(manifest.target, `target=${target}`).toBe(target);
      // 旧字段保持存在，向后兼容不破坏
      expect(manifest.splitId).toBeTruthy();
      expect(manifest.partIndex).toBe(1);
    }
  });

  it('② 无 target 的旧包走回退路径，不因 manifest 存在而假装识别成功', async () => {
    const manifest = await readSplitManifest(await makeSplitBlob('l'));
    expect(manifest.target).toBe('l');
    delete manifest.target; // 模拟旧包：无 target，也无 source
    const oldBlob = await rebuildWithManifest(await makeSplitBlob('l'), manifest);

    const oldManifest = await readSplitManifest(oldBlob);
    expect(oldManifest.target).toBeUndefined();

    const result = await detectLayout(oldBlob, { filename: 'part.zip' });
    expect(result.layout).toBe(LAYOUTS.UNKNOWN);
    expect(result.evidence).toMatch(/no recognizable layout marker/);
  });

  it('③ 含 target 的新包靠 manifest 正确识别布局（st / l / tt）', async () => {
    const cases = [
      ['st', LAYOUTS.ST],
      ['l', LAYOUTS.L],
      ['tt', LAYOUTS.TT],
    ];
    for (const [target, expected] of cases) {
      const result = await detectLayout(await makeSplitBlob(target), { filename: 'part.zip' });
      expect(result.layout, `target=${target}`).toBe(expected);
      expect(result.evidence, `target=${target} 应命中 split-manifest 判据`).toMatch(/split-manifest/);
    }
  });

  it('④ target=pt 无法映射时不假装识别成功，落到既有回退路径', async () => {
    const result = await detectLayout(await makeSplitBlob('pt'), { filename: 'part.zip' });
    expect(result.layout).toBe(LAYOUTS.UNKNOWN);
  });

  it('兼容：旧包以 source 标记平台时仍能识别（target 缺失回退 source）', async () => {
    const manifest = await readSplitManifest(await makeSplitBlob('st'));
    delete manifest.target;
    manifest.source = 'luker';
    const oldBlob = await rebuildWithManifest(await makeSplitBlob('st'), manifest);
    const result = await detectLayout(oldBlob, { filename: 'part.zip' });
    expect(result.layout).toBe(LAYOUTS.L);
  });
});
