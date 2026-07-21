package com.example.loark.auction;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "ability_stone_price_observations",
        indexes = @Index(name = "idx_ability_stone_config_time", columnList = "configuration_id,observed_at"))
public class AbilityStonePriceObservation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "configuration_id", length = 80, nullable = false)
    private String configurationId;
    @Column(name = "configuration_name", length = 120, nullable = false)
    private String configurationName;
    @Column(length = 80, nullable = false)
    private String penalty;
    @Column(name = "current_min_price", nullable = false)
    private long currentMinPrice;
    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "ability_stone_observation_engravings", joinColumns = @JoinColumn(name = "observation_id"))
    @Column(name = "engraving_name", length = 80, nullable = false)
    private Set<String> engravings = new LinkedHashSet<>();

    protected AbilityStonePriceObservation() {}
    public AbilityStonePriceObservation(AbilityStoneAuctionValue.ConfigurationPrice price, Instant observedAt) {
        this.configurationId = price.id(); this.configurationName = price.name(); this.penalty = price.penalty();
        this.currentMinPrice = price.currentMinPrice(); this.observedAt = observedAt;
        this.engravings.addAll(price.engravings());
    }
}
