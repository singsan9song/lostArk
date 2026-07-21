package com.example.loark.community;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

@Entity
@Table(name = "community_post_likes",
        uniqueConstraints = @UniqueConstraint(name = "uk_community_post_like", columnNames = {"post_id", "discord_id"}))
public class CommunityPostLike {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "post_id", nullable = false)
    private Long postId;
    @Column(name = "discord_id", nullable = false, length = 32)
    private String discordId;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected CommunityPostLike() {}

    public CommunityPostLike(Long postId, String discordId) {
        this.postId = postId;
        this.discordId = discordId;
    }

    public Long getId() { return id; }
    public Long getPostId() { return postId; }
    public String getDiscordId() { return discordId; }
}
