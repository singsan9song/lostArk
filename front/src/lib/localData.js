export const ACCOUNT_STORAGE_KEYS = [
  'loark-favorite-characters',
  'loark-representative-character',
  'loark-expedition-raid-settings',
  'loark-home-layout',
  'loark-home-hidden-widgets',
  'loark.includePheonCost',
  'loark.crystalGoldPer100',
  'loark.abilityStoneConfiguration',
  'loark-theme',
]

export const LOCAL_DATA_CHANGED_EVENT = 'loark-local-data-changed'
const DATA_VERSION_KEY = 'loark-data-schema-version'
const DATA_VERSION = '2'

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
