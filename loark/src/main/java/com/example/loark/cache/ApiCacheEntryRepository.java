package com.example.loark.cache;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface ApiCacheEntryRepository extends JpaRepository<ApiCacheEntry, String> {
    @Query("select max(entry.updatedAt) from ApiCacheEntry entry")
    Instant findLatestUpdatedAt();

    @Query("select entry.cacheKey from ApiCacheEntry entry where entry.source = :source")
    List<String> findCacheKeysBySource(@Param("source") String source);
}
