package com.example.loark.config;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
public class LostArkApiRequestCounter {
    private static final int MAX_HISTORY_WINDOWS = 120;
    private final CopyOnWriteArrayList<SseEmitter> subscribers = new CopyOnWriteArrayList<>();
    private final ArrayDeque<RequestRecord> history = new ArrayDeque<>();
    private long count;
    private long limit;
    private long remaining;
    private Instant resetsAt;
    private long historyVersion;

    public Status increment() {
        Status status;
        synchronized (this) {
            resetIfDue();
            count++;
            if (limit > 0 && remaining > 0) remaining--;
            status = statusUnsafe();
        }
        publish(status);
        return status;
    }

    public void completeRequest(Instant requestedAt, String method, String target, String description,
                                int statusCode, long elapsedMs, String limitHeader,
                                String remainingHeader, String resetHeader, String error) {
        Long responseLimit = number(limitHeader);
        Long responseRemaining = number(remainingHeader);
        Instant responseReset = instant(resetHeader);

        Status status;
        synchronized (this) {
            resetIfDue();
            if (responseLimit != null && responseRemaining != null && responseReset != null
                    && responseReset.isAfter(Instant.now())) {
                if (resetsAt == null || responseReset.isAfter(resetsAt)) {
                    limit = Math.max(0, responseLimit);
                    remaining = Math.max(0, Math.min(limit, responseRemaining));
                    resetsAt = responseReset;
                } else if (responseReset.equals(resetsAt)) {
                    limit = Math.max(0, responseLimit);
                    remaining = Math.min(remaining, Math.max(0, Math.min(limit, responseRemaining)));
                }
                count = Math.max(0, limit - remaining);
            }

            history.addLast(new RequestRecord(
                    requestedAt == null ? Instant.now() : requestedAt,
                    Instant.now(),
                    method, target, description, statusCode, elapsedMs,
                    responseLimit == null ? 0 : responseLimit,
                    responseRemaining == null ? 0 : responseRemaining,
                    responseReset,
                    error == null ? "" : error
            ));
            pruneHistory();
            historyVersion++;
            status = statusUnsafe();
        }
        publish(status);
    }

    public synchronized List<MinuteHistory> history() {
        pruneHistory();
        List<RequestRecord> records = new ArrayList<>(history);
        records.sort(Comparator.comparing(RequestRecord::completedAt).reversed());
        Map<Instant, List<RequestRecord>> grouped = new LinkedHashMap<>();
        for (RequestRecord record : records) {
            Instant reset = windowReset(record);
            if (!grouped.containsKey(reset) && grouped.size() >= MAX_HISTORY_WINDOWS) break;
            grouped.computeIfAbsent(reset, ignored -> new ArrayList<>()).add(record);
        }
        return grouped.entrySet().stream().map(entry -> {
            int succeeded = (int) entry.getValue().stream()
                    .filter(record -> record.statusCode() >= 200 && record.statusCode() < 400)
                    .count();
            return new MinuteHistory(entry.getKey().minusSeconds(60), entry.getKey(),
                    entry.getValue().size(), succeeded, entry.getValue().size() - succeeded);
        }).toList();
    }

    public synchronized List<RequestRecord> historyDetails(Instant resetAt) {
        pruneHistory();
        if (resetAt == null) return List.of();
        return history.stream()
                .filter(record -> resetAt.equals(windowReset(record)))
                .sorted(remainingOrder())
                .toList();
    }

    public synchronized SearchHistoryResult searchHistory(String query, int page, int size) {
        pruneHistory();
        String normalized = Objects.toString(query, "").trim().toLowerCase(Locale.ROOT);
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, Math.min(size, 500));
        List<RequestRecord> matches = history.stream()
                .filter(record -> normalized.isBlank() || searchableText(record).contains(normalized))
                .sorted(Comparator.comparing(this::windowReset).reversed()
                        .thenComparing(remainingOrder()))
                .toList();
        int from = Math.min(matches.size(), safePage * safeSize);
        int to = Math.min(matches.size(), from + safeSize);
        return new SearchHistoryResult(matches.size(), safePage, safeSize,
                List.copyOf(matches.subList(from, to)));
    }

    public synchronized Status status() {
        resetIfDue();
        return statusUnsafe();
    }

    public synchronized boolean hasCapacity(int reserve) {
        resetIfDue();
        return limit <= 0 || remaining > Math.max(0, reserve);
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        subscribers.add(emitter);
        emitter.onCompletion(() -> subscribers.remove(emitter));
        emitter.onTimeout(() -> subscribers.remove(emitter));
        emitter.onError(error -> subscribers.remove(emitter));
        send(emitter, status());
        return emitter;
    }

    @Scheduled(fixedRate = 250)
    void resetAtRateLimitBoundary() {
        Status status;
        boolean changed;
        synchronized (this) {
            changed = resetIfDue();
            status = statusUnsafe();
        }
        if (changed) publish(status);
    }

    private boolean resetIfDue() {
        if (resetsAt == null || Instant.now().isBefore(resetsAt)) return false;
        count = 0;
        remaining = limit;
        resetsAt = null;
        return true;
    }

    private Status statusUnsafe() {
        return new Status(count, limit, remaining, resetsAt, historyVersion);
    }

    private void pruneHistory() {
        Instant cutoff = Instant.now().minus(MAX_HISTORY_WINDOWS + 5L, ChronoUnit.MINUTES);
        while (!history.isEmpty() && history.peekFirst().completedAt().isBefore(cutoff)) {
            history.removeFirst();
        }
    }

    private Instant windowReset(RequestRecord record) {
        if (record.resetsAt() != null) return record.resetsAt();
        return record.completedAt().truncatedTo(ChronoUnit.MINUTES).plusSeconds(60);
    }

    private String searchableText(RequestRecord record) {
        return String.join(" ",
                Objects.toString(record.method(), ""),
                Objects.toString(record.target(), ""),
                Objects.toString(record.description(), ""),
                Objects.toString(record.error(), ""),
                record.statusCode() == 0 ? "요청 실패" : "http " + record.statusCode()
        ).toLowerCase(Locale.ROOT);
    }

    private Comparator<RequestRecord> remainingOrder() {
        return Comparator.comparingLong(RequestRecord::remaining).reversed()
                .thenComparing(RequestRecord::completedAt);
    }

    private Long number(String value) {
        try {
            if (value == null || value.isBlank() || "-".equals(value)) return null;
            return Long.parseLong(value.replace(",", "").trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private Instant instant(String value) {
        Long timestamp = number(value);
        if (timestamp == null) return null;
        return timestamp > 10_000_000_000L
                ? Instant.ofEpochMilli(timestamp)
                : Instant.ofEpochSecond(timestamp);
    }

    private void publish(Status status) {
        subscribers.forEach(emitter -> send(emitter, status));
    }

    private void send(SseEmitter emitter, Status status) {
        try {
            emitter.send(SseEmitter.event().name("api-requests").data(status));
        } catch (IOException | IllegalStateException error) {
            subscribers.remove(emitter);
            emitter.complete();
        }
    }

    public record Status(long count, long limit, long remaining, Instant resetsAt, long historyVersion) {}
    public record MinuteHistory(Instant minuteStartedAt, Instant resetsAt, int count,
                                int successCount, int failureCount) {}
    public record SearchHistoryResult(long totalElements, int page, int size,
                                      List<RequestRecord> requests) {}
    public record RequestRecord(Instant requestedAt, Instant completedAt, String method,
                                String target, String description, int statusCode, long elapsedMs,
                                long limit, long remaining, Instant resetsAt, String error) {}
}
