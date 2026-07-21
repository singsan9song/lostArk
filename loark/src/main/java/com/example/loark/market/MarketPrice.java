package com.example.loark.market;

public record MarketPrice(
        long id,
        String name,
        String grade,
        String icon,
        long currentMinPrice,
        long recentPrice,
        double yDayAvgPrice,
        int bundleCount
) {}
