import { describe, it, expect } from 'vitest';
import {
  oauthProvider, buildAuthorizeUrl, parseOAuthCallback, randomToken, makePkce,
} from '../src/core/git-oauth.js';

describe('git-oauth 端点与授权地址', () => {
  it('预设站点与浏览器换 token 能力', () => {
    expect(oauthProvider('gitlab').browserToken).toBe(true);
    expect(oauthProvider('gitee').browserToken).toBe(true);
    expect(oauthProvider('github').browserToken).toBe(false);
    expect(oauthProvider('nope')).toBeNull();
  });

  it('Gitea 必须给 base，并按 base 拼绝对地址', () => {
    expect(oauthProvider('gitea', '')).toBeNull();
    const p = oauthProvider('gitea', 'https://gitea.example.com/');
    expect(p.authorizeUrl).toBe('https://gitea.example.com/login/oauth/authorize');
    expect(p.tokenUrl).toBe('https://gitea.example.com/login/oauth/access_token');
  });

  it('授权地址带 state / redirect_uri / PKCE', () => {
    const url = new URL(buildAuthorizeUrl({
      site: 'gitlab', clientId: 'cid', redirectUri: 'http://localhost:8003/index.html',
      state: 'st', codeChallenge: 'chal',
    }));
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8003/index.html');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('read_repository read_api');
  });

  it('缺 clientId 时不生成地址', () => {
    expect(buildAuthorizeUrl({ site: 'gitlab', clientId: '', redirectUri: 'x', state: 's' })).toBe('');
  });
});

describe('git-oauth 回调与随机串', () => {
  it('解析成功回调与错误回调', () => {
    expect(parseOAuthCallback('?code=a&state=b')).toEqual({ code: 'a', state: 'b', error: '', errorDescription: '' });
    expect(parseOAuthCallback('?error=access_denied&error_description=nope'))
      .toEqual({ code: '', state: '', error: 'access_denied', errorDescription: 'nope' });
    expect(parseOAuthCallback('?foo=1')).toBeNull();
  });

  it('随机串为十六进制', () => {
    expect(randomToken(8)).toMatch(/^[0-9a-f]{16}$/);
    expect(randomToken(16)).not.toBe(randomToken(16));
  });

  it('PKCE challenge 为 43 位 base64url（有 WebCrypto 时）', async () => {
    const { verifier, challenge } = await makePkce();
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);
    if (globalThis.crypto?.subtle) expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    else expect(challenge).toBe('');
  });
});
