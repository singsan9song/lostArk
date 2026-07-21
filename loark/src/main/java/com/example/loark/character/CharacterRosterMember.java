package com.example.loark.character;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "character_roster_members",
        uniqueConstraints = @UniqueConstraint(name = "uk_snapshot_roster_member", columnNames = {"snapshot_id", "character_name"}),
        indexes = {
                @Index(name = "idx_roster_member_snapshot", columnList = "snapshot_id"),
                @Index(name = "idx_roster_member_roster", columnList = "roster_key,observed_at")
        })
public class CharacterRosterMember {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "snapshot_id", nullable = false)
    private Long snapshotId;
    @Column(name = "roster_key", length = 64, nullable = false)
    private String rosterKey;
    @Column(name = "character_name", length = 20, nullable = false)
    private String characterName;
    @Column(name = "server_name", length = 20)
    private String serverName;
    @Column(name = "class_name", length = 30)
    private String className;
    @Column(name = "character_level", nullable = false)
    private int characterLevel;
    @Column(name = "item_level", length = 20)
    private String itemLevel;
    @Column(name = "max_item_level", length = 20)
    private String maxItemLevel;
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected CharacterRosterMember() {}
    public CharacterRosterMember(Long snapshotId, String rosterKey, String characterName, String serverName,
                                 String className, int characterLevel, String itemLevel, String maxItemLevel,
                                 Instant observedAt) {
        this.snapshotId = snapshotId; this.rosterKey = rosterKey; this.characterName = characterName;
        this.serverName = serverName; this.className = className; this.characterLevel = characterLevel;
        this.itemLevel = itemLevel; this.maxItemLevel = maxItemLevel; this.observedAt = observedAt;
    }
    public String getCharacterName() { return characterName; }
    public String getServerName() { return serverName; }
    public String getClassName() { return className; }
    public int getCharacterLevel() { return characterLevel; }
    public String getItemLevel() { return itemLevel; }
    public String getMaxItemLevel() { return maxItemLevel; }
}
