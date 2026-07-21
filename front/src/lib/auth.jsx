import { createContext, useContext, useEffect, useState } from 'react'
import { discordLoginUrl, lostArkApi } from './api'
import { applyLocalData, clearLocalData, localDataSnapshot } from './localData'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

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

  const logout = async () => {
    await lostArkApi.logout()
    setUser(null)
  }
  const saveToCloud = () => lostArkApi.saveUserData(localDataSnapshot())
  const clearCloudData = async () => {
    await lostArkApi.deleteUserData()
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        loginUrl: discordLoginUrl,
        logout,
        saveToCloud,
        clearLocalData,
        clearCloudData,
      }}
    >
      {ready ? children : null}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
