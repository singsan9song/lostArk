package com.example.loark.community;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "community_posts")
public class CommunityPost {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CommunityCategory category;
    @Column(nullable = false, length = 200)
    private String title;
    @Column(nullable = false, length = 10000)
    private String content;
    @Column(name = "discord_id", nullable = false, length = 32)
    private String discordId;
    @Column(name = "view_count", nullable = false)
    private int viewCount;
    @Column(name = "like_count", nullable = false)
    private int likeCount;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected CommunityPost() {}

    public CommunityPost(CommunityCategory category, String title, String content, String discordId) {
        this.category = category;
        this.title = title;
        this.content = content;
        this.discordId = discordId;
    }

    public void incrementViewCount() { this.viewCount++; }
    public void adjustLikeCount(int delta) { this.likeCount = Math.max(0, this.likeCount + delta); }

    public Long getId() { return id; }
    public CommunityCategory getCategory() { return category; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public String getDiscordId() { return discordId; }
    public int getViewCount() { return viewCount; }
    public int getLikeCount() { return likeCount; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
