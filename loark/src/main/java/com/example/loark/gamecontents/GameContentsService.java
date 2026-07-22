package com.example.loark.gamecontents;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@Service
public class GameContentsService {
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final LocalTime DAILY_REFRESH_TIME = LocalTime.of(6, 0, 10);
    private static final String LATEST_CACHE_KEY = "gamecontents|calendar|latest";

    private final RestClient client;
    private final PersistentApiCache persistentCache;

    public GameContentsService(RestClient lostArkRestClient, PersistentApiCache persistentCache) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
    }

    public JsonNode calendar() {
        // Visitors only read the latest successful DB snapshot. An incoming
        // request must never trigger a call to the Lost Ark API.
        JsonNode cached = persistentCache.findLastSuccess(LATEST_CACHE_KEY).orElse(null);
        if (cached != null) return cached;
        throw new IllegalStateException("게임 콘텐츠 일정을 불러오지 못했습니다.");
    }

    // Runs at 06:00:10 and then at second 10 of every minute. Once today's
    // refresh succeeds, the dated success key suppresses the remaining runs.
    // On failure, visitors keep seeing the previous successful DB snapshot.
    @Scheduled(cron = "10 * * * * *", zone = "Asia/Seoul")
    synchronized void refreshAtSixAndRetryIfNeeded() {
        ZonedDateTime now = ZonedDateTime.now(KOREA);
        ZonedDateTime refreshStartsAt = now.toLocalDate().atTime(DAILY_REFRESH_TIME).atZone(KOREA);
        if (now.isBefore(refreshStartsAt)) return;

        String successKey = todaySuccessKey();
        if (persistentCache.findLastSuccess(successKey).isPresent()) return;
        try {
            if (refresh(successKey)) {
                System.out.printf("[LOSTARK CALENDAR] Daily calendar refreshed: %s%n", now.toLocalDate());
            } else {
                System.out.printf("[LOSTARK CALENDAR] Empty or invalid response; retrying next minute: %s%n",
                        now.toLocalDate());
            }
        } catch (Exception error) {
            if (error instanceof RestClientResponseException responseError) {
                System.out.printf("[LOSTARK CALENDAR] Refresh failed: HTTP %d; retrying next minute%n",
                        responseError.getStatusCode().value());
            } else {
                System.out.printf("[LOSTARK CALENDAR] Refresh failed: %s; retrying next minute%n",
                        error.getMessage());
            }
        }
    }

    private String todaySuccessKey() {
        return "gamecontents|calendar|refreshed|" + LocalDate.now(KOREA);
    }

    private boolean refresh(String successKey) {
        JsonNode response = LostArkRequestContext.call("이번 주 게임 콘텐츠 캘린더",
                () -> client.get().uri("/gamecontents/calendar").retrieve().body(JsonNode.class));
        if (response != null && response.isArray()) {
            persistentCache.save(LATEST_CACHE_KEY, response);
            persistentCache.save(successKey, response);
            return true;
        }
        return false;
    }
}
