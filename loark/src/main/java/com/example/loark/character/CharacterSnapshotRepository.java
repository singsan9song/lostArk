package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CharacterSnapshotRepository extends JpaRepository<CharacterSnapshot, Long> {
    Optional<CharacterSnapshot> findTopByCharacterNameIgnoreCaseOrderByFetchedAtDesc(String characterName);
    Optional<CharacterSnapshot> findTopByRosterKeyOrderByFetchedAtDesc(String rosterKey);

    // Closed projection so growth-history reads only select itemLevel/combatPower/fetchedAt,
    // never the LONGTEXT armory_payload column - the more history a character has, the more
    // this matters.
    List<GrowthProjection> findGrowthByCharacterNameIgnoreCaseOrderByFetchedAtAsc(String characterName);

    interface GrowthProjection {
        String getItemLevel();
        String getCombatPower();
        Instant getFetchedAt();
    }

    @Query("select distinct snapshot.title from CharacterSnapshot snapshot where snapshot.rosterKey = :rosterKey and snapshot.title <> ''")
    List<String> findDistinctTitlesByRosterKey(@Param("rosterKey") String rosterKey);
}
