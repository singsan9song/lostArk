package com.example.loark.character;

import com.example.loark.config.LostArkRequestContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
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
import java.util.List;

@Service
public class CharacterService {
    private final RestClient client;
    private final CharacterSnapshotRepository snapshots;
    private final CharacterRosterMemberRepository rosterMembers;
    private final CharacterCardSetObservationRepository cardSets;
    private final GameCharacterRepository gameCharacters;
    private final ObjectMapper objectMapper;

    public CharacterService(RestClient lostArkRestClient, CharacterSnapshotRepository snapshots,
                            CharacterRosterMemberRepository rosterMembers,
                            CharacterCardSetObservationRepository cardSets,
                            GameCharacterRepository gameCharacters,
                            ObjectMapper objectMapper) {
        this.client = lostArkRestClient;
        this.snapshots = snapshots;
        this.rosterMembers = rosterMembers;
        this.cardSets = cardSets;
        this.gameCharacters = gameCharacters;
        this.objectMapper = objectMapper;
    }

    /**
     * A page load is an explicit refresh for this character. Changed responses
     * are appended to MySQL so equipment, cards, titles and growth can be
     * compared later without storing duplicate snapshots. The latest DB snapshot
     * is only used as a fallback.
     */
    public CharacterResponse find(String characterName) {
        try {
            JsonNode armory = get("/armories/characters/{name}", characterName);
            JsonNode siblings = get("/characters/{name}/siblings", characterName);
            if (armory == null || armory.path("ArmoryProfile").isMissingNode()
                    || armory.path("ArmoryProfile").isNull()) {
                throw new LostArkApiException(HttpStatus.NOT_FOUND, "캐릭터를 찾을 수 없습니다.");
            }

            JsonNode roster = siblings == null ? JsonNodeFactory.instance.arrayNode() : siblings;
            Instant fetchedAt = Instant.now();
            String rosterKey = saveSnapshot(characterName, armory, roster, fetchedAt);
            return new CharacterResponse(armory, roster, false, fetchedAt, discoveries(rosterKey));
        } catch (LostArkApiException error) {
            return latestSnapshot(characterName).orElseThrow(() -> error);
        }
    }

    private String saveSnapshot(String requestedName, JsonNode armory, JsonNode siblings, Instant fetchedAt) {
        JsonNode profile = armory.path("ArmoryProfile");
        String canonicalName = profile.path("CharacterName").asText(requestedName);
        String rosterKey = rosterKey(canonicalName, siblings);
        String contentHash = hash(armory.toString() + "\n" + siblings.toString());
        GameCharacter character = gameCharacters.findByCharacterNameIgnoreCase(canonicalName)
                .orElseGet(() -> new GameCharacter(canonicalName));
        character.observe(profile.path("ServerName").asText(""), profile.path("CharacterClassName").asText(""),
                profile.path("CharacterLevel").asInt(0), profile.path("ItemAvgLevel").asText(""),
                profile.path("CombatPower").asText(""), profile.path("CharacterImage").asText(""), rosterKey, fetchedAt);
        gameCharacters.save(character);
        siblings.forEach(member -> {
            String memberName = member.path("CharacterName").asText("");
            if (memberName.isBlank()) return;
            GameCharacter rosterCharacter = gameCharacters.findByCharacterNameIgnoreCase(memberName)
                    .orElseGet(() -> new GameCharacter(memberName));
            rosterCharacter.observe(member.path("ServerName").asText(""), member.path("CharacterClassName").asText(""),
                    member.path("CharacterLevel").asInt(0), member.path("ItemAvgLevel").asText(""),
                    null, null, rosterKey, fetchedAt);
            gameCharacters.save(rosterCharacter);
        });
        if (snapshots.findTopByCharacterNameIgnoreCaseOrderByFetchedAtDesc(canonicalName)
                .map(snapshot -> contentHash.equals(snapshot.getContentHash())).orElse(false)) return rosterKey;
        CharacterSnapshot snapshot = snapshots.save(new CharacterSnapshot(
                canonicalName,
                profile.path("ServerName").asText(""),
                profile.path("CharacterClassName").asText(""),
                profile.path("CharacterLevel").asInt(0),
                profile.path("ItemAvgLevel").asText(""),
                profile.path("Title").asText(""),
                rosterKey,
                contentHash,
                armory.toString(),
                fetchedAt
        ));
        siblings.forEach(member -> rosterMembers.save(new CharacterRosterMember(
                snapshot.getId(), rosterKey, member.path("CharacterName").asText(""),
                member.path("ServerName").asText(""), member.path("CharacterClassName").asText(""),
                member.path("CharacterLevel").asInt(0), member.path("ItemAvgLevel").asText(""),
                member.path("ItemMaxLevel").asText(""), fetchedAt)));
        java.util.Set<String> observedCardSets = new java.util.LinkedHashSet<>();
        armory.path("ArmoryCard").path("Effects").forEach(effect -> effect.path("Items").forEach(item -> {
            String name = item.path("Name").asText("").trim();
            if (!name.isBlank()) observedCardSets.add(name);
        }));
        observedCardSets.forEach(name -> cardSets.save(new CharacterCardSetObservation(
                snapshot.getId(), rosterKey, canonicalName, name, fetchedAt)));
        return rosterKey;
    }

    private java.util.Optional<CharacterResponse> latestSnapshot(String characterName) {
        return snapshots.findTopByCharacterNameIgnoreCaseOrderByFetchedAtDesc(characterName)
                .flatMap(snapshot -> {
                    try {
                        ArrayNode siblings = objectMapper.createArrayNode();
                        rosterMembers.findBySnapshotIdOrderByCharacterNameAsc(snapshot.getId()).forEach(member -> {
                            ObjectNode row = siblings.addObject();
                            row.put("CharacterName", member.getCharacterName()); row.put("ServerName", member.getServerName());
                            row.put("CharacterClassName", member.getClassName()); row.put("CharacterLevel", member.getCharacterLevel());
                            row.put("ItemAvgLevel", member.getItemLevel()); row.put("ItemMaxLevel", member.getMaxItemLevel());
                        });
                        return java.util.Optional.of(new CharacterResponse(
                                objectMapper.readTree(snapshot.getArmoryPayload()), siblings,
                                true,
                                snapshot.getFetchedAt(),
                                discoveries(snapshot.getRosterKey())
                        ));
                    } catch (Exception parseError) {
                        System.out.printf("[CHARACTER DB] Invalid snapshot ignored: %s / %d%n",
                                characterName, snapshot.getId());
                        return java.util.Optional.empty();
                    }
                });
    }

    private CharacterDiscoveries discoveries(String rosterKey) {
        return new CharacterDiscoveries(
                snapshots.findDistinctTitlesByRosterKey(rosterKey),
                cardSets.findDistinctCardSetNamesByRosterKey(rosterKey)
        );
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
