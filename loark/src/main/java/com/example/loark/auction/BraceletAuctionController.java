package com.example.loark.auction;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.constraints.Size;

import java.util.List;

@RestController
@RequestMapping("/api/auctions")
public class BraceletAuctionController {
    private final BraceletAuctionService service;
    private final AbilityStoneAuctionService abilityStoneService;
    private final AuctionItemSearchService itemSearchService;

    public BraceletAuctionController(BraceletAuctionService service, AbilityStoneAuctionService abilityStoneService,
                                     AuctionItemSearchService itemSearchService) {
        this.service = service;
        this.abilityStoneService = abilityStoneService;
        this.itemSearchService = itemSearchService;
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

    @GetMapping("/search")
    public List<AuctionItemSearchService.AuctionSearchItem> search(
            @RequestParam @Size(min = 2, max = 50) String name,
            @RequestParam(defaultValue = "false") boolean refresh) {
        return itemSearchService.searchExact(name, refresh);
    }
}
