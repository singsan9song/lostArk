import { lostArkApi } from './api'

// Shared across HoningOptimizerPage / AdvancedHoningOptimizerPage /
// IntegratedHoningOptimizerPage so navigating between them doesn't refetch the same
// representative character's equipment. TTL (rather than an indefinite cache) keeps
// data reasonably fresh after the user hones gear and comes back later.
const TTL_MS = 60_000
const cache = new Map()

export function fetchRepresentativeEquipment(characterName) {
  if (!characterName) return Promise.resolve(null)
  const now = Date.now()
  const cached = cache.get(characterName)
  if (cached && cached.expiresAt > now) return cached.promise

  const promise = lostArkApi.getCharacterEquipment(characterName).catch((error) => {
    cache.delete(characterName)
    throw error
  })
  cache.set(characterName, { promise, expiresAt: now + TTL_MS })
  return promise
}
