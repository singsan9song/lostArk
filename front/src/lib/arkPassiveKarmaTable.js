// 카르마의 잔영 재련(아크 패시브 랭크/레벨) 누적 효과 수치표.
// 진화/깨달음/도약 3개 포인트 종류의 랭크(1~6)·레벨(1~30) 별 누적 보너스와
// 재련 확률/장기(장인의 기운)·소모 재료를 그대로 옮긴 것.
//
// 레벨은 전 랭크에 걸쳐 계속 누적되는 값이며(1~30), 랭크업은 레벨 1/5/9/13/17/21
// 지점에서 카르마의 잔영을 소모해 이뤄진다. 랭크 진입 시점의 누적 보너스는
// RANK_STEPS에, 그 랭크 안에서의 개별 레벨업 재련(성공확률/장기)과 레벨 기반
// 누적 보너스(최대생명력·무기공격력·초각성기 피해)는 LEVEL_STEPS에 있다.
//
// 진화의 랭크 보너스(%)는 직업에 따라 "진화형 피해" 또는 "낙인력" 중 하나로만
// 적용된다(딜러=진화형 피해, 서포터=낙인력) — 수치 자체는 동일.

export const KARMA_RANK_STEPS = [
  {
    rank: 1,
    atLevel: 1,
    karmaShadowCost: 20,
    probability: 100,
    evolutionPercent: 1,
    enlightenmentPoint: 1,
    leapPoint: 2,
    note: '고대 팔찌 + 전투 레벨 70Lv 기준, 도약 2티어 노드 2Lv 달성 가능',
  },
  {
    rank: 2,
    atLevel: 5,
    karmaShadowCost: 30,
    probability: 100,
    evolutionPercent: 2,
    enlightenmentPoint: 2,
    leapPoint: 4,
    note: '고대 Full 악세 기준, 깨달음 사이드 노드 3Lv 달성 가능',
  },
  {
    rank: 3,
    atLevel: 9,
    karmaShadowCost: 30,
    probability: 100,
    evolutionPercent: 3,
    enlightenmentPoint: 3,
    leapPoint: 6,
    note: '',
  },
  {
    rank: 4,
    atLevel: 13,
    karmaShadowCost: 30,
    probability: 100,
    evolutionPercent: 4,
    enlightenmentPoint: 4,
    leapPoint: 8,
    note: '고대 Full 악세 기준, 깨달음 4티어 노드 3Lv 달성 가능',
  },
  {
    rank: 5,
    atLevel: 17,
    karmaShadowCost: 30,
    probability: 100,
    evolutionPercent: 5,
    enlightenmentPoint: 5,
    leapPoint: 10,
    note: '',
  },
  {
    rank: 6,
    atLevel: 21,
    karmaShadowCost: 30,
    probability: 100,
    evolutionPercent: 6,
    enlightenmentPoint: 6,
    leapPoint: 12,
    note: '고대 Full 악세 기준, 깨달음 4티어 노드 3Lv + 사이드 1Lv 달성 가능, 도약 2티어 노드 3Lv 달성 가능',
  },
]

// 레벨 효과는 카르마 개방으로 획득하는 1레벨부터 즉시 적용되는 누적값이다.
// 이후 각 행은 해당 레벨에 도달했을 때의 누적 효과를 나타낸다.
export const KARMA_LEVEL_STEPS = [
  { level: 1, probability: 100.0, artisanEnergy: 0, maxHp: 400, weaponAttackPercent: 0.1, hyperAwakeningDamagePercent: 0.5 },
  { level: 2, probability: 20.0, artisanEnergy: 10.0, maxHp: 800, weaponAttackPercent: 0.2, hyperAwakeningDamagePercent: 1.0 },
  { level: 3, probability: 15.0, artisanEnergy: 7.5, maxHp: 1200, weaponAttackPercent: 0.3, hyperAwakeningDamagePercent: 1.5 },
  { level: 4, probability: 10.0, artisanEnergy: 5.0, maxHp: 1600, weaponAttackPercent: 0.4, hyperAwakeningDamagePercent: 2.0 },
  { level: 5, probability: 7.0, artisanEnergy: 3.5, maxHp: 2000, weaponAttackPercent: 0.5, hyperAwakeningDamagePercent: 2.5 },
  { level: 6, probability: 20.0, artisanEnergy: 10.0, maxHp: 2400, weaponAttackPercent: 0.6, hyperAwakeningDamagePercent: 3.0 },
  { level: 7, probability: 15.0, artisanEnergy: 7.5, maxHp: 2800, weaponAttackPercent: 0.7, hyperAwakeningDamagePercent: 3.5 },
  { level: 8, probability: 10.0, artisanEnergy: 5.0, maxHp: 3200, weaponAttackPercent: 0.8, hyperAwakeningDamagePercent: 4.0 },
  { level: 9, probability: 7.0, artisanEnergy: 3.5, maxHp: 3600, weaponAttackPercent: 0.9, hyperAwakeningDamagePercent: 4.5 },
  { level: 10, probability: 20.0, artisanEnergy: 10.0, maxHp: 4000, weaponAttackPercent: 1.0, hyperAwakeningDamagePercent: 5.0 },
  { level: 11, probability: 15.0, artisanEnergy: 7.5, maxHp: 4400, weaponAttackPercent: 1.1, hyperAwakeningDamagePercent: 5.5 },
  { level: 12, probability: 10.0, artisanEnergy: 5.0, maxHp: 4800, weaponAttackPercent: 1.2, hyperAwakeningDamagePercent: 6.0 },
  { level: 13, probability: 7.0, artisanEnergy: 3.5, maxHp: 5200, weaponAttackPercent: 1.3, hyperAwakeningDamagePercent: 6.5 },
  { level: 14, probability: 20.0, artisanEnergy: 10.0, maxHp: 5600, weaponAttackPercent: 1.4, hyperAwakeningDamagePercent: 7.0 },
  { level: 15, probability: 15.0, artisanEnergy: 7.5, maxHp: 6000, weaponAttackPercent: 1.5, hyperAwakeningDamagePercent: 7.5 },
  { level: 16, probability: 10.0, artisanEnergy: 5.0, maxHp: 6400, weaponAttackPercent: 1.6, hyperAwakeningDamagePercent: 8.0 },
  { level: 17, probability: 7.0, artisanEnergy: 3.5, maxHp: 6800, weaponAttackPercent: 1.7, hyperAwakeningDamagePercent: 8.5 },
  { level: 18, probability: 20.0, artisanEnergy: 10.0, maxHp: 7200, weaponAttackPercent: 1.8, hyperAwakeningDamagePercent: 9.0 },
  { level: 19, probability: 15.0, artisanEnergy: 7.5, maxHp: 7600, weaponAttackPercent: 1.9, hyperAwakeningDamagePercent: 9.5 },
  { level: 20, probability: 10.0, artisanEnergy: 5.0, maxHp: 8000, weaponAttackPercent: 2.0, hyperAwakeningDamagePercent: 10.0 },
  { level: 21, probability: 7.0, artisanEnergy: 3.5, maxHp: 8400, weaponAttackPercent: 2.1, hyperAwakeningDamagePercent: 10.5 },
  { level: 22, probability: 20.0, artisanEnergy: 10.0, maxHp: 8800, weaponAttackPercent: 2.2, hyperAwakeningDamagePercent: 11.0 },
  { level: 23, probability: 15.0, artisanEnergy: 7.5, maxHp: 9200, weaponAttackPercent: 2.3, hyperAwakeningDamagePercent: 11.5 },
  { level: 24, probability: 10.0, artisanEnergy: 5.0, maxHp: 9600, weaponAttackPercent: 2.4, hyperAwakeningDamagePercent: 12.0 },
  { level: 25, probability: 7.0, artisanEnergy: 3.5, maxHp: 10000, weaponAttackPercent: 2.5, hyperAwakeningDamagePercent: 12.5 },
  { level: 26, probability: 4.0, artisanEnergy: 1.8, maxHp: 10400, weaponAttackPercent: 2.6, hyperAwakeningDamagePercent: 13.0 },
  { level: 27, probability: 2.0, artisanEnergy: 0.9, maxHp: 10800, weaponAttackPercent: 2.7, hyperAwakeningDamagePercent: 13.5 },
  { level: 28, probability: 1.0, artisanEnergy: 0.4, maxHp: 11200, weaponAttackPercent: 2.8, hyperAwakeningDamagePercent: 14.0 },
  { level: 29, probability: 0.5, artisanEnergy: 0.2, maxHp: 11600, weaponAttackPercent: 2.9, hyperAwakeningDamagePercent: 14.5 },
  { level: 30, probability: 0.2, artisanEnergy: 0.1, maxHp: 12000, weaponAttackPercent: 3.0, hyperAwakeningDamagePercent: 15.0 },
]

function rankStepForRank(rank) {
  return KARMA_RANK_STEPS[Math.min(Math.max(rank, 1), KARMA_RANK_STEPS.length) - 1]
}

// Level-based bonuses (최대생명력/무기공격력%/초각성기 피해%) are globally
// cumulative regardless of rank, including the level-1 bonus granted on open.
function levelStepForLevel(level) {
  return KARMA_LEVEL_STEPS.find((step) => step.level === level)
}

// Returns the cumulative 진화/깨달음/도약 bonuses at a given (rank, level),
// e.g. karmaBonusAt(6, 21) for "6랭크 21레벨" from ArkPassive.Points[i].Description.
export function karmaBonusAt(rank, level) {
  const rankStep = rankStepForRank(rank)
  const levelStep = levelStepForLevel(level)
  return {
    rank: rankStep.rank,
    level,
    evolutionPercent: rankStep.evolutionPercent,
    maxHp: levelStep?.maxHp || 0,
    enlightenmentPoint: rankStep.enlightenmentPoint,
    weaponAttackPercent: levelStep?.weaponAttackPercent || 0,
    leapPoint: rankStep.leapPoint,
    hyperAwakeningDamagePercent: levelStep?.hyperAwakeningDamagePercent || 0,
  }
}

// Parses the "N랭크 M레벨" text ArmoryPoint.Description already comes as.
export function parseKarmaDescription(description) {
  const match = String(description || '').match(/(\d+)\s*랭크\s*(\d+)\s*레벨/)
  if (!match) return null
  return karmaBonusAt(Number(match[1]), Number(match[2]))
}
