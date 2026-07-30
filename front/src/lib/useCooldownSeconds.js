import { useEffect, useState } from 'react'

// Ticks once a second only while a cooldown is actually active, and only in whatever
// component calls this hook - callers should be small button-level components so this
// 1s re-render doesn't cascade into unrelated parts of the page (battle info, damage
// analysis, accessory comparison, etc.).
export function useCooldownSeconds(until = 0) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!until || until <= Date.now()) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [until])

  return Math.max(0, Math.ceil((until - now) / 1000))
}
