package com.example.loark.account;

import com.example.loark.character.GameCharacter;
import com.example.loark.character.GameCharacterRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
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

    public AccountController(UserAccountRepository accounts, UserPreferenceRepository preferences,
                             UserFavoriteRepository favorites, UserRaidTaskRepository raidTasks,
                             GameCharacterRepository gameCharacters,
                             ObjectMapper objectMapper,
                             @Value("${discord.cdn.avatar-base-url}") String discordAvatarBaseUrl,
                             @Value("${app.community.admin-discord-ids:}") String adminDiscordIds) {
        this.accounts = accounts; this.preferences = preferences; this.favorites = favorites;
        this.raidTasks = raidTasks; this.gameCharacters = gameCharacters; this.objectMapper = objectMapper;
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
        result.put("loark.includePheonCost", Boolean.toString(preference.isIncludePheonCost()));
        if (preference.getCrystalGoldPer100() != null) result.put("loark.crystalGoldPer100", preference.getCrystalGoldPer100().toString());
        if (preference.getAbilityStoneConfiguration() != null) result.put("loark.abilityStoneConfiguration", preference.getAbilityStoneConfiguration());
        result.put("loark-home-layout", preference.getHomeLayout());
        result.put("loark-home-hidden-widgets", preference.getHiddenHomeWidgets());
        return result;
    }

    @PutMapping("/user-data")
    @Transactional
    public Map<String, String> putUserData(@AuthenticationPrincipal OAuth2User principal,
                                           @RequestBody Map<String, String> data) {
        UserAccount account = account(principal);
        String discordId = account.getDiscordId();
        if (data.size() > 50) throw new IllegalArgumentException("저장 가능한 설정 수를 초과했습니다.");

        JsonNode favoriteRows = parse(data.get("loark-favorite-characters"), "[]");
        favorites.deleteAll(favorites.findByDiscordIdOrderBySortOrderAsc(discordId));
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
            favorites.save(new UserFavorite(discordId, character, text(row, "rosterId"), text(row, "rosterName"),
                    order++, instant(row.path("savedAt").asText())));
        }
        account.setRepresentativeCharacterName(data.get("loark-representative-character"));

        raidTasks.deleteAll(raidTasks.findByDiscordIdOrderByCharacterNameAscIdAsc(discordId));
        JsonNode raidRows = parse(data.get("loark-expedition-raid-settings"), "{}");
        if (raidRows.isObject()) raidRows.properties().forEach(entry -> {
            if (!entry.getValue().isArray()) return;
            for (JsonNode row : entry.getValue()) {
                String raidId = text(row, "raidId"); String difficultyId = text(row, "difficultyId");
                if (raidId.isBlank() || difficultyId.isBlank()) continue;
                raidTasks.save(new UserRaidTask(discordId, entry.getKey(), raidId, difficultyId,
                        row.path("goldEarning").asBoolean(true), row.path("busFare").asInt(0),
                        integers(row.path("extraRewardGates")), integers(row.path("completedGates"))));
            }
        });

        UserPreference preference = preferences.findById(discordId).orElse(new UserPreference(discordId));
        preference.update(data.get("loark-theme"), Boolean.parseBoolean(data.get("loark.includePheonCost")),
                integer(data.get("loark.crystalGoldPer100")), blankToNull(data.get("loark.abilityStoneConfiguration")),
                validatedJson(data.get("loark-home-layout"), "[]"), validatedJson(data.get("loark-home-hidden-widgets"), "[]"));
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
    private String validatedJson(String value, String fallback) { return parse(value, fallback).toString(); }
    private String text(JsonNode node, String field) { return node.path(field).asText(""); }
    private Instant instant(String value) { try { return Instant.parse(value); } catch (Exception ignored) { return Instant.now(); } }
    private Integer integer(String value) { try { return value == null ? null : Integer.valueOf(value); } catch (Exception ignored) { return null; } }
    private String blankToNull(String value) { return value == null || value.isBlank() ? null : value; }
    private Set<Integer> integers(JsonNode values) {
        Set<Integer> result = new LinkedHashSet<>(); if (values.isArray()) values.forEach(value -> result.add(value.asInt())); return result;
    }
}
