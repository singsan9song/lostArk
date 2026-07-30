package com.example.loark.character;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "game_characters", indexes = {
        @Index(name = "idx_game_character_server_class", columnList = "server_name,class_name"),
        @Index(name = "idx_game_character_roster", columnList = "roster_key"),
        @Index(name = "idx_game_character_combat_ranking", columnList = "combat_power_value,ranking_updated_at"),
        @Index(name = "idx_game_character_item_ranking", columnList = "item_level_value,ranking_updated_at"),
        @Index(name = "idx_game_character_role", columnList = "combat_role"),
        @Index(name = "idx_game_character_class_engraving", columnList = "class_name,representative_engraving")
})
public class GameCharacter {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "character_name", length = 20, nullable = false, unique = true)
    private String characterName;
    @Column(name = "server_name", length = 20)
    private String serverName;
    @Column(name = "class_name", length = 30)
    private String className;
    @Column(name = "character_level", nullable = false)
    private int characterLevel;
    @Column(name = "item_level", length = 20)
    private String itemLevel;
    @Column(name = "combat_power", length = 30)
    private String combatPower;
    @Column(name = "character_image", length = 500)
    private String characterImage;
    @Column(name = "roster_key", length = 64)
    private String rosterKey;
    @Column(name = "item_level_value", precision = 20, scale = 2)
    private BigDecimal itemLevelValue;
    @Column(name = "combat_power_value", precision = 20, scale = 2)
    private BigDecimal combatPowerValue;
    @Column(name = "representative_engraving", length = 50)
    private String representativeEngraving;
    @Column(name = "combat_role", length = 10)
    private String combatRole;
    @Column(name = "ranking_ready")
    private Boolean rankingReady = false;
    @Column(name = "ranking_updated_at")
    private Instant rankingUpdatedAt;
    @Column(name = "last_observed_at", nullable = false)
    private Instant lastObservedAt = Instant.now();

    protected GameCharacter() {}
    public GameCharacter(String characterName) { this.characterName = characterName; }
    public void observe(String serverName, String className, int characterLevel, String itemLevel,
                        String combatPower, String characterImage, String rosterKey, Instant observedAt) {
        this.serverName = serverName; this.className = className; this.characterLevel = characterLevel;
        this.itemLevel = itemLevel;
        if (combatPower != null && !combatPower.isBlank()) this.combatPower = combatPower;
        if (characterImage != null && !characterImage.isBlank()) this.characterImage = characterImage;
        if (rosterKey != null && !rosterKey.isBlank()) this.rosterKey = rosterKey;
        this.itemLevelValue = number(itemLevel);
        if (combatPower != null && !combatPower.isBlank()) this.combatPowerValue = number(combatPower);
        this.lastObservedAt = observedAt;
    }

    public void updateRanking(String representativeEngraving, String combatRole, Instant updatedAt) {
        this.itemLevelValue = number(itemLevel);
        this.combatPowerValue = number(combatPower);
        this.representativeEngraving = representativeEngraving == null ? "" : representativeEngraving;
        this.combatRole = combatRole == null ? "DEALER" : combatRole;
        this.rankingUpdatedAt = updatedAt == null ? lastObservedAt : updatedAt;
        this.rankingReady = true;
    }

    private BigDecimal number(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return new BigDecimal(value.replace(",", "").trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    public String getCharacterName() { return characterName; }
    public Long getId() { return id; }
    public String getServerName() { return serverName; }
    public String getClassName() { return className; }
    public String getItemLevel() { return itemLevel; }
    public String getCombatPower() { return combatPower; }
    public String getCharacterImage() { return characterImage; }
    public String getRosterKey() { return rosterKey; }
    public BigDecimal getItemLevelValue() { return itemLevelValue; }
    public BigDecimal getCombatPowerValue() { return combatPowerValue; }
    public String getRepresentativeEngraving() { return representativeEngraving; }
    public String getCombatRole() { return combatRole; }
    public boolean isRankingReady() { return Boolean.TRUE.equals(rankingReady); }
    public Instant getLastObservedAt() { return lastObservedAt; }
    public Instant getRankingUpdatedAt() { return rankingUpdatedAt; }
}
