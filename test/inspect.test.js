import { describe, expect, it } from 'vitest';
import { zipIo } from '../src/core/zip-io.js';
import { INSPECT_VERDICTS, inspectPackage } from '../src/core/inspect.js';

/** 用 vendor writer 现场构造测试包，返回 Blob（不依赖任何外部文件） */
async function makeZip(entries) {
  const writer = await zipIo.createWriter();
  for (const [name, data] of entries) {
    await writer.add(name, typeof data === 'string' ? new TextEncoder().encode(data) : data);
  }
  const dest = await writer.close();
  return dest.getData(); // Blob
}

describe('inspectPackage · A/B/C/D/E 五层', () => {
  it('1. 0 字节 → empty-file', async () => {
    const r = await inspectPackage(new Blob([]));
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.EMPTY_FILE);
    expect(r.verdict.severity).toBe('fatal');
    expect(r.ok).toBe(false);
    expect(r.bytes.size).toBe(0);
  });

  it('2. 10 字节乱码 → too-small', async () => {
    const r = await inspectPackage(new Blob([new Uint8Array(10)]));
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.TOO_SMALL);
    expect(r.verdict.severity).toBe('fatal');
  });

  it('3. 100 字节非 ZIP（纯文本）→ not-zip', async () => {
    const text = 'x'.repeat(100);
    const r = await inspectPackage(new Blob([new TextEncoder().encode(text)]));
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.NOT_ZIP);
    expect(r.bytes.headHex).not.toBe('504b0304');
  });

  it('4. 合法 ZIP 截断（删掉末尾 10 字节）→ truncated', async () => {
    const blob = await makeZip([['characters/a.json', '{"name":"a"}']]);
    const full = new Uint8Array(await blob.arrayBuffer());
    const cut = full.slice(0, full.length - 10);
    const r = await inspectPackage(new Blob([cut]));
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.TRUNCATED);
    expect(r.bytes.hasEocd).toBe(false);
  });

  it('5. 正常 ST 布局包 → ok + detected=st', async () => {
    const blob = await makeZip([['characters/a.json', '{"name":"a","description":"d"}']]);
    const r = await inspectPackage(blob);
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.OK);
    expect(r.ok).toBe(true);
    expect(r.layout.detected).toBe('st');
  });

  it('6. 正常 TT 布局包 → ok + detected=tt', async () => {
    const blob = await makeZip([['data/default-user/characters/a.json', '{"name":"a"}']]);
    const r = await inspectPackage(blob);
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.OK);
    expect(r.layout.detected).toBe('tt');
  });

  it('7. 含 0 字节条目 → has-empty-entries(warn)，zeroByteCount 正确', async () => {
    const blob = await makeZip([
      ['characters/empty.json', new Uint8Array(0)],
      ['characters/a.json', '{"name":"a"}'],
    ]);
    const r = await inspectPackage(blob);
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.HAS_EMPTY_ENTRIES);
    expect(r.verdict.severity).toBe('warn');
    expect(r.entries.zeroByteCount).toBe(1);
    expect(r.entries.zeroByteSamples).toContain('characters/empty.json');
  });

  it('8. 只有 manifest 无数据 → empty-package', async () => {
    const blob = await makeZip([['manifest.json', '{"schemaVersion":1}']]);
    const r = await inspectPackage(blob);
    expect(r.verdict.code).toBe(INSPECT_VERDICTS.EMPTY_PACKAGE);
    expect(r.layout.isEmpty).toBe(true);
  });

  it('9. 含 ../evil 路径 → unsafePathCount > 0', async () => {
    const blob = await makeZip([['../evil', 'x']]);
    const r = await inspectPackage(blob);
    expect(r.entries.unsafePathCount).toBeGreaterThan(0);
  });

  it('10. Node 环境（无 DOM）可运行，返回结构完整', async () => {
    expect(typeof document).toBe('undefined');
    const blob = await makeZip([['settings.json', '{}']]);
    const r = await inspectPackage(blob, { targetLayout: 'st' });
    for (const key of ['ok', 'layer', 'bytes', 'zip', 'entries', 'layout', 'convertible', 'verdict', 'warnings']) {
      expect(r).toHaveProperty(key);
    }
    expect(typeof r.verdict.code).toBe('string');
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});
