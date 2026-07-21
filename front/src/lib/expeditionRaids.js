const STORAGE_KEY = 'loark-expedition-raid-settings'
import { setLocalData } from './localData'

export function getExpeditionRaidSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function saveExpeditionRaidSettings(settings) {
  setLocalData(STORAGE_KEY, JSON.stringify(settings))
  return settings
}

export function setCharacterRaidSettings(allSettings, characterName, raids) {
  const next = { ...allSettings, [characterName]: raids }
  if (!raids.length) delete next[characterName]
  return saveExpeditionRaidSettings(next)
}
