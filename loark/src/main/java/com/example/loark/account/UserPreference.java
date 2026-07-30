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
    @Lob
    @Column(name = "honing_materials", columnDefinition = "LONGTEXT", nullable = false)
    private String honingMaterials = "{}";
    @Lob
    @Column(name = "other_efficiency_catalog", columnDefinition = "LONGTEXT")
    private String otherEfficiencyCatalog = "[]";
    @Lob
    @Column(name = "damage_analysis_settings", columnDefinition = "LONGTEXT")
    private String damageAnalysisSettings = "{}";
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected UserPreference() {}
    public UserPreference(String discordId) { this.discordId = discordId; }

    public void update(String theme, String honingMaterials, String otherEfficiencyCatalog,
                        String damageAnalysisSettings) {
        this.theme = "light".equals(theme) ? "light" : "dark";
        this.honingMaterials = honingMaterials == null || honingMaterials.isBlank() ? "{}" : honingMaterials;
        this.otherEfficiencyCatalog = otherEfficiencyCatalog == null || otherEfficiencyCatalog.isBlank()
                ? "[]" : otherEfficiencyCatalog;
        this.damageAnalysisSettings = damageAnalysisSettings == null || damageAnalysisSettings.isBlank()
                ? "{}" : damageAnalysisSettings;
        this.updatedAt = Instant.now();
    }

    public String getTheme() { return theme; }
    public String getHoningMaterials() {
        return honingMaterials == null || honingMaterials.isBlank() ? "{}" : honingMaterials;
    }
    public String getOtherEfficiencyCatalog() {
        return otherEfficiencyCatalog == null || otherEfficiencyCatalog.isBlank()
                ? "[]" : otherEfficiencyCatalog;
    }
    public String getDamageAnalysisSettings() {
        return damageAnalysisSettings == null || damageAnalysisSettings.isBlank() ? "{}" : damageAnalysisSettings;
    }
}
