import { Plus, Scale, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cleanApiText } from '../lib/text'
import { lostArkApi } from '../lib/api'
import ancientBraceletOptions from '../data/ancient_bracelet_options.json'
import relicBraceletOptions from '../data/relic_bracelet_options.json'
import { calculateAccessoryOptionShares, calculateAccessoryReplacement } from './DamageAnalysis'
import {
  fetchBattleStatCoefficients,
  loadDamageOptionRegistry,
  saveDamageOptionRegistry,
  selectBattleStatRecords,
} from '../lib/damageOptionRegistry'

const ACCESSORY_TYPES = new Set(['목걸이', '귀걸이', '반지', '팔찌'])
const DEFAULT_EFFECT = () => ({ name: '', value: '' })
const MAIN_STATS = ['힘', '민첩', '지능']
const BRACELET_DATA = {
  고대: ancientBraceletOptions,
  유물: relicBraceletOptions,
}
const BRACELET_IMAGES = {
  고대: '/images/rewards/acc_327.png',
  유물: '/images/rewards/acc_328.png',
}
const BRACELET_NAMES = {
  고대: '찬란한 구원자의 팔찌',
  유물: '고귀한 구원자의 팔찌',
}
const BRACELET_CATEGORIES = ['기본 효과', '전투 특성', '특수 효과']
const DEALER_OPTIONS = [
  {
    key: 'attackPercent',
    name: '공격력 %',
    engineName: '공격력',
    values: { 상: 1.55, 중: 0.95, 하: 0.4 },
    percent: true,
  },
  {
    key: 'weaponPercent',
    name: '무기 공격력 %',
    engineName: '무기 공격력',
    values: { 상: 3, 중: 1.8, 하: 0.8 },
    percent: true,
  },
  {
    key: 'attackFlat',
    name: '공격력 +',
    engineName: '공격력',
    values: { 상: 390, 중: 195, 하: 80 },
  },
  {
    key: 'weaponFlat',
    name: '무기 공격력 +',
    engineName: '무기 공격력',
    values: { 상: 960, 중: 480, 하: 195 },
  },
]
const OPTION_GRADE_FILTERS = [
  ['MID_SINGLE', '중단일'],
  ['MID_LOW', '중하'],
  ['MID_MID', '중중'],
  ['HIGH_SINGLE', '상단일'],
  ['HIGH_LOW', '상하'],
  ['HIGH_MID', '상중'],
  ['HIGH_HIGH', '상상'],
]

function tooltipText(raw = '') {
  try {
    const strings = []
    const walk = (value) => {
      if (typeof value === 'string') strings.push(cleanApiText(value))
      else if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(JSON.parse(raw))
    return strings.join(' | ')
  } catch {
    return cleanApiText(raw)
  }
}

function tooltipPart(raw, heading) {
  try {
    let result = ''
    const walk = (value) => {
      if (!value || typeof value !== 'object' || result) return
      if (
        cleanApiText(value.Element_000 || '') === heading &&
        typeof value.Element_001 === 'string'
      ) {
        result = value.Element_001
        return
      }
      Object.values(value).forEach(walk)
    }
    walk(JSON.parse(raw || '{}'))
    return result
  } catch {
    return ''
  }
}

function tooltipEffectLines(raw = '') {
  return raw
    .split(/<br\s*\/?>/i)
    .map((segment) => cleanApiText(segment).trim())
    .filter(Boolean)
}

function currentAccessoryEffects(item) {
  if (!item) return []
  if (item.Type === '팔찌') {
    return tooltipEffectLines(tooltipPart(item.Tooltip, '팔찌 효과')).map((line, index) => {
      const match = line.match(/^(.*?)([+-]\s*[\d,]+(?:\.\d+)?%?)$/)
      return {
        key: `bracelet-${index}-${line}`,
        name: match?.[1]?.trim() || line,
        value: match?.[2]?.replace(/\s+/g, '') || '',
        line,
      }
    })
  }

  const effects = []
  const mainStatLine = tooltipPart(item.Tooltip, '기본 효과')
    .split(/<br\s*\/?>/i)
    .find(
      (segment) =>
        !/COLOR=['"]?#686660/i.test(segment) &&
        /(?:힘|민첩|지능)\s*\+\s*[\d,]+/.test(cleanApiText(segment)),
    )
  const mainStatMatch = cleanApiText(mainStatLine || '').match(/(힘|민첩|지능)\s*\+\s*([\d,]+)/)
  if (mainStatMatch) {
    effects.push({
      key: 'main-stat',
      name: mainStatMatch[1],
      value: `+${mainStatMatch[2]}`,
      line: `${mainStatMatch[1]} +${mainStatMatch[2]}`,
    })
  }

  effects.push(
    ...tooltipPart(item.Tooltip, '연마 효과')
      .split(/<br\s*\/?>/i)
      .map((segment, index) => {
        const match = segment.match(
          /([가-힣\s]+?)\s*<FONT\s+color=['"]?#?[A-F0-9]{6}['"]?[^>]*>\s*(\+[\d,]+(?:\.\d+)?%?)/i,
        )
        if (!match) return null
        const name = cleanApiText(match[1]).trim()
        const value = match[2]
        return {
          key: `refine-${index}-${name}`,
          name,
          value,
          line: `${name} ${value}`,
        }
      })
      .filter(Boolean)
      .slice(0, 3),
  )

  const enlightenment = tooltipText(item.Tooltip).match(/깨달음\s*\+(\d+)/)?.[1]
  if (enlightenment) {
    effects.push({
      key: 'enlightenment',
      name: '깨달음',
      value: `+${enlightenment}`,
      line: `깨달음 +${enlightenment}`,
    })
  }
  return effects
}

function braceletDefinition(grade, option) {
  return BRACELET_DATA[grade]?.[option?.category]?.[option?.name] || null
}

function braceletEffect(option, grade) {
  const definition = braceletDefinition(grade, option)
  if (!definition) return null
  let values
  let value
  if (definition.range) {
    const min = Number(definition.range.min)
    const max = Number(definition.range.max)
    const entered = Number(option.value)
    const number = Number.isFinite(entered) ? Math.min(Math.max(entered, min), max) : min
    values = { n: number }
    value = `+${number.toLocaleString('ko-KR')}`
  } else {
    const tier = definition.grades?.[option.tier] ? option.tier : '상'
    values = definition.grades?.[tier]
    value = tier
  }
  if (!values) return null
  const line = definition.template.replace(/\{(\w+)\}/g, (_, key) =>
    values[key] == null ? '' : values[key].toLocaleString('ko-KR'),
  )
  return { name: option.name, value, line, tier: option.tier }
}

function defaultBraceletOption(grade, category = '기본 효과') {
  const data = BRACELET_DATA[grade]?.[category] || {}
  const name = Object.keys(data)[0] || ''
  const definition = data[name]
  return {
    category,
    name,
    value: definition?.range?.min ?? '',
    tier: definition?.grades ? '상' : '',
  }
}

function candidateEffects(candidate) {
  if (!candidate) return []
  if (candidate.bracelet) {
    return (candidate.braceletOptions || [])
      .map((option) => braceletEffect(option, candidate.grade))
      .filter(Boolean)
  }
  if (candidate.auctionItem) {
    const mainStatName = candidate.mainStatName || '힘'
    const effects = [
      {
        name: mainStatName,
        value: `+${candidate.auctionItem.mainStatValue}`,
        line: `${mainStatName} +${candidate.auctionItem.mainStatValue}`,
      },
    ]
    candidate.auctionItem.options
      .filter((option) => option.type === 'ACCESSORY_UPGRADE' && option.key)
      .forEach((auctionOption) => {
        const definition = DEALER_OPTIONS.find((option) => option.key === auctionOption.key)
        if (!definition) return
        const value = `${auctionOption.value}${auctionOption.percentage ? '%' : ''}`
        effects.push({
          name: definition.name,
          value: `+${value}`,
          line: `${definition.engineName} +${value}`,
          tier: auctionOption.tier,
        })
      })
    return effects
  }
  if (candidate.structured) {
    const effects = []
    if (candidate.mainStatName && String(candidate.mainStatValue).trim()) {
      effects.push({
        name: candidate.mainStatName,
        value: `+${candidate.mainStatValue}`,
        line: `${candidate.mainStatName} +${candidate.mainStatValue}`,
      })
    }
    DEALER_OPTIONS.forEach((option) => {
      const tier = candidate.dealerOptions?.[option.key]
      if (!tier) return
      const value = option.values[tier]
      effects.push({
        name: option.name,
        value: `+${value}${option.percent ? '%' : ''}`,
        tier,
        line: `${option.engineName} +${value}${option.percent ? '%' : ''}`,
      })
    })
    return effects
  }
  return candidate.effects.filter((effect) => effect.name.trim() && effect.value.trim())
}

function percentText(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function normalizeEffectText(value) {
  return cleanApiText(value || '')
    .replace(/\s+/g, '')
    .replaceAll(',', '')
}

function shareForEffect(effect, shares) {
  const exactLine = normalizeEffectText(effect.line)
  const effectName = normalizeEffectText(effect.name)
  const effectValue = normalizeEffectText(effect.value)
  return shares.find((share) => {
    const line = normalizeEffectText(share.line)
    return (
      (exactLine && line === exactLine) ||
      (line.includes(effectName) && (!effectValue || line.includes(effectValue)))
    )
  })
}

export default function AccessoryComparison({
  armory,
  profile,
  skills = [],
  siblings = [],
  onHover,
}) {
  const equipment = armory?.ArmoryEquipment || []
  const equippedAccessories = useMemo(
    () =>
      equipment
        .map((item, equipmentIndex) => ({ item, equipmentIndex }))
        .filter(({ item }) => ACCESSORY_TYPES.has(item.Type)),
    [equipment],
  )
  const [selectedEquipmentIndex, setSelectedEquipmentIndex] = useState(
    equippedAccessories[0]?.equipmentIndex ?? null,
  )
  const [candidates, setCandidates] = useState({})
  const [selectedCandidateId, setSelectedCandidateId] = useState(null)
  const [skillName, setSkillName] = useState(skills[0]?.Name || '')
  const [showAuctionSearch, setShowAuctionSearch] = useState(false)
  const [auctionFilters, setAuctionFilters] = useState({
    grade: '고대',
    tradeCount: 'ZERO',
    refineLevels: [3],
    optionTypes: DEALER_OPTIONS.map((option) => option.key),
    optionGrade: 'MID_SINGLE',
  })
  const [auctionResults, setAuctionResults] = useState([])
  const [auctionLoading, setAuctionLoading] = useState(false)
  const [auctionError, setAuctionError] = useState('')
  const nextId = useRef(1)

  // 첫 화면은 로컬 캐시로 바로 계산하고, 마운트 직후 서버의 최신 통합 레지스트리로
  // 교체한다. 일반 옵션은 원문 패턴만으로 매칭하며 category는 계산 조건으로 쓰지 않는다.
  // category는 아래 selectBattleStatRecords에서 전투 특성 추적 대상을 고를 때만 사용한다.
  const [registry, setRegistry] = useState(loadDamageOptionRegistry)
  useEffect(() => {
    let active = true
    lostArkApi
      .getDamageOptionRegistry()
      .then((nextRegistry) => {
        if (!active || nextRegistry?.version !== 1 || !Array.isArray(nextRegistry.records)) return
        setRegistry(nextRegistry)
        saveDamageOptionRegistry(nextRegistry)
      })
      .catch(() => {
        // 서버 레지스트리를 잠시 읽지 못하면 기존 로컬 캐시로 계속 계산한다.
      })
    return () => {
      active = false
    }
  }, [])
  const battleStatRecords = useMemo(
    () => selectBattleStatRecords(registry.records),
    [registry.records],
  )
  const [battleStatCoefficients, setBattleStatCoefficients] = useState({})
  useEffect(() => {
    let active = true
    fetchBattleStatCoefficients(battleStatRecords).then((next) => {
      if (active) setBattleStatCoefficients(next)
    })
    return () => {
      active = false
    }
  }, [battleStatRecords])

  useEffect(() => {
    if (
      selectedEquipmentIndex == null ||
      !equippedAccessories.some(({ equipmentIndex }) => equipmentIndex === selectedEquipmentIndex)
    ) {
      setSelectedEquipmentIndex(equippedAccessories[0]?.equipmentIndex ?? null)
    }
  }, [equippedAccessories, selectedEquipmentIndex])

  const currentItem = equipment[selectedEquipmentIndex]
  const currentType = currentItem?.Type || ''
  const currentEffects = currentAccessoryEffects(currentItem)
  const currentCandidates = candidates[currentType] || []
  const selectedCandidate =
    currentCandidates.find((candidate) => candidate.id === selectedCandidateId) || null
  const selectedComparisonEffects = candidateEffects(selectedCandidate)
  const currentMainStatName =
    currentEffects.find((effect) => MAIN_STATS.includes(effect.name))?.name || '힘'
  const optionShares = useMemo(
    () =>
      calculateAccessoryOptionShares({
        armory,
        profile,
        skills,
        skillName,
        siblings,
        registry,
        battleStatCoefficients,
      }),
    [armory, profile, skills, skillName, siblings, registry, battleStatCoefficients],
  )
  const currentOptionShares = optionShares.filter(
    (option) => option.equipmentIndex === selectedEquipmentIndex,
  )
  const currentOptionShareTotal = currentOptionShares.reduce(
    (sum, option) => sum + (Number(option.share) || 0),
    0,
  )
  const comparisonResult = useMemo(
    () =>
      selectedCandidate?.structured
        ? calculateAccessoryReplacement({
            armory,
            profile,
            skills,
            skillName,
            siblings,
            equipmentIndex: selectedEquipmentIndex,
            grade: selectedCandidate.grade,
            quality: selectedCandidate.quality,
            lines: selectedComparisonEffects.map((effect) => effect.line).filter(Boolean),
            registry,
            battleStatCoefficients,
          })
        : { total: null, options: [] },
    [
      armory,
      profile,
      skills,
      skillName,
      siblings,
      selectedEquipmentIndex,
      selectedCandidate,
      selectedComparisonEffects,
      registry,
      battleStatCoefficients,
    ],
  )
  const comparisonOptionShareTotal = comparisonResult.options.reduce(
    (sum, option) => sum + (Number(option.share) || 0),
    0,
  )
  // All auctionResults (up to 100) must be scored to know which ones beat the current
  // accessory - unlike other lists here, this can't be truncated to "the first N" without
  // silently dropping valid matches. Instead, the same synchronous calculateAccessoryReplacement
  // work is chunked across multiple macrotasks (via setTimeout yields) so the main thread
  // gets control back between chunks instead of freezing the page for one long calculation.
  const [strongerAuctionResults, setStrongerAuctionResults] = useState([])
  const [strongerResultsComputing, setStrongerResultsComputing] = useState(false)
  useEffect(() => {
    let cancelled = false
    const CHUNK_SIZE = 10

    async function computeStrongerResults() {
      if (!auctionResults.length) {
        setStrongerAuctionResults([])
        return
      }
      setStrongerResultsComputing(true)
      const scored = []
      for (let start = 0; start < auctionResults.length; start += CHUNK_SIZE) {
        if (cancelled) return
        auctionResults.slice(start, start + CHUNK_SIZE).forEach((item) => {
          const effects = candidateEffects({
            structured: true,
            auctionItem: item,
            mainStatName: currentMainStatName,
          })
          const result = calculateAccessoryReplacement({
            armory,
            profile,
            skills,
            skillName,
            siblings,
            equipmentIndex: selectedEquipmentIndex,
            grade: item.grade,
            quality: item.quality,
            lines: effects.map((effect) => effect.line).filter(Boolean),
            registry,
            battleStatCoefficients,
          })
          scored.push({
            ...item,
            optionShareTotal: result.options.reduce(
              (sum, option) => sum + (Number(option.share) || 0),
              0,
            ),
            replacementTotal: result.total,
          })
        })
        if (start + CHUNK_SIZE < auctionResults.length) {
          await new Promise((resolve) => setTimeout(resolve, 0))
        }
      }
      if (cancelled) return
      setStrongerAuctionResults(
        scored.filter(
          (item) =>
            item.replacementTotal != null &&
            item.replacementTotal > 0 &&
            item.optionShareTotal > currentOptionShareTotal,
        ),
      )
      setStrongerResultsComputing(false)
    }

    computeStrongerResults()
    return () => {
      cancelled = true
    }
  }, [
    auctionResults,
    currentMainStatName,
    currentOptionShareTotal,
    armory,
    profile,
    skills,
    skillName,
    siblings,
    selectedEquipmentIndex,
    registry,
    battleStatCoefficients,
  ])

  useEffect(() => {
    if (!currentCandidates.some((candidate) => candidate.id === selectedCandidateId)) {
      setSelectedCandidateId(currentCandidates[0]?.id ?? null)
    }
  }, [currentCandidates, selectedCandidateId])

  useEffect(() => {
    if (!skills.length) {
      setSkillName('')
      return
    }
    if (!skills.some((skill) => skill.Name === skillName)) setSkillName(skills[0].Name)
  }, [skills, skillName])

  const addCandidate = () => {
    if (!currentType) return
    if (currentType !== '팔찌') {
      setAuctionFilters((current) => ({
        ...current,
        grade: currentItem?.Grade === '유물' ? '유물' : '고대',
      }))
      setShowAuctionSearch(true)
      return
    }
    const id = nextId.current++
    const candidate = {
      id,
      name:
        currentType === '팔찌'
          ? BRACELET_NAMES[currentItem?.Grade === '유물' ? '유물' : '고대']
          : `${currentType} 비교 ${currentCandidates.length + 1}`,
      ...(currentType === '팔찌'
        ? {
            structured: true,
            bracelet: true,
            grade: currentItem?.Grade === '유물' ? '유물' : '고대',
            quality: 100,
            braceletOptions: Array.from({ length: 3 }, () =>
              defaultBraceletOption(currentItem?.Grade === '유물' ? '유물' : '고대'),
            ),
          }
        : {
            structured: true,
            grade: '고대',
            quality: '100',
            mainStatName: '힘',
            mainStatValue: '',
            refineCount: 3,
            dealerOptions: {},
          }),
    }
    setCandidates((current) => ({
      ...current,
      [currentType]: [...(current[currentType] || []), candidate],
    }))
    setSelectedCandidateId(id)
  }

  const searchAuctions = async () => {
    if (!currentType || currentType === '팔찌') return
    setAuctionLoading(true)
    setAuctionError('')
    try {
      // DB-first: the background collector (every 60s) already keeps listings reasonably
      // fresh, so search doesn't need to force a live external API pull on every click.
      const response = await lostArkApi.searchAccessoryAuctions({
        part: currentType,
        ...auctionFilters,
        refresh: false,
      })
      setAuctionResults(response?.items || [])
    } catch (error) {
      setAuctionError(error.message || '경매장 검색에 실패했습니다.')
    } finally {
      setAuctionLoading(false)
    }
  }

  const selectAuctionItem = (item) => {
    const id = nextId.current++
    const candidate = {
      id,
      name: item.name,
      structured: true,
      auctionItem: item,
      grade: item.grade,
      quality: item.quality,
      mainStatName: currentMainStatName,
      mainStatValue: item.mainStatValue,
      refineCount: item.upgradeLevel,
      dealerOptions: {},
    }
    setCandidates((current) => ({
      ...current,
      [currentType]: [...(current[currentType] || []), candidate],
    }))
    setSelectedCandidateId(id)
    setShowAuctionSearch(false)
  }

  const toggleAuctionFilterValue = (key, value) => {
    setAuctionFilters((current) => {
      const values = current[key]
      const next = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value]
      return { ...current, [key]: next.length ? next : values }
    })
  }

  const updateCandidate = (id, updater) => {
    setCandidates((current) => ({
      ...current,
      [currentType]: (current[currentType] || []).map((candidate) =>
        candidate.id === id ? updater(candidate) : candidate,
      ),
    }))
  }

  const removeCandidate = (id) => {
    setCandidates((current) => ({
      ...current,
      [currentType]: (current[currentType] || []).filter((candidate) => candidate.id !== id),
    }))
  }

  const selectedDealerOptionCount = (candidate) =>
    Object.values(candidate.dealerOptions || {}).filter(Boolean).length

  const setDealerOptionTier = (candidateId, optionKey, tier) => {
    updateCandidate(candidateId, (current) => {
      const dealerOptions = { ...(current.dealerOptions || {}) }
      if (!tier) delete dealerOptions[optionKey]
      else {
        const alreadySelected = Boolean(dealerOptions[optionKey])
        const selectedCount = Object.values(dealerOptions).filter(Boolean).length
        if (!alreadySelected && selectedCount >= current.refineCount) return current
        dealerOptions[optionKey] = tier
      }
      return { ...current, dealerOptions }
    })
  }

  const setRefineCount = (candidateId, refineCount) => {
    updateCandidate(candidateId, (current) => {
      const dealerOptions = {}
      Object.entries(current.dealerOptions || {})
        .filter(([, tier]) => tier)
        .slice(0, refineCount)
        .forEach(([key, tier]) => {
          dealerOptions[key] = tier
        })
      return { ...current, refineCount, dealerOptions }
    })
  }

  const setBraceletGrade = (candidateId, grade) => {
    updateCandidate(candidateId, (current) => ({
      ...current,
      grade,
      name: Object.values(BRACELET_NAMES).includes(current.name)
        ? BRACELET_NAMES[grade]
        : current.name,
      braceletOptions: (current.braceletOptions || []).map((option) => {
        const definition = braceletDefinition(grade, option)
        if (!definition) return defaultBraceletOption(grade, option.category)
        if (definition.range) {
          const value = Math.min(
            Math.max(Number(option.value) || definition.range.min, definition.range.min),
            definition.range.max,
          )
          return { ...option, value, tier: '' }
        }
        return {
          ...option,
          value: '',
          tier: definition.grades?.[option.tier] ? option.tier : '상',
        }
      }),
    }))
  }

  const setBraceletOptionCategory = (candidateId, optionIndex, category) => {
    updateCandidate(candidateId, (current) => ({
      ...current,
      braceletOptions: current.braceletOptions.map((option, index) =>
        index === optionIndex ? defaultBraceletOption(current.grade, category) : option,
      ),
    }))
  }

  const setBraceletOptionName = (candidateId, optionIndex, name) => {
    updateCandidate(candidateId, (current) => {
      const definition =
        BRACELET_DATA[current.grade]?.[current.braceletOptions[optionIndex].category]?.[name]
      return {
        ...current,
        braceletOptions: current.braceletOptions.map((option, index) =>
          index === optionIndex
            ? {
                ...option,
                name,
                value: definition?.range?.min ?? '',
                tier: definition?.grades ? '상' : '',
              }
            : option,
        ),
      }
    })
  }

  const showItemTooltip = (event, item) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onHover?.({
      item,
      left: rect.left,
      right: rect.right,
      top: rect.top,
    })
  }

  return (
    <section className="accessory-compare">
      <header className="battle-panel accessory-compare-heading">
        <span>
          <Scale />
          <span>
            <h2>악세 비교</h2>
            <p>장착 악세를 기준으로 선택하고 비교할 악세의 옵션을 나란히 확인합니다.</p>
          </span>
        </span>
        <button type="button" onClick={addCandidate} disabled={!currentItem}>
          <Plus /> 비교 악세 추가
        </button>
      </header>

      <div className="accessory-linear-layout">
        <aside className="battle-panel equipped-accessory-rail">
          <header>
            <small>기준 선택</small>
            <b>장착 악세</b>
          </header>
          <div>
            {equippedAccessories.map(({ item, equipmentIndex }, index) => (
              <button
                type="button"
                className={selectedEquipmentIndex === equipmentIndex ? 'active' : ''}
                onClick={() => {
                  setSelectedEquipmentIndex(equipmentIndex)
                  setSelectedCandidateId(null)
                }}
                onMouseEnter={(event) => showItemTooltip(event, item)}
                onMouseLeave={() => onHover?.(null)}
                key={`${item.Type}-${item.Name}-${equipmentIndex}`}
              >
                {item.Icon && <img loading="lazy" src={item.Icon} alt="" />}
                <span>
                  <small>
                    {index + 1}. {item.Type}
                  </small>
                  <b>{item.Name}</b>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="accessory-compare-workspace">
          <section className="accessory-selection-summary">
            <article className="battle-panel accessory-stat-card base">
              <header>
                <span>
                  <small>BASE ACCESSORY</small>
                  <b>기준 악세 능력치</b>
                </span>
                {currentItem && <em>{currentItem.Type}</em>}
              </header>
              {currentItem ? (
                <>
                  <button
                    type="button"
                    className="accessory-summary-item"
                    onMouseEnter={(event) => showItemTooltip(event, currentItem)}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    {currentItem.Icon && <img loading="lazy" src={currentItem.Icon} alt="" />}
                    <span>
                      <b>{currentItem.Name}</b>
                      <small>{currentItem.Grade}</small>
                    </span>
                    <strong className="accessory-summary-item-total">
                      <small>딜 + 총합</small>
                      <b>+{percentText(currentOptionShareTotal)}%</b>
                    </strong>
                  </button>
                  <div className="accessory-ability-heading">
                    <span>
                      <small>TOOLTIP ABILITY</small>
                      <b>기존 악세 능력치</b>
                    </span>
                    <select
                      value={skillName}
                      onChange={(event) => setSkillName(event.target.value)}
                      aria-label="악세 계산 기준 스킬"
                    >
                      {skills.map((skill) => (
                        <option value={skill.Name} key={skill.Name}>
                          {skill.Name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="accessory-summary-effects">
                    {currentEffects.length ? (
                      currentEffects.map((effect) => {
                        const share = shareForEffect(effect, currentOptionShares)
                        return (
                          <span key={effect.key}>
                            <small>{effect.name}</small>
                            <b>{effect.value || '-'}</b>
                            {share && (
                              <strong>
                                딜 {share.share >= 0 ? '+' : ''}
                                {percentText(share.share)}%
                              </strong>
                            )}
                          </span>
                        )
                      })
                    ) : (
                      <p>표시할 수치 옵션이 없습니다.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="accessory-compare-empty">장착 중인 악세가 없습니다.</p>
              )}
            </article>

            <article className="battle-panel accessory-stat-card comparison">
              <header>
                <span>
                  <small>COMPARE ACCESSORY</small>
                  <b>비교 악세 능력치</b>
                </span>
                {selectedCandidate && <em>{currentType}</em>}
              </header>
              {selectedCandidate ? (
                <>
                  {selectedCandidate.bracelet ? (
                    <div className="accessory-summary-item">
                      <img
                        src={BRACELET_IMAGES[selectedCandidate.grade]}
                        alt=""
                      />
                      <span>
                        <b>
                          {selectedCandidate.grade} {selectedCandidate.name}
                        </b>
                        <small>팔찌</small>
                      </span>
                      <strong className="accessory-summary-item-total">
                        <small>딜 + 총합</small>
                        <b>+{percentText(comparisonOptionShareTotal)}%</b>
                      </strong>
                    </div>
                  ) : (
                    <div className="accessory-comparison-name">{selectedCandidate.name}</div>
                  )}
                  {selectedCandidate.structured && !selectedCandidate.bracelet && (
                    <div className="accessory-comparison-meta">
                      <span>
                        <small>등급</small>
                        <b>{selectedCandidate.grade}</b>
                      </span>
                      <span>
                        <small>품질</small>
                        <b>{selectedCandidate.quality || '-'}</b>
                      </span>
                      <span>
                        <small>연마</small>
                        <b>{selectedCandidate.refineCount}연마</b>
                      </span>
                    </div>
                  )}
                  {comparisonResult.total != null && !selectedCandidate.bracelet && (
                    <div
                      className={`accessory-comparison-total${
                        comparisonResult.total >= 0 ? ' up' : ' down'
                      }`}
                    >
                      <span>현재 기준 대비 총 딜</span>
                      <b>
                        {comparisonResult.total >= 0 ? '+' : ''}
                        {percentText(comparisonResult.total)}%
                      </b>
                    </div>
                  )}
                  {selectedCandidate.bracelet && (
                    <div className="accessory-ability-heading">
                      <span>
                        <small>TOOLTIP ABILITY</small>
                        <b>비교 악세 능력치</b>
                      </span>
                    </div>
                  )}
                  <div className="accessory-summary-effects">
                    {selectedComparisonEffects.length ? (
                      selectedComparisonEffects.map((effect, index) => {
                        const share = shareForEffect(effect, comparisonResult.options)
                        return (
                          <span key={`${effect.name}-${index}`}>
                            <small>{effect.name}</small>
                            <b>{effect.value}</b>
                            {share && (
                              <strong>
                                딜 {share.share >= 0 ? '+' : ''}
                                {percentText(share.share)}%
                              </strong>
                            )}
                          </span>
                        )
                      })
                    ) : (
                      <p>아래 비교 악세에 옵션을 입력하세요.</p>
                    )}
                  </div>
                  {comparisonResult.total != null && !selectedCandidate.bracelet && (
                    <div className="accessory-comparison-total up">
                      <span>옵션별 딜 + 총합</span>
                      <b>+{percentText(comparisonOptionShareTotal)}%</b>
                    </div>
                  )}
                </>
              ) : (
                <button type="button" className="accessory-compare-pick" onClick={addCandidate}>
                  <Plus />
                  <b>비교 악세를 선택하세요</b>
                  <span>아래 목록에서 추가하거나 등록된 악세를 누르면 표시됩니다.</span>
                </button>
              )}
            </article>
          </section>

          {showAuctionSearch && currentType !== '팔찌' && (
            <section className="battle-panel accessory-auction-search">
              <header>
                <span>
                  <small>LOSTARK AUCTION</small>
                  <b>{currentType} 경매장 검색</b>
                </span>
                <button type="button" onClick={() => setShowAuctionSearch(false)}>
                  닫기
                </button>
              </header>
              <div className="accessory-auction-filters">
                <fieldset>
                  <legend>악세서리 등급</legend>
                  <div>
                    {['유물', '고대'].map((grade) => (
                      <button
                        type="button"
                        className={auctionFilters.grade === grade ? 'active' : ''}
                        onClick={() => setAuctionFilters((current) => ({ ...current, grade }))}
                        key={grade}
                      >
                        {grade}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>구매 후 거래 가능 횟수</legend>
                  <div>
                    {[
                      ['ZERO', '0회'],
                      ['ONE_PLUS', '1회 이상'],
                      ['TWO_PLUS', '2회 이상'],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        className={auctionFilters.tradeCount === value ? 'active' : ''}
                        onClick={() =>
                          setAuctionFilters((current) => ({
                            ...current,
                            tradeCount: value,
                          }))
                        }
                        key={value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>연마 단계 · 복수 선택</legend>
                  <div>
                    {[1, 2, 3].map((level) => (
                      <button
                        type="button"
                        className={auctionFilters.refineLevels.includes(level) ? 'active' : ''}
                        onClick={() => toggleAuctionFilterValue('refineLevels', level)}
                        key={level}
                      >
                        {level}연마
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="wide">
                  <legend>딜러 부여 옵션 · 검색 대상</legend>
                  <div>
                    {DEALER_OPTIONS.map((option) => (
                      <button
                        type="button"
                        className={auctionFilters.optionTypes.includes(option.key) ? 'active' : ''}
                        onClick={() => toggleAuctionFilterValue('optionTypes', option.key)}
                        key={option.key}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="wide">
                  <legend>옵션 등급 · 최소 포함 조건</legend>
                  <div>
                    {OPTION_GRADE_FILTERS.map(([value, label]) => (
                      <button
                        type="button"
                        className={auctionFilters.optionGrade === value ? 'active' : ''}
                        onClick={() =>
                          setAuctionFilters((current) => ({
                            ...current,
                            optionGrade: value,
                          }))
                        }
                        key={value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <button
                type="button"
                className="accessory-auction-submit"
                disabled={auctionLoading}
                onClick={searchAuctions}
              >
                {auctionLoading ? '경매장 조회·DB 저장 중...' : '경매장 검색'}
              </button>
              {auctionError && <p className="accessory-auction-error">{auctionError}</p>}
              {!auctionLoading && !auctionError && auctionResults.length > 0 && (
                <p className="accessory-auction-result-summary">
                  {strongerResultsComputing ? (
                    '검색 결과와 현재 악세를 비교하는 중...'
                  ) : (
                    <>
                      검색 {auctionResults.length}개 중 현재 악세보다 딜 + 총합이 높은{' '}
                      <b>{strongerAuctionResults.length}개</b>만 표시합니다.
                    </>
                  )}
                </p>
              )}
              <div className="accessory-auction-results">
                {strongerAuctionResults.map((item) => (
                  <button type="button" onClick={() => selectAuctionItem(item)} key={item.id}>
                    <img loading="lazy" src={item.icon} alt="" />
                    <span className="accessory-auction-item-name">
                      <small>
                        {item.grade} · 품질 {item.quality} · {item.upgradeLevel}연마
                      </small>
                      <b>{item.name}</b>
                      <em>
                        거래 {item.tradeAllowCount}회 · 주스탯 +
                        {Number(item.mainStatValue).toLocaleString('ko-KR')}
                      </em>
                    </span>
                    <span className="accessory-auction-item-options">
                      {item.options
                        .filter((option) => option.type === 'ACCESSORY_UPGRADE')
                        .map((option, index) => (
                          <small key={`${option.name}-${index}`}>
                            {option.tier && <i>{option.tier}</i>}
                            {option.name} +{option.value}
                            {option.percentage ? '%' : ''}
                          </small>
                        ))}
                    </span>
                    <span className="accessory-auction-item-total">
                      <small>딜 + 총합</small>
                      <b>+{percentText(item.optionShareTotal)}%</b>
                      <em>현재보다 +{percentText(item.replacementTotal)}%</em>
                      <strong>{item.buyPrice.toLocaleString('ko-KR')} G</strong>
                    </span>
                  </button>
                ))}
                {!auctionLoading && !auctionError && !auctionResults.length && (
                  <p>검색 조건을 선택한 뒤 경매장 검색을 눌러주세요.</p>
                )}
                {!auctionLoading &&
                  !auctionError &&
                  !strongerResultsComputing &&
                  auctionResults.length > 0 &&
                  !strongerAuctionResults.length && (
                    <p>현재 악세보다 딜 + 총합이 높은 검색 결과가 없습니다.</p>
                  )}
              </div>
            </section>
          )}

          <section className="accessory-candidate-area">
            <header>
              <span>
                <b>{currentType || '악세'} 비교 목록</b>
                <small>{currentCandidates.length}개</small>
              </span>
              <button type="button" onClick={addCandidate} disabled={!currentItem}>
                <Plus /> 추가
              </button>
            </header>
            {currentCandidates.length ? (
              <div className="accessory-candidate-grid">
                {currentCandidates.map((candidate, candidateIndex) => (
                  <article
                    className={`battle-panel accessory-candidate-card${
                      selectedCandidateId === candidate.id ? ' active' : ''
                    }`}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    key={candidate.id}
                  >
                    <header>
                      <input
                        value={candidate.name}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          updateCandidate(candidate.id, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        aria-label={`${candidateIndex + 1}번 비교 악세 이름`}
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeCandidate(candidate.id)
                        }}
                        aria-label="비교 악세 삭제"
                      >
                        <Trash2 />
                      </button>
                    </header>
                    {candidate.auctionItem ? (
                      <div className="selected-auction-accessory">
                        <span>
                          <small>
                            {candidate.grade} · 품질 {candidate.quality} · {candidate.refineCount}
                            연마
                          </small>
                          <b>{candidate.auctionItem.buyPrice.toLocaleString('ko-KR')} G</b>
                        </span>
                        <em>구매 후 거래 {candidate.auctionItem.tradeAllowCount}회</em>
                        {candidateEffects(candidate).map((effect, index) => (
                          <div key={`${effect.name}-${index}`}>
                            <span>{effect.name}</span>
                            <b>{effect.value}</b>
                          </div>
                        ))}
                      </div>
                    ) : candidate.bracelet ? (
                      <div
                        className="structured-accessory-form bracelet-builder"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="bracelet-builder-grade">
                          <img src={BRACELET_IMAGES[candidate.grade]} alt="" />
                          <label>
                            <span>팔찌 등급</span>
                            <select
                              value={candidate.grade}
                              onChange={(event) =>
                                setBraceletGrade(candidate.id, event.target.value)
                              }
                            >
                              <option value="유물">유물</option>
                              <option value="고대">고대</option>
                            </select>
                          </label>
                          <b>{BRACELET_NAMES[candidate.grade]}</b>
                        </div>
                        <div className="bracelet-option-list">
                          {candidate.braceletOptions.map((option, optionIndex) => {
                            const definition = braceletDefinition(candidate.grade, option)
                            return (
                              <div className="bracelet-option-row" key={optionIndex}>
                                <select
                                  value={option.category}
                                  aria-label={`${optionIndex + 1}번 팔찌 옵션 분류`}
                                  onChange={(event) =>
                                    setBraceletOptionCategory(
                                      candidate.id,
                                      optionIndex,
                                      event.target.value,
                                    )
                                  }
                                >
                                  {BRACELET_CATEGORIES.map((category) => (
                                    <option value={category} key={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={option.name}
                                  aria-label={`${optionIndex + 1}번 팔찌 옵션`}
                                  onChange={(event) =>
                                    setBraceletOptionName(
                                      candidate.id,
                                      optionIndex,
                                      event.target.value,
                                    )
                                  }
                                >
                                  {Object.keys(
                                    BRACELET_DATA[candidate.grade]?.[option.category] || {},
                                  ).map((name) => (
                                    <option value={name} key={name}>
                                      {name}
                                    </option>
                                  ))}
                                </select>
                                {definition?.range ? (
                                  <input
                                    type="number"
                                    min={definition.range.min}
                                    max={definition.range.max}
                                    value={option.value}
                                    aria-label={`${optionIndex + 1}번 팔찌 옵션 수치`}
                                    onChange={(event) =>
                                      updateCandidate(candidate.id, (current) => ({
                                        ...current,
                                        braceletOptions: current.braceletOptions.map(
                                          (item, index) =>
                                            index === optionIndex
                                              ? { ...item, value: event.target.value }
                                              : item,
                                        ),
                                      }))
                                    }
                                  />
                                ) : (
                                  <select
                                    value={option.tier}
                                    aria-label={`${optionIndex + 1}번 팔찌 옵션 등급`}
                                    onChange={(event) =>
                                      updateCandidate(candidate.id, (current) => ({
                                        ...current,
                                        braceletOptions: current.braceletOptions.map(
                                          (item, index) =>
                                            index === optionIndex
                                              ? { ...item, tier: event.target.value }
                                              : item,
                                        ),
                                      }))
                                    }
                                  >
                                    {Object.keys(definition?.grades || {}).map((tier) => (
                                      <option value={tier} key={tier}>
                                        {tier}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <button
                                  type="button"
                                  aria-label={`${optionIndex + 1}번 팔찌 옵션 삭제`}
                                  disabled={candidate.braceletOptions.length <= 1}
                                  onClick={() =>
                                    updateCandidate(candidate.id, (current) => ({
                                      ...current,
                                      braceletOptions: current.braceletOptions.filter(
                                        (_, index) => index !== optionIndex,
                                      ),
                                    }))
                                  }
                                >
                                  <Trash2 />
                                </button>
                                <small>{braceletEffect(option, candidate.grade)?.line}</small>
                              </div>
                            )
                          })}
                        </div>
                        <button
                          type="button"
                          className="accessory-effect-add"
                          disabled={candidate.braceletOptions.length >= 5}
                          onClick={() =>
                            updateCandidate(candidate.id, (current) => ({
                              ...current,
                              braceletOptions: [
                                ...current.braceletOptions,
                                defaultBraceletOption(current.grade),
                              ],
                            }))
                          }
                        >
                          <Plus /> 옵션 추가 ({candidate.braceletOptions.length}/5)
                        </button>
                      </div>
                    ) : candidate.structured ? (
                      <div
                        className="structured-accessory-form"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="structured-accessory-basics">
                          <label>
                            <span>등급</span>
                            <select
                              value={candidate.grade}
                              onChange={(event) =>
                                updateCandidate(candidate.id, (current) => ({
                                  ...current,
                                  grade: event.target.value,
                                }))
                              }
                            >
                              <option value="유물">유물</option>
                              <option value="고대">고대</option>
                            </select>
                          </label>
                          <label>
                            <span>품질</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={candidate.quality}
                              onChange={(event) =>
                                updateCandidate(candidate.id, (current) => ({
                                  ...current,
                                  quality: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span>연마</span>
                            <select
                              value={candidate.refineCount}
                              onChange={(event) =>
                                setRefineCount(candidate.id, Number(event.target.value))
                              }
                            >
                              <option value="1">1연마</option>
                              <option value="2">2연마</option>
                              <option value="3">3연마</option>
                            </select>
                          </label>
                        </div>
                        <div className="structured-main-stat">
                          <label>
                            <span>주스탯</span>
                            <select
                              value={candidate.mainStatName}
                              onChange={(event) =>
                                updateCandidate(candidate.id, (current) => ({
                                  ...current,
                                  mainStatName: event.target.value,
                                }))
                              }
                            >
                              {MAIN_STATS.map((stat) => (
                                <option value={stat} key={stat}>
                                  {stat}
                                </option>
                              ))}
                            </select>
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={candidate.mainStatValue}
                            placeholder="주스탯 수치"
                            onChange={(event) =>
                              updateCandidate(candidate.id, (current) => ({
                                ...current,
                                mainStatValue: event.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="structured-dealer-options">
                          <header>
                            <b>딜러 연마 옵션</b>
                            <small>
                              {selectedDealerOptionCount(candidate)}/{candidate.refineCount}
                            </small>
                          </header>
                          {DEALER_OPTIONS.map((option) => {
                            const tier = candidate.dealerOptions?.[option.key] || ''
                            const atLimit =
                              !tier && selectedDealerOptionCount(candidate) >= candidate.refineCount
                            return (
                              <label key={option.key}>
                                <span>{option.name}</span>
                                <select
                                  value={tier}
                                  disabled={atLimit}
                                  onChange={(event) =>
                                    setDealerOptionTier(
                                      candidate.id,
                                      option.key,
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="">미선택</option>
                                  <option value="상">상</option>
                                  <option value="중">중</option>
                                  <option value="하">하</option>
                                </select>
                                <b>
                                  {tier
                                    ? `+${option.values[tier]}${option.percent ? '%' : ''}`
                                    : '-'}
                                </b>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="accessory-candidate-effects">
                          {candidate.effects.map((effect, effectIndex) => (
                            <div key={effectIndex}>
                              <input
                                value={effect.name}
                                placeholder="옵션 이름"
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  updateCandidate(candidate.id, (current) => ({
                                    ...current,
                                    effects: current.effects.map((item, index) =>
                                      index === effectIndex
                                        ? { ...item, name: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                              <input
                                value={effect.value}
                                placeholder="+1.20%"
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  updateCandidate(candidate.id, (current) => ({
                                    ...current,
                                    effects: current.effects.map((item, index) =>
                                      index === effectIndex
                                        ? { ...item, value: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="accessory-effect-add"
                          onClick={(event) => {
                            event.stopPropagation()
                            updateCandidate(candidate.id, (current) => ({
                              ...current,
                              effects: [...current.effects, DEFAULT_EFFECT()],
                            }))
                          }}
                        >
                          <Plus /> 옵션 추가
                        </button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <button type="button" className="accessory-add-empty" onClick={addCandidate}>
                <Plus />
                <b>비교할 {currentType || '악세'} 추가</b>
                <span>추가한 악세를 누르면 위쪽 비교 능력치에 표시됩니다.</span>
              </button>
            )}
          </section>
        </main>
      </div>
    </section>
  )
}
