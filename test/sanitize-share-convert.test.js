import { describe, it, expect } from 'vitest';
import { convert, TARGETS } from '../src/core/transform.js';
import { zipIo } from '../src/core/zip-io.js';
import { preUploadGuard } from '../src/core/sanitize-share.js';
import { containsPemPrivateKey } from '../src/core/credential-patterns.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function createSampleZip(filePath, entries) {
  const writer = await zipIo.createWriter(filePath);
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, Buffer.from(content));
  }
  await writer.close();
}

describe('End-to-End Sanitized Share Pipeline', () => {
  it('convert 在 sanitizeShare: true 下物理剔除角色卡，保留聊天，脱敏 settings.json 并写入水印', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sanitize-share-test-'));
    const srcZip = path.join(tmpDir, 'source.zip');
    const outZip = path.join(tmpDir, 'output.zip');

    try {
      const rawSettings = JSON.stringify({
        theme: 'Dark Lite',
        font_size: 16,
        api_key_openai: 'sk-abcdef1234567890abcdef1234567890',
        user_name: 'Alice',
        preset: {
          temperature: 0.8,
          api_key: 'sk-nested-key',
        },
      });

      await createSampleZip(srcZip, {
        'characters/alice.png': 'fake-png-binary-content',
        'chats/alice/1.jsonl': '{"name":"Alice","mes":"Hello World"}',
        'settings.json': rawSettings,
      });

      // 执行脱敏分发转换
      const report = await convert(srcZip, outZip, {
        target: TARGETS.ST,
        sanitizeShare: true,
        io: zipIo,
      });

      expect(report).toBeDefined();

      // 验证产物条目
      const reader = await zipIo.openReader(outZip);
      const entryMap = new Map();
      try {
        for await (const entry of reader.entries()) {
          const content = await entry.read();
          entryMap.set(entry.fileName, content ? new TextDecoder('utf-8').decode(content) : '');
        }
      } finally {
        await reader.close();
      }

      // 1. 角色卡必须被物理剔除
      expect(entryMap.has('characters/alice.png')).toBe(false);

      // 2. 聊天记录必须放行保留
      expect(entryMap.has('chats/alice/1.jsonl')).toBe(true);

      // 3. settings.json 必须被 AST 白名单脱敏
      expect(entryMap.has('settings.json')).toBe(true);
      const parsedSettings = JSON.parse(entryMap.get('settings.json'));
      expect(parsedSettings.theme).toBe('Dark Lite');
      expect(parsedSettings.font_size).toBe(16);
      expect(parsedSettings.api_key_openai).toBeUndefined();
      expect(parsedSettings.preset.temperature).toBe(0.8);
      expect(parsedSettings.preset.api_key).toBe('');

      // 4. 水印文件必须存在
      expect(entryMap.has('_watermark.json')).toBe(true);
      const watermark = JSON.parse(entryMap.get('_watermark.json'));
      expect(watermark.sanitized).toBe(true);
      expect(watermark.rules.characters_excluded).toBe(true);
      expect(watermark.rules.chats_included).toBe(true);

      // 5. 门禁验证：产物条目清单通过 preUploadGuard 检验
      const fileList = Array.from(entryMap.entries()).map(([p, c]) => ({ path: p, content: c }));
      const gateResult = preUploadGuard(fileList);
      expect(gateResult.ok).toBe(true);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('preUploadGuard 的 PEM 判定与共享凭证模块同源', () => {
    const pem = '-----BEGIN VENDORX PRIVATE KEY-----\nBODY\n-----END VENDORX PRIVATE KEY-----';
    expect(containsPemPrivateKey(pem)).toBe(true);
    expect(() => preUploadGuard([{ path: 'chats/talk.jsonl', content: pem }]))
      .toThrow(/发现明文 API 密钥/);
  });
});
