package com.example.loark.marishop;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MariShopService {
    private static final ZoneId KOREA = ZoneId.of("Asia/Seoul");
    private static final Pattern ITEM_NAME = Pattern.compile("\\\"itemName\\\":\\\"([^\\\"]+)\\\"");
    private static final Pattern ICON_PATH = Pattern.compile("\\\"iconPath\\\":\\\"([^\\\"]+)\\\"");
    private static final Pattern ICON_GRADE = Pattern.compile("\\\"iconGrade\\\":(-?\\d+)");
    private static final Pattern QUANTITY = Pattern.compile("\\[([\\d,]+)개]");
    private static final Pattern GOODS_VERSION = Pattern.compile("^(\\d{8})_([12])$");
    private static final String CDN = "https://cdn-lostark.game.onstove.com/";

    private final MariShopRotationRepository rotationRepository;
    private final MariShopProductHistoryRepository historyRepository;
    private final ObjectMapper objectMapper;
    private final RestClient shopClient;
    private final ScheduledExecutorService scheduler;
    private final boolean enabled;

    public MariShopService(MariShopRotationRepository rotationRepository, MariShopProductHistoryRepository historyRepository,
                           ObjectMapper objectMapper,
                           @Value("${app.mari-shop.enabled:true}") boolean enabled) {
        this.rotationRepository = rotationRepository;
        this.historyRepository = historyRepository;
        this.objectMapper = objectMapper;
        this.enabled = enabled;
        this.shopClient = RestClient.builder()
                .baseUrl("https://m-lostark.game.onstove.com")
                .defaultHeader(HttpHeaders.USER_AGENT, "Mozilla/5.0 (compatible; LOARK/1.0)")
                .defaultHeader(HttpHeaders.ACCEPT_LANGUAGE, "ko-KR,ko;q=0.9")
                .build();
        this.scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "mari-shop-refresh");
            thread.setDaemon(true);
            return thread;
        });
    }

    @PostConstruct
    void start() {
        if (enabled) scheduler.execute(this::refreshAndSchedule);
    }

    @PreDestroy
    void stop() {
        scheduler.shutdownNow();
    }

    public JsonNode current() {
        return rotationRepository.findTopByOrderByFetchedAtDesc()
                .<JsonNode>map(this::rotationPayload)
                .orElseGet(() -> loadingPayload("마리 상점 상품을 불러오는 중입니다."));
    }

    private void refreshAndSchedule() {
        ZonedDateTime now = ZonedDateTime.now(KOREA);
        try {
            ObjectNode payload = fetch(now);
            save(payload);
            ZonedDateTime next = nextRefreshAfter(now);
            System.out.printf("[MARI SHOP] %d products fetched | version=%s | next=%s%n",
                    payload.path("products").size(), payload.path("goodsVersion").asText("-"), next);
            schedule(next);
        } catch (Exception error) {
            ZonedDateTime retry = ZonedDateTime.now(KOREA).plusMinutes(1);
            System.out.printf("[MARI SHOP] fetch failed: %s | retry=%s%n", error.getMessage(), retry);
            schedule(retry);
        }
    }

    private ObjectNode fetch(ZonedDateTime fetchedAt) {
        String html = shopClient.get().uri("/Shop").retrieve().body(String.class);
        if (html == null || html.isBlank()) throw new IllegalStateException("빈 HTML 응답");

        Document document = Jsoup.parse(html, "https://m-lostark.game.onstove.com");
        Element currentList = document.selectFirst("#lists .list-items--mari");
        if (currentList == null) throw new IllegalStateException("현재 판매 상품 영역을 찾지 못했습니다.");
        ArrayNode products = parseProducts(currentList);
        if (products.isEmpty()) throw new IllegalStateException("현재 판매 상품을 찾지 못했습니다.");
        String goodsVersion = products.get(0).path("goodsVersion").asText();
        ZonedDateTime nextRefresh = nextRefreshAfter(fetchedAt);
        ObjectNode result = objectMapper.createObjectNode();
        result.put("goodsVersion", goodsVersion);
        result.put("fetchedAt", fetchedAt.toInstant().toString());
        result.put("nextRefreshAt", nextRefresh.toInstant().toString());
        result.set("products", products);
        return result;
    }

    private ArrayNode parseProducts(Element list) {
        ArrayNode products = objectMapper.createArrayNode();
        for (Element item : list.children()) {
            if (!"li".equalsIgnoreCase(item.tagName())) continue;
            Element buy = item.selectFirst("a.bt-buy[data-goodsversion]");
            if (buy == null) continue;
            String tooltip = item.attr("data-tooltip-image");
            String name = match(ITEM_NAME, tooltip);
            if (name.isBlank()) continue;

            ObjectNode product = products.addObject();
            product.put("name", name);
            product.put("quantity", parseNumber(match(QUANTITY, item.text()), 1));
            product.put("crystalPrice", parseNumber(buy.attr("data-price"), 0));
            product.put("itemCode", buy.attr("data-itemcode"));
            product.put("goodsVersion", buy.attr("data-goodsversion"));
            String iconPath = match(ICON_PATH, tooltip);
            product.put("icon", iconPath.isBlank() ? "" : CDN + iconPath);
            product.put("grade", gradeName(parseNumber(match(ICON_GRADE, tooltip), -1)));
        }
        return products;
    }

    private void addSalePeriod(ObjectNode rotation, String version) {
        ZonedDateTime startsAt;
        try { startsAt = saleStartsAt(version); } catch (Exception ignored) { return; }
        rotation.put("startsAt", startsAt.toInstant().toString());
        rotation.put("endsAt", startsAt.plusHours(12).toInstant().toString());
    }

    private ZonedDateTime saleStartsAt(String version) {
        Matcher matcher = GOODS_VERSION.matcher(version);
        if (!matcher.matches()) throw new IllegalArgumentException("잘못된 마리 상점 회차: " + version);
        LocalDate date = LocalDate.parse(matcher.group(1), DateTimeFormatter.BASIC_ISO_DATE);
        int hour = "1".equals(matcher.group(2)) ? 6 : 18;
        return date.atTime(hour, 0).atZone(KOREA);
    }

    @Transactional
    protected void save(ObjectNode payload) {
        Instant fetchedAt = Instant.parse(payload.path("fetchedAt").asText());
        String version = payload.path("goodsVersion").asText();
        ZonedDateTime startsAt = saleStartsAt(version);
        rotationRepository.save(new MariShopRotation(version, startsAt.toInstant(), startsAt.plusHours(12).toInstant(), fetchedAt));
        saveHistoryProducts(payload.path("products"), fetchedAt);
    }

    private ObjectNode rotationPayload(MariShopRotation rotation) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("goodsVersion", rotation.getGoodsVersion());
        payload.put("fetchedAt", rotation.getFetchedAt().toString());
        payload.put("nextRefreshAt", rotation.getEndsAt().plusSeconds(10).toString());
        ArrayNode products = payload.putArray("products");
        historyRepository.findByGoodsVersionOrderByIdAsc(rotation.getGoodsVersion()).forEach(history -> {
            ObjectNode product = products.addObject();
            product.put("name", history.getProductName()); product.put("quantity", history.getQuantity());
            product.put("crystalPrice", history.getCrystalPrice()); product.put("itemCode", history.getItemCode());
            product.put("goodsVersion", history.getGoodsVersion()); product.put("icon", history.getIcon());
            product.put("grade", history.getGrade());
        });
        return withRecentRotations(payload);
    }

    private ObjectNode withRecentRotations(ObjectNode payload) {
        payload.path("products").forEach(product -> {
            if (product instanceof ObjectNode object) addHistoricalLowestPrice(object);
        });
        ArrayNode rotations = objectMapper.createArrayNode();
        List<String> versions = historyRepository.findRecentGoodsVersions(PageRequest.of(0, 3));
        for (int index = 0; index < versions.size(); index++) {
            String version = versions.get(index);
            ObjectNode rotation = rotations.addObject();
            rotation.put("order", index);
            rotation.put("status", index == 0 ? "current" : index == 1 ? "previous" : "twoAgo");
            rotation.put("label", index == 0 ? "현재 회차" : index == 1 ? "지난 회차" : "지지난 회차");
            rotation.put("goodsVersion", version);
            addSalePeriod(rotation, version);
            ArrayNode products = objectMapper.createArrayNode();
            historyRepository.findByGoodsVersionOrderByIdAsc(version).forEach(history -> {
                ObjectNode product = products.addObject();
                product.put("name", history.getProductName());
                product.put("quantity", history.getQuantity());
                product.put("crystalPrice", history.getCrystalPrice());
                product.put("itemCode", history.getItemCode());
                product.put("goodsVersion", history.getGoodsVersion());
                product.put("icon", history.getIcon());
                product.put("grade", history.getGrade());
                addHistoricalLowestPrice(product);
            });
            rotation.set("products", products);
        }
        payload.set("rotations", rotations);
        ObjectNode historicalLowestUnitPrices = objectMapper.createObjectNode();
        historyRepository.findAllLowestUnitCrystalPrices().forEach(row -> {
            if (row[0] == null || row[1] == null) return;
            historicalLowestUnitPrices.put(String.valueOf(row[0]), ((Number) row[1]).doubleValue());
        });
        payload.set("historicalLowestUnitCrystalPrices", historicalLowestUnitPrices);
        return payload;
    }

    private void addHistoricalLowestPrice(ObjectNode product) {
        String productName = product.path("name").asText("");
        int quantity = Math.max(1, product.path("quantity").asInt(1));
        Double lowestUnitPrice = historyRepository.findLowestUnitCrystalPrice(productName);
        if (lowestUnitPrice == null) return;
        product.put("historicalLowestUnitCrystalPrice", lowestUnitPrice);
        product.put("historicalLowestCrystalPrice", lowestUnitPrice * quantity);
        double currentUnitPrice = product.path("crystalPrice").asDouble() / quantity;
        product.put("historicalLowest", currentUnitPrice <= lowestUnitPrice + 0.000001);
    }

    private void saveHistoryProducts(JsonNode products, Instant fetchedAt) {
        products.forEach(product -> {
            String version = product.path("goodsVersion").asText();
            String itemCode = product.path("itemCode").asText();
            if (version.isBlank() || itemCode.isBlank()
                    || historyRepository.existsByGoodsVersionAndItemCode(version, itemCode)) return;
            historyRepository.save(new MariShopProductHistory(
                    version,
                    itemCode,
                    product.path("name").asText(),
                    product.path("quantity").asInt(1),
                    product.path("crystalPrice").asInt(),
                    product.path("icon").asText(),
                    product.path("grade").asText(),
                    fetchedAt
            ));
        });
    }

    public JsonNode history(String itemCode) {
        ArrayNode rows = objectMapper.createArrayNode();
        historyRepository.findByItemCodeOrderByObservedAtDesc(itemCode).forEach(history -> {
            ObjectNode row = rows.addObject();
            row.put("goodsVersion", history.getGoodsVersion());
            row.put("itemCode", history.getItemCode());
            row.put("name", history.getProductName());
            row.put("quantity", history.getQuantity());
            row.put("crystalPrice", history.getCrystalPrice());
            row.put("unitCrystalPrice", history.getUnitCrystalPrice());
            row.put("icon", history.getIcon());
            row.put("grade", history.getGrade());
            row.put("observedAt", history.getObservedAt().toString());
        });
        return rows;
    }

    private void schedule(ZonedDateTime time) {
        long delay = Math.max(1, Duration.between(Instant.now(), time.toInstant()).toMillis());
        scheduler.schedule(this::refreshAndSchedule, delay, TimeUnit.MILLISECONDS);
    }

    private ZonedDateTime nextRefreshAfter(ZonedDateTime now) {
        ZonedDateTime six = now.toLocalDate().atTime(LocalTime.of(6, 0)).atZone(KOREA);
        ZonedDateTime eighteen = now.toLocalDate().atTime(LocalTime.of(18, 0)).atZone(KOREA);
        ZonedDateTime stockAt = now.isBefore(six) ? six : now.isBefore(eighteen) ? eighteen : six.plusDays(1);
        return stockAt.plusSeconds(10);
    }

    private JsonNode loadingPayload(String message) {
        ObjectNode result = objectMapper.createObjectNode();
        result.put("loading", true);
        result.put("message", message);
        result.set("products", objectMapper.createArrayNode());
        return result;
    }

    private String match(Pattern pattern, String value) {
        Matcher matcher = pattern.matcher(value == null ? "" : value);
        return matcher.find() ? matcher.group(1) : "";
    }

    private int parseNumber(String value, int fallback) {
        try { return Integer.parseInt(value.replace(",", "")); }
        catch (Exception ignored) { return fallback; }
    }

    private String gradeName(int grade) {
        return switch (grade) {
            case 0 -> "일반";
            case 1 -> "고급";
            case 2 -> "희귀";
            case 3 -> "영웅";
            case 4 -> "전설";
            case 5 -> "유물";
            case 6 -> "고대";
            default -> "";
        };
    }
}
