package com.whispernet.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RedisRateLimiterTest {

    @Test
    @DisplayName("In-Memory Mode: Allows requests up to maxRequests and blocks subsequent calls within window")
    void testInMemoryRateLimiterBlocksOverLimit() {
        // max 3 requests per 60s
        RedisRateLimiter limiter = new RedisRateLimiter(false, "localhost", 6379, 1000, true, 3, 60);

        assertEquals(0L, limiter.checkAndRecord("192.168.1.10"));
        assertEquals(0L, limiter.checkAndRecord("192.168.1.10"));
        assertEquals(0L, limiter.checkAndRecord("192.168.1.10"));

        long retryAfter = limiter.checkAndRecord("192.168.1.10");
        assertTrue(retryAfter > 0, "4th request must be rejected with positive retryAfter duration");

        // Independent IP should still be allowed
        assertEquals(0L, limiter.checkAndRecord("192.168.1.20"));
    }

    @Test
    @DisplayName("Redis Mode (Fail-Closed): Unreachable Redis server fails closed when failClosed is true")
    void testRedisFailClosedOnConnectionError() {
        // Points to an unreachable port to trigger connection error with failClosed=true
        RedisRateLimiter limiter = new RedisRateLimiter(true, "127.0.0.1", 59999, 100, true, 30, 60);

        long retryAfter = limiter.checkAndRecord("10.0.0.5");
        assertEquals(1000L, retryAfter, "Must return 1000ms retry-after when failing closed");
    }

    @Test
    @DisplayName("Redis Mode (Fail-Open): Unreachable Redis server falls back to in-memory limiter when failClosed is false")
    void testRedisFailOpenOnConnectionError() {
        // Points to an unreachable port with failClosed=false
        RedisRateLimiter limiter = new RedisRateLimiter(true, "127.0.0.1", 59999, 100, false, 2, 60);

        assertEquals(0L, limiter.checkAndRecord("10.0.0.6"));
        assertEquals(0L, limiter.checkAndRecord("10.0.0.6"));

        long retryAfter = limiter.checkAndRecord("10.0.0.6");
        assertTrue(retryAfter > 0, "Must fall back to in-memory limiting and reject 3rd request");
    }
}
