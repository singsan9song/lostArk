package com.example.loark.auction;

import java.time.Instant;
import java.util.List;

public record AbilityStoneAuctionValue(
        String itemName,
        String grade,
        int tier,
        long selectedUnitPrice,
        String selectedConfigurationId,
        String selectedConfigurationName,
        String selectedPenalty,
        String supportConfigurationId,
        String supportConfigurationName,
        Instant sampledAt,
        List<ConfigurationPrice> configurations
) {
    public record ConfigurationPrice(
            String id,
            String name,
            List<String> engravings,
            String penalty,
            long currentMinPrice
    ) {}
}
