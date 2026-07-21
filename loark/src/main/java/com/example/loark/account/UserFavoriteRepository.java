package com.example.loark.account;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UserFavoriteRepository extends JpaRepository<UserFavorite, Long> {
    List<UserFavorite> findByDiscordIdOrderBySortOrderAsc(String discordId);
    void deleteByDiscordId(String discordId);
}
