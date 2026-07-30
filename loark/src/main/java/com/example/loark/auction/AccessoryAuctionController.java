package com.example.loark.auction;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auctions/accessories")
public class AccessoryAuctionController {
    private final AccessoryAuctionSearchService service;

    public AccessoryAuctionController(AccessoryAuctionSearchService service) {
        this.service = service;
    }

    @PostMapping("/search")
    public AccessoryAuctionSearchService.SearchResponse search(
            @RequestBody AccessoryAuctionSearchService.SearchRequest request) {
        return service.search(request);
    }
}
