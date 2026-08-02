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

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setData(null)
    setCharacterRefreshError('')
    setRosterError('')
    setCharacterCooldownUntil(readCooldown('information', name))
    setRosterCooldownUntil(readCooldown('roster', name))

    async function load() {
      // 1) Show whatever's already in the DB immediately, if anything.
      let hasCachedData = false
      try {
        const cachedResult = await lostArkApi.getCachedCharacter(name)
        if (!active) return
        setData(cachedResult)
        setLoading(false)
        hasCachedData = true
      } catch {
        // No snapshot yet (404) — fall through to the live fetch below.
      }

      // 2) Live data is only worth waiting on the API's rate-limited cooldown for.
      // Skip it if we already refreshed recently and just keep showing the cache.
      if (hasCachedData && readCooldown('information', name) > Date.now()) return

      try {
        const live = await lostArkApi.getCharacter(name, controller.signal)
        if (!active) return
        setData(live)
        startCooldown('information', name, setCharacterCooldownUntil)
      } catch (err) {
        if (!active || err.name === 'AbortError') return
        // With cached data already on screen, a failed background refresh isn't
        // worth surfacing as an error — the user is still looking at valid data.
        if (!hasCachedData) setError(err.message || '캐릭터 정보를 불러오지 못했습니다.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()

    return () => {
      active = false
      controller.abort()
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
          characterRefreshCooldownUntil={characterCooldownUntil}
          onRosterRefresh={refreshRoster}
          rosterRefreshing={rosterRefreshing}
          rosterError={rosterError}
          rosterRefreshCooldownUntil={rosterCooldownUntil}
        />
      )}
    </div>
  )
}
