package com.example.loark.character;

import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.util.Map;

@Validated
@RestController
@RequestMapping("/api")
public class CharacterController {
    private final CharacterService service;

    public CharacterController(CharacterService service) { this.service = service; }

    @GetMapping("/health")
    public Map<String, Boolean> health() { return Map.of("ok", true); }

    @GetMapping("/characters/{characterName}")
    public CharacterResponse character(@PathVariable @Size(min = 1, max = 20) String characterName) {
        return service.find(characterName.trim());
    }

    // Lightweight endpoint for the honing pages (일반/상급/통합 재련), which only need the
    // 6 honable equipment slots. Skips the full armory+roster+discoveries+growth-history
    // bundle and the DB snapshot write that /characters/{name} does on every call.
    @GetMapping("/characters/{characterName}/equipment")
    public JsonNode equipment(@PathVariable @Size(min = 1, max = 20) String characterName) {
        return service.equipmentSnapshot(characterName.trim());
    }

    @PostMapping("/characters/{characterName}/refresh")
    public CharacterResponse refreshCharacter(@PathVariable @Size(min = 1, max = 20) String characterName) {
        return service.refreshCharacter(characterName.trim());
    }

    @PostMapping("/characters/{characterName}/roster/refresh")
    public CharacterResponse refreshRoster(@PathVariable @Size(min = 1, max = 20) String characterName) {
        return service.refreshRoster(characterName.trim());
    }
}
