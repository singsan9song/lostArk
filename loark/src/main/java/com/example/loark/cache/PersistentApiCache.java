package com.example.loark.cache;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

@Service
public class PersistentApiCache {
    private final ApiCacheEntryRepository repository;
    private final ObjectMapper objectMapper;
    private final ApiCacheState state;
    private final long ttlSeconds;

    public PersistentApiCache(ApiCacheEntryRepository repository, ObjectMapper objectMapper, ApiCacheState state,
                              @Value("${app.price-cache-ttl-seconds:60}") long ttlSeconds) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.state = state;
        this.ttlSeconds = Math.max(0, ttlSeconds);
    }

    @PostConstruct
    void restoreLastUpdatedAt() {
        Instant latest = repository.findLatestUpdatedAt();
        if (latest != null) state.restoreUpdatedAt(latest);
    }

    @Transactional(readOnly = true)
    public Optional<JsonNode> findFresh(String key) {
        return repository.findById(key)
                .filter(this::isFresh)
                .flatMap(this::parse);
    }

    @Transactional(readOnly = true)
    public Optional<JsonNode> findLastSuccess(String key) {
        return repository.findById(key).flatMap(this::parse);
    }

    @Transactional
    public void save(String key, JsonNode payload) {
        save(key, payload, ttlSeconds);
    }

    @Transactional
    public void save(String key, JsonNode payload, long customTtlSeconds) {
        Instant now = Instant.now();
        String serialized = payload.toString();
        repository.save(new ApiCacheEntry(key, serialized, now, source(key), 1, hash(serialized),
                customTtlSeconds == 0 ? null : now.plusSeconds(Math.max(0, customTtlSeconds))));
        state.restoreUpdatedAt(now);
    }

    @Transactional(readOnly = true)
    public List<String> keysBySource(String source) {
        return repository.findCacheKeysBySource(source);
    }

    private boolean isFresh(ApiCacheEntry entry) {
        return entry.getExpiresAt() == null || !Instant.now().isAfter(entry.getExpiresAt());
    }

    private Optional<JsonNode> parse(ApiCacheEntry entry) {
        try {
            return Optional.of(objectMapper.readTree(entry.getPayload()));
        } catch (Exception error) {
            com.example.loark.config.ApplicationLog.infof(
                    "[LOSTARK CACHE] Invalid DB cache ignored: %s%n", entry.getCacheKey());
            return Optional.empty();
        }
    }

    private String source(String key) {
        int separator = key.indexOf('|');
        return separator < 0 ? key : key.substring(0, separator);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("API 캐시 해시 생성 실패", error);
        }
    }
}
