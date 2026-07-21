import { useEffect, useRef, useState } from 'react'
import {
  Anvil,
  Boxes,
  CalendarHeart,
  ChevronDown,
  Crown,
  Heart,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Search,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Sun,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { groupFavorites, useFavorites } from '../lib/favorites'
import { lostArkApi } from '../lib/api'
import { setCrystalGoldPrice, useCrystalGoldPrice } from '../lib/crystalRate'
import CrystalIcon from './CrystalIcon'
import GoldIcon from './GoldIcon'
import { useAuth } from '../lib/auth'
import '../header-crystal-rate.css'

const links = [['/#community', '커뮤니티']]
const honingLinks = [
  ['/honing/optimizer', '재련 최적화', Anvil],
  ['/honing/special', '특수 재련 효율', Sparkles],
  ['/honing/support', '보조 재련 효율', Boxes],
]
const toolLinks = [
  ['/hell-reward', '낙원 보상 효율', Skull],
  ['/single-coin', '클리어 코인 효율', '/images/etc/icon_asset2.png'],
  ['/raid-extra', '레이드 더보기 효율', '/images/etc/icon_asset1.png'],
  ['/ark-pass', '아크 패스 효율', '/images/etc/icon_asset3.png'],
  ['/mari-shop', '마리의 비밀 상점 효율', ShoppingBag],
  ['/event-shop', '이벤트 상점 효율', CalendarHeart],
  ['/other-efficiency', '기타 효율', Boxes],
]

function FavoritePopover({
  favorites,
  favoriteGroups,
  representativeName,
  setRepresentative,
  remove,
  removeGroup,
  close,
}) {
  return (
    <div className="favorites-popover">
      <header>
        <strong>즐겨찾기 캐릭터</strong>
        <span>왕관으로 대표 캐릭터 지정</span>
      </header>
      {favorites.length ? (
        <div className="favorite-popover-groups">
          {favoriteGroups.map((group) => (
            <section className="favorite-popover-group" key={group.id}>
              <h4>
                <span>
                  {group.name}
                  <small>{group.characters.length}명</small>
                </span>
                <button onClick={() => removeGroup(group)}>
                  <Trash2 /> 전체 삭제
                </button>
              </h4>
              {group.characters.map((item) => (
                <div
                  className={`favorite-popover-row ${representativeName === item.characterName ? 'representative' : ''}`}
                  key={item.characterName}
                >
                  <Link
                    to={`/characters/${encodeURIComponent(item.characterName)}`}
                    onClick={close}
                  >
                    <span className="favorite-avatar">
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
                  </Link>
                  <button
                    className="favorite-representative"
                    onClick={() =>
                      setRepresentative(
                        representativeName === item.characterName ? '' : item.characterName,
                      )
                    }
                    title="대표 캐릭터 지정"
                    aria-label={`${item.characterName} 대표 캐릭터 지정`}
                  >
                    <Crown />
                  </button>
                  <button
                    onClick={() => remove(item.characterName)}
                    title="즐겨찾기 삭제"
                    aria-label={`${item.characterName} 즐겨찾기 삭제`}
                  >
                    <Trash2 />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p>
          <Star />
          캐릭터 카드의 별을 눌러 추가하세요.
        </p>
      )}
    </div>
  )
}

function AccountControl() {
  const { user, loginUrl, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const dialogRef = useRef(null)
  if (!user)
    return (
      <>
        <button className="account-button" onClick={() => dialogRef.current?.showModal()}>
          <LogIn /> 로그인
        </button>
        <dialog
          className="discord-login-dialog"
          ref={dialogRef}
          onClick={(event) => {
            if (event.target === dialogRef.current) dialogRef.current.close()
          }}
        >
          <div className="discord-login-content">
            <button onClick={() => dialogRef.current?.close()} aria-label="닫기">
              <X />
            </button>
            <span className="discord-logo">
              <MessageCircle />
            </span>
            <h2>Discord로 로그인</h2>
            <p>
              즐겨찾기와 원정대 설정을 계정에 안전하게 저장하고
              <br />
              다른 기기에서도 그대로 불러올 수 있습니다.
            </p>
            <a className="discord-login-link" href={loginUrl}>
              <MessageCircle /> Discord로 계속하기
            </a>
          </div>
        </dialog>
      </>
    )
  return (
    <div className="account-menu">
      <button className="account-button" onClick={() => setOpen((value) => !value)}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <MessageCircle />}
        <span>{user.username}</span>
      </button>
      {open && (
        <div className="account-popover">
          <header>
            {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
            <span>
              <b>{user.username}</b>
              <small>Discord 연동됨</small>
            </span>
          </header>
          <button onClick={logout}>
            <LogOut /> 로그아웃
          </button>
        </div>
      )}
    </div>
  )
}

function Header({ light, setLight }) {
  const [open, setOpen] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [honingOpen, setHoningOpen] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cacheStatus, setCacheStatus] = useState(null)
  const crystalGoldPrice = useCrystalGoldPrice()
  const headerRef = useRef(null)
  const { favorites, representativeName, setRepresentative, remove, removeMany } = useFavorites()
  const favoriteGroups = groupFavorites(favorites)
  useEffect(() => {
    let active = true
    const load = () =>
      lostArkApi
        .getCacheStatus()
        .then((status) => {
          if (active) setCacheStatus(status)
        })
        .catch(() => {})
    load()
    const timer = window.setInterval(load, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])
  const cacheTime = cacheStatus?.lastUpdatedAt
    ? new Date(cacheStatus.lastUpdatedAt).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '업데이트 전'
  const removeGroup = (group) => {
    if (window.confirm(`${group.name} 즐겨찾기 ${group.characters.length}명을 모두 삭제할까요?`))
      removeMany(group.characters.map((item) => item.characterName))
  }
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    setOpen(false)
    setFavoritesOpen(false)
    setToolsOpen(false)
    setHoningOpen(false)
    setContentOpen(false)
  }, [location.pathname])
  useEffect(() => {
    const closeMenus = (event) => {
      if (headerRef.current?.contains(event.target) || event.target.closest?.('.mobile-panel'))
        return
      setOpen(false)
      setFavoritesOpen(false)
      setToolsOpen(false)
      setHoningOpen(false)
      setContentOpen(false)
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => document.removeEventListener('pointerdown', closeMenus)
  }, [])
  const toggleTools = () => {
    setToolsOpen((value) => !value)
    setHoningOpen(false)
    setContentOpen(false)
    setFavoritesOpen(false)
    setOpen(false)
  }
  const toggleHoning = () => {
    setHoningOpen((value) => !value)
    setToolsOpen(false)
    setContentOpen(false)
    setFavoritesOpen(false)
    setOpen(false)
  }
  const toggleFavorites = () => {
    setFavoritesOpen((value) => !value)
    setToolsOpen(false)
    setHoningOpen(false)
    setContentOpen(false)
    setOpen(false)
  }
  const toggleMobile = () => {
    setOpen((value) => !value)
    setToolsOpen(false)
    setHoningOpen(false)
    setContentOpen(false)
    setFavoritesOpen(false)
  }
  const toggleContent = () => {
    setContentOpen((value) => !value)
    setToolsOpen(false)
    setHoningOpen(false)
    setFavoritesOpen(false)
    setOpen(false)
  }
  const search = (event) => {
    event.preventDefault()
    const name = query.trim()
    if (name) {
      navigate(`/characters/${encodeURIComponent(name)}`)
      setQuery('')
    }
  }
  return (
    <>
      <header ref={headerRef} className="topbar">
        <div className="nav-shell">
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Sparkles />
            </span>
            <span className="brand-name">
              LO<span>ARK</span>
            </span>
          </Link>
          <nav className="desktop-nav">
            <NavLink to="/" end>
              홈
            </NavLink>
            <div className="tool-nav-menu">
              <button
                className={toolLinks.some(([path]) => path === location.pathname) ? 'active' : ''}
                onClick={toggleTools}
              >
                도구 <ChevronDown />
              </button>
              {toolsOpen && (
                <div className="tool-nav-dropdown">
                  {toolLinks.map(([to, label, Icon]) => (
                    <Link to={to} onClick={() => setToolsOpen(false)} key={to}>
                      {typeof Icon === 'string' ? <img src={Icon} alt="" /> : <Icon />}
                      <span>{label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="tool-nav-menu">
              <button
                className={location.pathname.startsWith('/honing') ? 'active' : ''}
                onClick={toggleHoning}
              >
                재련 <ChevronDown />
              </button>
              {honingOpen && (
                <div className="tool-nav-dropdown">
                  {honingLinks.map(([to, label, Icon]) => (
                    <Link to={to} onClick={() => setHoningOpen(false)} key={to}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <NavLink to="/expedition">원정대</NavLink>
            <div className="tool-nav-menu">
              <button
                className={location.pathname === '/rapport' ? 'active' : ''}
                onClick={toggleContent}
              >
                콘텐츠 <ChevronDown />
              </button>
              {contentOpen && (
                <div className="tool-nav-dropdown">
                  <Link to="/rapport" onClick={() => setContentOpen(false)}>
                    <Heart />
                    <span>호감도 계산기</span>
                  </Link>
                </div>
              )}
            </div>
            {links.map(([to, label]) => (
              <NavLink to={to} key={label}>
                {label}
              </NavLink>
            ))}
          </nav>
          <form className="header-search" onSubmit={search}>
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="캐릭터 검색"
              aria-label="캐릭터 검색"
            />
            <kbd>Enter</kbd>
          </form>
          <div className="api-cache-status" title="서버 공용 가격 데이터의 마지막 갱신 시각">
            <span>
              가격 기준{cacheStatus?.ttlSeconds === 0 ? ' · DEV' : ''} <b>{cacheTime}</b>
            </span>
          </div>
          <label className="header-crystal-rate" title="블루 크리스탈 100개당 골드 환율">
            <b>100</b>
            <CrystalIcon />
            <i>:</i>
            <input
              inputMode="numeric"
              value={crystalGoldPrice}
              onChange={(event) => setCrystalGoldPrice(event.target.value.replace(/[^0-9]/g, ''))}
              aria-label="블루 크리스탈 100개당 골드"
            />
            <GoldIcon />
          </label>
          <div className="nav-actions">
            <div className="favorites-menu">
              <button
                className={`favorites-button ${favoritesOpen ? 'active' : ''}`}
                onClick={toggleFavorites}
                aria-expanded={favoritesOpen}
              >
                <Star />
                <span>즐겨찾기</span>
                {favorites.length > 0 && <b>{favorites.length}</b>}
              </button>
              {favoritesOpen && (
                <FavoritePopover
                  favorites={favorites}
                  favoriteGroups={favoriteGroups}
                  representativeName={representativeName}
                  setRepresentative={setRepresentative}
                  remove={remove}
                  removeGroup={removeGroup}
                  close={() => setFavoritesOpen(false)}
                />
              )}
            </div>
            <AccountControl />
            <button className="icon-button" onClick={() => setLight(!light)} aria-label="테마 변경">
              {light ? <Sun /> : <Moon />}
            </button>
            <button className="icon-button mobile-menu" onClick={toggleMobile} aria-label="메뉴">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <div className={`mobile-panel ${open ? 'open' : ''}`}>
        <form className="mobile-header-search" onSubmit={search}>
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="캐릭터 검색"
          />
        </form>
        <label className="mobile-crystal-rate">
          <b>100</b>
          <CrystalIcon />
          <i>:</i>
          <input
            inputMode="numeric"
            value={crystalGoldPrice}
            onChange={(event) => setCrystalGoldPrice(event.target.value.replace(/[^0-9]/g, ''))}
            aria-label="블루 크리스탈 100개당 골드"
          />
          <GoldIcon />
        </label>
        <Link to="/" onClick={() => setOpen(false)}>
          홈
        </Link>
        <Link to="/rapport" onClick={() => setOpen(false)}>
          <Heart />
          호감도 계산기
        </Link>
        <span className="mobile-tool-title">도구</span>
        <div className="mobile-tool-links">
          {toolLinks.map(([to, label, Icon]) => (
            <Link to={to} onClick={() => setOpen(false)} key={to}>
              {typeof Icon === 'string' ? <img src={Icon} alt="" /> : <Icon />}
              {label}
            </Link>
          ))}
        </div>
        <span className="mobile-tool-title">재련</span>
        <div className="mobile-tool-links">
          {honingLinks.map(([to, label, Icon]) => (
            <Link to={to} onClick={() => setOpen(false)} key={to}>
              <Icon />
              {label}
            </Link>
          ))}
        </div>
        <Link to="/expedition" onClick={() => setOpen(false)}>
          <UsersRound />
          원정대
        </Link>
        {links.map(([to, label]) => (
          <Link to={to} onClick={() => setOpen(false)} key={label}>
            {label}
          </Link>
        ))}
      </div>
    </>
  )
}

function AdSlot({ side }) {
  return (
    <aside className="ad-column" aria-label={`${side} 광고 영역`}>
      <div className="ad-slot">
        <span>ADVERTISEMENT</span>
        <strong>300 × 600</strong>
        <small>대형 사이드 배너</small>
      </div>
    </aside>
  )
}

export default function Layout({ light, setLight }) {
  const location = useLocation()
  return (
    <>
      <Header light={light} setLight={setLight} />
      <div className="page-grid">
        <AdSlot side="왼쪽" key={`left-${location.pathname}`} />
        <main>
          <Outlet />
        </main>
        <AdSlot side="오른쪽" key={`right-${location.pathname}`} />
      </div>
      <footer>
        <div className="footer-inner">
          <div>
            <span className="footer-brand">LOARK</span>
            <p>로스트아크 모험가를 위한 플레이 허브</p>
          </div>
          <div className="footer-links">
            <a href="#">서비스 소개</a>
            <a href="#">이용약관</a>
            <a href="#">개인정보처리방침</a>
            <a href="#">문의하기</a>
          </div>
          <small>LOARK is not associated with Smilegate RPG. © 2026 LOARK.</small>
        </div>
      </footer>
    </>
  )
}
