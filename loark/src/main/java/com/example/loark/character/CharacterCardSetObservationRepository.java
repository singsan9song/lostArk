package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface CharacterCardSetObservationRepository extends JpaRepository<CharacterCardSetObservation, Long> {
    @Query("select distinct observation.cardSetName from CharacterCardSetObservation observation where observation.rosterKey = :rosterKey")
    List<String> findDistinctCardSetNamesByRosterKey(@Param("rosterKey") String rosterKey);
}
