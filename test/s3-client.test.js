import { describe, expect, it } from 'vitest';
import {
  amzDates,
  buildBaseUrl,
  createS3Client,
  encodePath,
  normalizePrefix,
  objectKey,
  parseListXml,
  signRequest,
} from '../src/core/s3-client.js';

const NOW = new Date('2026-11-05T10:20:30.000Z');

describe('S3 路径与前缀', () => {
  it('normalizePrefix 去掉首尾斜杠并统一分隔符', () => {
    expect(normalizePrefix('/seraphina/')).toBe('seraphina');
    expect(normalizePrefix('a\\b/')).toBe('a/b');
    expect(normalizePrefix('')).toBe('');
  });

  it('objectKey 拼接前缀与文件名', () => {
    expect(objectKey('packs', 'a.zip')).toBe('packs/a.zip');
    expect(objectKey('', 'a.zip')).toBe('a.zip');
  });

  it('encodePath 按段编码且保留斜杠', () => {
    expect(encodePath('packs/我的 包.zip')).toBe(`packs/${encodeURIComponent('我的 包.zip').replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`);
    expect(encodePath('a/b/c')).toBe('a/b/c');
  });

  it('buildBaseUrl 支持 path-style 与虚拟主机', () => {
    expect(buildBaseUrl({ endpoint: 'https://s3.example.com', bucket: 'b', pathStyle: true })).toBe(
      'https://s3.example.com/b'
    );
    expect(buildBaseUrl({ endpoint: 'https://s3.example.com', bucket: 'b' })).toBe('https://b.s3.example.com');
  });

  it('缺桶或端点无效时返回空串（调用方据此降级）', () => {
    expect(buildBaseUrl({ endpoint: 'https://s3.example.com', bucket: '' })).toBe('');
    expect(buildBaseUrl({ endpoint: 'not-a-url', bucket: 'b', pathStyle: true })).toBe('');
    // 虚拟主机风格不接受纯 IP（IP 必须用 path-style）
    expect(buildBaseUrl({ endpoint: 'https://127.0.0.1:9000', bucket: 'b' })).toBe('');
    expect(buildBaseUrl({ endpoint: 'https://127.0.0.1:9000', bucket: 'b', pathStyle: true })).toBe(
      'https://127.0.0.1:9000/b'
    );
  });

  it('amzDates 生成 SigV4 时间戳', () => {
    expect(amzDates(NOW)).toEqual({ amz: '20261105T102030Z', day: '20261105' });
  });
});

describe('SigV4 签名', () => {
  const base = {
    method: 'GET',
    url: 'https://b.s3.example.com/packs/a.zip',
    headers: { 'x-amz-date': '20261105T102030Z', 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
    payloadHash: 'UNSIGNED-PAYLOAD',
    region: 'us-east-1',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'SECRET',
    now: NOW,
  };

  it('生成规范的 canonical request 与授权头', async () => {
    const out = await signRequest(base);
    expect(out.canonicalRequest.split('\n').slice(0, 3)).toEqual([
      'GET',
      '/packs/a.zip',
      '',
    ]);
    expect(out.signedHeaders.split(';')).toEqual(['host', 'x-amz-content-sha256', 'x-amz-date']);
    expect(out.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261105\/us-east-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(out.stringToSign.split('\n')[3]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('相同输入签名稳定，换密钥即变化', async () => {
    const a = await signRequest(base);
    const b = await signRequest(base);
    const c = await signRequest({ ...base, secretAccessKey: 'OTHER' });
    expect(a.signature).toBe(b.signature);
    expect(c.signature).not.toBe(a.signature);
  });

  it('查询参数按名称排序并参与签名', async () => {
    const out = await signRequest({
      ...base,
      url: 'https://b.s3.example.com/?prefix=packs&list-type=2',
    });
    expect(out.canonicalRequest.split('\n')[2]).toBe('list-type=2&prefix=packs');
  });

  it('canonicalUri 不二次编码：含中文与空格的 key 签名路径与实发 URL 的 pathname 完全一致', async () => {
    // 复现 P1：new URL 的 pathname 已编码一次；旧实现再过 encodePath 会得 %2520。
    const realUrl = new URL('https://b.s3.example.com/mybucket/我的 Pack.zip').toString();
    const out = await signRequest({ ...base, url: realUrl });
    const canonicalUri = out.canonicalRequest.split('\n')[1];
    // canonical steps 的 canonicalUri 必须等于实发 URL 的 pathname，不能出现 %25 二次编码。
    expect(canonicalUri).toBe(new URL(realUrl).pathname);
    expect(canonicalUri).not.toContain('%25');
    expect(canonicalUri).toContain(encodeURIComponent('我的 Pack.zip'));
  });
});

describe('ListObjectsV2 XML 解析', () => {
  it('取 key / size / 时间并识别截断', () => {
    const xml = `<?xml version="1.0"?><ListBucketResult>
      <Contents><Key>packs/a.zip</Key><LastModified>2026-11-05T10:00:00.000Z</LastModified><Size>42</Size></Contents>
      <Contents><Key>packs/b.zip</Key><LastModified>2026-11-05T11:00:00.000Z</LastModified><Size>7</Size></Contents>
      <IsTruncated>true</IsTruncated><NextContinuationToken>tok</NextContinuationToken>
    </ListBucketResult>`;
    const out = parseListXml(xml);
    expect(out.items).toEqual([
      { key: 'packs/a.zip', size: 42, lastModified: '2026-11-05T10:00:00.000Z' },
      { key: 'packs/b.zip', size: 7, lastModified: '2026-11-05T11:00:00.000Z' },
    ]);
    expect(out.truncated).toBe(true);
    expect(out.nextToken).toBe('tok');
  });
});

describe('客户端降级', () => {
  it('未配置时所有请求都返回 not-configured，不抛异常', async () => {
    const client = createS3Client({ config: { endpoint: '', bucket: '' } });
    expect(client.ready).toBe(false);
    expect(await client.putObject('a.zip', new Uint8Array())).toEqual({
      ok: false,
      status: 0,
      message: 'not-configured',
    });
    expect((await client.listObjects('')).message).toBe('not-configured');
  });

  it('HTTP 失败时返回状态与片段而不是抛错', async () => {
    const client = createS3Client({
      config: {
        endpoint: 'https://s3.example.com',
        bucket: 'b',
        pathStyle: true,
        region: 'us-east-1',
        accessKeyId: 'A',
        secretAccessKey: 'S',
      },
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'AccessDenied' }),
    });
    const out = await client.getObject('x.zip');
    expect(out).toEqual({ ok: false, status: 403, message: 'AccessDenied' });
  });
});
