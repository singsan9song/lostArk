import { useEffect, useState } from 'react'
import {
  Castle,
  Check,
  ChevronDown,
  Coins,
  Layers3,
  PackageOpen,
  Sparkles,
  Swords,
  TrendingUp,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import raidExtraData from '../data/raid-extra.json'
import singleCoinData from '../data/single-coin.json'
import paradiseData from '../data/paradise-season3.json'
import materialUpgradeData from '../data/material-upgrades.json'
import { lostArkApi } from '../lib/api'
import { getRaidImage } from '../lib/raidImages'
import { efficiencyToolTabs as toolTabs } from '../lib/toolNavigation'
import { GoldAmount } from '../components/GoldIcon'
import '../raid-extra.css'
import '../raid-images.css'

const categoryIcons = {
  'abyss-raid': Sparkles,
  'abyss-dungeon': Castle,
  'legion-raid': Swords,
  'epic-raid': Sparkles,
  'kazeros-raid': Layers3,
  'shadow-raid': Castle,
}
const shardConversions = {
  '운명의 파편': { marketName: '운명의 파편 주머니(대)', contents: 3000 },
  '명예의 파편': { marketName: '명예의 파편 주머니(대)', contents: 1500 },
}
const raidRewardImages = {
  '명예의 파편': '/images/rewards/money_13.png',
}
const raidRewardGrades = {
  '명예의 파편': '일반',
}
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

const collectItemMeta = (value, map = new Map()) => {
  if (Array.isArray(value)) value.forEach((item) => collectItemMeta(item, map))
  else if (value && typeof value === 'object') {
    if (value.name && (value.image || value.grade))
      map.set(value.name, { image: value.image, grade: value.grade })
    if (value.item && (value.image || value.grade))
      map.set(value.item, { image: value.image, grade: value.grade })
    Object.values(value).forEach((item) => collectItemMeta(item, map))
  }
  return map
}
const staticItemMeta = collectItemMeta([singleCoinData, paradiseData])
const marketNameFor = (itemName) => shardConversions[itemName]?.marketName || itemName
const marketAmountFor = (reward) =>
  shardConversions[reward.item]
    ? Number(reward.amount) / shardConversions[reward.item].contents
    : Number(reward.amount)
const upgradePaths = new Map(
  materialUpgradeData.groups.flatMap((group) =>
    group.materials.map((item, index) => [item, { ...group, index }]),
  ),
)
const upgradedReward = (reward, upgradeLevels = {}) => {
  const path = upgradePaths.get(reward.item)
  if (!path) return { ...reward, sourceItem: reward.item, upgradeIndex: 0, maxUpgradeIndex: 0 }
  const targetIndex = Math.min(
    path.materials.length - 1,
    Math.max(path.index, Number(upgradeLevels[reward.item] ?? path.index)),
  )
  const steps = targetIndex - path.index
  return {
    ...reward,
    sourceItem: reward.item,
    item: path.materials[targetIndex],
    amount: Number(reward.amount) / Math.pow(path.ratioPerStep, steps),
    upgradeIndex: targetIndex,
    sourceIndex: path.index,
    maxUpgradeIndex: path.materials.length - 1,
  }
}
const rewardMarketValue = (reward, prices, upgradeLevels) => {
  const valuedReward = upgradedReward(reward, upgradeLevels)
  const market = prices[marketNameFor(valuedReward.item)]
  if (!(market?.currentMinPrice > 0)) return null
  return (
    (market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)) *
    marketAmountFor(valuedReward)
  )
}
const rewardMeta = (reward, prices) => {
  const market = prices[marketNameFor(reward.item)]
  return {
    image: raidRewardImages[reward.item] || staticItemMeta.get(reward.item)?.image || market?.icon,
    grade: raidRewardGrades[reward.item] || staticItemMeta.get(reward.item)?.grade || market?.grade,
  }
}
const gateKey = (raidId, difficultyId, gate) => `${raidId}:${difficultyId}:${gate}`
const selectionKey = (raidKey, difficultyId) => `${raidKey}::${difficultyId}`
const raidEntries = raidExtraData.categories.flatMap((category) =>
  category.raids.map((raid) => ({
    key: `${category.id}:${raid.id}`,
    category,
    raid,
  })),
)

function RewardItem({ reward, prices, loading, upgradeLevels, onUpgrade }) {
  const valuedReward = upgradedReward(reward, upgradeLevels)
  const value = rewardMarketValue(reward, prices, upgradeLevels)
  const meta = rewardMeta(valuedReward, prices)
  const upgradeable =
    upgradePaths.has(reward.item) && valuedReward.sourceIndex < valuedReward.maxUpgradeIndex
  const upgraded = valuedReward.item !== reward.item
  return (
    <div className="raid-reward-item">
      <i className={`raid-reward-icon ${gradeClass(meta.grade)}`}>
        {meta.image ? <img src={meta.image} alt="" /> : <PackageOpen />}
      </i>
      <span>
        <b>{upgraded ? valuedReward.item : reward.item}</b>
        <small>
          {upgraded
            ? `${reward.item} ${format(reward.amount)}개 → ${format(valuedReward.amount)}개`
            : `${format(reward.amount)}개`}
        </small>
      </span>
      {upgradeable && (
        <button
          type="button"
          className={`raid-material-upgrade ${upgraded ? 'active' : ''}`}
          onClick={() => onUpgrade(reward.item)}
        >
          {!upgraded
            ? '업그레이드'
            : valuedReward.upgradeIndex >= valuedReward.maxUpgradeIndex
              ? '원본으로'
              : '다음 승급'}
        </button>
      )}
      <strong>
        {loading ? (
          '조회 중'
        ) : value == null ? (
          '가치 미집계'
        ) : (
          <GoldAmount>{format(value)}</GoldAmount>
        )}
      </strong>
    </div>
  )
}

function RaidSelectionResult({
  entry,
  difficulty,
  prices,
  loading,
  upgradeLevels,
  onUpgrade,
  selectedGates,
  onToggleGate,
  expandedGate,
  onToggleExpanded,
  active,
  onActivate,
  onRemove,
}) {
  const raidImage = getRaidImage(entry.raid.id)
  const gateCalculations = difficulty.gates.map((gate) => {
    const values = (gate.rewards || []).map((reward) =>
      rewardMarketValue(reward, prices, upgradeLevels),
    )
    return {
      gate,
      key: gateKey(entry.key, difficulty.id, gate.gate),
      knownValue: values.reduce((sum, value) => sum + (value || 0), 0),
      unknownCount: values.filter((value) => value == null).length,
    }
  })
  const selectedCalculations = gateCalculations.filter((item) => selectedGates.has(item.key))
  const totalCost = selectedCalculations.reduce(
    (sum, item) => sum + Number(item.gate.extraCost || 0),
    0,
  )
  const totalValue = selectedCalculations.reduce((sum, item) => sum + item.knownValue, 0)
  const totalProfit = totalValue - totalCost
  const unknownCount = selectedCalculations.reduce((sum, item) => sum + item.unknownCount, 0)
  const totalClearGold = difficulty.gates.reduce(
    (sum, gate) => sum + Number(gate.rewardGold || 0),
    0,
  )
  const totalBoundGold = difficulty.gates.reduce(
    (sum, gate) => sum + Number(gate.boundGold || 0),
    0,
  )
  const clearRewards = difficulty.gates.flatMap((gate) => gate.clearRewards || [])
  const valuedClearRewards = clearRewards.filter(
    (reward) => reward.item !== '에스더의 기운' && reward.item !== '클리어 메달',
  )
  const clearRewardValues = valuedClearRewards.map((reward) =>
    rewardMarketValue(reward, prices, upgradeLevels),
  )
  const clearRewardValue = clearRewardValues.reduce((sum, value) => sum + (value || 0), 0)
  const clearRewardUnknownCount = clearRewardValues.filter((value) => value == null).length
  const clearMedalCount = clearRewards
    .filter((reward) => reward.item === '클리어 메달')
    .reduce((sum, reward) => sum + Number(reward.amount || 0), 0)

  return (
    <div className={`raid-result-group ${active ? 'active' : ''}`}>
      <section
        className="raid-overview panel"
        role="button"
        tabIndex="0"
        aria-pressed={active}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onActivate()
          }
        }}
      >
        <div className="raid-overview-name">
          <i className={raidImage ? 'has-image' : ''}>
            {raidImage ? <img src={raidImage} alt="" /> : <Swords />}
          </i>
          <span>
            <small>{entry.category.name}</small>
            <h2>{entry.raid.name}</h2>
            <b>
              <span>{difficulty.name}</span> · 입장 레벨 Lv. {format(difficulty.requiredItemLevel)}
            </b>
          </span>
        </div>
        <div className="raid-overview-stat clear-gold">
          <small>총 클리어 골드</small>
          <strong>
            <GoldAmount>{format(totalClearGold + totalBoundGold)}</GoldAmount>
          </strong>
          <em>
            <span>
              거래 가능 <GoldAmount>{format(totalClearGold)}</GoldAmount>
            </span>
            {totalBoundGold > 0 && (
              <span>
                귀속 <GoldAmount>{format(totalBoundGold)}</GoldAmount>
              </span>
            )}
          </em>
        </div>
        <div className="raid-overview-stat">
          <small>기본 보상 가치</small>
          <strong>{loading ? '--' : <GoldAmount>{format(clearRewardValue)}</GoldAmount>}</strong>
          <em>
            {clearMedalCount > 0 ? `메달 ${format(clearMedalCount)}개` : '메달 없음'}
            {clearRewardUnknownCount > 0 ? ` · ${clearRewardUnknownCount}개 미집계` : ''}
          </em>
        </div>
        <div className="raid-overview-stat">
          <small>선택된 더보기 비용</small>
          <strong>
            <GoldAmount>{format(totalCost)}</GoldAmount>
          </strong>
          <em>
            {selectedCalculations.length}/{difficulty.gates.length}관 선택
          </em>
        </div>
        <div className="raid-overview-stat">
          <small>더보기 보상 가치</small>
          <strong>{loading ? '--' : <GoldAmount>{format(totalValue)}</GoldAmount>}</strong>
          {unknownCount > 0 && <em>{unknownCount}개 가치 미집계</em>}
        </div>
        <div className={`raid-overview-result ${totalProfit >= 0 ? 'positive' : 'negative'}`}>
          <small>더보기 예상 손익</small>
          <strong>
            {loading ? (
              '--'
            ) : (
              <GoldAmount>
                {totalProfit > 0 ? '+' : ''}
                {format(totalProfit)}
              </GoldAmount>
            )}
          </strong>
          <em>
            {totalCost > 0
              ? `효율 ${((totalValue / totalCost) * 100).toFixed(1)}%`
              : '더보기 미선택'}
          </em>
        </div>
        <button
          className="raid-overview-remove"
          type="button"
          aria-label={`${entry.raid.name} ${difficulty.name} 삭제`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <X />
        </button>
      </section>

      {active && (
        <section className="raid-gates-section">
          <header>
            <div>
              <h2>
                {entry.raid.name} · {difficulty.name} 관문별 더보기
              </h2>
              <p>더보기를 구매할 관문만 선택하면 해당 레이드 합계가 즉시 계산됩니다.</p>
            </div>
            <span>
              <TrendingUp />
              거래소 최저가 기준
            </span>
          </header>
          <div className="raid-gate-cards">
            {gateCalculations.map(({ gate, key, knownValue, unknownCount: gateUnknown }) => {
              const selected = selectedGates.has(key)
              const expanded = expandedGate === key
              const profit = knownValue - Number(gate.extraCost || 0)
              return (
                <article
                  className={`raid-gate-card panel ${selected ? 'selected' : ''} ${expanded ? 'expanded' : ''}`}
                  key={key}
                >
                  <div className="raid-gate-summary">
                    <button
                      className="raid-gate-check"
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onToggleGate(key)}
                    >
                      <i>{selected && <Check />}</i>
                      <span>
                        <b>{gate.gate}관문 더보기</b>
                        <small>{selected ? '합산에 포함됨' : '합산에서 제외됨'}</small>
                      </span>
                    </button>
                    <div>
                      <small>더보기 비용</small>
                      <strong>
                        <GoldAmount>{format(gate.extraCost)}</GoldAmount>
                      </strong>
                    </div>
                    <div>
                      <small>더보기 보상 가치</small>
                      <strong>
                        {loading ? '--' : <GoldAmount>{format(knownValue)}</GoldAmount>}
                      </strong>
                      {gateUnknown > 0 && <em>{gateUnknown}개 미집계</em>}
                    </div>
                    <div className={profit >= 0 ? 'positive' : 'negative'}>
                      <small>예상 손익</small>
                      <strong>
                        {loading ? (
                          '--'
                        ) : (
                          <GoldAmount>
                            {profit > 0 ? '+' : ''}
                            {format(profit)}
                          </GoldAmount>
                        )}
                      </strong>
                    </div>
                    <button
                      className="raid-gate-expand"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => onToggleExpanded(key)}
                    >
                      상세 보기
                      <ChevronDown />
                    </button>
                  </div>
                  <div className="raid-gate-detail">
                    <div className="raid-gate-reward-column">
                      <h3>
                        더보기 보상 <small>{gate.rewards?.length || 0}종</small>
                      </h3>
                      {gate.rewards?.length ? (
                        gate.rewards.map((reward, index) => (
                          <RewardItem
                            reward={reward}
                            prices={prices}
                            loading={loading}
                            upgradeLevels={upgradeLevels}
                            onUpgrade={onUpgrade}
                            key={`${reward.item}-${index}`}
                          />
                        ))
                      ) : (
                        <p>등록된 더보기 보상이 없습니다.</p>
                      )}
                    </div>
                    <div className="raid-gate-reward-column clear">
                      <h3>
                        기본 클리어 보상 <small>{gate.clearRewards?.length || 0}종</small>
                      </h3>
                      {gate.clearRewards?.length ? (
                        gate.clearRewards.map((reward, index) => {
                          const excluded = reward.item === '에스더의 기운'
                          const medal = reward.item === '클리어 메달'
                          const value =
                            excluded || medal
                              ? null
                              : rewardMarketValue(reward, prices, upgradeLevels)
                          return (
                            <div className="raid-clear-item" key={`${reward.item}-${index}`}>
                              <span>
                                {medal ? '메달' : reward.item}
                                {excluded && <small>가치 제외</small>}
                              </span>
                              <strong>
                                {format(reward.amount)}개
                                {!excluded && !medal && (
                                  <small>
                                    {loading ? (
                                      '조회 중'
                                    ) : value == null ? (
                                      '미집계'
                                    ) : (
                                      <GoldAmount>{format(value)}</GoldAmount>
                                    )}
                                  </small>
                                )}
                              </strong>
                            </div>
                          )
                        })
                      ) : (
                        <p>등록된 클리어 보상이 없습니다.</p>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

export default function RaidExtraPage() {
  const [categoryId, setCategoryId] = useState(null)
  const [selectedDifficulties, setSelectedDifficulties] = useState(() => new Set())
  const [activeSelection, setActiveSelection] = useState(null)
  const [selectedGates, setSelectedGates] = useState(() => new Set())
  const [expandedGate, setExpandedGate] = useState(null)
  const [marketPrices, setMarketPrices] = useState({})
  const [marketLoading, setMarketLoading] = useState(true)
  const [upgradeLevels, setUpgradeLevels] = useState({})
  const visibleRaidEntries = categoryId
    ? raidEntries.filter((item) => item.category.id === categoryId)
    : raidEntries
  const selectedViews = [...selectedDifficulties]
    .map((key) => {
      const [entryKey, difficultyId] = key.split('::')
      const entry = raidEntries.find((item) => item.key === entryKey)
      const difficulty = entry?.raid.difficulties.find((item) => item.id === difficultyId)
      return entry && difficulty ? { key, entry, difficulty } : null
    })
    .filter(Boolean)

  useEffect(() => {
    const names = raidExtraData.categories
      .flatMap((item) => item.raids)
      .flatMap((item) => item.difficulties)
      .flatMap((item) => item.gates)
      .flatMap((gate) => [...(gate.rewards || []), ...(gate.clearRewards || [])])
      .filter((reward) => reward.item !== '에스더의 기운' && reward.item !== '클리어 메달')
      .map((reward) => marketNameFor(reward.item))
      .concat(materialUpgradeData.groups.flatMap((group) => group.materials.map(marketNameFor)))
    let active = true
    setMarketLoading(true)
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
  }, [])

  const selectCategory = (nextCategory) => {
    if (categoryId === nextCategory.id) {
      setCategoryId(null)
      return
    }
    setCategoryId(nextCategory.id)
  }
  const selectRaid = (nextEntry) => {
    const selectedDifficulty = nextEntry.raid.difficulties.find((item) =>
      selectedDifficulties.has(selectionKey(nextEntry.key, item.id)),
    )
    if (selectedDifficulty) selectRaidDifficulty(nextEntry, selectedDifficulty)
    else selectRaidDifficulty(nextEntry, nextEntry.raid.difficulties[0])
  }
  const selectRaidDifficulty = (nextEntry, nextDifficulty) => {
    const key = selectionKey(nextEntry.key, nextDifficulty.id)
    const gateKeys = nextDifficulty.gates.map((gate) =>
      gateKey(nextEntry.key, nextDifficulty.id, gate.gate),
    )
    const removing = selectedDifficulties.has(key)
    const previousDifficulty = nextEntry.raid.difficulties.find((item) =>
      selectedDifficulties.has(selectionKey(nextEntry.key, item.id)),
    )
    const previousKey = previousDifficulty
      ? selectionKey(nextEntry.key, previousDifficulty.id)
      : null
    const previousGateKeys = previousDifficulty
      ? previousDifficulty.gates.map((gate) =>
          gateKey(nextEntry.key, previousDifficulty.id, gate.gate),
        )
      : []
    setSelectedDifficulties((current) => {
      const next = new Set(current)
      if (previousKey) next.delete(previousKey)
      if (!removing) next.add(key)
      return next
    })
    setSelectedGates((current) => {
      const next = new Set(current)
      previousGateKeys.forEach((gate) => next.delete(gate))
      if (!removing) gateKeys.forEach((gate) => next.add(gate))
      return next
    })
    setExpandedGate(null)
    if (!removing) setActiveSelection(key)
    else if (activeSelection === key) {
      const remaining = [...selectedDifficulties].filter((item) => item !== key)
      setActiveSelection(remaining[0] || null)
    }
  }
  const toggleGate = (key) =>
    setSelectedGates((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const cycleMaterialUpgrade = (itemName) =>
    setUpgradeLevels((current) => {
      const path = upgradePaths.get(itemName)
      if (!path) return current
      const currentIndex = Number(current[itemName] ?? path.index)
      const nextIndex = currentIndex >= path.materials.length - 1 ? path.index : currentIndex + 1
      return { ...current, [itemName]: nextIndex }
    })

  return (
    <div className="efficiency-page raid-extra-page">
      <nav className="efficiency-tabs">
        {toolTabs.map(([path, label]) => (
          <Link className={path === '/raid-extra' ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>
      <header className="efficiency-hero raid-extra-hero">
        <div className="efficiency-hero-icon tool-page-art">
          <img src="/images/etc/icon_asset1.png" alt="레이드 더보기 효율" />
        </div>
        <div>
          <p>RAID EXTRA REWARD</p>
          <h1>레이드 더보기 효율</h1>
          <span>관문별 더보기 비용과 추가 보상의 현재 골드 가치를 비교합니다.</span>
        </div>
      </header>

      <section className="raid-extra-content panel">
        <header className="raid-extra-title">
          <div>
            <span>
              <Layers3 />
            </span>
            <div>
              <h2>레이드 선택</h2>
              <p>
                카테고리를 선택하지 않으면 모든 레이드가 표시됩니다. 선택된 카테고리를 다시 누르면
                해제됩니다.
              </p>
            </div>
          </div>
        </header>
        <div className="raid-category-tabs" role="tablist" aria-label="레이드 카테고리">
          {raidExtraData.categories.map((item) => {
            const Icon = categoryIcons[item.id] || Swords
            return (
              <button
                type="button"
                role="tab"
                aria-selected={categoryId === item.id}
                className={categoryId === item.id ? 'active' : ''}
                onClick={() => selectCategory(item)}
                key={item.id}
              >
                <Icon />
                <span>{item.name}</span>
                <small>{item.raids.length}</small>
              </button>
            )
          })}
        </div>
        <div className="raid-card-grid" key={categoryId || 'all'}>
          {visibleRaidEntries.map((entry) => {
            const item = entry.raid
            const raidImage = getRaidImage(item.id)
            const activeRaid = item.difficulties.some((itemDifficulty) =>
              selectedDifficulties.has(selectionKey(entry.key, itemDifficulty.id)),
            )
            return (
              <article
                className={`raid-select-card ${activeRaid ? 'active' : ''} ${raidImage ? 'has-image' : ''}`}
                style={raidImage ? { '--raid-image': `url(${raidImage})` } : undefined}
                key={entry.key}
              >
                <button
                  type="button"
                  className="raid-select-main"
                  onClick={() => selectRaid(entry)}
                  aria-label={`${item.name} 선택`}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{entry.category.name}</small>
                  </span>
                </button>
                <div className="raid-select-difficulties">
                  {item.difficulties.map((itemDifficulty) => {
                    const selected = selectedDifficulties.has(
                      selectionKey(entry.key, itemDifficulty.id),
                    )
                    return (
                      <button
                        type="button"
                        className={selected ? 'active' : ''}
                        onClick={() => selectRaidDifficulty(entry, itemDifficulty)}
                        key={itemDifficulty.id}
                      >
                        <span>{itemDifficulty.name}</span>
                        <small>Lv. {format(itemDifficulty.requiredItemLevel)}</small>
                      </button>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {selectedViews.length ? (
        selectedViews.map((view) => (
          <RaidSelectionResult
            entry={view.entry}
            difficulty={view.difficulty}
            prices={marketPrices}
            loading={marketLoading}
            upgradeLevels={upgradeLevels}
            onUpgrade={cycleMaterialUpgrade}
            selectedGates={selectedGates}
            onToggleGate={toggleGate}
            expandedGate={expandedGate}
            onToggleExpanded={(key) => setExpandedGate((current) => (current === key ? null : key))}
            active={activeSelection === view.key}
            onActivate={() =>
              setActiveSelection((current) => (current === view.key ? null : view.key))
            }
            onRemove={() => selectRaidDifficulty(view.entry, view.difficulty)}
            key={view.key}
          />
        ))
      ) : (
        <section className="raid-empty-selection panel">
          <Swords />
          <h2>레이드를 선택하세요</h2>
          <p>위 카드에서 확인할 난이도를 선택하면 관문별 더보기 효율이 표시됩니다.</p>
        </section>
      )}
    </div>
  )
}
