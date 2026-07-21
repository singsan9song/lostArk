package com.example.loark.cache;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;

public interface ApiCacheEntryRepository extends JpaRepository<ApiCacheEntry, String> {
    @Query("select max(entry.updatedAt) from ApiCacheEntry entry")
    Instant findLatestUpdatedAt();
}
