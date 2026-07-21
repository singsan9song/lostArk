package com.example.loark.community;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/community")
public class CommunityController {
    private final CommunityService community;

    public CommunityController(CommunityService community) {
        this.community = community;
    }

    @GetMapping("/posts")
    public Map<String, Object> listPosts(
            @RequestParam CommunityCategory category,
            @RequestParam(defaultValue = "latest") String sort,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "15") int size) {
        return community.listPosts(category, sort, search, page, size);
    }

    @GetMapping("/posts/{id}")
    public Map<String, Object> getPost(@PathVariable Long id, @AuthenticationPrincipal OAuth2User principal) {
        return community.getPost(id, principal == null ? null : discordId(principal));
    }

    @PostMapping("/posts")
    public Map<String, Object> createPost(@AuthenticationPrincipal OAuth2User principal, @RequestBody Map<String, String> body) {
        CommunityCategory category = parseCategory(body.get("category"));
        return community.createPost(discordId(principal), category, body.get("title"), body.get("content"));
    }

    @DeleteMapping("/posts/{id}")
    public void deletePost(@PathVariable Long id, @AuthenticationPrincipal OAuth2User principal) {
        community.deletePost(id, discordId(principal));
    }

    @PostMapping("/posts/{id}/comments")
    public Map<String, Object> addComment(@PathVariable Long id, @AuthenticationPrincipal OAuth2User principal,
                                          @RequestBody Map<String, String> body) {
        return community.addComment(id, discordId(principal), body.get("content"));
    }

    @DeleteMapping("/comments/{id}")
    public void deleteComment(@PathVariable Long id, @AuthenticationPrincipal OAuth2User principal) {
        community.deleteComment(id, discordId(principal));
    }

    @PostMapping("/posts/{id}/like")
    public Map<String, Object> toggleLike(@PathVariable Long id, @AuthenticationPrincipal OAuth2User principal) {
        return community.toggleLike(id, discordId(principal));
    }

    private String discordId(OAuth2User principal) {
        if (principal == null) throw new CommunityException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        String id = principal.getAttribute("id");
        if (id == null || id.isBlank()) throw new CommunityException(HttpStatus.UNAUTHORIZED, "Discord 사용자 ID가 없습니다.");
        return id;
    }

    private CommunityCategory parseCategory(String value) {
        try {
            return CommunityCategory.valueOf(String.valueOf(value).toUpperCase());
        } catch (Exception ignored) {
            throw new CommunityException(HttpStatus.BAD_REQUEST, "올바르지 않은 게시판 카테고리입니다.");
        }
    }
}
