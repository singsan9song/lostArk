package com.example.loark.auction;

import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AccessoryAuctionListingRepository
        extends JpaRepository<AccessoryAuctionListing, Long> {
    Optional<AccessoryAuctionListing> findByListingKey(String listingKey);
    List<AccessoryAuctionListing> findByListingKeyIn(Collection<String> listingKeys);

    // Trade count ("ZERO") and refinement level are plain indexed int columns, so pushing
    // them into the SQL WHERE (instead of loading every non-expired part/grade row and
    // filtering in Java) keeps search fast as the table grows.
    List<AccessoryAuctionListing> findByPartAndGradeAndEndDateAfterAndTradeAllowCountAndUpgradeLevelIn(
            String part, String grade, Instant endDate, int tradeAllowCount, Collection<Integer> upgradeLevels);

    List<AccessoryAuctionListing> findByPartAndGradeAndEndDateAfterAndTradeAllowCountGreaterThanEqualAndUpgradeLevelIn(
            String part, String grade, Instant endDate, int tradeAllowCountMin, Collection<Integer> upgradeLevels);
}
