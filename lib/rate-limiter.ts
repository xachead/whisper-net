/**
 * Lightweight In-Memory Sliding-Window Rate Limiter
 * Mitigates Denial-of-Service and brute-force attacks on sensitive endpoints.
 */

interface RateLimitRecord {
  timestamps: number[];
}

export class InMemoryRateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxTrackedKeys: number;

  constructor(maxRequests = 30, windowMs = 60000, maxTrackedKeys = 10000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.maxTrackedKeys = maxTrackedKeys;

    // Periodic sweep to prevent memory leak
    if (typeof setInterval !== 'undefined') {
      const timer = setInterval(() => this.cleanup(), windowMs * 2);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    }
  }

  public check(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    if (this.records.size >= this.maxTrackedKeys && !this.records.has(key)) {
      this.cleanup();
      // Evict oldest entry if still at capacity
      if (this.records.size >= this.maxTrackedKeys) {
        const oldestKey = this.records.keys().next().value;
        if (oldestKey !== undefined) {
          this.records.delete(oldestKey);
        }
      }
    }

    const record = this.records.get(key) || { timestamps: [] };

    // Prune timestamps older than window
    const validTimestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      const oldest = validTimestamps[0];
      const resetMs = Math.max(0, this.windowMs - (now - oldest));
      this.records.set(key, { timestamps: validTimestamps });
      return { allowed: false, remaining: 0, resetMs };
    }

    validTimestamps.push(now);
    this.records.set(key, { timestamps: validTimestamps });

    return {
      allowed: true,
      remaining: this.maxRequests - validTimestamps.length,
      resetMs: this.windowMs,
    };
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      const valid = record.timestamps.filter((ts) => now - ts < this.windowMs);
      if (valid.length === 0) {
        this.records.delete(key);
      } else {
        this.records.set(key, { timestamps: valid });
      }
    }
  }
}

const globalForRateLimiter = globalThis as unknown as {
  whisperRateLimiter?: InMemoryRateLimiter;
};

export const rateLimiter =
  globalForRateLimiter.whisperRateLimiter ??
  (globalForRateLimiter.whisperRateLimiter = new InMemoryRateLimiter(30, 60000));

/**
 * Extracts the client IP. Only trusts X-Forwarded-For / X-Real-IP when
 * TRUST_PROXY_HEADERS=true (i.e., behind a trusted reverse proxy) to prevent
 * header-spoofing rate-limit bypasses.
 */
export function getClientIp(req: Request, trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === 'true'): string {
  if (trustProxyHeaders) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp) {
      return realIp.trim();
    }
  }
  return '127.0.0.1';
}
