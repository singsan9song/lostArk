package com.example.loark.character;

import java.time.Instant;
import java.util.List;

public record CharacterRankingResponse(
        String metric,
        long totalElements,
        int totalPages,
        int page,
        int size,
        List<RankingRow> rows,
        RankingOptions options
) {
    public record RankingRow(
            long rank,
            String characterName,
            String serverName,
            String className,
            String engraving,
            String role,
            String itemLevel,
            String combatPower,
            String characterImage,
            Instant updatedAt
    ) {}

    public record RankingOptions(List<String> servers, List<String> classes) {}
}
