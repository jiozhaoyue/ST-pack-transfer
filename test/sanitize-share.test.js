import { describe, it, expect } from 'vitest';
import {
  sanitizeSettingsJson,
  shouldDropForSanitizedShare,
  generateWatermarkData,
  preUploadGuard,
  classifySanitizedSharePath,
  buildSanitizeExclusionList,
  SETTINGS_SAFE_WHITE_LIST,
  SHARE_DROP_REASON,
} from '../src/core/sanitize-share.js';

describe('Sanitized Share & Pre-upload Guard Core Suite', () => {
  describe('sanitizeSettingsJson · AST 树形白名单脱敏', () => {
    it('保留白名单配置项，清空所有敏感键，且字符串过 redact 管道', () => {
      const rawSettings = JSON.stringify({
        theme: 'Dark Lite',
        font_size: 14,
        waifuMode: true,
        api_key_openai: 'sk-1234567890abcdef1234567890abcdef',
        secret_token: 'my_super_secret',
        endpoint: 'https://user:pass@api.openai.com/v1',
        custom_url: 'https://reverse.proxy.com',
        user_name: 'JohnDoe',
        preset: {
          temperature: 0.7,
          api_key: 'sk-nested-key-should-be-emptied',
          author_note: 'Call me at /Users/JohnDoe/Desktop/notes.txt',
        },
        unknown_untrusted_plugin_config: {
          suspicious: true,
        },
      });

      const sanitized = sanitizeSettingsJson(rawSettings);
      const parsed = JSON.parse(sanitized);

      // 1. 白名单项保留
      expect(parsed.theme).toBe('Dark Lite');
      expect(parsed.font_size).toBe(14);
      expect(parsed.waifuMode).toBe(true);

      // 2. 未在白名单上的配置项物理丢弃
      expect(parsed.unknown_untrusted_plugin_config).toBeUndefined();

      // 3. 敏感根键未进入白名单（即物理不存在）
      expect(parsed.api_key_openai).toBeUndefined();
      expect(parsed.secret_token).toBeUndefined();
      expect(parsed.endpoint).toBeUndefined();
      expect(parsed.user_name).toBeUndefined();

      // 4. 白名单内的复杂对象（如 preset）中的敏感子键被递归置空
      expect(parsed.preset.temperature).toBe(0.7);
      expect(parsed.preset.api_key).toBe('');

      // 5. 字符串内容过 redact()：绝对路径被抹除为 /[USER]/
      expect(parsed.preset.author_note).not.toContain('/Users/JohnDoe/');
      expect(parsed.preset.author_note).toContain('/[USER]/');
    });

    it('非法或空文本输入时安全返回空对象字符串，绝不抛崩', () => {
      expect(sanitizeSettingsJson('')).toBe('{}');
      expect(sanitizeSettingsJson(null)).toBe('{}');
      expect(sanitizeSettingsJson('not-valid-json')).toBe('{}');
      expect(sanitizeSettingsJson('[]')).toBe('{}');
    });
  });

  describe('shouldDropForSanitizedShare · 角色卡与聊天记录放行判定', () => {
    it('绝对剔除角色卡（无论 PNG 还是 JSON 格式）', () => {
      expect(shouldDropForSanitizedShare('characters/eva.png')).toEqual({
        drop: true,
        reason: 'character-excluded-for-share',
      });
      expect(shouldDropForSanitizedShare('data/default-user/characters/hero.json')).toEqual({
        drop: true,
        reason: 'character-excluded-for-share',
      });
    });

    it('绝对剔除凭据与秘密文件', () => {
      expect(shouldDropForSanitizedShare('.env')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
      expect(shouldDropForSanitizedShare('config/credentials.json')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
      expect(shouldDropForSanitizedShare('data/secrets.json')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
    });

    it('允许放行聊天记录（chats/*.jsonl）', () => {
      expect(shouldDropForSanitizedShare('chats/eva/chat-2026.jsonl')).toEqual({
        drop: false,
      });
      expect(shouldDropForSanitizedShare('data/default-user/chats/log.jsonl')).toEqual({
        drop: false,
      });
    });

    it('常规安全条目放行', () => {
      expect(shouldDropForSanitizedShare('settings.json')).toEqual({ drop: false });
      expect(shouldDropForSanitizedShare('themes/dark.css')).toEqual({ drop: false });
    });

    it('根级 secrets/* 目录必须被拦截（secrets/auth.json）', () => {
      expect(shouldDropForSanitizedShare('secrets/auth.json')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
      expect(shouldDropForSanitizedShare('secrets/')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
      expect(shouldDropForSanitizedShare('secrets\\auth.json')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
    });

    it('根级 .env.* 文件必须被拦截（.env.local / .env.production）', () => {
      for (const name of ['.env.local', '.env.production', '.env.development.local']) {
        expect(shouldDropForSanitizedShare(name)).toEqual({
          drop: true,
          reason: 'credential-file-excluded',
        });
      }
      // 任意深度的 .env 族同样拦截
      expect(shouldDropForSanitizedShare('data/.env.local')).toEqual({
        drop: true,
        reason: 'credential-file-excluded',
      });
    });

    it('构建工具真实加载的 x.env.local / app.env.production 必须被拦截', () => {
      for (const name of ['x.env.local', 'app.env.production', 'my.env.local']) {
        expect(shouldDropForSanitizedShare(name)).toEqual({
          drop: true,
          reason: 'credential-file-excluded',
        });
      }
    });

    it('近似名不得误判（.env 后必须接 "." + 后缀或结束；仅前缀相似者放行）', () => {
      expect(shouldDropForSanitizedShare('secretsX/auth.json')).toEqual({ drop: false });
      // .environment.md / .env-example 仅前缀相似，非 .env 族，放行
      expect(shouldDropForSanitizedShare('docs/environment.md')).toEqual({ drop: false });
      expect(shouldDropForSanitizedShare('docs/.environment.md')).toEqual({ drop: false });
      expect(shouldDropForSanitizedShare('cfg/.env-example')).toEqual({ drop: false });
    });

    it('非字符串输入安全放行，不抛异常', () => {
      expect(shouldDropForSanitizedShare(null)).toEqual({ drop: false });
      expect(shouldDropForSanitizedShare(undefined)).toEqual({ drop: false });
      expect(shouldDropForSanitizedShare(123)).toEqual({ drop: false });
    });
  });

  describe('generateWatermarkData · 水印结构验证', () => {
    it('产出符合规范的水印元数据', () => {
      const wm = generateWatermarkData('st');
      expect(wm.schema_version).toBe(1);
      expect(wm.kind).toBe('sanitized_share_watermark');
      expect(wm.generator).toBe('ST-pack-transfer');
      expect(wm.sanitized).toBe(true);
      expect(wm.rules.characters_excluded).toBe(true);
      expect(wm.rules.chats_included).toBe(true);
      expect(wm.source_layout).toBe('st');
      expect(typeof wm.timestamp).toBe('string');
    });
  });

  describe('preUploadGuard · 本地上传强门禁阻断', () => {
    it('待上传条目包含角色卡时：抛出明确异常并硬阻断', () => {
      const entries = [
        { path: 'chats/talk.jsonl' },
        { path: 'characters/eva.png' },
      ];
      expect(() => preUploadGuard(entries)).toThrow(/发现角色卡条目/);
    });

    it('待上传条目包含未脱敏凭据文件时：抛出明确异常并硬阻断', () => {
      const entries = [
        { path: 'chats/talk.jsonl' },
        { path: '.env' },
      ];
      expect(() => preUploadGuard(entries)).toThrow(/发现凭据文件/);
    });

    it('待上传条目内容中包含明文 sk- 密钥时：抛出明确异常并硬阻断', () => {
      const entries = [
        { path: 'chats/talk.jsonl', content: 'hello world sk-123456789012345678901234567890' },
      ];
      expect(() => preUploadGuard(entries)).toThrow(/发现明文 API 密钥/);
    });

    // 令牌样例用拼接构造，避免 GitHub Push Protection 误判为真实令牌（同 logger.test.js 约定）
    const tok = (...parts) => parts.join('');

    it('内容扫描复用 logger.redact：AWS/Slack/GitLab/GitHub/Bearer/DB URL 六类必须被阻断', () => {
      const samples = [
        ['AWS AKIA', tok('AKIA', 'ABCDEFGHIJKLMNOP')],
        ['Slack xoxb', tok('xoxb-', '123-abc')],
        ['GitLab glpat', tok('glpat-', 'AbCd')],
        ['GitHub gho', tok('gho_', 'abcdefghijklmnop')],
        ['Bearer', tok('Bearer abcde', 'fghijklmnop')],
        ['DB URL', 'postgres://u:p@db/x'],
      ];
      for (const [label, secret] of samples) {
        expect(() => preUploadGuard([{ path: 'chats/talk.jsonl', content: `leak: ${secret}` }]), label)
          .toThrow(/发现明文 API 密钥/);
      }
    });

    it('内容扫描补齐 PEM 私钥头检测：OPENSSH/RSA PRIVATE KEY 必须被阻断', () => {
      for (const header of [
        '-----BEGIN OPENSSH PRIVATE KEY-----',
        '-----BEGIN RSA PRIVATE KEY-----',
        '-----BEGIN PRIVATE KEY-----',
      ]) {
        expect(() => preUploadGuard([{ path: 'chats/talk.jsonl', content: header }]))
          .toThrow(/发现明文 API 密钥/);
      }
    });

    it('x.env.local / app.env.production 必须被 preUploadGuard 与 shouldDropForSanitizedShare 双双拦截', () => {
      for (const name of ['x.env.local', 'app.env.production']) {
        // 判据侧
        expect(shouldDropForSanitizedShare(name)).toEqual({
          drop: true,
          reason: 'credential-file-excluded',
        });
        // 门禁侧
        expect(() => preUploadGuard([{ path: name }])).toThrow(/发现凭据文件/);
      }
    });

    it('合法脱敏包（聊天记录 + 洁净配置）：通过门禁放行', () => {
      const entries = [
        { path: 'chats/talk.jsonl', content: 'User: Hello\nChar: Hi there' },
        { path: 'settings.json', content: JSON.stringify({ theme: 'Dark Lite' }) },
        { path: '_watermark.json', content: JSON.stringify(generateWatermarkData('st')) },
      ];
      const result = preUploadGuard(entries);
      expect(result.ok).toBe(true);
      expect(result.reason).toBe('passed-sanitized-gate');
    });

    it('无水印文件时仍硬阻断：根级 secrets/* 与根级 .env.*（铁律 43）', () => {
      // 条目不包含任何 _watermark.json；门禁只做纯内容级判定
      expect(() => preUploadGuard([{ path: 'secrets/auth.json' }])).toThrow(/发现凭据文件/);
      expect(() => preUploadGuard([{ path: '.env.local' }])).toThrow(/发现凭据文件/);
      expect(() => preUploadGuard([{ path: '.env.production' }])).toThrow(/发现凭据文件/);
      expect(() => preUploadGuard([
        { path: 'chats/talk.jsonl', content: 'safe' },
        { path: 'secrets/auth.json' },
      ])).toThrow(/发现凭据文件/);
    });

    it('未通过水印也照样通过洁净包：水印不参与判定（铁律 43 反向）', () => {
      const entries = [
        { path: 'chats/talk.jsonl', content: 'User: Hello' },
        { path: 'settings.json', content: '{}' },
      ];
      expect(preUploadGuard(entries).ok).toBe(true);
    });

    it('不可判定条目必须 fail-closed 硬阻断，绝不静默放行', () => {
      expect(() => preUploadGuard([null])).toThrow(/第 0 个条目无法判定/);
      expect(() => preUploadGuard([undefined])).toThrow(/第 0 个条目无法判定/);
      expect(() => preUploadGuard(['secrets/auth.json'])).toThrow(/第 0 个条目无法判定/);
      expect(() => preUploadGuard([{}])).toThrow(/缺少有效路径/);
      expect(() => preUploadGuard([{ path: null }])).toThrow(/缺少有效路径/);
      expect(() => preUploadGuard([{ path: 123 }])).toThrow(/缺少有效路径/);
      expect(() => preUploadGuard([{ path: '   ' }])).toThrow(/缺少有效路径/);
    });

    it('非数组入参抛出列表无效异常，不静默放行', () => {
      expect(() => preUploadGuard(null)).toThrow(/待检测条目列表无效/);
      expect(() => preUploadGuard('x')).toThrow(/待检测条目列表无效/);
      expect(() => preUploadGuard({})).toThrow(/待检测条目列表无效/);
    });

    it('与 shouldDropForSanitizedShare 判定严格对称（同一输入结论一致）', () => {
      const corpus = [
        'secrets/auth.json',
        'secrets/',
        'data/default-user/secrets/auth.json',
        '.env',
        '.env.local',
        '.env.production',
        'data/.env.local',
        'config/credentials.json',
        'data/secrets.json',
        'characters/eva.png',
        'data/default-user/characters/hero.json',
        'chats/eva/1.jsonl',
        'data/default-user/chats/log.jsonl',
        'settings.json',
        'themes/dark.css',
        'secretsX/auth.json',
        'my.env.local',
        './.env.local',
        'secrets\\auth.json',
        'CHARACTERS/EVA.PNG',
      ];

      for (const path of corpus) {
        const declared = shouldDropForSanitizedShare(path);
        let guardBlocked = false;
        let guardReason = '';
        try {
          preUploadGuard([{ path }]);
        } catch (error) {
          guardBlocked = true;
          guardReason = /发现角色卡条目/.test(error.message)
            ? SHARE_DROP_REASON.CHARACTER
            : SHARE_DROP_REASON.CREDENTIAL;
        }
        // 结论一致：判据说排除 ⇔ 门禁必须阻断
        expect({ path, drop: declared.drop }).toEqual({ path, drop: guardBlocked });
        // 原因一致：同一输入给出同一原因码
        if (declared.drop) expect({ path, reason: declared.reason }).toEqual({ path, reason: guardReason });
      }
    });

    it('两条路径（含 shared 判据）对同一语料结论一致', () => {
      for (const path of ['secrets/auth.json', '.env.local', 'chats/a.jsonl', 'settings.json', 'characters/x.png']) {
        expect(shouldDropForSanitizedShare(path)).toEqual(classifySanitizedSharePath(path));
      }
    });
  });

  describe('buildSanitizeExclusionList · 结构化排除清单（铁律 42）', () => {
    it('产出逐项排除清单、原因码计数与不可判定项，绝不静默丢弃', () => {
      const report = buildSanitizeExclusionList([
        { path: 'characters/eva.png' },
        { path: 'characters/hero.json' },
        { path: 'secrets/auth.json' },
        { path: '.env.local' },
        { path: 'chats/eva/1.jsonl' },
        { path: 'settings.json' },
        null,
        { path: 123 },
        {},
      ]);

      expect(report.total).toBe(4);
      expect(report.byReason[SHARE_DROP_REASON.CHARACTER]).toBe(2);
      expect(report.byReason[SHARE_DROP_REASON.CREDENTIAL]).toBe(2);

      expect(report.items).toEqual([
        { path: 'characters/eva.png', reason: SHARE_DROP_REASON.CHARACTER },
        { path: 'characters/hero.json', reason: SHARE_DROP_REASON.CHARACTER },
        { path: 'secrets/auth.json', reason: SHARE_DROP_REASON.CREDENTIAL },
        { path: '.env.local', reason: SHARE_DROP_REASON.CREDENTIAL },
      ]);

      // 不可判定条目单独成列，不混进排除项、也不被吞掉
      expect(report.invalidEntries).toHaveLength(3);
      expect(report.invalidEntries.map((row) => row.index)).toEqual([6, 7, 8]);
    });

    it('非数组入参返回空清单结构，不抛异常', () => {
      expect(buildSanitizeExclusionList(null)).toEqual({
        total: 0,
        byReason: {},
        items: [],
        invalidEntries: [],
      });
    });
  });
});
