package com.whispernet.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.net.ssl.SSLSocketFactory;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class RedisRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    @Value("${whispernet.rate-limit.redis.enabled:false}")
    private boolean redisEnabled;

    @Value("${whispernet.rate-limit.redis.host:localhost}")
    private String redisHost;

    @Value("${whispernet.rate-limit.redis.port:6379}")
    private int redisPort;

    @Value("${whispernet.rate-limit.redis.password:}")
    private String redisPassword;

    @Value("${whispernet.rate-limit.redis.user:}")
    private String redisUser;

    @Value("${whispernet.rate-limit.redis.ssl:false}")
    private boolean redisSsl;

    @Value("${whispernet.rate-limit.redis.timeout-ms:1000}")
    private int timeoutMs;

    @Value("${whispernet.rate-limit.redis.fail-closed:true}")
    private boolean failClosed;

    @Value("${whispernet.rate-limit.max-requests:30}")
    private int maxRequests;

    @Value("${whispernet.rate-limit.window-seconds:60}")
    private int windowSeconds;

    private final Map<String, Deque<Long>> inMemoryMap = new ConcurrentHashMap<>();
    private static final int MAX_TRACKED_IPS = 10_000;

    public RedisRateLimiter() {
    }

    public RedisRateLimiter(boolean redisEnabled, String redisHost, int redisPort, int timeoutMs,
                            boolean failClosed, int maxRequests, int windowSeconds) {
        this(redisEnabled, redisHost, redisPort, null, null, false, timeoutMs, failClosed, maxRequests, windowSeconds);
    }

    public RedisRateLimiter(boolean redisEnabled, String redisHost, int redisPort, String redisPassword,
                            String redisUser, boolean redisSsl, int timeoutMs, boolean failClosed,
                            int maxRequests, int windowSeconds) {
        this.redisEnabled = redisEnabled;
        this.redisHost = redisHost;
        this.redisPort = redisPort;
        this.redisPassword = redisPassword;
        this.redisUser = redisUser;
        this.redisSsl = redisSsl;
        this.timeoutMs = timeoutMs;
        this.failClosed = failClosed;
        this.maxRequests = maxRequests;
        this.windowSeconds = windowSeconds;
    }

    /**
     * Checks rate limit for the given IP address.
     * @return 0 if allowed, or retry-after duration in milliseconds if rejected.
     */
    public long checkAndRecord(String ip) {
        if (!redisEnabled) {
            return checkInMemory(ip);
        }

        try {
            return checkInRedis(ip);
        } catch (Exception e) {
            log.warn("Redis rate limiter connection error to {}:{}: {}", redisHost, redisPort, e.getMessage());
            if (failClosed) {
                return 1000L;
            } else {
                return checkInMemory(ip);
            }
        }
    }

    /**
     * Executes atomic sliding-window rate limit via standard Redis RESP protocol.
     */
    protected long checkInRedis(String ip) throws Exception {
        String key = "whispernet:ratelimit:" + ip;
        Socket socket = redisSsl ? SSLSocketFactory.getDefault().createSocket() : new Socket();
        try (socket) {
            socket.setSoTimeout(timeoutMs);
            socket.connect(new InetSocketAddress(redisHost, redisPort), timeoutMs);
            OutputStream out = socket.getOutputStream();
            BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));

            // Authenticate if password configured
            if (redisPassword != null && !redisPassword.trim().isEmpty()) {
                if (redisUser != null && !redisUser.trim().isEmpty()) {
                    sendRespCommand(out, "AUTH", redisUser.trim(), redisPassword.trim());
                } else {
                    sendRespCommand(out, "AUTH", redisPassword.trim());
                }
                readRespResponse(in);
            }

            sendRespCommand(out, "INCR", key);
            long currentCount = readRespInteger(in);

            if (currentCount == 1) {
                sendRespCommand(out, "EXPIRE", key, String.valueOf(windowSeconds));
                readRespInteger(in);
            }

            if (currentCount > maxRequests) {
                sendRespCommand(out, "TTL", key);
                long ttl = readRespInteger(in);
                long retryAfterSeconds = Math.max(1L, ttl);
                return retryAfterSeconds * 1000L;
            }

            return 0L;
        }
    }

    private void sendRespCommand(OutputStream out, String... args) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("*").append(args.length).append("\r\n");
        for (String arg : args) {
            byte[] bytes = arg.getBytes(StandardCharsets.UTF_8);
            sb.append("$").append(bytes.length).append("\r\n");
            sb.append(arg).append("\r\n");
        }
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void readRespResponse(BufferedReader in) throws Exception {
        String line = in.readLine();
        if (line == null) {
            throw new java.io.EOFException("Unexpected end of stream from Redis server");
        }
        if (line.startsWith("-")) {
            throw new RuntimeException("Redis error: " + line.substring(1));
        }
    }

    private long readRespInteger(BufferedReader in) throws Exception {
        String line = in.readLine();
        if (line == null) {
            throw new java.io.EOFException("Unexpected end of stream from Redis server");
        }
        if (line.startsWith(":")) {
            return Long.parseLong(line.substring(1).trim());
        } else if (line.startsWith("-")) {
            throw new RuntimeException("Redis error: " + line.substring(1));
        } else if (line.startsWith("+")) {
            return 1L;
        }
        throw new IllegalStateException("Unexpected Redis response: " + line);
    }

    public long checkInMemory(String ip) {
        long now = System.currentTimeMillis();
        long windowMs = windowSeconds * 1000L;

        if (inMemoryMap.size() >= MAX_TRACKED_IPS && !inMemoryMap.containsKey(ip)) {
            cleanupExpiredInMemory();
        }

        AtomicLong retryAfterMs = new AtomicLong(0L);

        inMemoryMap.compute(ip, (key, existing) -> {
            Deque<Long> timestamps = existing != null ? existing : new ArrayDeque<>();
            while (!timestamps.isEmpty() && now - timestamps.peekFirst() >= windowMs) {
                timestamps.pollFirst();
            }

            if (timestamps.size() >= maxRequests) {
                long oldest = timestamps.peekFirst();
                retryAfterMs.set(Math.max(1L, windowMs - (now - oldest)));
                return timestamps;
            }

            timestamps.addLast(now);
            return timestamps;
        });

        return retryAfterMs.get();
    }

    @Scheduled(fixedRate = 120_000L)
    public void cleanupExpiredInMemory() {
        long now = System.currentTimeMillis();
        long windowMs = windowSeconds * 1000L;
        for (String key : inMemoryMap.keySet()) {
            inMemoryMap.computeIfPresent(key, (k, timestamps) -> {
                while (!timestamps.isEmpty() && now - timestamps.peekFirst() >= windowMs) {
                    timestamps.pollFirst();
                }
                return timestamps.isEmpty() ? null : timestamps;
            });
        }
    }

    public boolean isRedisEnabled() {
        return redisEnabled;
    }

    public void setRedisEnabled(boolean redisEnabled) {
        this.redisEnabled = redisEnabled;
    }

    public boolean isFailClosed() {
        return failClosed;
    }

    public void setFailClosed(boolean failClosed) {
        this.failClosed = failClosed;
    }
}
