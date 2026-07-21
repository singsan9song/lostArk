import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, MessageCircle, Send, Trash2 } from 'lucide-react'
import { lostArkApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { communityCategoryLabel, formatCommunityDate } from '../lib/community'
import '../community.css'

export default function CommunityPostPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, loginUrl } = useAuth()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = () =>
    lostArkApi
      .getCommunityPost(postId)
      .then(setPost)
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    setLoading(true)
    setError('')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  const toggleLike = () => {
    if (!user || !post) return
    lostArkApi
      .toggleCommunityLike(post.id)
      .then(({ liked, likeCount }) =>
        setPost((current) => ({ ...current, likedByMe: liked, likeCount })),
      )
  }

  const submitComment = (event) => {
    event.preventDefault()
    if (!comment.trim() || !post) return
    setSubmitting(true)
    lostArkApi
      .createCommunityComment(post.id, comment)
      .then((created) => {
        setComment('')
        setPost((current) => ({ ...current, comments: [...current.comments, created] }))
      })
      .catch((submitError) => setError(submitError.message))
      .finally(() => setSubmitting(false))
  }

  const removeComment = (id) => {
    if (!window.confirm('댓글을 삭제할까요?')) return
    lostArkApi.deleteCommunityComment(id).then(() =>
      setPost((current) => ({
        ...current,
        comments: current.comments.filter((item) => item.id !== id),
      })),
    )
  }

  const removePost = () => {
    if (!post || !window.confirm('게시글을 삭제할까요?')) return
    lostArkApi
      .deleteCommunityPost(post.id)
      .then(() => navigate(`/community?category=${post.category}`))
  }

  if (loading) return <div className="community-page community-state">불러오는 중입니다.</div>
  if (error || !post)
    return (
      <div className="community-page community-state error">
        {error || '게시글을 찾을 수 없습니다.'}
      </div>
    )

  const canManagePost = user && (user.id === post.authorDiscordId || user.isAdmin)

  return (
    <div className="community-page community-post-page">
      <Link className="community-back-link" to={`/community?category=${post.category}`}>
        <ArrowLeft /> 목록으로
      </Link>

      <article className="community-post-detail">
        <header>
          <span className="community-post-category">{communityCategoryLabel(post.category)}</span>
          <h1>{post.title}</h1>
          <div className="community-post-meta">
            {post.authorAvatarUrl ? (
              <img src={post.authorAvatarUrl} alt="" />
            ) : (
              <i>
                <MessageCircle />
              </i>
            )}
            <b>{post.authorName}</b>
            <time>{formatCommunityDate(post.createdAt)}</time>
            <span>조회 {post.viewCount}</span>
          </div>
        </header>
        <div className="community-post-content">{post.content}</div>
        <footer>
          <button
            className={post.likedByMe ? 'community-like-button active' : 'community-like-button'}
            type="button"
            disabled={!user}
            title={user ? '' : '디스코드 로그인 후 좋아요를 누를 수 있습니다.'}
            onClick={toggleLike}
          >
            <Heart /> {post.likeCount}
          </button>
          {canManagePost && (
            <button className="community-delete-button" type="button" onClick={removePost}>
              <Trash2 /> 삭제
            </button>
          )}
        </footer>
      </article>

      <section className="community-comments">
        <h2>댓글 {post.comments.length}</h2>
        <div className="community-comment-list">
          {post.comments.length === 0 && <p className="community-state">첫 댓글을 남겨보세요.</p>}
          {post.comments.map((item) => (
            <article className="community-comment" key={item.id}>
              {item.authorAvatarUrl ? (
                <img src={item.authorAvatarUrl} alt="" />
              ) : (
                <i>
                  <MessageCircle />
                </i>
              )}
              <div>
                <header>
                  <b>{item.authorName}</b>
                  <time>{formatCommunityDate(item.createdAt)}</time>
                </header>
                <p>{item.content}</p>
              </div>
              {user && (user.id === item.authorDiscordId || user.isAdmin) && (
                <button type="button" onClick={() => removeComment(item.id)} title="댓글 삭제">
                  <Trash2 />
                </button>
              )}
            </article>
          ))}
        </div>

        {user ? (
          <form className="community-comment-form" onSubmit={submitComment}>
            <input
              type="text"
              placeholder="댓글을 입력해 주세요."
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={2000}
            />
            <button type="submit" disabled={submitting}>
              <Send />
            </button>
          </form>
        ) : (
          <p className="community-comment-login">
            <a href={loginUrl}>디스코드 로그인</a> 후 댓글을 작성할 수 있습니다.
          </p>
        )}
      </section>
    </div>
  )
}
