package com.example.loark.auction;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkRequestContext;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class BraceletAuctionService {
    private static final ItemSpec ANCIENT = new ItemSpec("찬란한 구원자의 팔찌", "고대");
    private static final ItemSpec RELIC = new ItemSpec("고귀한 구원자의 팔찌", "유물");
    private static final int CATEGORY_CODE = 200040;
    private static final int SAMPLE_PAGES = 10;
    private static final int PAGE_SIZE = 10;
    private static final List<PairDefinition> PAIRS = List.of(
            new PairDefinition("critical-specialization", "치명 + 특화", new SearchOption(2, 15, "치명"), new SearchOption(2, 16, "특화"), 0.008166666667),
            new PairDefinition("critical-swiftness", "치명 + 신속", new SearchOption(2, 15, "치명"), new SearchOption(2, 18, "신속"), 0.008166666667),
            new PairDefinition("specialization-swiftness", "특화 + 신속", new SearchOption(2, 16, "특화"), new SearchOption(2, 18, "신속"), 0.008166666667),
            new PairDefinition("mainstat-critical", "힘/민/지 + 치명", new SearchOption(1, 11, "힘/민/지"), new SearchOption(2, 15, "치명"), 0.020416666667),
            new PairDefinition("mainstat-specialization", "힘/민/지 + 특화", new SearchOption(1, 11, "힘/민/지"), new SearchOption(2, 16, "특화"), 0.020416666667),
            new PairDefinition("mainstat-swiftness", "힘/민/지 + 신속", new SearchOption(1, 11, "힘/민/지"), new SearchOption(2, 18, "신속"), 0.020416666667)
    );

    private final RestClient client;
    private final PersistentApiCache persistentCache;
    private final Cache<String, BraceletAuctionSummary> cache;
    private final Cache<String, JsonNode> requestCache;
    private final BraceletPriceObservationRepository observations;

    public BraceletAuctionService(RestClient lostArkRestClient, PersistentApiCache persistentCache,
                                  BraceletPriceObservationRepository observations,
                                  @Value("${app.price-cache-ttl-seconds:60}") long ttlSeconds) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
        this.observations = observations;
        Caffeine<Object, Object> builder = Caffeine.newBuilder().maximumSize(2);
        if (ttlSeconds > 0) builder.expireAfterWrite(Duration.ofSeconds(ttlSeconds));
        this.cache = builder.build();
        Caffeine<Object, Object> requestBuilder = Caffeine.newBuilder().maximumSize(500);
        if (ttlSeconds > 0) requestBuilder.expireAfterWrite(Duration.ofSeconds(ttlSeconds));
        this.requestCache = requestBuilder.build();
    }

    public BraceletAuctionSummary getValue() {
        return getValue(ANCIENT);
    }

    public BraceletAuctionSummary getRelicValue() {
        return getValue(RELIC);
    }

    private BraceletAuctionSummary getValue(ItemSpec itemSpec) {
        BraceletAuctionSummary cached = cache.getIfPresent(itemSpec.name());
        if (cached != null) return cached;
        synchronized (cache) {
            cached = cache.getIfPresent(itemSpec.name());
            if (cached != null) return cached;
            BraceletAuctionSummary summary = load(itemSpec);
            cache.put(itemSpec.name(), summary);
            return summary;
        }
    }

    public void clearCache() {
        cache.invalidateAll();
        requestCache.invalidateAll();
    }

    private BraceletAuctionSummary load(ItemSpec itemSpec) {
        List<PairSample> samples = PAIRS.parallelStream().map(pair -> samplePair(pair, itemSpec)).toList();
        List<BraceletAuctionSummary.OptionPairPrice> prices = samples.stream().map(sample -> {
            double average = trimmedMean(sample.prices());
            return new BraceletAuctionSummary.OptionPairPrice(
                    sample.definition().id(), sample.definition().name(),
                    sample.definition().probability(), sample.definition().probability() * 100,
                    average, average * sample.definition().probability(), sample.prices().size(),
                    "pairQuantileTrimmedMean"
            );
        }).toList();
        double expectedValue = prices.stream().mapToDouble(BraceletAuctionSummary.OptionPairPrice::expectedValue).sum();
        int totalSamples = prices.stream().mapToInt(BraceletAuctionSummary.OptionPairPrice::sampleCount).sum();
        String icon = samples.stream().map(PairSample::icon).filter(value -> value != null && !value.isBlank()).findFirst().orElse("");
        Instant sampledAt = Instant.now();
        prices.forEach(price -> observations.save(new BraceletPriceObservation(itemSpec.name(), itemSpec.grade(), price, sampledAt)));
        return new BraceletAuctionSummary(itemSpec.name(), itemSpec.grade(), 4, icon, expectedValue, totalSamples, sampledAt, prices);
    }

    private PairSample samplePair(PairDefinition definition, ItemSpec itemSpec) {
        JsonNode firstPage = request(definition, 1, itemSpec);
        if (firstPage == null) return new PairSample(definition, List.of(), "");
        int totalCount = Math.max(0, firstPage.path("TotalCount").asInt());
        int totalPages = Math.max(1, (int) Math.ceil(totalCount / (double) PAGE_SIZE));
        Set<Integer> pages = quantilePages(totalPages);
        List<Double> prices = new ArrayList<>();
        String[] icon = {""};
        collect(firstPage, definition, itemSpec, prices, icon);
        pages.stream().filter(page -> page != 1).forEach(page -> collect(request(definition, page, itemSpec), definition, itemSpec, prices, icon));
        return new PairSample(definition, prices, icon[0]);
    }

    private Set<Integer> quantilePages(int totalPages) {
        Set<Integer> pages = new LinkedHashSet<>();
        if (totalPages == 1) return Set.of(1);
        for (int index = 0; index < SAMPLE_PAGES; index++) {
            pages.add(1 + (int) Math.round((totalPages - 1) * index / (double) (SAMPLE_PAGES - 1)));
        }
        return pages;
    }

    private JsonNode request(PairDefinition pair, int pageNo, ItemSpec itemSpec) {
        String cacheKey = "auction|bracelet|" + itemSpec.name() + "|" + itemSpec.grade() + "|" + pair.id() + "|" + pageNo;
        JsonNode cached = requestCache.getIfPresent(cacheKey);
        if (cached != null) return cached;
        cached = persistentCache.findFresh(cacheKey).orElse(null);
        if (cached != null) {
            requestCache.put(cacheKey, cached);
            return cached;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("Sort", "BUY_PRICE");
        body.put("CategoryCode", CATEGORY_CODE);
        body.put("ItemTier", 4);
        body.put("ItemName", itemSpec.name());
        body.put("PageNo", pageNo);
        body.put("SortCondition", "ASC");
        body.put("EtcOptions", List.of(
                optionBody(pair.first()), optionBody(pair.second()),
                Map.of("FirstOption", 4, "SecondOption", 1, "MinValue", 2, "MaxValue", 2)
        ));
        String description = "경매장 팔찌: " + itemSpec.name() + " / " + pair.name() + " / " + pageNo + "페이지";
        try {
            JsonNode response = LostArkRequestContext.call(description,
                    () -> client.post().uri("/auctions/items").body(body).retrieve().body(JsonNode.class));
            if (response == null) throw new IllegalStateException("팔찌 경매장 응답이 비어 있습니다: " + cacheKey);
            persistentCache.save(cacheKey, response);
            requestCache.put(cacheKey, response);
            return response;
        } catch (RestClientResponseException error) {
            JsonNode fallback = persistentCache.findLastSuccess(cacheKey).orElseThrow(() -> error);
            requestCache.put(cacheKey, fallback);
            return fallback;
        }
    }

    private Map<String, Object> optionBody(SearchOption option) {
        return Map.of("FirstOption", option.firstOption(), "SecondOption", option.secondOption());
    }

    private void collect(JsonNode response, PairDefinition definition, ItemSpec itemSpec, List<Double> prices, String[] icon) {
        if (response == null) return;
        response.path("Items").forEach(item -> {
            if (!itemSpec.name().equals(item.path("Name").asText()) || !itemSpec.grade().equals(item.path("Grade").asText()) || item.path("Tier").asInt() != 4) return;
            long buyPrice = item.path("AuctionInfo").path("BuyPrice").asLong();
            if (buyPrice <= 0 || !containsOption(item, definition.first().name()) || !containsOption(item, definition.second().name())) return;
            prices.add((double) buyPrice);
            if (icon[0].isBlank()) icon[0] = item.path("Icon").asText();
        });
    }

    private boolean containsOption(JsonNode item, String expectedName) {
        for (JsonNode option : item.path("Options")) {
            String actual = option.path("OptionName").asText();
            if ("힘/민/지".equals(expectedName) && (actual.equals("힘 / 민첩 / 지능") || actual.equals("힘") || actual.equals("민첩") || actual.equals("지능"))) return true;
            if (actual.equals(expectedName)) return true;
        }
        return false;
    }

    private double trimmedMean(List<Double> values) {
        if (values.isEmpty()) return 0;
        List<Double> sorted = values.stream().sorted(Comparator.naturalOrder()).toList();
        int trim = (int) Math.floor(sorted.size() * 0.2);
        List<Double> retained = sorted.subList(trim, sorted.size() - trim);
        return retained.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    }

    private record SearchOption(int firstOption, int secondOption, String name) {}
    private record ItemSpec(String name, String grade) {}
    private record PairDefinition(String id, String name, SearchOption first, SearchOption second, double probability) {}
    private record PairSample(PairDefinition definition, List<Double> prices, String icon) {}
}
