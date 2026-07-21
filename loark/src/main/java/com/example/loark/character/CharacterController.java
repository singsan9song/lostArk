package com.example.loark.character;

import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
