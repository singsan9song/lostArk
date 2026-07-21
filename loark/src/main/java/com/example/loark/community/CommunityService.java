package com.example.loark.community;

import com.example.loark.account.UserAccount;
import com.example.loark.account.UserAccountRepository;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommunityService {
    private final CommunityPostRepository posts;
    private final CommunityCommentRepository comments;
    private final CommunityPostLikeRepository likes;
    private final UserAccountRepository accounts;
    private final Set<String> adminDiscordIds;

    public CommunityService(CommunityPostRepository posts, CommunityCommentRepository comments,
                            CommunityPostLikeRepository likes, UserAccountRepository accounts,
                            @Value("${app.community.admin-discord-ids:}") String adminDiscordIds) {
        this.posts = posts;
        this.comments = comments;
        this.likes = likes;
        this.accounts = accounts;
        this.adminDiscordIds = new LinkedHashSet<>(Arrays.asList(adminDiscordIds.split(",")));
        this.adminDiscordIds.removeIf(String::isBlank);
    }

    public boolean isAdmin(String discordId) {
        return discordId != null && adminDiscordIds.contains(discordId);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> listPosts(CommunityCategory category, String sort, String search, int page, int size) {
        Sort order = "likes".equals(sort)
                ? Sort.by(Sort.Direction.DESC, "likeCount").and(Sort.by(Sort.Direction.DESC, "createdAt"))
                : Sort.by(Sort.Direction.DESC, "createdAt");
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 50)), order);
        Page<CommunityPost> result = search == null || search.isBlank()
                ? posts.findByCategory(category, pageable)
                : posts.findByCategoryAndTitleContainingIgnoreCase(category, search.trim(), pageable);

        List<Map<String, Object>> content = result.getContent().stream().map(this::summarize).toList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("content", content);
        response.put("page", result.getNumber());
        response.put("totalPages", result.getTotalPages());
        response.put("totalElements", result.getTotalElements());
        return response;
    }

    @Transactional
    public Map<String, Object> getPost(Long id, String viewerDiscordId) {
        CommunityPost post = posts.findById(id)
                .orElseThrow(() -> new CommunityException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."));
        post.incrementViewCount();
        posts.save(post);

        List<Map<String, Object>> commentRows = comments.findByPostIdOrderByCreatedAtAsc(id).stream()
                .map(this::summarizeComment).toList();
        boolean likedByMe = viewerDiscordId != null
                && likes.findByPostIdAndDiscordId(id, viewerDiscordId).isPresent();

        Map<String, Object> response = new LinkedHashMap<>(detail(post));
        response.put("comments", commentRows);
        response.put("likedByMe", likedByMe);
        return response;
    }

    @Transactional
    public Map<String, Object> createPost(String discordId, CommunityCategory category, String title, String content) {
        if (category == CommunityCategory.NOTICE && !isAdmin(discordId))
            throw new CommunityException(HttpStatus.FORBIDDEN, "공지사항은 관리자만 작성할 수 있습니다.");
        if (title == null || title.isBlank()) throw new CommunityException(HttpStatus.BAD_REQUEST, "제목을 입력해 주세요.");
        if (content == null || content.isBlank()) throw new CommunityException(HttpStatus.BAD_REQUEST, "내용을 입력해 주세요.");

        CommunityPost post = new CommunityPost(category, title.trim(), content, discordId);
        return detail(posts.save(post));
    }

    @Transactional
    public void deletePost(Long id, String discordId) {
        CommunityPost post = posts.findById(id)
                .orElseThrow(() -> new CommunityException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."));
        if (!post.getDiscordId().equals(discordId) && !isAdmin(discordId))
            throw new CommunityException(HttpStatus.FORBIDDEN, "게시글을 삭제할 권한이 없습니다.");
        comments.deleteByPostId(id);
        likes.deleteByPostId(id);
        posts.delete(post);
    }

    @Transactional
    public Map<String, Object> addComment(Long postId, String discordId, String content) {
        if (content == null || content.isBlank()) throw new CommunityException(HttpStatus.BAD_REQUEST, "댓글 내용을 입력해 주세요.");
        posts.findById(postId).orElseThrow(() -> new CommunityException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."));
        CommunityComment comment = new CommunityComment(postId, discordId, content.trim());
        return summarizeComment(comments.save(comment));
    }

    @Transactional
    public void deleteComment(Long id, String discordId) {
        CommunityComment comment = comments.findById(id)
                .orElseThrow(() -> new CommunityException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다."));
        if (!comment.getDiscordId().equals(discordId) && !isAdmin(discordId))
            throw new CommunityException(HttpStatus.FORBIDDEN, "댓글을 삭제할 권한이 없습니다.");
        comments.delete(comment);
    }

    @Transactional
    public Map<String, Object> toggleLike(Long postId, String discordId) {
        CommunityPost post = posts.findById(postId)
                .orElseThrow(() -> new CommunityException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다."));
        boolean liked = likes.findByPostIdAndDiscordId(postId, discordId)
                .map(existing -> { likes.delete(existing); post.adjustLikeCount(-1); return false; })
                .orElseGet(() -> { likes.save(new CommunityPostLike(postId, discordId)); post.adjustLikeCount(1); return true; });
        posts.save(post);
        return Map.of("liked", liked, "likeCount", post.getLikeCount());
    }

    private Map<String, Object> summarize(CommunityPost post) {
        Map<String, Object> row = new LinkedHashMap<>(author(post.getDiscordId()));
        row.put("id", post.getId());
        row.put("category", post.getCategory().name());
        row.put("title", post.getTitle());
        row.put("commentCount", comments.countByPostId(post.getId()));
        row.put("likeCount", post.getLikeCount());
        row.put("viewCount", post.getViewCount());
        row.put("createdAt", post.getCreatedAt().toString());
        return row;
    }

    private Map<String, Object> detail(CommunityPost post) {
        Map<String, Object> row = new LinkedHashMap<>(summarize(post));
        row.put("content", post.getContent());
        return row;
    }

    private Map<String, Object> summarizeComment(CommunityComment comment) {
        Map<String, Object> row = new LinkedHashMap<>(author(comment.getDiscordId()));
        row.put("id", comment.getId());
        row.put("content", comment.getContent());
        row.put("createdAt", comment.getCreatedAt().toString());
        return row;
    }

    private Map<String, Object> author(String discordId) {
        Map<String, Object> row = new LinkedHashMap<>();
        UserAccount account = accounts.findById(discordId).orElse(null);
        row.put("authorDiscordId", discordId);
        row.put("authorName", account == null ? "탈퇴한 사용자" : account.getUsername());
        row.put("authorAvatarUrl", account == null ? "" : Objects.toString(account.getAvatarUrl(), ""));
        row.put("authorIsAdmin", isAdmin(discordId));
        return row;
    }
}
