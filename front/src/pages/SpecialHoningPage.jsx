import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { GoldAmount } from '../components/GoldIcon'
import { lostArkApi } from '../lib/api'
import { ALL_MATERIAL_NAMES, currentStagesForGrade, stagesForGrade } from '../lib/honingCalculator'
import { marketNameFor } from '../lib/honingPricing'
import { HONING_TIMEOUT_MS, runHoningCalculation } from '../lib/honingWorkerClient'
import {
  SPECIAL_REFINING_GRADES,
  specialRefiningSteps,
  stoneNameForGrade,
} from '../lib/specialRefiningCalculator'
import '../honing-optimizer.css'

const equipmentTypes = [
  { id: '방어구', name: '방어구' },
  { id: '무기', name: '무기' },
]

const number = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const percent = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 3 })

export default function SpecialHoningPage() {
  const [strongholdResearch, setStrongholdResearch] = useState(false)
  const [growthSupport, setGrowthSupport] = useState(false)
  const [equipmentType, setEquipmentType] = useState('방어구')
  const [grade, setGrade] = useState(SPECIAL_REFINING_GRADES[0])
  const [marketPrices, setMarketPrices] = useState({})
  const [pricesReady, setPricesReady] = useState(false)
  const [normalSteps, setNormalSteps] = useState(null)
  const [calculating, setCalculating] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

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

  const stoneName = stoneNameForGrade(grade)
  const stages = stagesForGrade(equipmentType, grade)
  const minCurrent = currentStagesForGrade(equipmentType, grade)[0]
  const maxTarget = stages[stages.length - 1]

  // Selecting 장비/등급 is the only input this page needs — it always compares the full stage
  // range (min~max for that grade) so there's no current/target concept to pick, unlike the
  // optimizer page where the user is honing a specific piece of gear.
  useEffect(() => {
    if (!pricesReady || stages.length === 0) return
    setNormalSteps(null)
    setTimedOut(false)
    setCalculating(true)
    const { promise, cancel } = runHoningCalculation({
      equipmentType,
      grade,
      currentStage: minCurrent,
      targetStage: maxTarget,
      supportState: { strongholdResearch, growthSupport },
      marketPrices,
    })
    promise
      .then((result) => setNormalSteps(result.steps))
      .catch((error) => {
        if (error.message === 'TIMEOUT') setTimedOut(true)
      })
      .finally(() => setCalculating(false))
    return cancel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentType, grade, strongholdResearch, growthSupport, pricesReady, marketPrices])

  const rows = specialRefiningSteps(equipmentType, minCurrent, maxTarget).map((step) => {
    const normalStep = normalSteps?.find((item) => item.toStage === step.stage)
    const normalCost = normalStep ? normalStep.expectedCost : null
    const impliedValue = normalCost !== null ? normalCost / step.expectedStoneUsage : null
    return { ...step, normalCost, impliedValue }
  })

  return (
    <main className="honing-optimizer-page page-content">
      <header className="honing-optimizer-heading panel">
        <span>
          <Sparkles />
        </span>
        <div>
          <small>HONING LAB</small>
          <h1>특수 재련 효율</h1>
          <p>
            특수 재련 돌파석의 시세는 알 수 없지만, 같은 단계의 일반 재련 평균 비용을 기준으로
            단계별 개당 골드 가치를 역산합니다.
          </p>
        </div>
      </header>

      <div className="honing-optimizer-layout">
        <aside className="honing-settings panel">
          <header>
            <div>
              <small>장비 설정</small>
              <h2>장비·등급 선택</h2>
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
                <strong>장비</strong>
                <select
                  value={equipmentType}
                  onChange={(event) => setEquipmentType(event.target.value)}
                >
                  {equipmentTypes.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="honing-setting-row-top">
                <strong>등급</strong>
                <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                  {SPECIAL_REFINING_GRADES.map((gradeOption) => (
                    <option value={gradeOption} key={gradeOption}>
                      {gradeOption} · {stoneNameForGrade(gradeOption)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </aside>

        <section className="honing-results">
          {!pricesReady && (
            <div className="honing-result-card panel honing-calculating-card">
              <Loader2 className="honing-spin" />
              <p>시세를 불러오는 중입니다…</p>
            </div>
          )}

          {pricesReady && calculating && (
            <div className="honing-result-card panel honing-calculating-card">
              <Loader2 className="honing-spin" />
              <p>
                {equipmentType} {grade} 단계별 효율을 계산하고 있습니다…
              </p>
            </div>
          )}

          {pricesReady && !calculating && timedOut && (
            <div className="honing-result-card panel">
              <p className="honing-missing-note">
                계산이 {HONING_TIMEOUT_MS / 1000}초를 넘어 중단되었습니다. 잠시 후 다시 시도해
                주세요.
              </p>
            </div>
          )}

          {pricesReady && !calculating && !timedOut && normalSteps && (
            <article className="honing-result-card panel">
              <header className="honing-result-title">
                <span>{equipmentType}</span>
                <div>
                  <small>{grade}</small>
                  <h2>{stoneName} 단계별 효율</h2>
                </div>
              </header>

              <div className="honing-attempt-table">
                <div className="honing-attempt-head cols-6-eff">
                  <span>단계</span>
                  <span>기본 확률</span>
                  <span>시도당 소모</span>
                  <span>기대 소모량</span>
                  <span>일반 재련 평균 비용</span>
                  <span>개당 환산 가치</span>
                </div>
                {rows.map((row) => (
                  <div className="honing-attempt-row cols-6-eff" key={row.stage}>
                    <span>{row.stage}강</span>
                    <span>{percent(row.probability)}%</span>
                    <span>{number(row.costPerAttempt)}개</span>
                    <span>{number(row.expectedStoneUsage)}개</span>
                    <span>
                      {row.normalCost !== null ? (
                        <GoldAmount>{number(row.normalCost)}</GoldAmount>
                      ) : (
                        '-'
                      )}
                    </span>
                    <span>
                      {row.impliedValue !== null ? (
                        <GoldAmount>{number(row.impliedValue)}</GoldAmount>
                      ) : (
                        '-'
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      </div>
    </main>
  )
}
