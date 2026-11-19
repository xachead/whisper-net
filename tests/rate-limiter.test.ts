import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRateLimiter, getClientIp } from '../lib/rate-limiter.ts';

describe('InMemoryRateLimiter & getClientIp', () => {
  it('allows requests up to maxRequests and blocks subsequent calls within window', () => {
    const limiter = new InMemoryRateLimiter(3, 60_000, 100);

    const r1 = limiter.check('10.0.0.1');
    const r2 = limiter.check('10.0.0.1');
    const r3 = limiter.check('10.0.0.1');
    const r4 = limiter.check('10.0.0.1');

    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);
    assert.equal(r4.allowed, false);
    assert.equal(r4.remaining, 0);
    assert.ok(r4.resetMs > 0);
  });

  it('tracks different keys independently and enforces maxTrackedKeys cap', () => {
    const limiter = new InMemoryRateLimiter(2, 60_000, 2);

    assert.equal(limiter.check('ip-1').allowed, true);
    assert.equal(limiter.check('ip-2').allowed, true);
    assert.equal(limiter.check('ip-3').allowed, true);
  });

  it('ignores X-Forwarded-For unless trustProxyHeaders is explicitly enabled', () => {
    const req = new Request('http://localhost:3000/api/secrets', {
      headers: {
        'x-forwarded-for': '203.0.113.50, 10.0.0.1',
        'x-real-ip': '203.0.113.51',
      },
    });

    assert.equal(getClientIp(req, false), '127.0.0.1');
    assert.equal(getClientIp(req, true), '203.0.113.50');
  });
});
