import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { lostArkApi } from '../lib/api'
import { communityCategoryLabel } from '../lib/community'

export default function CommunityWriteModal({ category, close, onCreated }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('제목과 내용을 모두 입력해 주세요.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const post = await lostArkApi.createCommunityPost({ category, title, content })
      onCreated(post)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="community-write-backdrop" onClick={close}>
      <section
        className="community-write-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>글쓰기</h2>
            <p>{communityCategoryLabel(category)}에 새 글을 작성합니다.</p>
          </div>
          <button type="button" onClick={close} aria-label="닫기">
            <X />
          </button>
        </header>
        <form className="community-write-form" onSubmit={submit}>
          <input
            type="text"
            placeholder="제목을 입력해 주세요."
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
          <textarea
            placeholder="내용을 입력해 주세요."
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={12}
          />
          {error && <p className="community-write-error">{error}</p>}
          <footer>
            <button type="button" onClick={close}>
              취소
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              <Check /> 등록
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
