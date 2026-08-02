package com.example.loark.character;

import com.example.loark.config.LostArkRequestContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CharacterService {
    private final RestClient client;
    private final CharacterSnapshotRepository snapshots;
    private final CharacterRosterMemberRepository rosterMembers;
    private final CharacterCardSetObservationRepository cardSets;
    private final GameCharacterRepository gameCharacters;
    private final CharacterRankingClassifier rankingClassifier;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public CharacterService(RestClient lostArkRestClient, CharacterSnapshotRepository snapshots,
                            CharacterRosterMemberRepository rosterMembers,
                            CharacterCardSetObservationRepository cardSets,
                            GameCharacterRepository gameCharacters,
                            CharacterRankingClassifier rankingClassifier,
                            ObjectMapper objectMapper,
                            PlatformTransactionManager transactionManager) {
        this.client = lostArkRestClient;
        this.snapshots = snapshots;
        this.rosterMembers = rosterMembers;
        this.cardSets = cardSets;
        this.gameCharacters = gameCharacters;
        this.rankingClassifier = rankingClassifier;
        this.objectMapper = objectMapper;
        // A plain @Transactional on saveSnapshot() wouldn't apply (it's called via internal
        // self-invocation, which bypasses Spring's proxy-based AOP), and putting @Transactional
        // on the public callers instead would hold a DB connection open across their external
        // Lost Ark API calls. TransactionTemplate scopes the transaction to just the DB writes.
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * The requested character is always refreshed. Roster data is read from the
     * latest DB snapshot so opening the roster tab never fans out into one API
     * call per member. A normal lookup discovers the roster once when no stored
     * roster exists; later roster API calls happen only through refreshRoster().
     */
    public CharacterResponse find(String characterName) {
        try {
            return refreshCharacter(characterName, true);
        } catch (LostArkApiException error) {
            return latestSnapshot(characterName).orElseThrow(() -> error);
        }
    }

    /**
     * Explicitly refreshes only the requested character. The roster itself stays
     * DB-first and is refreshed separately through refreshRoster.
     */
    public CharacterResponse refreshCharacter(String characterName) {
        return refreshCharacter(characterName, false);
    }

    /**
     * DB-only read used by the character page's initial paint: returns instantly
     * without ever calling the (slow) Lost Ark API. Callers that need a forced
     * live refresh (e.g. the roster "업데이트" button) must keep using find()/
     * refreshCharacter() instead of this.
     */
    public java.util.Optional<CharacterResponse> cached(String characterName) {
        return latestSnapshot(characterName);
    }

    private CharacterResponse refreshCharacter(String characterName, boolean discoverRosterIfMissing) {
        JsonNode armory = get("/armories/characters/{name}", characterName);
        if (armory == null || armory.path("ArmoryProfile").isMissingNode()
                || armory.path("ArmoryProfile").isNull()) {
            throw new LostArkApiException(HttpStatus.NOT_FOUND, "캐릭터를 찾을 수 없습니다.");
        }

        CharacterSnapshot rosterSnapshot = latestRosterSnapshot(characterName).orElse(null);
        JsonNode roster = rosterSnapshot == null
                ? discoverRosterIfMissing
                    ? get("/characters/{name}/siblings", characterName)
                    : JsonNodeFactory.instance.arrayNode()
                : rosterFromSnapshot(rosterSnapshot);
        if (roster == null) roster = JsonNodeFactory.instance.arrayNode();
        Instant fetchedAt = Instant.now();
        String rosterKey = saveSnapshot(characterName, armory, roster, fetchedAt);
        return new CharacterResponse(armory, withLatestStoredProfiles(roster), false, fetchedAt, discoveries(rosterKey),
                growthHistory(armory.path("ArmoryProfile").path("CharacterName").asText(characterName)));
    }

    /**
     * Equipment-only read for the honing pages (일반/상급/통합 재련), which only need the
     * 6 honable slots. Unlike find()/refreshCharacter(), this never writes a DB snapshot
     * or fetches roster/discoveries/growth history - it exists purely to avoid paying for
     * the full character bundle when only ArmoryEquipment is needed.
     */
    public JsonNode equipmentSnapshot(String characterName) {
        JsonNode armory = get("/armories/characters/{name}", characterName);
        if (armory == null || armory.path("ArmoryProfile").isMissingNode()
                || armory.path("ArmoryProfile").isNull()) {
            throw new LostArkApiException(HttpStatus.NOT_FOUND, "캐릭터를 찾을 수 없습니다.");
        }
        ObjectNode result = objectMapper.createObjectNode();
        result.putObject("armory").set("ArmoryEquipment", armory.path("ArmoryEquipment"));
        return result;
    }

    /**
     * Explicitly refreshes the roster in one user action. The siblings list is
     * fetched once and member armories are fetched concurrently. Successful
     * members are persisted as one coherent roster snapshot; a failed member
     * keeps its previous DB information.
     */
    public CharacterResponse refreshRoster(String characterName) {
        JsonNode siblings = get("/characters/{name}/siblings", characterName);
        JsonNode roster = siblings == null ? JsonNodeFactory.instance.arrayNode() : siblings;
        Map<String, JsonNode> refreshedArmories = java.util.Collections.synchronizedMap(new LinkedHashMap<>());
        java.util.stream.StreamSupport.stream(roster.spliterator(), true).forEach(member -> {
            String memberName = member.path("CharacterName").asText("").trim();
            if (memberName.isBlank()) return;
            try {
                JsonNode memberArmory = get("/armories/characters/{name}", memberName);
                if (memberArmory != null && !memberArmory.path("ArmoryProfile").isMissingNode()
                        && !memberArmory.path("ArmoryProfile").isNull()) {
                    refreshedArmories.put(memberName, memberArmory);
                }
            } catch (LostArkApiException error) {
                com.example.loark.config.ApplicationLog.infof("[CHARACTER ROSTER] Refresh skipped: %s / %s%n",
                        memberName, error.getMessage());
            }
        });

        Instant fetchedAt = Instant.now();
        String rosterKey = null;
        for (Map.Entry<String, JsonNode> refreshed : refreshedArmories.entrySet()) {
            String savedRosterKey = saveSnapshot(refreshed.getKey(), refreshed.getValue(), roster, fetchedAt);
            if (refreshed.getKey().equalsIgnoreCase(characterName)) rosterKey = savedRosterKey;
        }
        if (refreshedArmories.isEmpty()) {
            throw new LostArkApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "원정대 캐릭터 정보를 갱신하지 못했습니다.");
        }

        JsonNode requestedArmory = refreshedArmories.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase(characterName))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> latestSnapshot(characterName).map(CharacterResponse::armory).orElse(null));
        if (requestedArmory == null) {
            throw new LostArkApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "현재 캐릭터 정보를 갱신하지 못했습니다.");
        }
        if (rosterKey == null) rosterKey = rosterKey(characterName, roster);
        return new CharacterResponse(requestedArmory, withLatestStoredProfiles(roster), false, fetchedAt,
                discoveries(rosterKey), growthHistory(
                        requestedArmory.path("ArmoryProfile").path("CharacterName").asText(characterName)));
    }

    private String saveSnapshot(String requestedName, JsonNode armory, JsonNode siblings, Instant fetchedAt) {
        return transactionTemplate.execute(status ->
                saveSnapshotInTransaction(requestedName, armory, siblings, fetchedAt));
    }

    private String saveSnapshotInTransaction(String requestedName, JsonNode armory, JsonNode siblings, Instant fetchedAt) {
        JsonNode profile = armory.path("ArmoryProfile");
        String canonicalName = profile.path("CharacterName").asText(requestedName);
        String rosterKey = rosterKey(canonicalName, siblings);
        String contentHash = hash(armory.toString() + "\n" + siblings.toString());
        GameCharacter character = gameCharacters.findByCharacterName(canonicalName)
                .orElseGet(() -> new GameCharacter(canonicalName));
        character.observe(profile.path("ServerName").asText(""), profile.path("CharacterClassName").asText(""),
                profile.path("CharacterLevel").asInt(0), profile.path("ItemAvgLevel").asText(""),
                profile.path("CombatPower").asText(""), profile.path("CharacterImage").asText(""), rosterKey, fetchedAt);
        CharacterRankingClassifier.Classification classification =
                rankingClassifier.classify(armory, profile.path("CharacterClassName").asText(""));
        character.updateRanking(classification.engraving(), classification.role(), fetchedAt);

        List<JsonNode> memberNodes = new java.util.ArrayList<>();
        siblings.forEach(member -> {
            String memberName = member.path("CharacterName").asText("");
            // The canonical character is already tracked via `character` above; re-processing
            // it here as a "member" would load a second, detached copy of the same row and
            // collide on the unique character_name constraint when both are saved.
            if (!memberName.isBlank() && !memberName.equalsIgnoreCase(canonicalName)) memberNodes.add(member);
        });
        Map<String, GameCharacter> existingMembers = memberNodes.isEmpty()
                ? Map.of()
                : gameCharacters.findByCharacterNameLowerIn(memberNodes.stream()
                        .map(member -> member.path("CharacterName").asText("").toLowerCase())
                        .distinct()
                        .toList()).stream()
                    .collect(java.util.stream.Collectors.toMap(
                            gc -> gc.getCharacterName().toLowerCase(), gc -> gc, (a, b) -> a));

        List<GameCharacter> charactersToSave = new java.util.ArrayList<>();
        charactersToSave.add(character);
        for (JsonNode member : memberNodes) {
            String memberName = member.path("CharacterName").asText("");
            GameCharacter rosterCharacter = existingMembers.getOrDefault(memberName.toLowerCase(),
                    new GameCharacter(memberName));
            rosterCharacter.observe(member.path("ServerName").asText(""), member.path("CharacterClassName").asText(""),
                    member.path("CharacterLevel").asInt(0), member.path("ItemAvgLevel").asText(""),
                    null, null, rosterKey, fetchedAt);
            charactersToSave.add(rosterCharacter);
        }
        gameCharacters.saveAll(charactersToSave);

        if (snapshots.findTopByCharacterNameOrderByFetchedAtDesc(canonicalName)
                .map(snapshot -> contentHash.equals(snapshot.getContentHash())).orElse(false)) return rosterKey;
        CharacterSnapshot snapshot = snapshots.save(new CharacterSnapshot(
                canonicalName,
                profile.path("ServerName").asText(""),
                profile.path("CharacterClassName").asText(""),
                profile.path("CharacterLevel").asInt(0),
                profile.path("ItemAvgLevel").asText(""),
                profile.path("CombatPower").asText(""),
                profile.path("Title").asText(""),
                rosterKey,
                contentHash,
                armory.toString(),
                fetchedAt
        ));
        List<CharacterRosterMember> rosterMemberRows = new java.util.ArrayList<>();
        siblings.forEach(member -> rosterMemberRows.add(new CharacterRosterMember(
                snapshot.getId(), rosterKey, member.path("CharacterName").asText(""),
                member.path("ServerName").asText(""), member.path("CharacterClassName").asText(""),
                member.path("CharacterLevel").asInt(0), member.path("ItemAvgLevel").asText(""),
                member.path("ItemMaxLevel").asText(""), fetchedAt)));
        rosterMembers.saveAll(rosterMemberRows);
        java.util.Set<String> observedCardSets = new java.util.LinkedHashSet<>();
        armory.path("ArmoryCard").path("Effects").forEach(effect -> effect.path("Items").forEach(item -> {
            String name = item.path("Name").asText("").trim();
            if (!name.isBlank()) observedCardSets.add(name);
        }));
        List<CharacterCardSetObservation> cardSetRows = observedCardSets.stream()
                .map(name -> new CharacterCardSetObservation(snapshot.getId(), rosterKey, canonicalName, name, fetchedAt))
                .toList();
        cardSets.saveAll(cardSetRows);
        return rosterKey;
    }

    private java.util.Optional<CharacterResponse> latestSnapshot(String characterName) {
        return snapshots.findTopByCharacterNameOrderByFetchedAtDesc(characterName)
                .flatMap(snapshot -> {
                    try {
                        ArrayNode siblings = rosterFromSnapshot(snapshot);
                        return java.util.Optional.of(new CharacterResponse(
                                objectMapper.readTree(snapshot.getArmoryPayload()), withLatestStoredProfiles(siblings),
                                true,
                                snapshot.getFetchedAt(),
                                discoveries(snapshot.getRosterKey()),
                                growthHistory(snapshot.getCharacterName())
                        ));
                    } catch (Exception parseError) {
                        com.example.loark.config.ApplicationLog.infof(
                                "[CHARACTER DB] Invalid snapshot ignored: %s / %d%n",
                                characterName, snapshot.getId());
                        return java.util.Optional.empty();
                    }
                });
    }

    private java.util.Optional<CharacterSnapshot> latestRosterSnapshot(String characterName) {
        java.util.Optional<CharacterSnapshot> direct =
                snapshots.findTopByCharacterNameOrderByFetchedAtDesc(characterName);
        if (direct.isPresent()) return direct;
        return gameCharacters.findByCharacterName(characterName)
                .map(GameCharacter::getRosterKey)
                .filter(key -> key != null && !key.isBlank())
                .flatMap(snapshots::findTopByRosterKeyOrderByFetchedAtDesc);
    }

    private ArrayNode rosterFromSnapshot(CharacterSnapshot snapshot) {
        ArrayNode siblings = objectMapper.createArrayNode();
        rosterMembers.findBySnapshotIdOrderByCharacterNameAsc(snapshot.getId()).forEach(member -> {
            ObjectNode row = siblings.addObject();
            row.put("CharacterName", member.getCharacterName());
            row.put("ServerName", member.getServerName());
            row.put("CharacterClassName", member.getClassName());
            row.put("CharacterLevel", member.getCharacterLevel());
            row.put("ItemAvgLevel", member.getItemLevel());
            row.put("ItemMaxLevel", member.getMaxItemLevel());
        });
        return siblings;
    }

    private JsonNode withLatestStoredProfiles(JsonNode siblings) {
        ArrayNode result = objectMapper.createArrayNode();
        if (siblings == null) return result;
        List<String> lowerNames = new java.util.ArrayList<>();
        siblings.forEach(member -> {
            String name = member.path("CharacterName").asText("").trim();
            if (!name.isBlank()) lowerNames.add(name.toLowerCase());
        });
        Map<String, GameCharacter> latestByName = lowerNames.isEmpty()
                ? Map.of()
                : gameCharacters.findByCharacterNameLowerIn(lowerNames.stream().distinct().toList()).stream()
                    .collect(java.util.stream.Collectors.toMap(
                            character -> character.getCharacterName().toLowerCase(),
                            character -> character,
                            (first, second) -> first));
        siblings.forEach(member -> {
            ObjectNode row = member.isObject()
                    ? (ObjectNode) member.deepCopy()
                    : objectMapper.createObjectNode();
            String name = member.path("CharacterName").asText("").trim();
            GameCharacter latest = latestByName.get(name.toLowerCase());
            if (latest != null) {
                if (latest.getServerName() != null && !latest.getServerName().isBlank()) {
                    row.put("ServerName", latest.getServerName());
                }
                if (latest.getClassName() != null && !latest.getClassName().isBlank()) {
                    row.put("CharacterClassName", latest.getClassName());
                }
                if (latest.getCharacterLevel() > 0) {
                    row.put("CharacterLevel", latest.getCharacterLevel());
                }
                if (latest.getItemLevel() != null && !latest.getItemLevel().isBlank()) {
                    row.put("ItemAvgLevel", latest.getItemLevel());
                }
                if (latest.getCharacterImage() != null && !latest.getCharacterImage().isBlank()) {
                    row.put("CharacterImage", latest.getCharacterImage());
                }
            }
            result.add(row);
        });
        return result;
    }

    private CharacterDiscoveries discoveries(String rosterKey) {
        return new CharacterDiscoveries(
                snapshots.findDistinctTitlesByRosterKey(rosterKey),
                cardSets.findDistinctCardSetNamesByRosterKey(rosterKey)
        );
    }

    private List<CharacterGrowthRecord> growthHistory(String characterName) {
        return snapshots.findGrowthByCharacterNameOrderByFetchedAtAsc(characterName).stream()
                .map(snapshot -> new CharacterGrowthRecord(
                        snapshot.getItemLevel(),
                        snapshot.getCombatPower() == null ? "" : snapshot.getCombatPower(),
                        snapshot.getFetchedAt()))
                .toList();
    }

    private String rosterKey(String characterName, JsonNode siblings) {
        List<String> members = new java.util.ArrayList<>();
        if (siblings != null) {
            siblings.forEach(member -> members.add(
                    member.path("ServerName").asText("") + ":" + member.path("CharacterName").asText("")));
        }
        if (members.isEmpty()) members.add(characterName);
        members.sort(String::compareToIgnoreCase);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(String.join("|", members).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception error) {
            throw new IllegalStateException("원정대 식별키 생성 실패", error);
        }
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            throw new IllegalStateException("스냅샷 해시 생성 실패", error);
        }
    }

    private JsonNode get(String uri, String name) {
        try {
            String kind = uri.contains("siblings") ? "원정대 캐릭터" : "장비·프로필 전체";
            return LostArkRequestContext.call("캐릭터: " + name + " / " + kind,
                    () -> client.get().uri(uri, name).retrieve().body(JsonNode.class));
        } catch (RestClientResponseException error) {
            throw new LostArkApiException(error.getStatusCode(), messageFor(error.getStatusCode().value()));
        }
    }

    private String messageFor(int status) {
        return switch (status) {
            case 401 -> "로스트아크 API 인증에 실패했습니다.";
            case 404 -> "캐릭터를 찾을 수 없습니다.";
            case 429 -> "API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
            case 503 -> "로스트아크 API가 점검 중입니다.";
            default -> "로스트아크 API 오류 (" + status + ")";
        };
    }
}
