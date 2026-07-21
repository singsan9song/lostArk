package com.example.loark.market;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
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

@Service
public class MarketService {
    private static final int HONING_MATERIAL_CATEGORY_CODE = 50000;
    private static final int ARK_GRID_MATERIAL_CATEGORY_CODE = 230000;

    private final RestClient client;
    private final PersistentApiCache persistentCache;
    private final ObjectMapper objectMapper;
    private final MarketPriceObservationRepository observations;
    private final Cache<String, Optional<MarketPrice>> cache;

    public MarketService(RestClient lostArkRestClient, PersistentApiCache persistentCache,
                         MarketPriceObservationRepository observations,
                         ObjectMapper objectMapper,
                         @Value("${app.price-cache-ttl-seconds:60}") long ttlSeconds) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
        this.observations = observations;
        this.objectMapper = objectMapper;
        Caffeine<Object, Object> builder = Caffeine.newBuilder().maximumSize(500);
        if (ttlSeconds > 0) builder.expireAfterWrite(Duration.ofSeconds(ttlSeconds));
        this.cache = builder.build();
    }

    public Map<String, MarketPrice> prices(List<String> names) {
        Map<String, MarketPrice> result = new LinkedHashMap<>();
        names.stream().map(String::trim).filter(name -> !name.isBlank()).distinct().limit(30)
                .forEach(name -> find(name).ifPresent(price -> result.put(name, price)));
        return result;
    }

    private Optional<MarketPrice> find(String itemName) {
        Optional<MarketPrice> cached = cache.getIfPresent(itemName);
        if (cached != null) return cached;

        Optional<MarketPrice> loaded = cache.get(itemName, key -> {
            Optional<MarketPrice> found = request(key);
            return found.isPresent() ? found : null;
        });
        return loaded == null ? Optional.empty() : loaded;
    }

    public void clearCache() {
        cache.invalidateAll();
    }

    private Optional<MarketPrice> request(String lookupKey) {
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
            JsonNode response = persistentCache.findFresh(persistentKey).orElse(null);
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
                    response = LostArkRequestContext.call(description,
                            () -> client.post().uri("/markets/items").body(body).retrieve().body(JsonNode.class));
                    Optional<MarketPrice> loadedPrice = matchingPrice(response, itemName, itemGrade);
                    if (loadedPrice.isPresent()) {
                        persistentCache.save(persistentKey, response);
                        observations.save(new MarketPriceObservation(loadedPrice.get()));
                        saveDiscoveredCategory(lookupKey, categoryCode);
                        System.out.printf("[LOSTARK MARKET] Category discovered: %s -> %d%n", itemName, categoryCode);
                        return loadedPrice;
                    }
                }
                System.out.printf("[LOSTARK CACHE] Empty market result was not cached: %s [%s]%n",
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
        response.path("Items").forEach(items::add);
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
        Set<Integer> candidates = new LinkedHashSet<>();
        discoveredCategory(lookupKey).ifPresent(candidates::add);
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
