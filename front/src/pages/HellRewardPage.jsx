import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Crown, KeyRound, Layers3, PackageOpen, Skull, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import '../hell-reward.css'
import '../hell-reward-data.css'
import paradiseData from '../data/paradise-season3.json'
import pheonData from '../data/pheon-costs.json'
import { lostArkApi } from '../lib/api'
import { efficiencyToolTabs as toolTabs } from '../lib/toolNavigation'
import { useCrystalGoldPrice } from '../lib/crystalRate'
import { getSharedAbilityStoneValue, storedAbilityStoneConfigurationId, storeAbilityStoneConfigurationId } from '../lib/sharedRewardValues'
import { GoldAmount } from '../components/GoldIcon'
import { setLocalData } from '../lib/localData'
import AbilityStoneConfigurationSelect from '../components/AbilityStoneConfigurationSelect'

const keyLevels = [1640, 1700, 1730, 1750]
const clearStages = Array.from({ length: 11 }, (_, index) => index)
const rewardPlaceholders = Array.from({ length: 8 }, (_, index) => index + 1)
const rewardGradeClass = grade => ({ 고대: 'ancient', 유물: 'relic', 전설: 'legendary', 영웅: 'epic', 희귀: 'rare', 고급: 'uncommon', 일반: 'common' }[grade] || '')
const stageValue = (value, stage) => Array.isArray(value) ? value[stage] ?? 0 : value ?? 0
const crystalsPerPheon = pheonData.goldConversion.crystalsPerPheon

function BraceletValueBreakdown({ open, onToggle, loading, data, formatGold }) {
  return <section className={`bracelet-value-breakdown ${open ? 'open' : ''}`}>
    <button className="bracelet-value-toggle" type="button" onClick={onToggle} aria-expanded={open}>
      <span><strong>유효 옵션 기대 가치</strong><small>1개 기준 · 경매장 표본 상하위 20% 제외</small></span>
      <span className="bracelet-value-summary"><b>{data?.expectedValue > 0 ? <GoldAmount>{formatGold(data.expectedValue)}</GoldAmount> : '--'}</b><ChevronDown /></span>
    </button>
    {open && <div className="bracelet-value-content">{loading ? <p>경매장 표본 가격을 계산하고 있습니다.</p> : data?.optionPairs?.length ? <>
      <div className="bracelet-value-head"><span>유효 옵션</span><span>등장 확률</span><span>절사 평균가</span><span>기대 가치</span></div>
      {data.optionPairs.map(pair => <div className="bracelet-value-row" key={pair.id}><strong>{pair.name}</strong><span>{pair.probability.toFixed(4)}</span><span><GoldAmount>{formatGold(pair.trimmedMeanPrice)}</GoldAmount></span><b><GoldAmount>{formatGold(pair.expectedValue)}</GoldAmount></b></div>)}
      <div className="bracelet-value-total"><span>유효 옵션 기대 가치 합계</span><strong><GoldAmount>{formatGold(data.expectedValue)}</GoldAmount></strong></div>
    </> : <p>경매장 표본을 불러오지 못했습니다.</p>}</div>}
  </section>
}

export default function HellRewardPage() {
  const [keyType, setKeyType] = useState('hell')
  const [keyLevel, setKeyLevel] = useState(1640)
  const [stage, setStage] = useState(0)
  const [marketPrices, setMarketPrices] = useState({})
  const [marketLoading, setMarketLoading] = useState(false)
  const [priceRefreshTick, setPriceRefreshTick] = useState(0)
  const [braceletValue, setBraceletValue] = useState(null)
  const [braceletLoading, setBraceletLoading] = useState(false)
  const [relicBraceletValue, setRelicBraceletValue] = useState(null)
  const [relicBraceletLoading, setRelicBraceletLoading] = useState(false)
  const [abilityStoneValue, setAbilityStoneValue] = useState(null)
  const [abilityStoneLoading, setAbilityStoneLoading] = useState(false)
  const [abilityStoneConfigurationId, setAbilityStoneConfigurationId] = useState(storedAbilityStoneConfigurationId)
  const [expandedRewards, setExpandedRewards] = useState(() => new Set())
  const [expandedBraceletValues, setExpandedBraceletValues] = useState(() => new Set())
  const [abundanceRewards, setAbundanceRewards] = useState(() => new Set())
  const [selectedOptions, setSelectedOptions] = useState({})
  const [includeBasicRewards, setIncludeBasicRewards] = useState(false)
  const [includePheonCost, setIncludePheonCost] = useState(() => localStorage.getItem('loark.includePheonCost') === 'true')
  const crystalGoldPrice = useCrystalGoldPrice()
  const rewardNodes = useRef(new Map())
  const previousRewardLayout = useRef(new Map())
  useEffect(() => {
    const timer = window.setInterval(() => setPriceRefreshTick(value => value + 1), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const selectedAbilityStoneConfiguration = useMemo(() => {
    const configurations = abilityStoneValue?.configurations || []
    return configurations.find(configuration => configuration.id === abilityStoneConfigurationId)
      || configurations.find(configuration => configuration.id === abilityStoneValue?.selectedConfigurationId)
      || configurations[0]
  }, [abilityStoneValue, abilityStoneConfigurationId])
  const rewardData = useMemo(() => {
    const level = paradiseData.keyTypes[keyType]?.levels?.[keyLevel]
    if (!level) return null
    const definitions = paradiseData.rewardDefinitions || {}
    const basicRewards = (level.basicRewards || []).map(entry => {
      const definition = definitions[entry.definitionId] || {}
      return { ...definition, id: entry.rewardId || definition.id, quantity: stageValue(entry.quantities, stage) }
    })
    const choiceRewards = (level.choiceRewards || []).map(entry => {
      const stagedEntry = entry.stageEntries?.[stage]
      const activeEntry = stagedEntry || entry
      const definition = definitions[activeEntry.definitionId] || {}
      const quantities = activeEntry.contentQuantities || {}
      return {
        ...definition,
        id: entry.rewardId || definition.id,
        contents: (definition.contents || []).map(item => ({ ...item, quantity: stageValue(quantities[item.quantitySourceId || item.id], stage) })),
        ...((activeEntry.fixedGoldValues || entry.fixedGoldValues) ? { fixedGoldValue: stageValue(activeEntry.fixedGoldValues ?? entry.fixedGoldValues, stage) } : {}),
      }
    })
    return { basicRewards, choiceRewards }
  }, [keyType, keyLevel, stage])
  const choiceRewards = rewardData?.choiceRewards || rewardPlaceholders.map(rank => ({ id: `placeholder-${rank}`, name: '보상 데이터 준비 중', contents: [] }))
  const formatContents = contents => contents.length ? contents.map(item => `${item.name} ${item.quantity.toLocaleString('ko-KR')}${item.unit}`).join(' · ') : '보상 구성 및 수량이 여기에 표시됩니다.'
  const formatGold = value => Number(value.toFixed(1)).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
  const convertedMarket = item => {
    if (!item.marketConversion?.length) return null
    return item.marketConversion.map(option => { const market = marketPrices[option.itemName]; return market?.currentMinPrice > 0 ? { market, option, unitPrice: market.currentMinPrice / market.bundleCount / option.contentsQuantity } : null }).filter(Boolean).sort((a, b) => a.unitPrice - b.unitPrice)[0] || null
  }
  const itemMarket = item => marketPrices[item.marketName || item.name] || convertedMarket(item)?.market
  const itemImage = item => item.image || itemMarket(item)?.icon
  const itemGrade = item => item.grade || itemMarket(item)?.grade
  const itemPheonValue = item => includePheonCost && crystalGoldPrice > 0 && item.pheonCostPerItem > 0 ? item.quantity * item.pheonCostPerItem * crystalsPerPheon * crystalGoldPrice / 100 : null
  const itemValue = item => {
    const pheonValue = itemPheonValue(item)
    if (Number.isFinite(item.fixedGoldValuePerItem)) return item.quantity * item.fixedGoldValuePerItem + (pheonValue || 0)
    if (item.id === 'soaring-stone-engraving-selection-kit' && selectedAbilityStoneConfiguration?.currentMinPrice > 0) return item.quantity * selectedAbilityStoneConfiguration.currentMinPrice + (pheonValue || 0)
    if (item.id === 'relic-bracelet' && relicBraceletValue?.expectedValue > 0) return item.quantity * relicBraceletValue.expectedValue + (pheonValue || 0)
    if (item.id === 'bracelet' && braceletValue?.expectedValue > 0) return item.quantity * braceletValue.expectedValue + (pheonValue || 0)
    if (item.unit === '골드') return item.quantity + (pheonValue || 0)
    const conversion = convertedMarket(item)
    if (conversion) return item.quantity * conversion.unitPrice + (pheonValue || 0)
    const market = marketPrices[item.marketName || item.name]
    const marketValue = market?.currentMinPrice > 0 ? item.quantity / market.bundleCount * market.currentMinPrice : null
    return marketValue == null ? pheonValue : marketValue + (pheonValue || 0)
  }
  const basicRewardValue = rewardData?.basicRewards.map(itemValue).filter(value => value != null).reduce((sum, value) => sum + value, 0) || 0
  const optionContents = (reward, option) => reward.contents.filter(item => option.contentIds.includes(item.id))
  const recommendedGemOption = reward => reward.id === 'gem-selection-box' ? reward.selectionOptions?.map(option => ({ option, value: contentsValue(optionContents(reward, option)) })).filter(item => item.value != null).sort((a, b) => b.value - a.value)[0]?.option : null
  const selectedRewardOption = reward => reward.selectionOptions?.find(option => option.id === selectedOptions[reward.id]) || recommendedGemOption(reward)
  const visibleRewardContents = reward => { const option = selectedRewardOption(reward); return option ? optionContents(reward, option) : reward.contents || [] }
  const contentsValue = contents => { const values = contents.map(itemValue).filter(value => value != null); return values.length ? values.reduce((sum, value) => sum + value, 0) : null }
  const rewardValue = reward => {
    if (Number.isFinite(reward.fixedGoldValue)) return reward.fixedGoldValue
    if (!reward.contents?.length) return null
    if (reward.selectionOptions?.length) {
      const selected = selectedRewardOption(reward)
      if (selected) return contentsValue(optionContents(reward, selected))
      const optionValues = reward.selectionOptions.map(option => contentsValue(optionContents(reward, option))).filter(value => value != null)
      return optionValues.length ? Math.max(...optionValues) : null
    }
    const values = reward.contents.map(itemValue).filter(value => value != null)
    if (!values.length) return null
    return reward.selectionMode === 'one' ? Math.max(...values) : values.reduce((sum, value) => sum + value, 0)
  }
  const rewardImages = reward => reward.image ? [reward.image] : [...new Set(visibleRewardContents(reward).map(itemImage).filter(Boolean))].slice(0, 3)
  const hasAbundance = abundanceRewards.size > 0
  const rankedRewards = useMemo(() => choiceRewards.map((reward, originalIndex) => { const choiceValue = rewardValue(reward); const basicMultiplier = abundanceRewards.has(reward.id) ? 10 : includeBasicRewards || hasAbundance ? 1 : 0; const includedBasicValue = basicRewardValue * basicMultiplier; return { reward, value: choiceValue == null ? null : choiceValue + includedBasicValue, originalIndex } }).sort((a, b) => {
    if (a.value == null && b.value == null) return a.originalIndex - b.originalIndex
    if (a.value == null) return 1
    if (b.value == null) return -1
    return b.value - a.value
  }), [choiceRewards, marketPrices, abundanceRewards, basicRewardValue, selectedOptions, includeBasicRewards, hasAbundance, crystalGoldPrice, includePheonCost, braceletValue, relicBraceletValue, abilityStoneValue, selectedAbilityStoneConfiguration])
  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const nextLayout = new Map()
    rankedRewards.forEach(({ reward }, rank) => {
      const node = rewardNodes.current.get(reward.id)
      if (!node) return
      const rect = node.getBoundingClientRect()
      nextLayout.set(reward.id, { top: rect.top, rank })
      const previous = previousRewardLayout.current.get(reward.id)
      if (!reducedMotion && previous && previous.rank !== rank) {
        const offset = previous.top - rect.top
        node.animate([
          { transform: `translateY(${offset}px)`, zIndex: 3, boxShadow: '0 10px 26px rgba(83, 58, 170, .22)' },
          { transform: 'translateY(0)', zIndex: 3, boxShadow: '0 4px 12px rgba(83, 58, 170, .12)', offset: .82 },
          { transform: 'translateY(0)', zIndex: 1, boxShadow: 'none' },
        ], { duration: 620, easing: 'cubic-bezier(.22, 1, .36, 1)' })
        node.querySelector('.hell-rank-number')?.animate([
          { transform: 'scale(.85)' },
          { transform: 'scale(1.28)', color: '#8d6dff', offset: .55 },
          { transform: 'scale(1)' },
        ], { duration: 620, easing: 'ease-out' })
      }
    })
    previousRewardLayout.current = nextLayout
  }, [rankedRewards])
  const toggleExpanded = rewardId => {
    setExpandedRewards(current => current.has(rewardId) ? new Set() : new Set([rewardId]))
    setExpandedBraceletValues(new Set())
  }
  const toggleBraceletValue = rewardId => setExpandedBraceletValues(current => current.has(rewardId) ? new Set() : new Set([rewardId]))
  const toggleAbundance = rewardId => setAbundanceRewards(current => { const next = new Set(current); next.has(rewardId) ? next.delete(rewardId) : next.add(rewardId); return next })
  const toggleAll = () => setExpandedRewards(current => current.size === choiceRewards.length ? new Set() : new Set(choiceRewards.map(reward => reward.id)))
  const selectOption = (rewardId, optionId) => setSelectedOptions(current => ({ ...current, [rewardId]: optionId }))
  const rewardHasRelicBracelet = reward => reward.contents?.some(item => item.id === 'relic-bracelet')
  const rewardHasBracelet = reward => reward.contents?.some(item => item.id === 'bracelet' || item.id === 'relic-bracelet')
  const braceletValueForReward = reward => rewardHasRelicBracelet(reward) ? relicBraceletValue : braceletValue
  const braceletLoadingForReward = reward => rewardHasRelicBracelet(reward) ? relicBraceletLoading : braceletLoading
  const rewardHasAbilityStone = reward => reward.contents?.some(item => item.id === 'soaring-stone-engraving-selection-kit')

  useEffect(() => {
    if (!rewardData) { setMarketPrices({}); return }
    const names = [...rewardData.basicRewards, ...rewardData.choiceRewards.flatMap(reward => reward.contents)].flatMap(item => item.marketLookup === false ? [] : item.marketConversion?.map(option => option.itemName) || [item.marketName || item.name])
    let active = true
    if (priceRefreshTick === 0) setMarketLoading(true)
    lostArkApi.getMarketPrices([...new Set(names)]).then(data => { if (active) setMarketPrices(data) }).catch(() => { if (active) setMarketPrices({}) }).finally(() => { if (active) setMarketLoading(false) })
    return () => { active = false }
  }, [rewardData, priceRefreshTick])
  useEffect(() => {
    let active = true
    if (priceRefreshTick === 0) setBraceletLoading(true)
    lostArkApi.getBraceletAuctionValue()
      .then(data => { if (active) setBraceletValue(data) })
      .catch(() => { if (active) setBraceletValue(null) })
      .finally(() => { if (active) setBraceletLoading(false) })
    return () => { active = false }
  }, [priceRefreshTick])
  useEffect(() => {
    let active = true
    if (priceRefreshTick === 0) setRelicBraceletLoading(true)
    lostArkApi.getRelicBraceletAuctionValue()
      .then(data => { if (active) setRelicBraceletValue(data) })
      .catch(() => { if (active) setRelicBraceletValue(null) })
      .finally(() => { if (active) setRelicBraceletLoading(false) })
    return () => { active = false }
  }, [priceRefreshTick])
  useEffect(() => {
    let active = true
    if (priceRefreshTick === 0) setAbilityStoneLoading(true)
    getSharedAbilityStoneValue({ refresh: priceRefreshTick > 0 })
      .then(data => { if (active) setAbilityStoneValue(data) })
      .catch(() => { if (active) setAbilityStoneValue(null) })
      .finally(() => { if (active) setAbilityStoneLoading(false) })
    return () => { active = false }
  }, [priceRefreshTick])
  useEffect(() => { setLocalData('loark.includePheonCost', String(includePheonCost)) }, [includePheonCost])
  useEffect(() => {
    if (abilityStoneConfigurationId) storeAbilityStoneConfigurationId(abilityStoneConfigurationId)
  }, [abilityStoneConfigurationId])

  return <div className="efficiency-page hell-reward-page">
    <nav className="efficiency-tabs">{toolTabs.map(([path, label]) => <Link className={path === '/hell-reward' ? 'active' : ''} to={path} key={path}>{label}</Link>)}</nav>
    <header className="efficiency-hero hell-reward-hero"><div className="efficiency-hero-icon paradise-heading-icon"><img src="/images/rewards/311b8974b04c4aa98aeab4d180ba205c.png" alt="낙원 시즌 3" /></div><div><p>PARADISE SEASON 3</p><h1>낙원 지옥·나락 보상 효율</h1><span>보유한 열쇠와 클리어 단계를 선택해 보상 정보를 확인하세요.</span></div></header>
    <div className="hell-config-layout"><section className="hell-filter panel">
      <div className="hell-filter-heading"><div><KeyRound /><h2>열쇠 종류</h2></div><span>입장할 콘텐츠를 선택하세요</span></div>
      <div className="hell-type-tabs" role="group" aria-label="열쇠 종류"><button className={keyType === 'hell' ? 'active' : ''} onClick={() => setKeyType('hell')}><Skull />지옥</button><button className={keyType === 'abyss' ? 'active' : ''} onClick={() => setKeyType('abyss')}><Sparkles />나락</button></div>
      <div className="hell-filter-columns">
        <div className="hell-filter-block"><h3><Crown />열쇠 레벨</h3><div className="hell-level-grid">{keyLevels.map(level => <button className={keyLevel === level ? 'active' : ''} onClick={() => setKeyLevel(level)} key={level}>{level}</button>)}</div></div>
        <div className="hell-filter-block"><h3><Layers3 />클리어 단계</h3><div className="hell-stage-grid">{clearStages.map(value => <button className={stage === value ? 'active' : ''} onClick={() => setStage(value)} key={value}>{value}<small>단계</small></button>)}</div></div>
      </div>
      <div className={`pheon-converter compact ${includePheonCost ? 'enabled' : ''}`}><label className="pheon-toggle"><span className="pheon-currency-icon legendary"><img src={pheonData.image} alt="페온" /></span><span className="pheon-toggle-copy"><b>페온 가치 포함</b><small>헤더에 설정한 환율로 계산</small></span><input type="checkbox" checked={includePheonCost} onChange={event => setIncludePheonCost(event.target.checked)} /><i aria-hidden="true" /></label></div>
    </section>
    <section className="hell-selection panel"><header><p>SELECTED RESULT</p><h2>선택 결과</h2><span>설정한 열쇠 조건을 확인하세요.</span></header><div><span>선택한 열쇠</span><strong>{keyType === 'hell' ? '지옥' : '나락'} 열쇠</strong></div><div><span>열쇠 레벨</span><strong>Lv. {keyLevel}</strong></div><div><span>클리어 단계</span><strong>{stage}단계</strong></div><div className={`basic-reward-option ${hasAbundance ? 'forced' : ''}`}><span>골드 합산 기준</span><label><input type="checkbox" checked={includeBasicRewards || hasAbundance} disabled={hasAbundance} onChange={event => setIncludeBasicRewards(event.target.checked)} /><i aria-hidden="true" />{hasAbundance ? '기본 보상 자동 포함' : '기본 보상 포함'}</label></div>
      <section className="hell-ranking"><header><div><p>REWARD VALUE</p><h2>{keyType === 'hell' ? '지옥' : '나락'} 보상 가치 순위</h2></div><button onClick={toggleAll}>{expandedRewards.size === choiceRewards.length ? '전체 접기' : '전체 펼치기'} <ChevronDown /></button></header>
        <div className="hell-ranking-list">{rankedRewards.map(({ reward, value }, index) => { const visibleContents = visibleRewardContents(reward); const activeOption = selectedRewardOption(reward); const images = rewardImages(reward); const gradeClass = rewardGradeClass(reward.grade || visibleContents.map(itemGrade).find(Boolean)); const expanded = expandedRewards.has(reward.id); const abundance = abundanceRewards.has(reward.id); const valueLoading = marketLoading || (rewardHasBracelet(reward) && braceletLoadingForReward(reward)) || (rewardHasAbilityStone(reward) && abilityStoneLoading); const contentSummary = reward.selectionOptions?.length && !activeOption ? `${reward.selectionOptions.map(option => option.name).join(' / ')} 중 1종 선택` : formatContents(visibleContents); return <article className={`${index === 0 && value != null ? 'top' : ''} ${expanded ? 'expanded' : ''}`} ref={node => { if (node) rewardNodes.current.set(reward.id, node); else rewardNodes.current.delete(reward.id) }} key={reward.id}><b className="hell-rank-number">{index + 1}</b><span className={`hell-reward-icon ${gradeClass} ${images.length > 1 ? `multi multi-${images.length}` : ''}`}>{images.length ? images.map((src, imageIndex) => <img src={src} alt="" key={`${src}-${imageIndex}`} />) : <PackageOpen />}</span><div className="hell-reward-copy"><strong>{reward.name}</strong><small>{contentSummary}</small>{reward.selectionOptions?.length && <div className="hell-inline-options">{reward.selectionOptions.map(option => <button className={activeOption?.id === option.id ? 'active' : ''} onClick={() => selectOption(reward.id, option.id)} key={option.id}>{option.name}</button>)}</div>}</div><button className={`hell-abundance ${abundance ? 'active' : ''}`} onClick={() => toggleAbundance(reward.id)}><i />풍요<small>기본 보상 ×10</small></button><strong className="hell-reward-value">{valueLoading ? '조회 중' : value == null ? '--' : <GoldAmount>{formatGold(value)}</GoldAmount>}</strong><button className="hell-reward-open" aria-label={`${index + 1}위 보상 ${expanded ? '접기' : '펼치기'}`} onClick={() => toggleExpanded(reward.id)}><ChevronDown /></button>
          {expanded && <div className="hell-reward-details">
            <section><h4>기본 보상 {abundance && <b>풍요 ×10</b>}</h4>{rewardData?.basicRewards?.map(item => { const image = itemImage(item); const multiplier = abundance ? 10 : 1; const quantity = item.quantity * multiplier; const goldValue = itemValue(item); return <div key={item.id}>{image ? <img className={rewardGradeClass(itemGrade(item))} src={image} alt="" /> : <span className="detail-icon"><PackageOpen /></span>}<span>{item.name}</span><strong className="detail-values"><span>{quantity.toLocaleString('ko-KR')}{item.unit}</span><b>{goldValue == null ? '--' : <GoldAmount>{formatGold(goldValue * multiplier)}</GoldAmount>}</b></strong></div> }) || <p>기본 보상 데이터 준비 중</p>}</section>
            <section><h4>상자 보상</h4>{reward.selectionOptions?.length && !activeOption ? <p>받을 보상 1종을 선택하세요.</p> : visibleContents.length ? visibleContents.map(item => { const image = itemImage(item); const goldValue = itemValue(item); const pheonValue = itemPheonValue(item); const isAbilityStone = item.id === 'soaring-stone-engraving-selection-kit'; return <div key={item.id}>{image ? <img className={rewardGradeClass(itemGrade(item))} src={image} alt="" /> : <span className="detail-icon"><PackageOpen /></span>}<span>{item.name}{item.description && <small>{item.description}</small>}{isAbilityStone && <AbilityStoneConfigurationSelect data={abilityStoneValue} loading={abilityStoneLoading} selectedId={selectedAbilityStoneConfiguration?.id} onSelect={setAbilityStoneConfigurationId} />}{item.pheonCostPerItem > 0 && <small className="pheon-detail">{includePheonCost ? <>{(item.quantity * item.pheonCostPerItem).toLocaleString('ko-KR')}페온 · <GoldAmount>{formatGold(pheonValue)}</GoldAmount> 포함</> : `1개당 ${item.pheonCostPerItem}페온 · 가치 미포함`}</small>}</span><strong className="detail-values"><span>{item.quantity.toLocaleString('ko-KR')}{item.unit}</span><b>{goldValue == null ? '--' : <GoldAmount>{formatGold(goldValue)}</GoldAmount>}</b></strong></div> }) : <p>상자 보상 데이터 준비 중</p>}</section>
            {rewardHasBracelet(reward) && <BraceletValueBreakdown open={expandedBraceletValues.has(reward.id)} onToggle={() => toggleBraceletValue(reward.id)} loading={braceletLoadingForReward(reward)} data={braceletValueForReward(reward)} formatGold={formatGold} />}
          </div>}
        </article> })}</div>
      </section>
    </section></div>
  </div>
}
