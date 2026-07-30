package com.example.loark.auction;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "accessory_auction_listings", indexes = {
        @Index(name = "idx_accessory_listing_search", columnList = "part,grade,end_date"),
        @Index(name = "idx_accessory_listing_observed", columnList = "observed_at")
}, uniqueConstraints = {
        @UniqueConstraint(name = "uk_accessory_listing_key", columnNames = "listing_key")
})
public class AccessoryAuctionListing {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "listing_key", length = 220, nullable = false)
    private String listingKey;
    @Column(length = 20, nullable = false)
    private String part;
    @Column(name = "item_name", length = 120, nullable = false)
    private String itemName;
    @Column(length = 20, nullable = false)
    private String grade;
    @Column(length = 500, nullable = false)
    private String icon;
    @Column(nullable = false)
    private int quality;
    @Column(name = "buy_price", nullable = false)
    private long buyPrice;
    @Column(name = "trade_allow_count", nullable = false)
    private int tradeAllowCount;
    @Column(name = "upgrade_level", nullable = false)
    private int upgradeLevel;
    @Column(name = "main_stat_value", nullable = false)
    private double mainStatValue;
    @Lob
    @Column(name = "options_json", columnDefinition = "LONGTEXT", nullable = false)
    private String optionsJson;
    @Column(name = "end_date", nullable = false)
    private Instant endDate;
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected AccessoryAuctionListing() {}

    public AccessoryAuctionListing(String listingKey, String part, String itemName, String grade,
                                   String icon, int quality, long buyPrice, int tradeAllowCount,
                                   int upgradeLevel, double mainStatValue, String optionsJson,
                                   Instant endDate, Instant observedAt) {
        this.listingKey = listingKey;
        update(part, itemName, grade, icon, quality, buyPrice, tradeAllowCount, upgradeLevel,
                mainStatValue, optionsJson, endDate, observedAt);
    }

    public void update(String part, String itemName, String grade, String icon, int quality,
                       long buyPrice, int tradeAllowCount, int upgradeLevel, double mainStatValue,
                       String optionsJson, Instant endDate, Instant observedAt) {
        this.part = part;
        this.itemName = itemName;
        this.grade = grade;
        this.icon = icon;
        this.quality = quality;
        this.buyPrice = buyPrice;
        this.tradeAllowCount = tradeAllowCount;
        this.upgradeLevel = upgradeLevel;
        this.mainStatValue = mainStatValue;
        this.optionsJson = optionsJson;
        this.endDate = endDate;
        this.observedAt = observedAt;
    }

    public String getListingKey() { return listingKey; }
    public String getPart() { return part; }
    public String getItemName() { return itemName; }
    public String getGrade() { return grade; }
    public String getIcon() { return icon; }
    public int getQuality() { return quality; }
    public long getBuyPrice() { return buyPrice; }
    public int getTradeAllowCount() { return tradeAllowCount; }
    public int getUpgradeLevel() { return upgradeLevel; }
    public double getMainStatValue() { return mainStatValue; }
    public String getOptionsJson() { return optionsJson; }
    public Instant getEndDate() { return endDate; }
    public Instant getObservedAt() { return observedAt; }
}
