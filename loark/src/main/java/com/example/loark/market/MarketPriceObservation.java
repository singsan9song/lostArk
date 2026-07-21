package com.example.loark.market;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "market_price_observations", indexes = {
        @Index(name = "idx_market_observation_item_time", columnList = "item_id,observed_at"),
        @Index(name = "idx_market_observation_name_time", columnList = "item_name,observed_at")
})
public class MarketPriceObservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "item_id", nullable = false)
    private long itemId;
    @Column(name = "item_name", length = 150, nullable = false)
    private String itemName;
    @Column(length = 20)
    private String grade;
    @Column(name = "current_min_price", nullable = false)
    private long currentMinPrice;
    @Column(name = "recent_price", nullable = false)
    private long recentPrice;
    @Column(name = "yesterday_average_price", nullable = false)
    private double yesterdayAveragePrice;
    @Column(name = "bundle_count", nullable = false)
    private int bundleCount;
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected MarketPriceObservation() {}
    public MarketPriceObservation(MarketPrice price) {
        this.itemId = price.id(); this.itemName = price.name(); this.grade = price.grade();
        this.currentMinPrice = price.currentMinPrice(); this.recentPrice = price.recentPrice();
        this.yesterdayAveragePrice = price.yDayAvgPrice(); this.bundleCount = price.bundleCount();
        this.observedAt = Instant.now();
    }
}
