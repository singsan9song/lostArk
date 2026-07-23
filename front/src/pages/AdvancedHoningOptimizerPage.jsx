import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Anvil,
  ChevronDown,
  ChevronUp,
  Coins,
  Crown,
  Gem,
  Layers3,
  PackageOpen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { GoldAmount } from '../components/GoldIcon'
import { lostArkApi } from '../lib/api'
import { optimizeAdvancedSegment } from '../lib/advancedHoningCalculator'
import { applyOwnedMaterialsToResults, getCharacterHoningInventories } from '../lib/honingInventory'
import { marketNameFor, unitPriceOf } from '../lib/honingPricing'
import { useFavorites } from '../lib/favorites'
import { representativeEquipmentFromArmory } from '../lib/representativeEquipment'
import advancedRefiningData from '../data/icepang_advanced_refining_data.json'
import '../honing-optimizer.css'
import '../advanced-honing-optimizer.css'

const equipment = [
  { id: 'helmet', name: '투구', type: '방어구' },
  { id: 'shoulder', name: '어깨', type: '방어구' },
  { id: 'chest', name: '상의', type: '방어구' },
  { id: 'pants', name: '하의', type: '방어구' },
  { id: 'gloves', name: '장갑', type: '방어구' },
  { id: 'weapon', name: '무기', type: '무기' },
]

const grades = ['T3', 'T4']
const maxStageFor = (grade) => (grade === 'T3' ? 20 : 40)
const stagesFor = (grade) => Array.from({ length: maxStageFor(grade) + 1 }, (_, stage) => stage)
const initialSettings = Object.fromEntries(
  equipment.map((item) => [item.id, { grade: 'T4', current: 0, target: 0 }]),
)
const routePresetFrom = (params) => {
  const equipmentId = params.get('equipment')
  const grade = params.get('grade')
  const current = Number(params.get('current'))
  const target = Number(params.get('target'))
  if (
    !equipment.some((item) => item.id === equipmentId) ||
    !grades.includes(grade) ||
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    target <= current
  )
    return null
  return { equipmentId, grade, current, target }
}

const records = advancedRefiningData.records.map((record) => {
  const [from, to] = record.target_stage.match(/\d+/g).map(Number)
  return { ...record, from, to }
})

const allMaterialNames = [
  ...new Set(
    records.flatMap((record) => [
      ...record.required_materials.map((item) => item.name),
      ...record.additional_materials.map((item) => item.name),
    ]),
  ),
]

const number = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })

const iconFor = (name) => {
  if (name === '골드') return Coins
  if (name.includes('파괴')) return Gem
  if (name.includes('수호')) return ShieldCheck
  if (name.includes('융화')) return PackageOpen
  return Sparkles
}

const gradeClass = (grade) =>
  ({ 고대: 'ancient', 유물: 'relic', 전설: 'legendary', 영웅: 'epic', 희귀: 'rare' })[grade] || ''

const materialMeta = (name, prices) => {
  if (name === '골드') return { image: '/images/rewards/money_4.png', grade: '일반' }
  if (name === '명예의 파편') return { image: '/images/rewards/money_13.png', grade: '일반' }
  const market = prices[marketNameFor(name)]
  return { image: market?.icon || null, grade: market?.grade || null }
}

const addMaterial = (map, material, turns, additional) => {
  const current = map.get(material.name) || { name: material.name, count: 0, additional }
  current.count += material.count * turns
  map.set(material.name, current)
}

const calculateItem = (item, setting, prices) => {
  const matchingRecords = records.filter(
    (record) =>
      record.equipment_type === item.type &&
      record.equipment_grade === setting.grade &&
      record.to > setting.current &&
      record.from <= setting.target,
  )

  const materialMap = new Map()
  const segments = matchingRecords.map((record) => {
    const fromStage = Math.max(setting.current, record.from - 1)
    const toStage = Math.min(setting.target, record.to)
    const levels = toStage - fromStage
    const optimization = optimizeAdvancedSegment(
      record,
      (name) => unitPriceOf(name, prices),
      levels,
    )
    const best = optimization.best
    const baseTurns =
      best.counts.paidNormalTry + best.counts.bonusTry + best.counts.enhancedBonusTry

    record.required_materials.forEach((material) =>
      addMaterial(materialMap, material, baseTurns, false),
    )
    best.normalItems.forEach((material) =>
      addMaterial(
        materialMap,
        material,
        best.counts.paidNormalTry + best.counts.freeNormalTry,
        true,
      ),
    )
    best.bonusItems.forEach((material) =>
      addMaterial(materialMap, material, best.counts.bonusTry, true),
    )
    best.enhancedItems.forEach((material) =>
      addMaterial(materialMap, material, best.counts.enhancedBonusTry, true),
    )

    return { record, fromStage, toStage, levels, best, reports: optimization.reports }
  })

  const materials = [...materialMap.values()].map((material) => {
    const unitPrice = unitPriceOf(material.name, prices)
    return { ...material, unitPrice, cost: unitPrice === null ? null : unitPrice * material.count }
  })

  return {
    ...item,
    ...setting,
    levels: setting.target - setting.current,
    attempts: segments.reduce((sum, segment) => sum + segment.best.expectedTryCount, 0),
    cost: segments.reduce((sum, segment) => sum + segment.best.expectedPrice, 0),
    materials,
    segments,
    missingPrices: [
      ...new Set(
        materials
          .filter((material) => material.unitPrice === null)
          .map((material) => material.name),
      ),
    ],
  }
}

function StageSelect({ label, value, grade, onChange }) {
  return (
    <label className="honing-stage-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {stagesFor(grade).map((stage) => (
          <option value={stage} key={stage}>
            {stage}단계
          </option>
        ))}
      </select>
    </label>
  )
}

function MaterialChoice({ items, prices }) {
  if (!items.length) return <span className="advanced-choice-empty">미사용</span>
  return (
    <div className="advanced-choice-list">
      {items.map((item) => {
        const meta = materialMeta(item.name, prices)
        const Icon = iconFor(item.name)
        return (
          <span
            aria-label={`${item.name} ${number(item.count)}개`}
            title={`${item.name} ${number(item.count)}개`}
            key={item.name}
          >
            <i className={gradeClass(meta.grade)}>
              {meta.image ? <img src={meta.image} alt="" /> : <Icon />}
            </i>
            <em>×{number(item.count)}</em>
            <small>{item.name}</small>
          </span>
        )
      })}
    </div>
  )
}

function CostCell({ value }) {
  return (
    <span className="advanced-cost-cell">
      <GoldAmount>{number(value)}</GoldAmount>
    </span>
  )
}

function SegmentResult({ segment, prices }) {
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const { best } = segment
  const enhanced = best.counts.enhancedBonusTry > 0
  const comparisonRows = segment.reports
    .filter((report) => Number.isFinite(report.expectedPrice))
    .slice(0, 10)

  return (
    <section className="advanced-segment-result">
      <header className="advanced-segment-heading">
        <h3>
          {segment.fromStage}단계 → {segment.toStage}단계
        </h3>
        <button type="button" onClick={() => setComparisonOpen((value) => !value)}>
          전략 비교 {comparisonOpen ? '접기' : '펼치기'}
          {comparisonOpen ? <ChevronUp /> : <ChevronDown />}
        </button>
      </header>
      <div className="advanced-segment-scroll">
        <div className={`advanced-segment-grid ${enhanced ? 'enhanced' : ''}`}>
          <b>일반턴</b>
          <b>선조턴</b>
          {enhanced && <b>강화 선조턴</b>}
          <b>평균 트라이</b>
          <b>일반턴 비용</b>
          <b>무료턴 비용</b>
          <b>선조턴 비용</b>
          {enhanced && <b>강화 선조턴 비용</b>}

          <MaterialChoice items={best.normalItems} prices={prices} />
          <MaterialChoice items={best.bonusItems} prices={prices} />
          {enhanced && <MaterialChoice items={best.enhancedItems} prices={prices} />}
          <strong>{number(best.expectedTryCount)}회</strong>
          <CostCell value={best.paidNormalPrice} />
          <CostCell value={best.freeNormalPrice} />
          <CostCell value={best.bonusPrice} />
          {enhanced && <CostCell value={best.enhancedBonusPrice} />}
        </div>
      </div>
      {comparisonOpen && (
        <div className="advanced-strategy-comparison">
          <header>
            <strong>상급 재련 전략 비교</strong>
            <small>현재 시세로 계산한 평균 총비용 순위이며, 비용 차이는 1위 조합 기준입니다.</small>
          </header>
          <div className="advanced-strategy-scroll">
            <table>
              <thead>
                <tr>
                  <th>선택</th>
                  <th>순위</th>
                  <th>일반턴</th>
                  <th>선조턴</th>
                  {enhanced && <th>강화 선조턴</th>}
                  <th>평균 총비용</th>
                  <th>비용 차이</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((report, index) => {
                  const difference = report.expectedPrice - best.expectedPrice
                  const percentage =
                    best.expectedPrice > 0 ? (difference / best.expectedPrice) * 100 : 0
                  return (
                    <tr
                      className={index === 0 ? 'selected' : ''}
                      key={`${report.expectedPrice}-${index}`}
                    >
                      <td>
                        <span className="advanced-strategy-selection">
                          {index === 0 ? '✓' : '○'}
                        </span>
                      </td>
                      <td>{index === 0 ? <span title="최저 비용">🥇</span> : index + 1}</td>
                      <td>
                        <MaterialChoice items={report.normalItems} prices={prices} />
                      </td>
                      <td>
                        <MaterialChoice items={report.bonusItems} prices={prices} />
                      </td>
                      {enhanced && (
                        <td>
                          <MaterialChoice items={report.enhancedItems} prices={prices} />
                        </td>
                      )}
                      <td>
                        <CostCell value={report.expectedPrice} />
                      </td>
                      <td className="advanced-strategy-difference">
                        {index === 0
                          ? '-'
                          : `+${number(difference)} (+${percentage.toLocaleString('ko-KR', {
                              maximumFractionDigits: 1,
                            })}%)`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {segment.reports.length > comparisonRows.length && (
            <small className="advanced-strategy-limit">
              전체 {number(segment.reports.length)}개 조합 중 비용이 낮은 상위{' '}
              {comparisonRows.length}개를 표시합니다.
            </small>
          )}
        </div>
      )}
    </section>
  )
}

export default function AdvancedHoningOptimizerPage() {
  const [searchParams] = useSearchParams()
  const routeSearch = searchParams.toString()
  const routePreset = useMemo(() => routePresetFrom(searchParams), [routeSearch])
  const { representativeName } = useFavorites()
  const [draft, setDraft] = useState(initialSettings)
  const [bulkGrade, setBulkGrade] = useState('T4')
  const [bulkCurrent, setBulkCurrent] = useState(0)
  const [bulkTarget, setBulkTarget] = useState(0)
  const [marketPrices, setMarketPrices] = useState({})
  const [ownedInventories] = useState(getCharacterHoningInventories)
  const ownedCharacter =
    representativeName && ownedInventories[representativeName] ? representativeName : ''
  const [pricesReady, setPricesReady] = useState(false)
  const [results, setResults] = useState(null)
  const [activeEquipment, setActiveEquipment] = useState('chest')
  const [overallOpen, setOverallOpen] = useState(true)

  useEffect(() => {
    let active = true
    const names = allMaterialNames.map(marketNameFor).filter((name) => name !== '골드')
    const batches = Array.from({ length: Math.ceil(names.length / 30) }, (_, index) =>
      names.slice(index * 30, index * 30 + 30),
    )
    Promise.all(batches.map((batch) => lostArkApi.getMarketPrices(batch)))
      .then((responses) => active && setMarketPrices(Object.assign({}, ...responses)))
      .catch(() => active && setMarketPrices({}))
      .finally(() => active && setPricesReady(true))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!representativeName || routePreset) return undefined
    let active = true
    lostArkApi
      .getCharacter(representativeName)
      .then((data) => {
        if (!active) return
        const detected = representativeEquipmentFromArmory(data?.armory)
        const detectedItems = equipment.filter(
          (item) =>
            detected[item.id]?.advancedGrade && grades.includes(detected[item.id].advancedGrade),
        )
        if (!detectedItems.length) return

        setDraft((previous) =>
          Object.fromEntries(
            equipment.map((item) => {
              const current = detected[item.id]
              if (!current?.advancedGrade || !grades.includes(current.advancedGrade))
                return [item.id, previous[item.id]]
              const stage = Math.min(
                maxStageFor(current.advancedGrade),
                Math.max(0, current.advancedHoning),
              )
              return [
                item.id,
                {
                  ...previous[item.id],
                  grade: current.advancedGrade,
                  current: stage,
                  target: stage,
                },
              ]
            }),
          ),
        )
        const first = detected[detectedItems[0].id]
        setBulkGrade(first.advancedGrade)
        setBulkCurrent(first.advancedHoning)
        setBulkTarget(first.advancedHoning)
        setResults(null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // The inventory snapshot is intentionally read once with the representative equipment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [representativeName, routePreset])

  const updateSetting = (id, key, value) => {
    setDraft((previous) => {
      const next = { ...previous[id], [key]: value }
      if (key === 'grade') {
        const max = maxStageFor(value)
        next.current = Math.min(next.current, max)
        next.target = Math.min(next.target, max)
      }
      if (key === 'current' && next.target < value) next.target = value
      if (key === 'target' && next.current > value) next.current = value
      return { ...previous, [id]: next }
    })
  }

  const applyBulk = (key, value) => {
    if (key === 'grade') {
      const max = maxStageFor(value)
      setBulkGrade(value)
      setBulkCurrent((current) => Math.min(current, max))
      setBulkTarget((target) => Math.min(target, max))
    }
    if (key === 'current') setBulkCurrent(value)
    if (key === 'target') setBulkTarget(value)
    setDraft((previous) =>
      Object.fromEntries(
        equipment.map((item) => {
          const next = { ...previous[item.id], [key]: value }
          if (key === 'grade') {
            const max = maxStageFor(value)
            next.current = Math.min(next.current, max)
            next.target = Math.min(next.target, max)
          }
          if (key === 'current' && next.target < value) next.target = value
          if (key === 'target' && next.current > value) next.current = value
          return [item.id, next]
        }),
      ),
    )
  }

  const calculate = () => {
    const rawResults = equipment
      .filter((item) => draft[item.id].target > draft[item.id].current)
      .map((item) => calculateItem(item, draft[item.id], marketPrices))
    const calculated = applyOwnedMaterialsToResults(
      rawResults,
      ownedInventories[ownedCharacter] || {},
      (name) => unitPriceOf(name, marketPrices),
    ).results
    setResults(calculated)
    if (calculated.length) setActiveEquipment(calculated[0].id)
  }

  useEffect(() => {
    if (!routePreset || !pricesReady) return
    const maximum = maxStageFor(routePreset.grade)
    const current = Math.min(maximum, Math.max(0, routePreset.current))
    const target = Math.min(maximum, Math.max(current, routePreset.target))
    const selectedItem = equipment.find((item) => item.id === routePreset.equipmentId)
    const setting = { grade: routePreset.grade, current, target }
    const next = Object.fromEntries(
      equipment.map((item) => [
        item.id,
        item.id === routePreset.equipmentId ? setting : { ...initialSettings[item.id] },
      ]),
    )
    const rawResult = calculateItem(selectedItem, setting, marketPrices)
    const calculated = applyOwnedMaterialsToResults(
      [rawResult],
      ownedInventories[ownedCharacter] || {},
      (name) => unitPriceOf(name, marketPrices),
    ).results
    setDraft(next)
    setBulkGrade(routePreset.grade)
    setBulkCurrent(current)
    setBulkTarget(target)
    setResults(calculated)
    setActiveEquipment(routePreset.equipmentId)
    // The linked recommendation is calculated immediately once prices are ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePreset, pricesReady, marketPrices])

  const selected = results?.find((item) => item.id === activeEquipment) || results?.[0] || null
  const overall = useMemo(
    () => ({
      cost: (results || []).reduce((sum, item) => sum + item.cost, 0),
      attempts: (results || []).reduce((sum, item) => sum + item.attempts, 0),
    }),
    [results],
  )

  return (
    <main className="honing-optimizer-page advanced-honing-page page-content">
      <header className="honing-optimizer-heading panel">
        <span>
          <Crown />
        </span>
        <div>
          <small>ADVANCED HONING OPTIMIZER</small>
          <h1>상급 재련 최적화</h1>
          <p>설정한 구간에서 보조 재료와 야금술·재봉술 사용 여부별 평균 비용을 비교합니다.</p>
        </div>
      </header>

      <div className="honing-optimizer-layout">
        <aside className="honing-settings panel">
          <header>
            <div>
              <small>장비 설정</small>
              <h2>상급 재련 목표 설정</h2>
            </div>
          </header>
          <div className="honing-setting-list">
            <div className="honing-setting-row bulk">
              <div className="honing-setting-row-top">
                <strong>일괄</strong>
                <select
                  value={bulkGrade}
                  onChange={(event) => applyBulk('grade', event.target.value)}
                >
                  {grades.map((grade) => (
                    <option value={grade} key={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>
              <div className="honing-setting-row-bottom">
                <StageSelect
                  label="현재"
                  grade={bulkGrade}
                  value={bulkCurrent}
                  onChange={(value) => applyBulk('current', value)}
                />
                <StageSelect
                  label="목표"
                  grade={bulkGrade}
                  value={bulkTarget}
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
                    {grades.map((grade) => (
                      <option value={grade} key={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="honing-setting-row-bottom">
                  <StageSelect
                    label="현재"
                    grade={draft[item.id].grade}
                    value={draft[item.id].current}
                    onChange={(value) => updateSetting(item.id, 'current', value)}
                  />
                  <StageSelect
                    label="목표"
                    grade={draft[item.id].grade}
                    value={draft[item.id].target}
                    onChange={(value) => updateSetting(item.id, 'target', value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            className="honing-calculate"
            type="button"
            onClick={calculate}
            disabled={!pricesReady}
          >
            <Anvil /> {pricesReady ? '최적 조합 계산' : '시세 불러오는 중…'}
          </button>
        </aside>

        <section className="honing-results">
          {!results && (
            <div className="honing-result-card panel">
              <p>장비별 티어와 현재/목표 단계를 자유롭게 설정한 뒤 계산 버튼을 눌러 주세요.</p>
            </div>
          )}
          {results && (
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
                  <GoldAmount>{number(overall.cost)}</GoldAmount>
                </strong>
                {overallOpen ? <ChevronUp /> : <ChevronDown />}
              </button>
              <div className={`honing-overall-body panel ${overallOpen ? 'open' : ''}`}>
                {results.length ? (
                  results.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={selected?.id === item.id ? 'active' : ''}
                      onClick={() => setActiveEquipment(item.id)}
                    >
                      <span>{item.name}</span>
                      <b>
                        {item.current}단계 → {item.target}단계
                      </b>
                    </button>
                  ))
                ) : (
                  <p>목표 단계가 현재 단계보다 높은 장비를 설정해 주세요.</p>
                )}
              </div>

              {selected && (
                <article className="honing-result-card panel">
                  <header className="honing-result-title">
                    <span>{selected.name}</span>
                    <div>
                      <small>{selected.grade}</small>
                      <h2>
                        {selected.name} {selected.current}단계 → {selected.target}단계
                      </h2>
                    </div>
                  </header>

                  {selected.missingPrices.length > 0 && (
                    <p className="honing-missing-note">
                      {selected.missingPrices.join(', ')}은(는) 시세가 없어 총 골드 비용에서
                      제외했습니다.
                    </p>
                  )}

                  <div className="advanced-optimal-summary">
                    <strong>최적 재련</strong>
                    <div>
                      <small>평균 시도 횟수</small>
                      <b>{number(selected.attempts)}회</b>
                    </div>
                    <div>
                      <small>평균 비용</small>
                      <b>
                        <GoldAmount>{number(selected.cost)}</GoldAmount>
                      </b>
                    </div>
                  </div>
                  {selected.ownedDiscount > 0 && (
                    <p className="honing-owned-saving">
                      귀속 재료 적용으로 <GoldAmount>{number(selected.ownedDiscount)}</GoldAmount>을
                      절약할 수 있습니다. 최적 조합과 표시 비용은 기존 시세 기준입니다.
                    </p>
                  )}

                  <div className="honing-material-grid">
                    {selected.materials.map((material) => {
                      const Icon = iconFor(material.name)
                      const meta = materialMeta(material.name, marketPrices)
                      return (
                        <div
                          className={material.additional ? 'advanced-additional-material' : ''}
                          key={material.name}
                        >
                          <i className={gradeClass(meta.grade)}>
                            {meta.image ? <img src={meta.image} alt="" /> : <Icon />}
                          </i>
                          <span>
                            <small>
                              {material.name}
                              {material.additional ? ' · 추천' : ''}
                            </small>
                            <b>{number(material.count)}개</b>
                            {material.ownedUsed > 0 && (
                              <em>
                                귀속 {number(material.ownedUsed)}개 사용 시{' '}
                                <GoldAmount>{number(material.ownedSaving)}</GoldAmount> 절약
                              </em>
                            )}
                          </span>
                          <strong>
                            {material.cost !== null ? (
                              <GoldAmount>{number(material.cost)}</GoldAmount>
                            ) : (
                              '시세 없음'
                            )}
                          </strong>
                        </div>
                      )
                    })}
                  </div>

                  <section className="advanced-honing-segments">
                    <header>
                      <h3>구간별 최적 조합</h3>
                      <small>일반턴·선조턴별 최소 평균 비용</small>
                    </header>
                    {selected.segments.map((segment) => (
                      <SegmentResult
                        key={`${segment.fromStage}-${segment.toStage}`}
                        segment={segment}
                        prices={marketPrices}
                      />
                    ))}
                  </section>
                </article>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
