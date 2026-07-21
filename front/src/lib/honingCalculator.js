import refiningData from '../data/icepang_refining_data.json'

const recordIndex = new Map()
const stageIndex = new Map()

const recordKey = (equipmentType, grade, stage, strongholdResearch, growthSupport) =>
  `${equipmentType}|${grade}|${stage}|${strongholdResearch}|${growthSupport}`
const stageKey = (equipmentType, grade) => `${equipmentType}|${grade}`
const stageNumber = (value) => Number(String(value).replace('단계', ''))

refiningData.records.forEach((record) => {
  const stage = stageNumber(record.target_stage)
  recordIndex.set(
    recordKey(
      record.equipment_type,
      record.equipment_grade,
      stage,
      record.support_state.stronghold_research,
      record.support_state.growth_support,
    ),
    record,
  )
  const key = stageKey(record.equipment_type, record.equipment_grade)
  if (!stageIndex.has(key)) stageIndex.set(key, new Set())
  stageIndex.get(key).add(stage)
})

export const GRADE_OPTIONS = [
  ...new Set(refiningData.records.map((record) => record.equipment_grade)),
]

export function stagesForGrade(equipmentType, grade) {
  const stages = stageIndex.get(stageKey(equipmentType, grade))
  return stages ? [...stages].sort((a, b) => a - b) : []
}

export function findRecord(equipmentType, grade, stage, supportState) {
  return recordIndex.get(
    recordKey(
      equipmentType,
      grade,
      stage,
      Boolean(supportState?.strongholdResearch),
      Boolean(supportState?.growthSupport),
    ),
  )
}

// Per the guide: each attempt, floor(finalProbability / 2.15, 3 decimals) accumulates as
// Artisan's Energy; at 100% accumulated energy the next attempt is guaranteed to succeed.
export function energyIncrement(totalProbabilityPercent) {
  return Math.floor((totalProbabilityPercent / 2.15) * 1000) / 1000
}

export function simulateTransition(record) {
  const probability = record.probability.total
  const increment = energyIncrement(probability)
  const pityAttempt = Math.ceil(100 / increment)

  const attemptRows = []
  let reachProbability = 1
  let expectedAttempts = 0
  const materialTotals = new Map(record.required_materials.map((item) => [item.name, 0]))

  for (let attempt = 1; attempt <= pityAttempt; attempt++) {
    const guaranteed = attempt === pityAttempt
    const successChance = guaranteed ? 100 : probability
    const energyBefore = Math.min(100, (attempt - 1) * increment)
    attemptRows.push({
      attempt,
      reachProbability,
      probability: successChance,
      energyBefore,
      guaranteed,
    })
    expectedAttempts += reachProbability
    record.required_materials.forEach((item) => {
      materialTotals.set(item.name, materialTotals.get(item.name) + reachProbability * item.count)
    })
    reachProbability *= 1 - successChance / 100
  }

  return {
    expectedAttempts,
    materials: [...materialTotals.entries()].map(([name, expectedCount]) => ({
      name,
      expectedCount,
    })),
    attemptRows,
  }
}

export function simulateRange({ equipmentType, grade, currentStage, targetStage, supportState }) {
  const steps = []
  const materialTotals = new Map()
  let expectedAttempts = 0
  const missingStages = []

  for (let stage = currentStage + 1; stage <= targetStage; stage++) {
    const record = findRecord(equipmentType, grade, stage, supportState)
    if (!record) {
      missingStages.push(stage)
      continue
    }
    const result = simulateTransition(record)
    steps.push({ fromStage: stage - 1, toStage: stage, ...result })
    expectedAttempts += result.expectedAttempts
    result.materials.forEach(({ name, expectedCount }) => {
      materialTotals.set(name, (materialTotals.get(name) || 0) + expectedCount)
    })
  }

  return {
    expectedAttempts,
    materials: [...materialTotals.entries()].map(([name, expectedCount]) => ({
      name,
      expectedCount,
    })),
    steps,
    missingStages,
  }
}
