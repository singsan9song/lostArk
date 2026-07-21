import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CharacterResult from '../components/CharacterResult'
import { lostArkApi } from '../lib/api'

export default function CharacterPage() {
  const { characterName = '' } = useParams()
  const name = decodeURIComponent(characterName)
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData(null)
    lostArkApi
      .getCharacter(name)
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err.message || '캐릭터 정보를 불러오지 못했습니다.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [name])

  return (
    <div className="character-page">
      {loading && (
        <div className="character-state">
          <LoaderCircle className="spin" />
          <h2>{name}</h2>
          <p>캐릭터 정보를 불러오는 중입니다.</p>
        </div>
      )}
      {!loading && error && (
        <div className="character-state error">
          <AlertCircle />
          <h2>캐릭터를 찾지 못했습니다</h2>
          <p>{error}</p>
          <div>
            <button onClick={() => location.reload()}>
              <RefreshCw /> 다시 시도
            </button>
            <Link to="/">메인으로</Link>
          </div>
        </div>
      )}
      {!loading && data && (
        <CharacterResult
          data={data}
          onSiblingSearch={(sibling) => navigate(`/characters/${encodeURIComponent(sibling)}`)}
        />
      )}
    </div>
  )
}
