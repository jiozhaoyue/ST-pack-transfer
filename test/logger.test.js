import { describe, it, expect, beforeEach } from 'vitest';
import { logger, LOG_LEVELS, redact } from '../src/core/logger.js';

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
      logger.info('token leak', { url: 'https://user:pass@example.com/?token=abc123' });
      const safe = logger.exportText();
      const raw = logger.exportRaw();
      expect(safe).not.toContain('user:pass');
      expect(safe).toContain('[REDACTED]');
      expect(raw).toContain('user:pass');
      expect(logger.exportRedacted()).toBe(safe);
    });

    it('redact 覆盖各类令牌格式', () => {
      expect(redact('https://user:pass@host/x')).toBe('https://[REDACTED]@host/x');
      expect(redact(['pat ghp_','abcdefghijklmnopqrstuvwxyz1234567890 end'].join(''))).toContain('[REDACTED]');
      expect(redact(['pat ghp_','ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].join(''))).not.toContain('ghp_');
      expect(redact(['pat github_pat_','11ABCDEFG0abcdefghijklmnop'].join(''))).not.toContain('github_pat_');
      expect(redact(['pat gho_','abcdefghijklmnopqrstuvwxyz'].join(''))).not.toContain('gho_');
      expect(redact(['pat ghu_','abcdefghijklmnopqrstuvwxyz'].join(''))).not.toContain('ghu_');
      expect(redact(['pat ghs_','abcdefghijklmnopqrstuvwxyz'].join(''))).not.toContain('ghs_');
      expect(redact(['glpat-','abcdefghijklmnopqrst'].join(''))).not.toContain('glpat-');
      expect(redact(['sk-','abcdefghijklmnopqrstuvwx'].join(''))).not.toContain('sk-');
      expect(redact(['xoxb-','1234567890-abcdefghijklmnop'].join(''))).not.toContain('xoxb-');
      expect(redact(['AKIA','IOSFODNN7EXAMPLE'].join(''))).not.toContain('AKIA');
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
  });
});
