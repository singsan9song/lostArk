package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CharacterRosterMemberRepository extends JpaRepository<CharacterRosterMember, Long> {
    List<CharacterRosterMember> findBySnapshotIdOrderByCharacterNameAsc(Long snapshotId);
}
