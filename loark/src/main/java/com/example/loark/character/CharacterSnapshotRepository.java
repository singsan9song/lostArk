package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CharacterSnapshotRepository extends JpaRepository<CharacterSnapshot, Long> {
    Optional<CharacterSnapshot> findTopByCharacterNameIgnoreCaseOrderByFetchedAtDesc(String characterName);
    @Query("select distinct snapshot.title from CharacterSnapshot snapshot where snapshot.rosterKey = :rosterKey and snapshot.title <> ''")
    List<String> findDistinctTitlesByRosterKey(@Param("rosterKey") String rosterKey);
}
