import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Boxes,
  CalendarHeart,
  ChevronRight,
  Crown,
  DoorOpen,
  Eye,
  EyeOff,
  Palmtree,
  RotateCcw,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Skull,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import CharacterSearch from '../components/CharacterSearch'
import { lostArkApi } from '../lib/api'
import { groupFavorites, useFavorites } from '../lib/favorites'
import { setLocalData } from '../lib/localData'

const tools = [
  ['violet', Skull, '낙원 보상 효율', '획득 보상과 소모 비용의 효율 계산', '/hell-reward'],
  [
    'amber',
    '/images/etc/icon_asset2.png',
    '클리어 코인 효율',
    '교환 보상의 클리어 코인당 가치를 비교',
    '/single-coin',
  ],
  [
    'mint',
    '/images/etc/icon_asset1.png',
    '레이드 더보기 효율',
    '더보기 비용 대비 추가 보상 계산',
    '/raid-extra',
  ],
  [
    'violet',
    '/images/etc/icon_asset3.png',
    '아크 패스 효율',
    '구매 비용 대비 패스 보상 가치 계산',
    '/ark-pass',
  ],
  [
    'amber',
    ShoppingBag,
    '마리의 비밀 상점 효율',
    '마리 상점 구매가 대비 상품 가치 비교',
    '/mari-shop',
  ],
  ['mint', CalendarHeart, '이벤트 상점 효율', '이벤트 재화별 교환 상품 가치 비교', '/event-shop'],
  ['violet', Boxes, '기타 효율', '다양한 교환 및 구매 효율 계산', '/other-efficiency'],
]
const LAYOUT_KEY = 'loark-home-layout'
const HIDDEN_KEY = 'loark-home-hidden-widgets'
const defaultLayout = [
  { id: 'favorites', cols: 12 },
  { id: 'tools', cols: 12 },
  { id: 'schedule', cols: 8 },
  { id: 'notice', cols: 4 },
  { id: 'community', cols: 8 },
]
const widgetLabels = {
  favorites: '즐겨찾기 캐릭터',
  tools: '보상 효율 도구',
  schedule: '오늘의 콘텐츠',
  notice: '공지사항',
  community: '커뮤니티 안내',
}

const loadLayout = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '[]')
    if (!Array.isArray(saved)) return defaultLayout
    const valid = saved
      .filter((item) => defaultLayout.some((widget) => widget.id === item.id))
      .map((item) => ({
        id: item.id,
        cols: Math.min(12, Math.max(4, Number(item.cols || (item.size === 'half' ? 6 : 12)))),
      }))
    const missing = defaultLayout.filter((widget) => !valid.some((item) => item.id === widget.id))
    return [...valid, ...missing]
  } catch {
    return defaultLayout
  }
}
const loadHidden = () => {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
    return Array.isArray(value)
      ? value.filter((id) => defaultLayout.some((widget) => widget.id === id))
      : []
  } catch {
    return []
  }
}

function RepresentativeHero({ favorites, representative }) {
  if (!representative)
    return (
      <section className="representative-hero representative-empty brand-centered">
        <div className="brand-hero-orbit orbit-a" />
        <div className="brand-hero-orbit orbit-b" />
        <div className="brand-hero-content">
          <span className="brand-hero-mark">
            <Sparkles />
          </span>
          <p>YOUR LOST ARK COMPANION</p>
          <h1>
            ARK<span>IVE</span>
          </h1>
          <strong>오늘의 아크라시아를 한눈에, 더 빠르게.</strong>
          <small>캐릭터 전투 정보부터 보상 효율과 콘텐츠 정보까지 한곳에서 확인하세요.</small>
          <CharacterSearch />
        </div>
      </section>
    )

  return (
    <section className="representative-hero has-character">
      <div className="representative-aura" />
      {representative.characterImage && (
        <img className="representative-backdrop" src={representative.characterImage} alt="" />
      )}
      {representative.characterImage && (
        <img className="representative-art" src={representative.characterImage} alt="" />
      )}
      <div className="representative-copy">
        <p>
          <Crown /> MY MAIN CHARACTER
        </p>
        <small>
          {representative.serverName} · {representative.className}
        </small>
        <h1>{representative.characterName}</h1>
        <div className="representative-level">
          <span>아이템 레벨</span>
          <strong>Lv. {representative.itemLevel || '-'}</strong>
        </div>
        <div className="representative-actions">
          <Link to={`/characters/${encodeURIComponent(representative.characterName)}`}>
            캐릭터 정보 보기 <ArrowRight />
          </Link>
        </div>
      </div>
      <div className="representative-summary">
        <span>
          <Star />
          즐겨찾기
        </span>
        <b>{favorites.length}</b>
        <small>저장된 캐릭터</small>
      </div>
    </section>
  )
}

function FavoritesWidget({ favorites, representativeName, remove, removeMany }) {
  const favoriteGroups = groupFavorites(favorites)
  const removeGroup = (group) => {
    if (window.confirm(`${group.name} 즐겨찾기 ${group.characters.length}명을 모두 삭제할까요?`))
      removeMany(group.characters.map((item) => item.characterName))
  }
  return (
    <section className="section favorite-characters">
      <div className="section-heading">
        <div>
          <p className="section-kicker">MY CHARACTERS</p>
          <h2>즐겨찾기 캐릭터</h2>
        </div>
        <span>
          <Star /> {favorites.length}명
        </span>
      </div>
      {favorites.length ? (
        <div className="favorite-roster-groups">
          {favoriteGroups.map((group) => (
            <section className="favorite-roster-section" key={group.id}>
              <header>
                <div>
                  <h3>{group.name}</h3>
                  <span>{group.characters.length}명</span>
                </div>
                <button onClick={() => removeGroup(group)}>
                  <Trash2 /> 원정대 전체 삭제
                </button>
              </header>
              <div className="favorite-character-grid">
                {group.characters.map((item) => (
                  <article
                    className={representativeName === item.characterName ? 'representative' : ''}
                    key={item.characterName}
                  >
                    <Link to={`/characters/${encodeURIComponent(item.characterName)}`}>
                      <span className="favorite-character-image">
                        {item.characterImage ? (
                          <img src={item.characterImage} alt="" />
                        ) : (
                          item.className?.[0]
                        )}
                      </span>
                      <div>
                        <strong>{item.characterName}</strong>
                        <small>
                          {item.serverName} · {item.className}
                        </small>
                      </div>
                      <b>Lv. {item.itemLevel || '-'}</b>
                      <ChevronRight />
                    </Link>
                    {representativeName === item.characterName && (
                      <span className="favorite-main-indicator" title="대표 캐릭터">
                        <Crown />
                      </span>
                    )}
                    <button onClick={() => remove(item.characterName)} title="즐겨찾기 삭제">
                      <Trash2 />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="home-favorites-empty">
          <Star />
          <span>캐릭터를 즐겨찾기하면 이곳에서 빠르게 확인할 수 있습니다.</span>
        </div>
      )}
    </section>
  )
}

function ToolsWidget() {
  return (
    <section className="section" id="tools">
      <div className="section-heading">
        <div>
          <p className="section-kicker">QUICK TOOLS</p>
          <h2>보상 효율 도구</h2>
        </div>
        <a href="#tools">
          전체 도구 <ArrowRight />
        </a>
      </div>
      <div className="tool-grid">
        {tools.map(([color, Icon, title, desc, path]) => (
          <Link className={`tool-card ${color}`} to={path} key={title}>
            <span className="tool-icon">
              {typeof Icon === 'string' ? <img src={Icon} alt="" /> : <Icon />}
            </span>
            <div>
              <strong>{title}</strong>
              <p>{desc}</p>
            </div>
            <ChevronRight className="arrow" />
          </Link>
        ))}
      </div>
    </section>
  )
}

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const lostArkDate = (value) => {
  const date = new Date(value)
  date.setHours(date.getHours() - 6)
  return date
}
const lostArkDateKey = (value) => dateKey(lostArkDate(value))
const DAILY_CONTENT_TYPES = [
  {
    id: 'adventure-island',
    label: '모험의 섬',
    category: '모험섬',
    icon: '/images/etc/8d2da66ab5b94eabb91b9d1facff2f2e.png',
    tone: 'cyan',
  },
  {
    id: 'field-boss',
    label: '필드 보스',
    category: '필드보스',
    icon: '/images/etc/02a557c5ae3a459ebb7b857bb5f4f86b.png',
    tone: 'red',
  },
  {
    id: 'chaos-gate',
    label: '카오스 게이트',
    category: '카오스게이트',
    icon: '/images/etc/6beab1830f264eb7a316641d3b6e9d9f.png',
    tone: 'purple',
  },
]
const normalizeCalendarCategory = (value) => String(value || '').replace(/\s+/g, '')
const calendarRewards = (content, selectedKey) => {
  const rewardGroups = Array.isArray(content?.RewardItems) ? content.RewardItems : []
  const rewards = rewardGroups
    .flatMap((group) => (Array.isArray(group?.Items) ? group.Items : group?.Name ? [group] : []))
    .filter(
      (item) =>
        !Array.isArray(item?.StartTimes) ||
        !item.StartTimes.length ||
        item.StartTimes.some((time) => lostArkDateKey(time) === selectedKey),
    )
  return rewards.filter(
    (item, index, items) =>
      item?.Name && items.findIndex((target) => target.Name === item.Name) === index,
  )
}
const adventureRewardType = (rewards) => {
  const names = rewards.map((item) => item.Name || '').join(' ')
  if (names.includes('대양의 주화')) return '주화섬'
  if (names.includes('골드')) return '골드섬'
  if (/카드\s*팩/.test(names)) return '카드섬'
  return '실링섬'
}
const formatRemainingTime = (milliseconds) => {
  if (milliseconds <= 0) return '00:00:00'
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function ScheduleWidget() {
  const [calendar, setCalendar] = useState([])
  const [selectedDate, setSelectedDate] = useState(() => lostArkDate(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [adventureOpen, setAdventureOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    lostArkApi
      .getGameContentsCalendar()
      .then((data) => {
        if (active) setCalendar(Array.isArray(data) ? data : [])
      })
      .catch((fetchError) => {
        if (active) setError(fetchError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const today = lostArkDate(now)
  today.setHours(0, 0, 0, 0)
  const days = [-1, 0, 1, 2, 3, 4, 5].map((offset) => {
    const date = new Date(today)
    date.setDate(date.getDate() + offset)
    return date
  })
  const todayKey = dateKey(today)
  const selectedKey = dateKey(selectedDate)
  const contentStates = DAILY_CONTENT_TYPES.map((type) => {
    const matchingContents = calendar.filter(
      (content) => normalizeCalendarCategory(content.CategoryName) === type.category,
    )
    const occurrences = matchingContents
      .flatMap((content) =>
        (content.StartTimes || [])
          .map((time) => ({ content, time: new Date(time) }))
          .filter((item) => lostArkDateKey(item.time) === selectedKey),
      )
      .filter((item) => !Number.isNaN(item.time.getTime()))
      .sort((a, b) => a.time - b.time)
    const nextOccurrence = occurrences.find((item) => item.time > now)
    return { ...type, nextOccurrence, occurrences }
  })
  const adventureState = contentStates.find((content) => content.id === 'adventure-island')
  const adventureIslands = [
    ...new Map(
      (adventureState?.occurrences || []).map(({ content, time }) => [
        content.ContentsName,
        { content, time },
      ]),
    ).values(),
  ]
  const dateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(selectedDate)

  return (
    <section className="section schedule-widget" id="schedule">
      <div className="panel-header">
        <div>
          <p className="section-kicker">DAILY CONTENTS</p>
          <h2>오늘의 콘텐츠</h2>
        </div>
        <time>{dateLabel}</time>
      </div>
      <div className="day-tabs compact-day-tabs">
        {days.map((date) => {
          const key = dateKey(date)
          const className = [
            selectedKey === key ? 'selected' : '',
            todayKey === key ? 'today' : '',
            date.getDay() === 0 ? 'sunday' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button className={className} onClick={() => setSelectedDate(date)} key={key}>
              <span>{new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(date)}</span>
              {date.getDate()}
            </button>
          )
        })}
      </div>
      {loading && (
        <div className="calendar-state compact-calendar-state">
          이번 주 콘텐츠 일정을 불러오는 중입니다.
        </div>
      )}
      {!loading && error && (
        <div className="calendar-state compact-calendar-state error">{error}</div>
      )}
      {!loading && !error && (
        <div className="daily-content-summary">
          {contentStates.map(({ id, label, icon, tone, nextOccurrence }) => (
            <article
              className={`daily-content-card ${tone} ${id === 'adventure-island' ? 'clickable' : ''} ${id === 'adventure-island' && adventureOpen ? 'expanded' : ''}`}
              onClick={
                id === 'adventure-island' ? () => setAdventureOpen((open) => !open) : undefined
              }
              key={id}
            >
              <span className="daily-content-icon">
                <img src={icon} alt="" />
              </span>
              <div>
                <strong>{label}</strong>
                <small>{nextOccurrence ? '다음 입장까지' : '오늘 일정 없음'}</small>
              </div>
              <time className={nextOccurrence ? '' : 'unavailable'}>
                {nextOccurrence ? formatRemainingTime(nextOccurrence.time - now) : '입장 불가'}
              </time>
            </article>
          ))}
        </div>
      )}
      {!loading && !error && adventureOpen && (
        <div className="adventure-island-details">
          <strong>등장하는 모험의 섬</strong>
          {adventureIslands.length ? (
            <div>
              {adventureIslands.map(({ content }) => {
                const rewards = calendarRewards(content, selectedKey)
                const rewardType = adventureRewardType(rewards)
                return (
                  <article
                    className="adventure-island-reward-card"
                    tabIndex="0"
                    key={content.ContentsName}
                  >
                    <span className="adventure-island-icon">
                      {content.ContentsIcon ? (
                        <img src={content.ContentsIcon} alt="" />
                      ) : (
                        <Palmtree />
                      )}
                    </span>
                    <div className="adventure-island-copy">
                      <span className={`adventure-type ${rewardType}`}>{rewardType}</span>
                      <b>{content.ContentsName}</b>
                      <small>마우스를 올려 보상 확인</small>
                    </div>
                    <div className="adventure-reward-popover">
                      <header>
                        <span className="adventure-island-icon">
                          {content.ContentsIcon ? (
                            <img src={content.ContentsIcon} alt="" />
                          ) : (
                            <Palmtree />
                          )}
                        </span>
                        <div>
                          <span className={`adventure-type ${rewardType}`}>{rewardType}</span>
                          <strong>{content.ContentsName}</strong>
                        </div>
                      </header>
                      <div className="adventure-reward-list">
                        {rewards.length ? (
                          rewards.map((reward) => (
                            <div key={reward.Name}>
                              <span>
                                {reward.Icon ? <img src={reward.Icon} alt="" /> : <Palmtree />}
                              </span>
                              <b>{reward.Name}</b>
                            </div>
                          ))
                        ) : (
                          <p>표시할 주요 보상이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p>선택한 날짜에는 입장 가능한 모험의 섬이 없습니다.</p>
          )}
        </div>
      )}
    </section>
  )
}

function NoticeWidget() {
  return (
    <section className="section notice-panel notice-widget">
      <div className="mini-header">
        <h3>공지사항</h3>
        <Link to="/community?category=NOTICE">＋</Link>
      </div>
      <ul>
        <li>
          <span className="badge notice">공지</span>
          <Link to="/community?category=NOTICE">LOARK 서비스 오픈 안내</Link>
          <time>07.12</time>
        </li>
        <li>
          <span className="badge update">업데이트</span>
          <Link to="/community?category=NOTICE">캐릭터 검색 기능 업데이트</Link>
          <time>07.11</time>
        </li>
        <li>
          <span className="badge notice">공지</span>
          <Link to="/community?category=NOTICE">서비스 이용 전 확인해 주세요</Link>
          <time>07.10</time>
        </li>
      </ul>
    </section>
  )
}

function CommunityWidget() {
  return (
    <section className="banner" id="community">
      <div>
        <span>LOARK BETA</span>
        <h2>모험가님의 의견으로 더 좋은 서비스를 만듭니다.</h2>
        <p>필요한 기능이나 불편한 점을 알려주세요.</p>
      </div>
      <Link className="banner-cta" to="/community?category=SUGGESTION">
        의견 보내기 <Send />
      </Link>
    </section>
  )
}

export default function HomePage() {
  const { favorites, representative, representativeName, setRepresentative, remove, removeMany } =
    useFavorites()
  const [layout, setLayout] = useState(loadLayout)
  const [hiddenIds, setHiddenIds] = useState(loadHidden)
  const [manageOpen, setManageOpen] = useState(false)
  const [draggedId, setDraggedId] = useState('')
  const [dropTargetId, setDropTargetId] = useState('')
  const [dropIndicator, setDropIndicator] = useState(null)
  const dashboardRef = useRef(null)
  const draggedIdRef = useRef('')
  const previewTargetRef = useRef('')
  const flipRectsRef = useRef(new Map())
  useEffect(() => {
    setLocalData(LAYOUT_KEY, JSON.stringify(layout))
  }, [layout])
  useEffect(() => {
    setLocalData(HIDDEN_KEY, JSON.stringify(hiddenIds))
  }, [hiddenIds])
  useLayoutEffect(() => {
    if (!flipRectsRef.current.size || !dashboardRef.current) return
    dashboardRef.current.querySelectorAll('.home-widget').forEach((node) => {
      const previous = flipRectsRef.current.get(node.dataset.widgetId)
      if (!previous) return
      const current = node.getBoundingClientRect()
      const x = previous.left - current.left
      const y = previous.top - current.top
      if (Math.abs(x) < 1 && Math.abs(y) < 1) return
      node.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }], {
        duration: 260,
        easing: 'cubic-bezier(.2,.8,.2,1)',
      })
    })
    flipRectsRef.current = new Map()
  }, [layout])
  const captureWidgetRects = () => {
    const rects = new Map()
    dashboardRef.current
      ?.querySelectorAll('.home-widget')
      .forEach((node) => rects.set(node.dataset.widgetId, node.getBoundingClientRect()))
    flipRectsRef.current = rects
  }
  const setDragging = (id) => {
    draggedIdRef.current = id
    previewTargetRef.current = id
    setDraggedId(id)
  }
  const move = (sourceId, targetId, placement = 'before') => {
    if (!sourceId || sourceId === targetId) return
    captureWidgetRects()
    setLayout((current) => {
      const next = [...current]
      const from = next.findIndex((item) => item.id === sourceId)
      if (from < 0) return current
      const [moved] = next.splice(from, 1)
      const targetIndex = next.findIndex((item) => item.id === targetId)
      if (targetIndex < 0) return current
      next.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved)
      return next
    })
  }
  const previewMove = (targetId, placement) => {
    const sourceId = draggedIdRef.current
    const previewKey = `${targetId}:${placement}`
    if (!sourceId || !targetId || sourceId === targetId || previewTargetRef.current === previewKey)
      return
    previewTargetRef.current = previewKey
    move(sourceId, targetId, placement)
  }
  const stopDragging = () => {
    draggedIdRef.current = ''
    previewTargetRef.current = ''
    setDraggedId('')
    setDropTargetId('')
    setDropIndicator(null)
  }
  const updateDropPreview = (clientX, clientY) => {
    if (!draggedIdRef.current || !dashboardRef.current) return
    const dashboardRect = dashboardRef.current.getBoundingClientRect()
    const candidates = [...dashboardRef.current.querySelectorAll('.home-widget')]
      .filter((node) => node.dataset.widgetId !== draggedIdRef.current)
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
    if (!candidates.length) return
    const candidate = candidates.reduce((closest, item) => {
      const dx =
        clientX < item.rect.left
          ? item.rect.left - clientX
          : clientX > item.rect.right
            ? clientX - item.rect.right
            : 0
      const dy =
        clientY < item.rect.top
          ? item.rect.top - clientY
          : clientY > item.rect.bottom
            ? clientY - item.rect.bottom
            : 0
      const distance = Math.hypot(dx, dy)
      return !closest || distance < closest.distance ? { ...item, distance } : closest
    }, null)
    const placement = clientY > candidate.rect.top + candidate.rect.height / 2 ? 'after' : 'before'
    const targetId = candidate.node.dataset.widgetId
    setDropTargetId(targetId)
    setDropIndicator({
      left: candidate.rect.left - dashboardRect.left,
      top:
        (placement === 'before' ? candidate.rect.top : candidate.rect.bottom) - dashboardRect.top,
      width: candidate.rect.width,
    })
    previewMove(targetId, placement)
  }
  const startResize = (event, id, startCols, direction) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const dashboardWidth = dashboardRef.current?.getBoundingClientRect().width || 1
    const columnWidth = dashboardWidth / 12
    const onMove = (moveEvent) => {
      const delta = Math.round((moveEvent.clientX - startX) / columnWidth) * direction
      const cols = Math.min(12, Math.max(4, startCols + delta))
      setLayout((current) => current.map((item) => (item.id === id ? { ...item, cols } : item)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop, { once: true })
  }
  const startLongPress = (event, id) => {
    if (event.button !== 0 || event.target.closest('a,button,input,select,.home-resize-handle'))
      return
    const startX = event.clientX
    const startY = event.clientY
    const pointerType = event.pointerType
    let active = false
    const activate = () => {
      if (active) return
      active = true
      setDragging(id)
      setDropTargetId(id)
      if (navigator.vibrate) navigator.vibrate(18)
    }
    const timer = window.setTimeout(activate, pointerType === 'mouse' ? 220 : 340)
    const onMove = (moveEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY)
      if (!active && pointerType === 'mouse' && distance > 5) activate()
      if (!active && pointerType !== 'mouse' && distance > 7) return cleanup()
      if (!active) return
      moveEvent.preventDefault()
      updateDropPreview(moveEvent.clientX, moveEvent.clientY)
    }
    const onEnd = () => {
      window.clearTimeout(timer)
      stopDragging()
      cleanup()
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }
  const widgets = {
    favorites: (
      <FavoritesWidget
        favorites={favorites}
        representativeName={representativeName}
        remove={remove}
        removeMany={removeMany}
      />
    ),
    tools: <ToolsWidget />,
    schedule: <ScheduleWidget />,
    notice: <NoticeWidget />,
    community: <CommunityWidget />,
  }
  const hideWidget = (id) =>
    setHiddenIds((current) => (current.includes(id) ? current : [...current, id]))
  const showWidget = (id) => setHiddenIds((current) => current.filter((item) => item !== id))
  const resetDashboard = () => {
    setLayout(defaultLayout)
    setHiddenIds([])
    setManageOpen(false)
  }
  return (
    <>
      <RepresentativeHero favorites={favorites} representative={representative} />
      <div className="home-dashboard-shell">
        <div className="home-board-manager">
          <button
            className={manageOpen ? 'active' : ''}
            onClick={() => setManageOpen((value) => !value)}
            title="홈 카드 관리"
          >
            <SlidersHorizontal />
          </button>
          {manageOpen && (
            <div className="home-board-menu">
              <header>
                <b>홈 카드 관리</b>
                <small>숨긴 카드 {hiddenIds.length}개</small>
              </header>
              {hiddenIds.length ? (
                <div>
                  {hiddenIds.map((id) => (
                    <button onClick={() => showWidget(id)} key={id}>
                      <Eye />
                      {widgetLabels[id]}
                      <span>다시 표시</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p>숨긴 카드가 없습니다.</p>
              )}
              <button className="home-board-reset" onClick={resetDashboard}>
                <RotateCcw /> 모든 카드 원상복귀
              </button>
            </div>
          )}
        </div>
        <div className="home-dashboard" ref={dashboardRef}>
          {dropIndicator && draggedId && (
            <i
              className="home-drop-indicator"
              style={{
                left: dropIndicator.left,
                top: dropIndicator.top,
                width: dropIndicator.width,
              }}
            />
          )}
          {layout
            .filter((item) => !hiddenIds.includes(item.id))
            .map((item) => (
              <article
                data-widget-id={item.id}
                className={`home-widget ${draggedId === item.id ? 'moving' : ''} ${dropTargetId === item.id && draggedId !== item.id ? 'drop-target' : ''}`}
                style={{ '--widget-cols': item.cols }}
                onPointerDown={(event) => startLongPress(event, item.id)}
                key={item.id}
              >
                <button
                  className="home-widget-hide"
                  onClick={() => hideWidget(item.id)}
                  title={`${widgetLabels[item.id]} 숨기기`}
                >
                  <EyeOff />
                </button>
                <i
                  className="home-resize-handle left"
                  onPointerDown={(event) => startResize(event, item.id, item.cols, -1)}
                  aria-hidden="true"
                />
                <i
                  className="home-resize-handle right"
                  onPointerDown={(event) => startResize(event, item.id, item.cols, 1)}
                  aria-hidden="true"
                />
                {widgets[item.id]}
              </article>
            ))}
        </div>
      </div>
    </>
  )
}
