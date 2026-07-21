import { useSyncExternalStore } from 'react'
import { removeLocalData, setLocalData } from './localData'

const STORAGE_KEY = 'loark.crystalGoldPer100'
const CHANGE_EVENT = 'loark:crystal-rate-change'
const DEFAULT_RATE = 16000

const readRate = () => {
  const value = Number(window.localStorage.getItem(STORAGE_KEY))
  return value > 0 ? value : DEFAULT_RATE
}

const subscribe = (callback) => {
  const notify = () => callback()
  window.addEventListener('storage', notify)
  window.addEventListener(CHANGE_EVENT, notify)
  return () => {
    window.removeEventListener('storage', notify)
    window.removeEventListener(CHANGE_EVENT, notify)
  }
}

export const setCrystalGoldPrice = (value) => {
  const normalized = Math.max(0, Math.round(Number(value) || 0))
  if (normalized > 0) setLocalData(STORAGE_KEY, String(normalized))
  else removeLocalData(STORAGE_KEY)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export const useCrystalGoldPrice = () =>
  useSyncExternalStore(subscribe, readRate, () => DEFAULT_RATE)
