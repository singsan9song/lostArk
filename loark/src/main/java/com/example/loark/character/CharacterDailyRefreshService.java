package com.example.loark.character;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkApiRequestCounter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class CharacterDailyRefreshService {
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final String CHARACTER_RESOURCE = "static/kloa_characters.json";
    private static final String PROGRESS_KEY = "character-daily-refresh|progress";

    private final CharacterService characterService;
    private final PersistentApiCache persistentCache;
    private final LostArkApiRequestCounter requestCounter;
    private final ObjectMapper objectMapper;
    private final boolean enabled;
    private final boolean continuous;
    private final int rateLimitReserve;
    private final int batchSize;
    private final int maxRequestsPerMinute;
    private final int maxRetries;
    private final ExecutorService backgroundJobExecutor;
    private final AtomicBoolean running = new AtomicBoolean();

    private volatile CharacterList characterList;

    public CharacterDailyRefreshService(
            CharacterService characterService,
            PersistentApiCache persistentCache,
            LostArkApiRequestCounter requestCounter,
            ObjectMapper objectMapper,
            ExecutorService backgroundJobExecutor,
            @Value("${app.character-daily-refresh.enabled:false}") boolean enabled,
            @Value("${app.character-daily-refresh.continuous:false}") boolean continuous,
            @Value("${app.character-daily-refresh.rate-limit-reserve:10}") int rateLimitReserve,
            @Value("${app.character-daily-refresh.batch-size:100}") int batchSize,
            @Value("${app.character-daily-refresh.max-requests-per-minute:1000}") int maxRequestsPerMinute,
            @Value("${app.character-daily-refresh.max-retries:3}") int maxRetries
    ) {
        this.characterService = characterService;
        this.persistentCache = persistentCache;
        this.requestCounter = requestCounter;
        this.objectMapper = objectMapper;
        this.backgroundJobExecutor = backgroundJobExecutor;
        this.enabled = enabled;
        this.continuous = continuous;
        this.rateLimitReserve = Math.max(0, rateLimitReserve);
        this.batchSize = Math.max(1, batchSize);
        this.maxRequestsPerMinute = Math.max(1, maxRequestsPerMinute);
        this.maxRetries = Math.max(1, maxRetries);
    }

    @Scheduled(
            fixedDelayString = "${app.character-daily-refresh.poll-interval-ms:1000}",
            initialDelayString = "${app.character-daily-refresh.initial-delay-ms:10000}"
    )
    void refreshNextBatch() {
        if (!enabled || !running.compareAndSet(false, true)) return;
        backgroundJobExecutor.execute(this::runNextBatch);
    }

    private void runNextBatch() {
        try {
            CharacterList source = characterList();
            if (source.names().isEmpty()) {
                com.example.loark.config.ApplicationLog.info(
                        "[CHARACTER DAILY] Character list is empty; refresh skipped.");
                return;
            }

            RefreshProgress progress = progressFor(source);
            if (progress.completed() && !continuous
                    && LocalDate.now(KOREA).toString().equals(progress.runDate())) return;
            if (progress.completed()) {
                progress = RefreshProgress.start(LocalDate.now(KOREA), source);
                saveProgress(progress);
                com.example.loark.config.ApplicationLog.infof(
                        "[CHARACTER DAILY] New refresh started: date=%s / total=%d%n",
                        progress.runDate(), progress.total());
            }
            if (progress.isPaused()) return;

            int processed = 0;
            while (processed < batchSize && !progress.completed()) {
                if (requestCounter.status().count() >= maxRequestsPerMinute) return;
                if (!requestCounter.hasCapacity(rateLimitReserve)) return;

                String characterName = source.names().get(progress.nextIndex());
                progress = progress.withCurrentName(characterName);
                saveProgress(progress);
                try {
                    characterService.refreshCharacter(characterName);
                    progress = progress.advanceSucceeded();
                    processed++;
                    saveProgress(progress);
                } catch (LostArkApiException error) {
                    int status = error.status().value();
                    if (status == HttpStatus.TOO_MANY_REQUESTS.value()) {
                        Instant resetAt = requestCounter.status().resetsAt();
                        progress = progress.pausedUntil(resetAt == null
                                ? Instant.now().plusSeconds(60)
                                : resetAt.plusSeconds(1));
                        saveProgress(progress);
                        com.example.loark.config.ApplicationLog.infof(
                                "[CHARACTER DAILY] Rate limit reached; paused at %d/%d (%s), resume=%s%n",
                                progress.nextIndex(), progress.total(), characterName, progress.pausedUntil()
                        );
                        return;
                    }
                    if (status == HttpStatus.NOT_FOUND.value()) {
                        progress = progress.advanceSkipped();
                        processed++;
                        saveProgress(progress);
                        continue;
                    }
                    if (status == HttpStatus.UNAUTHORIZED.value() || status == HttpStatus.FORBIDDEN.value()) {
                        progress = progress.pausedUntil(Instant.now().plusSeconds(60));
                        saveProgress(progress);
                        com.example.loark.config.ApplicationLog.infof(
                                "[CHARACTER DAILY] Authentication failure; paused at %s: %s%n",
                                characterName, error.getMessage());
                        return;
                    }
                    progress = handleFailure(progress, characterName, error);
                    saveProgress(progress);
                    return;
                } catch (RuntimeException error) {
                    progress = handleFailure(progress, characterName, error);
                    saveProgress(progress);
                    return;
                }
            }

            if (progress.completed()) {
                com.example.loark.config.ApplicationLog.infof(
                        "[CHARACTER DAILY] Refresh completed: date=%s / total=%d / success=%d / skipped=%d%n",
                        progress.runDate(), progress.total(), progress.succeeded(), progress.skipped()
                );
            }
        } catch (RuntimeException error) {
            com.example.loark.config.ApplicationLog.infof(
                    "[CHARACTER DAILY] Refresh worker failed: %s%n", error.getMessage());
        } finally {
            running.set(false);
        }
    }

    private RefreshProgress handleFailure(RefreshProgress progress, String characterName, RuntimeException error) {
        RefreshProgress failed = progress.failed();
        if (failed.consecutiveFailures() >= maxRetries) {
            com.example.loark.config.ApplicationLog.infof(
                    "[CHARACTER DAILY] Character skipped after %d failures: %s / %s%n",
                    failed.consecutiveFailures(), characterName, error.getMessage());
            return failed.advanceSkipped();
        }
        com.example.loark.config.ApplicationLog.infof(
                "[CHARACTER DAILY] Character refresh failed (%d/%d): %s / %s%n",
                failed.consecutiveFailures(), maxRetries, characterName, error.getMessage());
        return failed.pausedUntil(Instant.now().plusSeconds(5));
    }

    private RefreshProgress progressFor(CharacterList source) {
        RefreshProgress stored = persistentCache.findLastSuccess(PROGRESS_KEY).flatMap(node -> {
            try {
                return java.util.Optional.of(objectMapper.treeToValue(node, RefreshProgress.class));
            } catch (Exception ignored) {
                return java.util.Optional.<RefreshProgress>empty();
            }
        }).orElse(null);

        if (stored == null) {
            RefreshProgress started = RefreshProgress.start(LocalDate.now(KOREA), source);
            saveProgress(started);
            com.example.loark.config.ApplicationLog.infof(
                    "[CHARACTER DAILY] First refresh started: date=%s / total=%d%n",
                    started.runDate(), started.total());
            return started;
        }
        if (source.hash().equals(stored.listHash()) && stored.total() == source.names().size()) {
            return stored.normalized();
        }

        int nextIndex = stored.currentName() == null
                ? 0
                : source.names().indexOf(stored.currentName());
        RefreshProgress relocated = new RefreshProgress(
                stored.runDate(),
                Math.max(0, nextIndex),
                source.names().size(),
                stored.succeeded(),
                stored.skipped(),
                0,
                nextIndex < 0 ? null : stored.currentName(),
                source.hash(),
                null
        );
        saveProgress(relocated);
        com.example.loark.config.ApplicationLog.infof(
                "[CHARACTER DAILY] Character list changed; progress relocated to %d/%d%n",
                relocated.nextIndex(), relocated.total());
        return relocated;
    }

    private void saveProgress(RefreshProgress progress) {
        persistentCache.save(PROGRESS_KEY, objectMapper.valueToTree(progress), 0);
    }

    private CharacterList characterList() {
        CharacterList loaded = characterList;
        if (loaded != null) return loaded;
        synchronized (this) {
            if (characterList == null) characterList = loadCharacterList();
            return characterList;
        }
    }

    private CharacterList loadCharacterList() {
        Set<String> uniqueNames = new LinkedHashSet<>();
        ClassPathResource resource = new ClassPathResource(CHARACTER_RESOURCE);
        try (InputStream input = resource.getInputStream();
             JsonParser parser = objectMapper.createParser(input)) {
            while (parser.nextToken() != null) {
                if (parser.currentToken() != JsonToken.PROPERTY_NAME
                        || !"character_names".equals(parser.currentName())
                        || parser.nextToken() != JsonToken.START_ARRAY) {
                    continue;
                }
                while (parser.nextToken() != JsonToken.END_ARRAY) {
                    if (parser.currentToken() != JsonToken.VALUE_STRING) {
                        parser.skipChildren();
                        continue;
                    }
                    String name = parser.getString().trim();
                    if (!name.isBlank()) uniqueNames.add(name);
                }
            }
        } catch (Exception error) {
            throw new IllegalStateException("kloa_characters.json을 읽지 못했습니다.", error);
        }

        List<String> names = new ArrayList<>(uniqueNames);
        String hash = hashNames(names);
        com.example.loark.config.ApplicationLog.infof(
                "[CHARACTER DAILY] Character list loaded: unique=%d%n", names.size());
        return new CharacterList(List.copyOf(names), hash);
    }

    private String hashNames(List<String> names) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String name : names) {
                digest.update(name.getBytes(StandardCharsets.UTF_8));
                digest.update((byte) 0);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception error) {
            throw new IllegalStateException("캐릭터 목록 해시 생성 실패", error);
        }
    }

    record CharacterList(List<String> names, String hash) {}

    record RefreshProgress(
            String runDate,
            int nextIndex,
            int total,
            int succeeded,
            int skipped,
            int consecutiveFailures,
            String currentName,
            String listHash,
            Instant pausedUntil
    ) {
        static RefreshProgress start(LocalDate runDate, CharacterList source) {
            return new RefreshProgress(runDate.toString(), 0, source.names().size(),
                    0, 0, 0, null, source.hash(), null);
        }

        RefreshProgress normalized() {
            return new RefreshProgress(runDate, Math.max(0, Math.min(nextIndex, total)), total,
                    Math.max(0, succeeded), Math.max(0, skipped), Math.max(0, consecutiveFailures),
                    currentName, listHash, pausedUntil);
        }

        boolean completed() {
            return nextIndex >= total;
        }

        boolean isPaused() {
            return pausedUntil != null && Instant.now().isBefore(pausedUntil);
        }

        RefreshProgress withCurrentName(String name) {
            return new RefreshProgress(runDate, nextIndex, total, succeeded, skipped,
                    consecutiveFailures, name, listHash, null);
        }

        RefreshProgress advanceSucceeded() {
            return new RefreshProgress(runDate, nextIndex + 1, total, succeeded + 1, skipped,
                    0, null, listHash, null);
        }

        RefreshProgress advanceSkipped() {
            return new RefreshProgress(runDate, nextIndex + 1, total, succeeded, skipped + 1,
                    0, null, listHash, null);
        }

        RefreshProgress failed() {
            return new RefreshProgress(runDate, nextIndex, total, succeeded, skipped,
                    consecutiveFailures + 1, currentName, listHash, null);
        }

        RefreshProgress pausedUntil(Instant value) {
            return new RefreshProgress(runDate, nextIndex, total, succeeded, skipped,
                    consecutiveFailures, currentName, listHash, value);
        }
    }
}
