package com.example.loark.auction;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.config.LostArkApiRequestCounter;
import com.example.loark.config.LostArkRequestContext;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Service
public class AccessoryAuctionSearchService {
    private static final int ITEM_TIER = 4;
    private static final int PAGE_SIZE = 10;
    private static final int MAX_PAGES_PER_ANCHOR = 5;
    private static final String PROGRESS_KEY = "auction-progress|accessory";
    private static final List<String> PARTS = List.of("목걸이", "귀걸이", "반지");
    private static final List<String> GRADES = List.of("고대", "유물");
    private static final List<String> OPTION_KEYS = List.of(
            "attackPercent", "weaponPercent", "attackFlat", "weaponFlat");
    private static final List<String> ANCHOR_TIERS = List.of("상", "중");
    private static final Map<String, Integer> CATEGORY_CODES = Map.of(
            "목걸이", 200010, "귀걸이", 200020, "반지", 200030);
    private static final Map<String, OptionDefinition> OPTIONS = Map.of(
            "attackPercent", new OptionDefinition("attackPercent", "공격력 %", 45, true,
                    Map.of("상", 155, "중", 95, "하", 40)),
            "weaponPercent", new OptionDefinition("weaponPercent", "무기 공격력 %", 46, true,
                    Map.of("상", 300, "중", 180, "하", 80)),
            "attackFlat", new OptionDefinition("attackFlat", "공격력 +", 53, false,
                    Map.of("상", 390, "중", 195, "하", 80)),
            "weaponFlat", new OptionDefinition("weaponFlat", "무기 공격력 +", 54, false,
                    Map.of("상", 960, "중", 480, "하", 195))
    );
    private static final DateTimeFormatter API_DATE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss[.SSS]");

    private final RestClient client;
    private final AccessoryAuctionListingRepository repository;
    private final LostArkApiRequestCounter requestCounter;
    private final ObjectMapper objectMapper;
    private final PersistentApiCache persistentCache;
    private final boolean backgroundRefreshEnabled;
    private final int backgroundPagesPerRun;
    private final int rateLimitReserve;
    private final ExecutorService backgroundJobExecutor;
    private final AtomicBoolean refreshRunning = new AtomicBoolean();
    // Read-through cache for non-forced searches: the background collector already keeps
    // listings reasonably fresh (see refreshInBackground), so identical filter combos searched
    // again within this window can skip the DB round trip entirely.
    private final Cache<SearchRequest, SearchResponse> searchCache = Caffeine.newBuilder()
            .maximumSize(500)
            .expireAfterWrite(Duration.ofSeconds(15))
            .build();

    public AccessoryAuctionSearchService(@Qualifier("auctionLostArkRestClient") RestClient lostArkRestClient,
                                         AccessoryAuctionListingRepository repository,
                                         LostArkApiRequestCounter requestCounter,
                                         ObjectMapper objectMapper,
                                         PersistentApiCache persistentCache,
                                         ExecutorService backgroundJobExecutor,
                                         @Value("${app.accessory-auction-refresh.enabled:true}")
                                         boolean backgroundRefreshEnabled,
                                         @Value("${app.accessory-auction-refresh-pages-per-run:1000}")
                                         int backgroundPagesPerRun,
                                         @Value("${app.auction-rate-limit-reserve:100}")
                                         int rateLimitReserve) {
        this.client = lostArkRestClient;
        this.repository = repository;
        this.requestCounter = requestCounter;
        this.objectMapper = objectMapper;
        this.persistentCache = persistentCache;
        this.backgroundJobExecutor = backgroundJobExecutor;
        this.backgroundRefreshEnabled = backgroundRefreshEnabled;
        this.backgroundPagesPerRun = Math.max(1, backgroundPagesPerRun);
        this.rateLimitReserve = Math.max(0, rateLimitReserve);
    }

    @Transactional
    public SearchResponse search(SearchRequest rawRequest) {
        SearchRequest request = normalize(rawRequest);
        if (request.refresh()) {
            refresh(request);
        } else {
            SearchResponse cached = searchCache.getIfPresent(request);
            if (cached != null) return cached;
        }
        List<SearchItem> items = stored(request);
        SearchResponse response = new SearchResponse(items, items.size(), Instant.now());
        if (!request.refresh()) searchCache.put(request, response);
        return response;
    }

    private SearchRequest normalize(SearchRequest request) {
        String part = CATEGORY_CODES.containsKey(request.part()) ? request.part() : "목걸이";
        String grade = "유물".equals(request.grade()) ? "유물" : "고대";
        String trade = Set.of("ZERO", "ONE_PLUS", "TWO_PLUS").contains(request.tradeCount())
                ? request.tradeCount() : "ZERO";
        Set<Integer> refinements = new LinkedHashSet<>(
                Optional.ofNullable(request.refineLevels()).orElse(Set.of(3)));
        refinements.removeIf(level -> level < 1 || level > 3);
        if (refinements.isEmpty()) refinements.add(3);
        Set<String> optionTypes = new LinkedHashSet<>(
                Optional.ofNullable(request.optionTypes()).orElse(OPTIONS.keySet()));
        optionTypes.retainAll(OPTIONS.keySet());
        if (optionTypes.isEmpty()) optionTypes.addAll(OPTIONS.keySet());
        String optionGrade = Set.of(
                "MID_SINGLE", "MID_LOW", "MID_MID",
                "HIGH_SINGLE", "HIGH_LOW", "HIGH_MID", "HIGH_HIGH"
        ).contains(request.optionGrade()) ? request.optionGrade() : "MID_SINGLE";
        return new SearchRequest(part, grade, trade, refinements, optionTypes, optionGrade,
                request.refresh());
    }

    private void refresh(SearchRequest request) {
        if (!refreshRunning.compareAndSet(false, true)) return;
        try {
            refreshOnDemand(request);
        } finally {
            refreshRunning.set(false);
        }
    }

    private void refreshOnDemand(SearchRequest request) {
        String anchorTier = request.optionGrade().startsWith("HIGH") ? "상" : "중";
        for (String optionKey : request.optionTypes()) {
            OptionDefinition option = OPTIONS.get(optionKey);
            for (int page = 1; page <= MAX_PAGES_PER_ANCHOR; page++) {
                if (!requestCounter.hasCapacity("auction", 1)) return;
                JsonNode response;
                try {
                    response = requestPage(request, option, anchorTier, page);
                } catch (RuntimeException error) {
                    return;
                }
                if (response == null || response.path("Items").isEmpty()) break;
                storeAll(request.part(), response.path("Items"));
                if (stored(request).size() >= 50) return;
            }
        }
    }

    @Scheduled(
            fixedRateString = "${app.accessory-auction-refresh-interval-ms:60000}",
            initialDelayString = "${app.accessory-auction-refresh-initial-delay-ms:45000}"
    )
    void refreshInBackground() {
        if (!backgroundRefreshEnabled || !refreshRunning.compareAndSet(false, true)) return;
        backgroundJobExecutor.execute(this::runBackgroundRefresh);
    }

    private void runBackgroundRefresh() {
        AccessoryRefreshProgress progress = loadProgress();
        int calls = 0;
        try {
            List<RefreshTarget> targets = refreshTargets();
            while (calls < backgroundPagesPerRun) {
                if (!requestCounter.hasCapacity("auction", rateLimitReserve)) break;
                if (progress.targetIndex() >= targets.size()) {
                    progress = AccessoryRefreshProgress.start();
                    saveProgress(progress);
                }

                RefreshTarget target = targets.get(progress.targetIndex());
                int page = Math.max(1, progress.pageCursor());
                JsonNode response = requestPage(
                        target.part(), target.grade(), OPTIONS.get(target.optionKey()),
                        target.anchorTier(), page);
                calls++;

                int totalPages = progress.totalPages();
                if (totalPages <= 0) {
                    int totalCount = Math.max(0, response.path("TotalCount").asInt());
                    totalPages = Math.max(1, (int) Math.ceil(totalCount / (double) PAGE_SIZE));
                }
                storeAll(target.part(), response.path("Items"));

                if (response.path("Items").isEmpty() || page >= totalPages) {
                    progress = new AccessoryRefreshProgress(
                            progress.targetIndex() + 1, 1, 0);
                } else {
                    progress = new AccessoryRefreshProgress(
                            progress.targetIndex(), page + 1, totalPages);
                }
                saveProgress(progress);
            }
        } catch (RuntimeException error) {
            saveProgress(progress);
        } finally {
            refreshRunning.set(false);
        }
    }

    private List<RefreshTarget> refreshTargets() {
        List<RefreshTarget> targets = new ArrayList<>();
        for (String part : PARTS) {
            for (String grade : GRADES) {
                for (String optionKey : OPTION_KEYS) {
                    for (String anchorTier : ANCHOR_TIERS) {
                        targets.add(new RefreshTarget(part, grade, optionKey, anchorTier));
                    }
                }
            }
        }
        return targets;
    }

    private AccessoryRefreshProgress loadProgress() {
        return persistentCache.findLastSuccess(PROGRESS_KEY).flatMap(node -> {
            try {
                AccessoryRefreshProgress progress =
                        objectMapper.treeToValue(node, AccessoryRefreshProgress.class);
                if (progress.targetIndex() < 0 || progress.targetIndex() > refreshTargets().size()
                        || progress.pageCursor() < 1 || progress.totalPages() < 0) {
                    return Optional.<AccessoryRefreshProgress>empty();
                }
                return Optional.of(progress);
            } catch (Exception error) {
                return Optional.<AccessoryRefreshProgress>empty();
            }
        }).orElseGet(AccessoryRefreshProgress::start);
    }

    private void saveProgress(AccessoryRefreshProgress progress) {
        persistentCache.save(PROGRESS_KEY, objectMapper.valueToTree(progress), 0);
    }

    private JsonNode requestPage(SearchRequest request, OptionDefinition option,
                                 String tier, int page) {
        return requestPage(request.part(), request.grade(), option, tier, page);
    }

    private JsonNode requestPage(String part, String grade, OptionDefinition option,
                                 String tier, int page) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("Sort", "BUY_PRICE");
        body.put("CategoryCode", CATEGORY_CODES.get(part));
        body.put("ItemTier", ITEM_TIER);
        body.put("ItemGrade", grade);
        body.put("ItemName", "");
        body.put("PageNo", page);
        body.put("SortCondition", "ASC");
        int value = option.values().get(tier);
        body.put("EtcOptions", List.of(Map.of(
                "FirstOption", 7,
                "SecondOption", option.secondOption(),
                "MinValue", value,
                "MaxValue", value
        )));
        String description = "경매장 장신구: " + part + " / " + grade
                + " / " + option.name() + " " + tier + " / " + page + "페이지";
        return LostArkRequestContext.call(description,
                () -> client.post().uri("/auctions/items").body(body)
                        .retrieve().body(JsonNode.class));
    }

    // Persists a whole page of auction results in one batch (one SELECT ... IN + one
    // saveAll) instead of one findByListingKey + save per item. A background run can
    // process up to backgroundPagesPerRun pages, so at 10 items/page this turns what used
    // to be up to ~20,000 individual DB round trips per run into roughly 2 per page.
    private void storeAll(String part, JsonNode items) {
        List<PreparedListing> prepared = new ArrayList<>();
        items.forEach(item -> {
            long buyPrice = item.path("AuctionInfo").path("BuyPrice").asLong();
            if (buyPrice <= 0 || item.path("Tier").asInt() != ITEM_TIER) return;
            Instant endDate = parseEndDate(item.path("AuctionInfo").path("EndDate").asText());
            if (!endDate.isAfter(Instant.now())) return;
            List<AuctionOption> options = parseOptions(item);
            String optionsJson;
            try {
                optionsJson = objectMapper.writeValueAsString(options);
            } catch (Exception error) {
                return;
            }
            double mainStat = options.stream()
                    .filter(option -> Set.of("힘", "민첩", "지능").contains(option.name()))
                    .mapToDouble(AuctionOption::value).max().orElse(0);
            String keySource = part + "|" + item.path("Name").asText() + "|"
                    + item.path("Grade").asText() + "|" + item.path("GradeQuality").asInt() + "|"
                    + buyPrice + "|" + endDate + "|" + optionsJson;
            prepared.add(new PreparedListing(
                    sha256(keySource), item, buyPrice, endDate, optionsJson, mainStat));
        });
        if (prepared.isEmpty()) return;

        Map<String, AccessoryAuctionListing> existing = repository
                .findByListingKeyIn(prepared.stream().map(PreparedListing::listingKey).distinct().toList())
                .stream()
                .collect(Collectors.toMap(AccessoryAuctionListing::getListingKey, listing -> listing, (a, b) -> a));

        Instant observedAt = Instant.now();
        List<AccessoryAuctionListing> toSave = new ArrayList<>();
        for (PreparedListing entry : prepared) {
            JsonNode item = entry.item();
            AccessoryAuctionListing listing = existing.getOrDefault(entry.listingKey(),
                    new AccessoryAuctionListing(
                            entry.listingKey(), part, item.path("Name").asText(), item.path("Grade").asText(),
                            item.path("Icon").asText(), item.path("GradeQuality").asInt(), entry.buyPrice(),
                            item.path("AuctionInfo").path("TradeAllowCount").asInt(),
                            item.path("AuctionInfo").path("UpgradeLevel").asInt(), entry.mainStat(),
                            entry.optionsJson(), entry.endDate(), observedAt));
            listing.update(part, item.path("Name").asText(), item.path("Grade").asText(),
                    item.path("Icon").asText(), item.path("GradeQuality").asInt(), entry.buyPrice(),
                    item.path("AuctionInfo").path("TradeAllowCount").asInt(),
                    item.path("AuctionInfo").path("UpgradeLevel").asInt(), entry.mainStat(),
                    entry.optionsJson(), entry.endDate(), observedAt);
            toSave.add(listing);
        }
        repository.saveAll(toSave);
    }

    private record PreparedListing(
            String listingKey, JsonNode item, long buyPrice, Instant endDate,
            String optionsJson, double mainStat) {}

    private List<SearchItem> stored(SearchRequest request) {
        return queryStoredListings(request).stream()
                .map(this::toSearchItem)
                .filter(item -> optionCombinationMatches(item.options(), request))
                .sorted(Comparator.comparingLong(SearchItem::buyPrice)
                        .thenComparing(Comparator.comparingInt(SearchItem::quality).reversed()))
                .limit(100)
                .toList();
    }

    // request.tradeCount()/refineLevels() are already normalized (see normalize()), so trade
    // count and refinement level can be pushed straight into the SQL WHERE clause instead of
    // loading every non-expired part/grade row and filtering in Java. Only the option-grade
    // combination (parsed out of the options_json LOB) still needs app-level logic.
    private List<AccessoryAuctionListing> queryStoredListings(SearchRequest request) {
        Instant now = Instant.now();
        return switch (request.tradeCount()) {
            case "TWO_PLUS" -> repository
                    .findByPartAndGradeAndEndDateAfterAndTradeAllowCountGreaterThanEqualAndUpgradeLevelIn(
                            request.part(), request.grade(), now, 2, request.refineLevels());
            case "ONE_PLUS" -> repository
                    .findByPartAndGradeAndEndDateAfterAndTradeAllowCountGreaterThanEqualAndUpgradeLevelIn(
                            request.part(), request.grade(), now, 1, request.refineLevels());
            default -> repository
                    .findByPartAndGradeAndEndDateAfterAndTradeAllowCountAndUpgradeLevelIn(
                            request.part(), request.grade(), now, 0, request.refineLevels());
        };
    }

    private boolean optionCombinationMatches(List<AuctionOption> allOptions,
                                             SearchRequest request) {
        List<AuctionOption> dealer = allOptions.stream()
                .filter(option -> "ACCESSORY_UPGRADE".equals(option.type()))
                .filter(option -> request.optionTypes().contains(option.key()))
                .filter(option -> option.tier() != null)
                .toList();
        long highs = dealer.stream().filter(option -> "상".equals(option.tier())).count();
        long mids = dealer.stream().filter(option -> "중".equals(option.tier())).count();
        long lows = dealer.stream().filter(option -> "하".equals(option.tier())).count();
        return switch (request.optionGrade()) {
            case "MID_LOW" -> highs == 0 && mids >= 1 && lows >= 1;
            case "MID_MID" -> highs == 0 && mids >= 2;
            case "HIGH_LOW" -> highs >= 1 && lows >= 1;
            case "HIGH_MID" -> highs >= 1 && mids >= 1;
            case "HIGH_HIGH" -> highs >= 2;
            case "HIGH_SINGLE" -> highs >= 1;
            default -> highs == 0 && mids >= 1;
        };
    }

    private SearchItem toSearchItem(AccessoryAuctionListing listing) {
        List<AuctionOption> options;
        try {
            options = objectMapper.readValue(
                    listing.getOptionsJson(), new TypeReference<List<AuctionOption>>() {});
        } catch (Exception error) {
            options = List.of();
        }
        return new SearchItem(
                listing.getListingKey(), listing.getPart(), listing.getItemName(),
                listing.getGrade(), listing.getIcon(), listing.getQuality(),
                listing.getBuyPrice(), listing.getTradeAllowCount(),
                listing.getUpgradeLevel(), listing.getMainStatValue(),
                listing.getEndDate(), options);
    }

    private List<AuctionOption> parseOptions(JsonNode item) {
        List<AuctionOption> result = new ArrayList<>();
        item.path("Options").forEach(option -> {
            String type = option.path("Type").asText();
            String name = option.path("OptionName").asText().trim();
            double value = option.path("Value").asDouble();
            boolean percentage = option.path("IsValuePercentage").asBoolean();
            String key = optionKey(name, percentage);
            String tier = key == null ? null : tierFor(OPTIONS.get(key), value);
            result.add(new AuctionOption(type, key, name, value, percentage, tier));
        });
        return result;
    }

    private String optionKey(String name, boolean percentage) {
        if ("공격력".equals(name)) return percentage ? "attackPercent" : "attackFlat";
        if ("무기 공격력".equals(name)) return percentage ? "weaponPercent" : "weaponFlat";
        return null;
    }

    private String tierFor(OptionDefinition definition, double value) {
        if (definition == null) return null;
        double normalized = definition.percentage() ? value * 100 : value;
        return definition.values().entrySet().stream()
                .filter(entry -> Math.abs(entry.getValue() - normalized) < 0.001)
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private Instant parseEndDate(String value) {
        try {
            return LocalDateTime.parse(value, API_DATE)
                    .atZone(ZoneId.of("Asia/Seoul")).toInstant();
        } catch (Exception error) {
            return Instant.now().plusSeconds(3600);
        }
    }

    private String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception error) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private record OptionDefinition(String key, String name, int secondOption,
                                    boolean percentage, Map<String, Integer> values) {}

    private record RefreshTarget(
            String part, String grade, String optionKey, String anchorTier) {}

    private record AccessoryRefreshProgress(
            int targetIndex, int pageCursor, int totalPages) {
        static AccessoryRefreshProgress start() {
            return new AccessoryRefreshProgress(0, 1, 0);
        }
    }

    public record SearchRequest(
            String part,
            String grade,
            String tradeCount,
            Set<Integer> refineLevels,
            Set<String> optionTypes,
            String optionGrade,
            boolean refresh
    ) {}

    public record SearchResponse(List<SearchItem> items, int count, Instant searchedAt) {}

    public record SearchItem(
            String id,
            String part,
            String name,
            String grade,
            String icon,
            int quality,
            long buyPrice,
            int tradeAllowCount,
            int upgradeLevel,
            double mainStatValue,
            Instant endDate,
            List<AuctionOption> options
    ) {}

    public record AuctionOption(
            String type,
            String key,
            String name,
            double value,
            boolean percentage,
            String tier
    ) {}
}
