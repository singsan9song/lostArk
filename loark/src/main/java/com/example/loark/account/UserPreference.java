package com.example.loark.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "user_preferences")
public class UserPreference {
    @Id
    @Column(name = "discord_id", length = 32, nullable = false)
    private String discordId;
    @Column(length = 10, nullable = false)
    private String theme = "dark";
    @Column(name = "include_pheon_cost", nullable = false)
    private boolean includePheonCost;
    @Column(name = "crystal_gold_per_100")
    private Integer crystalGoldPer100;
    @Column(name = "ability_stone_configuration", length = 120)
    private String abilityStoneConfiguration;
    @Lob
    @Column(name = "home_layout", columnDefinition = "LONGTEXT", nullable = false)
    private String homeLayout = "[]";
    @Lob
    @Column(name = "hidden_home_widgets", columnDefinition = "LONGTEXT", nullable = false)
    private String hiddenHomeWidgets = "[]";
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected UserPreference() {}
    public UserPreference(String discordId) { this.discordId = discordId; }

    public void update(String theme, boolean includePheonCost, Integer crystalGoldPer100,
                       String abilityStoneConfiguration, String homeLayout, String hiddenHomeWidgets) {
        this.theme = "light".equals(theme) ? "light" : "dark";
        this.includePheonCost = includePheonCost;
        this.crystalGoldPer100 = crystalGoldPer100;
        this.abilityStoneConfiguration = abilityStoneConfiguration;
        this.homeLayout = homeLayout == null ? "[]" : homeLayout;
        this.hiddenHomeWidgets = hiddenHomeWidgets == null ? "[]" : hiddenHomeWidgets;
        this.updatedAt = Instant.now();
    }

    public String getTheme() { return theme; }
    public boolean isIncludePheonCost() { return includePheonCost; }
    public Integer getCrystalGoldPer100() { return crystalGoldPer100; }
    public String getAbilityStoneConfiguration() { return abilityStoneConfiguration; }
    public String getHomeLayout() { return homeLayout; }
    public String getHiddenHomeWidgets() { return hiddenHomeWidgets; }
}
