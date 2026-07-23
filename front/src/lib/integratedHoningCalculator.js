import advancedRefiningData from '../data/icepang_advanced_refining_data.json'
import { optimizeAdvancedSegment } from './advancedHoningCalculator'
import { itemLevelPerRegularStage } from './representativeEquipment'

const advancedRecords = advancedRefiningData.records.map((record) => {
  const [from, to] = record.target_stage.match(/\d+/g).map(Number)
  return { ...record, from, to }
})
export const INTEGRATED_ADVANCED_MATERIAL_NAMES = [
  ...new Set(
    advancedRecords.flatMap((record) => [
      ...record.required_materials.map((item) => item.name),
      ...record.additional_materials.map((item) => item.name),
    ]),
  ),
]

const advancedMaxStage = (grade) => (grade === 'T3' ? 20 : 40)

function addMaterial(map, name, count) {
  map.set(name, (map.get(name) || 0) + count)
}

function advancedMaterials(record, best) {
  const materials = new Map()
  const paidTurns = best.counts.paidNormalTry + best.counts.bonusTry + best.counts.enhancedBonusTry
  record.required_materials.forEach((material) =>
    addMaterial(materials, material.name, material.count * paidTurns),
  )
  best.normalItems.forEach((material) =>
    addMaterial(
      materials,
      material.name,
      material.count * (best.counts.paidNormalTry + best.counts.freeNormalTry),
    ),
  )
  best.bonusItems.forEach((material) =>
    addMaterial(materials, material.name, material.count * best.counts.bonusTry),
  )
  best.enhancedItems.forEach((material) =>
    addMaterial(materials, material.name, material.count * best.counts.enhancedBonusTry),
  )
  return [...materials.entries()].map(([name, expectedCount]) => ({ name, expectedCount }))
}

function prefixOptions(actions, maxGain) {
  const options = [{ gain: 0, cost: 0, attempts: 0, actions: [], materials: [] }]
  const materialTotals = new Map()
  let gain = 0
  let cost = 0
  let attempts = 0
  const selectedActions = []

  for (const action of actions) {
    gain += action.levelGain
    if (gain > maxGain) break
    cost += action.cost
    attempts += action.attempts
    selectedActions.push(action)
    action.materials.forEach((material) =>
      addMaterial(materialTotals, material.name, material.expectedCount),
    )
    options.push({
      gain,
      cost,
      attempts,
      actions: [...selectedActions],
      materials: [...materialTotals.entries()].map(([name, expectedCount]) => ({
        name,
        expectedCount,
      })),
    })
  }
  return options
}

function combineItemOptions(regularOptions, advancedOptions, maxGain) {
  const cheapestByGain = new Map()
  regularOptions.forEach((regular) =>
    advancedOptions.forEach((advanced) => {
      const gain = regular.gain + advanced.gain
      if (gain > maxGain) return
      const cost = regular.cost + advanced.cost
      const existing = cheapestByGain.get(gain)
      if (existing && existing.cost <= cost) return
      const materials = new Map()
      ;[...regular.materials, ...advanced.materials].forEach((material) =>
        addMaterial(materials, material.name, material.expectedCount),
      )
      cheapestByGain.set(gain, {
        gain,
        cost,
        attempts: regular.attempts + advanced.attempts,
        actions: [...regular.actions, ...advanced.actions],
        materials: [...materials.entries()].map(([name, expectedCount]) => ({
          name,
          expectedCount,
        })),
      })
    }),
  )

  const options = [...cheapestByGain.values()].sort((a, b) => b.gain - a.gain)
  let cheapestHigherGain = Number.POSITIVE_INFINITY
  const useful = options.filter((option) => {
    if (option.cost >= cheapestHigherGain) return false
    cheapestHigherGain = option.cost
    return true
  })
  return useful.sort((a, b) => a.gain - b.gain)
}

export function buildIntegratedItemOptions(
  item,
  detected,
  regularResult,
  getUnitPrice,
  maxGain,
  advancedOptimizationCache = new Map(),
) {
  const regularLevelGain = itemLevelPerRegularStage(detected.regularGrade)
  const regularActions = (regularResult?.steps || []).map((step) => ({
    kind: 'regular',
    from: step.fromStage,
    to: step.toStage,
    levelGain: regularLevelGain,
    cost: step.expectedCost,
    attempts: step.expectedAttempts,
    materials: step.materials,
  }))

  const advancedActions = []
  for (
    let stage = detected.advancedHoning + 1;
    stage <= advancedMaxStage(detected.advancedGrade);
    stage += 1
  ) {
    const record = advancedRecords.find(
      (candidate) =>
        candidate.equipment_type === item.type &&
        candidate.equipment_grade === detected.advancedGrade &&
        candidate.from <= stage &&
        candidate.to >= stage,
    )
    if (!record) continue
    const cacheKey = `${item.type}|${detected.advancedGrade}|${record.from}-${record.to}`
    if (!advancedOptimizationCache.has(cacheKey)) {
      advancedOptimizationCache.set(cacheKey, optimizeAdvancedSegment(record, getUnitPrice, 1).best)
    }
    const best = advancedOptimizationCache.get(cacheKey)
    advancedActions.push({
      kind: 'advanced',
      from: stage - 1,
      to: stage,
      levelGain: 1,
      cost: best.expectedPrice,
      attempts: best.expectedTryCount,
      materials: advancedMaterials(record, best),
    })
  }

  return combineItemOptions(
    prefixOptions(regularActions, maxGain),
    prefixOptions(advancedActions, maxGain),
    maxGain,
  )
}

export function optimizeIntegratedEquipment(items, requiredTotalGain, maximumActionGain = 1) {
  // Any cheapest route that overshoots by at least one whole action cannot be optimal:
  // removing its final action would still reach the target at an equal or lower cost.
  const maximumUsefulGain = requiredTotalGain + Math.max(0, maximumActionGain - 1)
  let states = new Map([[0, { cost: 0, selections: [] }]])

  items.forEach((item) => {
    const next = new Map()
    states.forEach((state, gained) => {
      item.options.forEach((option) => {
        const nextGain = gained + option.gain
        if (nextGain > maximumUsefulGain) return
        const nextCost = state.cost + option.cost
        const existing = next.get(nextGain)
        if (existing && existing.cost <= nextCost) return
        next.set(nextGain, {
          cost: nextCost,
          selections: [...state.selections, { item, option }],
        })
      })
    })
    states = next
  })

  const bestEntry = [...states.entries()]
    .filter(([gain]) => gain >= requiredTotalGain)
    .sort(([gainA, stateA], [gainB, stateB]) => stateA.cost - stateB.cost || gainA - gainB)[0]
  if (!bestEntry) return null
  const [bestGain, best] = bestEntry

  const materials = new Map()
  let attempts = 0
  best.selections.forEach(({ option }) => {
    attempts += option.attempts
    option.materials.forEach((material) =>
      addMaterial(materials, material.name, material.expectedCount),
    )
  })
  return {
    cost: best.cost,
    attempts,
    actualGain: bestGain,
    selections: best.selections,
    materials: [...materials.entries()].map(([name, expectedCount]) => ({
      name,
      expectedCount,
    })),
  }
}
