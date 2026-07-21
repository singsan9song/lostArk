import {
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Pencil,
  RefreshCw,
  Settings2,
  Star,
  Swords,
  UsersRound,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import raidExtraData from '../data/raid-extra.json'
import { GoldAmount } from '../components/GoldIcon'
import { addFavorites, groupFavorites, renameFavoriteRoster, useFavorites } from '../lib/favorites'
import {
  getExpeditionRaidSettings,
  saveExpeditionRaidSettings,
  setCharacterRaidSettings,
} from '../lib/expeditionRaids'
import { lostArkApi } from '../lib/api'
import { getRaidImage } from '../lib/raidImages'
import '../expedition-page.css'
import '../expedition-page-edit.css'
import '../expedition-raid-settings.css'
import '../expedition-raid-settings-v2.css'
import '../raid-images.css'

const raids = raidExtraData.categories.flatMap((category) =>
  category.raids.map((raid) => ({ ...raid, categoryName: category.name })),
)
const minRequiredLevel = (raid) =>
  Math.min(
    ...(raid.difficulties || []).map((difficulty) => Number(difficulty.requiredItemLevel || 0)),
  )
const raidCategoriesByLevel = raidExtraData.categories
  .map((category) => ({
    ...category,
    raids: [...category.raids].sort((a, b) => minRequiredLevel(a) - minRequiredLevel(b)),
  }))
  .sort((a, b) => minRequiredLevel(a.raids[0]) - minRequiredLevel(b.raids[0]))
const levelNumber = (value) => Number(String(value || '0').replace(/,/g, '')) || 0
const formatLevel = (value) =>
  levelNumber(value).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatPower = (value) =>
  levelNumber(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
const raidById = (id) => raids.find((raid) => raid.id === id)
const difficultyOf = (task) =>
  raidById(task.raidId)?.difficulties.find((difficulty) => difficulty.id === task.difficultyId)
const gateMedals = (gate) =>
  (gate.clearRewards || [])
    .filter((reward) => reward.item === '클리어 메달')
    .reduce((sum, reward) => sum + Number(reward.amount || 0), 0)
const taskDefaults = (task) => ({
  goldEarning: true,
  busFare: 0,
  extraRewardGates: [],
  completedGates: [],
  ...task,
})

function expeditionGroups(favorites) {
  return groupFavorites(favorites).flatMap((group) =>
    group.id === 'ungrouped'
      ? group.characters.map((character) => ({
          id: `single-${character.characterName}`,
          name: `${character.characterName} 원정대`,
          characters: [character],
        }))
      : [group],
  )
}

function defaultDifficulty(raid, character) {
  const itemLevel = levelNumber(character.itemLevel)
  return (
    [...raid.difficulties]
      .filter((item) => Number(item.requiredItemLevel || 0) <= itemLevel)
      .sort((a, b) => Number(b.requiredItemLevel || 0) - Number(a.requiredItemLevel || 0))[0] ||
    raid.difficulties[0]
  )
}

function RaidSettingsModal({ group, initialCharacter, settings, save, close }) {
  const [characterName, setCharacterName] = useState(initialCharacter.characterName)
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(settings)))
  const character =
    group.characters.find((item) => item.characterName === characterName) || group.characters[0]
  const tasks = (draft[character.characterName] || []).map(taskDefaults)
  const taskFor = (raidId) => tasks.find((task) => task.raidId === raidId)
  const replaceTasks = (next) =>
    setDraft((current) => ({ ...current, [character.characterName]: next }))
  const updateTask = (raidId, changes) =>
    replaceTasks(tasks.map((task) => (task.raidId === raidId ? { ...task, ...changes } : task)))
  const toggleRaid = (raid) => {
    const current = taskFor(raid.id)
    if (current) replaceTasks(tasks.filter((task) => task.raidId !== raid.id))
    else {
      const difficulty = defaultDifficulty(raid, character)
      replaceTasks([
        ...tasks,
        {
          raidId: raid.id,
          difficultyId: difficulty.id,
          goldEarning: true,
          busFare: 0,
          extraRewardGates: [],
          completedGates: [],
        },
      ])
    }
  }
  const setDifficulty = (raidId, difficultyId) =>
    updateTask(raidId, { difficultyId, extraRewardGates: [], completedGates: [] })
  const toggleArrayValue = (raidId, field, value) => {
    const task = taskFor(raidId)
    const values = task?.[field] || []
    updateTask(raidId, {
      [field]: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    })
  }

  return (
    <div className="expedition-raid-backdrop">
      <section
        className="expedition-raid-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="raid-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="raid-settings-title">레이드 설정</h2>
            <p>변경 사항은 저장 버튼을 눌러야 적용됩니다.</p>
          </div>
          <button type="button" onClick={close} aria-label="설정 취소">
            <X />
          </button>
        </header>
        <div className="expedition-raid-layout">
          <aside className="expedition-raid-characters">
            {[...group.characters]
              .sort((a, b) => levelNumber(b.itemLevel) - levelNumber(a.itemLevel))
              .map((item) => (
                <button
                  className={item.characterName === character.characterName ? 'active' : ''}
                  type="button"
                  onClick={() => setCharacterName(item.characterName)}
                  key={item.characterName}
                >
                  <span>
                    {item.characterImage ? (
                      <img src={item.characterImage} alt="" />
                    ) : (
                      item.className?.[0]
                    )}
                  </span>
                  <div>
                    <b>{item.characterName}</b>
                    <small>Lv. {item.itemLevel || '-'}</small>
                  </div>
                </button>
              ))}
          </aside>
          <main className="expedition-raid-config">
            <div className="expedition-raid-config-heading">
              <span>
                <b>{character.characterName}</b>
                <small>골드·메달·더보기 비용은 레이드 데이터 기준입니다.</small>
              </span>
              <em>{tasks.length}개 등록</em>
            </div>
            {tasks.length ? (
              tasks.map((task) => {
                const raid = raidById(task.raidId)
                if (!raid) return null
                const difficulty = difficultyOf(task) || raid.difficulties[0]
                const tradeGold = difficulty.gates.reduce(
                  (sum, gate) => sum + Number(gate.rewardGold || 0),
                  0,
                )
                const boundGold = difficulty.gates.reduce(
                  (sum, gate) => sum + Number(gate.boundGold || 0),
                  0,
                )
                const medals = difficulty.gates.reduce((sum, gate) => sum + gateMedals(gate), 0)
                const raidImage = getRaidImage(raid.id)
                return (
                  <article className="expedition-raid-config-card" key={raid.id}>
                    <header>
                      <span className="expedition-raid-config-name">
                        {raidImage && <img src={raidImage} alt="" />}
                        <span>
                          <small>{raid.categoryName}</small>
                          <strong>{raid.name}</strong>
                        </span>
                      </span>
                      <div className="expedition-raid-card-actions">
                        <label className={!task.goldEarning ? 'active' : ''}>
                          <input
                            type="checkbox"
                            checked={!task.goldEarning}
                            onChange={(event) =>
                              updateTask(raid.id, { goldEarning: !event.target.checked })
                            }
                          />
                          골드 획득 안 함
                        </label>
                        <button type="button" onClick={() => toggleRaid(raid)}>
                          <X /> 삭제
                        </button>
                      </div>
                    </header>
                    <div className="expedition-difficulty-options">
                      {raid.difficulties.map((option) => (
                        <button
                          className={option.id === difficulty.id ? 'active' : ''}
                          type="button"
                          onClick={() => setDifficulty(raid.id, option.id)}
                          key={option.id}
                        >
                          <b>{option.name}</b>
                          <small>
                            Lv. {Number(option.requiredItemLevel || 0).toLocaleString('ko-KR')}
                          </small>
                        </button>
                      ))}
                    </div>
                    <div className="expedition-raid-totals">
                      <span>
                        거래 가능{' '}
                        <GoldAmount>
                          {task.goldEarning ? tradeGold.toLocaleString('ko-KR') : '0'}
                        </GoldAmount>
                      </span>
                      <span>
                        귀속{' '}
                        <GoldAmount>
                          {task.goldEarning ? boundGold.toLocaleString('ko-KR') : '0'}
                        </GoldAmount>
                      </span>
                      <span>
                        클리어 메달 <b>{medals.toLocaleString('ko-KR')}개</b>
                      </span>
                      <label>
                        버스비{' '}
                        <input
                          inputMode="numeric"
                          value={task.busFare || ''}
                          placeholder="0"
                          onChange={(event) =>
                            updateTask(raid.id, {
                              busFare: Number(event.target.value.replace(/[^0-9]/g, '')) || 0,
                            })
                          }
                        />{' '}
                        G
                      </label>
                    </div>
                    <div className="expedition-gate-reward-rows">
                      {difficulty.gates.map((gate) => {
                        const medalCount = gateMedals(gate)
                        const extraSelected = (task.extraRewardGates || []).includes(gate.gate)
                        const complete = (task.completedGates || []).includes(gate.gate)
                        return (
                          <div key={gate.gate}>
                            <button
                              className={complete ? 'complete' : ''}
                              type="button"
                              onClick={() => toggleArrayValue(raid.id, 'completedGates', gate.gate)}
                            >
                              {complete ? <Check /> : `${gate.gate}관문`}
                            </button>
                            <span>
                              거래 가능{' '}
                              <GoldAmount>
                                {task.goldEarning
                                  ? Number(gate.rewardGold || 0).toLocaleString('ko-KR')
                                  : '0'}
                              </GoldAmount>
                            </span>
                            <span>
                              귀속{' '}
                              <GoldAmount>
                                {task.goldEarning
                                  ? Number(gate.boundGold || 0).toLocaleString('ko-KR')
                                  : '0'}
                              </GoldAmount>
                            </span>
                            <span>
                              메달 <b>{medalCount}개</b>
                            </span>
                            <label className={extraSelected ? 'active' : ''}>
                              더보기{' '}
                              <GoldAmount>
                                {Number(gate.extraCost || 0).toLocaleString('ko-KR')}
                              </GoldAmount>
                              <input
                                type="checkbox"
                                checked={extraSelected}
                                onChange={() =>
                                  toggleArrayValue(raid.id, 'extraRewardGates', gate.gate)
                                }
                              />
                              <i />
                            </label>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="expedition-raid-config-empty">
                <Swords />
                <b>등록된 레이드가 없습니다</b>
                <span>오른쪽 목록에서 레이드를 선택하세요.</span>
              </div>
            )}
          </main>
          <aside className="expedition-raid-list">
            <h3>레이드 선택</h3>
            {raidCategoriesByLevel.map((category) => (
              <section key={category.id}>
                <h4>{category.name}</h4>
                {category.raids.map((raid) => {
                  const selected = Boolean(taskFor(raid.id))
                  const raidImage = getRaidImage(raid.id)
                  return (
                    <button
                      className={selected ? 'selected' : ''}
                      type="button"
                      onClick={() => toggleRaid(raid)}
                      key={raid.id}
                    >
                      <i>{selected && <Check />}</i>
                      {raidImage && <img src={raidImage} alt="" />}
                      <span>{raid.name}</span>
                      <ChevronRight />
                    </button>
                  )
                })}
              </section>
            ))}
          </aside>
        </div>
        <footer className="expedition-raid-modal-actions">
          <button type="button" onClick={close}>
            취소
          </button>
          <button type="button" className="primary" onClick={() => save(draft)}>
            <Check /> 설정 저장
          </button>
        </footer>
      </section>
    </div>
  )
}

function CharacterRaidList({ character, tasks, toggleGate, openSettings }) {
  if (!tasks.length)
    return (
      <div className="expedition-card-raids empty">
        <Swords />
        <span>등록된 레이드가 없습니다.</span>
        <button type="button" onClick={openSettings}>
          레이드 설정
        </button>
      </div>
    )
  return (
    <div className="expedition-card-raids">
      {tasks.map((task) => {
        const raid = raidById(task.raidId)
        const difficulty = difficultyOf(task)
        if (!raid || !difficulty) return null
        const normalized = taskDefaults(task)
        const tradeGold = normalized.goldEarning
          ? difficulty.gates.reduce((sum, gate) => sum + Number(gate.rewardGold || 0), 0)
          : 0
        const boundGold = normalized.goldEarning
          ? difficulty.gates.reduce((sum, gate) => sum + Number(gate.boundGold || 0), 0)
          : 0
        const medals = difficulty.gates.reduce((sum, gate) => sum + gateMedals(gate), 0)
        const extraCost = difficulty.gates
          .filter((gate) => normalized.extraRewardGates.includes(gate.gate))
          .reduce((sum, gate) => sum + Number(gate.extraCost || 0), 0)
        const raidImage = getRaidImage(raid.id)
        return (
          <div className="expedition-card-raid" key={raid.id}>
            {raidImage && <img src={raidImage} alt="" />}
            <span>
              <b>{raid.name}</b>
              <small>
                {difficulty.name} · 거래{' '}
                <GoldAmount>{tradeGold.toLocaleString('ko-KR')}</GoldAmount> · 귀속{' '}
                <GoldAmount>{boundGold.toLocaleString('ko-KR')}</GoldAmount>
              </small>
              <em>
                메달 {medals}개
                {extraCost > 0 ? (
                  <>
                    {' '}
                    · 더보기 <GoldAmount>{extraCost.toLocaleString('ko-KR')}</GoldAmount>
                  </>
                ) : null}
                {normalized.busFare > 0 ? (
                  <>
                    {' '}
                    · 버스비 <GoldAmount>{normalized.busFare.toLocaleString('ko-KR')}</GoldAmount>
                  </>
                ) : null}
                {!normalized.goldEarning ? ' · 골드 미획득' : ''}
              </em>
            </span>
            <div>
              {difficulty.gates.map((gate) => (
                <button
                  className={
                    (normalized.completedGates || []).includes(gate.gate) ? 'complete' : ''
                  }
                  type="button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleGate(normalized, gate.gate)
                  }}
                  key={gate.gate}
                >
                  {(normalized.completedGates || []).includes(gate.gate) ? <Check /> : gate.gate}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExpeditionGroup({
  group,
  representativeName,
  raidSettings,
  updateCharacterRaids,
  openRaidSettings,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(group.name)
  const characters = [...group.characters].sort(
    (a, b) => levelNumber(b.itemLevel) - levelNumber(a.itemLevel),
  )
  const representative =
    characters.find((item) => item.characterName === representativeName) || characters[0]
  const averageLevel = characters.length
    ? characters.reduce((sum, item) => sum + levelNumber(item.itemLevel), 0) / characters.length
    : 0
  const servers = [...new Set(characters.map((item) => item.serverName).filter(Boolean))]
  const refresh = async (event) => {
    event.stopPropagation()
    if (refreshing) return
    setRefreshing(true)
    const profiles = []
    for (const character of characters) {
      try {
        const data = await lostArkApi.getCharacter(character.characterName)
        const profile = data?.armory?.ArmoryProfile
        if (profile) profiles.push(profile)
      } catch {
        /* 성공한 캐릭터만 갱신 */
      }
    }
    if (profiles.length)
      addFavorites(profiles, {
        rosterId: group.id.startsWith('single-') ? '' : group.id,
        rosterName: group.name,
      })
    setRefreshing(false)
  }
  const saveName = (event) => {
    event?.stopPropagation()
    const name = draftName.trim()
    if (!name) return
    renameFavoriteRoster(
      group.id,
      name,
      characters.map((item) => item.characterName),
    )
    setEditingName(false)
  }
  const cancelName = (event) => {
    event?.stopPropagation()
    setDraftName(group.name)
    setEditingName(false)
  }

  return (
    <section className={`expedition-group panel ${collapsed ? 'collapsed' : ''}`}>
      <header className="expedition-group-header" onClick={() => setCollapsed((value) => !value)}>
        <span className="expedition-group-avatar">
          {representative?.characterImage ? (
            <img src={representative.characterImage} alt="" />
          ) : (
            <UsersRound />
          )}
          {representativeName && representative?.characterName === representativeName && (
            <i>
              <Crown />
            </i>
          )}
        </span>
        <div
          className={`expedition-group-name ${editingName ? 'editing' : ''}`}
          onClick={(event) => event.stopPropagation()}
        >
          {editingName ? (
            <div className="expedition-name-editor">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveName(event)
                  if (event.key === 'Escape') cancelName(event)
                }}
                maxLength={30}
                autoFocus
                aria-label="원정대 이름"
              />
              <button type="button" onClick={saveName}>
                <Check />
              </button>
              <button type="button" onClick={cancelName}>
                <X />
              </button>
            </div>
          ) : (
            <>
              <h2>{group.name}</h2>
              <button
                className="expedition-name-edit"
                type="button"
                onClick={() => {
                  setDraftName(group.name)
                  setEditingName(true)
                }}
              >
                <Pencil />
              </button>
            </>
          )}
          <span>{servers.join(' · ') || '서버 정보 없음'}</span>
        </div>
        <div className="expedition-group-summary">
          <span>
            평균 Lv. <b>{formatLevel(averageLevel)}</b>
          </span>
          <span>
            캐릭터 <b>{characters.length}명</b>
          </span>
          <button type="button" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'spin' : ''} />
            {refreshing ? '업데이트 중' : '업데이트'}
          </button>
          <ChevronDown />
        </div>
      </header>
      <div className="expedition-character-grid">
        {characters.map((character) => {
          const tasks = raidSettings[character.characterName] || []
          const toggleGate = (task, gate) =>
            updateCharacterRaids(
              character.characterName,
              tasks.map((item) =>
                item.raidId === task.raidId
                  ? {
                      ...item,
                      completedGates: (item.completedGates || []).includes(gate)
                        ? item.completedGates.filter((value) => value !== gate)
                        : [...(item.completedGates || []), gate],
                    }
                  : item,
              ),
            )
          return (
            <article
              className={`expedition-character-card ${representativeName === character.characterName ? 'representative' : ''}`}
              key={character.characterName}
            >
              <header>
                <Link to={`/characters/${encodeURIComponent(character.characterName)}`}>
                  <span>
                    {character.characterImage ? (
                      <img src={character.characterImage} alt="" />
                    ) : (
                      character.className?.[0]
                    )}
                  </span>
                  <div>
                    <strong>{character.characterName}</strong>
                    <small>
                      {character.serverName} · {character.className || '클래스 정보 없음'}
                    </small>
                  </div>
                </Link>
                {representativeName === character.characterName && (
                  <i>
                    <Crown />
                  </i>
                )}
                <button type="button" onClick={() => openRaidSettings(group, character)}>
                  <Settings2 />
                </button>
              </header>
              <div className="expedition-character-metrics">
                <span>
                  <small>아이템 레벨</small>
                  <strong>Lv. {formatLevel(character.itemLevel)}</strong>
                </span>
                <span>
                  <small>레이드 투력</small>
                  <strong className="combat">
                    {character.combatPower ? formatPower(character.combatPower) : '업데이트 필요'}
                  </strong>
                </span>
              </div>
              <CharacterRaidList
                character={character}
                tasks={tasks}
                toggleGate={toggleGate}
                openSettings={() => openRaidSettings(group, character)}
              />
              <footer>
                <Link to={`/characters/${encodeURIComponent(character.characterName)}`}>
                  캐릭터 정보 보기 <ChevronRight />
                </Link>
              </footer>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function ExpeditionPage() {
  const { favorites, representativeName } = useFavorites()
  const groups = useMemo(() => expeditionGroups(favorites), [favorites])
  const [raidSettings, setRaidSettings] = useState(getExpeditionRaidSettings)
  const [modal, setModal] = useState(null)
  const updateCharacterRaids = (characterName, tasks) =>
    setRaidSettings((current) => setCharacterRaidSettings(current, characterName, tasks))
  const saveRaidSettings = (next) => {
    saveExpeditionRaidSettings(next)
    setRaidSettings(next)
    setModal(null)
  }
  return (
    <div className="expedition-page">
      <header className="panel expedition-page-header">
        <span>
          <UsersRound />
        </span>
        <div>
          <p>MY EXPEDITION</p>
          <h1>원정대</h1>
          <small>즐겨찾기에 저장된 원정대별 캐릭터와 레이드 숙제를 관리합니다.</small>
        </div>
        <aside>
          <b>{groups.length}</b>
          <span>개의 원정대</span>
        </aside>
      </header>
      {groups.length ? (
        <div className="expedition-groups">
          {groups.map((group) => (
            <ExpeditionGroup
              group={group}
              representativeName={representativeName}
              raidSettings={raidSettings}
              updateCharacterRaids={updateCharacterRaids}
              openRaidSettings={(selectedGroup, character) =>
                setModal({ group: selectedGroup, character })
              }
              key={group.id}
            />
          ))}
        </div>
      ) : (
        <section className="panel expedition-empty">
          <Star />
          <h2>등록된 원정대가 없습니다</h2>
          <p>캐릭터를 검색하고 즐겨찾기에 추가하면 원정대별로 자동 분류됩니다.</p>
        </section>
      )}
      {modal && (
        <RaidSettingsModal
          group={modal.group}
          initialCharacter={modal.character}
          settings={raidSettings}
          save={saveRaidSettings}
          close={() => setModal(null)}
        />
      )}
    </div>
  )
}
