package com.example.loark.account;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "user_raid_tasks",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_character_raid", columnNames = {"discord_id", "character_name", "raid_id"}),
        indexes = @Index(name = "idx_user_raid_character", columnList = "discord_id,character_name"))
public class UserRaidTask {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "discord_id", length = 32, nullable = false)
    private String discordId;
    @Column(name = "character_name", length = 20, nullable = false)
    private String characterName;
    @Column(name = "raid_id", length = 80, nullable = false)
    private String raidId;
    @Column(name = "difficulty_id", length = 80, nullable = false)
    private String difficultyId;
    @Column(name = "gold_earning", nullable = false)
    private boolean goldEarning;
    @Column(name = "bus_fare", nullable = false)
    private int busFare;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_raid_extra_reward_gates", joinColumns = @JoinColumn(name = "task_id"))
    @Column(name = "gate_number", nullable = false)
    private Set<Integer> extraRewardGates = new LinkedHashSet<>();
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_raid_completed_gates", joinColumns = @JoinColumn(name = "task_id"))
    @Column(name = "gate_number", nullable = false)
    private Set<Integer> completedGates = new LinkedHashSet<>();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected UserRaidTask() {}
    public UserRaidTask(String discordId, String characterName, String raidId, String difficultyId,
                        boolean goldEarning, int busFare, Set<Integer> extraRewardGates, Set<Integer> completedGates) {
        this.discordId = discordId; this.characterName = characterName; this.raidId = raidId;
        this.difficultyId = difficultyId; this.goldEarning = goldEarning; this.busFare = Math.max(0, busFare);
        this.extraRewardGates.addAll(extraRewardGates); this.completedGates.addAll(completedGates);
    }
    public String getCharacterName() { return characterName; }
    public String getRaidId() { return raidId; }
    public String getDifficultyId() { return difficultyId; }
    public boolean isGoldEarning() { return goldEarning; }
    public int getBusFare() { return busFare; }
    public Set<Integer> getExtraRewardGates() { return extraRewardGates; }
    public Set<Integer> getCompletedGates() { return completedGates; }
}
