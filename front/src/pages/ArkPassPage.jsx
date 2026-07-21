import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Crown, Gift, LockKeyhole, PackageOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import arkPassData from '../data/ark-pass.json'
import arkPassBoxes from '../data/ark-pass-boxes.json'
import arkPassBundles from '../data/ark-pass-bundles.json'
import arkPassRewardMappings from '../data/ark-pass-reward-mappings.json'
import arkPassGemBoxProbabilities from '../data/ark-pass-gem-box-probabilities.json'
import pheonData from '../data/pheon-costs.json'
import { lostArkApi } from '../lib/api'
import { efficiencyToolTabs as toolTabs } from '../lib/toolNavigation'
import CrystalIcon from '../components/CrystalIcon'
import AbilityStoneConfigurationSelect from '../components/AbilityStoneConfigurationSelect'
import { GoldAmount } from '../components/GoldIcon'
import { useCrystalGoldPrice } from '../lib/crystalRate'
import {
  getSharedAbilityStoneValue,
  resolveAbilityStoneConfiguration,
  storedAbilityStoneConfigurationId,
  storeAbilityStoneConfigurationId,
} from '../lib/sharedRewardValues'
import '../ark-pass.css'

const tracks = [
  ['achievement', '달성 보상'],
  ['premium', '프리미엄 보상'],
  ['superPremium', '슈퍼 프리미엄 보상'],
]
const formatGold = (value) =>
  Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
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
const marketNameFor = (reward) => reward.marketName || reward.name.replace(/\s*\(패스\)\s*$/, '')
const marketUnitValue = (market) =>
  market?.currentMinPrice > 0
    ? market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)
    : null
const boxItemValue = (item, marketPrices) => {
  const unitValue = marketUnitValue(marketPrices[item.marketName])
  return unitValue == null ? null : unitValue * Number(item.quantity || 1)
}
const recommendedBoxItem = (definition, marketPrices) =>
  definition?.items
    .map((item) => ({ item, value: boxItemValue(item, marketPrices) }))
    .filter((option) => option.value != null)
    .sort((a, b) => b.value - a.value)[0]?.item
const arkPassGemMarketNames = () =>
  Object.values(arkPassGemBoxProbabilities.boxes)
    .filter((box) => box.mode === 'direct')
    .flatMap((box) => arkPassGemBoxProbabilities.gemTypes.map((gem) => `${gem.name}|${box.grade}`))
const arkPassGemBoxValue = (boxName, marketPrices, visited = new Set()) => {
  const box = arkPassGemBoxProbabilities.boxes[boxName]
  if (!box || visited.has(boxName)) return null
  if (box.mode === 'direct') {
    const values = arkPassGemBoxProbabilities.gemTypes.map((gem) => {
      const unitValue = marketUnitValue(marketPrices[`${gem.name}|${box.grade}`])
      return unitValue == null
        ? null
        : unitValue * Number(gem.probability || 0) * Number(box.quantity || 1)
    })
    return values.some((value) => value == null)
      ? null
      : values.reduce((sum, value) => sum + value, 0)
  }
  const nextVisited = new Set(visited).add(boxName)
  const values = (box.outcomes || []).map((outcome) => {
    const value = arkPassGemBoxValue(outcome.boxName, marketPrices, nextVisited)
    return value == null
      ? null
      : value * Number(outcome.quantity || 1) * Number(outcome.probability || 0)
  })
  return values.some((value) => value == null)
    ? null
    : values.reduce((sum, value) => sum + value, 0)
}
const rewardBundleComponent = (reward) =>
  Object.values(arkPassBundles)
    .map((bundle) => ({
      bundle,
      component: bundle.packageContents.find((item) => item.rewardName === reward.name),
    }))
    .find((entry) => entry.component)
const bundledRewardValue = (reward, crystalGoldPrice) => {
  const entry = rewardBundleComponent(reward)
  if (!entry) return null
  const conversion = entry.bundle.valuation
  const packageCrystals =
    (Number(conversion.packageRoyalCrystals || 0) /
      Number(conversion.royalCrystalsPerConversion || 1)) *
    Number(conversion.crystalsPerConversion || 0)
  const totalRelativeValue = entry.bundle.packageContents.reduce(
    (total, component) =>
      total + Number(component.quantity || 0) * Number(component.relativeUnitValue || 0),
    0,
  )
  const unitCrystals =
    totalRelativeValue > 0
      ? (packageCrystals * Number(entry.component.relativeUnitValue || 0)) / totalRelativeValue
      : 0
  return (unitCrystals * Number(reward.quantity || 1) * crystalGoldPrice) / 100
}
const rewardImageFor = (reward) => {
  if (reward.image) return reward.image
  return arkPassRewardMappings[reward.name]?.image || arkPassBoxes[reward.name]?.image || null
}

const mariFallbackGoldValue = (reward, mariLowestUnitPrices, crystalGoldPrice) => {
  const lowestUnitCrystalPrice = mariLowestUnitPrices[reward.name]
  if (!(lowestUnitCrystalPrice > 0)) return null
  return (lowestUnitCrystalPrice * Number(reward.quantity || 1) * crystalGoldPrice) / 100
}

const rewardGoldValue = (
  reward,
  marketPrices,
  crystalGoldPrice,
  abilityStonePrice,
  selectedGemMarketName,
  mariLowestUnitPrices = {},
) => {
  if (Number.isFinite(reward.fixedGoldValuePerItem))
    return Number(reward.fixedGoldValuePerItem) * Number(reward.quantity || 1)
  if (rewardBundleComponent(reward)) return bundledRewardValue(reward, crystalGoldPrice)
  const mapping = arkPassRewardMappings[reward.name]
  if (mapping?.valuation?.type === 'pheon') {
    return (
      (Number(reward.quantity || 0) *
        pheonData.goldConversion.crystalsPerPheon *
        crystalGoldPrice) /
      100
    )
  }
  if (mapping?.valuation?.type === 'crystal') {
    return (
      (Number(mapping.valuation.crystalsPerBox || 0) *
        Number(reward.quantity || 1) *
        crystalGoldPrice) /
      100
    )
  }
  if (mapping?.valuation?.type === 'fixedCrystal') {
    return (
      (Number(mapping.valuation.crystalsPerItem || 0) *
        Number(reward.quantity || 1) *
        crystalGoldPrice) /
      100
    )
  }
  if (mapping?.valuation?.type === 'fixedGold') {
    return Number(mapping.valuation.goldPerItem || 0) * Number(reward.quantity || 1)
  }
  if (mapping?.valuation?.type === 'abilityStoneAuction') {
    return abilityStonePrice > 0
      ? abilityStonePrice *
          Number(mapping.valuation.itemsPerBox || 0) *
          Number(reward.quantity || 1)
      : null
  }
  if (mapping?.valuation?.type === 'timedCrystalServices') {
    const crystalsPerReward = (mapping.contents || []).reduce((total, item) => {
      const priceDurationDays = Number(item.priceDurationDays || 0)
      if (priceDurationDays <= 0) return total
      return (
        total +
        (Number(item.quantity || 1) *
          Number(item.durationDays || 0) *
          Number(item.priceCrystals || 0)) /
          priceDurationDays
      )
    }, 0)
    return (crystalsPerReward * Number(reward.quantity || 1) * crystalGoldPrice) / 100
  }
  const probabilityGemBoxValue = arkPassGemBoxValue(reward.name, marketPrices)
  if (probabilityGemBoxValue != null) return probabilityGemBoxValue * Number(reward.quantity || 1)
  const boxDefinition = arkPassBoxes[reward.name]
  if (boxDefinition) {
    if (boxDefinition.mode === 'choice') {
      const selectedItem =
        boxDefinition.items.find((item) => item.marketName === selectedGemMarketName) ||
        recommendedBoxItem(boxDefinition, marketPrices)
      const value = selectedItem ? boxItemValue(selectedItem, marketPrices) : null
      return value == null ? null : value * Number(reward.quantity || 1)
    }
    const values = boxDefinition.items.map((item) => boxItemValue(item, marketPrices))
    return values.some((value) => value == null)
      ? null
      : values.reduce((sum, value) => sum + value, 0) * Number(reward.quantity || 1)
  }
  if (reward.marketName) {
    const market = marketPrices[marketNameFor(reward)]
    if (market?.currentMinPrice > 0) {
      return (
        (market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)) *
        Number(reward.marketQuantity ?? reward.quantity ?? 1)
      )
    }
  }
  return mariFallbackGoldValue(reward, mariLowestUnitPrices, crystalGoldPrice)
}

const recommendedReward = (
  group,
  marketPrices,
  crystalGoldPrice,
  abilityStonePrice,
  mariLowestUnitPrices,
) =>
  group.rewards
    .map((reward) => ({
      reward,
      value: rewardGoldValue(
        reward,
        marketPrices,
        crystalGoldPrice,
        abilityStonePrice,
        null,
        mariLowestUnitPrices,
      ),
    }))
    .filter((item) => item.value != null)
    .sort((a, b) => b.value - a.value)[0]?.reward

function RewardOption({
  reward,
  market,
  selected,
  recommended,
  selectable,
  onSelect,
  goldValue,
  valuePrefix,
  loading,
  embeddedControl,
}) {
  const image = rewardImageFor(reward) || market?.icon
  const iconGrade = gradeClass(
    reward.grade ||
      arkPassRewardMappings[reward.name]?.grade ||
      arkPassBoxes[reward.name]?.grade ||
      market?.grade,
  )
  const bundled = Boolean(rewardBundleComponent(reward))
  const probabilityGemBox = Boolean(arkPassGemBoxProbabilities.boxes[reward.name])
  const className = `ark-pass-reward ${selected ? 'selected' : ''} ${selectable ? 'selectable' : ''} ${embeddedControl ? 'with-control' : ''}`
  const contents = (
    <>
      <i className={iconGrade}>{image ? <img src={image} alt="" /> : <PackageOpen />}</i>
      <span>
        <b>
          {reward.name.startsWith('크리스탈 ') ? (
            <>
              <CrystalIcon /> {reward.name.replace(/^크리스탈\s*/, '')}
            </>
          ) : (
            reward.name
          )}
        </b>
        <small>× {reward.quantity.toLocaleString('ko-KR')}</small>
        <strong>
          {loading && goldValue == null ? (
            '조회 중'
          ) : goldValue == null ? (
            '가치 미집계'
          ) : (
            <GoldAmount>
              {valuePrefix || (probabilityGemBox ? '기대 ' : bundled ? '추정 ' : '')}
              {formatGold(goldValue)}
            </GoldAmount>
          )}
        </strong>
      </span>
      {recommended && selectable && (
        <em className="ark-pass-recommend">
          <Sparkles />
          추천
        </em>
      )}
      {selected && selectable && (
        <em>
          <Check />
          선택됨
        </em>
      )}
    </>
  )
  if (embeddedControl)
    return (
      <div className={className}>
        <button
          type="button"
          className="ark-pass-reward-hit"
          aria-label={`${reward.name} 선택`}
          aria-pressed={selected}
          onClick={onSelect}
        />
        {contents}
        <div className="ark-pass-reward-control" onPointerDown={onSelect}>
          {embeddedControl}
        </div>
      </div>
    )
  return (
    <button
      type="button"
      className={className}
      onClick={selectable ? onSelect : undefined}
      disabled={!selectable}
    >
      {contents}
    </button>
  )
}

function RewardCell({
  level,
  track,
  group,
  selectedRewardId,
  onSelect,
  marketPrices,
  mariLowestUnitPrices,
  crystalGoldPrice,
  abilityStonePrice,
  abilityStoneValue,
  selectedAbilityStoneConfigurationId,
  onSelectAbilityStoneConfiguration,
  loading,
  selectedGemMarketName,
  onSelectGem,
}) {
  const choice = group.type === 'choice' && group.rewards.length > 1
  const recommended = choice
    ? recommendedReward(
        group,
        marketPrices,
        crystalGoldPrice,
        abilityStonePrice,
        mariLowestUnitPrices,
      )
    : null
  const resolvedSelectedId = selectedRewardId || recommended?.id || group.rewards[0]?.id
  const skyBoxReward = group.rewards.find((reward) => arkPassBoxes[reward.name]?.mode === 'choice')
  const abilityStoneReward = group.rewards.find(
    (reward) => arkPassRewardMappings[reward.name]?.valuation?.type === 'abilityStoneAuction',
  )
  const skyBoxDefinition = skyBoxReward ? arkPassBoxes[skyBoxReward.name] : null
  const recommendedSkyBoxItem = recommendedBoxItem(skyBoxDefinition, marketPrices)
  const resolvedSkyBoxMarketName = selectedGemMarketName || recommendedSkyBoxItem?.marketName
  const stackedChoice = Boolean(skyBoxReward && abilityStoneReward)
  if (!group.rewards.length)
    return (
      <div className="ark-pass-empty">
        <LockKeyhole />
        <span>보상 없음</span>
      </div>
    )
  return (
    <div
      className={`ark-pass-reward-cell ${choice ? 'choice' : ''} ${skyBoxReward || abilityStoneReward ? 'has-gem-choice' : ''} ${stackedChoice ? 'stacked-choice' : ''}`}
    >
      {choice && <small className="ark-pass-choice-label">1개 선택</small>}
      <div className="ark-pass-reward-options">
        {group.rewards.map((reward, index) => {
          const isSkyBox = reward === skyBoxReward
          const isAbilityStone = reward === abilityStoneReward
          const selectThisReward = () => onSelect(`${level}:${track}`, reward.id)
          const embeddedControl = isSkyBox ? (
            <label className="ark-pass-embedded-select">
              <span>획득 젬 선택</span>
              <select
                value={resolvedSkyBoxMarketName || ''}
                onChange={(event) => {
                  selectThisReward()
                  onSelectGem(skyBoxReward.id, event.target.value)
                }}
              >
                {skyBoxDefinition.items.map((item) => {
                  const value = boxItemValue(item, marketPrices)
                  const boxCount = Number(skyBoxReward.quantity || 1)
                  return (
                    <option value={item.marketName} key={item.id}>
                      {item.name} ×{item.quantity * boxCount} ·{' '}
                      {value == null ? '--' : formatGold(value * boxCount)}
                      {recommendedSkyBoxItem?.id === item.id ? ' (추천)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          ) : isAbilityStone ? (
            <AbilityStoneConfigurationSelect
              data={abilityStoneValue}
              loading={!abilityStoneValue}
              selectedId={selectedAbilityStoneConfigurationId}
              onSelect={(id) => {
                selectThisReward()
                onSelectAbilityStoneConfiguration(id)
              }}
            />
          ) : null
          const selectedGemName = reward === skyBoxReward ? resolvedSkyBoxMarketName : null
          const regularGoldValue = rewardGoldValue(
            reward,
            marketPrices,
            crystalGoldPrice,
            abilityStonePrice,
            selectedGemName,
          )
          const mariGoldValue =
            regularGoldValue == null
              ? mariFallbackGoldValue(reward, mariLowestUnitPrices, crystalGoldPrice)
              : null
          return (
            <RewardOption
              reward={reward}
              market={reward.marketName ? marketPrices[marketNameFor(reward)] : null}
              selectable={choice}
              selected={choice ? resolvedSelectedId === reward.id : false}
              recommended={recommended?.id === reward.id}
              goldValue={regularGoldValue ?? mariGoldValue}
              valuePrefix={mariGoldValue != null ? '마리 최저 ' : ''}
              loading={loading}
              onSelect={selectThisReward}
              embeddedControl={embeddedControl}
              key={reward.id || index}
            />
          )
        })}
      </div>
    </div>
  )
}

export default function ArkPassPage() {
  const [selectedRewards, setSelectedRewards] = useState({})
  const [marketPrices, setMarketPrices] = useState({})
  const [marketLoading, setMarketLoading] = useState(true)
  const [mariLowestUnitPrices, setMariLowestUnitPrices] = useState({})
  const [mariLoading, setMariLoading] = useState(true)
  const [abilityStoneValue, setAbilityStoneValue] = useState(null)
  const [abilityStoneLoading, setAbilityStoneLoading] = useState(true)
  const [abilityStoneConfigurationId, setAbilityStoneConfigurationId] = useState(
    storedAbilityStoneConfigurationId,
  )
  const [selectedGemRewards, setSelectedGemRewards] = useState({})
  const [draggingLevels, setDraggingLevels] = useState(false)
  const levelScrollRef = useRef(null)
  const levelDragRef = useRef(null)
  const crystalGoldPrice = useCrystalGoldPrice()
  const selectReward = (groupKey, rewardId) =>
    setSelectedRewards((current) => ({ ...current, [groupKey]: rewardId }))
  const choiceCount = arkPassData.levels.reduce(
    (count, level) => count + tracks.filter(([track]) => level[track]?.type === 'choice').length,
    0,
  )

  useEffect(() => {
    const names = [
      ...new Set(
        arkPassData.levels
          .flatMap((level) => tracks.flatMap(([track]) => level[track].rewards))
          .filter((reward) => reward.marketName)
          .map(marketNameFor)
          .concat(
            Object.values(arkPassBoxes).flatMap((definition) =>
              definition.items.map((item) => item.marketName),
            ),
            arkPassGemMarketNames(),
          ),
      ),
    ]
    const batches = Array.from({ length: Math.ceil(names.length / 30) }, (_, index) =>
      names.slice(index * 30, index * 30 + 30),
    )
    let active = true
    setMarketLoading(true)
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
  }, [])

  useEffect(() => {
    let active = true
    setMariLoading(true)
    lostArkApi
      .getMariShop()
      .then((data) => {
        if (!active) return
        const rotations =
          data?.rotations || (data?.products?.length ? [{ products: data.products }] : [])
        const lowestByExactName = Object.fromEntries(
          Object.entries(data?.historicalLowestUnitCrystalPrices || {})
            .filter(([, unitPrice]) => Number(unitPrice) > 0)
            .map(([name, unitPrice]) => [name, Number(unitPrice)]),
        )
        rotations
          .flatMap((rotation) => rotation.products || [])
          .forEach((product) => {
            const name = String(product.name || '')
            const unitPrice = Number(product.historicalLowestUnitCrystalPrice)
            if (!name || !(unitPrice > 0)) return
            lowestByExactName[name] =
              lowestByExactName[name] == null
                ? unitPrice
                : Math.min(lowestByExactName[name], unitPrice)
          })
        setMariLowestUnitPrices(lowestByExactName)
      })
      .catch(() => {
        if (active) setMariLowestUnitPrices({})
      })
      .finally(() => {
        if (active) setMariLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setAbilityStoneLoading(true)
    getSharedAbilityStoneValue()
      .then((data) => {
        if (active) setAbilityStoneValue(data)
      })
      .catch(() => {
        if (active) setAbilityStoneValue(null)
      })
      .finally(() => {
        if (active) setAbilityStoneLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedAbilityStoneConfiguration = useMemo(
    () => resolveAbilityStoneConfiguration(abilityStoneValue, abilityStoneConfigurationId),
    [abilityStoneValue, abilityStoneConfigurationId],
  )
  const abilityStonePrice = Number(selectedAbilityStoneConfiguration?.currentMinPrice) || 0
  const selectAbilityStoneConfiguration = (id) => {
    setAbilityStoneConfigurationId(id)
    storeAbilityStoneConfigurationId(id)
  }

  const startLevelDrag = (event) => {
    if (event.button !== 0 || event.target.closest('button, input, select, label, a')) return
    levelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveLevelDrag = (event) => {
    const drag = levelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const distance = event.clientX - drag.startX
    if (!drag.moved && Math.abs(distance) < 4) return
    drag.moved = true
    setDraggingLevels(true)
    event.currentTarget.scrollLeft = drag.scrollLeft - distance
    event.preventDefault()
  }

  const endLevelDrag = (event) => {
    const drag = levelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    levelDragRef.current = null
    setDraggingLevels(false)
  }

  const trackValues = useMemo(
    () =>
      Object.fromEntries(
        tracks.map(([track]) => {
          let total = 0
          let unknown = 0
          let known = 0
          arkPassData.levels.forEach((level) => {
            const group = level[track]
            if (!group.rewards.length) return
            const rewards =
              group.type === 'choice'
                ? [
                    group.rewards.find(
                      (reward) => reward.id === selectedRewards[`${level.level}:${track}`],
                    ) ||
                      recommendedReward(
                        group,
                        marketPrices,
                        crystalGoldPrice,
                        abilityStonePrice,
                        mariLowestUnitPrices,
                      ) ||
                      group.rewards[0],
                  ]
                : group.rewards
            rewards.forEach((reward) => {
              const value = rewardGoldValue(
                reward,
                marketPrices,
                crystalGoldPrice,
                abilityStonePrice,
                selectedGemRewards[reward.id],
                mariLowestUnitPrices,
              )
              if (value == null) unknown += 1
              else {
                total += value
                known += 1
              }
            })
          })
          return [track, { total, unknown, known }]
        }),
      ),
    [
      marketPrices,
      mariLowestUnitPrices,
      selectedRewards,
      selectedGemRewards,
      crystalGoldPrice,
      abilityStonePrice,
    ],
  )

  return (
    <div className="efficiency-page ark-pass-page">
      <nav className="efficiency-tabs">
        {toolTabs.map(([path, label]) => (
          <Link className={path === '/ark-pass' ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>
      <header className="efficiency-hero ark-pass-hero">
        <div className="efficiency-hero-icon tool-page-art">
          <img src="/images/etc/icon_asset3.png" alt="아크 패스 효율" />
        </div>
        <div>
          <p>ARK PASS REWARD</p>
          <h1>아크 패스 효율</h1>
          <span>레벨별 무료·프리미엄 보상을 선택하고 전체 획득 가치를 비교합니다.</span>
        </div>
      </header>

      <section className="ark-pass-panel panel">
        <header>
          <div>
            <i>
              <Gift />
            </i>
            <span>
              <h2>{arkPassData.name} 보상</h2>
              <p>보상이 여러 개인 달성 칸에서는 받을 보상 하나를 선택하세요.</p>
            </span>
          </div>
          <div>
            <span>
              <small>등록 레벨</small>
              <b>{arkPassData.levels.length}</b>
            </span>
            <span>
              <small>선택 보상</small>
              <b>{choiceCount}</b>
            </span>
          </div>
        </header>
        <div className="ark-pass-table">
          <div
            className={`ark-pass-level-scroll ${draggingLevels ? 'dragging' : ''}`}
            ref={levelScrollRef}
            onPointerDown={startLevelDrag}
            onPointerMove={moveLevelDrag}
            onPointerUp={endLevelDrag}
            onPointerCancel={endLevelDrag}
          >
            <div
              className="ark-pass-matrix"
              style={{ '--ark-pass-level-count': arkPassData.levels.length }}
            >
              <div className="ark-pass-matrix-corner">
                <span>패스 레벨</span>
                <b>보상 구분</b>
              </div>
              {arkPassData.levels.map((level) => (
                <strong className="ark-pass-level-heading" key={`level-${level.level}`}>
                  Lv. {level.level}
                </strong>
              ))}
              {tracks.map(([track, label], trackIndex) => (
                <div className="ark-pass-track-row" key={track}>
                  <div className="ark-pass-track-heading">
                    {trackIndex === 0 ? <Gift /> : trackIndex === 1 ? <Crown /> : <Sparkles />}
                    <span>
                      <b>{label}</b>
                      {track === 'achievement' && <small>1개 선택 보상 포함</small>}
                    </span>
                  </div>
                  {arkPassData.levels.map((level) => (
                    <RewardCell
                      level={level.level}
                      track={track}
                      group={level[track]}
                      selectedRewardId={selectedRewards[`${level.level}:${track}`]}
                      onSelect={selectReward}
                      marketPrices={marketPrices}
                      mariLowestUnitPrices={mariLowestUnitPrices}
                      crystalGoldPrice={crystalGoldPrice}
                      abilityStonePrice={abilityStonePrice}
                      abilityStoneValue={abilityStoneValue}
                      selectedAbilityStoneConfigurationId={selectedAbilityStoneConfiguration?.id}
                      onSelectAbilityStoneConfiguration={selectAbilityStoneConfiguration}
                      loading={marketLoading || abilityStoneLoading || mariLoading}
                      selectedGemMarketName={
                        selectedGemRewards[
                          level[track].rewards.find(
                            (reward) => arkPassBoxes[reward.name]?.mode === 'choice',
                          )?.id
                        ]
                      }
                      onSelectGem={(rewardId, marketName) =>
                        setSelectedGemRewards((current) => ({ ...current, [rewardId]: marketName }))
                      }
                      key={`${track}-${level.level}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="ark-pass-totals">
          {tracks.map(([track, label]) => (
            <article key={track}>
              <span>
                <small>{label} 선택 기준</small>
                <b>
                  {marketLoading || mariLoading ? (
                    '계산 중'
                  ) : trackValues[track].known ? (
                    <GoldAmount>{formatGold(trackValues[track].total)}</GoldAmount>
                  ) : (
                    '--'
                  )}
                </b>
              </span>
              <em>
                {trackValues[track].unknown
                  ? `확인된 가치 · ${trackValues[track].unknown}개 보상 미집계`
                  : '모든 보상 집계 완료'}
              </em>
            </article>
          ))}
        </footer>
      </section>
    </div>
  )
}
