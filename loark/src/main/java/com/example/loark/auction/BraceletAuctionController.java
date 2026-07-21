package com.example.loark.auction;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auctions")
public class BraceletAuctionController {
    private final BraceletAuctionService service;
    private final AbilityStoneAuctionService abilityStoneService;

    public BraceletAuctionController(BraceletAuctionService service, AbilityStoneAuctionService abilityStoneService) {
        this.service = service;
        this.abilityStoneService = abilityStoneService;
    }

    @GetMapping("/bracelets/value")
    public BraceletAuctionSummary braceletValue() {
        return service.getValue();
    }

    @GetMapping("/bracelets/relic/value")
    public BraceletAuctionSummary relicBraceletValue() {
        return service.getRelicValue();
    }

    @GetMapping("/ability-stones/value")
    public AbilityStoneAuctionValue abilityStoneValue() {
        return abilityStoneService.getValue();
    }
}
