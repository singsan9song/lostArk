import {
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  PackageOpen,
  Pencil,
  RefreshCw,
  Settings2,
  Star,
  Swords,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import raidExtraData from '../data/raid-extra.json'
import refiningData from '../data/icepang_refining_data.json'
import advancedRefiningData from '../data/icepang_advanced_refining_data.json'
import singleCoinData from '../data/single-coin.json'
import paradiseData from '../data/paradise-season3.json'
import { GoldAmount } from '../components/GoldIcon'
import { addFavorites, groupFavorites, renameFavoriteRoster, useFavorites } from '../lib/favorites'
import {
  getExpeditionRaidSettings,
  saveExpeditionRaidSettings,
  setCharacterRaidSettings,
} from '../lib/expeditionRaids'
import { lostArkApi } from '../lib/api'
import { marketNameFor } from '../lib/honingPricing'
import { getRaidImage } from '../lib/raidImages'
import {
  getCharacterHoningInventories,
  normalizeHoningInventory,
  saveCharacterHoningInventories,
} from '../lib/honingInventory'
import {
  PET_TRAIT_OPTIONS,
  expeditionKeyFromSiblings,
  getDamageAnalysisSettingsFor,
  normalizePetTraitValue,
  petTraitGradeClass,
  saveExpeditionDamageAnalysisSettings,
} from '../lib/damageAnalysisSettings'
import '../expedition-page.css'
import '../expedition-page-edit.css'
import '../expedition-raid-settings.css'
import '../expedition-raid-settings-v2.css'
import '../raid-images.css'

const raids = raidExtraData.categories.flatMap((category) =>
  category.raids.map((raid) => ({ ...raid, categoryName: category.name })),
)
const materialsFromRecords = (records) =>
  records.flatMap((record) =>
    [...(record.required_materials || []), ...(record.additional_materials || [])].map(
      (item) => item.name,
    ),
  )
const honingMaterialNames = [
  ...new Set([
    ...materialsFromRecords(refiningData.records),
    ...materialsFromRecords(advancedRefiningData.records),
  ]),
].filter((name) => name !== '골드')
const materialGroupDefinitions = [
  { title: '파편', matches: (name) => name.includes('파편') },
  { title: '돌파석', matches: (name) => name.includes('돌파석') },
  { title: '파괴석 · 파괴강석', matches: (name) => name.includes('파괴') },
  { title: '수호석 · 수호강석', matches: (name) => name.includes('수호') },
  { title: '융화 재료', matches: (name) => name.includes('융화 재료') },
  { title: '야금술', matches: (name) => name.includes('야금술') },
  { title: '재봉술', matches: (name) => name.includes('재봉술') },
  { title: '숨결', matches: (name) => name.includes('숨결') },
  { title: '태양의 보조 재료', matches: (name) => name.startsWith('태양의') },
]
const materialGroups = materialGroupDefinitions
  .map((group) => ({
    title: group.title,
    materials: honingMaterialNames
      .filter(group.matches)
      .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })),
  }))
  .filter((group) => group.materials.length)
const groupedMaterialNames = new Set(materialGroups.flatMap((group) => group.materials))
const uncategorizedMaterials = honingMaterialNames
  .filter((name) => !groupedMaterialNames.has(name))
  .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
if (uncategorizedMaterials.length) {
  materialGroups.push({ title: '기타 재련 재료', materials: uncategorizedMaterials })
}
const collectItemMeta = (value, map = new Map()) => {
  if (Array.isArray(value)) value.forEach((item) => collectItemMeta(item, map))
  else if (value && typeof value === 'object') {
    if (value.name && (value.image || value.grade))
      map.set(value.name, { image: value.image, grade: value.grade })
    if (value.item && (value.image || value.grade))
      map.set(value.item, { image: value.image, grade: value.grade })
    Object.values(value).forEach((item) => collectItemMeta(item, map))
  }
  return map
}
const staticItemMeta = collectItemMeta([singleCoinData, paradiseData])
const materialMetaOverrides = {
  '명예의 파편': { image: '/images/rewards/money_13.png', grade: '일반' },
  '운명의 파편': { image: '/images/rewards/money_15.png', grade: '일반' },
  '빙하의 숨결': {
    image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_172.png',
    grade: '영웅',
  },
  '용암의 숨결': {
    image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_171.png',
    grade: '영웅',
  },
  '태양의 은총': {
    image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_7_161.png',
    grade: '고급',
  },
  '태양의 축복': {
    image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_7_162.png',
    grade: '희귀',
  },
  '태양의 가호': {
    image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_7_163.png',
    grade: '영웅',
  },
}
const artisanBookMeta = {
  야금술: {
    1: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_242.png',
      grade: '영웅',
    },
    2: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_244.png',
      grade: '전설',
    },
    3: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_221.png',
      grade: '유물',
    },
    4: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_223.png',
      grade: '고대',
    },
  },
  재봉술: {
    1: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_243.png',
      grade: '영웅',
    },
    2: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_245.png',
      grade: '전설',
    },
    3: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_222.png',
      grade: '유물',
    },
    4: {
      image: 'https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_224.png',
      grade: '고대',
    },
  },
}
const honingBookMetaFor = (name) => {
  const type = name.includes('야금술') ? '야금술' : name.includes('재봉술') ? '재봉술' : null
  if (!type) return null

  const artisanStage = name.match(/^장인의 .+ : ([1-4])단계$/)?.[1]
  if (artisanStage) return artisanBookMeta[type][artisanStage]

  const isMetallurgy = type === '야금술'
  if (name.includes('업화')) {
    return {
      image: `https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_${isMetallurgy ? 218 : 219}.png`,
      grade: '유물',
    }
  }
  if (name.includes('몽환') || name.includes('쇠락')) {
    return {
      image: `https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_7_${isMetallurgy ? 69 : 70}.png`,
      grade: name.includes('[13-15]') && name.includes('몽환') ? '유물' : '고대',
    }
  }
  return {
    image: `https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_6_${isMetallurgy ? 222 : 226}.png`,
    grade: name.includes('비늘') ? '영웅' : name.includes('선혈') ? '전설' : '유물',
  }
}
const materialGradeClass = (grade) =>
  ({
    고대: 'ancient',
    유물: 'relic',
    전설: 'legendary',
    영웅: 'epic',
    희귀: 'rare',
    고급: 'uncommon',
    일반: 'common',
  })[grade] || ''
const materialMetaFor = (name, prices) => {
  const override = materialMetaOverrides[name] || honingBookMetaFor(name)
  const staticMeta = staticItemMeta.get(name)
  const marketMeta = prices[marketNameFor(name)]
  return {
    image: override?.image || staticMeta?.image || marketMeta?.icon || null,
    grade: override?.grade || staticMeta?.grade || marketMeta?.grade || null,
  }
}
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
const raidRewardsForTasks = (tasks) =>
  (tasks || []).reduce(
    (total, task) => {
      const difficulty = difficultyOf(task)
      if (!difficulty) return total
      const normalized = taskDefaults(task)
      difficulty.gates.forEach((gate) => {
        if (normalized.goldEarning) {
          total.tradeGold += Number(gate.rewardGold || 0)
          total.boundGold += Number(gate.boundGold || 0)
        }
        total.medals += gateMedals(gate)
      })
      return total
    },
    { tradeGold: 0, boundGold: 0, medals: 0 },
  )

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

function HoningMaterialsEditor({
  group,
  characterName,
  setCharacterName,
  inventories,
  setInventories,
  materialPrices,
}) {
  const inventory = inventories[characterName] || {}
  const updateMaterial = (name, value) => {
    const count = Math.max(0, Math.floor(Number(value) || 0))
    setInventories((current) => ({
      ...current,
      [characterName]: { ...(current[characterName] || {}), [name]: count },
    }))
  }

  return (
    <div className="expedition-material-layout">
      <aside className="expedition-material-characters">
        {[...group.characters]
          .sort((a, b) => levelNumber(b.itemLevel) - levelNumber(a.itemLevel))
          .map((character) => (
            <button
              className={character.characterName === characterName ? 'active' : ''}
              type="button"
              onClick={() => setCharacterName(character.characterName)}
              key={character.characterName}
            >
              <span>
                {character.characterImage ? (
                  <img src={character.characterImage} alt="" />
                ) : (
                  character.className?.[0]
                )}
              </span>
              <div>
                <b>{character.characterName}</b>
                <small>Lv. {character.itemLevel || '-'}</small>
              </div>
            </button>
          ))}
      </aside>
      <main className="expedition-material-editor">
        <header>
          <div>
            <h3>{characterName} 귀속 재련 재료</h3>
            <p>입력한 수량은 재련 계산에서 먼저 사용되며 해당 수량의 비용은 0골드입니다.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              setInventories((current) => {
                const next = { ...current }
                delete next[characterName]
                return next
              })
            }
          >
            초기화
          </button>
        </header>
        <div className="expedition-material-groups">
          {materialGroups.map((groupItem) => (
            <section key={groupItem.title}>
              <h4>{groupItem.title}</h4>
              <div>
                {groupItem.materials.map((name) => {
                  const meta = materialMetaFor(name, materialPrices)
                  return (
                    <label key={name}>
                      <span className="expedition-material-name">
                        <i className={materialGradeClass(meta.grade)}>
                          {meta.image ? <img src={meta.image} alt="" /> : <PackageOpen />}
                        </i>
                        <span>{name}</span>
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        value={inventory[name] || ''}
                        placeholder="0"
                        onChange={(event) => updateMaterial(name, event.target.value)}
                      />
                      <small>개</small>
                    </label>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

const damageSettingItems = [
  {
    key: 'petTraitSpeciesDamage',
    name: '자연 선택 (악마)',
    description: '악마 계열 피해량',
    image: '/images/etc/pet01.png',
  },
  {
    key: 'petTraitAdditional',
    name: '끓어오르는 힘',
    description: '추가 피해',
    image: '/images/etc/pet02.png',
  },
  {
    key: 'petTraitMainStat',
    name: '우월한 유전자',
    description: '주 스탯',
    image: '/images/etc/pet03.png',
  },
]

function DamageSettingsEditor({
  group,
  character,
  setCharacterName,
  sharedSettings,
  setSharedSettings,
  azenaSettings,
  setAzenaSettings,
  onShowGuide,
}) {
  const azenaEnabled = Boolean(azenaSettings[character.characterName])
  const updateShared = (key, value) =>
    setSharedSettings((current) => ({ ...current, [key]: value }))

  return (
    <div className="expedition-damage-layout">
      <aside className="expedition-damage-characters">
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
      <main className="expedition-damage-editor">
        <header>
          <h3>데미지 분석 계산 설정</h3>
          <p>아제나는 선택한 캐릭터에만, 나머지 설정은 이 원정대 전체에 적용됩니다.</p>
        </header>

        <section className="expedition-damage-section character-only">
          <div className="expedition-damage-setting-info">
            <i>
              <img src="/images/etc/shop_icon_9888.png" alt="" />
            </i>
            <span>
              <b>아제나의 축복</b>
              <small>{character.characterName} 캐릭터 전용 · 주 스탯 +6,000</small>
            </span>
          </div>
          <button
            type="button"
            className={`expedition-damage-toggle${azenaEnabled ? ' active' : ''}`}
            aria-pressed={azenaEnabled}
            onClick={() =>
              setAzenaSettings((current) => ({
                ...current,
                [character.characterName]: !azenaEnabled,
              }))
            }
          >
            {azenaEnabled ? 'ON' : 'OFF'}
          </button>
        </section>

        <div className="expedition-damage-shared-heading">
          <b>원정대 공용 설정</b>
          <small>어느 캐릭터에서 수정해도 같은 원정대 캐릭터 모두에게 적용됩니다.</small>
        </div>
        <div className="expedition-damage-shared-grid">
          {damageSettingItems.map((item) => (
            <div className="expedition-damage-section" key={item.key}>
              <span className="expedition-damage-setting-info">
                <i className={petTraitGradeClass(item.key, sharedSettings[item.key])}>
                  <img src={item.image} alt="" />
                </i>
                <span>
                  <b>{item.name}</b>
                  <small>{item.description} % · 기본값 0</small>
                </span>
              </span>
              <div
                className="expedition-pet-trait-options"
                role="group"
                aria-label={`${item.name} 등급`}
              >
                {PET_TRAIT_OPTIONS[item.key].map((option) => (
                  <button
                    type="button"
                    className={`${option.gradeClass}${
                      normalizePetTraitValue(item.key, sharedSettings[item.key]) === option.value
                        ? ' active'
                        : ''
                    }`}
                    aria-pressed={
                      normalizePetTraitValue(item.key, sharedSettings[item.key]) === option.value
                    }
                    onClick={() => updateShared(item.key, String(option.value))}
                    key={option.value}
                  >
                    {option.value}%
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="expedition-damage-section text-setting">
            <span>
              <b>물약 + 원정대 레벨 효과</b>
              <small>오른 주 스탯 수치 · 미입력 시 물약 850 고정</small>
              <button type="button" onClick={onShowGuide}>확인 방법</button>
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={sharedSettings.potionSource ?? ''}
              onChange={(event) => updateShared('potionSource', event.target.value)}
              placeholder="예: 1,250"
            />
          </div>
          <div className="expedition-damage-section text-setting">
            <span>
              <b>카드 도감 주 스탯 효과</b>
              <small>미입력 시 242 고정</small>
              <button type="button" onClick={onShowGuide}>확인 방법</button>
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={sharedSettings.cardBook ?? ''}
              onChange={(event) => updateShared('cardBook', event.target.value)}
              placeholder="예: 242"
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function RaidSettingsModal({
  group,
  initialCharacter,
  settings,
  materialSettings,
  materialPrices,
  save,
  close,
}) {
  const [characterName, setCharacterName] = useState(initialCharacter.characterName)
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(settings)))
  const [materialDraft, setMaterialDraft] = useState(() =>
    JSON.parse(JSON.stringify(materialSettings)),
  )
  const expeditionKey = useMemo(
    () => expeditionKeyFromSiblings(group.characters, initialCharacter.characterName),
    [group.characters, initialCharacter.characterName],
  )
  const [damageSharedDraft, setDamageSharedDraft] = useState(() => {
    const saved =
      getDamageAnalysisSettingsFor(initialCharacter.characterName, expeditionKey) || {}
    const { azenaBlessing: _characterOnly, ...shared } = saved
    return {
      ...shared,
      petTraitMainStat: normalizePetTraitValue('petTraitMainStat', shared.petTraitMainStat),
      petTraitSpeciesDamage: normalizePetTraitValue(
        'petTraitSpeciesDamage',
        shared.petTraitSpeciesDamage,
      ),
      petTraitAdditional: normalizePetTraitValue(
        'petTraitAdditional',
        shared.petTraitAdditional,
      ),
    }
  })
  const [damageAzenaDraft, setDamageAzenaDraft] = useState(() =>
    Object.fromEntries(
      group.characters.map((item) => [
        item.characterName,
        Boolean(
          getDamageAnalysisSettingsFor(item.characterName, expeditionKey)?.azenaBlessing,
        ),
      ]),
    ),
  )
  const [showBuffSettingGuide, setShowBuffSettingGuide] = useState(false)
  const [activeTab, setActiveTab] = useState('raids')
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
            <h2 id="raid-settings-title">캐릭터 설정</h2>
            <p>변경 사항은 저장 버튼을 눌러야 적용됩니다.</p>
          </div>
          <button type="button" onClick={close} aria-label="설정 취소">
            <X />
          </button>
        </header>
        <div className="expedition-character-settings-body">
          <nav className="expedition-character-settings-tabs">
            <button
              className={activeTab === 'raids' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('raids')}
            >
              레이드 설정
            </button>
            <button
              className={activeTab === 'materials' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('materials')}
            >
              귀속 재련 재료
            </button>
            <button
              className={activeTab === 'damage' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('damage')}
            >
              계산 설정
            </button>
          </nav>
          {activeTab === 'raids' ? (
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
                                  onClick={() =>
                                    toggleArrayValue(raid.id, 'completedGates', gate.gate)
                                  }
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
          ) : activeTab === 'materials' ? (
            <HoningMaterialsEditor
              group={group}
              characterName={characterName}
              setCharacterName={setCharacterName}
              inventories={materialDraft}
              setInventories={setMaterialDraft}
              materialPrices={materialPrices}
            />
          ) : (
            <DamageSettingsEditor
              group={group}
              character={character}
              setCharacterName={setCharacterName}
              sharedSettings={damageSharedDraft}
              setSharedSettings={setDamageSharedDraft}
              azenaSettings={damageAzenaDraft}
              setAzenaSettings={setDamageAzenaDraft}
              onShowGuide={() => setShowBuffSettingGuide(true)}
            />
          )}
        </div>
        <footer className="expedition-raid-modal-actions">
          <button type="button" onClick={close}>
            취소
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveExpeditionDamageAnalysisSettings(
                expeditionKey,
                damageAzenaDraft,
                damageSharedDraft,
              )
              save(
                draft,
                Object.fromEntries(
                  Object.entries(materialDraft)
                    .map(([name, inventory]) => [name, normalizeHoningInventory(inventory)])
                    .filter(([, inventory]) => Object.keys(inventory).length),
                ),
              )
            }}
          >
            <Check /> 설정 저장
          </button>
        </footer>
        {showBuffSettingGuide && (
          <div
            className="expedition-setting-guide-backdrop"
            onClick={() => setShowBuffSettingGuide(false)}
          >
            <section
              className="expedition-setting-guide-modal"
              role="dialog"
              aria-modal="true"
              aria-label="주 스탯 효과 확인 방법"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <h3>주 스탯 효과 확인 방법</h3>
                  <p>인게임에서 표시된 위치의 수치를 확인해 입력하세요.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBuffSettingGuide(false)}
                  aria-label="닫기"
                >
                  <X />
                </button>
              </header>
              <div>
                <img src="/images/etc/buff_setting.png" alt="주 스탯 효과 확인 위치 안내" />
              </div>
            </section>
          </div>
        )}
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
  setRepresentative,
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
  const raidRewards = characters.reduce(
    (total, character) => {
      const rewards = raidRewardsForTasks(raidSettings[character.characterName] || [])
      total.tradeGold += rewards.tradeGold
      total.boundGold += rewards.boundGold
      total.medals += rewards.medals
      return total
    },
    { tradeGold: 0, boundGold: 0, medals: 0 },
  )
  const refresh = async (event) => {
    event.stopPropagation()
    if (refreshing) return
    setRefreshing(true)
    const results = await Promise.allSettled(
      characters.map((character) => lostArkApi.getCharacter(character.characterName)),
    )
    const profiles = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value?.armory?.ArmoryProfile)
      .filter(Boolean)
    /* 실패한 캐릭터는 제외하고 성공한 캐릭터만 갱신 */
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
          <span
            className="expedition-group-raid-rewards"
            title="설정된 모든 레이드의 주간 보상 합계"
          >
            <span>
              거래 <GoldAmount>{raidRewards.tradeGold.toLocaleString('ko-KR')}</GoldAmount>
            </span>
            <span>
              귀속 <GoldAmount>{raidRewards.boundGold.toLocaleString('ko-KR')}</GoldAmount>
            </span>
            <span>
              메달 <b>{raidRewards.medals.toLocaleString('ko-KR')}개</b>
            </span>
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
                <Link
                  className="expedition-character-avatar-link"
                  to={`/characters/${encodeURIComponent(character.characterName)}`}
                >
                  <span>
                    {character.characterImage ? (
                      <img src={character.characterImage} alt="" />
                    ) : (
                      character.className?.[0]
                    )}
                  </span>
                </Link>
                <div className="expedition-character-copy">
                  <div className="expedition-character-name-row">
                    <Link to={`/characters/${encodeURIComponent(character.characterName)}`}>
                      <strong>{character.characterName}</strong>
                    </Link>
                    <button
                      type="button"
                      onClick={() => openRaidSettings(group, character)}
                      title={`${character.characterName} 레이드 설정`}
                      aria-label={`${character.characterName} 레이드 설정`}
                    >
                      <Settings2 />
                    </button>
                  </div>
                  <small>
                    {character.serverName} · {character.className || '클래스 정보 없음'}
                  </small>
                </div>
                <button
                  className={`expedition-representative-button ${
                    representativeName === character.characterName ? 'active' : ''
                  }`}
                  type="button"
                  onClick={() => setRepresentative(character.characterName)}
                  title={
                    representativeName === character.characterName
                      ? '현재 대표 캐릭터'
                      : `${character.characterName} 대표 캐릭터로 설정`
                  }
                  aria-label={`${character.characterName} 대표 캐릭터로 설정`}
                  aria-pressed={representativeName === character.characterName}
                >
                  <Crown />
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
  const { favorites, representativeName, setRepresentative } = useFavorites()
  const groups = useMemo(() => expeditionGroups(favorites), [favorites])
  const [raidSettings, setRaidSettings] = useState(getExpeditionRaidSettings)
  const [materialSettings, setMaterialSettings] = useState(getCharacterHoningInventories)
  const [materialPrices, setMaterialPrices] = useState({})
  const [modal, setModal] = useState(null)
  useEffect(() => {
    let active = true
    const marketNames = [...new Set(honingMaterialNames.map(marketNameFor))]
    const batches = Array.from({ length: Math.ceil(marketNames.length / 30) }, (_, index) =>
      marketNames.slice(index * 30, index * 30 + 30),
    )
    Promise.all(batches.map((batch) => lostArkApi.getMarketPrices(batch)))
      .then((results) => {
        if (active) setMaterialPrices(Object.assign({}, ...results))
      })
      .catch(() => {
        if (active) setMaterialPrices({})
      })
    return () => {
      active = false
    }
  }, [])
  const updateCharacterRaids = (characterName, tasks) =>
    setRaidSettings((current) => setCharacterRaidSettings(current, characterName, tasks))
  const saveSettings = (nextRaids, nextMaterials) => {
    saveExpeditionRaidSettings(nextRaids)
    saveCharacterHoningInventories(nextMaterials)
    setRaidSettings(nextRaids)
    setMaterialSettings(nextMaterials)
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
              setRepresentative={setRepresentative}
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
          materialSettings={materialSettings}
          materialPrices={materialPrices}
          save={saveSettings}
          close={() => setModal(null)}
        />
      )}
    </div>
  )
}
