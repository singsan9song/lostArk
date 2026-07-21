package com.example.loark.community;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommunityPostLikeRepository extends JpaRepository<CommunityPostLike, Long> {
    Optional<CommunityPostLike> findByPostIdAndDiscordId(Long postId, String discordId);
    void deleteByPostId(Long postId);
}
