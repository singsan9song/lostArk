package com.example.loark.character;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rankings")
public class CharacterRankingController {
    private final CharacterRankingService service;

    public CharacterRankingController(CharacterRankingService service) {
        this.service = service;
    }

    @GetMapping("/characters")
    public CharacterRankingResponse characters(
            @RequestParam(defaultValue = "combatPower") String metric,
            @RequestParam(defaultValue = "") String server,
            @RequestParam(defaultValue = "") String role,
            @RequestParam(defaultValue = "") String className,
            @RequestParam(defaultValue = "") String engraving,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        return service.rankings(metric, server, role, className, engraving, page, size);
    }
}
