package com.example.loark.auction;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkApiRequestCounter;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class BraceletAuctionService {
    private static final ItemSpec ANCIENT = new ItemSpec("찬란한 구원자의 팔찌", "고대");
    private static final ItemSpec RELIC = new ItemSpec("고귀한 구원자의 팔찌", "유물");
    private static final int CATEGORY_CODE = 200040;
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
    private final ObjectMapper objectMapper;
    private final Cache<String, BraceletAuctionSummary> cache;
    private final Cache<String, JsonNode> requestCache;
    private final BraceletPriceObservationRepository observations;
    private final LostArkApiRequestCounter requestCounter;
    private final int samplePages;
    private final int pagesPerRun;
    private final int rateLimitReserve;
    private final boolean backgroundRefreshEnabled;
    private final ExecutorService backgroundJobExecutor;
    private final Map<String, AtomicBoolean> refreshRunning = new ConcurrentHashMap<>();

    public BraceletAuctionService(RestClient lostArkRestClient, PersistentApiCache persistentCache,
                                  BraceletPriceObservationRepository observations,
                                  LostArkApiRequestCounter requestCounter,
                                  ObjectMapper objectMapper,
                                  ExecutorService backgroundJobExecutor,
                                  @Value("${app.auction-cache-ttl-seconds:900}") long ttlSeconds,
                                  @Value("${app.bracelet-sample-pages:10}") int samplePages,
                                  @Value("${app.bracelet-refresh-pages-per-run:100}") int pagesPerRun,
                                  @Value("${app.auction-rate-limit-reserve:50}") int rateLimitReserve,
                                  @Value("${app.bracelet-auction-refresh.enabled:true}") boolean backgroundRefreshEnabled) {
        this.client = lostArkRestClient;
        this.persistentCache = persistentCache;
        this.objectMapper = objectMapper;
        this.observations = observations;
        this.requestCounter = requestCounter;
        this.backgroundJobExecutor = backgroundJobExecutor;
        this.samplePages = Math.max(1, samplePages);
        this.pagesPerRun = Math.max(1, pagesPerRun);
        this.rateLimitReserve = Math.max(0, rateLimitReserve);
        this.backgroundRefreshEnabled = backgroundRefreshEnabled;
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
        BraceletAuctionSummary stored = storedSummary(itemSpec);
        if (stored == null) {
            throw new IllegalStateException("팔찌 시세 초기 수집이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
        }
        cache.put(itemSpec.name(), stored);
        return stored;
    }

    public void clearCache() {
        cache.invalidateAll();
        requestCache.invalidateAll();
    }

    @Scheduled(
            fixedRateString = "${app.auction-refresh-interval-ms:60000}",
            initialDelayString = "${app.bracelet-ancient-refresh-initial-delay-ms:15000}"
    )
    void refreshAncient() {
        if (!backgroundRefreshEnabled) return;
        backgroundJobExecutor.execute(() -> refreshIncrementally(ANCIENT));
    }

    @Scheduled(
            fixedRateString = "${app.auction-refresh-interval-ms:60000}",
            initialDelayString = "${app.bracelet-relic-refresh-initial-delay-ms:90000}"
    )
    void refreshRelic() {
        if (!backgroundRefreshEnabled) return;
        backgroundJobExecutor.execute(() -> refreshIncrementally(RELIC));
    }

    private void refreshIncrementally(ItemSpec itemSpec) {
        AtomicBoolean running = refreshRunning.computeIfAbsent(itemSpec.grade(), ignored -> new AtomicBoolean());
        if (!running.compareAndSet(false, true)) {
            com.example.loark.config.ApplicationLog.infof(
                    "[LOSTARK AUCTION] Bracelet incremental refresh still running: %s%n",
                    itemSpec.grade());
            return;
        }

        BraceletRefreshProgress progress = loadProgress(itemSpec);
        int calls = 0;
        try {
            while (calls < pagesPerRun) {
                if (progress.pairIndex() >= PAIRS.size()) {
                    publishIncrementalSummary(itemSpec, progress.totalPages());
                    progress = BraceletRefreshProgress.start();
                    saveProgress(itemSpec, progress);
                    com.example.loark.config.ApplicationLog.infof(
                            "[LOSTARK AUCTION] Bracelet incremental cycle completed: %s / calls=%d%n",
                            itemSpec.grade(), calls
                    );
                    continue;
                }

                PairDefinition pair = PAIRS.get(progress.pairIndex());
                Map<String, Integer> totalPages = new LinkedHashMap<>(progress.totalPages());
                Integer pairTotalPages = totalPages.get(pair.id());
                int pageCursor = progress.pageCursor();

                if (pairTotalPages == null) {
                    if (!requestCounter.hasCapacity(rateLimitReserve)) break;
                    JsonNode firstPage = requestFromApi(pair, 1, itemSpec);
                    calls++;
                    pairTotalPages = Math.max(1,
                            (int) Math.ceil(Math.max(0, firstPage.path("TotalCount").asInt()) / (double) PAGE_SIZE));
                    totalPages.put(pair.id(), pairTotalPages);
                    pageCursor = 1;
                    progress = new BraceletRefreshProgress(progress.pairIndex(), pageCursor, totalPages);
                }

                List<Integer> pages = new ArrayList<>(quantilePages(pairTotalPages));
                if (pageCursor >= pages.size()) {
                    progress = new BraceletRefreshProgress(progress.pairIndex() + 1, 0, totalPages);
                    continue;
                }
                if (!requestCounter.hasCapacity(rateLimitReserve)) break;

                requestFromApi(pair, pages.get(pageCursor), itemSpec);
                calls++;
                progress = new BraceletRefreshProgress(progress.pairIndex(), pageCursor + 1, totalPages);
            }

            saveProgress(itemSpec, progress);
            com.example.loark.config.ApplicationLog.infof(
                    "[LOSTARK AUCTION] Bracelet incremental refresh paused: %s / pair=%d/%d / page=%d / calls=%d / remaining=%d%n",
                    itemSpec.grade(), Math.min(progress.pairIndex() + 1, PAIRS.size()), PAIRS.size(),
                    progress.pageCursor(), calls, requestCounter.status().remaining()
            );
        } catch (RuntimeException error) {
            saveProgress(itemSpec, progress);
            com.example.loark.config.ApplicationLog.infof(
                    "[LOSTARK AUCTION] Bracelet incremental refresh failed: %s / %s%n",
                    itemSpec.grade(), error.getMessage());
        } finally {
            running.set(false);
        }
    }

    private BraceletRefreshProgress loadProgress(ItemSpec itemSpec) {
        return persistentCache.findLastSuccess(progressKey(itemSpec)).flatMap(node -> {
            try {
                BraceletRefreshProgress progress =
                        objectMapper.readValue(node.toString(), BraceletRefreshProgress.class);
                if (progress.pairIndex() < 0 || progress.pairIndex() > PAIRS.size()
                        || progress.pageCursor() < 0 || progress.totalPages() == null) {
                    return java.util.Optional.<BraceletRefreshProgress>empty();
                }
                return java.util.Optional.of(progress);
            } catch (Exception ignored) {
                return java.util.Optional.<BraceletRefreshProgress>empty();
            }
        }).orElseGet(BraceletRefreshProgress::start);
    }

    private void saveProgress(ItemSpec itemSpec, BraceletRefreshProgress progress) {
        persistentCache.save(progressKey(itemSpec), objectMapper.valueToTree(progress), 0);
    }

    private String progressKey(ItemSpec itemSpec) {
        return "auction-progress|bracelet|" + itemSpec.grade();
    }

    private void publishIncrementalSummary(ItemSpec itemSpec, Map<String, Integer> totalPages) {
        List<PairSample> samples = PAIRS.stream().map(pair -> {
            List<Double> prices = new ArrayList<>();
            String[] icon = {""};
            int pages = Math.max(1, totalPages.getOrDefault(pair.id(), 1));
            for (int page : quantilePages(pages)) {
                persistentCache.findLastSuccess(pageCacheKey(pair, page, itemSpec))
                        .ifPresent(response -> collect(response, pair, itemSpec, prices, icon));
            }
            return new PairSample(pair, prices, icon[0]);
        }).toList();
        BraceletAuctionSummary summary = summary(itemSpec, samples);
        persistentCache.save(summaryKey(itemSpec), objectMapper.valueToTree(summary), 0);
        cache.put(itemSpec.name(), summary);
        com.example.loark.config.ApplicationLog.infof(
                "[LOSTARK AUCTION] Bracelet summary refreshed: %s / samples=%d%n",
                itemSpec.grade(), summary.totalSamples());
    }

    private BraceletAuctionSummary summary(ItemSpec itemSpec, List<PairSample> samples) {
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
        String icon = samples.stream().map(PairSample::icon)
                .filter(value -> value != null && !value.isBlank()).findFirst().orElse("");
        Instant sampledAt = Instant.now();
        prices.forEach(price -> observations.save(
                new BraceletPriceObservation(itemSpec.name(), itemSpec.grade(), price, sampledAt)));
        return new BraceletAuctionSummary(
                itemSpec.name(), itemSpec.grade(), 4, icon, expectedValue, totalSamples, sampledAt, prices);
    }

    private BraceletAuctionSummary storedSummary(ItemSpec itemSpec) {
        return persistentCache.findLastSuccess(summaryKey(itemSpec)).flatMap(node -> {
            try {
                return java.util.Optional.of(
                        objectMapper.readValue(node.toString(), BraceletAuctionSummary.class));
            } catch (Exception error) {
                return java.util.Optional.empty();
            }
        }).orElse(null);
    }

    private String summaryKey(ItemSpec itemSpec) {
        return "auction-summary|bracelet|" + itemSpec.grade();
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
        if (samplePages <= 0 || totalPages <= samplePages) {
            for (int page = 1; page <= totalPages; page++) pages.add(page);
            return pages;
        }
        if (samplePages == 1) return Set.of(1);
        for (int index = 0; index < samplePages; index++) {
            pages.add(1 + (int) Math.round((totalPages - 1) * index / (double) (samplePages - 1)));
        }
        return pages;
    }

    private JsonNode request(PairDefinition pair, int pageNo, ItemSpec itemSpec) {
        String cacheKey = pageCacheKey(pair, pageNo, itemSpec);
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

    private JsonNode requestFromApi(PairDefinition pair, int pageNo, ItemSpec itemSpec) {
        String cacheKey = pageCacheKey(pair, pageNo, itemSpec);
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
        String description = "경매장 팔찌: " + itemSpec.name() + " / "
                + pair.name() + " / " + pageNo + "페이지";
        JsonNode response = LostArkRequestContext.call(description,
                () -> client.post().uri("/auctions/items").body(body).retrieve().body(JsonNode.class));
        if (response == null) {
            throw new IllegalStateException("팔찌 경매장 응답이 비어 있습니다: " + cacheKey);
        }
        persistentCache.save(cacheKey, response);
        requestCache.put(cacheKey, response);
        return response;
    }

    private String pageCacheKey(PairDefinition pair, int pageNo, ItemSpec itemSpec) {
        return "auction|bracelet|" + itemSpec.name() + "|" + itemSpec.grade()
                + "|" + pair.id() + "|" + pageNo;
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
    private record BraceletRefreshProgress(int pairIndex, int pageCursor,
                                           Map<String, Integer> totalPages) {
        private static BraceletRefreshProgress start() {
            return new BraceletRefreshProgress(0, 0, Map.of());
        }
    }
}
