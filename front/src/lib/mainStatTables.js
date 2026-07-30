// 주 스탯(힘/민첩/지능) 총합에 들어가는 "장비 기본 효과"(mainStatBreakdown) 외의
// 나머지 두 출처. 카드 도감 효과(변수 A)는 도감 조합이 사실상 무한이라
// 데이터화할 수 없어 사용자 입력(원정대+도감 합산값)으로 나중에 받을 예정이고,
// 여기 두 개는 규칙이 고정돼 있어 그대로 데이터/공식으로 옮길 수 있다.

// 물약/원정대 레벨 효과 (변수 B): 원정대 레벨 1부터 400까지, 홀수 레벨마다
// 힘/민첩/지능이 각 +5, 짝수 레벨마다 체력이 +5 — 이 패턴이 400까지 무한 반복.
// 400줄을 직접 나열하는 대신 규칙대로 생성하되, 실제 조회는 생성된 테이블
// (EXPEDITION_MAIN_STAT_TABLE/EXPEDITION_HP_TABLE)을 인덱스로 찾는 것뿐이다.
export const EXPEDITION_LEVEL_MAX = 400
const EXPEDITION_STAT_PER_STEP = 5

export const EXPEDITION_MAIN_STAT_TABLE = [0]
export const EXPEDITION_HP_TABLE = [0]
for (let level = 1; level <= EXPEDITION_LEVEL_MAX; level += 1) {
  const isOdd = level % 2 === 1
  EXPEDITION_MAIN_STAT_TABLE[level] =
    EXPEDITION_MAIN_STAT_TABLE[level - 1] + (isOdd ? EXPEDITION_STAT_PER_STEP : 0)
  EXPEDITION_HP_TABLE[level] = EXPEDITION_HP_TABLE[level - 1] + (isOdd ? 0 : EXPEDITION_STAT_PER_STEP)
}

export function expeditionMainStatBonus(expeditionLevel) {
  const level = Math.max(0, Math.min(Number(expeditionLevel) || 0, EXPEDITION_LEVEL_MAX))
  return EXPEDITION_MAIN_STAT_TABLE[level]
}

export function expeditionHpBonus(expeditionLevel) {
  const level = Math.max(0, Math.min(Number(expeditionLevel) || 0, EXPEDITION_LEVEL_MAX))
  return EXPEDITION_HP_TABLE[level]
}

// 레벨에 따른 기본 주 스탯 (변수 C). 10~50은 레벨별로, 이후 70까지는 건너뛰고
// 제공된 값만 있음 — 51~69 구간은 자료가 없어 표에서 비워둔다.
export const LEVEL_MAIN_STAT_TABLE = {
  10: 54, 11: 58, 12: 62, 13: 66, 14: 70, 15: 75, 16: 80, 17: 85, 18: 90, 19: 96,
  20: 102, 21: 108, 22: 115, 23: 122, 24: 129, 25: 136, 26: 144, 27: 152, 28: 160, 29: 168,
  30: 177, 31: 186, 32: 195, 33: 205, 34: 215, 35: 225, 36: 235, 37: 246, 38: 257, 39: 268,
  40: 279, 41: 291, 42: 303, 43: 315, 44: 328, 45: 341, 46: 354, 47: 367, 48: 381, 49: 395,
  50: 409,
  70: 477,
}

export function levelMainStatBonus(characterLevel) {
  return LEVEL_MAIN_STAT_TABLE[Number(characterLevel)] ?? null
}
