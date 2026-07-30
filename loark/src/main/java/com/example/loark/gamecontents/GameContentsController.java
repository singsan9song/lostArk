package com.example.loark.gamecontents;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import java.time.Duration;

@RestController
@RequestMapping("/api/gamecontents")
public class GameContentsController {
    private final GameContentsService service;

    public GameContentsController(GameContentsService service) {
        this.service = service;
    }

    @GetMapping("/calendar")
    public ResponseEntity<JsonNode> calendar() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(service.calendar());
    }
}
