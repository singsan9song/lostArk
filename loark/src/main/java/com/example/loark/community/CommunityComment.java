package com.example.loark.community;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "community_comments")
public class CommunityComment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "post_id", nullable = false)
    private Long postId;
    @Column(name = "discord_id", nullable = false, length = 32)
    private String discordId;
    @Column(nullable = false, length = 2000)
    private String content;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected CommunityComment() {}

    public CommunityComment(Long postId, String discordId, String content) {
        this.postId = postId;
        this.discordId = discordId;
        this.content = content;
    }

    public Long getId() { return id; }
    public Long getPostId() { return postId; }
    public String getDiscordId() { return discordId; }
    public String getContent() { return content; }
    public Instant getCreatedAt() { return createdAt; }
}
