import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, LOG_LEVELS, redact, scrubDetailKeys } from '../src/core/logger.js';
import { PEM_PRIVATE_KEY, PEM_PRIVATE_KEY_GLOBAL, containsPemPrivateKey } from '../src/core/credential-patterns.js';

describe('Logger Core System', () => {
  beforeEach(() => {
    logger.clear();
  });

  it('records logs with levels and timestamps', () => {
    logger.info('Test info message');
    logger.warn('Test warn message');
    logger.error('Test error message', { code: 500 });
    logger.success('Test success message');

    const entries = logger.getEntries();
    expect(entries.length).toBe(4);
    expect(entries[0].level).toBe(LOG_LEVELS.INFO);
    expect(entries[0].message).toBe('Test info message');
    expect(entries[2].level).toBe(LOG_LEVELS.ERROR);
    expect(entries[2].detail).toEqual({ code: 500 });

    const stats = logger.getStats();
    expect(stats.total).toBe(4);
    expect(stats.info).toBe(1);
    expect(stats.warn).toBe(1);
    expect(stats.error).toBe(1);
    expect(stats.success).toBe(1);
  });

  it('DEBUG 也入账；默认阈值 WARN 只影响控制台镜像', () => {
    const before = logger.getLevel();
    logger.setLevel('warn');
    logger.debug('Debug message');
    logger.info('Info message');
    const entries = logger.getEntries();
    expect(entries.map((e) => e.level)).toContain(LOG_LEVELS.DEBUG);
    expect(entries.map((e) => e.level)).toContain(LOG_LEVELS.INFO);
    expect(logger.getStats().debug).toBeGreaterThanOrEqual(1);
    expect(logger.getLevel()).toBe('WARN');
    logger.setLevel(before);
  });

  it('supports level filtering', () => {
    logger.info('Info 1');
    logger.warn('Warn 1');
    logger.info('Info 2');

    const infoOnly = logger.getEntries(LOG_LEVELS.INFO);
    expect(infoOnly.length).toBe(2);
    expect(infoOnly.every((e) => e.level === LOG_LEVELS.INFO)).toBe(true);

    const warnOnly = logger.getEntries(LOG_LEVELS.WARN);
    expect(warnOnly.length).toBe(1);
  });

  it('broadcasts to subscribers', () => {
    const received = [];
    const unsubscribe = logger.subscribe((entry) => {
      received.push(entry);
    });

    logger.info('Subscribed message 1');
    logger.warn('Subscribed message 2');
    unsubscribe();
    logger.info('Unsubscribed message');

    expect(received.length).toBe(2);
    expect(received[0].message).toBe('Subscribed message 1');
  });

  it('exports formatted text logs', () => {
    logger.info('Start process');
    logger.warn('Careful here', { field: 'value' });
    const text = logger.exportText();

    expect(text).toContain('Start process');
    expect(text).toContain('Careful here');
    expect(text).toContain('Detail:');
  });

  describe('增强导出与脱敏', () => {
    it('Error detail 导出后包含 stack', () => {
      const err = new Error('boom');
      logger.error('failed', err);
      const text = logger.exportText();
      expect(text).toContain('"name": "Error"');
      expect(text).toContain('"message": "boom"');
      expect(text).toContain('"stack":');
    });

    it('循环引用不抛错且含 [Circular]', () => {
      const obj = { a: 1 };
      obj.self = obj;
      logger.warn('circular', obj);
      let text;
      expect(() => { text = logger.exportText(); }).not.toThrow();
      expect(text).toContain('[Circular]');
    });

    it('Error cause 自引用不抛 RangeError，且 message/stack 保留（P1-1）', () => {
      const err = new Error('self-boom');
      err.cause = err;
      logger.error('self-cause', err);
      let text;
      expect(() => { text = logger.exportText(); }).not.toThrow();
      expect(text).toContain('"message": "self-boom"');
      expect(text).toContain('"stack":');
      expect(text).toContain('[Circular]');
      expect(text).not.toContain('[unserializable]');
    });

    it('Blob 导出为 kind:blob 并含 size/type', () => {
      const blob = new Blob(['hello'], { type: 'text/plain' });
      logger.info('blob detail', blob);
      const text = logger.exportText();
      expect(text).toContain('"kind": "blob"');
      expect(text).toContain('"size": 5');
      expect(text).toContain('"type": "text/plain"');
    });

    it('时间戳含日期 YYYY-MM-DD HH:MM:SS.mmm', () => {
      logger.info('timestamped');
      const entry = logger.getEntries()[0];
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('exportText 默认脱敏，exportRaw 保留原文', () => {
      // 确定性：exportText 与 exportRedacted 各自都会经 environmentHeader() →
      // formatTime() → new Date() 生成 `ExportedAt:` 头；若两次调用跨 1ms，
      // 整串 toBe 比较会偶发失败（实测 .343 vs .344）。冻结时钟后两次导出头一致，
      // 断言强度不变（仍比较完整导出文本），仅消除时间抖动。
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-20T01:00:00.000Z'));
      try {
        logger.info('token leak', { url: 'https://user:pass@example.com/?token=abc123' });
        const safe = logger.exportText();
        const raw = logger.exportRaw();
        expect(safe).not.toContain('user:pass');
        expect(safe).toContain('[REDACTED]');
        expect(raw).toContain('user:pass');
        expect(logger.exportRedacted()).toBe(safe);
      } finally {
        vi.useRealTimers();
      }
    });

    /**
     * 令牌样例**必须用拼接构造**，不得写成完整字面量。
     *
     * 原因（2026-11-19 实测）：写成完整字面量时，GitHub Push Protection 会把
     * `test/logger.test.js` 判为「含 Slack API Token」并**拒绝推送**（GH013）——
     * 它按格式匹配，不区分真实凭据与测试合成串。
     * 拼接后源码里不出现完整令牌形态，扫描器不命中，而 `redact()` 收到的仍是
     * 完整格式的输入，脱敏断言强度不变。
     */
    const tok = (...parts) => parts.join('');

    it('redact 覆盖各类令牌格式', () => {
      expect(redact('https://user:pass@host/x')).toBe('https://[REDACTED]@host/x');
      expect(redact(tok('pat ghp_', 'abcdefghijklmnopqrstuvwxyz1234567890 end'))).toContain('[REDACTED]');
      expect(redact(tok('pat ghp_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'))).not.toContain('ghp_');
      expect(redact(tok('pat github_pat_', '11ABCDEFG0abcdefghijklmnop'))).not.toContain('github_pat_');
      expect(redact(tok('pat gho_', 'abcdefghijklmnopqrstuvwxyz'))).not.toContain('gho_');
      expect(redact(tok('pat ghu_', 'abcdefghijklmnopqrstuvwxyz'))).not.toContain('ghu_');
      expect(redact(tok('pat ghs_', 'abcdefghijklmnopqrstuvwxyz'))).not.toContain('ghs_');
      expect(redact(tok('glpat-', 'abcdefghijklmnopqrst'))).not.toContain('glpat-');
      expect(redact(tok('sk-', 'abcdefghijklmnopqrstuvwx'))).not.toContain('sk-');
      expect(redact(tok('xoxb-', '1234567890-abcdefghijklmnop'))).not.toContain('xoxb-');
      expect(redact(tok('AKIA', 'IOSFODNN7EXAMPLE'))).not.toContain('AKIA');
      expect(redact('Authorization: Bearer abc.def.ghi')).toContain('Bearer [REDACTED]');
      expect(redact('Basic dXNlcjpwYXNz')).toContain('Basic [REDACTED]');
      expect(redact('/api?access_token=secret123&x=1')).toContain('access_token=[REDACTED]');
      expect(redact('/api?api_key=secret123')).toContain('api_key=[REDACTED]');
      expect(redact('/api?password=hunter2')).toContain('password=[REDACTED]');
      expect(redact('C:\\Users\\Alice\\AppData')).toContain('C:\\Users\\[USER]');
      expect(redact('/home/alice/project')).toBe('/[USER]/project');
      expect(redact('/Users/bob/project')).toBe('/[USER]/project');
    });

    it('redact 不打码包体积、错误类型、HTTP 状态', () => {
      expect(redact('package size 12.3 MB, 462 B')).toBe('package size 12.3 MB, 462 B');
      expect(redact('Error: TypeError at line 5')).toBe('Error: TypeError at line 5');
      expect(redact('HTTP 404 and status 500')).toBe('HTTP 404 and status 500');
      expect(redact('host: luker, version 0.6.0')).toBe('host: luker, version 0.6.0');
    });

    it('redact 覆盖 client_secret / password / POSIX 用户路径 / 邮箱（P2 脱敏缺口）', () => {
      expect(redact('client_secret=abc123xyz')).not.toContain('abc123xyz');
      expect(redact('client_secret=abc123xyz')).toContain('client_secret=[REDACTED]');
      expect(redact('password: Sup3rSecret')).not.toContain('Sup3rSecret');
      expect(redact('password: Sup3rSecret')).toContain('password: [REDACTED]');
      // JSON 形态与中文冒号
      expect(redact('"password": "Sup3rSecret"')).not.toContain('Sup3rSecret');
      expect(redact('password：Sup3rSecret')).not.toContain('Sup3rSecret');
      // POSIX /root/ 与 /var/ 用户路径
      expect(redact('/root/.ssh/id_rsa')).not.toContain('/root/.ssh/id_rsa');
      expect(redact('/root/.ssh/id_rsa')).toContain('/root/[USER]');
      expect(redact('/var/jenkins_home/secret')).not.toContain('jenkins_home');
      // 常见邮箱
      expect(redact('contact me at alice@example.com now')).not.toContain('alice@example.com');
      expect(redact('alice@example.com')).toContain('[EMAIL]');
    });

    describe('P1 脱敏加固：redact 新增规则', () => {
      it('redact 覆盖 Google API Key（AIza + 35 位）', () => {
        const key = tok('AIza', 'A'.repeat(35));
        expect(redact(key)).toBe('[REDACTED]');
        expect(redact('key=' + key)).toContain('[REDACTED]');
      });

      it('redact 覆盖 HuggingFace token（hf_ + ≥30 位）', () => {
        const key = tok('hf_', 'abcdefghijklmnopqrstuvwxyz1234');
        expect(redact(key)).toBe('[REDACTED]');
      });

      it('redact 覆盖 JWT 三段式与 PEM 私钥头（不误伤普通句点文本）', () => {
        // JWT 拼接构造，避免源码出现完整令牌形态（沿用 tok 约定，防 Push Protection）。
        const jwt = tok(
          'eyJhbGciOiJIUzI1NiJ9.',
          'eyJzdWIiOiIxMjM0NTY3ODkwIn0.',
          'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR6U',
        );
        expect(redact(jwt)).toContain('[REDACTED]');
        expect(redact(jwt)).not.toContain('eyJhbGciOi');
        expect(redact('-----BEGIN RSA PRIVATE KEY-----abc')).toContain('[REDACTED]');
        expect(redact('-----BEGIN OPENSSH PRIVATE KEY-----abc')).toContain('[REDACTED]');
        // 普通句点缩写 / 小数不受 JWT 规则影响。
        expect(redact('section 3.1415 ends.')).toBe('section 3.1415 ends.');
      });

      it('redact 覆盖 ENCRYPTED 私钥头、多行 PEM 整块与无 END 单行（P0-1）', () => {
        // ① PKCS#8 加密私钥标准头必须被掩掉。
        expect(redact('-----BEGIN ENCRYPTED PRIVATE KEY-----SUPERSECRET')).toContain('[REDACTED]');
        expect(redact('-----BEGIN ENCRYPTED PRIVATE KEY-----SUPERSECRET')).not.toContain('SUPERSECRET');
        // ② 多行 PEM：BEGIN + Base64 主体 + END 整块掩蔽，主体不得泄露。
        const multi = [
          '-----BEGIN PRIVATE KEY-----',
          'BASE64SECRETBODYLINE',
          '-----END PRIVATE KEY-----',
        ].join('\n');
        const outMulti = redact('prefix\n' + multi + '\nsuffix');
        expect(outMulti).toContain('[REDACTED]');
        expect(outMulti).not.toContain('BASE64SECRETBODYLINE');
        expect(outMulti).not.toContain('END PRIVATE KEY');
        expect(outMulti).toContain('prefix');
        expect(outMulti).toContain('suffix');
        // RSA 加密多行块同样整块掩蔽。
        const rsa = '-----BEGIN RSA PRIVATE KEY-----\nMIIBODY\n-----END RSA PRIVATE KEY-----';
        expect(redact(rsa)).not.toContain('MIIBODY');
        // ③ 无 END 的单行头退化为掩头行至行尾（不影响其后其它行文本）。
        expect(redact('-----BEGIN EC PRIVATE KEY-----LEAK')).toBe('[REDACTED]');
      });

      it('PEM 正则同源：全局版由唯一真源派生，redact 与 containsPemPrivateKey 结论一致', () => {
        const samples = [
          '-----BEGIN PRIVATE KEY-----\nBODY\n-----END PRIVATE KEY-----',
          '-----BEGIN ENCRYPTED PRIVATE KEY-----SUPERSECRET',
          '-----BEGIN OPENSSH PRIVATE KEY-----LEAK',
          '-----BEGIN VENDORX PRIVATE KEY-----ODD',
          'just a normal text without any key',
        ];
        for (const s of samples) {
          expect(PEM_PRIVATE_KEY_GLOBAL.source).toBe(PEM_PRIVATE_KEY.source);
          expect(redact(s) !== s).toBe(containsPemPrivateKey(s));
        }
      });

      it('redact 覆盖 ?refresh_token= / id_token / client_secret 等查询参数', () => {
        expect(redact('/api?refresh_token=SECRET')).toContain('refresh_token=[REDACTED]');
        expect(redact('/api?id_token=SECRET')).toContain('id_token=[REDACTED]');
        expect(redact('/api?client_secret=SECRET')).toContain('client_secret=[REDACTED]');
        expect(redact('/api?signature=SECRET&x=1')).toContain('signature=[REDACTED]');
        expect(redact('/api?accesskey=SECRET')).toContain('accesskey=[REDACTED]');
        expect(redact('/api?refresh_token=SECRET')).not.toContain('SECRET');
      });

      it('redact 覆盖单引号密码 password: \'xxx\' / passwd=\'xxx\'', () => {
        expect(redact("password: 'Sup3rSecret123'")).toContain('password: [REDACTED]');
        expect(redact("password: 'Sup3rSecret123'")).not.toContain('Sup3rSecret123');
        expect(redact("passwd='hunter2'")).toContain('passwd=[REDACTED]');
        expect(redact("passwd='hunter2'")).not.toContain('hunter2');
      });
    });

    describe('P1 脱敏加固：scrubDetailKeys 键名黑名单', () => {
      it('折叠 6 类漏网键值（按敏感键名）', () => {
        const input = {
          api_key: 'abc123SECRETtokenXYZ',
          password: 'Sup3rSecret123',
          google_api_key: tok('AIza', 'A'.repeat(35)),
          hf_token: tok('hf_', 'abcdefghijklmnopqrstuvwxyz'),
          refresh_token: 'SECRET',
          token: 'abc123XYZ',
        };
        const out = scrubDetailKeys(input);
        for (const value of Object.values(out)) expect(value).toBe('[REDACTED]');
      });

      it('3 层嵌套对象里的 token 键被折叠', () => {
        const out = scrubDetailKeys({
          level1: { level2: { access_token: 'SECRET', keep: 'visible' } },
        });
        expect(out.level1.level2.access_token).toBe('[REDACTED]');
        expect(out.level1.level2.keep).toBe('visible');
      });

      it('数组内的对象秘密键同样被折叠', () => {
        const out = scrubDetailKeys([{ client_secret: 'SECRET' }, { ok: 1 }]);
        expect(out[0].client_secret).toBe('[REDACTED]');
        expect(out[1].ok).toBe(1);
      });

      it('camelCase / 多种黑名单键名均命中', () => {
        const out = scrubDetailKeys({
          accessToken: 'a', refreshToken: 'b', secretAccessKey: 'c',
          customSecret: 'd', apiKey: 'e', apikey: 'f', key: 'g',
          passwd: 'h', pwd: 'i', credentials: 'j', authorization: 'k',
          cookie: 'l', 'set-cookie': 'm',
        });
        for (const value of Object.values(out)) expect(value).toBe('[REDACTED]');
      });

      it('循环引用不抛错、不死循环', () => {
        const obj = { token: 'SECRET', name: 'root' };
        obj.self = obj;
        let out;
        expect(() => { out = scrubDetailKeys(obj); }).not.toThrow();
        expect(out.token).toBe('[REDACTED]');
        expect(out.self).toBe('[Circular]');
      });

      it('depth 超 8 层返回 [DEEP]', () => {
        let deep = { token: 'SECRET' };
        const root = { a: deep };
        let cursor = root;
        for (let i = 0; i < 10; i++) {
          cursor.next = { v: i };
          cursor = cursor.next;
        }
        const out = scrubDetailKeys(root);
        expect(JSON.stringify(out)).toContain('[DEEP]');
      });

      it('不误伤 keyboard / monkey 等含 key 子串的正常单词', () => {
        const out = scrubDetailKeys({ keyboard: 'K', monkey: 'M', keyName: 'N', keyPath: 'P' });
        expect(out.keyboard).toBe('K');
        expect(out.monkey).toBe('M');
        expect(out.keyName).toBe('N');
        expect(out.keyPath).toBe('P');
      });

      it('字符串原样透传（不改变 redact 行为）', () => {
        expect(scrubDetailKeys('password: abc')).toBe('password: abc');
      });

      it('exportText 走 scrubDetailKeys：detail 对象秘密键被折叠', () => {
        logger.warn('leak', { token: 'SECRET', password: ' Sup3r ', keep: 'visible' });
        const text = logger.exportText();
        expect(text).toContain('"token": "[REDACTED]"');
        expect(text).toContain('password: [REDACTED]');
        expect(text).toContain('"keep": "visible"');
        expect(text).not.toContain('SECRET');
        expect(text).not.toContain('Sup3r');
      });
    });

    describe('路径脱敏加固：VULN-01 / VULN-02', () => {
      // 反斜杠用 charCode 构造，避免源码出现本机绝对路径字面量（铁律 35）。
      const B = String.fromCharCode(92);

      it('redact 掩蔽 JSON 序列化后的双反斜杠 Windows 路径', () => {
        // 运行时是单反斜杠的正常路径；JSON.stringify 后呈字面双反斜杠。
        const rawPath = 'C:' + B + 'Users' + B + 'Alice' + B + 'AppData';
        const json = JSON.stringify({ path: rawPath });
        expect(json).toContain('C:' + B + B + 'Users');
        const out = redact(json);
        expect(out).not.toContain('Alice');
        expect(out).toContain('C:' + B + B + 'Users' + B + B + '[USER]');
      });

      it('redact 含空格用户名整段掩蔽（Windows）', () => {
        const input = 'C:' + B + 'Users' + B + 'John Doe' + B + 'AppData';
        const out = redact(input);
        expect(out).toBe('C:' + B + 'Users' + B + '[USER]' + B + 'AppData');
        expect(out).not.toContain('John');
        expect(out).not.toContain('Doe');
      });

      it('redact 含空格用户名整段掩蔽（POSIX）', () => {
        expect(redact('/home/John Doe/project')).toBe('/[USER]/project');
        expect(redact('/Users/Mary Jane/project')).toBe('/[USER]/project');
      });

      it('redact 不误伤非路径文本', () => {
        const plain = 'C drive has a Users folder; Alice likes it';
        expect(redact(plain)).toBe(plain);
        expect(redact('Users can be many people')).toBe('Users can be many people');
      });
    });
  });
});
