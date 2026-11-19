package com.whispernet.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(1)
public class RateLimitingFilter extends OncePerRequestFilter {

    @Value("${whispernet.rate-limit.trust-proxy-headers:false}")
    private boolean trustProxyHeaders;

    private final RedisRateLimiter rateLimiter;

    public RateLimitingFilter(RedisRateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String uri = request.getRequestURI();
        String method = request.getMethod();

        // Rate limit sensitive secret creation, decryption, and management endpoints
        boolean isProtected = "POST".equalsIgnoreCase(method) && (
                uri.equals("/api/secrets")
                        || (uri.startsWith("/api/secrets/") && (uri.endsWith("/decrypt") || uri.endsWith("/manage")))
        );

        if (isProtected) {
            String clientIp = extractClientIp(request);
            long retryAfterMs = rateLimiter.checkAndRecord(clientIp);
            if (retryAfterMs > 0) {
                long retryAfterSeconds = Math.max(1L, (long) Math.ceil(retryAfterMs / 1000.0));
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.getWriter().write("{\"error\": \"Too many requests. Please slow down.\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String extractClientIp(HttpServletRequest request) {
        if (trustProxyHeaders) {
            String xForwardedFor = request.getHeader("X-Forwarded-For");
            if (xForwardedFor != null && !xForwardedFor.trim().isEmpty()) {
                return xForwardedFor.split(",")[0].trim();
            }
        }
        return request.getRemoteAddr() != null ? request.getRemoteAddr() : "127.0.0.1";
    }
}
