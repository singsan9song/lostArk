package com.example.loark.marishop;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/mari-shop")
public class MariShopController {
    private final MariShopService service;

    public MariShopController(MariShopService service) {
        this.service = service;
    }

    @GetMapping
    public JsonNode current() {
        return service.current();
    }

    @GetMapping("/history/{itemCode}")
    public JsonNode history(@PathVariable String itemCode) {
        return service.history(itemCode);
    }
}
