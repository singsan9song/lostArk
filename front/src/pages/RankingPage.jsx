import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import jobData from '../data/job.json'
import { lostArkApi } from '../lib/api'
import '../ranking.css'

const PAGE_SIZE = 50

const metricText = {
  combatPower: {
    title: '전투력 랭킹',
    description: '저장된 최신 전투력을 기준으로 비교합니다.',
    label: '전투력',
  },
  itemLevel: {
    title: '아이템 레벨 랭킹',
    description: '저장된 최신 아이템 레벨을 기준으로 비교합니다.',
    label: '아이템 레벨',
  },
}

const numberText = (value, digits = 0) => {
  const numeric = Number(String(value || '').replaceAll(',', ''))
  if (!Number.isFinite(numeric)) return '-'
  return numeric.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

const updatedText = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function RankMark({ rank }) {
  if (rank <= 3)
    return (
      <span className={`ranking-medal rank-${rank}`}>
        <Medal />
        {rank}
      </span>
    )
  return <span className="ranking-number">{rank.toLocaleString('ko-KR')}</span>
}

function RankingFilters({
  data,
  server,
  setServer,
  role,
  setRole,
  className,
  setClassName,
  engraving,
  setEngraving,
}) {
  const engravings = useMemo(
    () => jobData.classes.find((job) => job.className === className)?.engravings || [],
    [className],
  )

  return (
    <div className="ranking-filters">
      <label>
        <span>서버</span>
        <select value={server} onChange={(event) => setServer(event.target.value)}>
          <option value="">전체 서버</option>
          {(data?.options?.servers || []).map((name) => (
            <option value={name} key={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>역할</span>
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">딜러 + 서포터</option>
          <option value="DEALER">딜러</option>
          <option value="SUPPORT">서포터</option>
        </select>
      </label>
      <label>
        <span>직업</span>
        <select
          value={className}
          onChange={(event) => {
            setClassName(event.target.value)
            setEngraving('')
          }}
        >
          <option value="">전체 직업</option>
          {(data?.options?.classes || []).map((name) => (
            <option value={name} key={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>직업 각인</span>
        <select
          value={engraving}
          onChange={(event) => setEngraving(event.target.value)}
          disabled={!className}
        >
          <option value="">{className ? '전체 각인' : '직업을 먼저 선택'}</option>
          {engravings.map((name) => (
            <option value={name} key={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function RankingPagination({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null
  const first = Math.max(0, Math.min(page - 2, totalPages - 5))
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => first + index)
  return (
    <nav className="ranking-pagination" aria-label="랭킹 페이지">
      <button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
        <ChevronLeft />
      </button>
      {pages.map((number) => (
        <button
          className={number === page ? 'selected' : ''}
          onClick={() => setPage(number)}
          key={number}
        >
          {number + 1}
        </button>
      ))}
      <button
        disabled={page >= totalPages - 1}
        onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
      >
        <ChevronRight />
      </button>
    </nav>
  )
}

export default function RankingPage() {
  const [metric, setMetric] = useState('combatPower')
  const [server, setServer] = useState('')
  const [role, setRole] = useState('')
  const [className, setClassName] = useState('')
  const [engraving, setEngraving] = useState('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filter changes and the page-reset they trigger used to be two separate effects, which
  // both fired on the same filter change - one request with the stale page, then a second
  // with page 0. Tracking the filter signature in a ref lets this single effect skip straight
  // to the page reset (no fetch) when filters change, then fetch once page settles to 0.
  const filterSignature = `${metric}|${server}|${role}|${className}|${engraving}`
  const filterSignatureRef = useRef(filterSignature)

  useEffect(() => {
    const filtersChanged = filterSignatureRef.current !== filterSignature
    filterSignatureRef.current = filterSignature
    if (filtersChanged && page !== 0) {
      setPage(0)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    lostArkApi
      .getCharacterRankings({
        metric,
        server,
        role,
        className,
        engraving,
        page,
        size: PAGE_SIZE,
        signal: controller.signal,
      })
      .then((result) => setData(result))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return
        setError(requestError.message || '랭킹을 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [metric, server, role, className, engraving, page, filterSignature])

  const copy = metricText[metric]
  const rows = data?.rows || []

  return (
    <div className="ranking-page">
      <section className="ranking-hero">
        <div>
          <span className="ranking-eyebrow">
            <Trophy />
            LOARK CHARACTER RANKING
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.description} 같은 수치에서는 더 먼저 갱신된 캐릭터가 앞섭니다.</p>
        </div>
        <div className="ranking-total">
          <small>현재 조건 캐릭터</small>
          <strong>{Number(data?.totalElements || 0).toLocaleString('ko-KR')}</strong>
          <span>명</span>
        </div>
      </section>

      <div className="ranking-metric-tabs">
        <button
          className={metric === 'combatPower' ? 'selected' : ''}
          onClick={() => setMetric('combatPower')}
        >
          <Swords />
          <span>
            <b>전투력 랭킹</b>
            <small>Combat Power</small>
          </span>
        </button>
        <button
          className={metric === 'itemLevel' ? 'selected' : ''}
          onClick={() => setMetric('itemLevel')}
        >
          <Sparkles />
          <span>
            <b>아이템 레벨 랭킹</b>
            <small>Item Level</small>
          </span>
        </button>
      </div>

      <RankingFilters
        data={data}
        server={server}
        setServer={setServer}
        role={role}
        setRole={setRole}
        className={className}
        setClassName={setClassName}
        engraving={engraving}
        setEngraving={setEngraving}
      />

      <section className="ranking-board">
        <header>
          <div>
            <ShieldCheck />
            <span>
              <b>{copy.title}</b>
              <small>DB에 저장된 최신 캐릭터 기준</small>
            </span>
          </div>
          {loading && (
            <span className="ranking-loading">
              <RefreshCw />
              불러오는 중
            </span>
          )}
        </header>

        {error ? (
          <div className="ranking-state error">{error}</div>
        ) : !loading && !rows.length ? (
          <div className="ranking-state">
            아직 조건에 맞는 랭킹 데이터가 없습니다.
            <small>기존 캐릭터의 랭킹 정보가 백그라운드에서 준비 중일 수 있습니다.</small>
          </div>
        ) : (
          <div className="ranking-table-wrap">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>순위</th>
                  <th>캐릭터</th>
                  <th>서버</th>
                  <th>직업 / 각인</th>
                  <th>역할</th>
                  <th>{copy.label}</th>
                  <th>갱신</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.characterName}>
                    <td>
                      <RankMark rank={row.rank} />
                    </td>
                    <td>
                      <Link
                        className="ranking-character"
                        to={`/characters/${encodeURIComponent(row.characterName)}`}
                      >
                        <span>
                          {row.characterImage ? (
                            <img loading="lazy" src={row.characterImage} alt="" />
                          ) : (
                            row.className?.[0] || '?'
                          )}
                        </span>
                        <b>{row.characterName}</b>
                      </Link>
                    </td>
                    <td>
                      <span className="ranking-server">{row.serverName || '-'}</span>
                    </td>
                    <td>
                      <div className="ranking-build">
                        <b>{row.className || '-'}</b>
                        <small>{row.engraving || '대표 각인 미확인'}</small>
                      </div>
                    </td>
                    <td>
                      <span className={`ranking-role ${row.role?.toLowerCase()}`}>
                        {row.role === 'SUPPORT' ? '서포터' : '딜러'}
                      </span>
                    </td>
                    <td>
                      <strong className="ranking-score">
                        {metric === 'itemLevel'
                          ? `Lv. ${numberText(row.itemLevel, 2)}`
                          : numberText(row.combatPower)}
                      </strong>
                    </td>
                    <td>
                      <time dateTime={row.updatedAt || undefined}>{updatedText(row.updatedAt)}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RankingPagination page={page} totalPages={data?.totalPages || 0} setPage={setPage} />
    </div>
  )
}
