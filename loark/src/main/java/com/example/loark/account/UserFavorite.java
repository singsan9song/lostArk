package com.example.loark.account;

import com.example.loark.character.GameCharacter;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "user_favorite_characters",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_favorite_character_v2", columnNames = {"discord_id", "character_id"}),
        indexes = @Index(name = "idx_user_favorite_roster", columnList = "discord_id,roster_id"))
public class UserFavorite {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "discord_id", length = 32, nullable = false)
    private String discordId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "character_id", nullable = false, foreignKey = @ForeignKey(name = "fk_user_favorite_character"))
    private GameCharacter character;
    @Column(name = "roster_id", length = 120)
    private String rosterId;
    @Column(name = "roster_name", length = 60)
    private String rosterName;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
    @Column(name = "saved_at", nullable = false)
    private Instant savedAt;

    protected UserFavorite() {}
    public UserFavorite(String discordId, GameCharacter character, String rosterId,
                        String rosterName, int sortOrder, Instant savedAt) {
        this.discordId = discordId; this.character = character; this.rosterId = rosterId; this.rosterName = rosterName;
        this.sortOrder = sortOrder; this.savedAt = savedAt;
    }
    public void update(String rosterId, String rosterName, int sortOrder, Instant savedAt) {
        this.rosterId = rosterId; this.rosterName = rosterName; this.sortOrder = sortOrder; this.savedAt = savedAt;
    }
    public GameCharacter getCharacter() { return character; }
    public String getRosterId() { return rosterId; }
    public String getRosterName() { return rosterName; }
    public Instant getSavedAt() { return savedAt; }
}
