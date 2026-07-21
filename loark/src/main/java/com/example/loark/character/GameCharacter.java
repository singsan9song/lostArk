package com.example.loark.character;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "game_characters", indexes = {
        @Index(name = "idx_game_character_server_class", columnList = "server_name,class_name"),
        @Index(name = "idx_game_character_roster", columnList = "roster_key")
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
        this.lastObservedAt = observedAt;
    }
    public String getCharacterName() { return characterName; }
    public Long getId() { return id; }
    public String getServerName() { return serverName; }
    public String getClassName() { return className; }
    public String getItemLevel() { return itemLevel; }
    public String getCombatPower() { return combatPower; }
    public String getCharacterImage() { return characterImage; }
}
