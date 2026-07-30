package com.example.loark.character;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
public class CharacterRankingService {
    private final GameCharacterRepository characters;

    public CharacterRankingService(GameCharacterRepository characters) {
        this.characters = characters;
    }

    public CharacterRankingResponse rankings(
            String metric,
            String server,
            String role,
            String className,
            String engraving,
            int page,
            int size
    ) {
        Metric selectedMetric = Metric.from(metric);
        int safePage = Math.max(0, page);
        int safeSize = Math.max(10, Math.min(100, size));

        Specification<GameCharacter> filters = (root, query, builder) -> builder.and(
                builder.isTrue(root.get("rankingReady")),
                builder.isNotNull(root.get(selectedMetric.property))
        );
        filters = equalIfPresent(filters, "serverName", server);
        filters = equalIfPresent(filters, "combatRole", normalizedRole(role));
        filters = equalIfPresent(filters, "className", className);
        filters = equalIfPresent(filters, "representativeEngraving", engraving);

        Sort sort = Sort.by(
                Sort.Order.desc(selectedMetric.property),
                Sort.Order.asc("rankingUpdatedAt"),
                Sort.Order.asc("characterName")
        );
        Page<GameCharacter> result =
                characters.findAll(filters, PageRequest.of(safePage, safeSize, sort));

        long firstRank = (long) safePage * safeSize + 1;
        List<CharacterRankingResponse.RankingRow> rows = java.util.stream.IntStream
                .range(0, result.getContent().size())
                .mapToObj(index -> row(firstRank + index, result.getContent().get(index)))
                .toList();
        return new CharacterRankingResponse(
                selectedMetric.apiName,
                result.getTotalElements(),
                result.getTotalPages(),
                safePage,
                safeSize,
                rows,
                new CharacterRankingResponse.RankingOptions(
                        characters.findRankingServerNames(),
                        characters.findRankingClassNames()
                )
        );
    }

    private Specification<GameCharacter> equalIfPresent(
            Specification<GameCharacter> specification,
            String property,
            String value
    ) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank() || normalized.equalsIgnoreCase("ALL")) return specification;
        return specification.and((root, query, builder) -> builder.equal(root.get(property), normalized));
    }

    private String normalizedRole(String role) {
        if (role == null || role.isBlank() || role.equalsIgnoreCase("ALL")) return "";
        String normalized = role.trim().toUpperCase(Locale.ROOT);
        return normalized.equals("SUPPORT") ? "SUPPORT" : "DEALER";
    }

    private CharacterRankingResponse.RankingRow row(long rank, GameCharacter character) {
        return new CharacterRankingResponse.RankingRow(
                rank,
                character.getCharacterName(),
                character.getServerName(),
                character.getClassName(),
                character.getRepresentativeEngraving(),
                character.getCombatRole(),
                character.getItemLevel(),
                character.getCombatPower(),
                character.getCharacterImage(),
                character.getRankingUpdatedAt()
        );
    }

    private enum Metric {
        COMBAT_POWER("combatPower", "combatPowerValue"),
        ITEM_LEVEL("itemLevel", "itemLevelValue");

        private final String apiName;
        private final String property;

        Metric(String apiName, String property) {
            this.apiName = apiName;
            this.property = property;
        }

        private static Metric from(String value) {
            return value != null && value.equalsIgnoreCase("itemLevel") ? ITEM_LEVEL : COMBAT_POWER;
        }
    }
}
