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

// The "현재" stage the user picks is the stage right before a target transition, so its
// valid options are just the target stages shifted down by one (e.g. T4 1590 only has target
// data from 11강 up, so 현재 should only offer 10강 and up — not the full generic 0~25 list).
export function currentStagesForGrade(equipmentType, grade) {
  return stagesForGrade(equipmentType, grade).map((stage) => stage - 1)
}

// equipment_type-agnostic grade → equipment_type map: every grade in this dataset covers the
// same target-stage range for both 방어구 and 무기, so the bulk selector (which sets one
// current/target pair across every equipment row) only needs one representative type per grade.
const equipmentTypeByGrade = new Map()
refiningData.records.forEach((record) => {
  if (!equipmentTypeByGrade.has(record.equipment_grade))
    equipmentTypeByGrade.set(record.equipment_grade, record.equipment_type)
})

export function stagesForGradeAnyType(grade) {
  return stagesForGrade(equipmentTypeByGrade.get(grade), grade)
}

export function currentStagesForGradeAnyType(grade) {
  return stagesForGradeAnyType(grade).map((stage) => stage - 1)
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

// Each attempt, finalProbability * 0.46511 accumulates as Artisan's Energy, rounded to 2
// decimal places; at 100% accumulated energy the next attempt is guaranteed to succeed.
// Rounding here (not just at the memoization boundary below) means the energy value itself
// only ever takes on a fixed grid of values, so caching at that same grid size is exact rather
// than an approximation — see ENERGY_BUCKET.
export function energyIncrement(totalProbabilityPercent) {
  return Math.round(totalProbabilityPercent * 0.46511 * 100) / 100
}

// Base success probability also escalates on its own with each failed attempt at the same
// stage (independent of Artisan's Energy): +1/10 of the attempt-1 probability per fail,
// capped at double the attempt-1 probability from attempt 11 onward.
export function rawBaseProbability(attemptOneProbability, attempt) {
  const escalated = attemptOneProbability + (attempt - 1) * (attemptOneProbability / 10)
  return Math.min(attemptOneProbability * 2, escalated)
}

// Matches the 2-decimal grid energyIncrement() itself rounds to, so this memoization key is
// exact (every reachable energy value already lands on this grid) rather than a lossy
// approximation. The "never worse than a fixed policy" safety net below still guards against
// any residual imprecision (e.g. floating-point drift from repeated addition), but this no
// longer trades accuracy for speed the way a coarser bucket would.
const ENERGY_BUCKET = 0.01
const roundEnergy = (value) => Math.round(value / ENERGY_BUCKET) * ENERGY_BUCKET
const NO_CATALYST = { bonus: 0, cost: 0, usage: [] }
const MAX_POINTS_PER_MATERIAL = 25
// Two frontier options whose bonus differs by less than one energy bucket's worth are
// indistinguishable to the memoized search below (they land in the same rounded-energy cache
// entry), so which one "wins" at a given attempt is just rounding noise rather than a real
// cost decision — this showed up as a single attempt using one fewer catalyst item than every
// neighboring attempt, for no real cost reason. Thinning the frontier to keep only options that
// are actually distinguishable at this bucket size (always keeping each material's own
// fully-maxed point, per the note below) removes that noise instead of chasing it with finer
// (and much slower) energy rounding.
const MIN_FRONTIER_BONUS_GAP = (ENERGY_BUCKET / 0.465) * 2

function catalystCategory(name) {
  if (name.startsWith('태양의')) return '태양'
  if (name.includes('야금술')) return '야금술'
  if (name.includes('재봉술')) return '재봉술'
  if (name.includes('숨결')) return '숨결'
  return name
}

function catalystGroups(record, getUnitPrice) {
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
  return groups
}

function nonEmptySubsets(items) {
  const subsets = []
  const total = 1 << items.length
  for (let mask = 1; mask < total; mask++) {
    subsets.push(items.filter((_, index) => mask & (1 << index)))
  }
  return subsets
}

// The cheapest way to reach any target probability bump is always to spend the
// cost-per-%-point-cheapest catalyst up to its max_count first, then the next, since bonuses
// are purely additive with no diminishing returns within one attempt. So the candidate choices
// are the cumulative prefix sums along that sorted order. Each category's own run of points is
// downsampled *separately* (never mixed with neighboring categories) so that the fully-maxed
// point for every individual category is always kept as a discrete choice — downsampling the
// concatenated list as a whole can silently drop exactly that point (e.g. "재봉술 only, no
// 숨결") whenever one category has very few steps (max_count 1) next to another with many
// (max_count 20+), which let a plain "always max one category" policy beat the "optimizer."
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

  const frontier = [NO_CATALYST]
  let bonus = 0
  let cost = 0
  const usageCounts = []
  priced.forEach((material) => {
    usageCounts.push({ name: material.name, count: 0 })
    const categoryPoints = []
    for (let i = 1; i <= material.maxCount; i++) {
      bonus += material.bonusPerItem
      cost += material.costPerItem
      usageCounts[usageCounts.length - 1].count = i
      categoryPoints.push({
        bonus,
        cost,
        usage: usageCounts.filter((item) => item.count > 0).map((item) => ({ ...item })),
      })
    }
    let selected
    if (categoryPoints.length > MAX_POINTS_PER_MATERIAL) {
      const step = (categoryPoints.length - 1) / (MAX_POINTS_PER_MATERIAL - 1)
      const indices = new Set(
        Array.from({ length: MAX_POINTS_PER_MATERIAL }, (_, i) => Math.round(i * step)),
      )
      selected = [...indices].sort((a, b) => a - b).map((index) => categoryPoints[index])
    } else {
      selected = categoryPoints
    }
    selected[selected.length - 1].boundary = true
    frontier.push(...selected)
  })

  const excludedCatalysts = record.additional_materials
    .filter((material) => !(getUnitPrice?.(material.name) > 0))
    .map((material) => material.name)
  return { frontier: thinFrontier(frontier), excludedCatalysts }
}

// frontier is built with strictly non-decreasing bonus/cost as it walks through materials in
// cost-efficiency order, so thinning down to points at least MIN_FRONTIER_BONUS_GAP apart (while
// always preserving each material's own fully-maxed boundary point) never reorders anything —
// it just drops interior points too close together to matter at this search's energy precision.
function thinFrontier(frontier) {
  const kept = [frontier[0]]
  for (let i = 1; i < frontier.length; i++) {
    const point = frontier[i]
    const previous = kept[kept.length - 1]
    if (point.boundary || point.bonus - previous.bonus >= MIN_FRONTIER_BONUS_GAP) {
      kept.push(point)
    }
  }
  return kept
}

// Walks attempts forward given a function deciding what to spend at each (base probability,
// energy) state, producing the full result shape (attemptRows, aggregated materials,
// expected/worst case cost). Shared by the adaptive optimizer and by each fixed comparison
// policy so both are built the exact same way — the only thing that differs between them is
// `chooseCatalyst`. Starts from startBase/startEnergy rather than always attempt 1 / energy 0,
// so a honing already in progress (some fails already spent) can resume from where it is.
function buildTransitionResult(record, requiredMaterialUnitCost, chooseCatalyst, startBase, startEnergy) {
  const attemptOneProbability = record.probability.total
  const maxBase = attemptOneProbability * 2
  const attemptRows = []
  const materialTotals = new Map(record.required_materials.map((item) => [item.name, 0]))
  const catalystTotals = new Map()
  let base = startBase
  let energy = startEnergy
  let reachProbability = 1
  let expectedAttempts = 0
  let expectedCatalystCost = 0
  for (let attempt = 1; attempt <= 1000; attempt++) {
    const guaranteed = energy >= 100
    const choice = guaranteed ? NO_CATALYST : chooseCatalyst(base, energy)
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
    base = Math.min(maxBase, base + attemptOneProbability / 10)
  }

  return {
    expectedAttempts,
    expectedCost: requiredMaterialUnitCost * expectedAttempts + expectedCatalystCost,
    worstCaseAttempts: attemptRows.length,
    worstCaseCost: attemptRows.reduce((sum, row) => sum + row.attemptCost, 0),
    materials: [
      ...[...materialTotals.entries()].map(([name, expectedCount]) => ({ name, expectedCount })),
      ...[...catalystTotals.entries()].map(([name, expectedCount]) => ({ name, expectedCount })),
    ],
    attemptRows,
  }
}

function fixedChoice(materials) {
  return {
    bonus: materials.reduce((sum, m) => sum + m.bonusPerItem * m.maxCount, 0),
    cost: materials.reduce((sum, m) => sum + m.costPerItem * m.maxCount, 0),
    usage: materials.map((m) => ({ name: m.name, count: m.maxCount })),
  }
}

// A honing already in progress has already spent some fails, so its base probability has
// already escalated above the fresh-attempt-1 value and it may already hold some Artisan's
// Energy — options.startProbability/startEnergy let the search resume from there instead of
// always assuming a fresh start. startProbability is clamped into [attemptOneProbability,
// attemptOneProbability*2] — the same range rawBaseProbability's own escalation cap keeps it
// in — since a base below the attempt-1 value or above the cap can't actually occur.
function clampStart(record, options) {
  const attemptOneProbability = record.probability.total
  const maxBase = attemptOneProbability * 2
  const startBase = Math.min(
    maxBase,
    Math.max(attemptOneProbability, options?.startProbability ?? attemptOneProbability),
  )
  const startEnergy = Math.min(100, Math.max(0, options?.startEnergy ?? 0))
  return { startBase, startEnergy }
}

// Backward-induction optimizer: at each (base probability, accumulated energy) state, choose
// the catalyst spend minimizing expected remaining cost (required materials + catalyst — a
// probability boost is only worth its catalyst cost if it saves enough *future* attempts'
// worth of required-material spend, so both have to be in the same recursive value). The
// fail-path never branches (there's exactly one way to fail, so the resulting energy is a
// single deterministic value), so a memoized recursion is a close approximation (energy is
// rounded for memoization, trading a little precision for speed). Keying the memo on the base
// probability itself (rather than an ever-increasing attempt number) also means every attempt
// past the point base hits its cap collapses into the same handful of cached states instead of
// growing the cache forever.
//
// Safety net: rounding means the search can occasionally miss the true optimum by a small
// margin, so this also evaluates every simple fixed policy (always max category X, for every
// category and combination actually on this record) via the exact same attempt-walk and
// returns whichever is genuinely cheapest — the result can never be beaten by a fixed policy,
// by construction, regardless of any residual search imprecision.
export function optimizeTransition(record, getUnitPrice, options) {
  const attemptOneProbability = record.probability.total
  const maxBase = attemptOneProbability * 2
  const { startBase, startEnergy } = clampStart(record, options)
  const { frontier, excludedCatalysts } = buildCatalystFrontier(record, getUnitPrice)
  const memo = new Map()

  const requiredMaterialUnitCost = record.required_materials.reduce((sum, item) => {
    const price = getUnitPrice?.(item.name)
    return price > 0 ? sum + item.count * price : sum
  }, 0)
  const hasUnpricedRequiredMaterial = record.required_materials.some(
    (item) => !(getUnitPrice?.(item.name) > 0),
  )

  function solve(base, energy) {
    if (energy >= 100) return { expectedCost: requiredMaterialUnitCost, choice: NO_CATALYST }
    const key = `${base}|${roundEnergy(energy)}`
    const cached = memo.get(key)
    if (cached) return cached

    let best = null
    frontier.forEach((option) => {
      const finalProbability = Math.min(100, base + option.bonus)
      const failChance = 1 - finalProbability / 100
      const newEnergy = Math.min(100, energy + energyIncrement(finalProbability))
      const newBase = Math.min(maxBase, base + attemptOneProbability / 10)
      const future = failChance > 0 ? solve(newBase, newEnergy).expectedCost : 0
      const expectedCost = requiredMaterialUnitCost + option.cost + failChance * future
      if (!best || expectedCost < best.expectedCost) best = { expectedCost, choice: option }
    })
    memo.set(key, best)
    return best
  }
  solve(startBase, startEnergy)

  const candidates = [
    buildTransitionResult(
      record,
      requiredMaterialUnitCost,
      (base, energy) => solve(base, energy).choice,
      startBase,
      startEnergy,
    ),
    buildTransitionResult(record, requiredMaterialUnitCost, () => NO_CATALYST, startBase, startEnergy),
  ]
  const groups = catalystGroups(record, getUnitPrice)
  const categories = [...groups.keys()]
  nonEmptySubsets(categories).forEach((subset) => {
    const materials = subset.flatMap((category) => groups.get(category))
    candidates.push(
      buildTransitionResult(
        record,
        requiredMaterialUnitCost,
        () => fixedChoice(materials),
        startBase,
        startEnergy,
      ),
    )
  })

  const best = candidates.reduce((min, candidate) =>
    candidate.expectedCost < min.expectedCost ? candidate : min,
  )

  return {
    ...best,
    hasUnpricedRequiredMaterial,
    excludedCatalysts,
  }
}

// Extracts the display-facing summary (expected attempts/cost + per-catalyst expected usage)
// out of a full buildTransitionResult, for one fixed policy's row in the comparison table.
function toStrategySummary(record, result) {
  const catalystNames = new Set(record.additional_materials.map((item) => item.name))
  return {
    expectedAttempts: result.expectedAttempts,
    expectedCost: result.expectedCost,
    catalystTotals: new Map(
      result.materials
        .filter((item) => catalystNames.has(item.name))
        .map((item) => [item.name, item.expectedCount]),
    ),
  }
}

// Builds the "전략 비교" table: the true (per-attempt-adaptive) optimum alongside a few
// simple fixed policies — no catalyst at all, and "always use the full max of category X"
// for every category and combination of categories actually available on this record — so
// the user can see how much the adaptive optimizer is really saving versus simple habits
// like "always max everything." optimizeTransition's own safety net already guarantees the
// "recommended" row can never be beaten by any of these, so sorting by cost alone is enough
// to keep it first — no tie-breaking hack needed.
export function compareStrategies(record, getUnitPrice, options) {
  const optimal = optimizeTransition(record, getUnitPrice, options)
  const { startBase, startEnergy } = clampStart(record, options)
  const requiredMaterialUnitCost = record.required_materials.reduce((sum, item) => {
    const price = getUnitPrice?.(item.name)
    return price > 0 ? sum + item.count * price : sum
  }, 0)

  const groups = catalystGroups(record, getUnitPrice)
  const categories = [...groups.keys()]

  const strategies = [
    {
      id: 'recommended',
      label: '추천',
      recommended: true,
      expectedAttempts: optimal.expectedAttempts,
      expectedCost: optimal.expectedCost,
      catalystTotals: new Map(optimal.materials.map((item) => [item.name, item.expectedCount])),
    },
    {
      id: 'none',
      label: '보조 재료 미사용',
      ...toStrategySummary(
        record,
        buildTransitionResult(record, requiredMaterialUnitCost, () => NO_CATALYST, startBase, startEnergy),
      ),
    },
    ...nonEmptySubsets(categories).map((subset) => {
      const materials = subset.flatMap((category) => groups.get(category))
      return {
        id: subset.join('+'),
        label: `ALL ${subset.join(' + ')}`,
        ...toStrategySummary(
          record,
          buildTransitionResult(
            record,
            requiredMaterialUnitCost,
            () => fixedChoice(materials),
            startBase,
            startEnergy,
          ),
        ),
      }
    }),
  ]

  const cheapest = Math.min(...strategies.map((strategy) => strategy.expectedCost))
  // A fixed policy that costs the same as an already-kept, cheaper-or-equal strategy (almost
  // always "recommended" itself) is the same real-world strategy under a different name — e.g.
  // "ALL 재봉술" when 재봉술 is the only catalyst on the record. Showing it as a second row next
  // to 추천 reads as a contradiction, so collapse it away and keep only the first (cheapest) row
  // at each distinct cost.
  const tieEpsilon = Math.max(1, cheapest * 1e-6)
  const sorted = strategies
    .map((strategy) => ({
      ...strategy,
      categories,
      costDiff: strategy.expectedCost - cheapest,
      costDiffPercent: cheapest > 0 ? ((strategy.expectedCost - cheapest) / cheapest) * 100 : 0,
    }))
    .sort((a, b) => a.expectedCost - b.expectedCost)

  const deduped = []
  sorted.forEach((strategy) => {
    const duplicate = deduped.some(
      (kept) => Math.abs(kept.expectedCost - strategy.expectedCost) <= tieEpsilon,
    )
    if (!duplicate) deduped.push(strategy)
  })
  return deduped
}

export function simulateRange({
  equipmentType,
  grade,
  currentStage,
  targetStage,
  supportState,
  getUnitPrice,
  startProbability,
  startEnergy,
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
    // Only the very first transition (the stage the user is currently mid-attempt on) can
    // start from a non-fresh base probability / Artisan's Energy; every later stage starts a
    // brand new honing attempt from scratch.
    const options = stage === currentStage + 1 ? { startProbability, startEnergy } : undefined
    const result = optimizeTransition(record, getUnitPrice, options)
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
