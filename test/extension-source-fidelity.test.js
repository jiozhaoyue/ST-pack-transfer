// 扩展字节保真与清洗豁免回归用例（折中 A+B，2026-11-20）。
// 用合成 zip 固化 transform.js 的两条修复契约：
//  A. extension-pkg 路径下 .git/** 与 node_modules/** 不再命中 isJunkOrDevFile 清洗，
//     .git 去留整体交还 gitMode（KEEP 全留 / MINIMAL 最小集 / STRIP 全去）。
//  B. extension-source JSON 保留原始字节，4 空格缩进往返后字节不变。
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import {
  convert,
  TARGETS,
  GIT_MODES,
  isJunkOrDevFile,
} from '../src/core/transform.js';

vi.setConfig({ testTimeout: 30_000 });

const TMP = [];
async function tmp() {
  const d = await mkdtemp(path.join(os.tmpdir(), 'ext-fidelity-'));
  TMP.push(d);
  return d;
}

async function writeZip(entries) {
  const d = await tmp();
  const p = path.join(d, 'in.zip');
  const w = await zipIo.createWriter(p);
  for (const [name, data] of entries) await w.add(name, data);
  await w.close();
  return p;
}

async function readZip(p) {
  const r = await zipIo.openReader(p);
  const m = new Map();
  for await (const e of r.entries()) m.set(e.fileName, Buffer.from(await e.read()));
  await r.close();
  return m;
}

async function roundtrip(entries, firstTarget, secondTarget, secondOptions = {}) {
  const d = await tmp();
  const src = await writeZip(entries);
  const mid = path.join(d, 'mid.zip');
  const back = path.join(d, 'back.zip');
  await convert(src, mid, { target: firstTarget, io: zipIo });
  await convert(mid, back, { target: secondTarget, io: zipIo, ...secondOptions });
  return readZip(back);
}

const MANIFEST = Buffer.from(JSON.stringify({ display_name: 'Fidelity Ext', version: '1.0.0' }));
const CONFIG = Buffer.from('[core]\n\trepositoryformatversion = 0\n');
const NODE_LOG = Buffer.from('// runtime dependency shipped with extension\n');

describe('A：扩展包清洗豁免（.git/**、node_modules/**）', () => {
  it('a. 源中 extensions/x/.git/config 与 extensions/x/node_modules/** 往返后 CRC 一致', async () => {
    const entries = [
      ['extensions/fid-ext/manifest.json', MANIFEST],
      ['extensions/fid-ext/index.js', Buffer.from('export const x = 1;\n')],
      ['extensions/fid-ext/.git/config', CONFIG],
      ['extensions/fid-ext/src/iframe/node_modules/log.js', NODE_LOG],
    ];
    const files = await roundtrip(entries, TARGETS.L, TARGETS.ST);
    // 条目存在且字节不变（字节相等 ⇒ CRC 相等）
    expect(files.has('extensions/fid-ext/.git/config')).toBe(true);
    expect(Buffer.compare(files.get('extensions/fid-ext/.git/config'), CONFIG)).toBe(0);
    expect(files.has('extensions/fid-ext/src/iframe/node_modules/log.js')).toBe(true);
    expect(Buffer.compare(files.get('extensions/fid-ext/src/iframe/node_modules/log.js'), NODE_LOG)).toBe(0);
  });

  it('c. gitMode=KEEP 语境下 extensions/x/.git/hooks/pre-commit.sample 不被丢弃', async () => {
    const hook = Buffer.from('#!/bin/sh\nexit 0\n');
    // 纯函数层：显式扩展路径 + KEEP 语义（git 运行时规则豁免）
    expect(isJunkOrDevFile('extensions/fid-ext/.git/hooks/pre-commit.sample', { isExtensionPkg: true })).toBe(false);
    // 端到端：默认 gitMode=KEEP 下 hooks 文件真正写进产物
    const files = await roundtrip(
      [
        ['extensions/fid-ext/manifest.json', MANIFEST],
        ['extensions/fid-ext/index.js', Buffer.from('export const x = 1;\n')],
        ['extensions/fid-ext/.git/hooks/pre-commit.sample', hook],
      ],
      TARGETS.L,
      TARGETS.ST,
    );
    expect(files.has('extensions/fid-ext/.git/hooks/pre-commit.sample')).toBe(true);
    expect(Buffer.compare(files.get('extensions/fid-ext/.git/hooks/pre-commit.sample'), hook)).toBe(0);
  });

  it('STRIP 下扩展 .git 条目仍按 gitMode 全去（交还策略门）', async () => {
    const files = await roundtrip(
      [
        ['extensions/fid-ext/manifest.json', MANIFEST],
        ['extensions/fid-ext/index.js', Buffer.from('export const x = 1;\n')],
        ['extensions/fid-ext/.git/hooks/pre-commit.sample', Buffer.from('#!/bin/sh\n')],
        ['extensions/fid-ext/.git/config', CONFIG],
      ],
      TARGETS.L,
      TARGETS.ST,
      { gitMode: GIT_MODES.STRIP },
    );
    const gitPaths = [...files.keys()].filter((p) => p.includes('/.git/'));
    expect(gitPaths).toEqual([]);
  });

  it('d. 默认清洗路径仍有断言：扩展下 tsconfig/vite.config/.map/test 仍被清洗', async () => {
    // isJunkOrDevFile 对扩展路径的其余规则保持不变（设计内清洗）
    expect(isJunkOrDevFile('extensions/fid-ext/tsconfig.json', { isExtensionPkg: true })).toBe(true);
    expect(isJunkOrDevFile('extensions/fid-ext/vite.config.ts', { isExtensionPkg: true })).toBe(true);
    expect(isJunkOrDevFile('extensions/fid-ext/babel.config.json', { isExtensionPkg: true })).toBe(true);
    expect(isJunkOrDevFile('extensions/fid-ext/dist/index.js.map', { isExtensionPkg: true })).toBe(true);
    expect(isJunkOrDevFile('extensions/fid-ext/tests/unit.spec.js', { isExtensionPkg: true })).toBe(true);
    // 端到端：这些条目确实不出现在产物里
    const files = await roundtrip(
      [
        ['extensions/fid-ext/manifest.json', MANIFEST],
        ['extensions/fid-ext/index.js', Buffer.from('export const x = 1;\n')],
        ['extensions/fid-ext/tsconfig.json', Buffer.from('{}')],
        ['extensions/fid-ext/dist/index.js.map', Buffer.from('{}')],
      ],
      TARGETS.L,
      TARGETS.ST,
    );
    expect(files.has('extensions/fid-ext/tsconfig.json')).toBe(false);
    expect(files.has('extensions/fid-ext/dist/index.js.map')).toBe(false);
  });
});

describe('B：extension-source 字节保真', () => {
  it('b. 4 空格缩进的 extension-source JSON 往返后字节不变', async () => {
    // TT 源里 extension-source 记录用 4 空格缩进；parseJsonSafe→encodeJson 曾重序列化为 2 空格。
    const record4 = '{\n    "remote_url": "https://github.com/example/fid-ext",\n    "reference": "main",\n    "installed_commit": "0123456789abcdef0123456789abcdef01234567"\n}';
    const sourceName = 'data/_tauritavern/extension-sources/global/fid-ext.json';
    const entries = [
      ['data/default-user/extensions/fid-ext/manifest.json', MANIFEST],
      ['data/default-user/extensions/fid-ext/index.js', Buffer.from('export const x = 1;\n')],
      [sourceName, Buffer.from(record4, 'utf8')],
    ];
    const files = await roundtrip(entries, TARGETS.PT, TARGETS.TT);
    // 回带后仍在 extension-sources 路径下，且字节与源 4 空格版本完全一致
    const out = files.get(sourceName);
    expect(out, `${sourceName} 应存在`).toBeTruthy();
    expect(out.toString('utf8')).toBe(record4);
    expect(Buffer.compare(out, Buffer.from(record4, 'utf8'))).toBe(0);
  });
});
