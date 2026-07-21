import braceletData from '../data/t4-bracelet-probabilities.json'

const EPSILON = 1e-8

function findPair(pairId) {
  const pair = braceletData.validFixedOptionPairs.find(item => item.id === pairId)
  if (!pair) throw new Error(`알 수 없는 팔찌 옵션 조합입니다: ${pairId}`)
  return pair
}

function optionDistribution(optionId) {
  const option = braceletData.options[optionId]
  if (!option) throw new Error(`알 수 없는 팔찌 옵션입니다: ${optionId}`)
  if (option.valueDistribution) return option.valueDistribution
  const shared = braceletData.sharedValueDistributions[option.valueDistributionRef]
  if (!shared) throw new Error(`${optionId}의 수치 확률 분포를 찾을 수 없습니다.`)
  return shared
}

export function valueBandKey(firstBand, secondBand) {
  return `${firstBand.min}-${firstBand.max}|${secondBand.min}-${secondBand.max}`
}

export function buildBraceletValueBandMatrix(pairId) {
  const pair = findPair(pairId)
  const [firstOptionId, secondOptionId] = pair.optionIds
  const firstDistribution = optionDistribution(firstOptionId)
  const secondDistribution = optionDistribution(secondOptionId)

  return firstDistribution.flatMap(firstBand => secondDistribution.map(secondBand => ({
    key: valueBandKey(firstBand, secondBand),
    pairId,
    firstOptionId,
    secondOptionId,
    firstBand,
    secondBand,
    probabilityPercent: firstBand.probability * secondBand.probability / 100,
  })))
}

export function trimmedMean(prices, lowerTrimPercent = 20, upperTrimPercent = lowerTrimPercent) {
  const sorted = prices
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  const lowerTrimCount = Math.floor(sorted.length * lowerTrimPercent / 100)
  const upperTrimCount = Math.floor(sorted.length * upperTrimPercent / 100)
  const retained = sorted.slice(lowerTrimCount, sorted.length - upperTrimCount)
  if (!retained.length) return null
  return retained.reduce((sum, price) => sum + price, 0) / retained.length
}

export function calculateBraceletPairExpectedPrice(pairId, pricesByValueBand, policy = braceletData.auctionPricingPolicy) {
  const matrix = buildBraceletValueBandMatrix(pairId)
  const cells = matrix.map(cell => {
    const prices = pricesByValueBand[cell.key] || []
    const averagePrice = prices.length >= policy.minimumSampleSize
      ? trimmedMean(prices, policy.removeLowerPercent, policy.removeUpperPercent)
      : null
    return {
      ...cell,
      sampleCount: prices.length,
      trimmedMeanPrice: averagePrice,
      weightedPrice: averagePrice == null ? null : averagePrice * cell.probabilityPercent / 100,
    }
  })

  const availableCells = cells.filter(cell => cell.trimmedMeanPrice != null)
  const availableProbabilityPercent = availableCells.reduce((sum, cell) => sum + cell.probabilityPercent, 0)
  const weightedPriceSum = availableCells.reduce((sum, cell) => sum + cell.weightedPrice, 0)
  const hasFullCoverage = Math.abs(availableProbabilityPercent - 100) < EPSILON

  return {
    pairId,
    cells,
    totalCellCount: cells.length,
    pricedCellCount: availableCells.length,
    availableProbabilityPercent,
    hasFullCoverage,
    expectedPrice: hasFullCoverage ? weightedPriceSum : null,
    partialCoverageEstimate: availableProbabilityPercent > 0
      ? weightedPriceSum / (availableProbabilityPercent / 100)
      : null,
  }
}

export function calculateAllBraceletPairPrices(pricesByPairAndValueBand) {
  return braceletData.validFixedOptionPairs
    .map(pair => calculateBraceletPairExpectedPrice(pair.id, pricesByPairAndValueBand[pair.id] || {}))
    .sort((a, b) => (b.expectedPrice ?? b.partialCoverageEstimate ?? -1) - (a.expectedPrice ?? a.partialCoverageEstimate ?? -1))
}
