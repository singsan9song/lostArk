// Most calculator settings and home-widget layout/hidden state are local-cache-only —
// intentionally excluded so they never round-trip through cloud save/restore.
// loark-damage-analysis-settings is the deliberate exception (explicitly requested
// to follow the character across devices when logged in).
export const ACCOUNT_STORAGE_KEYS = [
  'loark-favorite-characters',
  'loark-representative-character',
  'loark-expedition-raid-settings',
  'loark-character-honing-materials',
  'loark-other-efficiency-catalog',
  'loark-damage-analysis-settings',
  'loark-theme',
]

export const LOCAL_DATA_CHANGED_EVENT = 'loark-local-data-changed'
const DATA_VERSION_KEY = 'loark-data-schema-version'
// v3: loark-damage-analysis-settings switched from a flat {characterName: {...}}
// map to {characters: {...}, expeditions: {...}} (아제나의 축복 stays per-character,
// pet trait/potion/card book values became shared per-원정대) — old-shape data is
// incompatible, so bump the version to wipe it via the reset below.
const DATA_VERSION = '3'

if (typeof window !== 'undefined') localStorage.removeItem('loark-roster-discoveries')

if (typeof window !== 'undefined' && localStorage.getItem(DATA_VERSION_KEY) !== DATA_VERSION) {
  ACCOUNT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
  localStorage.setItem(DATA_VERSION_KEY, DATA_VERSION)
}

export function setLocalData(key, value) {
  localStorage.setItem(key, value)
  if (ACCOUNT_STORAGE_KEYS.includes(key))
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED_EVENT))
}

export function removeLocalData(key) {
  localStorage.removeItem(key)
  if (ACCOUNT_STORAGE_KEYS.includes(key))
    window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED_EVENT))
}

export function localDataSnapshot() {
  return Object.fromEntries(
    ACCOUNT_STORAGE_KEYS.flatMap((key) => {
      const value = localStorage.getItem(key)
      return value === null ? [] : [[key, value]]
    }),
  )
}

export function applyLocalData(data) {
  ACCOUNT_STORAGE_KEYS.forEach((key) => {
    if (Object.hasOwn(data, key)) localStorage.setItem(key, String(data[key]))
  })
}

export function clearLocalData() {
  ACCOUNT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
  window.dispatchEvent(new CustomEvent(LOCAL_DATA_CHANGED_EVENT))
}

export function removeStoredCharacterData(characterNames) {
  const names = new Set(
    (Array.isArray(characterNames) ? characterNames : [characterNames]).filter(Boolean),
  )
  if (!names.size) return

  const characterDataKeys = ['loark-expedition-raid-settings', 'loark-character-honing-materials']
  characterDataKeys.forEach((key) => {
    try {
      const current = JSON.parse(localStorage.getItem(key) || '{}')
      if (!current || typeof current !== 'object' || Array.isArray(current)) return
      let changed = false
      names.forEach((name) => {
        if (!Object.hasOwn(current, name)) return
        delete current[name]
        changed = true
      })
      if (changed) localStorage.setItem(key, JSON.stringify(current))
    } catch {
      // Invalid old data is left untouched; the normal readers already fall back safely.
    }
  })

  // loark-damage-analysis-settings는 {characters, expeditions} 구조라 캐릭터별
  // 항목(아제나의 축복)만 지운다 — expeditions 쪽(펫 특기 등)은 같은 원정대의
  // 다른 캐릭터가 계속 쓸 수 있으므로 남겨둔다.
  try {
    const key = 'loark-damage-analysis-settings'
    const current = JSON.parse(localStorage.getItem(key) || '{}')
    if (current && typeof current === 'object' && !Array.isArray(current) && current.characters) {
      let changed = false
      names.forEach((name) => {
        if (!Object.hasOwn(current.characters, name)) return
        delete current.characters[name]
        changed = true
      })
      if (changed) localStorage.setItem(key, JSON.stringify(current))
    }
  } catch {
    // Invalid old data is left untouched; the normal readers already fall back safely.
  }
}
