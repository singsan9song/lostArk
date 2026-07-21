package com.example.loark.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "user_accounts")
public class UserAccount {
    @Id
    @Column(name = "discord_id", length = 32, nullable = false)
    private String discordId;
    @Column(length = 100, nullable = false)
    private String username;
    @Column(length = 255)
    private String avatarUrl;
    @Column(name = "representative_character_name", length = 20)
    private String representativeCharacterName;
    @Column(name = "data_initialized", nullable = false)
    private boolean dataInitialized;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected UserAccount() {}

    public UserAccount(String discordId, String username, String avatarUrl) {
        this.discordId = discordId;
        updateProfile(username, avatarUrl);
    }

    public void updateProfile(String username, String avatarUrl) {
        this.username = username == null || username.isBlank() ? "Discord 사용자" : username;
        this.avatarUrl = avatarUrl;
        this.updatedAt = Instant.now();
    }

    public void setRepresentativeCharacterName(String representativeCharacterName) {
        this.representativeCharacterName = representativeCharacterName == null || representativeCharacterName.isBlank()
                ? null : representativeCharacterName;
        this.updatedAt = Instant.now();
    }
    public void markDataInitialized() { this.dataInitialized = true; this.updatedAt = Instant.now(); }

    public String getDiscordId() { return discordId; }
    public String getUsername() { return username; }
    public String getAvatarUrl() { return avatarUrl; }
    public String getRepresentativeCharacterName() { return representativeCharacterName; }
    public boolean isDataInitialized() { return dataInitialized; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
