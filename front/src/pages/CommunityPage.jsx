import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  Pencil,
  Search,
} from 'lucide-react'
import { lostArkApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { COMMUNITY_CATEGORIES, formatCommunityDate } from '../lib/community'
import CommunityWriteModal from '../components/CommunityWriteModal'
import '../community.css'

export default function CommunityPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const category = COMMUNITY_CATEGORIES.some((item) => item.id === searchParams.get('category'))
    ? searchParams.get('category')
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
    let active = true
    setLoading(true)
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

  return (
    <div className="community-page">
      <header className="community-header">
        <h1>커뮤니티</h1>
      </header>

      <div className="community-category-tabs">
        {COMMUNITY_CATEGORIES.map((item) => (
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
