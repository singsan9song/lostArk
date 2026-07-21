package com.example.loark.cache;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "api_cache_entries")
public class ApiCacheEntry {
    @Id
    @Column(name = "cache_key", length = 255, nullable = false)
    private String cacheKey;

    @Lob
    @Column(name = "payload", columnDefinition = "LONGTEXT", nullable = false)
    private String payload;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(length = 30, nullable = false)
    private String source;
    @Column(name = "schema_version", nullable = false)
    private int schemaVersion;
    @Column(name = "content_hash", length = 64, nullable = false)
    private String contentHash;
    @Column(name = "expires_at")
    private Instant expiresAt;

    protected ApiCacheEntry() {}

    public ApiCacheEntry(String cacheKey, String payload, Instant updatedAt, String source,
                         int schemaVersion, String contentHash, Instant expiresAt) {
        this.cacheKey = cacheKey;
        this.payload = payload;
        this.updatedAt = updatedAt;
        this.source = source;
        this.schemaVersion = schemaVersion;
        this.contentHash = contentHash;
        this.expiresAt = expiresAt;
    }

    public String getCacheKey() { return cacheKey; }
    public String getPayload() { return payload; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getExpiresAt() { return expiresAt; }
}
