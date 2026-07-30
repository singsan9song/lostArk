package com.example.loark.account;

import com.example.loark.character.GameCharacter;
import com.example.loark.character.GameCharacterRepository;
import com.example.loark.config.LostArkApiRequestCounter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class AccountController {
    private final UserAccountRepository accounts;
    private final UserPreferenceRepository preferences;
    private final UserFavoriteRepository favorites;
    private final UserRaidTaskRepository raidTasks;
    private final GameCharacterRepository gameCharacters;
    private final ObjectMapper objectMapper;
    private final String discordAvatarBaseUrl;
    private final Set<String> adminDiscordIds;
    private final LostArkApiRequestCounter apiRequestCounter;

    public AccountController(UserAccountRepository accounts, UserPreferenceRepository preferences,
                             UserFavoriteRepository favorites, UserRaidTaskRepository raidTasks,
                             GameCharacterRepository gameCharacters,
                             ObjectMapper objectMapper,
                             LostArkApiRequestCounter apiRequestCounter,
                             @Value("${discord.cdn.avatar-base-url}") String discordAvatarBaseUrl,
                             @Value("${app.community.admin-discord-ids:}") String adminDiscordIds) {
        this.accounts = accounts; this.preferences = preferences; this.favorites = favorites;
        this.raidTasks = raidTasks; this.gameCharacters = gameCharacters; this.objectMapper = objectMapper;
        this.apiRequestCounter = apiRequestCounter;
        this.discordAvatarBaseUrl = discordAvatarBaseUrl;
        this.adminDiscordIds = new LinkedHashSet<>(Arrays.asList(adminDiscordIds.split(",")));
        this.adminDiscordIds.removeIf(String::isBlank);
    }

    @GetMapping("/auth/me")
    public Map<String, Object> me(@AuthenticationPrincipal OAuth2User principal) {
        if (principal == null) return Map.of("authenticated", false);
        UserAccount account = account(principal);
        return Map.of("authenticated", true, "id", account.getDiscordId(), "username", account.getUsername(),
                "avatarUrl", account.getAvatarUrl() == null ? "" : account.getAvatarUrl(),
                "isAdmin", adminDiscordIds.contains(account.getDiscordId()));
    }

    @GetMapping(value = "/admin/api-requests/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter apiRequestStream(@AuthenticationPrincipal OAuth2User principal) {
        requireAdmin(principal);
        return apiRequestCounter.subscribe();
    }

    @GetMapping("/admin/api-requests/history")
    public List<LostArkApiRequestCounter.MinuteHistory> apiRequestHistory(
            @AuthenticationPrincipal OAuth2User principal) {
        requireAdmin(principal);
        return apiRequestCounter.history();
    }

    @GetMapping("/admin/api-requests/history/details")
    public List<LostArkApiRequestCounter.RequestRecord> apiRequestHistoryDetails(
            @AuthenticationPrincipal OAuth2User principal,
            @RequestParam Instant resetAt) {
        requireAdmin(principal);
        return apiRequestCounter.historyDetails(resetAt);
    }

    @GetMapping("/admin/api-requests/history/search")
    public LostArkApiRequestCounter.SearchHistoryResult searchApiRequestHistory(
            @AuthenticationPrincipal OAuth2User principal,
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "200") int size) {
        requireAdmin(principal);
        return apiRequestCounter.searchHistory(query, page, size);
    }

    private void requireAdmin(OAuth2User principal) {
        String discordId = principal == null ? null : principal.getAttribute("id");
        if (discordId == null || !adminDiscordIds.contains(discordId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "관리자만 확인할 수 있습니다.");
        }
    }

    @PostMapping("/auth/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        new SecurityContextLogoutHandler().logout(request, response, null);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/user-data")
    @Transactional
    public Map<String, String> getUserData(@AuthenticationPrincipal OAuth2User principal) {
        UserAccount account = account(principal);
        if (!account.isDataInitialized()) return Map.of();
        Map<String, String> result = new LinkedHashMap<>();

        ArrayNode favoriteRows = objectMapper.createArrayNode();
        favorites.findByDiscordIdOrderBySortOrderAsc(account.getDiscordId()).forEach(favorite -> {
            GameCharacter character = favorite.getCharacter();
            if (character == null || !gameCharacters.existsById(character.getId())) return;
            ObjectNode row = favoriteRows.addObject();
            row.put("characterName", character.getCharacterName()); row.put("serverName", character.getServerName());
            row.put("className", character.getClassName()); row.put("itemLevel", character.getItemLevel());
            row.put("combatPower", character.getCombatPower()); row.put("characterImage", character.getCharacterImage());
            row.put("rosterId", favorite.getRosterId()); row.put("rosterName", favorite.getRosterName());
            row.put("savedAt", favorite.getSavedAt().toString());
        });
        result.put("loark-favorite-characters", favoriteRows.toString());
        result.put("loark-representative-character", Objects.toString(account.getRepresentativeCharacterName(), ""));

        ObjectNode raidRows = objectMapper.createObjectNode();
        raidTasks.findByDiscordIdOrderByCharacterNameAscIdAsc(account.getDiscordId()).forEach(task -> {
            ArrayNode characterTasks = raidRows.withArray(task.getCharacterName());
            ObjectNode row = characterTasks.addObject();
            row.put("raidId", task.getRaidId()); row.put("difficultyId", task.getDifficultyId());
            row.put("goldEarning", task.isGoldEarning()); row.put("busFare", task.getBusFare());
            ArrayNode extra = row.putArray("extraRewardGates"); task.getExtraRewardGates().forEach(extra::add);
            ArrayNode completed = row.putArray("completedGates"); task.getCompletedGates().forEach(completed::add);
        });
        result.put("loark-expedition-raid-settings", raidRows.toString());

        UserPreference preference = preferences.findById(account.getDiscordId()).orElse(new UserPreference(account.getDiscordId()));
        result.put("loark-theme", preference.getTheme());
        result.put("loark-character-honing-materials", preference.getHoningMaterials());
        result.put("loark-other-efficiency-catalog", preference.getOtherEfficiencyCatalog());
        result.put("loark-damage-analysis-settings", preference.getDamageAnalysisSettings());
        return result;
    }

    @PutMapping("/user-data")
    @Transactional
    public Map<String, String> putUserData(@AuthenticationPrincipal OAuth2User principal,
                                           @RequestBody Map<String, String> data) {
        UserAccount account = account(principal);
        String discordId = account.getDiscordId();
        if (data.size() > 50) throw new IllegalArgumentException("저장 가능한 설정 수를 초과했습니다.");

        // Upsert by character instead of delete-all-then-reinsert: keeps existing
        // rows (and their ids) for characters still favorited, adds new ones,
        // removes ones no longer in the list, and updates in place if the same
        // character appears twice in one request (rather than a duplicate INSERT
        // hitting the discord_id+character_id unique constraint).
        JsonNode favoriteRows = parse(data.get("loark-favorite-characters"), "[]");
        Map<Long, UserFavorite> existingFavorites = new HashMap<>();
        favorites.findByDiscordIdOrderBySortOrderAsc(discordId).forEach(favorite -> {
            if (favorite.getCharacter() != null) existingFavorites.put(favorite.getCharacter().getId(), favorite);
        });
        Set<Long> keptCharacterIds = new HashSet<>();
        Set<String> keptCharacterNames = new HashSet<>();
        int order = 0;
        if (favoriteRows.isArray()) for (JsonNode row : favoriteRows) {
            String name = row.path("characterName").asText("").trim();
            if (name.isBlank()) continue;
            GameCharacter character = gameCharacters.findByCharacterNameIgnoreCase(name).orElseGet(() -> {
                GameCharacter created = new GameCharacter(name);
                created.observe(text(row, "serverName"), text(row, "className"), 0, text(row, "itemLevel"),
                        text(row, "combatPower"), text(row, "characterImage"), null, Instant.now());
                return gameCharacters.save(created);
            });
            if (character.getServerName() == null || character.getServerName().isBlank()) {
                character.observe(text(row, "serverName"), text(row, "className"), 0, text(row, "itemLevel"),
                        text(row, "combatPower"), text(row, "characterImage"), null, Instant.now());
                gameCharacters.save(character);
            }
            if (!keptCharacterIds.add(character.getId())) continue;
            keptCharacterNames.add(character.getCharacterName());
            UserFavorite favorite = existingFavorites.get(character.getId());
            if (favorite != null) {
                favorite.update(text(row, "rosterId"), text(row, "rosterName"), order++, instant(row.path("savedAt").asText()));
                favorites.save(favorite);
            } else {
                favorites.save(new UserFavorite(discordId, character, text(row, "rosterId"), text(row, "rosterName"),
                        order++, instant(row.path("savedAt").asText())));
            }
        }
        existingFavorites.forEach((characterId, favorite) -> {
            if (!keptCharacterIds.contains(characterId)) favorites.delete(favorite);
        });
        account.setRepresentativeCharacterName(data.get("loark-representative-character"));

        List<UserRaidTask> existingRaidTasks = raidTasks.findByDiscordIdOrderByCharacterNameAscIdAsc(discordId);
        Map<RaidTaskKey, UserRaidTask> raidTasksByKey = new HashMap<>();
        existingRaidTasks.forEach(task ->
                raidTasksByKey.put(raidTaskKey(task.getCharacterName(), task.getRaidId()), task));
        Set<UserRaidTask> keptRaidTasks = Collections.newSetFromMap(new IdentityHashMap<>());
        JsonNode raidRows = parse(data.get("loark-expedition-raid-settings"), "{}");
        if (raidRows.isObject()) raidRows.properties().forEach(entry -> {
            if (!keptCharacterNames.contains(entry.getKey()) || !entry.getValue().isArray()) return;
            for (JsonNode row : entry.getValue()) {
                String raidId = text(row, "raidId"); String difficultyId = text(row, "difficultyId");
                if (raidId.isBlank() || difficultyId.isBlank()) continue;
                RaidTaskKey key = raidTaskKey(entry.getKey(), raidId);
                UserRaidTask task = raidTasksByKey.get(key);
                if (task == null) {
                    task = raidTasks.save(new UserRaidTask(discordId, entry.getKey(), raidId, difficultyId,
                            row.path("goldEarning").asBoolean(true), row.path("busFare").asInt(0),
                            integers(row.path("extraRewardGates")), integers(row.path("completedGates"))));
                    raidTasksByKey.put(key, task);
                } else {
                    task.update(difficultyId, row.path("goldEarning").asBoolean(true),
                            row.path("busFare").asInt(0), integers(row.path("extraRewardGates")),
                            integers(row.path("completedGates")));
                }
                keptRaidTasks.add(task);
            }
        });
        existingRaidTasks.forEach(task -> {
            if (!keptRaidTasks.contains(task)) raidTasks.delete(task);
        });

        ObjectNode honingRows = objectMapper.createObjectNode();
        JsonNode submittedHoningRows = parse(data.get("loark-character-honing-materials"), "{}");
        if (submittedHoningRows.isObject()) submittedHoningRows.properties().forEach(entry -> {
            if (keptCharacterNames.contains(entry.getKey()) && entry.getValue().isObject())
                honingRows.set(entry.getKey(), entry.getValue());
        });
        UserPreference preference = preferences.findById(discordId).orElse(new UserPreference(discordId));
        JsonNode submittedCatalog = parse(data.get("loark-other-efficiency-catalog"), "[]");
        String catalog = submittedCatalog.isArray() ? submittedCatalog.toString() : "[]";
        if (catalog.length() > 1_000_000)
            throw new IllegalArgumentException("기타 효율 보관함 용량을 초과했습니다.");
        JsonNode submittedDamageAnalysisSettings = parse(data.get("loark-damage-analysis-settings"), "{}");
        String damageAnalysisSettings = submittedDamageAnalysisSettings.isObject()
                ? submittedDamageAnalysisSettings.toString() : "{}";
        if (damageAnalysisSettings.length() > 200_000)
            throw new IllegalArgumentException("데미지 분석 설정 용량을 초과했습니다.");
        preference.update(data.get("loark-theme"), honingRows.toString(), catalog, damageAnalysisSettings);
        preferences.save(preference);
        account.markDataInitialized(); accounts.save(account);
        return data;
    }

    @DeleteMapping("/user-data")
    @Transactional
    public ResponseEntity<Void> deleteUserData(@AuthenticationPrincipal OAuth2User principal) {
        UserAccount account = account(principal);
        String discordId = account.getDiscordId();
        favorites.deleteByDiscordId(discordId);
        raidTasks.deleteByDiscordId(discordId);
        preferences.findById(discordId).ifPresent(preferences::delete);
        account.setRepresentativeCharacterName(null);
        accounts.save(account);
        return ResponseEntity.noContent().build();
    }

    private UserAccount account(OAuth2User principal) {
        String id = principal.getAttribute("id");
        if (id == null || id.isBlank()) throw new IllegalStateException("Discord 사용자 ID가 없습니다.");
        String globalName = principal.getAttribute("global_name");
        String username = globalName == null || globalName.isBlank() ? principal.getAttribute("username") : globalName;
        String avatar = principal.getAttribute("avatar");
        String avatarUrl = avatar == null ? null : discordAvatarBaseUrl + id + "/" + avatar + ".png?size=128";
        UserAccount account = accounts.findById(id).orElseGet(() -> new UserAccount(id, username, avatarUrl));
        account.updateProfile(username, avatarUrl);
        return accounts.save(account);
    }

    private JsonNode parse(String value, String fallback) {
        try { return objectMapper.readTree(value == null || value.isBlank() ? fallback : value); }
        catch (Exception ignored) { try { return objectMapper.readTree(fallback); } catch (Exception impossible) { throw new IllegalStateException(impossible); } }
    }
    private String text(JsonNode node, String field) { return node.path(field).asText(""); }
    private Instant instant(String value) { try { return Instant.parse(value); } catch (Exception ignored) { return Instant.now(); } }
    private Set<Integer> integers(JsonNode values) {
        Set<Integer> result = new LinkedHashSet<>(); if (values.isArray()) values.forEach(value -> result.add(value.asInt())); return result;
    }
    private RaidTaskKey raidTaskKey(String characterName, String raidId) {
        return new RaidTaskKey(characterName.toLowerCase(Locale.ROOT), raidId.toLowerCase(Locale.ROOT));
    }
    private record RaidTaskKey(String characterName, String raidId) {}
}
