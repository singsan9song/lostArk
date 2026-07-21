package com.example.loark.gamecontents;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.ZoneId;

@Service
public class GameContentsService {
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final String LATEST_CACHE_KEY = "gamecontents|calendar|latest";

    private final RestClient client;
    private final PersistentApiCache persistentCache;

    public GameContentsService(RestClient lostArkRestClient, PersistentApiCache persistentCache) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
    }

    public JsonNode calendar() {
        // Calendar data is shared by every visitor. A dated key makes DEV's
        // infinite cache refresh automatically on the next calendar day.
        String cacheKey = "gamecontents|calendar|" + LocalDate.now(KOREA);
        JsonNode cached = persistentCache.findLastSuccess(cacheKey).orElse(null);
        if (cached != null) return cached;

        try {
            JsonNode response = LostArkRequestContext.call("이번 주 게임 콘텐츠 캘린더",
                    () -> client.get().uri("/gamecontents/calendar").retrieve().body(JsonNode.class));
            if (response != null && response.isArray()) {
                persistentCache.save(cacheKey, response);
                persistentCache.save(LATEST_CACHE_KEY, response);
                return response;
            }
        } catch (RestClientResponseException error) {
            System.out.printf("[LOSTARK CALENDAR] HTTP %d | last successful calendar returned%n",
                    error.getStatusCode().value());
        }

        return persistentCache.findLastSuccess(LATEST_CACHE_KEY)
                .orElseThrow(() -> new IllegalStateException("게임 콘텐츠 일정을 불러오지 못했습니다."));
    }
}
