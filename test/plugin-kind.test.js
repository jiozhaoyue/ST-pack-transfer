import { describe, expect, it } from 'vitest';
import {
  PLUGIN_KINDS, classifyPluginKind, isExtensionKind, isServerPluginKind, pluginKindLabelKey,
} from '../src/core/plugin-kind.js';

describe('plugin-kind 插件类型识别', () => {
  it('有 manifest.json ⇒ 前端扩展', () => {
    expect(classifyPluginKind({ manifest: { display_name: 'x' }, packageJson: { main: 'server.js' } }))
      .toBe(PLUGIN_KINDS.extension);
  });

  it('只有 package.json ⇒ 服务端插件', () => {
    expect(classifyPluginKind({ manifest: null, packageJson: { name: 'plugin' } }))
      .toBe(PLUGIN_KINDS.server);
  });

  it('都读不到 ⇒ unknown（不猜、不拦截）', () => {
    expect(classifyPluginKind({})).toBe(PLUGIN_KINDS.unknown);
    expect(classifyPluginKind()).toBe(PLUGIN_KINDS.unknown);
    expect(classifyPluginKind({ manifest: [], packageJson: 'x' })).toBe(PLUGIN_KINDS.unknown);
  });

  it('类型判据与文案键一一对应', () => {
    expect(isExtensionKind('extension')).toBe(true);
    expect(isServerPluginKind('server')).toBe(true);
    expect(isServerPluginKind('extension')).toBe(false);
    expect(pluginKindLabelKey('server')).toBe('kindServer');
    expect(pluginKindLabelKey('extension')).toBe('kindExtension');
    expect(pluginKindLabelKey('unknown')).toBe('kindUnknown');
  });
});
