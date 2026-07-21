package com.example.loark.marishop;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MariShopProductHistoryRepository extends JpaRepository<MariShopProductHistory, Long> {
    boolean existsByGoodsVersionAndItemCode(String goodsVersion, String itemCode);
    List<MariShopProductHistory> findByItemCodeOrderByObservedAtDesc(String itemCode);
    List<MariShopProductHistory> findByGoodsVersionOrderByIdAsc(String goodsVersion);

    @Query("select history.goodsVersion from MariShopProductHistory history group by history.goodsVersion order by max(history.observedAt) desc")
    List<String> findRecentGoodsVersions(Pageable pageable);

    @Query("select min(history.unitCrystalPrice) from MariShopProductHistory history where history.productName = :productName")
    Double findLowestUnitCrystalPrice(@Param("productName") String productName);

    @Query("select history.productName, min(history.unitCrystalPrice) from MariShopProductHistory history group by history.productName")
    List<Object[]> findAllLowestUnitCrystalPrices();
}
