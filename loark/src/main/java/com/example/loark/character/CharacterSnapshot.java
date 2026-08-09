package com.example.loark.character;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "character_snapshots", indexes = {
        @Index(name = "idx_character_snapshot_name_time", columnList = "character_name,fetched_at"),
        @Index(name = "idx_character_snapshot_roster_time", columnList = "roster_key,fetched_at")
})
public class CharacterSnapshot {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "character_name", length = 20, nullable = false)
    private String characterName;

    @Column(name = "server_name", length = 20, nullable = false)
    private String serverName;

    @Column(name = "class_name", length = 30, nullable = false)
    private String className;

    @Column(name = "character_level", nullable = false)
    private int characterLevel;

    @Column(name = "item_level", length = 20, nullable = false)
    private String itemLevel;

    // Populated going forward so growth-history reads don't need to fetch and JSON-parse
    // armory_payload (LONGTEXT) just to read combat power. Nullable because rows written
    // before this column existed have no value here.
    @Column(name = "combat_power", length = 30)
    private String combatPower;

    @Column(name = "title", length = 100, nullable = false)
    private String title;

    @Column(name = "roster_key", length = 64, nullable = false)
    private String rosterKey;

    @Column(name = "content_hash", length = 64, nullable = false)
    private String contentHash;

    @Lob
    @Column(name = "armory_payload", nullable = false, columnDefinition = "LONGTEXT")
    private String armoryPayload;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    protected CharacterSnapshot() {}

    public CharacterSnapshot(String characterName, String serverName, String className, int characterLevel,
                             String itemLevel, String combatPower, String title, String rosterKey,
                             String contentHash, String armoryPayload, Instant fetchedAt) {
        this.characterName = characterName;
        this.serverName = serverName;
        this.className = className;
        this.characterLevel = characterLevel;
        this.itemLevel = itemLevel;
        this.combatPower = combatPower;
        this.title = title;
        this.rosterKey = rosterKey;
        this.contentHash = contentHash;
        this.armoryPayload = armoryPayload;
        this.fetchedAt = fetchedAt;
    }

    public Long getId() { return id; }
    public String getCharacterName() { return characterName; }
    public String getArmoryPayload() { return armoryPayload; }
    public String getContentHash() { return contentHash; }
    public String getRosterKey() { return rosterKey; }
    public String getItemLevel() { return itemLevel; }
    public String getCombatPower() { return combatPower; }
    public Instant getFetchedAt() { return fetchedAt; }

    /**
     * Historical rows keep only the compact growth fields. The full Lost Ark
     * armory response belongs to the newest row for a character only.
     */
    public void archive() {
        this.armoryPayload = "{}";
    }

    /**
     * Refresh the current row when only non-historical character details have
     * changed. Item level and combat power changes create a new row instead;
     * discovered cards are stored once per roster in their own table.
     */
    public void updateCurrent(String serverName, String className, int characterLevel,
                              String itemLevel, String combatPower, String title,
                              String rosterKey, String contentHash, String armoryPayload,
                              Instant fetchedAt) {
        this.serverName = serverName;
        this.className = className;
        this.characterLevel = characterLevel;
        this.itemLevel = itemLevel;
        this.combatPower = combatPower;
        this.title = title;
        this.rosterKey = rosterKey;
        this.contentHash = contentHash;
        this.armoryPayload = armoryPayload;
        this.fetchedAt = fetchedAt;
    }
}
