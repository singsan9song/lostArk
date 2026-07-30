import { RefreshCw, Shield, Star, Swords } from 'lucide-react'
import { useState } from 'react'
import { useFavorites } from '../lib/favorites'
import { lostArkApi } from '../lib/api'
import { representativeEngraving } from '../lib/representativeEngraving'
import { useCooldownSeconds } from '../lib/useCooldownSeconds'

export default function ProfileHero({
  profile,
  armory,
  siblings = [],
  onRefresh,
  refreshing,
  refreshCooldownUntil = 0,
}) {
  const { favorites, toggle, add } = useFavorites()
  const [confirmRoster, setConfirmRoster] = useState(false)
  const [selectedRoster, setSelectedRoster] = useState([])
  const [rosterProfiles, setRosterProfiles] = useState({})
  const favorite = favorites.some((item) => item.characterName === profile.CharacterName)
  const rosterCharacters = siblings.filter(
    (item) => item.CharacterName && item.CharacterName !== profile.CharacterName,
  )
  const rosterNames = new Set([
    profile.CharacterName,
    ...rosterCharacters.map((item) => item.CharacterName),
  ])
  const knownRoster = favorites.find((item) => rosterNames.has(item.characterName) && item.rosterId)
  const rosterGroup = knownRoster
    ? { rosterId: knownRoster.rosterId, rosterName: knownRoster.rosterName }
    : {
        rosterId: `roster-${profile.ServerName}-${profile.CharacterName}`,
        rosterName: `${profile.CharacterName} 원정대`,
      }
  const enrichedRoster = rosterCharacters.map((item) => rosterProfiles[item.CharacterName] || item)
  const loadRosterProfiles = () =>
    rosterCharacters
      .filter((item) => !rosterProfiles[item.CharacterName])
      .forEach((item) => {
        lostArkApi
          .getCharacter(item.CharacterName)
          .then((data) => {
            const loadedProfile = data?.armory?.ArmoryProfile
            if (loadedProfile)
              setRosterProfiles((current) => ({ ...current, [item.CharacterName]: loadedProfile }))
          })
          .catch(() => {})
      })
  const addFavorite = () => {
    if (favorite) return toggle(profile)
    if (rosterCharacters.length) {
      setSelectedRoster([])
      setConfirmRoster(true)
      loadRosterProfiles()
      return
    }
    toggle(profile)
  }
  const addCurrent = () => {
    add([profile], rosterGroup)
    setConfirmRoster(false)
  }
  const addRoster = () => {
    add([profile, ...enrichedRoster], rosterGroup)
    setConfirmRoster(false)
  }
  const addSelected = () => {
    add(
      [profile, ...enrichedRoster.filter((item) => selectedRoster.includes(item.CharacterName))],
      rosterGroup,
    )
    setConfirmRoster(false)
  }
  const toggleRoster = (characterName) =>
    setSelectedRoster((current) =>
      current.includes(characterName)
        ? current.filter((name) => name !== characterName)
        : [...current, characterName],
    )
  const engraving = representativeEngraving(armory, profile.CharacterClassName)
  const details = [
    ['서버', profile.ServerName || '-'],
    ['원정대', `Lv.${profile.ExpeditionLevel || '-'}`],
    ['명예', profile.HonorPoint ?? '-'],
    ['칭호', profile.Title || '-'],
    ['길드', profile.GuildName || '-'],
    ['PVP', '-'],
    ['영지', profile.TownName ? `Lv.${profile.TownLevel} ${profile.TownName}` : '-'],
  ]

  return (
    <header className="profile-hero profile-card-simple">
      <div className="profile-card-glow" />
      <div className="profile-copy">
        <p className="profile-class">
          Lv. {profile.CharacterLevel} {profile.CharacterClassName}
          <span className="profile-representative-engraving">
            <img src="/images/etc/ico_arkpassive.png" alt="" aria-hidden="true" />
            {engraving}
          </span>
        </p>
        <h1>{profile.CharacterName}</h1>
        <div className="profile-scores">
          <div>
            <span>
              <Shield />
              아이템 레벨
            </span>
            <strong>{profile.ItemAvgLevel || '-'}</strong>
          </div>
          <div>
            <span>
              <Swords />
              전투력
            </span>
            <strong>{profile.CombatPower || '-'}</strong>
          </div>
        </div>
        <dl>
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <ProfileRefreshButton
        onRefresh={onRefresh}
        refreshing={refreshing}
        refreshCooldownUntil={refreshCooldownUntil}
      />
      <button
        className={`profile-favorite ${favorite ? 'active' : ''}`}
        type="button"
        onClick={addFavorite}
        aria-label={favorite ? '캐릭터 즐겨찾기 해제' : '캐릭터 즐겨찾기 추가'}
        aria-pressed={favorite}
      >
        <Star />
      </button>
      <div className="profile-visual">
        {profile.CharacterImage ? (
          <img src={profile.CharacterImage} alt={`${profile.CharacterName} 캐릭터`} />
        ) : (
          <div className="profile-fallback">{profile.CharacterClassName?.[0]}</div>
        )}
      </div>
      {confirmRoster && (
        <div className="favorite-confirm-backdrop" onClick={() => setConfirmRoster(false)}>
          <div
            className="favorite-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="favorite-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span>
              <Star />
            </span>
            <h2 id="favorite-confirm-title">함께 추가할 캐릭터를 선택하세요</h2>
            <p>
              <strong>{profile.CharacterName}</strong>님은 기본으로 추가됩니다.
              <br />
              같은 원정대 캐릭터를 선택해 함께 저장할 수 있습니다.
            </p>
            <div className="favorite-roster-list">
              {rosterCharacters.map((item) => {
                const checked = selectedRoster.includes(item.CharacterName)
                const loaded = rosterProfiles[item.CharacterName]
                return (
                  <label className={checked ? 'checked' : ''} key={item.CharacterName}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRoster(item.CharacterName)}
                    />
                    <i>{checked ? '✓' : ''}</i>
                    <span className="roster-choice-avatar">
                      {loaded?.CharacterImage ? (
                        <img src={loaded.CharacterImage} alt="" />
                      ) : (
                        item.CharacterClassName?.[0]
                      )}
                    </span>
                    <span className="roster-choice-copy">
                      <strong>{item.CharacterName}</strong>
                      <small>
                        {item.ServerName} · {item.CharacterClassName}
                      </small>
                    </span>
                    <b>Lv. {item.ItemAvgLevel || '-'}</b>
                  </label>
                )
              })}
            </div>
            <div className="favorite-confirm-actions">
              <button onClick={addCurrent}>현재 캐릭터만</button>
              <button className="primary" onClick={addSelected} disabled={!selectedRoster.length}>
                선택 추가 ({selectedRoster.length})
              </button>
              <button className="all" onClick={addRoster}>
                원정대 전체 추가
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

// Owns its own 1s cooldown timer (via useCooldownSeconds) so only this button re-renders
// each second, instead of the whole ProfileHero (and everything above it in the tree)
// re-rendering every second just to update a countdown string.
function ProfileRefreshButton({ onRefresh, refreshing, refreshCooldownUntil }) {
  const refreshCooldown = useCooldownSeconds(refreshCooldownUntil)
  return (
    <button
      className="profile-refresh"
      type="button"
      onClick={onRefresh}
      disabled={refreshing || refreshCooldown > 0}
      title={
        refreshCooldown > 0
          ? `${refreshCooldown}초 후 다시 갱신할 수 있습니다.`
          : '현재 캐릭터 정보 갱신'
      }
    >
      <RefreshCw className={refreshing ? 'spin' : ''} />
      <span>
        {refreshing ? '갱신 중' : refreshCooldown > 0 ? `${refreshCooldown}초` : '정보 갱신'}
      </span>
    </button>
  )
}
