package com.example.loark.cache;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class ApiCacheState {
    private static final Duration REFRESH_COOLDOWN = Duration.ofMinutes(1);
    private final AtomicReference<Instant> lastUpdatedAt = new AtomicReference<>();
    private final AtomicReference<Instant> lastRefreshRequestedAt = new AtomicReference<>();
    private final long ttlSeconds;

    public ApiCacheState(@Value("${app.price-cache-ttl-seconds:60}") long ttlSeconds) {
        this.ttlSeconds = Math.max(0, ttlSeconds);
    }

    public void markUpdated() {
        lastUpdatedAt.set(Instant.now());
    }

    public void restoreUpdatedAt(Instant updatedAt) {
        if (updatedAt != null) lastUpdatedAt.accumulateAndGet(updatedAt,
                (current, candidate) -> current == null || candidate.isAfter(current) ? candidate : current);
    }

    public synchronized boolean tryRequestRefresh() {
        Instant now = Instant.now();
        Instant previous = lastRefreshRequestedAt.get();
        if (previous != null && now.isBefore(previous.plus(REFRESH_COOLDOWN))) return false;
        lastRefreshRequestedAt.set(now);
        return true;
    }

    public Status status() {
        Instant requestedAt = lastRefreshRequestedAt.get();
        Instant refreshAvailableAt = requestedAt == null ? Instant.now() : requestedAt.plus(REFRESH_COOLDOWN);
        return new Status(lastUpdatedAt.get(), refreshAvailableAt, !Instant.now().isBefore(refreshAvailableAt), ttlSeconds);
    }

    public record Status(Instant lastUpdatedAt, Instant refreshAvailableAt, boolean refreshAvailable, long ttlSeconds) {}
}
