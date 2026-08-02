package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CharacterSnapshotRepository extends JpaRepository<CharacterSnapshot, Long> {
    // character_name's collation (utf8mb4_unicode_ci) is already case-insensitive, so a plain
    // "=" here matches regardless of case while still using idx_character_snapshot_name_time.
    // IgnoreCase would wrap the column in UPPER(), which MySQL can't use the index for - on
    // this table (LONGTEXT armory_payload per row) that turns into a multi-second full scan.
    Optional<CharacterSnapshot> findTopByCharacterNameOrderByFetchedAtDesc(String characterName);
    Optional<CharacterSnapshot> findTopByRosterKeyOrderByFetchedAtDesc(String rosterKey);

    @Query("""
            select snapshot
            from CharacterSnapshot snapshot
            where snapshot.id in (
                select max(latest.id)
                from CharacterSnapshot latest
                group by lower(latest.characterName)
            )
            order by snapshot.fetchedAt desc
            """)
    List<CharacterSnapshot> findLatestSnapshotForEveryCharacter();

    // Id-only first pass (no LONGTEXT armory_payload, exact "in" so the name index applies) -
    // callers fetch the actual rows via the inherited findAllById(ids), which seeks by primary
    // key instead of re-scanning the table per name like the old single-query version did.
    @Query("select max(candidate.id) from CharacterSnapshot candidate "
            + "where candidate.characterName in :names group by candidate.characterName")
    List<Long> findLatestSnapshotIdsForCharacterNames(@Param("names") Collection<String> names);

    // Closed projection so growth-history reads only select itemLevel/combatPower/fetchedAt,
    // never the LONGTEXT armory_payload column - the more history a character has, the more
    // this matters.
    List<GrowthProjection> findGrowthByCharacterNameOrderByFetchedAtAsc(String characterName);

    interface GrowthProjection {
        String getItemLevel();
        String getCombatPower();
        Instant getFetchedAt();
    }

    @Query("select distinct snapshot.title from CharacterSnapshot snapshot where snapshot.rosterKey = :rosterKey and snapshot.title <> ''")
    List<String> findDistinctTitlesByRosterKey(@Param("rosterKey") String rosterKey);
}
