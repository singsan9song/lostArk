package com.example.loark.character;

import java.time.Instant;

public record CharacterGrowthRecord(String itemLevel, String combatPower, Instant fetchedAt) {}
