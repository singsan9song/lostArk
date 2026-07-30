package com.example.loark.character;

import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

public record CharacterResponse(JsonNode armory, JsonNode siblings, boolean cached, Instant fetchedAt,
                                CharacterDiscoveries discoveries,
                                List<CharacterGrowthRecord> growthHistory) {
    CharacterResponse cachedCopy() {
        return new CharacterResponse(armory, siblings, true, fetchedAt, discoveries, growthHistory);
    }
}
