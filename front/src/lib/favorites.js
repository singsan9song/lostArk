import { useEffect, useState } from 'react'
import { lostArkApi } from './api'
import { removeLocalData, setLocalData } from './localData'

const STORAGE_KEY = 'loark-favorite-characters'
const CHANGE_EVENT = 'loark-favorites-changed'
const REPRESENTATIVE_KEY = 'loark-representative-character'
const REPRESENTATIVE_CHANGE_EVENT = 'loark-representative-changed'
const hydrating = new Set()

export function getFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function saveFavorites(favorites) {
  setLocalData(STORAGE_KEY, JSON.stringify(favorites))
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: favorites }))
  const representativeName = getRepresentativeCharacterName()
  if (representativeName && !favorites.some(item => item.characterName === representativeName)) setRepresentativeCharacter('')
}

export function getRepresentativeCharacterName() {
  return localStorage.getItem(REPRESENTATIVE_KEY) || ''
}

export function setRepresentativeCharacter(characterName) {
  const next = characterName && getFavorites().some(item => item.characterName === characterName) ? characterName : ''
  if (next) setLocalData(REPRESENTATIVE_KEY, next)
  else removeLocalData(REPRESENTATIVE_KEY)
  window.dispatchEvent(new CustomEvent(REPRESENTATIVE_CHANGE_EVENT, { detail: next }))
  return next
}

function favoriteRecord(profile, group = {}) {
  const characterName = profile?.CharacterName?.trim()
  if (!characterName) return null
  return {
    characterName,
    serverName: profile.ServerName || '',
    className: profile.CharacterClassName || '',
    itemLevel: profile.ItemAvgLevel || '',
    combatPower: profile.CombatPower || '',
    characterImage: profile.CharacterImage || '',
    rosterId: group.rosterId || '',
    rosterName: group.rosterName || '',
    savedAt: new Date().toISOString(),
  }
}

export function addFavorites(profiles, group = {}) {
  const records = profiles.map(profile => favoriteRecord(profile, group)).filter(Boolean)
  const names = new Set(records.map(item => item.characterName))
  const next = [...records, ...getFavorites().filter(item => !names.has(item.characterName))].slice(0, 50)
  saveFavorites(next)
  return next
}

export function removeFavorite(characterName) {
  const next = getFavorites().filter(item => item.characterName !== characterName)
  saveFavorites(next)
  return next
}

export function removeFavorites(characterNames) {
  const names = new Set(characterNames)
  const next = getFavorites().filter(item => !names.has(item.characterName))
  saveFavorites(next)
  return next
}

export function renameFavoriteRoster(rosterId, rosterName, characterNames = []) {
  const name = String(rosterName || '').trim()
  if (!name) return getFavorites()
  const members = new Set(characterNames)
  const isSingleGroup = String(rosterId || '').startsWith('single-')
  const assignedRosterId = isSingleGroup
    ? `custom-roster-${[...members].sort().join('-') || Date.now()}`
    : rosterId
  const next = getFavorites().map(item => {
    const matches = isSingleGroup ? members.has(item.characterName) : item.rosterId === rosterId
    return matches ? { ...item, rosterId: assignedRosterId, rosterName: name } : item
  })
  saveFavorites(next)
  return next
}

export function groupFavorites(favorites) {
  const groups = new Map()
  favorites.forEach(item => {
    const key = item.rosterId || 'ungrouped'
    if (!groups.has(key)) groups.set(key, { id: key, name: item.rosterName || '기타 즐겨찾기', characters: [] })
    groups.get(key).characters.push(item)
  })
  return [...groups.values()]
}

function updateFavoriteProfile(profile) {
  const record = favoriteRecord(profile)
  if (!record) return
  const current = getFavorites()
  const next = current.map(item => item.characterName === record.characterName ? { ...item, ...record, rosterId: item.rosterId || '', rosterName: item.rosterName || '' } : item)
  saveFavorites(next)
}

async function hydrateFavorite(item) {
  if (!item.characterName || item.characterImage || hydrating.has(item.characterName)) return
  hydrating.add(item.characterName)
  try {
    const data = await lostArkApi.getCharacter(item.characterName)
    const profile = data?.armory?.ArmoryProfile
    if (profile) updateFavoriteProfile(profile)
  } catch {
    // The text avatar remains available when a profile image cannot be loaded.
  } finally {
    hydrating.delete(item.characterName)
  }
}

export function toggleFavorite(profile) {
  const characterName = profile?.CharacterName?.trim()
  if (!characterName) return getFavorites()
  const current = getFavorites()
  const exists = current.some(item => item.characterName === characterName)
  const next = exists ? current.filter(item => item.characterName !== characterName) : [favoriteRecord(profile), ...current].slice(0, 50)
  saveFavorites(next)
  return next
}

export function useFavorites() {
  const [favorites, setFavorites] = useState(getFavorites)
  const [representativeName, setRepresentativeName] = useState(getRepresentativeCharacterName)
  useEffect(() => {
    const sync = event => setFavorites(event.detail || getFavorites())
    const syncRepresentative = event => setRepresentativeName(event.detail ?? getRepresentativeCharacterName())
    const syncStorage = () => { setFavorites(getFavorites()); setRepresentativeName(getRepresentativeCharacterName()) }
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener(REPRESENTATIVE_CHANGE_EVENT, syncRepresentative)
    window.addEventListener('storage', syncStorage)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener(REPRESENTATIVE_CHANGE_EVENT, syncRepresentative)
      window.removeEventListener('storage', syncStorage)
    }
  }, [])
  useEffect(() => {
    favorites.filter(item => !item.characterImage).forEach(hydrateFavorite)
  }, [favorites])
  const representative = favorites.find(item => item.characterName === representativeName) || null
  return { favorites, representative, representativeName, setRepresentative: setRepresentativeCharacter, toggle: toggleFavorite, add: addFavorites, remove: removeFavorite, removeMany: removeFavorites, renameRoster: renameFavoriteRoster }
}
