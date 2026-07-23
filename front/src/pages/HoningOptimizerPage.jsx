import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Anvil,
  Award,
  ChevronDown,
  ChevronUp,
  Coins,
  Gem,
  Layers3,
  Loader2,
  PackageOpen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { GoldAmount } from '../components/GoldIcon'
import { lostArkApi } from '../lib/api'
import {
  ALL_MATERIAL_NAMES,
  GRADE_OPTIONS,
  currentStagesForGrade,
  currentStagesForGradeAnyType,
  findRecord,
  stagesForGrade,
  stagesForGradeAnyType,
} from '../lib/honingCalculator'
import { marketNameFor, unitPriceOf } from '../lib/honingPricing'
import { HONING_TIMEOUT_MS, runHoningCalculation } from '../lib/honingWorkerClient'
import { applyOwnedMaterialsToResults, getCharacterHoningInventories } from '../lib/honingInventory'
import { useFavorites } from '../lib/favorites'
import { representativeEquipmentFromArmory } from '../lib/representativeEquipment'
import singleCoinData from '../data/single-coin.json'
import paradiseData from '../data/paradise-season3.json'
import '../honing-optimizer.css'

const equipment = [
  { id: 'helmet', name: '투구', type: '방어구' },
  { id: 'shoulder', name: '어깨', type: '방어구' },
  { id: 'chest', name: '상의', type: '방어구' },
  { id: 'pants', name: '하의', type: '방어구' },
  { id: 'gloves', name: '장갑', type: '방어구' },
  { id: 'weapon', name: '무기', type: '무기' },
]

const DEFAULT_GRADE = 'T3 1525 (상위 고대)'
const initialSettings = Object.fromEntries(
  equipment.map((item) => [
    item.id,
    { grade: DEFAULT_GRADE, current: 10, target: 10, startProbability: '', startEnergy: '' },
  ]),
)
const routePresetFrom = (params) => {
  const equipmentId = params.get('equipment')
  const grade = params.get('grade')
  const current = Number(params.get('current'))
  const target = Number(params.get('target'))
  if (
    !equipment.some((item) => item.id === equipmentId) ||
    !GRADE_OPTIONS.includes(grade) ||
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    target <= current
  )
    return null
  return { equipmentId, grade, current, target }
}

const iconFor = (name) => {
  if (name === '골드') return Coins
  if (name.includes('돌파') || name.includes('명예')) return Gem
  if (name.includes('수호')) return ShieldCheck
  if (name.includes('융화')) return PackageOpen
  return Sparkles
}

// Same static item image/grade lookup other pages (RaidExtraPage) use, so honing materials
// show the real game icon and a grade-tinted background instead of a generic lucide icon.
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
const metaOverrides = {
  골드: { image: '/images/rewards/money_4.png', grade: '일반' },
  '명예의 파편': { image: '/images/rewards/money_13.png', grade: '일반' },
}
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
const metaFor = (name, prices) => {
  const market = prices[marketNameFor(name)]
  const hasOverride = Object.prototype.hasOwnProperty.call(metaOverrides, name)
  const override = metaOverrides[name]
  const staticMeta = staticItemMeta.get(name)
  return {
    // An explicit override always wins for the image, even when it's null — that's how an
    // item with no real icon yet (명예의 파편) stays blank instead of falling back to a
    // market icon that would show the wrong art (e.g. the pouch's icon).
    image: hasOverride ? override.image : staticMeta?.image || market?.icon || null,
    grade: override?.grade || staticMeta?.grade || market?.grade || null,
  }
}

const number = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const percent = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })

function StageSelect({ value, onChange, options, allowEmpty = false, label }) {
  return (
    <label className="honing-stage-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((stage) => (
          <option key={stage} value={stage}>
            {stage}강
          </option>
        ))}
      </select>
    </label>
  )
}

export default function HoningOptimizerPage() {
  const [searchParams] = useSearchParams()
  const routeSearch = searchParams.toString()
  const routePreset = useMemo(() => routePresetFrom(searchParams), [routeSearch])
  const { representativeName } = useFavorites()
  const [strongholdResearch, setStrongholdResearch] = useState(false)
  const [growthSupport, setGrowthSupport] = useState(false)
  const [bulkGrade, setBulkGrade] = useState(DEFAULT_GRADE)
  const [bulkCurrent, setBulkCurrent] = useState(10)
  const [bulkTarget, setBulkTarget] = useState('')
  const [draft, setDraft] = useState(initialSettings)
  const [calculated, setCalculated] = useState(null)
  const [activeEquipment, setActiveEquipment] = useState('chest')
  const [activeSegment, setActiveSegment] = useState(null)
  const [overallOpen, setOverallOpen] = useState(true)
  const [marketPrices, setMarketPrices] = useState({})
  const [pricesReady, setPricesReady] = useState(false)
  const [ownedInventories] = useState(getCharacterHoningInventories)
  const ownedCharacter =
    representativeName && ownedInventories[representativeName] ? representativeName : ''

  const supportState = { strongholdResearch, growthSupport }
  const getUnitPrice = (name) => unitPriceOf(name, marketPrices)
  const getMeta = (name) => metaFor(name, marketPrices)

  // Prices have to be loaded *before* simulating, not after — the optimizer needs catalyst
  // prices to decide what to use, not just to total up a bill afterward. Fetches every
  // material name that could ever appear, once, regardless of what's currently selected.
  useEffect(() => {
    let active = true
    const uniqueNames = [...new Set(ALL_MATERIAL_NAMES.map(marketNameFor))].filter(
      (name) => name !== '골드',
    )
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
        if (active) setPricesReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  const [simulations, setSimulations] = useState({})
  const [calculatingIds, setCalculatingIds] = useState(() => new Set())
  const [timedOutIds, setTimedOutIds] = useState(() => new Set())
  const runIdRef = useRef(0)

  // Runs each equipment's calculation in its own Web Worker so the UI thread never blocks —
  // the "계산 중" spinner keeps animating for real instead of just freezing along with a
  // synchronous computation. If a single equipment's calculation runs past HONING_TIMEOUT_MS
  // its worker is killed and that item is flagged as timed out (no backend fallback yet — see
  // the note on this page's PR/plan — so for now a timeout just stops and tells the user).
  useEffect(() => {
    setSimulations({})
    setTimedOutIds(new Set())
    if (!calculated || !pricesReady) {
      setCalculatingIds(new Set())
      return
    }

    const runId = ++runIdRef.current
    const itemsToRun = equipment.filter(
      (item) => calculated[item.id].target > calculated[item.id].current,
    )
    setCalculatingIds(new Set(itemsToRun.map((item) => item.id)))

    const handles = itemsToRun.map((item) => {
      const setting = calculated[item.id]
      const { promise, cancel } = runHoningCalculation({
        equipmentType: item.type,
        grade: setting.grade,
        currentStage: setting.current,
        targetStage: setting.target,
        supportState,
        marketPrices,
        startProbability: setting.startProbability,
        startEnergy: setting.startEnergy,
      })
      promise
        .then((result) => {
          if (runIdRef.current !== runId) return
          setSimulations((previous) => ({ ...previous, [item.id]: result }))
        })
        .catch((error) => {
          if (runIdRef.current !== runId) return
          if (error.message === 'TIMEOUT') {
            setTimedOutIds((previous) => new Set(previous).add(item.id))
          }
        })
        .finally(() => {
          if (runIdRef.current !== runId) return
          setCalculatingIds((previous) => {
            const next = new Set(previous)
            next.delete(item.id)
            return next
          })
        })
      return cancel
    })

    return () => {
      handles.forEach((cancel) => cancel())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculated, pricesReady, strongholdResearch, growthSupport, marketPrices])

  const adjustedSimulations = useMemo(() => {
    const availableResults = equipment
      .filter((item) => simulations[item.id])
      .map((item) => ({ id: item.id, ...simulations[item.id] }))
    const adjusted = applyOwnedMaterialsToResults(
      availableResults,
      ownedInventories[ownedCharacter] || {},
      getUnitPrice,
    ).results
    return Object.fromEntries(adjusted.map(({ id, ...result }) => [id, result]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulations, ownedCharacter, ownedInventories, marketPrices])

  const isCalculating = calculatingIds.size > 0
  const resultItems = equipment.filter((item) => adjustedSimulations[item.id])
  const visibleItems = equipment.filter(
    (item) =>
      adjustedSimulations[item.id] || calculatingIds.has(item.id) || timedOutIds.has(item.id),
  )
  const selectedItem =
    visibleItems.find((item) => item.id === activeEquipment) || visibleItems[0] || null
  const selectedSimulation = selectedItem ? adjustedSimulations[selectedItem.id] : null
  const selectedSetting = selectedItem ? calculated[selectedItem.id] : null

  useEffect(() => {
    if (!selectedSimulation?.steps.length) return
    if (!selectedSimulation.steps.some((step) => step.fromStage === activeSegment))
      setActiveSegment(selectedSimulation.steps[0].fromStage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSimulation])

  const clampToOptions = (value, options) =>
    !options.length || value === ''
      ? value
      : Math.min(options[options.length - 1], Math.max(options[0], value))

  useEffect(() => {
    if (!representativeName || routePreset) return undefined
    let active = true
    lostArkApi
      .getCharacter(representativeName)
      .then((data) => {
        if (!active) return
        const detected = representativeEquipmentFromArmory(data?.armory)
        const detectedItems = equipment.filter((item) => detected[item.id])
        if (!detectedItems.length) return

        setDraft((previous) =>
          Object.fromEntries(
            equipment.map((item) => {
              const current = detected[item.id]
              if (!current || !GRADE_OPTIONS.includes(current.regularGrade))
                return [item.id, previous[item.id]]
              const currentStage = clampToOptions(
                current.enhancement,
                currentStagesForGrade(item.type, current.regularGrade),
              )
              const targetStage = clampToOptions(
                currentStage,
                stagesForGrade(item.type, current.regularGrade),
              )
              return [
                item.id,
                {
                  ...previous[item.id],
                  grade: current.regularGrade,
                  current: currentStage,
                  target: targetStage,
                  startProbability: '',
                  startEnergy: '',
                },
              ]
            }),
          ),
        )
        const first = detected[detectedItems[0].id]
        setBulkGrade(first.regularGrade)
        setBulkCurrent(first.enhancement)
        setBulkTarget('')
        setCalculated(null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // The inventory snapshot is intentionally read once with the representative equipment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [representativeName, routePreset])

  useEffect(() => {
    if (!routePreset || !pricesReady) return
    const selectedItem = equipment.find((item) => item.id === routePreset.equipmentId)
    const current = clampToOptions(
      routePreset.current,
      currentStagesForGrade(selectedItem.type, routePreset.grade),
    )
    const target = clampToOptions(
      Math.max(current, routePreset.target),
      stagesForGrade(selectedItem.type, routePreset.grade),
    )
    const next = Object.fromEntries(
      equipment.map((item) => {
        const previous = draft[item.id]
        if (item.id !== routePreset.equipmentId)
          return [item.id, { ...previous, target: previous.current }]
        return [
          item.id,
          {
            ...previous,
            grade: routePreset.grade,
            current,
            target,
            startProbability: '',
            startEnergy: '',
          },
        ]
      }),
    )
    setDraft(next)
    setBulkGrade(routePreset.grade)
    setBulkCurrent(current)
    setBulkTarget(target)
    setCalculated(next)
    setActiveEquipment(routePreset.equipmentId)
    setActiveSegment(current)
    // The route preset is intentionally applied once after market prices become available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePreset, pricesReady])

  const updateSetting = (id, key, value) => {
    setDraft((previous) => {
      const next = { ...previous[id], [key]: value }
      if (key === 'grade') {
        const type = equipment.find((item) => item.id === id).type
        next.current = clampToOptions(next.current, currentStagesForGrade(type, value))
        next.target = clampToOptions(next.target, stagesForGrade(type, value))
      }
      return { ...previous, [id]: next }
    })
  }

  // The stage the user is currently mid-attempt on is "current + 1" — its attempt-1 probability
  // bounds how high/low a manually-entered starting probability can be (rawBaseProbability
  // never goes below the fresh value or above double it).
  const progressBoundsFor = (item, setting) => {
    const record = findRecord(item.type, setting.grade, setting.current + 1, supportState)
    if (!record) return null
    return { min: record.probability.total, max: record.probability.total * 2 }
  }

  const applyBulk = (key, value) => {
    if (key === 'grade') setBulkGrade(value)
    else if (key === 'current') setBulkCurrent(value)
    else setBulkTarget(value)
    if (value === '') return
    setDraft((previous) =>
      Object.fromEntries(
        equipment.map((item) => {
          const next = { ...previous[item.id], [key]: value }
          if (key === 'grade') {
            next.current = clampToOptions(next.current, currentStagesForGrade(item.type, value))
            next.target = clampToOptions(next.target, stagesForGrade(item.type, value))
          }
          return [item.id, next]
        }),
      ),
    )
  }

  const calculate = () => {
    const normalized = Object.fromEntries(
      equipment.map((item) => {
        const setting = draft[item.id]
        const target = Math.max(setting.current, setting.target)
        const bounds = progressBoundsFor(item, { ...setting, target })
        const rawStartProbability =
          setting.startProbability === '' ? null : Number(setting.startProbability)
        const startProbability =
          bounds && rawStartProbability !== null && !Number.isNaN(rawStartProbability)
            ? Math.min(bounds.max, Math.max(bounds.min, rawStartProbability))
            : null
        const rawStartEnergy = setting.startEnergy === '' ? null : Number(setting.startEnergy)
        const startEnergy =
          rawStartEnergy !== null && !Number.isNaN(rawStartEnergy)
            ? Math.min(100, Math.max(0, rawStartEnergy))
            : null
        return [item.id, { ...setting, target, startProbability, startEnergy }]
      }),
    )
    setCalculated(normalized)
    const firstChanged = equipment.find(
      (item) => normalized[item.id].target > normalized[item.id].current,
    )
    if (firstChanged) setActiveEquipment(firstChanged.id)
  }

  const activeStep = selectedSimulation?.steps.find((step) => step.fromStage === activeSegment)
  const displayRows = activeStep ? activeStep.attemptRows : []
  const strategyComparison = activeStep?.strategies || []

  return (
    <main className="honing-optimizer-page page-content">
      <header className="honing-optimizer-heading panel">
        <span>
          <Anvil />
        </span>
        <div>
          <small>HONING OPTIMIZER</small>
          <h1>재련 최적화</h1>
          <p>장비별 등급과 목표 단계를 설정하고 예상 재료·시도 횟수·보조 재료 전략을 계산합니다.</p>
        </div>
      </header>

      <div className="honing-optimizer-layout">
        <aside className="honing-settings panel">
          <header>
            <div>
              <small>장비 설정</small>
              <h2>장비 목표 설정</h2>
            </div>
          </header>
          <div className="honing-material-options">
            <label>
              <input
                type="checkbox"
                checked={strongholdResearch}
                onChange={(event) => setStrongholdResearch(event.target.checked)}
              />{' '}
              영지성장 지원
            </label>
            <label>
              <input
                type="checkbox"
                checked={growthSupport}
                onChange={(event) => setGrowthSupport(event.target.checked)}
              />{' '}
              재련성장 지원
            </label>
          </div>

          <div className="honing-setting-list">
            <div className="honing-setting-row bulk">
              <div className="honing-setting-row-top">
                <strong>일괄</strong>
                <select
                  value={bulkGrade}
                  onChange={(event) => applyBulk('grade', event.target.value)}
                >
                  {GRADE_OPTIONS.map((grade) => (
                    <option value={grade} key={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>
              <div className="honing-setting-row-bottom">
                <StageSelect
                  label="현재"
                  value={bulkCurrent}
                  options={currentStagesForGradeAnyType(bulkGrade)}
                  onChange={(value) => applyBulk('current', value)}
                />
                <StageSelect
                  label="목표"
                  value={bulkTarget}
                  options={stagesForGradeAnyType(bulkGrade)}
                  allowEmpty
                  onChange={(value) => applyBulk('target', value)}
                />
              </div>
            </div>
            {equipment.map((item) => (
              <div className="honing-setting-row" key={item.id}>
                <div className="honing-setting-row-top">
                  <strong>{item.name}</strong>
                  <select
                    value={draft[item.id].grade}
                    onChange={(event) => updateSetting(item.id, 'grade', event.target.value)}
                  >
                    {GRADE_OPTIONS.map((grade) => (
                      <option value={grade} key={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="honing-setting-row-bottom">
                  <StageSelect
                    label="현재"
                    value={draft[item.id].current}
                    options={currentStagesForGrade(item.type, draft[item.id].grade)}
                    onChange={(value) => updateSetting(item.id, 'current', value)}
                  />
                  <StageSelect
                    label="목표"
                    value={draft[item.id].target}
                    options={stagesForGrade(item.type, draft[item.id].grade)}
                    onChange={(value) => updateSetting(item.id, 'target', value)}
                  />
                </div>
                <div className="honing-setting-row-progress">
                  <label className="honing-progress-field">
                    <span>
                      현재 확률(%)
                      {(() => {
                        const bounds = progressBoundsFor(item, draft[item.id])
                        return bounds ? ` · 최대 ${number(bounds.max)}%` : ''
                      })()}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="하다 만 강화면 입력"
                      value={draft[item.id].startProbability}
                      onChange={(event) =>
                        updateSetting(item.id, 'startProbability', event.target.value)
                      }
                    />
                  </label>
                  <label className="honing-progress-field">
                    <span>현재 장인의 기운(%)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={draft[item.id].startEnergy}
                      onChange={(event) =>
                        updateSetting(item.id, 'startEnergy', event.target.value)
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            className="honing-calculate"
            type="button"
            onClick={calculate}
            disabled={!pricesReady || isCalculating}
          >
            {isCalculating ? (
              <>
                <Loader2 className="honing-spin" /> 계산 중…
              </>
            ) : (
              <>
                <Anvil /> {pricesReady ? '계산' : '시세 불러오는 중…'}
              </>
            )}
          </button>
        </aside>

        <section className="honing-results">
          {!calculated && (
            <div className="honing-result-card panel">
              <p>왼쪽에서 장비별 등급과 현재/목표 단계를 설정하고 계산 버튼을 눌러 주세요.</p>
            </div>
          )}

          {calculated && (
            <>
              <button
                className="honing-overall panel"
                type="button"
                onClick={() => setOverallOpen((value) => !value)}
              >
                <span>
                  <Layers3 /> 전체 계산 결과
                </span>
                <strong>
                  {isCalculating && <Loader2 className="honing-spin" />}
                  {resultItems.length}개 장비
                </strong>
                {overallOpen ? <ChevronUp /> : <ChevronDown />}
              </button>

              <div className={`honing-overall-body panel ${overallOpen ? 'open' : ''}`}>
                {visibleItems.length ? (
                  visibleItems.map((item) => {
                    const pending = calculatingIds.has(item.id) && !simulations[item.id]
                    const timedOut = timedOutIds.has(item.id) && !simulations[item.id]
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={selectedItem?.id === item.id ? 'active' : ''}
                        disabled={pending}
                        onClick={() => setActiveEquipment(item.id)}
                      >
                        <span>{item.name}</span>
                        {pending ? (
                          <b>
                            <Loader2 className="honing-spin" /> 계산 중…
                          </b>
                        ) : timedOut ? (
                          <b>시간 초과</b>
                        ) : (
                          <b>
                            {calculated[item.id].current}강 → {calculated[item.id].target}강
                          </b>
                        )}
                      </button>
                    )
                  })
                ) : (
                  <p>목표 단계가 현재 단계보다 높은 장비를 설정해 주세요.</p>
                )}
              </div>

              {selectedItem && calculatingIds.has(selectedItem.id) && !selectedSimulation && (
                <div className="honing-result-card panel honing-calculating-card">
                  <Loader2 className="honing-spin" />
                  <p>{selectedItem.name} 최적화를 계산하고 있습니다…</p>
                </div>
              )}

              {selectedItem && timedOutIds.has(selectedItem.id) && !selectedSimulation && (
                <div className="honing-result-card panel">
                  <p className="honing-missing-note">
                    {selectedItem.name} 계산이 {HONING_TIMEOUT_MS / 1000}초를 넘어 중단되었습니다.
                    구간을 줄이거나 다시 시도해 주세요.
                  </p>
                </div>
              )}

              {selectedItem && selectedSimulation && (
                <article className="honing-result-card panel">
                  <header className="honing-result-title">
                    <span>{selectedItem.name}</span>
                    <div>
                      <small>{selectedSetting.grade}</small>
                      <h2>
                        {selectedItem.name} {selectedSetting.current}강 → {selectedSetting.target}강
                      </h2>
                    </div>
                  </header>

                  {selectedSimulation.missingStages.length > 0 && (
                    <p className="honing-missing-note">
                      {selectedSimulation.missingStages.join(', ')}단계는 해당 등급의 재련 데이터가
                      없어 계산에서 제외했습니다.
                    </p>
                  )}
                  {(selectedSimulation.hasUnpricedRequiredMaterial ||
                    selectedSimulation.excludedCatalysts.length > 0) && (
                    <p className="honing-missing-note">
                      {selectedSimulation.hasUnpricedRequiredMaterial &&
                        '일부 필요 재료는 시세 정보가 없어 골드 비용에서 제외했습니다. '}
                      {selectedSimulation.excludedCatalysts.length > 0 &&
                        `보조 재료 중 ${selectedSimulation.excludedCatalysts.join(', ')}은(는) 시세 정보가 없어 최적화 대상에서 제외했습니다.`}
                    </p>
                  )}

                  <div className="honing-average-cost">
                    <div>
                      <small>예상 시도 횟수 (최적 보조 재료 사용 기준)</small>
                      <strong>{number(selectedSimulation.expectedAttempts)}회</strong>
                      <span>
                        <GoldAmount>{number(selectedSimulation.expectedCost)}</GoldAmount>
                      </span>
                    </div>
                    <p>
                      골드 비용은 시세 조회가 가능한 재료만 반영한 참고값입니다. 보조 재료는
                      시도마다 가장 저렴하게 목표에 도달하는 조합을 자동으로 계산합니다.
                      {selectedSimulation.ownedDiscount > 0 && (
                        <strong className="honing-owned-saving">
                          귀속 재료 적용으로{' '}
                          <GoldAmount>{number(selectedSimulation.ownedDiscount)}</GoldAmount>을
                          절약할 수 있습니다. 최적 조합과 표시 비용은 기존 시세 기준입니다.
                        </strong>
                      )}
                    </p>
                  </div>

                  <div className="honing-material-grid">
                    {selectedSimulation.materials.map(
                      ({ name, expectedCount, ownedUsed, ownedSaving, cost }) => {
                        const Icon = iconFor(name)
                        const meta = getMeta(name)
                        const price = getUnitPrice(name)
                        return (
                          <div key={name}>
                            <i className={gradeClass(meta.grade)}>
                              {meta.image ? <img src={meta.image} alt="" /> : <Icon />}
                            </i>
                            <span>
                              <small>{name}</small>
                              <b>{number(expectedCount)}개</b>
                              {ownedUsed > 0 && (
                                <em>
                                  귀속 {number(ownedUsed)}개 사용 시{' '}
                                  <GoldAmount>{number(ownedSaving)}</GoldAmount> 절약
                                </em>
                              )}
                            </span>
                            <strong>
                              {price !== null ? (
                                <GoldAmount>{number(cost)}</GoldAmount>
                              ) : (
                                '시세 없음'
                              )}
                            </strong>
                          </div>
                        )
                      },
                    )}
                  </div>

                  <div className="honing-segments" role="tablist" aria-label="재련 구간">
                    {selectedSimulation.steps.map((step) => (
                      <button
                        type="button"
                        key={step.fromStage}
                        className={activeSegment === step.fromStage ? 'active' : ''}
                        onClick={() => setActiveSegment(step.fromStage)}
                      >
                        {step.fromStage}강 → {step.toStage}강
                      </button>
                    ))}
                  </div>

                  {activeStep && (
                    <section className="honing-route">
                      <header>
                        <div>
                          <RouteIcon />
                          <h3>
                            {activeStep.fromStage}강 → {activeStep.toStage}강 최적 루트
                          </h3>
                        </div>
                        <div className="honing-route-summary">
                          <span>
                            <small>평균 시도 횟수</small>
                            <b>{number(activeStep.expectedAttempts)}회</b>
                          </span>
                          <span>
                            <small>평균 비용</small>
                            <b>
                              <GoldAmount>{number(activeStep.expectedCost)}</GoldAmount>
                            </b>
                          </span>
                          <span>
                            <small>장기백 비용</small>
                            <b>
                              <GoldAmount>{number(activeStep.worstCaseCost)}</GoldAmount>
                            </b>
                            <em>{activeStep.worstCaseAttempts}회 (확정 성공 기준)</em>
                          </span>
                        </div>
                      </header>

                      <div className="honing-attempt-table">
                        <div className="honing-attempt-head">
                          <span>시도</span>
                          <span>기본 확률</span>
                          <span>보조 재료</span>
                          <span>최종 확률</span>
                          <span>장인의 기운</span>
                          <span>시도 비용</span>
                        </div>
                        {displayRows.map((row) => (
                          <div className="honing-attempt-row" key={row.attempt}>
                            <span>{row.attempt}회</span>
                            <span>{percent(row.rawBase)}%</span>
                            <div className="honing-catalyst-usage">
                              {row.catalystUsage.length ? (
                                row.catalystUsage.map((item) => {
                                  const Icon = iconFor(item.name)
                                  const meta = getMeta(item.name)
                                  return (
                                    <span className="honing-catalyst-chip" key={item.name}>
                                      <i className={gradeClass(meta.grade)}>
                                        {meta.image ? <img src={meta.image} alt="" /> : <Icon />}
                                      </i>
                                      {item.name} x{item.count}
                                    </span>
                                  )
                                })
                              ) : (
                                <span className="honing-unused">미사용</span>
                              )}
                            </div>
                            <span>{percent(row.finalProbability)}%</span>
                            <span>{percent(row.energyBefore)}%</span>
                            <span>
                              <GoldAmount>{number(row.attemptCost)}</GoldAmount>
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {strategyComparison.length > 0 && (
                    <section className="honing-strategy-compare">
                      <header>
                        <Award />
                        <h3>전략 비교</h3>
                        <small>
                          {activeStep.fromStage}강 → {activeStep.toStage}강 구간, 보조 재료 조합별
                          비용
                        </small>
                      </header>
                      <div className="honing-strategy-table">
                        <div className="honing-strategy-head">
                          <span>순위</span>
                          <span>전략</span>
                          <span>평균 비용</span>
                          <span>평균 시도</span>
                          <span>비용 차이</span>
                        </div>
                        {strategyComparison.map((strategy, index) => (
                          <div
                            className={`honing-strategy-row ${index === 0 ? 'best' : ''}`}
                            key={strategy.id}
                          >
                            <span>{index === 0 ? '🏆' : index + 1}</span>
                            <span>
                              {strategy.label}
                              {strategy.recommended && ' ⭐'}
                            </span>
                            <span>
                              <GoldAmount>{number(strategy.expectedCost)}</GoldAmount>
                            </span>
                            <span>{number(strategy.expectedAttempts)}회</span>
                            <span>
                              {index === 0
                                ? '-'
                                : `+${number(strategy.costDiff)} (+${strategy.costDiffPercent.toFixed(1)}%)`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </article>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function RouteIcon() {
  return (
    <i className="honing-route-icon">
      <Anvil />
    </i>
  )
}
