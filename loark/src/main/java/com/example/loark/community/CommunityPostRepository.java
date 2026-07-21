package com.example.loark.community;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CommunityPostRepository extends JpaRepository<CommunityPost, Long> {
    Page<CommunityPost> findByCategory(CommunityCategory category, Pageable pageable);
    Page<CommunityPost> findByCategoryAndTitleContainingIgnoreCase(
            CommunityCategory category, String title, Pageable pageable);
}
