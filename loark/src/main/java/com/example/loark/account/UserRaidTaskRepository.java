package com.example.loark.account;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UserRaidTaskRepository extends JpaRepository<UserRaidTask, Long> {
    List<UserRaidTask> findByDiscordIdOrderByCharacterNameAscIdAsc(String discordId);
    void deleteByDiscordId(String discordId);
}
