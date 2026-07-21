package com.example.loark.auction;

import java.time.Instant;
import java.util.List;

public record BraceletAuctionSummary(
        String itemName,
        String grade,
        int tier,
        String icon,
        double expectedValue,
        int totalSamples,
        Instant sampledAt,
        List<OptionPairPrice> optionPairs
) {
    public record OptionPairPrice(
            String id,
            String name,
            double probability,
            double probabilityPercent,
            double trimmedMeanPrice,
            double expectedValue,
            int sampleCount,
            String pricingMode
    ) {}
}
