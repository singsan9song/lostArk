import { createContext, useContext, useEffect, useState } from 'react'
import { discordLoginUrl, lostArkApi } from './api'
import { applyLocalData, LOCAL_DATA_CHANGED_EVENT, localDataSnapshot } from './localData'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    lostArkApi.getCurrentUser().then(async result => {
      if (!active || !result.authenticated) return
      const remote = await lostArkApi.getUserData()
      const merged = { ...localDataSnapshot(), ...remote }
      applyLocalData(merged)
      if (JSON.stringify(remote) !== JSON.stringify(merged)) await lostArkApi.saveUserData(merged)
      if (active) setUser(result)
    }).catch(() => {}).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) return undefined
    let timer
    const sync = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => lostArkApi.saveUserData(localDataSnapshot()).catch(() => {}), 350)
    }
    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, sync)
    return () => { window.clearTimeout(timer); window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, sync) }
  }, [user])

  const logout = async () => { await lostArkApi.logout(); setUser(null) }
  return <AuthContext.Provider value={{ user, ready, loginUrl: discordLoginUrl, logout }}>{ready ? children : null}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
