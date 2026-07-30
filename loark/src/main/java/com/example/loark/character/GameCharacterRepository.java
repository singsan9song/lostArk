package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

public interface GameCharacterRepository extends JpaRepository<GameCharacter, Long>,
        JpaSpecificationExecutor<GameCharacter> {
    Optional<GameCharacter> findByCharacterNameIgnoreCase(String characterName);

    @Query("select character.id from GameCharacter character "
            + "where character.rankingReady = false or character.rankingReady is null order by character.id")
    List<Long> findIdsNeedingRanking(Pageable pageable);

    @Query("select distinct character.serverName from GameCharacter character "
            + "where character.rankingReady = true and character.serverName <> '' order by character.serverName")
    List<String> findRankingServerNames();

    @Query("select distinct character.className from GameCharacter character "
            + "where character.rankingReady = true and character.className <> '' order by character.className")
    List<String> findRankingClassNames();
}
