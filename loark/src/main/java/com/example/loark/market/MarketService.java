package com.example.loark.market;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PreDestroy;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;

@Service
public class MarketService {
    private static final int HONING_MATERIAL_CATEGORY_CODE = 50000;
    private static final int ARK_GRID_MATERIAL_CATEGORY_CODE = 230000;

    private final RestClient client;
    private final PersistentApiCache persistentCache;
    private final ObjectMapper objectMapper;
    private final MarketPriceObservationRepository observations;
    private final Cache<String, Optional<MarketPrice>> cache;
    private final long ttlSeconds;
    private final boolean backgroundRefreshEnabled;
    private final long requestSpacingNanos;
    // Background sweep (refreshKnownPrices) and lazily-queued stale-cache refreshes run here.
    // Kept separate from userRequestExecutor so a busy background sweep never makes a
    // user-triggered price request wait behind it for a free thread.
    private final ExecutorService backgroundExecutor;
    // User-facing price lookups (prices()) run here so they are dispatched immediately
    // regardless of how much background refresh work is queued.
    private final ExecutorService userRequestExecutor;
    private final Set<String> queuedRefreshes = ConcurrentHashMap.newKeySet();
    private final Object requestPermitLock = new Object();
    private long nextRequestPermitNanos;

    public MarketService(@Qualifier("marketLostArkRestClient") RestClient lostArkRestClient,
                         PersistentApiCache persistentCache,
                         MarketPriceObservationRepository observations,
                         ObjectMapper objectMapper,
                         @Value("${app.market-cache-ttl-seconds:5}") long ttlSeconds,
                         @Value("${app.market-refresh.enabled:true}") boolean backgroundRefreshEnabled,
                         @Value("${app.market-refresh-min-interval-ms:10}") long refreshMinIntervalMs,
                         @Value("${app.market-refresh-concurrency:20}") int refreshConcurrency,
                         @Value("${app.market-user-request-concurrency:30}") int userRequestConcurrency) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
        this.observations = observations;
        this.objectMapper = objectMapper;
        this.ttlSeconds = Math.max(0, ttlSeconds);
        this.backgroundRefreshEnabled = backgroundRefreshEnabled;
        this.requestSpacingNanos = Duration.ofMillis(Math.max(0, refreshMinIntervalMs)).toNanos();
        Caffeine<Object, Object> builder = Caffeine.newBuilder().maximumSize(500);
        if (ttlSeconds > 0) builder.expireAfterWrite(Duration.ofSeconds(ttlSeconds));
        this.cache = builder.build();
        int concurrency = Math.max(1, Math.min(64, refreshConcurrency));
        AtomicInteger backgroundThreadNumber = new AtomicInteger();
        this.backgroundExecutor = Executors.newFixedThreadPool(concurrency, runnable -> {
            Thread thread = new Thread(runnable,
                    "market-background-refresh-" + backgroundThreadNumber.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        });
        int userConcurrency = Math.max(1, Math.min(64, userRequestConcurrency));
        AtomicInteger userThreadNumber = new AtomicInteger();
        this.userRequestExecutor = Executors.newFixedThreadPool(userConcurrency, runnable -> {
            Thread thread = new Thread(runnable,
                    "market-user-request-" + userThreadNumber.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        });
    }

    public Map<String, MarketPrice> prices(List<String> names) {
        return prices(names, false);
    }

    public Map<String, MarketPrice> prices(List<String> names, boolean refresh) {
        List<String> requestedNames = names.stream()
                .map(String::trim)
                .filter(name -> !name.isBlank())
                .distinct()
                .limit(30)
                .toList();
        List<CompletableFuture<Optional<MarketPrice>>> futures = requestedNames.stream()
                .map(name -> CompletableFuture.supplyAsync(
                        () -> refresh ? request(name, true) : find(name),
                        userRequestExecutor))
                .toList();
        Map<String, MarketPrice> result = new LinkedHashMap<>();
        for (int index = 0; index < requestedNames.size(); index++) {
            String name = requestedNames.get(index);
            try {
                futures.get(index).join().ifPresent(value -> {
                    result.put(name, value);
                    if (refresh) cache.put(name, Optional.of(value));
                });
            } catch (CompletionException error) {
                Throwable cause = error.getCause();
                if (cause instanceof RuntimeException runtime) throw runtime;
                throw error;
            }
        }
        return result;
    }

    public List<MarketPrice> searchMarket(String query) {
        return searchMarket(query, false);
    }

    public List<MarketPrice> searchMarket(String query, boolean refresh) {
        String normalized = query == null ? "" : query.trim();
        if (normalized.length() < 2) return List.of();

        String cacheKey = "market-search|" + normalized.toLowerCase();
        JsonNode cached = refresh ? null : persistentCache.findFresh(cacheKey).orElse(null);
        if (cached != null) {
            return marketSearchItems(cached).stream()
                    .filter(price -> normalized.equals(price.name()))
                    .limit(30)
                    .toList();
        }

        LinkedHashMap<String, MarketPrice> found = new LinkedHashMap<>();
        List<Integer> categories = categoryCandidates(normalized, normalized).stream().limit(6).toList();
        for (int categoryCode : categories) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("Sort", "CURRENT_MIN_PRICE");
            body.put("CategoryCode", categoryCode);
            body.put("ItemTier", null);
            body.put("ItemGrade", null);
            body.put("ItemName", normalized);
            body.put("PageNo", 1);
            body.put("SortCondition", "ASC");
            try {
                awaitRequestPermit();
                JsonNode response = LostArkRequestContext.call(
                        "거래소 아이템 검색: " + normalized + " | category=" + categoryCode,
                        () -> client.post().uri("/markets/items").body(body).retrieve().body(JsonNode.class));
                marketSearchItems(response).stream()
                        .filter(price -> normalized.equals(price.name()))
                        .forEach(price ->
                        found.putIfAbsent(price.name() + "|" + price.grade(), price));
                if (found.size() >= 30) break;
            } catch (RestClientResponseException ignored) {
                // Continue with the next market category.
            }
        }
        if (found.isEmpty()) {
            return persistentCache.findLastSuccess(cacheKey)
                    .map(this::marketSearchItems)
                    .orElseGet(List::of)
                    .stream()
                    .filter(price -> normalized.equals(price.name()))
                    .limit(30)
                    .toList();
        }
        JsonNode payload = marketSearchPayload(found.values());
        persistentCache.save(cacheKey, payload, ttlSeconds);
        found.values().forEach(price -> {
            String lookupKey = price.name()
                    + (price.grade() == null || price.grade().isBlank() ? "" : "|" + price.grade());
            persistentCache.save("market|" + lookupKey, payload, ttlSeconds);
            observations.save(new MarketPriceObservation(price));
            cache.put(lookupKey, Optional.of(price));
        });
        return found.values().stream().limit(30).toList();
    }

    private List<MarketPrice> marketSearchItems(JsonNode response) {
        if (response == null) return List.of();
        List<MarketPrice> result = new ArrayList<>();
        JsonNode items = response.has("Items") ? response.path("Items") : response;
        if (items.isArray()) items.forEach(item -> {
            if (item.path("CurrentMinPrice").asLong(0) > 0) result.add(toPrice(item));
        });
        return result;
    }

    private JsonNode marketSearchPayload(java.util.Collection<MarketPrice> prices) {
        var array = objectMapper.createArrayNode();
        prices.forEach(price -> {
            ObjectNode item = array.addObject();
            item.put("Id", price.id());
            item.put("Name", price.name());
            item.put("Grade", price.grade());
            item.put("Icon", price.icon());
            item.put("CurrentMinPrice", price.currentMinPrice());
            item.put("RecentPrice", price.recentPrice());
            item.put("YDayAvgPrice", price.yDayAvgPrice());
            item.put("BundleCount", price.bundleCount());
        });
        return array;
    }

    private Optional<MarketPrice> find(String itemName) {
        Optional<MarketPrice> cached = cache.getIfPresent(itemName);
        if (cached != null) return cached;

        Optional<MarketPrice> loaded = cache.get(itemName, key -> {
            Optional<MarketPrice> stored = storedPrice(key, false);
            if (stored.isPresent()) {
                if (storedPrice(key, true).isEmpty()) queueRefresh(key);
                return stored;
            }
            Optional<MarketPrice> found = request(key);
            return found.isPresent() ? found : null;
        });
        return loaded == null ? Optional.empty() : loaded;
    }

    private Optional<MarketPrice> storedPrice(String lookupKey, boolean freshOnly) {
        String[] lookup = lookupKey.split("\\|", 2);
        String itemName = lookup[0].trim();
        String itemGrade = lookup.length > 1 ? lookup[1].trim() : "";
        String persistentKey = "market|" + lookupKey;
        return (freshOnly
                ? persistentCache.findFresh(persistentKey)
                : persistentCache.findLastSuccess(persistentKey))
                .flatMap(response -> matchingPrice(response, itemName, itemGrade));
    }

    private void queueRefresh(String lookupKey) {
        if (!queuedRefreshes.add(lookupKey)) return;
        backgroundExecutor.execute(() -> {
            try {
                Optional<MarketPrice> refreshed = request(lookupKey);
                refreshed.ifPresent(price -> cache.put(lookupKey, Optional.of(price)));
            } catch (RuntimeException error) {
                com.example.loark.config.ApplicationLog.infof("[LOSTARK MARKET] Background refresh failed: %s / %s%n",
                        lookupKey, error.getMessage());
            } finally {
                queuedRefreshes.remove(lookupKey);
            }
        });
    }

    @Scheduled(
            fixedDelayString = "${app.market-refresh-interval-ms:5000}",
            initialDelayString = "${app.market-refresh-initial-delay-ms:5000}"
    )
    void refreshKnownPrices() {
        if (!backgroundRefreshEnabled) return;
        persistentCache.keysBySource("market").stream()
                .filter(key -> key.startsWith("market|"))
                .map(key -> key.substring("market|".length()))
                .forEach(this::queueRefresh);
    }

    @PreDestroy
    void stopRefreshExecutor() {
        backgroundExecutor.shutdownNow();
        userRequestExecutor.shutdownNow();
    }

    public void clearCache() {
        cache.invalidateAll();
    }

    private Optional<MarketPrice> request(String lookupKey) {
        return request(lookupKey, false);
    }

    private Optional<MarketPrice> request(String lookupKey, boolean refresh) {
        String[] lookup = lookupKey.split("\\|", 2);
        String itemName = lookup[0].trim();
        String itemGrade = lookup.length > 1 ? lookup[1].trim() : "";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("Sort", "CURRENT_MIN_PRICE");
        // The API rejects a null category with HTTP 400. Keep honing materials
        // and Ark Grid gems in their respective market categories.
        body.put("CategoryCode", categoryCode(itemName));
        // Exact item names distinguish materials across tiers, and some items
        // such as Ark Grid gems do not expose a Tier value at all.
        body.put("ItemTier", null);
        body.put("ItemGrade", itemGrade.isBlank() ? null : itemGrade);
        body.put("ItemName", itemName);
        body.put("PageNo", 1);
        body.put("SortCondition", "ASC");
        String persistentKey = "market|" + lookupKey;

        try {
            JsonNode response = refresh ? null : persistentCache.findFresh(persistentKey).orElse(null);
            Optional<MarketPrice> cachedPrice = matchingPrice(response, itemName, itemGrade);
            if (cachedPrice.isPresent()) return cachedPrice;

            // A 200 response with an empty Items array is not useful price
            // data. Ignore previously persisted empty responses and retry.
            if (response == null || cachedPrice.isEmpty()) {
                for (int categoryCode : categoryCandidates(itemName, lookupKey)) {
                    body.put("CategoryCode", categoryCode);
                    String description = "거래소 아이템: " + itemName
                            + (itemGrade.isBlank() ? "" : " [" + itemGrade + "]")
                            + " | category=" + categoryCode;
                    awaitRequestPermit();
                    response = LostArkRequestContext.call(description,
                            () -> client.post().uri("/markets/items").body(body).retrieve().body(JsonNode.class));
                    Optional<MarketPrice> loadedPrice = matchingPrice(response, itemName, itemGrade);
                    if (loadedPrice.isPresent()) {
                        persistentCache.save(persistentKey, response, ttlSeconds);
                        observations.save(new MarketPriceObservation(loadedPrice.get()));
                        saveDiscoveredCategory(lookupKey, categoryCode);
                        com.example.loark.config.ApplicationLog.infof("[LOSTARK MARKET] Category discovered: %s -> %d%n", itemName, categoryCode);
                        return loadedPrice;
                    }
                }
                com.example.loark.config.ApplicationLog.infof("[LOSTARK CACHE] Empty market result was not cached: %s [%s]%n",
                        itemName, itemGrade.isBlank() ? "등급 전체" : itemGrade);
            }
            return Optional.empty();
        } catch (RestClientResponseException error) {
            return persistentCache.findLastSuccess(persistentKey)
                    .flatMap(response -> matchingPrice(response, itemName, itemGrade));
        }
    }

    private Optional<MarketPrice> matchingPrice(JsonNode response, String itemName, String itemGrade) {
        if (response == null) return Optional.empty();
        List<JsonNode> items = new ArrayList<>();
        JsonNode rows = response.has("Items") ? response.path("Items") : response;
        rows.forEach(items::add);
        return items.stream()
                .filter(item -> itemName.equals(item.path("Name").asText()))
                .filter(item -> itemGrade.isBlank() || itemGrade.equals(item.path("Grade").asText()))
                .findFirst()
                .map(this::toPrice);
    }

    private int categoryCode(String itemName) {
        return isArkGridGem(itemName)
                ? ARK_GRID_MATERIAL_CATEGORY_CODE
                : HONING_MATERIAL_CATEGORY_CODE;
    }

    private List<Integer> categoryCandidates(String itemName, String lookupKey) {
        // A previously discovered category is where this item actually lives.
        // If it has no listings right now, that means the item is simply out
        // of stock, not that we guessed the wrong category - scanning every
        // other category would just waste API calls for nothing.
        Optional<Integer> discovered = discoveredCategory(lookupKey);
        if (discovered.isPresent()) return List.of(discovered.get());

        Set<Integer> candidates = new LinkedHashSet<>();
        candidates.add(categoryCode(itemName));

        List<MarketCategory> options = new ArrayList<>(marketCategories());
        options.sort(Comparator.comparingInt((MarketCategory option) -> categoryScore(itemName, option)).reversed());
        options.forEach(option -> candidates.add(option.code()));
        return new ArrayList<>(candidates);
    }

    private Optional<Integer> discoveredCategory(String lookupKey) {
        return persistentCache.findLastSuccess("market-category|" + lookupKey)
                .map(node -> node.path("CategoryCode").asInt(0))
                .filter(code -> code > 0);
    }

    private void saveDiscoveredCategory(String lookupKey, int categoryCode) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("CategoryCode", categoryCode);
        persistentCache.save("market-category|" + lookupKey, payload);
    }

    private List<MarketCategory> marketCategories() {
        String cacheKey = "market-options";
        JsonNode response = persistentCache.findLastSuccess(cacheKey).orElse(null);
        if (response == null) {
            try {
                awaitRequestPermit();
                response = LostArkRequestContext.call("거래소 카테고리 옵션",
                        () -> client.get().uri("/markets/options").retrieve().body(JsonNode.class));
                if (response != null) persistentCache.save(cacheKey, response);
            } catch (RestClientResponseException error) {
                return List.of();
            }
        }

        Map<Integer, MarketCategory> categories = new LinkedHashMap<>();
        collectMarketCategories(response, categories);
        return new ArrayList<>(categories.values());
    }

    private void awaitRequestPermit() {
        if (requestSpacingNanos <= 0) return;
        long waitNanos;
        synchronized (requestPermitLock) {
            long now = System.nanoTime();
            long permitAt = Math.max(now, nextRequestPermitNanos);
            waitNanos = permitAt - now;
            nextRequestPermitNanos = permitAt + requestSpacingNanos;
        }
        if (waitNanos > 0) LockSupport.parkNanos(waitNanos);
    }

    private void collectMarketCategories(JsonNode node, Map<Integer, MarketCategory> categories) {
        if (node == null || node.isMissingNode() || node.isNull()) return;
        int code = node.path("Code").asInt(0);
        String name = node.path("CodeName").asText("").trim();
        if (code > 0 && !name.isBlank()) categories.putIfAbsent(code, new MarketCategory(code, name));
        node.forEach(child -> collectMarketCategories(child, categories));
    }

    private int categoryScore(String itemName, MarketCategory category) {
        String categoryName = category.name();
        if ((itemName.contains("얼굴") || itemName.contains("머리") || itemName.contains("의상"))
                && categoryName.contains("아바타")) return 100;
        if (itemName.contains("펫") && categoryName.contains("펫")) return 100;
        if (itemName.contains("탈것") && categoryName.contains("탈것")) return 100;
        if (itemName.contains("카드") && categoryName.contains("카드")) return 100;
        if (itemName.contains("젬") && categoryName.contains("젬")) return 100;
        if (category.code() == categoryCode(itemName)) return 50;
        return 0;
    }

    private record MarketCategory(int code, String name) {}

    private boolean isArkGridGem(String itemName) {
        return itemName.contains("젬");
    }

    private MarketPrice toPrice(JsonNode item) {
        return new MarketPrice(
                item.path("Id").asLong(),
                item.path("Name").asText(),
                item.path("Grade").asText(),
                item.path("Icon").asText(),
                item.path("CurrentMinPrice").asLong(),
                item.path("RecentPrice").asLong(),
                item.path("YDayAvgPrice").asDouble(),
                Math.max(1, item.path("BundleCount").asInt(1))
        );
    }
}
