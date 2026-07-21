import { Clock3, RefreshCw, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CrystalIcon from '../components/CrystalIcon'
import AbilityStoneConfigurationSelect from '../components/AbilityStoneConfigurationSelect'
import { GoldAmount } from '../components/GoldIcon'
import pheonData from '../data/pheon-costs.json'
import { lostArkApi } from '../lib/api'
import { useCrystalGoldPrice } from '../lib/crystalRate'
import {
  getSharedAbilityStoneValue,
  resolveAbilityStoneConfiguration,
  storedAbilityStoneConfigurationId,
  storeAbilityStoneConfigurationId,
} from '../lib/sharedRewardValues'
import { efficiencyToolTabs } from '../lib/toolNavigation'
import '../mari-shop.css'
import { setLocalData } from '../lib/localData'

const gradeClass = (grade) =>
  ({
    고대: 'ancient',
    유물: 'relic',
    전설: 'legendary',
    영웅: 'epic',
    희귀: 'rare',
    고급: 'uncommon',
    일반: 'common',
  })[grade] || 'common'
const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '-'
const countdown = (milliseconds) => {
  if (milliseconds <= 0) return '갱신 중'
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = seconds % 60
  return `${hours}시간 ${minutes}분 ${remainSeconds}초`
}
const marketNameFor = (name) =>
  String(name || '')
    .replace(/\s*\(귀속\)\s*/g, ' ')
    .trim()
const gold = (value) => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const ABILITY_STONE_BOX = '비상의 돌 각인 지정 키트 상자'
const ABILITY_STONE_PHEON_COST = 9

export default function MariShopPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const [marketPrices, setMarketPrices] = useState({})
  const [marketLoading, setMarketLoading] = useState(false)
  const [abilityStoneValue, setAbilityStoneValue] = useState(null)
  const [abilityStoneLoading, setAbilityStoneLoading] = useState(true)
  const [abilityStoneConfigurationId, setAbilityStoneConfigurationId] = useState(
    storedAbilityStoneConfigurationId,
  )
  const [includePheonCost, setIncludePheonCost] = useState(
    () => localStorage.getItem('loark.includePheonCost') === 'true',
  )
  const crystalGoldPrice = useCrystalGoldPrice()

  useEffect(() => {
    let active = true
    const load = () =>
      lostArkApi
        .getMariShop()
        .then((result) => {
          if (active) {
            setData(result)
            setError('')
          }
        })
        .catch((fetchError) => {
          if (active) setError(fetchError.message)
        })
    load()
    const refreshTimer = window.setInterval(load, 30000)
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
      window.clearInterval(clockTimer)
    }
  }, [])

  useEffect(() => {
    const sourceRotations = data?.rotations?.length
      ? data.rotations
      : data?.products?.length
        ? [{ products: data.products }]
        : []
    const products = sourceRotations.flatMap((rotation) => rotation.products || [])
    const names = [
      ...new Set(
        products
          .filter((product) => product.name !== ABILITY_STONE_BOX)
          .map((product) => marketNameFor(product.name))
          .filter(Boolean),
      ),
    ]
    if (!names.length) return
    let active = true
    setMarketLoading(true)
    const batches = Array.from({ length: Math.ceil(names.length / 30) }, (_, index) =>
      names.slice(index * 30, index * 30 + 30),
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
  }, [data?.goodsVersion])

  useEffect(() => {
    let active = true
    setAbilityStoneLoading(true)
    getSharedAbilityStoneValue()
      .then((result) => {
        if (active) setAbilityStoneValue(result)
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

  useEffect(() => {
    setLocalData('loark.includePheonCost', String(includePheonCost))
  }, [includePheonCost])

  const rotations =
    data?.rotations ||
    (data?.products?.length
      ? [
          {
            label: '현재 회차',
            status: 'current',
            goodsVersion: data.goodsVersion,
            products: data.products,
          },
        ]
      : [])
  const stockAt = data?.nextRefreshAt ? new Date(data.nextRefreshAt).getTime() - 10000 : 0
  const selectedAbilityStoneConfiguration = resolveAbilityStoneConfiguration(
    abilityStoneValue,
    abilityStoneConfigurationId,
  )
  const selectAbilityStoneConfiguration = (id) => {
    setAbilityStoneConfigurationId(id)
    storeAbilityStoneConfigurationId(id)
  }

  return (
    <div className="efficiency-page mari-shop-page">
      <nav className="efficiency-tabs">
        {efficiencyToolTabs.map(([path, label]) => (
          <Link className={path === '/mari-shop' ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>
      <header className="efficiency-hero mari-shop-hero">
        <div className="efficiency-hero-icon mari-shop-heading-art">
          <img src="/images/rewards/sprite_shop.PNG" alt="" />
        </div>
        <div className="mari-shop-heading-copy">
          <p>MARI'S SECRET SHOP</p>
          <h1>마리의 비밀 상점 효율</h1>
          <span>현재 회차와 구매 가능한 지난 두 회차의 상품을 함께 확인합니다.</span>
        </div>
        <aside>
          <Clock3 />
          <span>새 상품 입고까지</span>
          <strong>{stockAt ? countdown(stockAt - now) : '--'}</strong>
          <small>매일 오전 6시 · 오후 6시</small>
          <label className={includePheonCost ? 'mari-pheon-toggle active' : 'mari-pheon-toggle'}>
            <span className="legendary">
              <img src={pheonData.image} alt="페온" />
            </span>
            <b>페온 가치 포함</b>
            <input
              type="checkbox"
              checked={includePheonCost}
              onChange={(event) => setIncludePheonCost(event.target.checked)}
            />
            <i />
          </label>
        </aside>
      </header>
      {error && <section className="panel mari-shop-state error">{error}</section>}
      {!error && !rotations.length && (
        <section className="panel mari-shop-state">
          <RefreshCw /> 마리 상점 상품을 불러오는 중입니다.
        </section>
      )}
      <div className="mari-rotations">
        {rotations.map((rotation, rotationIndex) => (
          <section
            className={`panel mari-rotation ${rotation.status === 'current' ? 'current' : ''}`}
            key={rotation.goodsVersion || rotationIndex}
          >
            <header>
              <div>
                <span>{rotation.label || `이전 ${rotationIndex}회차`}</span>
                <h2>{rotation.status === 'current' ? '현재 판매 상품' : '이전 판매 상품'}</h2>
              </div>
              <div>
                <b>구매 가능</b>
                {rotation.startsAt && (
                  <small>
                    {dateTime(rotation.startsAt)} ~ {dateTime(rotation.endsAt)}
                  </small>
                )}
              </div>
            </header>
            <div className="mari-product-grid">
              {(rotation.products || []).map((product) => {
                const marketName = marketNameFor(product.name)
                const market = marketPrices[marketName]
                const isCurrentHistoricalLow =
                  rotation.status === 'current' && product.historicalLowest
                const isAbilityStoneBox = product.name === ABILITY_STONE_BOX
                const abilityStonePrice =
                  Number(selectedAbilityStoneConfiguration?.currentMinPrice) || 0
                const pheonValuePerStone = includePheonCost
                  ? (ABILITY_STONE_PHEON_COST *
                      Number(pheonData.goldConversion.crystalsPerPheon || 0) *
                      crystalGoldPrice) /
                    100
                  : 0
                const marketValue = isAbilityStoneBox
                  ? abilityStonePrice > 0
                    ? (abilityStonePrice + pheonValuePerStone) * Number(product.quantity || 1)
                    : null
                  : market?.currentMinPrice > 0
                    ? (market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)) *
                      Number(product.quantity || 1)
                    : null
                const valueLoading = isAbilityStoneBox ? abilityStoneLoading : marketLoading
                const purchaseCost = (Number(product.crystalPrice || 0) / 100) * crystalGoldPrice
                const profit = marketValue == null ? null : marketValue - purchaseCost
                const efficiency =
                  marketValue == null || purchaseCost <= 0
                    ? null
                    : (marketValue / purchaseCost) * 100
                return (
                  <article
                    className={`mari-product ${profit == null ? 'unknown' : profit >= 0 ? 'recommended' : 'not-recommended'}`}
                    key={`${rotation.goodsVersion}-${product.itemCode}`}
                  >
                    <span className={`mari-product-icon ${gradeClass(product.grade)}`}>
                      {product.icon ? <img src={product.icon} alt="" /> : <ShoppingBag />}
                    </span>
                    <div>
                      <small>{product.grade || '등급 정보 없음'}</small>
                      <strong>{product.name}</strong>
                      <span>× {Number(product.quantity || 1).toLocaleString('ko-KR')}</span>
                      {isAbilityStoneBox && (
                        <AbilityStoneConfigurationSelect
                          data={abilityStoneValue}
                          loading={abilityStoneLoading}
                          selectedId={selectedAbilityStoneConfiguration?.id}
                          onSelect={selectAbilityStoneConfiguration}
                        />
                      )}
                    </div>
                    <div className="mari-price-stack">
                      <b className="mari-crystal-price">
                        {Number(product.crystalPrice || 0).toLocaleString('ko-KR')}
                        <CrystalIcon />
                      </b>
                      {product.historicalLowestCrystalPrice != null && (
                        <span className={isCurrentHistoricalLow ? 'is-lowest' : ''}>
                          {isCurrentHistoricalLow ? (
                            <>
                              지금이 역대 최저가 · {gold(product.historicalLowestCrystalPrice)}{' '}
                              <CrystalIcon />
                            </>
                          ) : (
                            <>
                              역대 최저 {gold(product.historicalLowestCrystalPrice)} <CrystalIcon />
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="mari-product-efficiency">
                      <span>
                        <small>구매 환산 비용</small>
                        <b>
                          <GoldAmount>{gold(purchaseCost)}</GoldAmount>
                        </b>
                      </span>
                      <span>
                        <small>
                          {isAbilityStoneBox
                            ? `경매장 기준 가치${includePheonCost ? ' · 페온 포함' : ''}`
                            : '거래소 기준 가치'}
                        </small>
                        <b>
                          {valueLoading ? (
                            '조회 중'
                          ) : marketValue == null ? (
                            '시세 없음'
                          ) : (
                            <GoldAmount>{gold(marketValue)}</GoldAmount>
                          )}
                        </b>
                      </span>
                      <span>
                        <small>예상 차익</small>
                        <b>
                          {profit == null ? (
                            '--'
                          ) : (
                            <GoldAmount>
                              {profit >= 0 ? '+' : ''}
                              {gold(profit)}
                            </GoldAmount>
                          )}
                        </b>
                      </span>
                      <strong>
                        {efficiency == null
                          ? '판단 불가'
                          : profit >= 0
                            ? `구매 추천 · ${efficiency.toFixed(1)}%`
                            : `구매 비추천 · ${efficiency.toFixed(1)}%`}
                      </strong>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
