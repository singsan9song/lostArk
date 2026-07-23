import { createContext, useContext, useEffect, useState } from 'react'
import { discordLoginUrl, lostArkApi } from './api'
import {
  applyLocalData,
  clearLocalData,
  LOCAL_DATA_CHANGED_EVENT,
  localDataSnapshot,
} from './localData'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')

  useEffect(() => {
    let active = true
    lostArkApi
      .getCurrentUser()
      .then(async (result) => {
        if (!active || !result.authenticated) return
        setUser(result)
        try {
          const remote = await lostArkApi.getUserData()
          if (active) applyLocalData({ ...localDataSnapshot(), ...remote })
        } catch {
          // Cloud data failed to load; local data stays as-is and login still succeeds.
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!ready || !user) return undefined

    let stopped = false
    let saveTimer
    let retryTimer
    let saving = false
    let pending = false

    const persist = async () => {
      if (stopped) return
      if (saving) {
        pending = true
        return
      }
      saving = true
      setSyncStatus('saving')
      let failed = false
      try {
        await lostArkApi.saveUserData(localDataSnapshot())
        if (!stopped) setSyncStatus('saved')
      } catch {
        failed = true
        if (!stopped) setSyncStatus('error')
      } finally {
        saving = false
        if (stopped) return
        if (pending) {
          pending = false
          saveTimer = window.setTimeout(persist, 0)
        } else if (failed) {
          retryTimer = window.setTimeout(persist, 3000)
        }
      }
    }
    const scheduleSave = () => {
      setSyncStatus('pending')
      window.clearTimeout(saveTimer)
      window.clearTimeout(retryTimer)
      if (saving) pending = true
      else saveTimer = window.setTimeout(persist, 300)
    }

    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, scheduleSave)
    setSyncStatus('saved')
    return () => {
      stopped = true
      window.clearTimeout(saveTimer)
      window.clearTimeout(retryTimer)
      window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, scheduleSave)
    }
  }, [ready, user])

  const logout = async () => {
    await lostArkApi.logout()
    setUser(null)
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        loginUrl: discordLoginUrl,
        logout,
        syncStatus,
        clearLocalData,
      }}
    >
      {ready ? children : null}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
