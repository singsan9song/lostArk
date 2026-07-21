package com.example.loark.character;

import tools.jackson.databind.JsonNode;
import java.time.Instant;

public record CharacterResponse(JsonNode armory, JsonNode siblings, boolean cached, Instant fetchedAt,
                                CharacterDiscoveries discoveries) {
    CharacterResponse cachedCopy() { return new CharacterResponse(armory, siblings, true, fetchedAt, discoveries); }
}
