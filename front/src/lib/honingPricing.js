// Most of these material names are bound and have no market listing; 운명/명예의 파편은 각각
// 대용량 주머니로만 거래되므로 그 번들 시세를 개당 가격으로 환산한다. Shared between the main
// thread (for display) and the honing worker (for calculation), so both price things the same way.
export const shardConversions = {
  '운명의 파편': { marketName: '운명의 파편 주머니(대)', contents: 3000 },
  '명예의 파편': { marketName: '명예의 파편 주머니(대)', contents: 1500 },
}

export const marketNameFor = (name) => shardConversions[name]?.marketName || name

export const marketAmountFor = (name, count) =>
  shardConversions[name] ? count / shardConversions[name].contents : count

export const unitPriceOf = (name, prices) => {
  if (name === '골드') return 1
  const market = prices[marketNameFor(name)]
  if (!(market?.currentMinPrice > 0)) return null
  return (
    (market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)) *
    marketAmountFor(name, 1)
  )
}
