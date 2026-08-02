import { useEffect, useMemo, useState } from 'react'
import { CalendarHeart, ChevronDown, PackageOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import eventShopData from '../data/event-shop.json'
import gemBoxData from '../data/ark-pass-gem-box-probabilities.json'
import { GoldAmount } from '../components/GoldIcon'
import { lostArkApi } from '../lib/api'
import { efficiencyToolTabs } from '../lib/toolNavigation'
import '../single-coin.css'
import '../event-shop.css'

const format = (value, maximumFractionDigits = 1) =>
  Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits })
const gradeClass = (grade) =>
  ({
    고대: 'ancient',
    유물: 'relic',
    전설: 'legendary',
    영웅: 'epic',
    희귀: 'rare',
    고급: 'uncommon',
    일반: 'common',
  })[grade] || 'normal'
const CurrencyIcon = ({ currency, className = '' }) => (
  <img
    className={`event-shop-currency-icon ${gradeClass(currency.grade)} ${className}`.trim()}
    src={currency.image}
    alt={currency.name}
  />
)
const marketUnitValue = (market) =>
  market?.currentMinPrice > 0
    ? market.currentMinPrice / Math.max(1, Number(market.bundleCount) || 1)
    : null
const heroGemMarketNames = gemBoxData.gemTypes.map((gem) => `${gem.name}|영웅`)
const requestedMarketNames = [
  ...heroGemMarketNames,
  ...eventShopData.products
    .flatMap((product) => [
      product.valuation?.marketName,
      ...(product.valuation?.options || []).map((option) => option.marketName),
    ])
    .filter(Boolean),
]

const heroGemBoxValue = (marketPrices) => {
  const values = gemBoxData.gemTypes.map((gem) => {
    const unitValue = marketUnitValue(marketPrices[`${gem.name}|영웅`])
    return unitValue == null ? null : unitValue * Number(gem.probability || 0)
  })
  return values.some((value) => value == null)
    ? null
    : values.reduce((sum, value) => sum + value, 0)
}

const selectionOptionValue = (option, marketPrices) => {
  const unitValue = marketUnitValue(marketPrices[option.marketName])
  return unitValue == null ? null : unitValue * Number(option.quantity || 1)
}

const selectedOptionFor = (product, marketPrices, selectedOptionName) => {
  const options = product.valuation?.options || []
  return (
    options.find((option) => option.marketName === selectedOptionName) ||
    [...options].sort(
      (left, right) =>
        (selectionOptionValue(right, marketPrices) ?? -1) -
        (selectionOptionValue(left, marketPrices) ?? -1),
    )[0] ||
    null
  )
}

const productValue = (product, marketPrices, selectedOptionName) => {
  const valuation = product.valuation
  if (!valuation) return null
  if (valuation.type === 'fixedGold')
    return Number(valuation.goldPerItem || 0) * Number(product.rewardQuantity || 1)
  if (valuation.type === 'market') {
    const unitValue = marketUnitValue(marketPrices[valuation.marketName])
    return unitValue == null ? null : unitValue * Number(product.rewardQuantity || 1)
  }
  if (valuation.type === 'selection') {
    const selectedOption = selectedOptionFor(product, marketPrices, selectedOptionName)
    const value = selectedOption ? selectionOptionValue(selectedOption, marketPrices) : null
    return value == null ? null : value * Number(product.rewardQuantity || 1)
  }
  if (valuation.type === 'heroGemBox') {
    const value = heroGemBoxValue(marketPrices)
    return value == null ? null : value * Number(product.rewardQuantity || 1)
  }
  return null
}

export default function EventShopPage() {
  const [activeCategoryId, setActiveCategoryId] = useState(eventShopData.defaultCategoryId)
  const [marketPrices, setMarketPrices] = useState({})
  const [selectedOptions, setSelectedOptions] = useState({})
  const [expandedSelectionId, setExpandedSelectionId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    lostArkApi
      .getMarketPrices(requestedMarketNames)
      .then((result) => {
        if (active) setMarketPrices(result || {})
      })
      .catch((requestError) => {
        if (active)
          setError(requestError.message || '상품 시세를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const products = useMemo(
    () =>
      eventShopData.products.map((product, index) => {
        const selectedOption =
          product.valuation?.type === 'selection'
            ? selectedOptionFor(product, marketPrices, selectedOptions[product.id])
            : null
        const value = productValue(product, marketPrices, selectedOptions[product.id])
        return {
          ...product,
          index,
          selectedOption,
          value,
          valuePerPostcard: value == null ? null : value / product.cost,
          totalCost: product.cost * product.exchangeLimit,
          totalValue: value == null ? null : value * product.exchangeLimit,
          marketIcon:
            product.valuation?.type === 'market'
              ? marketPrices[product.valuation.marketName]?.icon
              : null,
        }
      }),
    [marketPrices, selectedOptions],
  )
  const activeCategory =
    eventShopData.categories.find((category) => category.id === activeCategoryId) ||
    eventShopData.categories[0]
  const activeCurrency = activeCategory.currency || eventShopData.currency
  const visibleProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            (product.categoryId || eventShopData.defaultCategoryId) === activeCategoryId,
        )
        .sort((left, right) => {
          if (left.valuePerPostcard == null && right.valuePerPostcard == null)
            return left.index - right.index
          if (left.valuePerPostcard == null) return 1
          if (right.valuePerPostcard == null) return -1
          return right.valuePerPostcard - left.valuePerPostcard || left.index - right.index
        }),
    [activeCategoryId, products],
  )
  const totalCost = visibleProducts.reduce((sum, product) => sum + product.totalCost, 0)
  const valuedProducts = visibleProducts.filter((product) => product.value != null)
  const knownTotalValue = valuedProducts.reduce((sum, product) => sum + product.totalValue, 0)

  return (
    <div className="efficiency-page event-shop-page">
      <nav className="efficiency-tabs">
        {efficiencyToolTabs.map(([path, label]) => (
          <Link className={path === '/event-shop' ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>

      <header className="efficiency-hero event-shop-hero">
        <div className="efficiency-hero-icon">
          <CalendarHeart />
        </div>
        <div>
          <p>MAHARAKA EVENT SHOP</p>
          <h1>이벤트 상점 효율</h1>
          <span>
            {activeCurrency.name}으로 교환하는 상품의 1회 가치와 토큰당 효율을
            비교합니다.
          </span>
        </div>
      </header>

      <nav className="event-shop-categories" aria-label="이벤트 상점 카테고리">
        {eventShopData.categories.map((category) => (
          <button
            className={category.id === activeCategoryId ? 'active' : ''}
            type="button"
            onClick={() => setActiveCategoryId(category.id)}
            key={category.id}
          >
            <span>{category.name}</span>
            <small>{category.description}</small>
          </button>
        ))}
      </nav>

      <section className="panel event-shop-summary">
        <span>
          <small>등록 상품</small>
          <b>{visibleProducts.length}종</b>
        </span>
        <span>
          <small>가치 계산 완료</small>
          <b>
            {valuedProducts.length}/{visibleProducts.length}종
          </b>
        </span>
        <span>
          <small>확인된 전량 가치</small>
          <b>
            {loading ? '계산 중' : <GoldAmount>{format(knownTotalValue)}</GoldAmount>}
          </b>
        </span>
        <span>
          <small>전 상품 교환 비용</small>
          <b className="event-shop-total-cost">
            <CurrencyIcon currency={activeCurrency} />
            {format(totalCost, 0)}개
          </b>
        </span>
      </section>

      {error && <p className="event-shop-error">{error}</p>}

      <section className="panel event-shop-products">
        <header>
          <div>
            <PackageOpen />
            <span>
              <h2>{activeCategory.name}</h2>
              <p>{activeCurrency.name}당 가치가 높은 상품부터 표시합니다.</p>
            </span>
          </div>
        </header>

        {visibleProducts.length ? (
          <div className="single-coin-table event-shop-table">
            <div className="single-coin-head">
              <span>순위</span>
              <span>아이템</span>
              <span>{activeCurrency.name}</span>
              <span>교환 아이템</span>
              <span>토큰당 가치</span>
            </div>
            {visibleProducts.map((product, displayIndex) => {
              const image = product.image || product.marketIcon
              const selectionOptions =
                product.valuation?.type === 'selection' && product.selectedOption
                  ? [
                      product.selectedOption,
                      ...product.valuation.options.filter(
                        (option) =>
                          option.marketName !== product.selectedOption.marketName,
                      ),
                    ]
                  : product.valuation?.options || []
              const selectionExpanded = expandedSelectionId === product.id
              const visibleSelectionOptions = selectionExpanded
                ? selectionOptions
                : selectionOptions.slice(0, 1)
              return (
                <article className="single-coin-row event-shop-row" key={product.id}>
                  <em className="single-value-rank">
                    {product.valuePerPostcard == null ? '-' : `${displayIndex + 1}위`}
                  </em>
                  <span className="single-item">
                    {image ? (
                      <img loading="lazy" className={gradeClass(product.grade)} src={image} alt="" />
                    ) : (
                      <i>
                        <PackageOpen />
                      </i>
                    )}
                    <span>
                      <b>{product.name}</b>
                      <small>교환 제한 {format(product.exchangeLimit, 0)}회</small>
                    </span>
                  </span>
                  <span className="single-coin-cost-cell">
                    <img
                      className={`event-shop-cost-currency ${gradeClass(activeCurrency.grade)}`}
                      src={activeCurrency.image}
                      alt={activeCurrency.name}
                    />
                    <span className="single-coin-cost-copy">
                      <span>
                        <em>1회 교환</em>
                        <strong>{format(product.cost, 0)}개</strong>
                      </span>
                      <span>
                        <em>전량</em>
                        <strong>{format(product.totalCost, 0)}개</strong>
                      </span>
                    </span>
                  </span>
                  <span
                    className={`single-exchange-options ${
                      selectionExpanded ? 'expanded' : ''
                    }`}
                  >
                    {product.valuation?.type === 'selection' ? (
                      visibleSelectionOptions.map((option) => {
                        const market = marketPrices[option.marketName]
                        const optionValue = selectionOptionValue(option, marketPrices)
                        const totalOptionValue =
                          optionValue == null
                            ? null
                            : optionValue * Number(product.rewardQuantity || 1)
                        const selected =
                          product.selectedOption?.marketName === option.marketName
                        return (
                          <button
                            type="button"
                            className={`selectable ${selected ? 'selected' : ''}`}
                            aria-pressed={selected}
                            aria-expanded={selected ? selectionExpanded : undefined}
                            onClick={() => {
                              if (!selectionExpanded) {
                                setExpandedSelectionId(product.id)
                                return
                              }
                              if (!selected)
                                setSelectedOptions((current) => ({
                                  ...current,
                                  [product.id]: option.marketName,
                                }))
                              setExpandedSelectionId(null)
                            }}
                            key={option.marketName}
                          >
                            {market?.icon ? (
                              <img
                                className={gradeClass(market.grade)}
                                src={market.icon}
                                alt=""
                              />
                            ) : (
                              <i>
                                <PackageOpen />
                              </i>
                            )}
                            <span className="single-option-copy">
                              <span className="single-option-line">
                                <b>{option.name}</b>
                                <small>{format(option.quantity, 0)}개</small>
                              </span>
                              {selected && (
                                <em className="single-selected-badge">선택됨</em>
                              )}
                            </span>
                            <strong>
                              {totalOptionValue == null ? (
                                '--'
                              ) : (
                                <GoldAmount>{format(totalOptionValue)}</GoldAmount>
                              )}
                              {selected && <ChevronDown className="single-option-chevron" />}
                            </strong>
                          </button>
                        )
                      })
                    ) : (
                      <span>
                        {image ? (
                          <img loading="lazy" className={gradeClass(product.grade)} src={image} alt="" />
                        ) : (
                          <i>
                            <PackageOpen />
                          </i>
                        )}
                        <span>
                          <b>{product.name}</b>
                          <small>보상 {format(product.rewardQuantity, 0)}개</small>
                        </span>
                        <strong>
                          {loading ? (
                            '계산 중'
                          ) : product.value == null ? (
                            '--'
                          ) : (
                            <GoldAmount>{format(product.value)}</GoldAmount>
                          )}
                        </strong>
                      </span>
                    )}
                  </span>
                  <strong className="coin-gold-value">
                    {product.valuePerPostcard == null ? (
                      '--'
                    ) : (
                      <GoldAmount>{format(product.valuePerPostcard, 2)}</GoldAmount>
                    )}
                  </strong>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="event-shop-category-empty">
            <PackageOpen />
            <b>{activeCategory.name} 상품 데이터가 없습니다.</b>
            <span>교환 상품을 알려주시면 이 카테고리에 이어서 등록할 수 있습니다.</span>
          </div>
        )}
      </section>
    </div>
  )
}
