package com.example.loark.gamecontents;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/gamecontents")
public class GameContentsController {
    private final GameContentsService service;

    public GameContentsController(GameContentsService service) {
        this.service = service;
    }

    @GetMapping("/calendar")
    public JsonNode calendar() {
        return service.calendar();
    }
}
