package com.example.loark.character;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "character_card_set_observations",
        uniqueConstraints = @UniqueConstraint(name = "uk_snapshot_card_set", columnNames = {"snapshot_id", "card_set_name"}),
        indexes = @Index(name = "idx_card_set_roster_time", columnList = "roster_key,observed_at"))
public class CharacterCardSetObservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "snapshot_id", nullable = false)
    private Long snapshotId;
    @Column(name = "roster_key", length = 64, nullable = false)
    private String rosterKey;
    @Column(name = "character_name", length = 20, nullable = false)
    private String characterName;
    @Column(name = "card_set_name", length = 255, nullable = false)
    private String cardSetName;
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected CharacterCardSetObservation() {}
    public CharacterCardSetObservation(Long snapshotId, String rosterKey, String characterName,
                                       String cardSetName, Instant observedAt) {
        this.snapshotId = snapshotId; this.rosterKey = rosterKey; this.characterName = characterName;
        this.cardSetName = cardSetName; this.observedAt = observedAt;
    }
}
