package com.example.loark.auction;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuctionItemSearchService {
    private static final List<Integer> CATEGORY_CODES = List.of(10000, 20000, 30000, 40000, 50000);

    private final RestClient client;
    private final PersistentApiCache persistentCache;
    private final ObjectMapper objectMapper;

    public AuctionItemSearchService(
            RestClient lostArkRestClient,
            PersistentApiCache persistentCache,
            ObjectMapper objectMapper
    ) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
        this.objectMapper = objectMapper;
    }

    public List<AuctionSearchItem> searchExact(String itemName) {
        return searchExact(itemName, false);
    }

    public List<AuctionSearchItem> searchExact(String itemName, boolean refresh) {
        String normalized = itemName == null ? "" : itemName.trim();
        if (normalized.length() < 2) return List.of();

        String cacheKey = "auction-search|" + normalized.toLowerCase();
        JsonNode cached = refresh ? null : persistentCache.findFresh(cacheKey).orElse(null);
        if (cached != null) return parse(cached, normalized);

        Map<String, AuctionSearchItem> found = new LinkedHashMap<>();
        for (int categoryCode : CATEGORY_CODES) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("Sort", "BUY_PRICE");
            body.put("CategoryCode", categoryCode);
            body.put("ItemTier", null);
            body.put("ItemGrade", null);
            body.put("ItemName", normalized);
            body.put("PageNo", 1);
            body.put("SortCondition", "ASC");
            body.put("EtcOptions", List.of());
            try {
                JsonNode response = LostArkRequestContext.call(
                        "경매장 아이템 정확 검색: " + normalized + " | category=" + categoryCode,
                        () -> client.post().uri("/auctions/items").body(body).retrieve().body(JsonNode.class)
                );
                parse(response, normalized).forEach(item -> {
                    String key = item.name() + "|" + item.grade() + "|" + item.tier();
                    AuctionSearchItem current = found.get(key);
                    if (current == null || item.currentMinPrice() < current.currentMinPrice())
                        found.put(key, item);
                });
            } catch (RestClientResponseException ignored) {
                // Some item types are unavailable in a category; continue with the next one.
            }
        }
        if (found.isEmpty()) {
            return persistentCache.findLastSuccess(cacheKey)
                    .map(response -> parse(response, normalized))
                    .orElseGet(List::of);
        }
        JsonNode payload = payload(found.values());
        persistentCache.save(cacheKey, payload, 300);
        return found.values().stream().limit(30).toList();
    }

    private List<AuctionSearchItem> parse(JsonNode response, String exactName) {
        if (response == null) return List.of();
        JsonNode rows = response.has("Items") ? response.path("Items") : response;
        Map<String, AuctionSearchItem> found = new LinkedHashMap<>();
        if (rows.isArray()) rows.forEach(item -> {
            if (!exactName.equals(item.path("Name").asText())) return;
            long buyPrice = item.has("CurrentMinPrice")
                    ? item.path("CurrentMinPrice").asLong()
                    : item.path("AuctionInfo").path("BuyPrice").asLong();
            if (buyPrice <= 0) return;
            AuctionSearchItem result = new AuctionSearchItem(
                    item.path("Id").asLong(),
                    item.path("Name").asText(),
                    item.path("Grade").asText(),
                    item.path("Icon").asText(),
                    item.path("Tier").asInt(),
                    buyPrice,
                    1
            );
            String key = result.name() + "|" + result.grade() + "|" + result.tier();
            AuctionSearchItem current = found.get(key);
            if (current == null || result.currentMinPrice() < current.currentMinPrice())
                found.put(key, result);
        });
        return found.values().stream().limit(30).toList();
    }

    private JsonNode payload(java.util.Collection<AuctionSearchItem> items) {
        ArrayNode array = objectMapper.createArrayNode();
        items.forEach(item -> {
            ObjectNode row = array.addObject();
            row.put("Id", item.id());
            row.put("Name", item.name());
            row.put("Grade", item.grade());
            row.put("Icon", item.icon());
            row.put("Tier", item.tier());
            row.put("CurrentMinPrice", item.currentMinPrice());
            row.put("BundleCount", item.bundleCount());
        });
        return array;
    }

    public record AuctionSearchItem(
            long id,
            String name,
            String grade,
            String icon,
            int tier,
            long currentMinPrice,
            int bundleCount
    ) {}
}
