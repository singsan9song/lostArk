import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock3,
  Gauge,
  MessageCircle,
  Pencil,
  Search,
  Server,
} from 'lucide-react'
import { adminApiRequestStreamUrl, lostArkApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { COMMUNITY_CATEGORIES, formatCommunityDate } from '../lib/community'
import CommunityWriteModal from '../components/CommunityWriteModal'
import '../community.css'

export default function CommunityPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCategory = searchParams.get('category')
  const category =
    requestedCategory === 'API_STATUS' && user?.isAdmin
      ? 'API_STATUS'
      : COMMUNITY_CATEGORIES.some((item) => item.id === requestedCategory)
        ? requestedCategory
        : 'NOTICE'
  const sort = searchParams.get('sort') === 'likes' ? 'likes' : 'latest'
  const page = Math.max(0, Number(searchParams.get('page') || 0))
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [data, setData] = useState({ content: [], page: 0, totalPages: 1, totalElements: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [writeOpen, setWriteOpen] = useState(false)
  const search = searchParams.get('search') || ''

  useEffect(() => setSearchInput(search), [search])

  useEffect(() => {
    if (category === 'API_STATUS') {
      setLoading(false)
      setError('')
      return undefined
    }
    let active = true
    setLoading(true)
    setError('')
    lostArkApi
      .getCommunityPosts({ category, sort, search, page })
      .then((result) => {
        if (active) setData(result)
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
  }, [category, sort, search, page])

  const update = (next) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      Object.entries(next).forEach(([key, value]) => {
        if (value === '' || value === undefined || value === null) params.delete(key)
        else params.set(key, value)
      })
      return params
    })

  const canWriteNotice = category === 'NOTICE' && user?.isAdmin
  const canWrite = user && (category !== 'NOTICE' || user.isAdmin)

  const submitSearch = (event) => {
    event.preventDefault()
    update({ search: searchInput.trim(), page: 0 })
  }

  const totalPages = Math.max(1, data.totalPages)
  const windowStart = Math.max(0, Math.min(page - 2, totalPages - 5))
  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => windowStart + index,
  )
  const categoryItems = user?.isAdmin
    ? [...COMMUNITY_CATEGORIES, { id: 'API_STATUS', label: 'API 현황' }]
    : COMMUNITY_CATEGORIES
  const categoryTabs = (
    <div className={`community-category-tabs ${user?.isAdmin ? 'has-admin' : ''}`}>
      {categoryItems.map((item) => (
        <button
          className={category === item.id ? 'selected' : ''}
          type="button"
          onClick={() => update({ category: item.id, page: 0 })}
          key={item.id}
        >
          {item.label}
        </button>
      ))}
    </div>
  )

  if (category === 'API_STATUS') {
    return (
      <div className="community-page">
        <header className="community-header">
          <h1>커뮤니티</h1>
        </header>
        {categoryTabs}
        <AdminApiStatusPanel />
      </div>
    )
  }

  return (
    <div className="community-page">
      <header className="community-header">
        <h1>커뮤니티</h1>
      </header>

      {categoryTabs}

      <div className="community-toolbar">
        <div className="community-sort-tabs">
          <button
            className={sort === 'latest' ? 'selected' : ''}
            type="button"
            onClick={() => update({ sort: 'latest', page: 0 })}
          >
            최신순
          </button>
          <button
            className={sort === 'likes' ? 'selected' : ''}
            type="button"
            onClick={() => update({ sort: 'likes', page: 0 })}
          >
            좋아요순
          </button>
        </div>
        <form className="community-search" onSubmit={submitSearch}>
          <input
            type="text"
            placeholder="제목으로 검색해 주세요."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit">
            <Search />
          </button>
        </form>
      </div>

      <div className="community-list">
        <div className="community-list-head">
          <span className="community-col-title">제목</span>
          <span className="community-col-author">작성자</span>
          <span className="community-col-likes">좋아요</span>
          <span className="community-col-views">조회</span>
          <span className="community-col-date">날짜</span>
        </div>
        {loading && <div className="community-state">불러오는 중입니다.</div>}
        {!loading && error && <div className="community-state error">{error}</div>}
        {!loading && !error && data.content.length === 0 && (
          <div className="community-state">등록된 게시글이 없습니다.</div>
        )}
        {!loading &&
          !error &&
          data.content.map((post) => (
            <Link className="community-row" to={`/community/${post.id}`} key={post.id}>
              <span className="community-col-title">
                {post.title}
                {post.commentCount > 0 && <em>({post.commentCount})</em>}
              </span>
              <span className="community-col-author">
                {post.authorAvatarUrl ? (
                  <img src={post.authorAvatarUrl} alt="" />
                ) : (
                  <i>
                    <MessageCircle />
                  </i>
                )}
                <b>{post.authorName}</b>
              </span>
              <span className="community-col-likes">{post.likeCount}</span>
              <span className="community-col-views">{post.viewCount}</span>
              <span className="community-col-date">{formatCommunityDate(post.createdAt)}</span>
            </Link>
          ))}
      </div>

      <div className="community-footer">
        <nav className="community-pagination">
          <button type="button" disabled={page === 0} onClick={() => update({ page: 0 })}>
            <ChevronsLeft />
          </button>
          <button type="button" disabled={page === 0} onClick={() => update({ page: page - 1 })}>
            <ChevronLeft />
          </button>
          {pageNumbers.map((number) => (
            <button
              className={number === page ? 'selected' : ''}
              type="button"
              onClick={() => update({ page: number })}
              key={number}
            >
              {number + 1}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => update({ page: page + 1 })}
          >
            <ChevronRight />
          </button>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => update({ page: totalPages - 1 })}
          >
            <ChevronsRight />
          </button>
        </nav>
        <button
          className="community-write-button"
          type="button"
          disabled={!canWrite}
          title={
            !user
              ? '디스코드 로그인 후 작성할 수 있습니다.'
              : category === 'NOTICE' && !canWriteNotice
                ? '공지사항은 관리자만 작성할 수 있습니다.'
                : ''
          }
          onClick={() => setWriteOpen(true)}
        >
          <Pencil /> 글쓰기
        </button>
      </div>

      {writeOpen && (
        <CommunityWriteModal
          category={category}
          close={() => setWriteOpen(false)}
          onCreated={(post) => {
            setWriteOpen(false)
            update({ page: 0 })
            setData((current) => ({ ...current, content: [post, ...current.content].slice(0, 15) }))
          }}
        />
      )}
    </div>
  )
}

function AdminApiStatusPanel() {
  const [status, setStatus] = useState({
    count: 0,
    limit: 0,
    remaining: 0,
    resetsAt: null,
  })
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [openMinute, setOpenMinute] = useState('')
  const [historyDetails, setHistoryDetails] = useState({})
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [historySearchInput, setHistorySearchInput] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [searchResult, setSearchResult] = useState({ totalElements: 0, requests: [] })
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    const source = new EventSource(adminApiRequestStreamUrl, { withCredentials: true })
    const update = (event) => {
      const next = JSON.parse(event.data)
      setStatus({
        count: Number(next.count) || 0,
        limit: Number(next.limit) || 0,
        remaining: Number(next.remaining) || 0,
        resetsAt: next.resetsAt || null,
      })
      setConnected(true)
    }
    source.addEventListener('api-requests', update)
    source.onerror = () => setConnected(false)
    return () => {
      source.removeEventListener('api-requests', update)
      source.close()
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!historyOpen) return undefined
    let active = true
    const load = (initial = false) => {
      if (initial) setHistoryLoading(true)
      setHistoryError('')
      lostArkApi
        .getAdminApiRequestHistory()
        .then((result) => {
          if (active) setHistory(Array.isArray(result) ? result : [])
        })
        .catch((error) => {
          if (active) setHistoryError(error.message || 'API 요청 기록을 불러오지 못했습니다.')
        })
        .finally(() => {
          if (active) setHistoryLoading(false)
        })
    }
    load(true)
    const timer = window.setInterval(load, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [historyOpen])

  useEffect(() => {
    if (!historyOpen || !openMinute) return undefined
    let active = true
    const load = (initial = false) => {
      if (initial) setDetailsLoading(true)
      lostArkApi
        .getAdminApiRequestHistoryDetails(openMinute)
        .then((result) => {
          if (active) {
            setHistoryDetails((current) => ({
              ...current,
              [openMinute]: Array.isArray(result) ? result : [],
            }))
          }
        })
        .catch((error) => {
          if (active) setHistoryError(error.message || 'API 상세 기록을 불러오지 못했습니다.')
        })
        .finally(() => {
          if (active) setDetailsLoading(false)
        })
    }
    load(true)
    const timer = window.setInterval(load, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [historyOpen, openMinute])

  useEffect(() => {
    if (!historyOpen || !historySearch) {
      setSearchResult({ totalElements: 0, requests: [] })
      return undefined
    }
    let active = true
    const load = (initial = false) => {
      if (initial) setSearchLoading(true)
      lostArkApi
        .searchAdminApiRequestHistory(historySearch)
        .then((result) => {
          if (active) {
            setSearchResult({
              totalElements: Number(result?.totalElements) || 0,
              requests: Array.isArray(result?.requests) ? result.requests : [],
            })
          }
        })
        .catch((error) => {
          if (active) setHistoryError(error.message || 'API 기록 검색에 실패했습니다.')
        })
        .finally(() => {
          if (active) setSearchLoading(false)
        })
    }
    load(true)
    const timer = window.setInterval(load, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [historyOpen, historySearch])

  const resetAt = status.resetsAt ? new Date(status.resetsAt) : null
  const expired = resetAt && resetAt.getTime() <= now
  const count = expired ? 0 : status.count
  const remaining = expired ? status.limit : status.remaining
  const resetSeconds = resetAt ? Math.max(0, Math.ceil((resetAt.getTime() - now) / 1000)) : 0
  const usagePercent = status.limit ? Math.min(100, (count / status.limit) * 100) : 0
  const number = (value) => value.toLocaleString('ko-KR')

  return (
    <section className="admin-api-status">
      <header>
        <div className="admin-api-status-heading">
          <span>
            <Server />
          </span>
          <div>
            <h2>로스트아크 Open API 사용 현황</h2>
            <p>API 응답의 rate-limit, remaining, reset 헤더를 실시간으로 표시합니다.</p>
          </div>
        </div>
        <div className="admin-api-status-actions">
          <b className={connected ? 'connected' : ''}>{connected ? '실시간 연결' : '연결 중'}</b>
          <button type="button" onClick={() => setHistoryOpen((value) => !value)}>
            <Activity />
            {historyOpen ? '기록 닫기' : '기록 보기'}
          </button>
        </div>
      </header>

      <div className="admin-api-usage">
        <div>
          <span>현재 구간 사용량</span>
          <strong>
            {number(count)}
            <small>/ {status.limit ? number(status.limit) : '-'}</small>
          </strong>
        </div>
        <div className="admin-api-progress" aria-label={`API 사용률 ${usagePercent.toFixed(1)}%`}>
          <i style={{ width: `${usagePercent}%` }} />
        </div>
      </div>

      <div className="admin-api-stat-grid">
        <article>
          <Activity />
          <span>사용한 요청</span>
          <strong>{number(count)}</strong>
        </article>
        <article>
          <Gauge />
          <span>남은 요청</span>
          <strong>{status.limit ? number(remaining) : '-'}</strong>
        </article>
        <article>
          <Server />
          <span>분당 최대</span>
          <strong>{status.limit ? number(status.limit) : '-'}</strong>
        </article>
        <article>
          <Clock3 />
          <span>초기화</span>
          <strong>{resetAt && !expired ? `${resetSeconds}초 후` : '대기 중'}</strong>
          {resetAt && !expired && <small>{resetAt.toLocaleTimeString('ko-KR')}</small>}
        </article>
      </div>

      {historyOpen && (
        <div className="admin-api-history">
          <header>
            <div>
              <h3>분당 API 사용 기록</h3>
              <p>최근 120개 API 제한 구간의 실제 요청을 reset 헤더 기준으로 표시합니다.</p>
            </div>
            <span>{history.length}개 구간</span>
          </header>

          <form
            className="admin-api-history-search"
            onSubmit={(event) => {
              event.preventDefault()
              setHistorySearch(historySearchInput.trim())
            }}
          >
            <Search />
            <input
              type="search"
              value={historySearchInput}
              placeholder="팔찌, 어빌리티 스톤, 캐릭터명, API 경로, HTTP 상태 검색"
              onChange={(event) => setHistorySearchInput(event.target.value)}
            />
            <button type="submit">검색</button>
            {historySearch && (
              <button
                type="button"
                className="clear"
                onClick={() => {
                  setHistorySearchInput('')
                  setHistorySearch('')
                }}
              >
                초기화
              </button>
            )}
          </form>
          <div className="admin-api-history-quick-filters">
            {['팔찌', '어빌리티 스톤', '캐릭터', '거래소', 'HTTP 429', '요청 실패'].map((filter) => (
              <button
                type="button"
                className={historySearch === filter ? 'selected' : ''}
                onClick={() => {
                  setHistorySearchInput(filter)
                  setHistorySearch(filter)
                }}
                key={filter}
              >
                {filter}
              </button>
            ))}
          </div>

          {historyLoading && history.length === 0 && (
            <div className="admin-api-history-state">기록을 불러오는 중입니다.</div>
          )}
          {historyError && <div className="admin-api-history-state error">{historyError}</div>}
          {!historyLoading && !historyError && history.length === 0 && (
            <div className="admin-api-history-state">아직 기록된 API 요청이 없습니다.</div>
          )}

          {historySearch && (
            <div className="admin-api-search-result">
              <header>
                <strong>&lsquo;{historySearch}&rsquo; 검색 결과</strong>
                <span>
                  총 {number(searchResult.totalElements)}건 · 최신{' '}
                  {number(searchResult.requests.length)}건 표시
                </span>
              </header>
              {searchLoading && searchResult.requests.length === 0 && (
                <div className="admin-api-history-state">검색 중입니다.</div>
              )}
              {!searchLoading && searchResult.requests.length === 0 && (
                <div className="admin-api-history-state">검색된 API 기록이 없습니다.</div>
              )}
              <div className="admin-api-request-list">
                {searchResult.requests.map((request, index) => (
                  <ApiRequestRow request={request} index={index} number={number} key={`${request.completedAt}-${index}`} />
                ))}
              </div>
            </div>
          )}

          <div className={`admin-api-minute-list ${historySearch ? 'search-hidden' : ''}`}>
            {history.map((minute) => {
              const minuteKey = minute.resetsAt
              const expanded = openMinute === minuteKey
              const minuteDate = new Date(minute.minuteStartedAt)
              const resetDate = new Date(minute.resetsAt)
              const requests = historyDetails[minuteKey] || []
              const audit = auditApiSequence(requests)
              return (
                <article className={`admin-api-minute ${expanded ? 'expanded' : ''}`} key={minuteKey}>
                  <button
                    type="button"
                    className="admin-api-minute-summary"
                    onClick={() => setOpenMinute(expanded ? '' : minuteKey)}
                  >
                    <ChevronRight />
                    <strong>
                      {minuteDate.toLocaleDateString('ko-KR')}{' '}
                      {minuteDate.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}{' '}
                      ~{' '}
                      {resetDate.toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </strong>
                    <span>총 {number(minute.count)}회</span>
                    <em>성공 {number(minute.successCount)}</em>
                    <small className={minute.failureCount ? 'failed' : ''}>
                      실패 {number(minute.failureCount)}
                    </small>
                  </button>

                  {expanded && (
                    <div className="admin-api-request-list">
                      {detailsLoading && requests.length === 0 && (
                        <div className="admin-api-history-state">상세 기록을 불러오는 중입니다.</div>
                      )}
                      {!detailsLoading && requests.length === 0 && (
                        <div className="admin-api-history-state">이 구간의 상세 기록이 없습니다.</div>
                      )}
                      {!detailsLoading && requests.length > 0 && (
                        <div className={`admin-api-sequence-audit ${audit.missingCount || audit.duplicateCount ? 'warning' : ''}`}>
                          <strong>
                            {audit.missingCount || audit.duplicateCount
                              ? '헤더 번호 불일치 발견'
                              : '헤더 번호 연속 확인'}
                          </strong>
                          <span>
                            누락 번호 {number(audit.missingCount)}개 · 중복 번호{' '}
                            {number(audit.duplicateCount)}개
                          </span>
                          {audit.missingPreview.length > 0 && (
                            <small>
                              기록에 없는 번호: {audit.missingPreview.map((value) => `#${number(value)}`).join(', ')}
                              {audit.missingCount > audit.missingPreview.length ? ' 외' : ''}
                            </small>
                          )}
                        </div>
                      )}
                      {requests.map((request, index) => (
                        <ApiRequestRow
                          request={request}
                          index={index}
                          number={number}
                          key={`${request.completedAt}-${request.target}-${index}`}
                        />
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function auditApiSequence(requests) {
  const sequence = requests
    .filter((request) => Number(request.limit) > 0)
    .map((request) => Number(request.limit) - Number(request.remaining))
    .filter((value) => Number.isInteger(value) && value > 0)
  const unique = new Set(sequence)
  const max = sequence.length ? Math.max(...sequence) : 0
  const missingPreview = []
  let missingCount = 0
  for (let value = 1; value <= max; value += 1) {
    if (!unique.has(value)) {
      missingCount += 1
      if (missingPreview.length < 20) missingPreview.push(value)
    }
  }
  return {
    missingCount,
    missingPreview,
    duplicateCount: sequence.length - unique.size,
  }
}

function ApiRequestRow({ request, index, number }) {
  const limit = Number(request.limit) || 0
  const remaining = Number(request.remaining) || 0
  const requestNumber = limit ? Math.max(0, limit - remaining) : index + 1
  const endpointKind = request.target?.startsWith('/auctions/')
    ? '경매장'
    : request.target?.startsWith('/markets/')
      ? '거래소'
      : request.target?.startsWith('/armories/') || request.target?.startsWith('/characters/')
        ? '캐릭터'
        : request.target?.startsWith('/gamecontents/')
          ? '게임 콘텐츠'
          : '기타'
  return (
    <div
      className="admin-api-request-row"
      key={`${request.completedAt}-${request.target}-${index}`}
    >
      <time className="request-sequence">
        {limit ? (
          <b>#{number(requestNumber)}</b>
        ) : (
          <b>#{number(index + 1)}</b>
        )}
      </time>
      <i className="request-kind">{endpointKind}</i>
      <b>{request.method}</b>
      <code>{request.target}</code>
      <span>{request.description || '요청 설명 없음'}</span>
      <strong className={request.statusCode >= 200 && request.statusCode < 400 ? '' : 'failed'}>
        {request.statusCode ? `HTTP ${request.statusCode}` : '요청 실패'}
      </strong>
      <small>{number(request.elapsedMs)} ms</small>
      <em>
        {request.limit
          ? `${number(request.remaining)} / ${number(request.limit)} 남음`
          : '-'}
      </em>
      {request.error && <p>{request.error}</p>}
    </div>
  )
}
