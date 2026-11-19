import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseApiResponse, getApiBaseUrl } from '../lib/api-client.ts';

describe('api-client: parseApiResponse', () => {
  it('parses valid 200 OK JSON responses properly', async () => {
    const fakeRes = new Response(JSON.stringify({ id: 'abc-123', expiresAt: 12345 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseApiResponse<{ id: string; expiresAt: number }>(fakeRes);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data?.id, 'abc-123');
    assert.strictEqual(result.error, null);
  });

  it('safely handles HTML 502 Bad Gateway responses without JSON.parse crash', async () => {
    const html502 = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>';
    const fakeRes = new Response(html502, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

    const result = await parseApiResponse(fakeRes);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 502);
    assert.match(result.error ?? '', /Backend service unavailable \(HTTP 502\)/);
  });

  it('safely handles HTML 404 Not Found from Next.js proxy without crash', async () => {
    const html404 = '<!DOCTYPE html><html><head><title>404: This page could not be found</title></head><body>404</body></html>';
    const fakeRes = new Response(html404, {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/html' },
    });

    const result = await parseApiResponse(fakeRes);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 404);
    assert.match(result.error ?? '', /API endpoint not found \(HTTP 404\)/);
  });

  it('correctly extracts structured JSON error message from backend', async () => {
    const fakeRes = new Response(JSON.stringify({ error: 'Invalid token or passphrase (3 attempts remaining)' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseApiResponse(fakeRes);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.status, 401);
    assert.strictEqual(result.error, 'Invalid token or passphrase (3 attempts remaining)');
  });

  it('handles empty response bodies gracefully', async () => {
    const fakeRes = new Response(null, {
      status: 204,
      statusText: 'No Content',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await parseApiResponse(fakeRes);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.status, 204);
    assert.deepStrictEqual(result.data, {});
  });
});

describe('api-client: getApiBaseUrl', () => {
  it('returns empty string by default when NEXT_PUBLIC_API_URL is not set', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    assert.strictEqual(getApiBaseUrl(), '');
  });

  it('strips trailing slashes when NEXT_PUBLIC_API_URL is configured', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.whispernet.dev///';
    assert.strictEqual(getApiBaseUrl(), 'https://api.whispernet.dev');
    delete process.env.NEXT_PUBLIC_API_URL;
  });
});
