package com.example.loark.character;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

@Service
public class CharacterRankingBackfillService {
    private final GameCharacterRepository characters;
    private final CharacterSnapshotRepository snapshots;
    private final CharacterRankingClassifier classifier;
    private final ObjectMapper objectMapper;
    private final int batchSize;

    public CharacterRankingBackfillService(
            GameCharacterRepository characters,
            CharacterSnapshotRepository snapshots,
            CharacterRankingClassifier classifier,
            ObjectMapper objectMapper,
            @Value("${app.character-ranking.backfill-batch-size:250}") int batchSize
    ) {
        this.characters = characters;
        this.snapshots = snapshots;
        this.classifier = classifier;
        this.objectMapper = objectMapper;
        this.batchSize = Math.max(1, batchSize);
    }

    @Scheduled(
            fixedDelayString = "${app.character-ranking.backfill-interval-ms:2000}",
            initialDelayString = "${app.character-ranking.backfill-initial-delay-ms:5000}"
    )
    @Transactional
    void backfill() {
        List<Long> ids = characters.findIdsNeedingRanking(PageRequest.of(0, batchSize));
        for (Long id : ids) {
            GameCharacter character = characters.findById(id).orElse(null);
            if (character == null) continue;

            CharacterSnapshot snapshot = snapshots
                    .findTopByCharacterNameIgnoreCaseOrderByFetchedAtDesc(character.getCharacterName())
                    .orElse(null);
            JsonNode armory = null;
            if (snapshot != null) {
                try {
                    armory = objectMapper.readTree(snapshot.getArmoryPayload());
                } catch (Exception ignored) {
                    // The numeric ranking can still be prepared from game_characters.
                }
            }
            CharacterRankingClassifier.Classification classification =
                    classifier.classify(armory, character.getClassName());
            character.updateRanking(
                    classification.engraving(),
                    classification.role(),
                    snapshot == null ? character.getLastObservedAt() : snapshot.getFetchedAt()
            );
            characters.save(character);
        }
    }
}
