package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface GameCharacterRepository extends JpaRepository<GameCharacter, Long>,
        JpaSpecificationExecutor<GameCharacter> {
    // character_name's collation is already case-insensitive (utf8mb4_unicode_ci); IgnoreCase
    // would force UPPER() and lose the index (see CharacterSnapshotRepository for details).
    Optional<GameCharacter> findByCharacterName(String characterName);

    // Batch lookup used to save a whole expedition roster in one round trip
    // instead of one findByCharacterNameIgnoreCase per member.
    @Query("select character from GameCharacter character where lower(character.characterName) in :lowerNames")
    List<GameCharacter> findByCharacterNameLowerIn(@Param("lowerNames") Collection<String> lowerNames);

    // Returns the entities directly (not just ids) so the ranking backfill loop doesn't
    // need a second findById per row to get something to update and save.
    @Query("select character from GameCharacter character "
            + "where character.rankingReady = false or character.rankingReady is null order by character.id")
    List<GameCharacter> findCharactersNeedingRanking(Pageable pageable);

    @Query("select distinct character.serverName from GameCharacter character "
            + "where character.rankingReady = true and character.serverName <> '' order by character.serverName")
    List<String> findRankingServerNames();

    @Query("select distinct character.className from GameCharacter character "
            + "where character.rankingReady = true and character.className <> '' order by character.className")
    List<String> findRankingClassNames();

    @Query("select character.className, character.representativeEngraving, count(character) "
            + "from GameCharacter character "
            + "where character.rankingReady = true "
            + "and character.className <> '' and character.representativeEngraving <> '' "
            + "group by character.className, character.representativeEngraving "
            + "order by character.className, character.representativeEngraving")
    List<Object[]> findDamageOptionCorpusOptions();

    // Ranked + paged: the corpus endpoint only ever needs a handful of the best-geared
    // characters per page, never the whole (potentially thousands-strong) engraving group.
    @Query("select character.characterName from GameCharacter character "
            + "where character.rankingReady = true "
            + "and character.className = :className "
            + "and character.representativeEngraving = :engraving "
            + "order by character.itemLevelValue desc")
    List<String> findDamageOptionCorpusCharacterNames(
            @Param("className") String className,
            @Param("engraving") String engraving,
            Pageable pageable);
}
