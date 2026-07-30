import { AlertCircle, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CharacterResult from '../components/CharacterResult'
import { lostArkApi } from '../lib/api'

const REFRESH_COOLDOWN_MS = 60_000
const cooldownKey = (type, characterName) =>
  `loark-character-${type}-refresh:${characterName.trim().toLocaleLowerCase()}`
const readCooldown = (type, characterName) => {
  const value = Number(localStorage.getItem(cooldownKey(type, characterName)))
  return Number.isFinite(value) && value > Date.now() ? value : 0
}
const startCooldown = (type, characterName, setter) => {
  const until = Date.now() + REFRESH_COOLDOWN_MS
  localStorage.setItem(cooldownKey(type, characterName), String(until))
  setter(until)
}

export default function CharacterPage() {
  const { characterName = '' } = useParams()
  const name = decodeURIComponent(characterName)
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [characterRefreshing, setCharacterRefreshing] = useState(false)
  const [characterRefreshError, setCharacterRefreshError] = useState('')
  const [rosterRefreshing, setRosterRefreshing] = useState(false)
  const [rosterError, setRosterError] = useState('')
  const [characterCooldownUntil, setCharacterCooldownUntil] = useState(() =>
    readCooldown('information', name),
  )
  const [rosterCooldownUntil, setRosterCooldownUntil] = useState(() =>
    readCooldown('roster', name),
  )
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData(null)
    setCharacterRefreshError('')
    setRosterError('')
    setCharacterCooldownUntil(readCooldown('information', name))
    setRosterCooldownUntil(readCooldown('roster', name))
    lostArkApi
      .getCharacter(name)
      .then((result) => {
        if (!active) return
        setData(result)
        startCooldown('information', name, setCharacterCooldownUntil)
      })
      .catch((err) => active && setError(err.message || '캐릭터 정보를 불러오지 못했습니다.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [name])

  const refreshCharacter = async () => {
    if (characterRefreshing || characterCooldownUntil > Date.now()) return
    startCooldown('information', name, setCharacterCooldownUntil)
    setCharacterRefreshing(true)
    setCharacterRefreshError('')
    try {
      setData(await lostArkApi.refreshCharacter(name))
    } catch (refreshError) {
      setCharacterRefreshError(refreshError.message || '캐릭터 정보를 갱신하지 못했습니다.')
    } finally {
      setCharacterRefreshing(false)
    }
  }

  const refreshRoster = async () => {
    if (rosterRefreshing || rosterCooldownUntil > Date.now()) return
    startCooldown('roster', name, setRosterCooldownUntil)
    setRosterRefreshing(true)
    setRosterError('')
    try {
      setData(await lostArkApi.refreshCharacterRoster(name))
    } catch (refreshError) {
      setRosterError(refreshError.message || '원정대 정보를 갱신하지 못했습니다.')
    } finally {
      setRosterRefreshing(false)
    }
  }

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
          onCharacterRefresh={refreshCharacter}
          characterRefreshing={characterRefreshing}
          characterRefreshError={characterRefreshError}
          characterRefreshCooldown={Math.max(
            0,
            Math.ceil((characterCooldownUntil - now) / 1000),
          )}
          onRosterRefresh={refreshRoster}
          rosterRefreshing={rosterRefreshing}
          rosterError={rosterError}
          rosterRefreshCooldown={Math.max(0, Math.ceil((rosterCooldownUntil - now) / 1000))}
        />
      )}
    </div>
  )
}
