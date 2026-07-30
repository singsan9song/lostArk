package com.example.loark.auction;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AbilityStoneAuctionService {
    private static final String ITEM_NAME = "위대한 비상의 돌";
    private static final String PENALTY = "방어력 감소";
    private static final List<Configuration> CONFIGURATIONS = List.of(
            new Configuration("dealer", "원한 + 아드레날린", List.of(new Engraving(118, "원한"), new Engraving(299, "아드레날린")), true),
            new Configuration("support-ether", "각성 + 구슬동자", List.of(new Engraving(255, "각성"), new Engraving(134, "구슬동자")), false)
    );

    private final RestClient client;
    private final PersistentApiCache persistentCache;
    private final ObjectMapper objectMapper;
    private final Cache<String, AbilityStoneAuctionValue> cache;
    private final Cache<String, Long> configurationPriceCache;
    private final AbilityStonePriceObservationRepository observations;

    public AbilityStoneAuctionService(RestClient lostArkRestClient, PersistentApiCache persistentCache,
                                      AbilityStonePriceObservationRepository observations,
                                      ObjectMapper objectMapper,
                                      @Value("${app.auction-cache-ttl-seconds:900}") long ttlSeconds) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
        this.objectMapper = objectMapper;
        this.observations = observations;
        Caffeine<Object, Object> builder = Caffeine.newBuilder().maximumSize(2);
        if (ttlSeconds > 0) builder.expireAfterWrite(Duration.ofSeconds(ttlSeconds));
        this.cache = builder.build();
        Caffeine<Object, Object> priceBuilder = Caffeine.newBuilder().maximumSize(10);
        if (ttlSeconds > 0) priceBuilder.expireAfterWrite(Duration.ofSeconds(ttlSeconds));
        this.configurationPriceCache = priceBuilder.build();
    }

    public AbilityStoneAuctionValue getValue() {
        AbilityStoneAuctionValue cached = cache.getIfPresent(ITEM_NAME);
        if (cached != null) return cached;
        AbilityStoneAuctionValue stored = storedValue();
        if (stored == null) {
            throw new IllegalStateException("어빌리티 스톤 시세 초기 수집이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
        }
        cache.put(ITEM_NAME, stored);
        return stored;
    }

    public void clearCache() {
        cache.invalidateAll();
        configurationPriceCache.invalidateAll();
    }

    @Scheduled(
            fixedRateString = "${app.ability-stone-refresh-interval-ms:60000}",
            initialDelayString = "${app.ability-stone-refresh-initial-delay-ms:5000}"
    )
    synchronized void refreshValue() {
        try {
            configurationPriceCache.invalidateAll();
            AbilityStoneAuctionValue value = load();
            persistentCache.save("auction-summary|ability-stone", objectMapper.valueToTree(value), 0);
            cache.put(ITEM_NAME, value);
            com.example.loark.config.ApplicationLog.infof(
                    "[LOSTARK AUCTION] Ability-stone summary refreshed: configurations=%d%n",
                    value.configurations().size());
        } catch (RuntimeException error) {
            com.example.loark.config.ApplicationLog.infof(
                    "[LOSTARK AUCTION] Ability-stone summary refresh failed: %s%n",
                    error.getMessage());
        }
    }

    private AbilityStoneAuctionValue storedValue() {
        return persistentCache.findLastSuccess("auction-summary|ability-stone").flatMap(node -> {
            try {
                return java.util.Optional.of(
                        objectMapper.readValue(node.toString(), AbilityStoneAuctionValue.class));
            } catch (Exception error) {
                return java.util.Optional.empty();
            }
        }).orElse(null);
    }

    private AbilityStoneAuctionValue load() {
        List<AbilityStoneAuctionValue.ConfigurationPrice> prices = CONFIGURATIONS.parallelStream()
                .map(configuration -> new AbilityStoneAuctionValue.ConfigurationPrice(
                        configuration.id(), configuration.name(),
                        configuration.engravings().stream().map(Engraving::name).toList(),
                        configuration.fixedDefenseReduction() ? PENALTY : "감소 효과 전체", requestMinimumPrice(configuration)
                )).toList();

        AbilityStoneAuctionValue.ConfigurationPrice support = prices.stream()
                .filter(price -> price.id().startsWith("support-"))
                .max(Comparator.comparingLong(AbilityStoneAuctionValue.ConfigurationPrice::currentMinPrice))
                .orElse(prices.get(1));
        AbilityStoneAuctionValue.ConfigurationPrice selected = prices.stream()
                .max(Comparator.comparingLong(AbilityStoneAuctionValue.ConfigurationPrice::currentMinPrice))
                .orElse(prices.get(0));

        Instant sampledAt = Instant.now();
        prices.forEach(price -> observations.save(new AbilityStonePriceObservation(price, sampledAt)));
        return new AbilityStoneAuctionValue(
                ITEM_NAME, "고대", 4,
                selected.currentMinPrice(), selected.id(), selected.name(), selected.penalty(),
                support.id(), support.name(), sampledAt, prices
        );
    }

    private long requestMinimumPrice(Configuration configuration) {
        Long cached = configurationPriceCache.getIfPresent(configuration.id());
        if (cached != null) return cached;

        Long loaded = configurationPriceCache.get(configuration.id(), key -> loadMinimumPrice(configuration));
        return loaded == null ? 0 : loaded;
    }

    private long loadMinimumPrice(Configuration configuration) {
        String persistentKey = "auction|ability-stone|" + configuration.id();
        List<Map<String, Object>> options = new java.util.ArrayList<>();
        configuration.engravings().forEach(engraving -> options.add(option(3, engraving.code())));
        if (configuration.fixedDefenseReduction()) options.add(option(6, 801));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("Sort", "BUY_PRICE");
        body.put("CategoryCode", 30000);
        body.put("ItemTier", 4);
        body.put("PageNo", 1);
        body.put("SortCondition", "ASC");
        body.put("EtcOptions", options);

        JsonNode response;
        String description = "경매장 어빌리티 스톤: " + ITEM_NAME + " / " + configuration.name();
        try {
            response = LostArkRequestContext.call(description,
                    () -> client.post().uri("/auctions/items").body(body).retrieve().body(JsonNode.class));
            if (response != null) persistentCache.save(persistentKey, response);
        } catch (RestClientResponseException error) {
            throw error;
        }
        if (response == null) throw new IllegalStateException("어빌리티 스톤 경매장 응답이 비어 있습니다: " + configuration.id());
        long minimum = Long.MAX_VALUE;
        for (JsonNode item : response.path("Items")) {
            if (!ITEM_NAME.equals(item.path("Name").asText()) || !"고대".equals(item.path("Grade").asText()) || item.path("Tier").asInt() != 4) continue;
            long buyPrice = item.path("AuctionInfo").path("BuyPrice").asLong();
            if (buyPrice > 0) minimum = Math.min(minimum, buyPrice);
        }
        return minimum == Long.MAX_VALUE ? 0 : minimum;
    }

    private Map<String, Object> option(int firstOption, int secondOption) {
        Map<String, Object> option = new LinkedHashMap<>();
        option.put("FirstOption", firstOption);
        option.put("SecondOption", secondOption);
        option.put("MinValue", null);
        option.put("MaxValue", null);
        return option;
    }

    private record Engraving(int code, String name) {}
    private record Configuration(String id, String name, List<Engraving> engravings, boolean fixedDefenseReduction) {}
}
