package com.example.loark.market;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/markets")
public class MarketController {
    private final MarketService service;

    public MarketController(MarketService service) {
        this.service = service;
    }

    @PostMapping("/prices")
    public Map<String, MarketPrice> prices(@Valid @RequestBody PriceRequest request) {
        return service.prices(request.names());
    }

    public record PriceRequest(@NotEmpty @Size(max = 30) List<@Size(min = 1, max = 50) String> names) {}
}
