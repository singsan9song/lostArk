import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Coins, PackageOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import singleCoinData from '../data/single-coin.json'
import { lostArkApi } from '../lib/api'
import { efficiencyToolTabs as toolTabs } from '../lib/toolNavigation'
import { GoldAmount } from '../components/GoldIcon'

const format = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const gradeClass = (grade) =>
  ({
    고대: 'ancient',
    유물: 'relic',
    전설: 'legendary',
    영웅: 'epic',
    희귀: 'rare',
    고급: 'uncommon',
    일반: 'common',
  })[grade] || ''
const VALUE_EXCLUSION_GROUPS = [
  { id: 'destruction', label: '파괴석', keywords: ['파괴석'] },
  { id: 'guardian', label: '수호석', keywords: ['수호석'] },
  { id: 'shard', label: '운명의 파편', keywords: ['운명의 파편'] },
  { id: 'leapstone', label: '돌파석', keywords: ['돌파석'] },
  { id: 'lava-breath', label: '용암의 숨결', keywords: ['용암의 숨결'] },
  { id: 'glacier-breath', label: '빙하의 숨결', keywords: ['빙하의 숨결'] },
  { id: 'tailoring', label: '재봉술 : 업화', keywords: ['재봉술 : 업화'] },
  { id: 'metallurgy', label: '야금술 : 업화', keywords: ['야금술 : 업화'] },
  { id: 'master-tailoring', label: '장인의 재봉술', keywords: ['장인의 재봉술'] },
  { id: 'master-metallurgy', label: '장인의 야금술', keywords: ['장인의 야금술'] },
  { id: 'gem', label: '젬', keywords: ['젬'] },
  { id: 'fusion', label: '아비도스 융화 재료', keywords: ['아비도스 융화 재료'] },
]
const isValueExcluded = (entry, excludedGroups) => {
  const name = `${entry?.marketName || ''} ${entry?.name || ''}`
  return VALUE_EXCLUSION_GROUPS.some(
    (group) =>
      excludedGroups.has(group.id) && group.keywords.some((keyword) => name.includes(keyword)),
  )
}
function MarqueeText({ children }) {
  const wrapRef = useRef(null)
  const textRef = useRef(null)
  const [distance, setDistance] = useState(0)
  useEffect(() => {
    const measure = () =>
      setDistance(
        Math.max(0, (textRef.current?.scrollWidth || 0) - (wrapRef.current?.clientWidth || 0)),
      )
    measure()
    const observer = new ResizeObserver(measure)
    if (wrapRef.current) observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [children])
  return (
    <span
      ref={wrapRef}
      className={`marquee-text ${distance > 1 ? 'is-overflowing' : ''}`}
      style={{ '--marquee-distance': `${distance}px` }}
    >
      <span ref={textRef}>{children}</span>
    </span>
  )
}
function AnimatedDetails({ open, children }) {
  const [visible, setVisible] = useState(open)
  const lastContent = useRef(children)
  if (open && children) lastContent.current = children
  useLayoutEffect(() => {
    if (open) {
      setVisible(true)
      return undefined
    }
    const timer = window.setTimeout(() => setVisible(false), 260)
    return () => window.clearTimeout(timer)
  }, [open])
  if (!open && !visible) return null
  return (
    <div className={`single-details-motion ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="single-details-motion-inner">
        {open ? children : visible ? lastContent.current : null}
      </div>
    </div>
  )
}
const selectionRewardValue = (reward, marketPrices, excludedGroups = new Set()) => {
  if (isValueExcluded(reward, excludedGroups)) return 0
  const market = marketPrices[reward.marketName]
  return market?.currentMinPrice > 0
    ? (market.currentMinPrice / Math.max(1, market.bundleCount)) *
        Number(reward.marketQuantity ?? reward.quantity ?? 1)
    : null
}
const selectedRewardFor = (option, marketPrices, selectedRewardId, excludedGroups = new Set()) =>
  option.selectionRewards?.find((reward) => reward.id === selectedRewardId) ||
  [...(option.selectionRewards || [])].sort(
    (a, b) =>
      (selectionRewardValue(b, marketPrices, excludedGroups) ?? -1) -
      (selectionRewardValue(a, marketPrices, excludedGroups) ?? -1),
  )[0]
const exchangeRatioLabel = (item, option) => {
  if (option.exchangeRatioText) return option.exchangeRatioText
  const requirement = option.exchangeRequirement || {}
  if (requirement.quantityPerBox > 0)
    return `${item.name} ${format(requirement.quantityPerBox)}개 → ${option.name} 1개`
  if (requirement.thornPerBox > 0)
    return `${item.name} ${format(requirement.thornPerBox)}개 → ${option.name} 1개`
  if (requirement.thornPerItem > 0)
    return `${item.name} ${format(requirement.thornPerItem)}개 → ${option.name} 1개`
  if (requirement.sourcePerExchange > 0 && requirement.rewardPerExchange > 0)
    return `${item.name} ${format(requirement.sourcePerExchange)}개 → ${option.name} ${format(requirement.rewardPerExchange)}개`
  if (requirement.sourceAmount > 0 && option.quantity > 0)
    return `${item.name} ${format(requirement.sourceAmount)}개 → ${option.name} ${format(option.quantity)}개`
  return ''
}
const optionValue = (option, marketPrices, selectedRewardId, excludedGroups = new Set()) => {
  if (
    isValueExcluded(option, excludedGroups) &&
    !option.chanceRewards?.length &&
    !option.selectionRewards?.length
  )
    return 0
  if (option.selectionRewards?.length) {
    const selectedReward = selectedRewardFor(option, marketPrices, selectedRewardId, excludedGroups)
    const value = selectedReward
      ? selectionRewardValue(selectedReward, marketPrices, excludedGroups)
      : null
    return value == null
      ? null
      : value * Number(option.quantity ?? 1) - Number(option.goldCost || 0)
  }
  if (option.chanceRewards?.length) {
    const rewardValues = option.chanceRewards.map((reward) => {
      if (isValueExcluded(reward, excludedGroups)) return 0
      const market = marketPrices[reward.marketName]
      return market?.currentMinPrice > 0 && Number(reward.quantity) > 0
        ? (market.currentMinPrice / Math.max(1, market.bundleCount)) *
            Number(reward.marketQuantity ?? reward.quantity) *
            reward.probability
        : null
    })
    return rewardValues.every((value) => value != null)
      ? rewardValues.reduce((sum, value) => sum + value, 0) *
          Number(option.expectedRewardQuantity ?? option.quantity ?? 1)
      : null
  }
  const market = marketPrices[option.marketName]
  if (!(market?.currentMinPrice > 0)) return null
  const grossValue = (market.currentMinPrice / Math.max(1, market.bundleCount)) * option.quantity
  return (
    grossValue -
    Number(option.goldCost || 0) -
    Number(option.goldCostPerItem || 0) * Number(option.quantity || 0)
  )
}
const itemGoldValue = (
  item,
  marketPrices,
  selectedOptionId,
  selectedRewardIds = {},
  excludedGroups = new Set(),
) => {
  if (Number(item.goldValue) > 0) return Number(item.goldValue)
  const options = (item.exchangeOptions || []).map((option) => ({
    ...option,
    value: optionValue(option, marketPrices, selectedRewardIds[option.id], excludedGroups),
  }))
  const values = options
    .map((option) => option.value)
    .filter((value) => value != null && value >= 0)
  if (item.pricingMode === 'sumExchangeOptions')
    return values.length === options.length ? values.reduce((sum, value) => sum + value, 0) : 0
  if (item.pricingMode === 'highestExchangeOption' && options.length > 1) {
    return (
      (
        options.find((option) => option.id === selectedOptionId) ||
        [...options].sort((a, b) => (b.value ?? -1) - (a.value ?? -1))[0]
      )?.value || 0
    )
  }
  return values.length ? Math.max(...values) : 0
}

function SingleCoinRow({
  item,
  marketPrices,
  marketLoading,
  selectedOptionId,
  onSelectOption,
  selectedRewardIds = {},
  onSelectReward,
  excludedGroups,
  rank,
  rowRef,
  activeDisclosure,
  onToggleDisclosure,
}) {
  if (!item)
    return (
      <div className="single-coin-row placeholder" aria-hidden="true">
        <em className="single-value-rank">--</em>
        <span className="single-item">
          <i>
            <PackageOpen />
          </i>
          <span>
            <b>아이템 데이터 준비 중</b>
            <small>JSON 데이터 연결 예정</small>
          </span>
        </span>
        <span className="single-coin-cost-cell">--</span>
        <span>--</span>
        <strong className="coin-gold-value">--</strong>
      </div>
    )

  const exchangeOptions = (item.exchangeOptions || []).map((option) => {
    const market = marketPrices[option.marketName]
    const value = optionValue(option, marketPrices, selectedRewardIds[option.id], excludedGroups)
    return { ...option, market, value }
  })
  const selectable = item.pricingMode === 'highestExchangeOption' && exchangeOptions.length > 1
  const availableOptionValues = exchangeOptions
    .map((option) => option.value)
    .filter((value) => value != null && value >= 0)
  const valueSortedOptions = exchangeOptions
    .filter((option) => option.value == null || option.value >= 0)
    .sort((a, b) => {
      if (a.value == null && b.value == null) return 0
      if (a.value == null) return 1
      if (b.value == null) return -1
      return b.value - a.value
    })
  const selectedOption = selectable
    ? exchangeOptions.find((option) => option.id === selectedOptionId) || valueSortedOptions[0]
    : null
  const sortedExchangeOptions = selectable
    ? [selectedOption, ...valueSortedOptions.filter((option) => option.id !== selectedOption.id)]
    : exchangeOptions
  const optionsExpanded =
    activeDisclosure?.itemId === item.id && activeDisclosure?.type === 'options'
  const expandedChanceOptionId =
    activeDisclosure?.itemId === item.id && activeDisclosure?.type === 'chance'
      ? activeDisclosure.optionId
      : null
  const expandedSelectionOptionId =
    activeDisclosure?.itemId === item.id && activeDisclosure?.type === 'selection'
      ? activeDisclosure.optionId
      : null
  const visibleExchangeOptions =
    selectable && !optionsExpanded ? [selectedOption] : sortedExchangeOptions
  const calculatedGoldValue =
    item.pricingMode === 'sumExchangeOptions'
      ? availableOptionValues.length === exchangeOptions.length
        ? availableOptionValues.reduce((sum, value) => sum + value, 0)
        : 0
      : selectable
        ? selectedOption?.value || 0
        : availableOptionValues.length
          ? Math.max(...availableOptionValues)
          : 0
  const resolvedItemGoldValue =
    Number(item.goldValue) > 0 ? Number(item.goldValue) : calculatedGoldValue
  const goldPerCoin = Number(item.coinCost) > 0 ? resolvedItemGoldValue / Number(item.coinCost) : 0
  const exclusionAffected = exchangeOptions.some(
    (option) =>
      isValueExcluded(option, excludedGroups) ||
      option.chanceRewards?.some((reward) => isValueExcluded(reward, excludedGroups)) ||
      option.selectionRewards?.some((reward) => isValueExcluded(reward, excludedGroups)),
  )
  const representativeMarket = exchangeOptions.find((option) => option.market?.icon)?.market
  const activeChanceOption = exchangeOptions.find(
    (option) => option.id === expandedChanceOptionId && option.chanceRewards?.length,
  )
  const activeSelectionOption = exchangeOptions.find(
    (option) => option.id === expandedSelectionOptionId && option.selectionRewards?.length,
  )
  return (
    <div ref={rowRef} className="single-coin-row">
      <em className="single-value-rank">{rank}</em>
      <span className="single-item">
        {item.image || representativeMarket?.icon ? (
          <img
            className={gradeClass(item.grade || representativeMarket?.grade)}
            src={item.image || representativeMarket.icon}
            alt=""
          />
        ) : (
          <i>
            <PackageOpen />
          </i>
        )}
        <span className="single-item-copy">
          <b>{item.name}</b>
          <small className="single-item-quantity">× {format(item.exchangeQuantity ?? 1)}</small>
        </span>
      </span>
      <span className="single-coin-cost-cell">
        <img className="epic" src="/images/rewards/tokenitem_88.png" alt="클리어 코인" />
        <span className="single-coin-cost-copy">
          <span>
            <em>교환 비용</em>
            <strong>{format(item.coinCost)}</strong>
          </span>
          <span>
            <em>주간 획득 제한</em>
            <strong>{format(item.weeklyLimit)}회</strong>
          </span>
        </span>
      </span>
      {exchangeOptions.length ? (
        <span className={`single-exchange-options ${optionsExpanded ? 'expanded' : ''}`}>
          {visibleExchangeOptions.map((option) => {
            const isSelected = selectable && option.id === selectedOption.id
            const chanceBox = Boolean(option.chanceRewards?.length)
            const selectionBox = Boolean(option.selectionRewards?.length)
            const detailsOpen =
              expandedChanceOptionId === option.id || expandedSelectionOptionId === option.id
            const nestedReward = selectionBox
              ? selectedRewardFor(
                  option,
                  marketPrices,
                  selectedRewardIds[option.id],
                  excludedGroups,
                )
              : null
            const optionImage = option.image ? (
              <img className={gradeClass(option.grade)} src={option.image} alt="" />
            ) : option.market?.icon ? (
              <img className={gradeClass(option.market.grade)} src={option.market.icon} alt="" />
            ) : (
              <i>
                <PackageOpen />
              </i>
            )
            const exchangeRatio = exchangeRatioLabel(item, option)
            const description = nestedReward
              ? `선택: ${nestedReward.name}${exchangeRatio ? ` · ${exchangeRatio}` : ''}`
              : exchangeRatio ||
                (option.quantity == null
                  ? '교환 비용 미정'
                  : `${format(option.quantity)}${option.unit || '개'}`)
            const optionCopy = (
              <span className="single-option-copy">
                <MarqueeText>
                  <span className="single-option-line">
                    <b>{option.name}</b>
                    <small>{description}</small>
                  </span>
                </MarqueeText>
                {isSelected && <em className="single-selected-badge">선택됨</em>}
              </span>
            )
            const optionPrice = (
              <strong>
                {marketLoading ? (
                  '조회 중'
                ) : option.value == null ? (
                  '--'
                ) : (
                  <GoldAmount>{format(option.value)}</GoldAmount>
                )}
              </strong>
            )
            const handleSelection = selectable
              ? () => {
                  if (!optionsExpanded) {
                    onToggleDisclosure({ itemId: item.id, type: 'options' })
                    return
                  }
                  if (!isSelected) onSelectOption(item.id, option.id)
                  onToggleDisclosure(null)
                }
              : undefined
            if (selectionBox)
              return (
                <div
                  className={`single-chance-card ${isSelected ? 'selected' : ''} ${detailsOpen ? 'details-open' : ''}`}
                  key={option.id}
                >
                  <button
                    type="button"
                    className="single-chance-card-main"
                    aria-pressed={selectable ? isSelected : undefined}
                    onClick={handleSelection}
                  >
                    {optionImage}
                    {optionCopy}
                  </button>
                  <button
                    type="button"
                    className="single-inline-chance"
                    aria-expanded={detailsOpen}
                    onClick={() =>
                      onToggleDisclosure({
                        itemId: item.id,
                        optionId: option.id,
                        type: 'selection',
                      })
                    }
                  >
                    {isSelected ? '선택됨 · 변경' : '선택 변경'}
                    <ChevronDown />
                  </button>
                  {optionPrice}
                </div>
              )
            if (chanceBox)
              return (
                <div
                  className={`single-chance-card ${isSelected ? 'selected' : ''} ${detailsOpen ? 'details-open' : ''}`}
                  key={option.id}
                >
                  <button
                    type="button"
                    className="single-chance-card-main"
                    aria-pressed={selectable ? isSelected : undefined}
                    onClick={handleSelection}
                  >
                    {optionImage}
                    {optionCopy}
                  </button>
                  <button
                    type="button"
                    className="single-inline-chance"
                    aria-expanded={detailsOpen}
                    onClick={() =>
                      onToggleDisclosure({ itemId: item.id, optionId: option.id, type: 'chance' })
                    }
                  >
                    상세 보기
                    <ChevronDown />
                  </button>
                  {optionPrice}
                </div>
              )
            const optionContents = (
              <>
                {optionImage}
                {optionCopy}
                {optionPrice}
              </>
            )
            const OptionTag = selectable ? 'button' : 'span'
            return (
              <OptionTag
                type={selectable ? 'button' : undefined}
                className={`${selectable ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                aria-pressed={selectable ? isSelected : undefined}
                onClick={handleSelection}
                key={option.id}
              >
                {optionContents}
              </OptionTag>
            )
          })}
        </span>
      ) : (
        <strong>
          {item.exchangeQuantity
            ? `${format(item.exchangeQuantity)}${item.exchangeUnit || '개'}`
            : '--'}
        </strong>
      )}
      <strong className="coin-gold-value">
        {goldPerCoin > 0 || exclusionAffected ? (
          <GoldAmount>{format(goldPerCoin)}</GoldAmount>
        ) : (
          '--'
        )}
      </strong>
      <AnimatedDetails open={Boolean(activeSelectionOption)}>
        {activeSelectionOption && (
          <section className="single-selection-bom">
            <header>
              <div className="single-selection-title">
                {activeSelectionOption.image ? (
                  <img
                    className={gradeClass(activeSelectionOption.grade)}
                    src={activeSelectionOption.image}
                    alt=""
                  />
                ) : (
                  <i>
                    <PackageOpen />
                  </i>
                )}
                <span>
                  <b>{activeSelectionOption.name}</b>
                  <small>
                    받을 아이템을 선택하세요. 기본값은 현재 가치가 가장 높은 아이템입니다.
                  </small>
                </span>
              </div>
              <strong>
                {activeSelectionOption.value == null ? (
                  '--'
                ) : (
                  <GoldAmount>{format(activeSelectionOption.value)}</GoldAmount>
                )}
              </strong>
            </header>
            <div className="single-selection-grid">
              {activeSelectionOption.selectionRewards.map((reward) => {
                const market = marketPrices[reward.marketName]
                const selectedReward = selectedRewardFor(
                  activeSelectionOption,
                  marketPrices,
                  selectedRewardIds[activeSelectionOption.id],
                  excludedGroups,
                )
                const selected = selectedReward?.id === reward.id
                const unitValue = selectionRewardValue(reward, marketPrices, excludedGroups)
                const totalValue =
                  unitValue == null
                    ? null
                    : unitValue * Number(activeSelectionOption.quantity ?? 1) -
                      Number(activeSelectionOption.goldCost || 0)
                return (
                  <button
                    type="button"
                    className={selected ? 'selected' : ''}
                    onClick={() => {
                      onSelectOption(item.id, activeSelectionOption.id)
                      onSelectReward(item.id, activeSelectionOption.id, reward.id)
                    }}
                    key={reward.id}
                  >
                    {market?.icon ? (
                      <img
                        className={gradeClass(market.grade || reward.grade)}
                        src={market.icon}
                        alt=""
                      />
                    ) : reward.image ? (
                      <img className={gradeClass(reward.grade)} src={reward.image} alt="" />
                    ) : (
                      <i>
                        <PackageOpen />
                      </i>
                    )}
                    <span>
                      <b>{reward.name}</b>
                      <small>
                        {format(reward.quantity)}개 선택
                        {unitValue != null && (
                          <>
                            {' '}
                            · 시세 <GoldAmount>{format(unitValue)}</GoldAmount>
                          </>
                        )}
                      </small>
                    </span>
                    <strong>
                      {totalValue == null ? (
                        '--'
                      ) : (
                        <GoldAmount>{format(Math.max(0, totalValue))}</GoldAmount>
                      )}
                    </strong>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </AnimatedDetails>
      <AnimatedDetails open={Boolean(activeChanceOption)}>
        {activeChanceOption && (
          <section className="single-chance-bom">
            <header>
              <div className="single-chance-title">
                {activeChanceOption.resultImage || activeChanceOption.image ? (
                  <img
                    className={gradeClass(
                      activeChanceOption.resultGrade || activeChanceOption.grade,
                    )}
                    src={activeChanceOption.resultImage || activeChanceOption.image}
                    alt=""
                  />
                ) : (
                  <i>
                    <PackageOpen />
                  </i>
                )}
                <span>
                  <b>
                    {activeChanceOption.additionalExchange?.name || activeChanceOption.name}
                    {activeChanceOption.additionalExchange &&
                      ` ${activeChanceOption.additionalExchange.quantity}${activeChanceOption.additionalExchange.unit}`}
                  </b>
                  <small>
                    {activeChanceOption.additionalExchange
                      ? `${activeChanceOption.name} ${activeChanceOption.quantity}${activeChanceOption.unit} 추가 교환`
                      : `${exchangeRatioLabel(item, activeChanceOption)}${exchangeRatioLabel(item, activeChanceOption) ? ' · ' : ''}확률 보상 구성`}
                  </small>
                </span>
              </div>
              <span>
                총 기대값{' '}
                <strong>
                  {activeChanceOption.value == null ? (
                    '--'
                  ) : (
                    <GoldAmount>{format(activeChanceOption.value)}</GoldAmount>
                  )}
                </strong>
              </span>
            </header>
            <div className="single-chance-head">
              <span>획득 아이템</span>
              <span>수량</span>
              <span>등장 확률</span>
              <span>보상 가치</span>
              <span>기대 골드</span>
            </div>
            {activeChanceOption.chanceRewards.map((reward) => {
              const market = marketPrices[reward.marketName]
              const rewardValue = isValueExcluded(reward, excludedGroups)
                ? 0
                : market?.currentMinPrice > 0 && Number(reward.quantity) > 0
                  ? (market.currentMinPrice / Math.max(1, market.bundleCount)) *
                    Number(reward.marketQuantity ?? reward.quantity)
                  : null
              const expectedValue = rewardValue == null ? null : rewardValue * reward.probability
              return (
                <div className="single-chance-row" key={reward.id}>
                  <div>
                    {reward.image ? (
                      <img className={gradeClass(reward.grade)} src={reward.image} alt="" />
                    ) : market?.icon ? (
                      <img className={gradeClass(market.grade)} src={market.icon} alt="" />
                    ) : (
                      <i>
                        <PackageOpen />
                      </i>
                    )}
                    <b>
                      {reward.name}
                      {reward.grade && <em>{reward.grade}</em>}
                    </b>
                  </div>
                  <span>{reward.quantity == null ? '미정' : `${format(reward.quantity)}개`}</span>
                  <span>{format(reward.probability * 100)}%</span>
                  <span>
                    {rewardValue == null ? '--' : <GoldAmount>{format(rewardValue)}</GoldAmount>}
                  </span>
                  <strong>
                    {expectedValue == null ? (
                      '--'
                    ) : (
                      <GoldAmount>{format(expectedValue)}</GoldAmount>
                    )}
                  </strong>
                </div>
              )
            })}
          </section>
        )}
      </AnimatedDetails>
    </div>
  )
}

export default function SingleCoinPage() {
  const [marketPrices, setMarketPrices] = useState({})
  const [marketLoading, setMarketLoading] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState({})
  const [selectedRewards, setSelectedRewards] = useState({})
  const [activeCategory, setActiveCategory] = useState('all')
  const [excludedValueGroups, setExcludedValueGroups] = useState(() => new Set())
  const [activeDisclosure, setActiveDisclosure] = useState(null)
  const [priceRefreshTick, setPriceRefreshTick] = useState(0)
  const rowElements = useRef(new Map())
  const previousRowPositions = useRef(new Map())
  useEffect(() => {
    const timer = window.setInterval(() => setPriceRefreshTick((value) => value + 1), 60000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const names = singleCoinData.categories
      .flatMap((category) => category.items)
      .flatMap((item) => item.exchangeOptions || [])
      .flatMap((option) => [
        option.marketName,
        ...(option.chanceRewards || []).map((reward) => reward.marketName),
        ...(option.selectionRewards || []).map((reward) => reward.marketName),
      ])
      .filter(Boolean)
    if (!names.length) return
    let active = true
    if (priceRefreshTick === 0) setMarketLoading(true)
    const uniqueNames = [...new Set(names)]
    const batches = Array.from({ length: Math.ceil(uniqueNames.length / 30) }, (_, index) =>
      uniqueNames.slice(index * 30, index * 30 + 30),
    )
    Promise.all(batches.map((batch) => lostArkApi.getMarketPrices(batch)))
      .then((results) => {
        if (active) setMarketPrices(Object.assign({}, ...results))
      })
      .catch(() => {
        if (active) setMarketPrices({})
      })
      .finally(() => {
        if (active) setMarketLoading(false)
      })
    return () => {
      active = false
    }
  }, [priceRefreshTick])

  const categoryFilters = [
    { id: 'all', name: '전체' },
    ...singleCoinData.categories.map((category) => ({ id: category.id, name: category.name })),
  ]
  const allItems = singleCoinData.categories.flatMap((category) =>
    category.items.map((item) => ({
      ...item,
      categoryId: category.id,
      categoryName: category.name,
    })),
  )
  const visibleItems = allItems
    .filter((item) => activeCategory === 'all' || item.categoryId === activeCategory)
    .sort((a, b) => {
      const aValue =
        itemGoldValue(
          a,
          marketPrices,
          selectedOptions[a.id],
          selectedRewards[a.id],
          excludedValueGroups,
        ) / Math.max(1, Number(a.coinCost))
      const bValue =
        itemGoldValue(
          b,
          marketPrices,
          selectedOptions[b.id],
          selectedRewards[b.id],
          excludedValueGroups,
        ) / Math.max(1, Number(b.coinCost))
      return bValue - aValue
    })
  const visibleOrderKey = visibleItems.map((item) => item.id).join('|')
  const toggleDisclosure = (next) =>
    setActiveDisclosure((current) => {
      if (!next) return null
      return current?.itemId === next.itemId &&
        current?.optionId === next.optionId &&
        current?.type === next.type
        ? null
        : next
    })
  const toggleValueGroup = (groupId) =>
    setExcludedValueGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const nextPositions = new Map()
    visibleItems.forEach((item) => {
      const element = rowElements.current.get(item.id)
      if (element) nextPositions.set(item.id, element.getBoundingClientRect())
    })
    if (previousRowPositions.current.size) {
      nextPositions.forEach((nextPosition, itemId) => {
        const previousPosition = previousRowPositions.current.get(itemId)
        const element = rowElements.current.get(itemId)
        if (!previousPosition || !element) return
        const deltaY = previousPosition.top - nextPosition.top
        if (reducedMotion || Math.abs(deltaY) < 1) return
        element.getAnimations().forEach((animation) => animation.cancel())
        element.animate(
          [
            {
              transform: `translateY(${deltaY}px)`,
              zIndex: 3,
              boxShadow: '0 10px 26px rgba(83, 58, 170, .22)',
            },
            {
              transform: 'translateY(0)',
              zIndex: 3,
              boxShadow: '0 4px 12px rgba(83, 58, 170, .12)',
              offset: 0.82,
            },
            { transform: 'translateY(0)', zIndex: 1, boxShadow: 'none' },
          ],
          { duration: 620, easing: 'cubic-bezier(.22, 1, .36, 1)' },
        )
        element
          .querySelector('.single-value-rank')
          ?.animate(
            [
              { transform: 'scale(.85)' },
              { transform: 'scale(1.28)', color: '#8d6dff', offset: 0.55 },
              { transform: 'scale(1)' },
            ],
            { duration: 620, easing: 'ease-out' },
          )
      })
    }
    previousRowPositions.current = nextPositions
  }, [visibleOrderKey])

  return (
    <div className="efficiency-page single-coin-page">
      <nav className="efficiency-tabs">
        {toolTabs.map(([path, label]) => (
          <Link className={path === '/single-coin' ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>
      <header className="efficiency-hero">
        <div className="efficiency-hero-icon clear-coin-heading-icon tool-page-art">
          <img src="/images/etc/icon_asset2.png" alt="클리어 코인 효율" />
        </div>
        <div>
          <p>CLEAR COIN EXCHANGE</p>
          <h1>클리어 코인 교환 효율</h1>
          <span>주간 교환 한도와 시세를 기준으로 클리어 코인당 골드 가치를 비교합니다.</span>
        </div>
      </header>

      <div className="single-coin-sections">
        <section className="single-coin-section panel">
          <header>
            <div className="single-section-icon clear-coin-heading-icon tool-page-art">
              <img src="/images/etc/icon_asset2.png" alt="클리어 코인 효율" />
            </div>
            <div>
              <h2>클리어 코인 가치 순위</h2>
              <p>카테고리를 선택해 클리어 코인당 골드 가치를 비교할 수 있습니다.</p>
            </div>
            <span>클리어 코인당 골드 기준</span>
          </header>
          <div
            className="single-category-tabs"
            role="tablist"
            aria-label="클리어 코인 보상 카테고리"
          >
            {categoryFilters.map((category) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                className={activeCategory === category.id ? 'active' : ''}
                onClick={() => {
                  setActiveCategory(category.id)
                  setActiveDisclosure(null)
                }}
                key={category.id}
              >
                {category.name}
                <small>
                  {category.id === 'all'
                    ? allItems.length
                    : allItems.filter((item) => item.categoryId === category.id).length}
                </small>
              </button>
            ))}
          </div>
          <section className="single-value-exclusions" aria-label="가치 제외 재료 설정">
            <header>
              <div>
                <b>가치 제외 설정</b>
                <small>선택한 재료는 모든 상자와 교환 보상에서 가치가 0으로 계산됩니다.</small>
              </div>
              {excludedValueGroups.size > 0 && (
                <button type="button" onClick={() => setExcludedValueGroups(new Set())}>
                  전체 해제
                </button>
              )}
            </header>
            <div>
              {VALUE_EXCLUSION_GROUPS.map((group) => (
                <button
                  type="button"
                  className={excludedValueGroups.has(group.id) ? 'active' : ''}
                  aria-pressed={excludedValueGroups.has(group.id)}
                  onClick={() => toggleValueGroup(group.id)}
                  key={group.id}
                >
                  <i>{excludedValueGroups.has(group.id) ? '✓' : ''}</i>
                  {group.label}
                </button>
              ))}
            </div>
          </section>
          <div className="single-coin-table">
            <div className="single-coin-head">
              <span>순위</span>
              <span>아이템</span>
              <span>클리어 코인</span>
              <span>교환 아이템</span>
              <span>코인 가치</span>
            </div>
            {visibleItems.map((item, index) => (
              <SingleCoinRow
                item={item}
                marketPrices={marketPrices}
                marketLoading={marketLoading}
                excludedGroups={excludedValueGroups}
                selectedOptionId={selectedOptions[item.id]}
                onSelectOption={(itemId, optionId) =>
                  setSelectedOptions((current) => ({ ...current, [itemId]: optionId }))
                }
                selectedRewardIds={selectedRewards[item.id] || {}}
                onSelectReward={(itemId, optionId, rewardId) =>
                  setSelectedRewards((current) => ({
                    ...current,
                    [itemId]: { ...(current[itemId] || {}), [optionId]: rewardId },
                  }))
                }
                rank={index + 1}
                activeDisclosure={activeDisclosure}
                onToggleDisclosure={toggleDisclosure}
                rowRef={(node) => {
                  if (node) rowElements.current.set(item.id, node)
                  else rowElements.current.delete(item.id)
                }}
                key={item.id}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
