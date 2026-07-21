package com.example.loark.auction;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "bracelet_price_observations", indexes = {
        @Index(name = "idx_bracelet_item_time", columnList = "item_name,observed_at"),
        @Index(name = "idx_bracelet_pair_time", columnList = "option_pair_id,observed_at")
})
public class BraceletPriceObservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "item_name", length = 120, nullable = false)
    private String itemName;
    @Column(length = 20, nullable = false)
    private String grade;
    @Column(name = "option_pair_id", length = 80, nullable = false)
    private String optionPairId;
    @Column(name = "option_pair_name", length = 120, nullable = false)
    private String optionPairName;
    @Column(nullable = false)
    private double probability;
    @Column(name = "trimmed_mean_price", nullable = false)
    private double trimmedMeanPrice;
    @Column(name = "expected_value", nullable = false)
    private double expectedValue;
    @Column(name = "sample_count", nullable = false)
    private int sampleCount;
    @Column(name = "pricing_mode", length = 50, nullable = false)
    private String pricingMode;
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected BraceletPriceObservation() {}
    public BraceletPriceObservation(String itemName, String grade, BraceletAuctionSummary.OptionPairPrice price, Instant observedAt) {
        this.itemName = itemName; this.grade = grade; this.optionPairId = price.id(); this.optionPairName = price.name();
        this.probability = price.probability(); this.trimmedMeanPrice = price.trimmedMeanPrice();
        this.expectedValue = price.expectedValue(); this.sampleCount = price.sampleCount();
        this.pricingMode = price.pricingMode(); this.observedAt = observedAt;
    }
}
