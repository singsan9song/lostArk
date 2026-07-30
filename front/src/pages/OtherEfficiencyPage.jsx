import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Dices,
  Edit3,
  Image as ImageIcon,
  Layers3,
  ListChecks,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { GoldAmount } from '../components/GoldIcon'
import rewardImageNames from '../data/reward-image-manifest.json'
import { lostArkApi } from '../lib/api'
import { setLocalData } from '../lib/localData'
import { efficiencyToolTabs } from '../lib/toolNavigation'
import '../other-efficiency.css'

const STORAGE_KEY = 'loark-other-efficiency-catalog'
const GRADES = ['', '일반', '고급', '희귀', '영웅', '전설', '유물', '고대']
const TYPES = {
  item: { label: '아이템', icon: CircleDollarSign },
  selection: { label: '선택 상자', icon: ListChecks },
  random: { label: '랜덤 상자', icon: Dices },
  all: { label: '전체 지급 상자', icon: PackageOpen },
}
const BOX_TYPES = ['selection', 'random', 'all']
const rewardImages = rewardImageNames.map((name) => `/images/rewards/${name}`)
const uid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
const number = (value) => Math.max(0, Number(value) || 0)
const format = (value, digits = 1) =>
  Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: digits })
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

const cloneNode = (node) => {
  const copy = { ...node }
  delete copy.catalogEntryId
  return {
    ...copy,
    id: uid(),
    selectedChildId: null,
    children: (node.children || []).map(cloneNode),
  }
}

const copyNode = (node) => ({
  ...node,
  children: (node.children || []).map(copyNode),
})

const standaloneSnapshot = (node, id) => {
  const snapshot = copyNode(node)
  delete snapshot.catalogEntryId
  snapshot.id = id
  return snapshot
}

const linkedComponents = (node, result = []) => {
  if (node.catalogEntryId) result.push(node)
  ;(node.children || []).forEach((child) => linkedComponents(child, result))
  return result
}

const itemFromMarket = (item) => ({
  id: uid(),
  type: 'item',
  name: item.name,
  image: item.icon || '',
  grade: item.grade || '',
  quantity: 1,
  unitPrice: number(item.currentMinPrice) / Math.max(1, number(item.bundleCount)),
  bundleCount: Math.max(1, number(item.bundleCount)),
  marketName: `${item.name}${item.grade ? `|${item.grade}` : ''}`,
  source: item.source || 'market',
  children: [],
})

const createBox = ({ type, name, image, grade }) => ({
  id: uid(),
  type,
  name: name.trim() || TYPES[type].label,
  image: image || '',
  grade: grade || '',
  quantity: 1,
  selectedChildId: null,
  children: [],
})

const evaluate = (node) => {
  const quantity = number(node.quantity)
  if (node.type === 'item') {
    const value = number(node.unitPrice) * quantity
    return { value, min: value, max: value }
  }
  const children = (node.children || []).map((child) => ({ child, result: evaluate(child) }))
  if (!children.length) return { value: 0, min: 0, max: 0 }
  if (node.type === 'all') {
    return {
      value: children.reduce((sum, entry) => sum + entry.result.value, 0) * quantity,
      min: children.reduce((sum, entry) => sum + entry.result.min, 0) * quantity,
      max: children.reduce((sum, entry) => sum + entry.result.max, 0) * quantity,
    }
  }
  if (node.type === 'selection') {
    const selected =
      children.find((entry) => entry.child.id === node.selectedChildId) || children[0]
    return {
      value: selected.result.value * quantity,
      min: Math.min(...children.map((entry) => entry.result.min)) * quantity,
      max: Math.max(...children.map((entry) => entry.result.max)) * quantity,
    }
  }
  return {
    value:
      (children.reduce((sum, entry) => sum + entry.result.value, 0) / children.length) * quantity,
    min: Math.min(...children.map((entry) => entry.result.min)) * quantity,
    max: Math.max(...children.map((entry) => entry.result.max)) * quantity,
  }
}

const pricedItems = (node, result = []) => {
  if (node.type === 'item' && node.marketName && node.source !== 'manual') result.push(node)
  ;(node.children || []).forEach((child) => pricedItems(child, result))
  return result
}

const applyLatestPrices = (node, prices) => {
  const source = node.source === 'auction' ? 'auction' : 'market'
  const market =
    node.type === 'item'
      ? prices.get(`${source}|${node.marketName}`) ||
        prices.get(`${source}|${node.name}${node.grade ? `|${node.grade}` : ''}`) ||
        prices.get(`${source}|${node.name}`)
      : null
  return {
    ...node,
    image: node.image || market?.icon || '',
    grade: node.grade || market?.grade || '',
    unitPrice: market
      ? number(market.currentMinPrice) / Math.max(1, number(market.bundleCount))
      : node.unitPrice,
    bundleCount: market ? Math.max(1, number(market.bundleCount)) : node.bundleCount,
    children: (node.children || []).map((child) => applyLatestPrices(child, prices)),
  }
}

function NodeImage({ node, size = 'normal' }) {
  const Icon = TYPES[node.type]?.icon || PackageOpen
  return node.image ? (
    <img
      className={`other-library-image ${gradeClass(node.grade)} ${size}`}
      src={node.image}
      alt=""
    />
  ) : (
    <span className={`other-library-image fallback ${size}`}>
      <Icon />
    </span>
  )
}

function ItemSearch({ onAdd, compact = false }) {
  const [source, setSource] = useState('market')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = async (nextSource = source, nextQuery = query) => {
    if (nextQuery.trim().length < 2) {
      setError('정확한 아이템 명칭을 두 글자 이상 입력하세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result =
        nextSource === 'market'
          ? await lostArkApi.searchMarketItems(nextQuery.trim())
          : await lostArkApi.searchAuctionItems(nextQuery.trim())
      setItems((result || []).map((item) => ({ ...item, source: nextSource })))
    } catch (requestError) {
      setError(requestError.message || '아이템 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`other-item-picker ${compact ? 'compact' : ''}`}>
      <nav>
        <button
          className={source === 'market' ? 'active' : ''}
          type="button"
          onClick={() => {
            setSource('market')
            setItems([])
            setError('')
          }}
        >
          거래소 API 검색
        </button>
        <button
          className={source === 'auction' ? 'active' : ''}
          type="button"
          onClick={() => {
            setSource('auction')
            setItems([])
            setError('')
          }}
        >
          경매장 API 검색
        </button>
      </nav>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          search()
        }}
      >
        <Search />
        <input
          value={query}
          placeholder="정확한 아이템 명칭을 입력하세요"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? '검색 중' : '검색'}
        </button>
      </form>
      <p className="other-exact-search-note">
        거래소·경매장에 표시되는 정확한 아이템 명칭을 입력해야 검색됩니다.
      </p>
      {error && <p className="other-picker-error">{error}</p>}
      <div className="other-item-results">
        {!loading && !items.length && <p>정확히 일치하는 아이템이 없습니다.</p>}
        {items.map((item) => (
          <button
            type="button"
            onClick={() => onAdd(itemFromMarket(item))}
            key={`${item.id}-${item.grade}-${item.source}`}
          >
            {item.icon ? <img src={item.icon} alt="" /> : <PackageOpen />}
            <span>
              <b>{item.name}</b>
              <small>
                {item.grade || '등급 없음'} · 묶음 {format(item.bundleCount, 0)}개 ·{' '}
                {item.source === 'market' ? '거래소' : '경매장'}
              </small>
            </span>
            <GoldAmount>
              {format(number(item.currentMinPrice) / Math.max(1, number(item.bundleCount)))}
            </GoldAmount>
            <em>추가</em>
          </button>
        ))}
      </div>
    </div>
  )
}

function ImagePicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="other-image-picker">
      <button type="button" onClick={() => setOpen((current) => !current)}>
        {value ? <img src={value} alt="" /> : <ImageIcon />}
        <span>{value ? '이미지 변경' : '이미지 선택 (선택사항)'}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="other-image-grid">
          <button
            className={!value ? 'selected empty' : 'empty'}
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            <X />
            <small>사용 안 함</small>
          </button>
          {rewardImages.map((image) => (
            <button
              className={value === image ? 'selected' : ''}
              type="button"
              title={image.split('/').at(-1)}
              onClick={() => {
                onChange(image)
                setOpen(false)
              }}
              key={image}
            >
              <img src={image} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BoxForm({ onCreate, onCancel, compact = false }) {
  const [type, setType] = useState('')
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [grade, setGrade] = useState('')

  if (!type)
    return (
      <div className="other-box-type-step">
        <h3>어떤 상자를 만들까요?</h3>
        <p>먼저 상자의 지급 방식을 선택하세요.</p>
        <div>
          {BOX_TYPES.map((boxType) => {
            const config = TYPES[boxType]
            const Icon = config.icon
            return (
              <button type="button" onClick={() => setType(boxType)} key={boxType}>
                <Icon />
                <b>{config.label}</b>
                <small>
                  {boxType === 'selection' && '구성품 중 하나를 선택'}
                  {boxType === 'random' && '구성품 중 하나를 무작위 획득'}
                  {boxType === 'all' && '모든 구성품을 함께 획득'}
                </small>
              </button>
            )
          })}
        </div>
        {onCancel && (
          <button className="other-cancel-link" type="button" onClick={onCancel}>
            취소
          </button>
        )}
      </div>
    )

  return (
    <div className={`other-box-details ${compact ? 'compact' : ''}`}>
      <header>
        <button type="button" onClick={() => setType('')}>
          <ChevronRight />
          {TYPES[type].label}
        </button>
        <span>상자 정보 입력</span>
      </header>
      <label>
        <span>상자 이름</span>
        <input
          value={name}
          placeholder="상자 이름을 입력하세요"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="other-box-options">
        <ImagePicker value={image} onChange={setImage} />
        <label>
          <span>등급 (선택사항)</span>
          <select value={grade} onChange={(event) => setGrade(event.target.value)}>
            {GRADES.map((option) => (
              <option value={option} key={option || 'none'}>
                {option || '등급 사용 안 함'}
              </option>
            ))}
          </select>
        </label>
      </div>
      <footer>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            취소
          </button>
        )}
        <button
          className="primary"
          type="button"
          disabled={!name.trim()}
          onClick={() => onCreate(createBox({ type, name, image, grade }))}
        >
          <Plus />
          상자 만들기
        </button>
      </footer>
    </div>
  )
}

function AddToBox({ catalog, onAdd, onRegister, onClose }) {
  const [mode, setMode] = useState('library')
  const addNewComponent = (entry) => {
    const catalogEntry = cloneNode(entry)
    onAdd({ ...entry, catalogEntryId: catalogEntry.id })
    onRegister(catalogEntry)
    onClose()
  }

  return (
    <div className="other-add-to-box">
      <header>
        <b>구성품 추가</b>
        <button type="button" onClick={onClose}>
          <X />
        </button>
      </header>
      <nav>
        <button
          className={mode === 'library' ? 'active' : ''}
          type="button"
          onClick={() => setMode('library')}
        >
          내 보관함
        </button>
        <button
          className={mode === 'item' ? 'active' : ''}
          type="button"
          onClick={() => setMode('item')}
        >
          아이템 검색
        </button>
        <button
          className={mode === 'box' ? 'active' : ''}
          type="button"
          onClick={() => setMode('box')}
        >
          새 상자
        </button>
      </nav>
      {mode === 'library' && (
        <div className="other-mini-library">
          {!catalog.length && <p>보관함이 비어 있습니다.</p>}
          {catalog.map((entry) => (
            <button
              type="button"
              onClick={() => {
                onAdd(cloneNode(entry))
                onClose()
              }}
              key={entry.id}
            >
              <NodeImage node={entry} size="small" />
              <span>
                <b>{entry.name}</b>
                <small>{TYPES[entry.type].label}</small>
              </span>
              <Plus />
            </button>
          ))}
        </div>
      )}
      {mode === 'item' && <ItemSearch compact onAdd={addNewComponent} />}
      {mode === 'box' && <BoxForm compact onCreate={addNewComponent} onCancel={onClose} />}
    </div>
  )
}

function TreeNode({ node, catalog, onChange, onRemove, onRegister }) {
  const [expanded, setExpanded] = useState(true)
  const [adding, setAdding] = useState(false)
  const result = evaluate(node)
  const isBox = node.type !== 'item'
  const patchChild = (childId, nextChild) =>
    onChange({
      ...node,
      children: node.children.map((child) => (child.id === childId ? nextChild : child)),
    })

  return (
    <article className={`other-tree-node type-${node.type}`}>
      <header>
        <button
          className="collapse"
          type="button"
          disabled={!isBox}
          onClick={() => isBox && setExpanded((current) => !current)}
        >
          {isBox && (expanded ? <ChevronDown /> : <ChevronRight />)}
        </button>
        <NodeImage node={node} size="small" />
        <span className="type">{TYPES[node.type].label}</span>
        <input
          className="name"
          value={node.name}
          onChange={(event) => onChange({ ...node, name: event.target.value })}
        />
        <label>
          <small>수량</small>
          <input
            type="number"
            min="0"
            value={node.quantity}
            onChange={(event) => onChange({ ...node, quantity: event.target.value })}
          />
        </label>
        {node.type === 'item' && (
          <label className="price">
            <small>개당 가치</small>
            <input
              type="number"
              min="0"
              value={node.unitPrice}
              onChange={(event) =>
                onChange({ ...node, unitPrice: event.target.value, source: 'manual' })
              }
            />
          </label>
        )}
        <strong>
          <GoldAmount>{format(result.value)}</GoldAmount>
        </strong>
        <button className="remove" type="button" onClick={onRemove}>
          <Trash2 />
        </button>
      </header>

      {isBox && expanded && (
        <div className="other-tree-body">
          <div className="other-tree-summary">
            <span>
              현재 가치 <GoldAmount>{format(result.value)}</GoldAmount>
            </span>
            <span>
              최고 가치 <GoldAmount>{format(result.max)}</GoldAmount>
            </span>
          </div>

          <div className="other-tree-box-settings">
            <label>
              <span>상자 유형</span>
              <select
                value={node.type}
                onChange={(event) => {
                  const type = event.target.value
                  onChange({
                    ...node,
                    type,
                    selectedChildId: type === 'selection' ? node.selectedChildId : null,
                  })
                }}
              >
                {BOX_TYPES.map((type) => (
                  <option value={type} key={type}>
                    {TYPES[type].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>등급</span>
              <select
                value={node.grade || ''}
                onChange={(event) => onChange({ ...node, grade: event.target.value })}
              >
                {GRADES.map((grade) => (
                  <option value={grade} key={grade || 'none'}>
                    {grade || '등급 사용 안 함'}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span>상자 이미지</span>
              <ImagePicker
                value={node.image || ''}
                onChange={(image) => onChange({ ...node, image })}
              />
            </div>
          </div>

          {node.type === 'random' && node.children.length > 0 && (
            <div className="other-outcome-table">
              <header>
                <span>랜덤 결과</span>
                <span>획득 가치</span>
              </header>
              {node.children
                .map((child) => ({ child, result: evaluate(child) }))
                .sort((left, right) => right.result.value - left.result.value)
                .map(({ child, result: childResult }) => (
                  <div key={child.id}>
                    <span>{child.name}</span>
                    <GoldAmount>{format(childResult.value)}</GoldAmount>
                  </div>
                ))}
            </div>
          )}

          <div className="other-tree-children">
            {node.children.map((child) => (
              <div className="other-tree-child" key={child.id}>
                {node.type === 'selection' && (
                  <label className="choose">
                    <input
                      type="radio"
                      name={`choice-${node.id}`}
                      checked={(node.selectedChildId || node.children[0]?.id) === child.id}
                      onChange={() => onChange({ ...node, selectedChildId: child.id })}
                    />
                    선택
                  </label>
                )}
                <TreeNode
                  node={child}
                  catalog={catalog}
                  onRegister={onRegister}
                  onChange={(nextChild) => patchChild(child.id, nextChild)}
                  onRemove={() =>
                    onChange({
                      ...node,
                      children: node.children.filter((entry) => entry.id !== child.id),
                      selectedChildId:
                        node.selectedChildId === child.id ? null : node.selectedChildId,
                    })
                  }
                />
              </div>
            ))}
          </div>

          <button className="other-add-component" type="button" onClick={() => setAdding(true)}>
            <Plus />이 상자에 아이템 또는 상자 추가
          </button>
          {adding && (
            <AddToBox
              catalog={catalog}
              onClose={() => setAdding(false)}
              onRegister={onRegister}
              onAdd={(child) => onChange({ ...node, children: [...node.children, child] })}
            />
          )}
        </div>
      )}
    </article>
  )
}

export default function OtherEfficiencyPage() {
  const [catalog, setCatalog] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      return Array.isArray(stored) ? stored : []
    } catch {
      return []
    }
  })
  const [selectedIds, setSelectedIds] = useState([])
  const [addMode, setAddMode] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [priceRefreshing, setPriceRefreshing] = useState(false)
  const [priceStatus, setPriceStatus] = useState('')
  const initialPriceLoad = useRef(false)

  const refreshCatalogPrices = async (forceRefresh) => {
    const items = catalog.flatMap((entry) => pricedItems(entry))
    const marketNames = [
      ...new Set(
        items
          .filter((item) => item.source !== 'auction')
          .map((item) => item.marketName)
          .filter(Boolean),
      ),
    ]
    const auctionNames = [
      ...new Set(
        items
          .filter((item) => item.source === 'auction')
          .map((item) => item.name)
          .filter(Boolean),
      ),
    ]
    if (!marketNames.length && !auctionNames.length) {
      setPriceStatus('갱신할 API 아이템이 없습니다.')
      return
    }

    setPriceRefreshing(true)
    setPriceStatus(
      forceRefresh
        ? 'Open API에서 최신 가격을 가져오는 중입니다.'
        : '저장된 최근 가격을 불러오는 중입니다.',
    )
    const prices = new Map()
    let failed = false

    try {
      const batches = Array.from({ length: Math.ceil(marketNames.length / 30) }, (_, index) =>
        marketNames.slice(index * 30, index * 30 + 30),
      )
      for (const batch of batches) {
        try {
          const result = await lostArkApi.getMarketPrices(batch, forceRefresh)
          Object.entries(result || {}).forEach(([lookup, price]) => {
            prices.set(`market|${lookup}`, price)
            prices.set(`market|${price.name}${price.grade ? `|${price.grade}` : ''}`, price)
          })
        } catch {
          failed = true
        }
      }

      for (const name of auctionNames) {
        try {
          const result = await lostArkApi.searchAuctionItems(name, forceRefresh)
          ;(result || []).forEach((price) => {
            prices.set(`auction|${price.name}${price.grade ? `|${price.grade}` : ''}`, price)
            if (!prices.has(`auction|${price.name}`)) prices.set(`auction|${price.name}`, price)
          })
        } catch {
          failed = true
        }
      }

      if (prices.size) {
        setCatalog((current) => current.map((entry) => applyLatestPrices(entry, prices)))
        setPriceStatus(
          `${forceRefresh ? 'API 최신' : 'DB 최근'} 가격을 ${prices.size}개 항목에 반영했습니다.${failed ? ' 일부 항목은 갱신하지 못했습니다.' : ''}`,
        )
      } else {
        setPriceStatus('적용할 가격 정보를 찾지 못했습니다.')
      }
    } finally {
      setPriceRefreshing(false)
    }
  }

  useEffect(() => {
    setLocalData(STORAGE_KEY, JSON.stringify(catalog))
  }, [catalog])

  useEffect(() => {
    if (initialPriceLoad.current || !catalog.length) return
    initialPriceLoad.current = true
    refreshCatalogPrices(false)
  }, [catalog])

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => catalog.some((entry) => entry.id === id)))
    if (editingId && !catalog.some((entry) => entry.id === editingId)) setEditingId(null)
  }, [catalog, editingId])

  const selectedEntries = useMemo(
    () =>
      selectedIds
        .map((id) => catalog.find((entry) => entry.id === id))
        .filter(Boolean)
        .map((entry) => ({ entry, result: evaluate(entry) }))
        .sort((left, right) => right.result.value - left.result.value),
    [catalog, selectedIds],
  )
  const editingEntry = catalog.find((entry) => entry.id === editingId)

  const addEntry = (entry) => {
    setCatalog((current) => [...current, entry])
    setAddMode('')
    if (entry.type !== 'item') setEditingId(entry.id)
  }
  const updateEntry = (nextEntry) =>
    setCatalog((current) => {
      const linked = new Map(
        linkedComponents(nextEntry).map((component) => [component.catalogEntryId, component]),
      )
      return current.map((entry) => {
        if (entry.id === nextEntry.id) return nextEntry
        const component = linked.get(entry.id)
        return component ? standaloneSnapshot(component, entry.id) : entry
      })
    })

  return (
    <div className="efficiency-page other-efficiency-page">
      <nav className="efficiency-tabs">
        {efficiencyToolTabs.map(([path, label]) => (
          <Link className={path === '/other-efficiency' ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>

      <header className="efficiency-hero other-efficiency-hero">
        <div className="efficiency-hero-icon">
          <Boxes />
        </div>
        <div>
          <p>CUSTOM ITEM & BOX LIBRARY</p>
          <h1>기타 효율</h1>
          <span>아이템과 중첩 상자를 보관하고, 원하는 항목을 여러 개 선택해 비교합니다.</span>
        </div>
      </header>

      <section className="panel other-library">
        <header className="other-main-heading">
          <span>
            <small>MY LIBRARY</small>
            <h2>내 아이템·상자 보관함</h2>
            <p>비교할 항목을 클릭하세요. 여러 개를 선택하면 서로 비교합니다.</p>
          </span>
          <div className="other-library-actions">
            <span>
              <em>
                {catalog.length}개 저장 · {selectedIds.length}개 선택
              </em>
              {priceStatus && <small>{priceStatus}</small>}
            </span>
            <button
              type="button"
              disabled={priceRefreshing || !catalog.length}
              onClick={() => refreshCatalogPrices(true)}
            >
              <RefreshCw className={priceRefreshing ? 'spinning' : ''} />
              {priceRefreshing ? '가격 갱신 중' : 'API 최신 가격 갱신'}
            </button>
          </div>
        </header>
        {catalog.length ? (
          <div className="other-library-grid">
            {catalog.map((entry) => {
              const selected = selectedIds.includes(entry.id)
              const result = evaluate(entry)
              return (
                <article
                  className={`${selected ? 'selected' : ''} type-${entry.type}`}
                  onClick={() =>
                    setSelectedIds((current) =>
                      selected ? current.filter((id) => id !== entry.id) : [...current, entry.id],
                    )
                  }
                  key={entry.id}
                >
                  <span className="other-library-check">{selected && <Check />}</span>
                  <NodeImage node={entry} />
                  <span className="copy">
                    <small>{TYPES[entry.type].label}</small>
                    <b>{entry.name}</b>
                    <em>
                      {entry.type === 'item'
                        ? `개당 ${format(entry.unitPrice)}골드`
                        : `구성품 ${entry.children?.length || 0}개`}
                    </em>
                  </span>
                  <strong>
                    <GoldAmount>{format(result.value)}</GoldAmount>
                  </strong>
                  {entry.type !== 'item' && (
                    <button
                      className="edit"
                      type="button"
                      title="상자 편집"
                      onClick={(event) => {
                        event.stopPropagation()
                        setEditingId(entry.id)
                      }}
                    >
                      <Edit3 />
                    </button>
                  )}
                  <button
                    className="delete"
                    type="button"
                    title="삭제"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCatalog((current) => current.filter((item) => item.id !== entry.id))
                    }}
                  >
                    <Trash2 />
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="other-library-empty">
            <Layers3 />
            <b>저장된 아이템이나 상자가 없습니다.</b>
            <span>아래에서 아이템 또는 상자를 추가하세요.</span>
          </div>
        )}
      </section>

      {selectedEntries.length > 0 && (
        <section className="panel other-selected-comparison">
          <header className="other-main-heading">
            <span>
              <small>COMPARISON</small>
              <h2>선택 항목 비교</h2>
            </span>
            <button type="button" onClick={() => setSelectedIds([])}>
              선택 해제
            </button>
          </header>
          <div className="other-compare-table">
            <header>
              <span>순위</span>
              <span>항목</span>
              <span>유형</span>
              <span>현재 가치</span>
              <span>최고 가치</span>
            </header>
            {selectedEntries.map(({ entry, result }, index) => (
              <div key={entry.id}>
                <em>{index + 1}위</em>
                <span>
                  <NodeImage node={entry} size="small" />
                  <b>{entry.name}</b>
                </span>
                <span>{TYPES[entry.type].label}</span>
                <GoldAmount>{format(result.value)}</GoldAmount>
                <GoldAmount>{format(result.max)}</GoldAmount>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel other-add-section">
        <header className="other-main-heading">
          <span>
            <small>ADD TO LIBRARY</small>
            <h2>새 항목 추가</h2>
            <p>거래소·경매장에서 아이템을 검색하거나 새로운 상자를 만드세요.</p>
          </span>
        </header>
        <div className="other-add-kind">
          <button
            className={addMode === 'item' ? 'active' : ''}
            type="button"
            onClick={() => setAddMode(addMode === 'item' ? '' : 'item')}
          >
            <CircleDollarSign />
            <span>
              <b>아이템 추가</b>
              <small>거래소 또는 경매장 API 정확 검색</small>
            </span>
          </button>
          <button
            className={addMode === 'box' ? 'active' : ''}
            type="button"
            onClick={() => setAddMode(addMode === 'box' ? '' : 'box')}
          >
            <PackageOpen />
            <span>
              <b>상자 추가</b>
              <small>선택·랜덤·전체 지급 상자 직접 생성</small>
            </span>
          </button>
        </div>
        {addMode === 'item' && <ItemSearch onAdd={addEntry} />}
        {addMode === 'box' && <BoxForm onCreate={addEntry} onCancel={() => setAddMode('')} />}
      </section>

      {editingEntry && (
        <section className="panel other-box-editor">
          <header className="other-main-heading">
            <span>
              <small>BOX EDITOR</small>
              <h2>{editingEntry.name} 구성</h2>
              <p>이 상자 안에 보관함 항목, 거래소·경매장 아이템 또는 새로운 상자를 추가하세요.</p>
            </span>
            <button type="button" onClick={() => setEditingId(null)}>
              <X />
              편집 닫기
            </button>
          </header>
          <TreeNode
            node={editingEntry}
            catalog={catalog.filter((entry) => entry.id !== editingEntry.id)}
            onRegister={(entry) => setCatalog((current) => [...current, entry])}
            onChange={updateEntry}
            onRemove={() => {}}
          />
        </section>
      )}
    </div>
  )
}
