import { setLocalData } from './localData'

export const DAMAGE_ANALYSIS_SETTINGS_STORAGE_KEY = 'loark-damage-analysis-settings'

export const PET_TRAIT_OPTIONS = {
  petTraitAdditional: [
    { value: 0, grade: '일반', gradeClass: 'common' },
    { value: 0.4, grade: '희귀', gradeClass: 'rare' },
    { value: 0.7, grade: '영웅', gradeClass: 'epic' },
    { value: 1, grade: '전설', gradeClass: 'legendary' },
  ],
  petTraitMainStat: [
    { value: 0, grade: '일반', gradeClass: 'common' },
    { value: 0.4, grade: '희귀', gradeClass: 'rare' },
    { value: 0.7, grade: '영웅', gradeClass: 'epic' },
    { value: 1, grade: '전설', gradeClass: 'legendary' },
  ],
  petTraitSpeciesDamage: [
    { value: 0, grade: '일반', gradeClass: 'common' },
    { value: 0.2, grade: '희귀', gradeClass: 'rare' },
    { value: 0.35, grade: '영웅', gradeClass: 'epic' },
    { value: 0.5, grade: '전설', gradeClass: 'legendary' },
  ],
}

export function normalizePetTraitValue(key, value) {
  const numericValue = Number(value)
  return PET_TRAIT_OPTIONS[key]?.some((option) => option.value === numericValue)
    ? numericValue
    : 0
}

export function petTraitGradeClass(key, value) {
  const normalizedValue = normalizePetTraitValue(key, value)
  return (
    PET_TRAIT_OPTIONS[key]?.find((option) => option.value === normalizedValue)?.gradeClass ||
    'common'
  )
}

// 아제나의 축복은 캐릭터마다 켜고 끌 수 있어 캐릭터 단위로 저장하고, 나머지
// (펫 특기 3종·물약/카드도감 주스탯)는 원정대(계정) 전체가 공유하는 값이라
// 원정대 단위로 저장한다 — 같은 원정대의 다른 캐릭터를 봐도 다시 입력할
// 필요가 없다.
function readStore() {
  try {
    const value = JSON.parse(localStorage.getItem(DAMAGE_ANALYSIS_SETTINGS_STORAGE_KEY) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { characters: {}, expeditions: {} }
    return {
      characters: value.characters && typeof value.characters === 'object' ? value.characters : {},
      expeditions: value.expeditions && typeof value.expeditions === 'object' ? value.expeditions : {},
    }
  } catch {
    return { characters: {}, expeditions: {} }
  }
}

// 형제 캐릭터(원정대) 목록에서 결정적인 원정대 식별 키를 만든다. 백엔드
// CharacterService의 rosterKey(정렬한 "ServerName:CharacterName" 목록)와 같은
// 방식이라 어느 캐릭터로 봐도 같은 원정대면 같은 키가 나온다. 목록이 아직
// 안 실려 있으면(형제 캐릭터 API 미호출 등) 현재 캐릭터 이름만으로 대체한다.
export function expeditionKeyFromSiblings(siblings, characterName) {
  const members = (Array.isArray(siblings) ? siblings : [])
    .map(
      (item) =>
        `${item?.ServerName || item?.serverName || ''}:${
          item?.CharacterName || item?.characterName || ''
        }`,
    )
    .filter((entry) => entry !== ':')
  if (!members.length && characterName) members.push(`:${characterName}`)
  return [...new Set(members)].sort((a, b) => a.localeCompare(b)).join('|')
}

export function getDamageAnalysisSettingsFor(characterName, expeditionKey) {
  const { characters, expeditions } = readStore()
  const characterSettings = characterName ? characters[characterName] : null
  const expeditionSettings = expeditionKey ? expeditions[expeditionKey] : null
  if (!characterSettings && !expeditionSettings) return null
  return { ...expeditionSettings, ...characterSettings }
}

// setLocalData fires the change event that the logged-in auto-sync effect
// (lib/auth.jsx) listens for, so saving here also pushes to the DB when
// logged in — always writes to localStorage regardless of auth state.
export function saveDamageAnalysisSettingsFor(characterName, expeditionKey, settings) {
  const store = readStore()
  const { azenaBlessing, ...expeditionFields } = settings
  const next = {
    characters: { ...store.characters, [characterName]: { azenaBlessing } },
    expeditions: { ...store.expeditions, [expeditionKey]: expeditionFields },
  }
  setLocalData(DAMAGE_ANALYSIS_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function saveExpeditionDamageAnalysisSettings(
  expeditionKey,
  characterAzenaSettings,
  settings,
) {
  const store = readStore()
  const characters = { ...store.characters }

  Object.entries(characterAzenaSettings || {}).forEach(([characterName, azenaBlessing]) => {
    if (!characterName) return
    characters[characterName] = {
      ...(characters[characterName] || {}),
      azenaBlessing: Boolean(azenaBlessing),
    }
  })

  const { azenaBlessing: _characterOnly, ...expeditionFields } = settings || {}
  const next = {
    characters,
    expeditions: {
      ...store.expeditions,
      ...(expeditionKey ? { [expeditionKey]: expeditionFields } : {}),
    },
  }
  setLocalData(DAMAGE_ANALYSIS_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  return next
}
