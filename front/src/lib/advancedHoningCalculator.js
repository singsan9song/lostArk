const SUCCESS_TABLE_T3 = [
  [0.8, 0.15, 0.05],
  [0.7, 0.2, 0.1],
  [0.6, 0.25, 0.15],
  [0.5, 0.3, 0.2],
  [0.3, 0.45, 0.25],
  [0.2, 0.5, 0.3],
  [0.1, 0.55, 0.35],
  [0, 0.6, 0.4],
]

const SUCCESS_TABLE_T4 = [
  [0.8, 0.15, 0.05],
  [0.5, 0.3, 0.2],
  [0.3, 0.45, 0.25],
  [0, 0.6, 0.4],
]

const BONUS_TABLE_01 = [
  ['갈라투르', 0.15],
  ['겔라르', 0.35],
  ['쿠훔바르', 0.15],
  ['테메르', 0.35],
]

const BONUS_TABLE_23 = [
  ['갈라투르', 0.125],
  ['겔라르', 0.25],
  ['쿠훔바르', 0.125],
  ['테메르', 0.25],
  ['나베르', 0.125],
  ['에베르', 0.125],
]

const ENHANCED_BONUS_TABLE = [
  ['갈라투르', 0.2],
  ['겔라르', 0.2],
  ['쿠훔바르', 0.2],
  ['테메르', 0.2],
  ['에베르', 0.2],
]

const zeroCounts = () => ({ paidNormalTry: 0, freeNormalTry: 0, bonusTry: 0, enhancedBonusTry: 0 })

const addWeighted = (target, source, probability) => {
  target.paidNormalTry += source.paidNormalTry * probability
  target.freeNormalTry += source.freeNormalTry * probability
  target.bonusTry += source.bonusTry * probability
  target.enhancedBonusTry += source.enhancedBonusTry * probability
}

const outcomeExp = [10, 20, 40]
const turnCountCache = new Map()

function expectedTurnCounts({ grade, enhanced, normalK, bonusK, enhancedBonusK }) {
  const cacheKey = `${grade}|${enhanced ? 1 : 0}|${normalK}|${bonusK}|${enhancedBonusK}`
  if (turnCountCache.has(cacheKey)) return turnCountCache.get(cacheKey)

  const successTable = grade === 'T3' ? SUCCESS_TABLE_T3 : SUCCESS_TABLE_T4
  const bonusTable = enhanced ? BONUS_TABLE_23 : BONUS_TABLE_01
  const memo = new Map()

  const solve = (exp, stack, enhanceNextBonus, freeNext) => {
    if (exp >= 1000) return zeroCounts()
    const key = `${exp}|${stack}|${enhanceNextBonus ? 1 : 0}|${freeNext ? 1 : 0}`
    if (memo.has(key)) return memo.get(key)

    const counts = zeroCounts()
    let kind
    let transitions = []

    if (stack === 6) {
      const enhancedTurn = enhanceNextBonus && enhanced
      kind = enhancedTurn ? 'enhancedBonusTry' : 'bonusTry'
      const outcomeTable = successTable[enhancedTurn ? enhancedBonusK : bonusK]
      const ancestorTable = enhancedTurn ? ENHANCED_BONUS_TABLE : bonusTable

      outcomeTable.forEach((outcomeProbability, outcomeIndex) => {
        const normalExp = outcomeExp[outcomeIndex]
        ancestorTable.forEach(([ancestor, ancestorProbability]) => {
          let nextExp = exp + normalExp
          let nextStack = 0
          let nextEnhanced = false
          let nextFree = false
          if (ancestor === '갈라투르') nextExp = exp + normalExp * (enhancedTurn ? 7 : 5)
          if (ancestor === '겔라르') nextExp = exp + normalExp * (enhancedTurn ? 5 : 3)
          if (ancestor === '쿠훔바르') {
            nextExp = exp + normalExp + (enhancedTurn ? 80 : 30)
            nextStack = 6
          }
          if (ancestor === '테메르') {
            nextExp = exp + normalExp + (enhancedTurn ? 30 : 10)
            nextFree = true
          }
          if (ancestor === '나베르') {
            nextStack = 6
            nextEnhanced = true
          }
          if (ancestor === '에베르') {
            nextExp = Math.floor((exp + normalExp) / 100) * 100 + (enhancedTurn ? 200 : 100)
          }
          transitions.push({
            probability: outcomeProbability * ancestorProbability,
            state: [nextExp, nextStack, nextEnhanced, nextFree],
          })
        })
      })
    } else {
      kind = freeNext ? 'freeNormalTry' : 'paidNormalTry'
      transitions = successTable[normalK].map((probability, index) => ({
        probability,
        state: [exp + outcomeExp[index], stack + 1, false, false],
      }))
    }

    counts[kind] += 1
    transitions.forEach(({ probability, state }) =>
      addWeighted(counts, solve(...state), probability),
    )
    memo.set(key, counts)
    return counts
  }

  const result = solve(0, 0, false, false)
  turnCountCache.set(cacheKey, result)
  return result
}

const selectedAdditional = (sortedBreaths, breathCount, book, bookCount) => [
  ...sortedBreaths.slice(0, breathCount),
  ...(book && bookCount ? [book] : []),
]

const selectionCost = (selection) => selection.reduce((sum, item) => sum + item.cost, 0)

export function optimizeAdvancedSegment(record, getUnitPrice, levelCount = 10) {
  const baseMaterials = record.required_materials.map((item) => ({
    ...item,
    unitPrice: getUnitPrice(item.name),
  }))
  const basePrice = baseMaterials.reduce(
    (sum, item) => sum + (item.unitPrice === null ? 0 : item.unitPrice * item.count),
    0,
  )
  const pricedAdditional = record.additional_materials.map((item) => ({
    ...item,
    unitPrice: getUnitPrice(item.name),
    cost:
      getUnitPrice(item.name) === null
        ? Number.POSITIVE_INFINITY
        : getUnitPrice(item.name) * item.count,
    isBook: item.name.includes('야금술') || item.name.includes('재봉술'),
  }))
  const book = pricedAdditional.find((item) => item.isBook) || null
  const breaths = pricedAdditional.filter((item) => !item.isBook).sort((a, b) => a.cost - b.cost)
  const maxBreathCount = breaths.length
  const enhanced = record.from >= 21
  const reports = []

  for (let normalBreath = 0; normalBreath <= maxBreathCount; normalBreath += 1) {
    for (let bonusBreath = 0; bonusBreath <= maxBreathCount; bonusBreath += 1) {
      for (
        let enhancedBreath = 0;
        enhancedBreath <= (enhanced ? maxBreathCount : 0);
        enhancedBreath += 1
      ) {
        for (let normalBook = 0; normalBook <= (book ? 1 : 0); normalBook += 1) {
          for (let bonusBook = 0; bonusBook <= (book ? 1 : 0); bonusBook += 1) {
            for (
              let enhancedBook = 0;
              enhancedBook <= (enhanced && book ? 1 : 0);
              enhancedBook += 1
            ) {
              const bookWeight = maxBreathCount === 1 ? 2 : 4
              const counts = expectedTurnCounts({
                grade: record.equipment_grade,
                enhanced,
                normalK: normalBreath + normalBook * bookWeight,
                bonusK: bonusBreath + bonusBook * bookWeight,
                enhancedBonusK: enhancedBreath + enhancedBook * bookWeight,
              })
              const normalItems = selectedAdditional(breaths, normalBreath, book, normalBook)
              const bonusItems = selectedAdditional(breaths, bonusBreath, book, bonusBook)
              const enhancedItems = selectedAdditional(breaths, enhancedBreath, book, enhancedBook)
              const scale = levelCount / 10
              const paidNormalPrice = basePrice + selectionCost(normalItems)
              const freeNormalPrice = selectionCost(normalItems)
              const bonusPrice = basePrice + selectionCost(bonusItems)
              const enhancedBonusPrice = basePrice + selectionCost(enhancedItems)
              const expectedPrice =
                (paidNormalPrice * counts.paidNormalTry +
                  freeNormalPrice * counts.freeNormalTry +
                  bonusPrice * counts.bonusTry +
                  enhancedBonusPrice * counts.enhancedBonusTry) *
                scale

              reports.push({
                normalItems,
                bonusItems,
                enhancedItems,
                paidNormalPrice,
                freeNormalPrice,
                bonusPrice,
                enhancedBonusPrice,
                expectedPrice,
                expectedTryCount:
                  (counts.paidNormalTry +
                    counts.freeNormalTry +
                    counts.bonusTry +
                    counts.enhancedBonusTry) *
                  scale,
                counts: Object.fromEntries(
                  Object.entries(counts).map(([key, value]) => [key, value * scale]),
                ),
              })
            }
          }
        }
      }
    }
  }

  reports.sort((a, b) => a.expectedPrice - b.expectedPrice)
  return { best: reports[0], reports, baseMaterials }
}
