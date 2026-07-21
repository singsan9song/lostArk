import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function CharacterSearch({ initialValue = '', compact = false }) {
  const [query, setQuery] = useState(initialValue)
  const navigate = useNavigate()
  const submit = (event) => {
    event.preventDefault()
    const name = query.trim()
    if (name) navigate(`/characters/${encodeURIComponent(name)}`)
  }
  return (
    <form className={`search-box ${compact ? 'compact-search' : ''}`} onSubmit={submit}>
      <Search />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="캐릭터명을 입력하세요"
        aria-label="캐릭터명"
      />
      <button>검색</button>
    </form>
  )
}
