package com.example.loark.account;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface UserFavoriteRepository extends JpaRepository<UserFavorite, Long> {
    List<UserFavorite> findByDiscordIdOrderBySortOrderAsc(String discordId);

    // Eagerly loads the character in the same query instead of one lazy-load (plus one
    // existsById guard query) per favorite - used by the /api/user-data read path.
    @Query("select f from UserFavorite f join fetch f.character where f.discordId = :discordId order by f.sortOrder asc")
    List<UserFavorite> findByDiscordIdWithCharacterOrderBySortOrderAsc(@Param("discordId") String discordId);

    void deleteByDiscordId(String discordId);
}
