package com.example.loark.marishop;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "mari_shop_rotations")
public class MariShopRotation {
    @Id
    @Column(name = "goods_version", length = 30, nullable = false)
    private String goodsVersion;
    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;
    @Column(name = "ends_at", nullable = false)
    private Instant endsAt;
    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    protected MariShopRotation() {}
    public MariShopRotation(String goodsVersion, Instant startsAt, Instant endsAt, Instant fetchedAt) {
        this.goodsVersion = goodsVersion; this.startsAt = startsAt; this.endsAt = endsAt; this.fetchedAt = fetchedAt;
    }
    public String getGoodsVersion() { return goodsVersion; }
    public Instant getStartsAt() { return startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public Instant getFetchedAt() { return fetchedAt; }
}
