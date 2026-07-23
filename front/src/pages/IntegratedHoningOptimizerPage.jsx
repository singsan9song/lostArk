import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, ChevronRight, Loader2, LockKeyhole, PackageOpen, Route, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { GoldAmount } from '../components/GoldIcon'
import { lostArkApi } from '../lib/api'
import { useFavorites } from '../lib/favorites'
import { ALL_MATERIAL_NAMES, stagesForGrade } from '../lib/honingCalculator'
import { applyOwnedMaterialsToResults, getCharacterHoningInventories } from '../lib/honingInventory'
import {
  buildIntegratedItemOptions,
  INTEGRATED_ADVANCED_MATERIAL_NAMES,
  optimizeIntegratedEquipment,
} from '../lib/integratedHoningCalculator'
import { marketNameFor, unitPriceOf } from '../lib/honingPricing'
import { HONING_TIMEOUT_MS, runHoningCalculation } from '../lib/honingWorkerClient'
import {
  itemLevelPerRegularStage,
  representativeEquipmentFromArmory,
} from '../lib/representativeEquipment'
import '../integrated-honing-optimizer.css'

const equipment = [
  { id: 'helmet', name: '투구', type: '방어구' },
  { id: 'shoulder', name: '어깨', type: '방어구' },
  { id: 'chest', name: '상의', type: '방어구' },
  { id: 'pants', name: '하의', type: '방어구' },
  { id: 'gloves', name: '장갑', type: '방어구' },
  { id: 'weapon', name: '무기', type: '무기' },
]

const number = (value, digits = 1) =>
  Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: digits })

function actionSummary(actions, kind) {
  const selected = actions.filter((action) => action.kind === kind)
  if (!selected.length) return null
  return {
    from: selected[0].from,
    to: selected[selected.length - 1].to,
    cost: selected.reduce((sum, action) => sum + action.cost, 0),
    attempts: selected.reduce((sum, action) => sum + action.attempts, 0),
  }
}

function optimizerPath(row, kind, summary) {
  const params = new URLSearchParams({
    equipment: row.id,
    grade: kind === 'regular' ? row.detected.regularGrade : row.detected.advancedGrade,
    current: String(summary.from),
    target: String(summary.to),
  })
  return `${kind === 'regular' ? '/honing-optimizer' : '/advanced-honing-optimizer'}?${params}`
}

function materialMeta(name, prices) {
  if (name === '명예의 파편') return { image: '/images/rewards/money_13.png', grade: '일반' }
  if (name === '운명의 파편') return { image: '/images/rewards/money_15.png', grade: '일반' }
  const market = prices[marketNameFor(name)]
  return { image: market?.icon || null, grade: market?.grade || '' }
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

export default function IntegratedHoningOptimizerPage() {
  const { representativeName } = useFavorites()
  const [characterEquipment, setCharacterEquipment] = useState(null)
  const [currentLevel, setCurrentLevel] = useState(0)
  const [targetLevel, setTargetLevel] = useState('')
  const [characterState, setCharacterState] = useState('idle')
  const [marketPrices, setMarketPrices] = useState({})
  const [pricesReady, setPricesReady] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [ownedInventories] = useState(getCharacterHoningInventories)
  const cancelRef = useRef([])

  const getUnitPrice = (name) => unitPriceOf(name, marketPrices)

  useEffect(() => {
    if (!representativeName) {
      setPricesReady(false)
      setMarketPrices({})
      return undefined
    }
    let active = true
    setPricesReady(false)
    const names = [
      ...new Set(
        [...ALL_MATERIAL_NAMES, ...INTEGRATED_ADVANCED_MATERIAL_NAMES]
          .map(marketNameFor)
          .filter((name) => name !== '골드'),
      ),
    ]
    const batches = Array.from({ length: Math.ceil(names.length / 30) }, (_, index) =>
      names.slice(index * 30, index * 30 + 30),
    )
    Promise.all(batches.map((batch) => lostArkApi.getMarketPrices(batch)))
      .then((responses) => {
        if (active) setMarketPrices(Object.assign({}, ...responses))
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
  }, [representativeName])

  useEffect(() => {
    cancelRef.current.forEach((cancel) => cancel())
    cancelRef.current = []
    setResult(null)
    setError('')
    if (!representativeName) {
      setCharacterEquipment(null)
      setCurrentLevel(0)
      setTargetLevel('')
      setCharacterState('idle')
      return undefined
    }

    let active = true
    setCharacterState('loading')
    lostArkApi
      .getCharacter(representativeName)
      .then((data) => {
        if (!active) return
        const detected = representativeEquipmentFromArmory(data?.armory)
        if (!equipment.every((item) => detected[item.id])) {
          setCharacterState('error')
          return
        }
        const average =
          equipment.reduce((sum, item) => sum + detected[item.id].itemLevel, 0) / equipment.length
        setCharacterEquipment(detected)
        setCurrentLevel(average)
        setTargetLevel(Math.ceil((average + 0.01) / 5) * 5)
        setCharacterState('ready')
      })
      .catch(() => {
        if (active) setCharacterState('error')
      })
    return () => {
      active = false
    }
  }, [representativeName])

  useEffect(
    () => () => {
      cancelRef.current.forEach((cancel) => cancel())
    },
    [],
  )

  const calculate = async () => {
    const target = Number(targetLevel)
    if (!characterEquipment || !(target > currentLevel)) {
      setError('목표 아이템 레벨은 현재 아이템 레벨보다 높게 입력해 주세요.')
      return
    }

    cancelRef.current.forEach((cancel) => cancel())
    setCalculating(true)
    setResult(null)
    setError('')

    const requiredTotalGain = Math.ceil((target - currentLevel) * equipment.length - 1e-8)
    const maxRegularGain = Math.max(
      ...equipment.map((item) =>
        itemLevelPerRegularStage(characterEquipment[item.id].regularGrade),
      ),
    )
    const maxItemGain = requiredTotalGain + Math.max(0, maxRegularGain - 1)

    try {
      const jobs = equipment.map((item) => {
        const detected = characterEquipment[item.id]
        const stages = stagesForGrade(item.type, detected.regularGrade)
        const maximumStage = stages[stages.length - 1] || detected.enhancement
        const levelPerStage = itemLevelPerRegularStage(detected.regularGrade)
        const usefulTarget = Math.min(
          maximumStage,
          detected.enhancement + Math.ceil(maxItemGain / Math.max(1, levelPerStage)),
        )
        const handle = runHoningCalculation(
          {
            equipmentType: item.type,
            grade: detected.regularGrade,
            currentStage: detected.enhancement,
            targetStage: usefulTarget,
            supportState: { strongholdResearch: false, growthSupport: false },
            marketPrices,
            startProbability: null,
            startEnergy: null,
          },
          { timeoutMs: HONING_TIMEOUT_MS * 2 },
        )
        cancelRef.current.push(handle.cancel)
        return handle.promise
      })
      const regularResults = await Promise.all(jobs)
      cancelRef.current = []

      const advancedOptimizationCache = new Map()
      const items = equipment.map((item, index) => ({
        ...item,
        detected: characterEquipment[item.id],
        options: buildIntegratedItemOptions(
          item,
          characterEquipment[item.id],
          regularResults[index],
          getUnitPrice,
          maxItemGain,
          advancedOptimizationCache,
        ),
      }))
      const optimized = optimizeIntegratedEquipment(items, requiredTotalGain, maxRegularGain)
      if (!optimized) {
        setError('현재 장비에서 입력한 목표 레벨까지 도달할 수 있는 경로가 없습니다.')
        return
      }

      const inventory = ownedInventories[representativeName] || {}
      const annotated = applyOwnedMaterialsToResults(
        [{ cost: optimized.cost, materials: optimized.materials }],
        inventory,
        getUnitPrice,
      ).results[0]
      setResult({
        ...optimized,
        materials: annotated.materials,
        ownedDiscount: annotated.ownedDiscount,
        achievedLevel: currentLevel + optimized.actualGain / equipment.length,
      })
    } catch (calculationError) {
      setError(
        calculationError?.message === 'TIMEOUT'
          ? '일반 재련 경로 계산 시간이 초과되었습니다. 목표 레벨을 낮춰 다시 시도해 주세요.'
          : '통합 재련 경로를 계산하지 못했습니다.',
      )
    } finally {
      cancelRef.current = []
      setCalculating(false)
    }
  }

  const routeRows = useMemo(
    () =>
      (result?.selections || [])
        .map(({ item, option }) => ({
          ...item,
          option,
          regular: actionSummary(option.actions, 'regular'),
          advanced: actionSummary(option.actions, 'advanced'),
        }))
        .filter((item) => item.option.gain > 0),
    [result],
  )

  return (
    <main className="integrated-honing-page page-content">
      <header className="integrated-honing-heading panel">
        <span>
          <Boxes />
        </span>
        <div>
          <small>INTEGRATED HONING OPTIMIZER</small>
          <h1>통합 재련 최적화</h1>
          <p>
            대표 캐릭터의 일반·상급 재련을 함께 비교해 목표 레벨 이상에 도달하는 최소 기대비용
            경로를 찾습니다.
          </p>
        </div>
      </header>

      {!representativeName ? (
        <section className="integrated-honing-lock panel">
          <LockKeyhole />
          <h2>대표 캐릭터 설정이 필요합니다</h2>
          <p>통합 재련은 실제 장비 상태를 기준으로 계산하므로 대표 캐릭터를 먼저 지정해 주세요.</p>
          <Link to="/expedition">
            원정대에서 대표 캐릭터 설정 <ChevronRight />
          </Link>
        </section>
      ) : (
        <>
          <section className="integrated-honing-control panel">
            <header>
              <div>
                <small>대표 캐릭터</small>
                <h2>{representativeName}</h2>
              </div>
              <span className={characterState}>
                {characterState === 'loading'
                  ? '장비 불러오는 중'
                  : characterState === 'ready'
                    ? '장비 연동 완료'
                    : '장비 확인 필요'}
              </span>
            </header>

            {characterState === 'error' ? (
              <p className="integrated-honing-error">
                대표 캐릭터의 6부위 장비 정보를 불러오지 못했습니다.
              </p>
            ) : (
              <div className="integrated-level-control">
                <label>
                  <span>현재 아이템 레벨</span>
                  <strong>{characterState === 'ready' ? number(currentLevel, 2) : '-'}</strong>
                </label>
                <ChevronRight />
                <label>
                  <span>최소 목표 아이템 레벨</span>
                  <input
                    type="number"
                    min={currentLevel}
                    step="0.01"
                    value={targetLevel}
                    disabled={characterState !== 'ready'}
                    onChange={(event) => setTargetLevel(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={calculate}
                  disabled={characterState !== 'ready' || !pricesReady || calculating}
                >
                  {calculating ? <Loader2 className="integrated-spin" /> : <Target />}
                  {calculating
                    ? '최소 비용 경로 계산 중'
                    : pricesReady
                      ? '최소 비용 경로 찾기'
                      : '시세 불러오는 중'}
                </button>
              </div>
            )}
            {error && <p className="integrated-honing-error">{error}</p>}
          </section>

          {characterEquipment && (
            <section className="integrated-current-equipment panel">
              <header>
                <h2>현재 장비 상태</h2>
                <small>대표 캐릭터 API 기준</small>
              </header>
              <div>
                {equipment.map((item) => {
                  const current = characterEquipment[item.id]
                  return (
                    <article key={item.id}>
                      <strong>{item.name}</strong>
                      <span>{current.regularGrade}</span>
                      <b>+{current.enhancement}</b>
                      <small>상급 재련 {current.advancedHoning}단계</small>
                      <em>Lv. {number(current.itemLevel)}</em>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {result && (
            <>
              <section className="integrated-result-summary panel">
                <div>
                  <Route />
                  <span>
                    <small>추천 도달 레벨</small>
                    <strong>Lv. {number(result.achievedLevel, 2)}</strong>
                  </span>
                </div>
                <div>
                  <small>최소 평균 비용</small>
                  <strong>
                    <GoldAmount>{number(result.cost)}</GoldAmount>
                  </strong>
                </div>
                <div>
                  <small>평균 재련 시도</small>
                  <strong>{number(result.attempts)}회</strong>
                </div>
                {result.ownedDiscount > 0 && (
                  <div className="saving">
                    <small>귀속 재료 사용 시 절약</small>
                    <strong>
                      <GoldAmount>{number(result.ownedDiscount)}</GoldAmount>
                    </strong>
                  </div>
                )}
              </section>

              <section className="integrated-route panel">
                <header>
                  <h2>최소 비용 추천 경로</h2>
                  <small>
                    목표 이상에 도달하는 조합 중 비용이 가장 낮은 최종 단계를 표시합니다.
                  </small>
                </header>
                <div className="integrated-route-list">
                  {routeRows.map((row) => (
                    <article key={row.id}>
                      <header>
                        <strong>{row.name}</strong>
                        <span>아이템 레벨 +{number(row.option.gain)}</span>
                        <b>
                          <GoldAmount>{number(row.option.cost)}</GoldAmount>
                        </b>
                      </header>
                      <div>
                        {row.regular && (
                          <Link
                            to={optimizerPath(row, 'regular', row.regular)}
                            title="일반 재련 최적화에서 상세 전략 보기"
                          >
                            <i>일반 재련</i>
                            <b>
                              +{row.regular.from} → +{row.regular.to}
                            </b>
                            <small>
                              평균 {number(row.regular.attempts)}회 ·{' '}
                              <GoldAmount>{number(row.regular.cost)}</GoldAmount>
                            </small>
                            <ChevronRight />
                          </Link>
                        )}
                        {row.advanced && (
                          <Link
                            to={optimizerPath(row, 'advanced', row.advanced)}
                            title="상급 재련 최적화에서 상세 전략 보기"
                          >
                            <i>상급 재련</i>
                            <b>
                              {row.advanced.from} → {row.advanced.to}단계
                            </b>
                            <small>
                              평균 {number(row.advanced.attempts)}회 ·{' '}
                              <GoldAmount>{number(row.advanced.cost)}</GoldAmount>
                            </small>
                            <ChevronRight />
                          </Link>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="integrated-materials panel">
                <header>
                  <h2>예상 재료</h2>
                  <small>귀속 재료는 경로와 표시 비용을 바꾸지 않고 절약액만 계산합니다.</small>
                </header>
                <div>
                  {result.materials.map((material) => {
                    const meta = materialMeta(material.name, marketPrices)
                    return (
                      <article key={material.name}>
                        <i className={gradeClass(meta.grade)}>
                          {meta.image ? <img src={meta.image} alt="" /> : <PackageOpen />}
                        </i>
                        <span>
                          <small>{material.name}</small>
                          <b>{number(material.expectedCount)}개</b>
                          {material.ownedUsed > 0 && (
                            <em>
                              귀속 {number(material.ownedUsed)}개 사용 시{' '}
                              <GoldAmount>{number(material.ownedSaving)}</GoldAmount> 절약
                            </em>
                          )}
                        </span>
                        <strong>
                          {material.cost === null ? (
                            '시세 없음'
                          ) : (
                            <GoldAmount>{number(material.cost)}</GoldAmount>
                          )}
                        </strong>
                      </article>
                    )
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  )
}
