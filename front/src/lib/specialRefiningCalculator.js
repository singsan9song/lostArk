import specialRefiningData from '../data/special-refining-probabilities.json'

const stageByNumber = new Map(specialRefiningData.stages.map((row) => [row.stage, row]))

export const SPECIAL_REFINING_GRADES = specialRefiningData.grades.map((item) => item.grade)

export function stoneNameForGrade(grade) {
  return specialRefiningData.grades.find((item) => item.grade === grade)?.stoneName || null
}

// Unlike normal honing, 특수 재련 has no escalating base probability or Artisan's Energy — each
// attempt is an independent fixed-probability trial that spends the same stone count on a fail as
// on a success, so the expected attempts at one stage is just the geometric-distribution mean
// (100 / probability%) and expected stones spent is that times the per-attempt cost.
export function specialRefiningSteps(equipmentType, currentStage, targetStage) {
  const steps = []
  for (let stage = currentStage + 1; stage <= targetStage; stage++) {
    const row = stageByNumber.get(stage)
    if (!row) continue
    const costPerAttempt = equipmentType === '무기' ? row.weaponCost : row.armorCost
    const expectedAttempts = 100 / row.probability
    steps.push({
      stage,
      probability: row.probability,
      costPerAttempt,
      expectedAttempts,
      expectedStoneUsage: expectedAttempts * costPerAttempt,
    })
  }
  return steps
}
