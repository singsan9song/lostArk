package com.example.loark.marishop;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MariShopRotationRepository extends JpaRepository<MariShopRotation, String> {
    Optional<MariShopRotation> findTopByOrderByFetchedAtDesc();
}
