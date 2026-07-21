import { useEffect, useMemo, useState } from 'react'
import {
  Anvil,
  ChevronDown,
  ChevronUp,
  Coins,
  Gem,
  Layers3,
  PackageOpen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { GoldAmount } from '../components/GoldIcon'
import { lostArkApi } from '../lib/api'
import { GRADE_OPTIONS, simulateRange, stagesForGrade } from '../lib/honingCalculator'
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
const GENERIC_STAGES = Array.from({ length: 26 }, (_, index) => index)
const initialSettings = Object.fromEntries(
  equipment.map((item) => [
    item.id,
    { grade: DEFAULT_GRADE, current: 10, target: item.id === 'chest' ? 12 : 10 },
  ]),
)

// Most of these material names are bound and have no market listing; 명예의 파편 is only
// tradeable in its bundled form. Anything that doesn't resolve to a price is shown as
// quantity-only rather than guessing a value.
const shardConversions = {
  '명예의 파편': { marketName: '명예의 파편 주머니(대)', contents: 1500 },
}
const marketNameFor = (name) => shardConversions[name]?.marketName || name
const marketAmountFor = (name, count) =>
  shardConversions[name] ? count / shardConversions[name].contents : count
const materialGoldValue = (name, count, prices) => {
  if (name === '골드') return count
  const market = prices[marketNameFor(name)]
  if (!(market?.currentMinPrice > 0)) return null
  return (
    (market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)) *
    marketAmountFor(name, count)
  )
}
const iconFor = (name) => {
  if (name === '골드') return Coins
  if (name.includes('돌파') || name.includes('명예')) return Gem
  if (name.includes('수호')) return ShieldCheck
  if (name.includes('융화')) return PackageOpen
  return Sparkles
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

  const supportState = { strongholdResearch, growthSupport }

  const simulations = useMemo(() => {
    if (!calculated) return {}
    return Object.fromEntries(
      equipment
        .filter((item) => calculated[item.id].target > calculated[item.id].current)
        .map((item) => {
          const setting = calculated[item.id]
          return [
            item.id,
            simulateRange({
              equipmentType: item.type,
              grade: setting.grade,
              currentStage: setting.current,
              targetStage: setting.target,
              supportState,
            }),
          ]
        }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculated, strongholdResearch, growthSupport])

  const resultItems = equipment.filter((item) => simulations[item.id])
  const selectedItem =
    resultItems.find((item) => item.id === activeEquipment) || resultItems[0] || null
  const selectedSimulation = selectedItem ? simulations[selectedItem.id] : null
  const selectedSetting = selectedItem ? calculated[selectedItem.id] : null

  useEffect(() => {
    if (!selectedSimulation?.steps.length) return
    if (!selectedSimulation.steps.some((step) => step.fromStage === activeSegment))
      setActiveSegment(selectedSimulation.steps[0].fromStage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSimulation])

  useEffect(() => {
    const names = new Set()
    Object.values(simulations).forEach((simulation) =>
      simulation.materials.forEach((material) => names.add(marketNameFor(material.name))),
    )
    const uniqueNames = [...names].filter((name) => name !== '골드')
    if (!uniqueNames.length) return
    let active = true
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
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculated, strongholdResearch, growthSupport])

  const updateSetting = (id, key, value) => {
    setDraft((previous) => ({ ...previous, [id]: { ...previous[id], [key]: value } }))
  }

  const applyBulk = (key, value) => {
    if (key === 'grade') setBulkGrade(value)
    else if (key === 'current') setBulkCurrent(value)
    else setBulkTarget(value)
    if (value === '') return
    setDraft((previous) =>
      Object.fromEntries(
        equipment.map((item) => [item.id, { ...previous[item.id], [key]: value }]),
      ),
    )
  }

  const calculate = () => {
    const normalized = Object.fromEntries(
      equipment.map((item) => {
        const setting = draft[item.id]
        return [item.id, { ...setting, target: Math.max(setting.current, setting.target) }]
      }),
    )
    setCalculated(normalized)
    const firstChanged = equipment.find(
      (item) => normalized[item.id].target > normalized[item.id].current,
    )
    if (firstChanged) setActiveEquipment(firstChanged.id)
  }

  const materialCostSummary = (materials) => {
    let goldTotal = 0
    let hasUnpriced = false
    materials.forEach(({ name, expectedCount }) => {
      const value = materialGoldValue(name, expectedCount, marketPrices)
      if (value === null) hasUnpriced = true
      else goldTotal += value
    })
    return { goldTotal, hasUnpriced }
  }

  const activeStep = selectedSimulation?.steps.find((step) => step.fromStage === activeSegment)
  const displayRows = activeStep
    ? activeStep.attemptRows.length <= 10
      ? activeStep.attemptRows
      : [
          ...activeStep.attemptRows.slice(0, 9),
          activeStep.attemptRows[activeStep.attemptRows.length - 1],
        ]
    : []
  const truncated = activeStep ? activeStep.attemptRows.length > 10 : false

  return (
    <main className="honing-optimizer-page page-content">
      <header className="honing-optimizer-heading panel">
        <span>
          <Anvil />
        </span>
        <div>
          <small>HONING OPTIMIZER</small>
          <h1>재련 최적화</h1>
          <p>장비별 등급과 목표 단계를 설정하고 예상 재료·시도 횟수를 계산합니다.</p>
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
              군령 재련 지원
            </label>
            <label>
              <input
                type="checkbox"
                checked={growthSupport}
                onChange={(event) => setGrowthSupport(event.target.checked)}
              />{' '}
              재련 성장 지원
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
                  options={GENERIC_STAGES}
                  onChange={(value) => applyBulk('current', value)}
                />
                <StageSelect
                  label="목표"
                  value={bulkTarget}
                  options={GENERIC_STAGES}
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
                    options={GENERIC_STAGES}
                    onChange={(value) => updateSetting(item.id, 'current', value)}
                  />
                  <StageSelect
                    label="목표"
                    value={draft[item.id].target}
                    options={stagesForGrade(item.type, draft[item.id].grade)}
                    onChange={(value) => updateSetting(item.id, 'target', value)}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="honing-calculate" type="button" onClick={calculate}>
            <Anvil /> 계산
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
                <strong>{resultItems.length}개 장비</strong>
                {overallOpen ? <ChevronUp /> : <ChevronDown />}
              </button>

              <div className={`honing-overall-body panel ${overallOpen ? 'open' : ''}`}>
                {resultItems.length ? (
                  resultItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={selectedItem?.id === item.id ? 'active' : ''}
                      onClick={() => setActiveEquipment(item.id)}
                    >
                      <span>{item.name}</span>
                      <b>
                        {calculated[item.id].current}강 → {calculated[item.id].target}강
                      </b>
                    </button>
                  ))
                ) : (
                  <p>목표 단계가 현재 단계보다 높은 장비를 설정해 주세요.</p>
                )}
              </div>

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

                  <div className="honing-average-cost">
                    <div>
                      <small>예상 시도 횟수</small>
                      <strong>{number(selectedSimulation.expectedAttempts)}회</strong>
                      <span>
                        최대{' '}
                        {selectedSimulation.steps.reduce(
                          (sum, step) => sum + step.attemptRows.length,
                          0,
                        )}
                        회 (확정 성공 기준)
                      </span>
                    </div>
                    <p>
                      골드 비용은 시세 조회가 가능한 재료만 반영한 참고값입니다. 촉매(추가 재료)
                      사용은 계산에 포함하지 않았습니다.
                    </p>
                  </div>

                  <div className="honing-material-grid">
                    {selectedSimulation.materials.map(({ name, expectedCount }) => {
                      const Icon = iconFor(name)
                      const value = materialGoldValue(name, expectedCount, marketPrices)
                      return (
                        <div key={name}>
                          <i>
                            <Icon />
                          </i>
                          <span>
                            <small>{name}</small>
                            <b>{number(expectedCount)}개</b>
                          </span>
                          <strong>
                            {value !== null ? (
                              <GoldAmount>{number(value)}</GoldAmount>
                            ) : (
                              '시세 없음'
                            )}
                          </strong>
                        </div>
                      )
                    })}
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
                            <small>최대 시도 횟수</small>
                            <b>{activeStep.attemptRows.length}회</b>
                            <em>확정 성공 기준</em>
                          </span>
                          <span>
                            <small>평균 비용</small>
                            <b>
                              {(() => {
                                const { goldTotal, hasUnpriced } = materialCostSummary(
                                  activeStep.materials.map((material) => ({
                                    name: material.name,
                                    expectedCount: material.expectedCount,
                                  })),
                                )
                                return (
                                  <>
                                    <GoldAmount>{number(goldTotal)}</GoldAmount>
                                    {hasUnpriced && <em> +시세 미확인 재료</em>}
                                  </>
                                )
                              })()}
                            </b>
                          </span>
                        </div>
                      </header>

                      <div className="honing-attempt-table">
                        <div className="honing-attempt-head">
                          <span>시도</span>
                          <span>도달 확률</span>
                          <span>성공 확률</span>
                          <span>장인의 기운</span>
                          <span>결과</span>
                        </div>
                        {displayRows.map((row, index) => (
                          <div className="honing-attempt-row" key={row.attempt}>
                            <span>
                              {truncated && index === displayRows.length - 1
                                ? '…'
                                : `${row.attempt}회`}
                            </span>
                            <span>{percent(row.reachProbability * 100)}%</span>
                            <span>{percent(row.probability)}%</span>
                            <span>{percent(row.energyBefore)}%</span>
                            <strong>{row.guaranteed ? '확정 성공' : '일반'}</strong>
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
