/**
 * Git 站点 OAuth（授权码 + PKCE，纯浏览器）与令牌指引所需的端点事实。
 *
 * 2026-11-11 实测（curl -H "Origin: http://localhost:8003"）：
 *   - GitLab `POST https://gitlab.com/oauth/token`  → Access-Control-Allow-Origin: *
 *   - Gitee  `POST https://gitee.com/oauth/token`   → Access-Control-Allow-Origin: *
 *   - GitHub `POST https://github.com/login/oauth/access_token` → 404，无 CORS 头
 *     ⇒ 浏览器直连无法换 token，必须用 PAT 或自建代理（见 proxyUrl）。
 *
 * 本模块只做纯逻辑与网络调用，不碰 DOM；redirectUri / baseUrl 由调用方传入。
 */

const trimBase = (base) => {
  let b = String(base || '').trim().replace(/\/+$/, '');
  if (b && !/^https?:\/\//i.test(b)) b = 'https://' + b;
  return b;
};

export const OAUTH_PROVIDERS = Object.freeze({
  github: Object.freeze({
    site: 'github',
    label: 'GitHub',
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'repo',
    browserToken: false,
    clientSecret: true,
    baseRequired: false,
  }),
  gitlab: Object.freeze({
    site: 'gitlab',
    label: 'GitLab',
    authorize: 'https://gitlab.com/oauth/authorize',
    token: 'https://gitlab.com/oauth/token',
    scope: 'read_repository read_api',
    browserToken: true,
    clientSecret: false,
    baseRequired: false,
  }),
  gitee: Object.freeze({
    site: 'gitee',
    label: 'Gitee',
    authorize: 'https://gitee.com/oauth/authorize',
    token: 'https://gitee.com/oauth/token',
    scope: 'projects',
    browserToken: true,
    clientSecret: true,
    baseRequired: false,
  }),
  gitea: Object.freeze({
    site: 'gitea',
    label: 'Gitea',
    authorize: '/login/oauth/authorize',
    token: '/login/oauth/access_token',
    scope: 'read:repository',
    browserToken: true,
    clientSecret: true,
    baseRequired: true,
  }),
});

export function oauthProvider(site, baseUrl = '') {
  const key = String(site || '').toLowerCase();
  const preset = OAUTH_PROVIDERS[key];
  if (!preset) return null;
  const base = trimBase(baseUrl);
  if (preset.baseRequired && !base) return null;
  const absolute = (u) => (/^https?:\/\//i.test(u) ? u : base + u);
  return {
    ...preset,
    authorizeUrl: absolute(preset.authorize),
    tokenUrl: absolute(preset.token),
    baseUrl: base,
  };
}

export function buildAuthorizeUrl({ site, baseUrl = '', clientId, redirectUri, state, codeChallenge, scope }) {
  const p = oauthProvider(site, baseUrl);
  if (!p || !clientId) return '';
  const url = new URL(p.authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope || p.scope);
  url.searchParams.set('state', state);
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

/** 浏览器可读的随机串（state / verifier）；getRandomValues 在非安全上下文也可用。 */
export function randomToken(bytes = 16) {
  const buf = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i += 1) buf[i] = Math.floor(Math.random() * 256);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE：返回 {verifier, challenge}；WebCrypto 不可用时 challenge 为 ''。 */
export async function makePkce() {
  const verifier = randomToken(32);
  if (!globalThis.crypto?.subtle) return { verifier, challenge: '' };
  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { verifier, challenge: base64url(new Uint8Array(digest)) };
  } catch {
    return { verifier, challenge: '' };
  }
}

/** 从 location.search 解析回调参数；没有 code/state 时返回 null。 */
export function parseOAuthCallback(search) {
  const params = new URLSearchParams(String(search || ''));
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  if (!code && !error) return null;
  return { code: code || '', state: state || '', error: error || '', errorDescription: errorDescription || '' };
}

/**
 * 用授权码换 access_token。
 * proxyUrl 非空时走代理：POST JSON {site,baseUrl,clientId,clientSecret,code,redirectUri,codeVerifier}，
 * 代理需返回 {access_token}（GitHub 浏览器直连不可用，只能这样）。
 */
export async function exchangeOAuthCode({ site, baseUrl = '', clientId, clientSecret = '', code, redirectUri, codeVerifier = '', proxyUrl = '' }) {
  const p = oauthProvider(site, baseUrl);
  if (!p) return { ok: false, error: 'unsupported' };
  const proxy = String(proxyUrl || '').trim();
  let res;
  try {
    if (proxy) {
      res = await fetch(proxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ site, baseUrl, clientId, clientSecret, code, redirectUri, codeVerifier }),
      });
    } else {
      if (!p.browserToken) return { ok: false, error: 'cors' };
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      if (codeVerifier) body.set('code_verifier', codeVerifier);
      res = await fetch(p.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
      });
    }
  } catch (err) {
    return { ok: false, error: 'network', detail: String(err?.message || err) };
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  const token = data?.access_token || '';
  if (!res.ok || !token) {
    return { ok: false, error: data?.error || String(res.status), detail: data?.error_description || '' };
  }
  return { ok: true, accessToken: token, scope: data?.scope || '' };
}
