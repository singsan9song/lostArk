package com.example.loark.auction;

import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface AccessoryAuctionListingRepository
        extends JpaRepository<AccessoryAuctionListing, Long> {
    Optional<AccessoryAuctionListing> findByListingKey(String listingKey);
    List<AccessoryAuctionListing> findByPartAndGradeAndEndDateAfter(
            String part, String grade, Instant endDate);
}
