package com.example.loark.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
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
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected UserPreference() {}
    public UserPreference(String discordId) { this.discordId = discordId; }

    public void update(String theme) {
        this.theme = "light".equals(theme) ? "light" : "dark";
        this.updatedAt = Instant.now();
    }

    public String getTheme() { return theme; }
}
