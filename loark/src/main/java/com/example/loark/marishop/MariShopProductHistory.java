package com.example.loark.marishop;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(name = "mari_shop_offers",
        uniqueConstraints = @UniqueConstraint(name = "uk_mari_version_item", columnNames = {"goods_version", "item_code"}),
        indexes = {
                @Index(name = "idx_mari_offer_item_code", columnList = "item_code"),
                @Index(name = "idx_mari_offer_product_name", columnList = "product_name"),
                @Index(name = "idx_mari_offer_observed_at", columnList = "observed_at")
        })
public class MariShopProductHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "goods_version", length = 30, nullable = false)
    private String goodsVersion;

    @Column(name = "item_code", length = 40, nullable = false)
    private String itemCode;

    @Column(name = "product_name", length = 150, nullable = false)
    private String productName;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "crystal_price", nullable = false)
    private int crystalPrice;

    @Column(name = "unit_crystal_price", nullable = false)
    private double unitCrystalPrice;

    @Column(length = 500)
    private String icon;

    @Column(length = 20)
    private String grade;

    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected MariShopProductHistory() {}

    public MariShopProductHistory(String goodsVersion, String itemCode, String productName, int quantity,
                                  int crystalPrice, String icon, String grade, Instant observedAt) {
        this.goodsVersion = goodsVersion;
        this.itemCode = itemCode;
        this.productName = productName;
        this.quantity = Math.max(1, quantity);
        this.crystalPrice = crystalPrice;
        this.unitCrystalPrice = crystalPrice / (double) this.quantity;
        this.icon = icon;
        this.grade = grade;
        this.observedAt = observedAt;
    }

    public String getGoodsVersion() { return goodsVersion; }
    public String getItemCode() { return itemCode; }
    public String getProductName() { return productName; }
    public int getQuantity() { return quantity; }
    public int getCrystalPrice() { return crystalPrice; }
    public double getUnitCrystalPrice() { return unitCrystalPrice; }
    public String getIcon() { return icon; }
    public String getGrade() { return grade; }
    public Instant getObservedAt() { return observedAt; }
}
