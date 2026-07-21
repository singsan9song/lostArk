package com.example.loark.character;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface GameCharacterRepository extends JpaRepository<GameCharacter, Long> {
    Optional<GameCharacter> findByCharacterNameIgnoreCase(String characterName);
}
