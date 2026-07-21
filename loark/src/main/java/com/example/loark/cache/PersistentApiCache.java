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
        Instant now = Instant.now();
        String serialized = payload.toString();
        repository.save(new ApiCacheEntry(key, serialized, now, source(key), 1, hash(serialized),
                ttlSeconds == 0 ? null : now.plusSeconds(ttlSeconds)));
        state.restoreUpdatedAt(now);
    }

    private boolean isFresh(ApiCacheEntry entry) {
        return entry.getExpiresAt() == null || !Instant.now().isAfter(entry.getExpiresAt());
    }

    private Optional<JsonNode> parse(ApiCacheEntry entry) {
        try {
            return Optional.of(objectMapper.readTree(entry.getPayload()));
        } catch (Exception error) {
            System.out.printf("[LOSTARK CACHE] Invalid DB cache ignored: %s%n", entry.getCacheKey());
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
