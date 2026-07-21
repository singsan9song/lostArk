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

// The full universe of material names (required + catalyst) across the whole dataset, so the
// page can fetch every price it might ever need once up front, before the optimizer (which
// needs prices to make its decisions, not just to display a total) runs.
export const ALL_MATERIAL_NAMES = [
  ...new Set(
    refiningData.records.flatMap((record) => [
      ...record.required_materials.map((item) => item.name),
      ...record.additional_materials.map((item) => item.name),
    ]),
  ),
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

// Base success probability also escalates on its own with each failed attempt at the same
// stage (independent of Artisan's Energy): +1/10 of the attempt-1 probability per fail,
// capped at double the attempt-1 probability from attempt 11 onward.
export function rawBaseProbability(attemptOneProbability, attempt) {
  const escalated = attemptOneProbability + (attempt - 1) * (attemptOneProbability / 10)
  return Math.min(attemptOneProbability * 2, escalated)
}

// Coarse enough for memoization to actually collapse the search (see note in
// optimizeTransition), fine enough that it doesn't visibly shift where the 100% guarantee
// lands for typical increment sizes (a few % per attempt).
const roundEnergy = (value) => Math.round(value * 4) / 4
const NO_CATALYST = { bonus: 0, cost: 0, usage: [] }
const MAX_FRONTIER_POINTS = 14

// The cheapest way to reach any target probability bump is always to spend the
// cost-per-%-point-cheapest catalyst up to its max_count first, then the next, since bonuses
// are purely additive with no diminishing returns within one attempt. So the candidate choices
// are the cumulative prefix sums along that sorted order; downsampled to a bounded number of
// evenly-spaced points so the per-attempt branching factor stays small regardless of how large
// individual max_counts get (some records allow 80+ single-item steps).
function buildCatalystFrontier(record, getUnitPrice) {
  const priced = record.additional_materials
    .map((material) => {
      const costPerItem = getUnitPrice?.(material.name)
      if (!(costPerItem > 0)) return null
      return {
        name: material.name,
        bonusPerItem: material.probability_bonus_per_item,
        maxCount: material.max_count,
        costPerItem,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.costPerItem / a.bonusPerItem - b.costPerItem / b.bonusPerItem)

  const fullFrontier = [NO_CATALYST]
  let bonus = 0
  let cost = 0
  const usageCounts = []
  priced.forEach((material) => {
    usageCounts.push({ name: material.name, count: 0 })
    for (let i = 0; i < material.maxCount; i++) {
      bonus += material.bonusPerItem
      cost += material.costPerItem
      usageCounts[usageCounts.length - 1].count += 1
      fullFrontier.push({
        bonus,
        cost,
        usage: usageCounts.filter((item) => item.count > 0).map((item) => ({ ...item })),
      })
    }
  })

  let frontier = fullFrontier
  if (fullFrontier.length > MAX_FRONTIER_POINTS) {
    const step = (fullFrontier.length - 1) / (MAX_FRONTIER_POINTS - 1)
    const indices = new Set(
      Array.from({ length: MAX_FRONTIER_POINTS }, (_, i) => Math.round(i * step)),
    )
    frontier = [...indices].sort((a, b) => a - b).map((index) => fullFrontier[index])
  }

  const excludedCatalysts = record.additional_materials
    .filter((material) => !(getUnitPrice?.(material.name) > 0))
    .map((material) => material.name)
  return { frontier, excludedCatalysts }
}

// Backward-induction optimizer: at each (attempt, accumulated energy) state, choose the
// catalyst spend minimizing expected remaining cost (required materials + catalyst — a
// probability boost is only worth its catalyst cost if it saves enough *future* attempts'
// worth of required-material spend, so both have to be in the same recursive value). The
// fail-path never branches (there's exactly one way to fail, so the resulting energy is a
// single deterministic value), so a plain memoized recursion is exact, not an approximation.
export function optimizeTransition(record, getUnitPrice) {
  const attemptOneProbability = record.probability.total
  const { frontier, excludedCatalysts } = buildCatalystFrontier(record, getUnitPrice)
  const memo = new Map()

  const requiredMaterialUnitCost = record.required_materials.reduce((sum, item) => {
    const price = getUnitPrice?.(item.name)
    return price > 0 ? sum + item.count * price : sum
  }, 0)
  const hasUnpricedRequiredMaterial = record.required_materials.some(
    (item) => !(getUnitPrice?.(item.name) > 0),
  )

  function solve(attempt, energy) {
    if (energy >= 100) return { expectedCost: requiredMaterialUnitCost, choice: NO_CATALYST }
    const key = `${attempt}|${roundEnergy(energy)}`
    const cached = memo.get(key)
    if (cached) return cached

    const base = rawBaseProbability(attemptOneProbability, attempt)
    let best = null
    frontier.forEach((option) => {
      const finalProbability = Math.min(100, base + option.bonus)
      const failChance = 1 - finalProbability / 100
      const newEnergy = Math.min(100, energy + energyIncrement(finalProbability))
      const future = failChance > 0 ? solve(attempt + 1, newEnergy).expectedCost : 0
      const expectedCost = requiredMaterialUnitCost + option.cost + failChance * future
      if (!best || expectedCost < best.expectedCost) best = { expectedCost, choice: option }
    })
    memo.set(key, best)
    return best
  }
  solve(1, 0)

  const attemptRows = []
  const materialTotals = new Map(record.required_materials.map((item) => [item.name, 0]))
  const catalystTotals = new Map()
  let energy = 0
  let reachProbability = 1
  let expectedAttempts = 0
  let expectedCatalystCost = 0
  let attempt = 1
  for (; attempt <= 1000; attempt++) {
    const guaranteed = energy >= 100
    const base = rawBaseProbability(attemptOneProbability, attempt)
    const choice = guaranteed ? NO_CATALYST : solve(attempt, energy).choice
    const finalProbability = guaranteed ? 100 : Math.min(100, base + choice.bonus)
    const attemptCost = choice.cost + requiredMaterialUnitCost

    attemptRows.push({
      attempt,
      rawBase: base,
      catalystUsage: choice.usage,
      finalProbability,
      energyBefore: energy,
      reachProbability,
      guaranteed,
      attemptCost,
    })
    expectedAttempts += reachProbability
    expectedCatalystCost += reachProbability * choice.cost
    record.required_materials.forEach((item) => {
      materialTotals.set(item.name, materialTotals.get(item.name) + reachProbability * item.count)
    })
    choice.usage.forEach((item) => {
      catalystTotals.set(
        item.name,
        (catalystTotals.get(item.name) || 0) + reachProbability * item.count,
      )
    })

    if (guaranteed) break
    reachProbability *= 1 - finalProbability / 100
    energy = Math.min(100, energy + energyIncrement(finalProbability))
  }

  const expectedCost = requiredMaterialUnitCost * expectedAttempts + expectedCatalystCost

  return {
    expectedAttempts,
    expectedCost,
    worstCaseAttempts: attemptRows.length,
    worstCaseCost: attemptRows.reduce((sum, row) => sum + row.attemptCost, 0),
    hasUnpricedRequiredMaterial,
    excludedCatalysts,
    materials: [
      ...[...materialTotals.entries()].map(([name, expectedCount]) => ({ name, expectedCount })),
      ...[...catalystTotals.entries()].map(([name, expectedCount]) => ({ name, expectedCount })),
    ],
    attemptRows,
  }
}

function catalystCategory(name) {
  if (name.startsWith('태양의')) return '태양'
  if (name.includes('야금술')) return '야금술'
  if (name.includes('재봉술')) return '재봉술'
  if (name.includes('숨결')) return '숨결'
  return name
}

// Simulates always spending the full max_count of a fixed set of catalysts on every attempt
// (except the one where energy has already guaranteed success, which needs none) — this is a
// *policy*, not a search, used only to build comparison rows against the true optimizer.
function simulateFixedPolicy(record, materials, requiredMaterialUnitCost) {
  const attemptOneProbability = record.probability.total
  const bonus = materials.reduce((sum, m) => sum + m.bonusPerItem * m.maxCount, 0)
  const cost = materials.reduce((sum, m) => sum + m.costPerItem * m.maxCount, 0)
  const usage = materials.map((m) => ({ name: m.name, count: m.maxCount }))

  let energy = 0
  let reachProbability = 1
  let expectedAttempts = 0
  let expectedCatalystCost = 0
  const catalystTotals = new Map()
  let attempt = 1
  for (; attempt <= 1000; attempt++) {
    const guaranteed = energy >= 100
    const base = rawBaseProbability(attemptOneProbability, attempt)
    const finalProbability = guaranteed ? 100 : Math.min(100, base + bonus)
    const usedThisAttempt = guaranteed ? [] : usage

    expectedAttempts += reachProbability
    expectedCatalystCost += reachProbability * (guaranteed ? 0 : cost)
    usedThisAttempt.forEach((item) => {
      catalystTotals.set(
        item.name,
        (catalystTotals.get(item.name) || 0) + reachProbability * item.count,
      )
    })

    if (guaranteed) break
    reachProbability *= 1 - finalProbability / 100
    energy = Math.min(100, energy + energyIncrement(finalProbability))
  }

  return {
    expectedAttempts,
    expectedCost: requiredMaterialUnitCost * expectedAttempts + expectedCatalystCost,
    catalystTotals,
  }
}

function nonEmptySubsets(items) {
  const subsets = []
  const total = 1 << items.length
  for (let mask = 1; mask < total; mask++) {
    subsets.push(items.filter((_, index) => mask & (1 << index)))
  }
  return subsets
}

// Builds the "전략 비교" table: the true (per-attempt-adaptive) optimum alongside a few
// simple fixed policies — no catalyst at all, and "always use the full max of category X"
// for every category and combination of categories actually available on this record — so
// the user can see how much the adaptive optimizer is really saving versus simple habits
// like "always max everything."
export function compareStrategies(record, getUnitPrice) {
  const optimal = optimizeTransition(record, getUnitPrice)
  const requiredMaterialUnitCost = record.required_materials.reduce((sum, item) => {
    const price = getUnitPrice?.(item.name)
    return price > 0 ? sum + item.count * price : sum
  }, 0)

  const groups = new Map()
  record.additional_materials.forEach((material) => {
    const price = getUnitPrice?.(material.name)
    if (!(price > 0)) return
    const category = catalystCategory(material.name)
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push({
      name: material.name,
      bonusPerItem: material.probability_bonus_per_item,
      maxCount: material.max_count,
      costPerItem: price,
    })
  })
  const categories = [...groups.keys()]

  const strategies = [
    {
      id: 'recommended',
      label: '추천 (백워드 최적화)',
      recommended: true,
      expectedAttempts: optimal.expectedAttempts,
      expectedCost: optimal.expectedCost,
      catalystTotals: new Map(optimal.materials.map((item) => [item.name, item.expectedCount])),
    },
    {
      id: 'none',
      label: '보조 재료 미사용',
      ...simulateFixedPolicy(record, [], requiredMaterialUnitCost),
    },
    ...nonEmptySubsets(categories).map((subset) => ({
      id: subset.join('+'),
      label: `ALL ${subset.join(' + ')}`,
      ...simulateFixedPolicy(
        record,
        subset.flatMap((category) => groups.get(category)),
        requiredMaterialUnitCost,
      ),
    })),
  ]

  const cheapest = Math.min(...strategies.map((strategy) => strategy.expectedCost))
  return strategies
    .map((strategy) => ({
      ...strategy,
      categories,
      costDiff: strategy.expectedCost - cheapest,
      costDiffPercent: cheapest > 0 ? ((strategy.expectedCost - cheapest) / cheapest) * 100 : 0,
    }))
    .sort((a, b) => a.expectedCost - b.expectedCost)
}

export function simulateRange({
  equipmentType,
  grade,
  currentStage,
  targetStage,
  supportState,
  getUnitPrice,
}) {
  const steps = []
  const materialTotals = new Map()
  const excludedCatalysts = new Set()
  let expectedAttempts = 0
  let expectedCost = 0
  let hasUnpricedRequiredMaterial = false
  const missingStages = []

  for (let stage = currentStage + 1; stage <= targetStage; stage++) {
    const record = findRecord(equipmentType, grade, stage, supportState)
    if (!record) {
      missingStages.push(stage)
      continue
    }
    const result = optimizeTransition(record, getUnitPrice)
    steps.push({ fromStage: stage - 1, toStage: stage, ...result })
    expectedAttempts += result.expectedAttempts
    expectedCost += result.expectedCost
    if (result.hasUnpricedRequiredMaterial) hasUnpricedRequiredMaterial = true
    result.excludedCatalysts.forEach((name) => excludedCatalysts.add(name))
    result.materials.forEach(({ name, expectedCount }) => {
      materialTotals.set(name, (materialTotals.get(name) || 0) + expectedCount)
    })
  }

  return {
    expectedAttempts,
    expectedCost,
    hasUnpricedRequiredMaterial,
    excludedCatalysts: [...excludedCatalysts],
    materials: [...materialTotals.entries()].map(([name, expectedCount]) => ({
      name,
      expectedCount,
    })),
    steps,
    missingStages,
  }
}
