package com.example.loark.community;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommunityCommentRepository extends JpaRepository<CommunityComment, Long> {
    List<CommunityComment> findByPostIdOrderByCreatedAtAsc(Long postId);
    long countByPostId(Long postId);
    void deleteByPostId(Long postId);

    // Used by the post list (up to 50 rows/page) to get every post's comment count in one
    // query instead of one countByPostId call per row.
    @Query("select comment.postId as postId, count(comment) as count from CommunityComment comment "
            + "where comment.postId in :postIds group by comment.postId")
    List<PostCommentCount> countByPostIdIn(@Param("postIds") Collection<Long> postIds);

    interface PostCommentCount {
        Long getPostId();
        Long getCount();
    }
}
