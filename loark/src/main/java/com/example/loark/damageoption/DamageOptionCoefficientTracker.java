package com.example.loark.damageoption;

import com.example.loark.cache.PersistentApiCache;
import com.example.loark.character.CharacterSnapshot;
import com.example.loark.character.CharacterSnapshotRepository;
import com.example.loark.character.GameCharacterRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Keeps a running, ever-narrowing estimate of the per-point coefficient behind a stat-driven
// damage-option percentage (e.g. "특화 × C = 표시되는 %"), fed incrementally by every character
// save (live search + the daily background refresh) instead of a one-off browser-side scan.
// Persisted via the existing PersistentApiCache (no new table) under
// "damage-option-coefficient|{recordId}". Every character save is checked against every tracked
// record (coefficientStatType set in the registry JSON) regardless of class/engraving - the
// source template text itself is already the scope (only characters whose tooltip actually
// contains a matching line produce a data point), so a separate class/engraving filter would
// just slow down convergence without adding correctness. Everything is a no-op fast-return when
// nothing is being tracked.
@Service
public class DamageOptionCoefficientTracker {
    private static final String CACHE_SOURCE = "damage-option-coefficient";
    private static final int MAX_BACKFILL_CHARACTERS = 20_000;
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-zA-Z]\\w*)\\}");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]*>");
    private static final Pattern BR_TAG = Pattern.compile("(?i)<br\\s*/?>");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    private final PersistentApiCache cache;
    private final GameCharacterRepository gameCharacters;
    private final CharacterSnapshotRepository snapshots;
    private final ObjectMapper objectMapper;
    private final Path registryPath;
    private final ExecutorService backgroundJobExecutor;

    private volatile List<TrackedRecord> cachedRecords = List.of();
    private volatile FileTime cachedMtime;

    public DamageOptionCoefficientTracker(
            PersistentApiCache cache,
            GameCharacterRepository gameCharacters,
            CharacterSnapshotRepository snapshots,
            ObjectMapper objectMapper,
            ExecutorService backgroundJobExecutor,
            @Value("${app.damage-option-registry.path:./data/damage-option-registry.json}") String registryPath) {
        this.cache = cache;
        this.gameCharacters = gameCharacters;
        this.snapshots = snapshots;
        this.objectMapper = objectMapper;
        this.backgroundJobExecutor = backgroundJobExecutor;
        this.registryPath = Path.of(registryPath).toAbsolutePath().normalize();
    }

    // Called from CharacterService right after every snapshot save. Cheap no-op unless
    // something is currently opted into tracking.
    public void onCharacterSaved(JsonNode armory) {
        List<TrackedRecord> tracked = trackedRecords();
        if (tracked.isEmpty()) return;
        for (TrackedRecord record : tracked) {
            applyRecordAgainstArmory(record, armory);
        }
    }

    // One-time catch-up over a broad sample of already-known characters (class-agnostic - see
    // the class comment), so "추적 시작" shows a meaningful range immediately instead of waiting
    // for the daily refresh job to eventually cycle through everyone. Runs off the shared
    // background pool, batched so it never holds more than a couple hundred armory payloads
    // (each up to ~400KB) in memory at once.
    public void backfillRecordAsync(String recordId) {
        backgroundJobExecutor.execute(() -> backfillRecord(recordId));
    }

    private void backfillRecord(String recordId) {
        TrackedRecord record = trackedRecords().stream()
                .filter(candidate -> candidate.id().equals(recordId))
                .findFirst()
                .orElse(null);
        if (record == null) return;
        cache.save(cacheKey(recordId), freshPayload(), 0);

        List<String> names = gameCharacters.findDamageOptionCoefficientBackfillCharacterNames(
                Pageable.ofSize(MAX_BACKFILL_CHARACTERS));
        int batchSize = 150;
        for (int start = 0; start < names.size(); start += batchSize) {
            List<String> batch = names.subList(start, Math.min(start + batchSize, names.size()));
            List<Long> ids = snapshots.findLatestSnapshotIdsForCharacterNames(batch);
            if (ids.isEmpty()) continue;
            for (CharacterSnapshot snapshot : snapshots.findAllById(ids)) {
                try {
                    JsonNode armory = objectMapper.readTree(snapshot.getArmoryPayload());
                    applyRecordAgainstArmory(record, armory);
                } catch (Exception error) {
                    com.example.loark.config.ApplicationLog.infof(
                            "[DAMAGE OPTION COEFFICIENT] Backfill skipped invalid snapshot: %s / %d%n",
                            snapshot.getCharacterName(), snapshot.getId());
                }
            }
        }
    }

    private void applyRecordAgainstArmory(TrackedRecord record, JsonNode armory) {
        Map<String, Double> stats = statValues(armory);
        Double statValue = stats.get(record.statType());
        if (statValue == null || statValue <= 0) return;
        int groupIndex = record.compiled().keys().indexOf(record.key()) + 1;
        if (groupIndex <= 0) return;
        // "전투 특성" records only look at the Stats tooltip lines they were actually mapped
        // from - skill tooltips are excluded so a skill line that happens to render the exact
        // same sentence (but isn't actually driven by this stat) can't quietly pollute the
        // interval. Every other category keeps scanning both, since those templates are already
        // specific enough (a given skill's own text) that a false-positive match elsewhere is
        // effectively impossible.
        List<String> candidates =
                "전투 특성".equals(record.category()) ? statTooltipTexts(armory) : candidateTexts(armory);
        for (String text : candidates) {
            Matcher matcher = record.compiled().pattern().matcher(text);
            if (!matcher.find()) continue;
            try {
                double displayed = Double.parseDouble(matcher.group(groupIndex).replace(",", ""));
                applyPoint(record.id(), statValue, displayed);
            } catch (NumberFormatException ignored) {
                // A candidate line happened to match the literal parts of the template but not
                // produce a parseable number in this slot - skip it rather than fail the save.
            }
        }
    }

    // API가 소수점 2자리까지 잘라서(버림, 반올림 아님) 보여주므로 실제 값은
    // [표시값, 표시값 + 0.01) 구간 어딘가다 - 스탯값으로 나눠서 계수 구간을 얻고, 기존에
    // 저장된 구간과 교집합한다. 동시에 여러 캐릭터가 저장되면서 이 read-then-write가 드물게
    // 경쟁할 수 있지만, 한쪽 갱신이 유실돼도 다음 캐릭터 저장 때 다시 좁혀지는 값이라 감수한다.
    private void applyPoint(String recordId, double statValue, double displayedValue) {
        String key = cacheKey(recordId);
        JsonNode existing = cache.findLastSuccess(key).orElse(null);
        double low = displayedValue / statValue;
        double high = (displayedValue + 0.01) / statValue;
        int sampleCount = 1;
        if (existing != null) {
            low = Math.max(existing.path("low").asDouble(Double.NEGATIVE_INFINITY), low);
            high = Math.min(existing.path("high").asDouble(Double.POSITIVE_INFINITY), high);
            sampleCount = existing.path("sampleCount").asInt(0) + 1;
        }
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("low", low);
        payload.put("high", high);
        payload.put("sampleCount", sampleCount);
        payload.put("contradictory", low >= high);
        payload.put("updatedAt", Instant.now().toString());
        cache.save(key, payload, 0);
    }

    private String cacheKey(String recordId) {
        return CACHE_SOURCE + "|" + recordId;
    }

    private ObjectNode freshPayload() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("low", Double.NEGATIVE_INFINITY);
        payload.put("high", Double.POSITIVE_INFINITY);
        payload.put("sampleCount", 0);
        payload.put("contradictory", false);
        payload.put("updatedAt", Instant.now().toString());
        return payload;
    }

    private Map<String, Double> statValues(JsonNode armory) {
        Map<String, Double> values = new HashMap<>();
        armory.path("ArmoryProfile").path("Stats").forEach(stat -> {
            String type = stat.path("Type").asText("");
            if (type.isBlank()) return;
            try {
                values.put(type, Double.parseDouble(stat.path("Value").asText("").replace(",", "")));
            } catch (NumberFormatException ignored) {
                // Non-numeric stat value (shouldn't normally happen) - just leave it unmapped.
            }
        });
        return values;
    }

    // Stat tooltip lines and raw skill Tooltip blobs are both just searched as plain text after
    // HTML-stripping - this skips replicating the frontend's full structured tooltip walk since
    // a specific compiled template pattern is unlikely to false-positive-match unrelated text.
    private List<String> candidateTexts(JsonNode armory) {
        List<String> texts = statTooltipTexts(armory);
        armory.path("ArmorySkills").forEach(skill -> {
            String cleaned = cleanApiText(skill.path("Tooltip").asText(""));
            if (!cleaned.isBlank()) texts.add(cleaned);
        });
        return texts;
    }

    private List<String> statTooltipTexts(JsonNode armory) {
        List<String> texts = new ArrayList<>();
        armory.path("ArmoryProfile").path("Stats").forEach(stat ->
                stat.path("Tooltip").forEach(line -> {
                    String cleaned = cleanApiText(line.asText(""));
                    if (!cleaned.isBlank()) texts.add(cleaned);
                }));
        return texts;
    }

    // Port of front/src/lib/text.js's cleanApiText: <br> to space, strip remaining tags, decode
    // a handful of named entities, collapse whitespace.
    private static String cleanApiText(String value) {
        if (value == null || value.isBlank()) return "";
        String text = BR_TAG.matcher(value).replaceAll(" ");
        text = HTML_TAG.matcher(text).replaceAll("");
        text = text.replaceAll("(?i)&nbsp;", " ")
                .replaceAll("(?i)&amp;", "&")
                .replaceAll("(?i)&lt;", "<")
                .replaceAll("(?i)&gt;", ">")
                .replaceAll("(?i)&quot;", "\"")
                .replaceAll("(?i)&#39;", "'");
        return WHITESPACE.matcher(text).replaceAll(" ").trim();
    }

    private List<TrackedRecord> trackedRecords() {
        try {
            if (!Files.exists(registryPath)) return List.of();
            FileTime mtime = Files.getLastModifiedTime(registryPath);
            if (mtime.equals(cachedMtime)) return cachedRecords;
            List<TrackedRecord> parsed = parseRegistry();
            cachedRecords = parsed;
            cachedMtime = mtime;
            return parsed;
        } catch (IOException error) {
            return cachedRecords;
        }
    }

    private List<TrackedRecord> parseRegistry() {
        JsonNode root = objectMapper.readTree(registryPath.toFile());
        List<TrackedRecord> result = new ArrayList<>();
        for (JsonNode record : root.path("records")) {
            String statType = record.path("coefficientStatType").asText("");
            if (statType.isBlank()) continue;
            String id = record.path("id").asText("");
            String source = record.path("source").asText("");
            if (id.isBlank() || source.isBlank()) continue;
            String key = record.path("coefficientKey").asText("n");
            String category = record.path("category").asText("");
            result.add(new TrackedRecord(id, statType, key, category, compile(source)));
        }
        return result;
    }

    private CompiledTemplate compile(String template) {
        Matcher matcher = PLACEHOLDER.matcher(template);
        StringBuilder regex = new StringBuilder();
        List<String> keys = new ArrayList<>();
        int last = 0;
        while (matcher.find()) {
            regex.append(Pattern.quote(template.substring(last, matcher.start())));
            regex.append("([\\d,]+(?:\\.\\d+)?)");
            keys.add(matcher.group(1));
            last = matcher.end();
        }
        regex.append(Pattern.quote(template.substring(last)));
        return new CompiledTemplate(Pattern.compile(regex.toString()), keys);
    }

    private record TrackedRecord(
            String id, String statType, String key, String category, CompiledTemplate compiled) {
        private TrackedRecord {
            Objects.requireNonNull(compiled);
        }
    }

    private record CompiledTemplate(Pattern pattern, List<String> keys) {}
}
