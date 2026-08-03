const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const headers = { ...options.headers }
  if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || `API 요청 실패 (${response.status})`)
  }

  return response.status === 204 ? null : response.json()
}

export const discordLoginUrl = `${API_BASE_URL.replace(/\/api$/, '')}/oauth2/authorization/discord`
export const adminApiRequestStreamUrl = `${API_BASE_URL}/admin/api-requests/stream`

export const lostArkApi = {
  getCharacter: (characterName, signal) =>
    request(`/characters/${encodeURIComponent(characterName)}`, { signal }),
  // DB-only instant read for the character page's first paint. Throws (404) when no
  // snapshot exists yet — callers should treat that as "no cache", not an error.
  getCachedCharacter: (characterName) =>
    request(`/characters/${encodeURIComponent(characterName)}/cached`),
  // Lightweight equipment-only read used by the honing pages (일반/상급/통합 재련) — avoids
  // pulling the full armory+roster+discoveries+growth-history bundle just to read 6 items.
  getCharacterEquipment: (characterName) =>
    request(`/characters/${encodeURIComponent(characterName)}/equipment`),
  refreshCharacter: (characterName) =>
    request(`/characters/${encodeURIComponent(characterName)}/refresh`, { method: 'POST' }),
  refreshCharacterRoster: (characterName) =>
    request(`/characters/${encodeURIComponent(characterName)}/roster/refresh`, { method: 'POST' }),
  getMarketPrices: (names, refresh = false) =>
    request(`/markets/prices?${new URLSearchParams({ refresh })}`, {
      method: 'POST',
      body: JSON.stringify({ names }),
    }),
  searchMarketItems: (query, refresh = true) =>
    request(`/markets/search?${new URLSearchParams({ query, refresh })}`),
  searchAuctionItems: (name, refresh = true) =>
    request(`/auctions/search?${new URLSearchParams({ name, refresh })}`),
  getBraceletAuctionValue: () => request('/auctions/bracelets/value'),
  getRelicBraceletAuctionValue: () => request('/auctions/bracelets/relic/value'),
  searchAccessoryAuctions: (filters) =>
    request('/auctions/accessories/search', {
      method: 'POST',
      body: JSON.stringify(filters),
    }),
  getAbilityStoneAuctionValue: () => request('/auctions/ability-stones/value'),
  getGameContentsCalendar: () => request('/gamecontents/calendar'),
  getMariShop: () => request('/mari-shop'),
  getCharacterRankings: ({
    metric = 'combatPower',
    server = '',
    role = '',
    className = '',
    engraving = '',
    page = 0,
    size = 50,
    signal,
  } = {}) =>
    request(
      `/rankings/characters?${new URLSearchParams({
        metric,
        server,
        role,
        className,
        engraving,
        page,
        size,
      })}`,
      { signal },
    ),
  getCurrentUser: () => request('/auth/me'),
  getDamageOptionRegistry: () => request('/damage-option-registry'),
  saveDamageOptionRegistry: (registry) =>
    request('/damage-option-registry', {
      method: 'PUT',
      body: JSON.stringify(registry),
    }),
  // 404 means "not tracked yet", not an error - callers should treat it as no estimate.
  getDamageOptionCoefficient: (recordId) =>
    request(`/damage-option-registry/coefficient?${new URLSearchParams({ recordId })}`),
  backfillDamageOptionCoefficient: (recordId) =>
    request(`/damage-option-registry/coefficient/backfill?${new URLSearchParams({ recordId })}`, {
      method: 'POST',
    }),
  getAdminApiRequestHistory: () => request('/admin/api-requests/history'),
  getAdminApiRequestHistoryDetails: (resetAt) =>
    request(`/admin/api-requests/history/details?${new URLSearchParams({ resetAt })}`),
  searchAdminApiRequestHistory: (query, page = 0, size = 200) =>
    request(`/admin/api-requests/history/search?${new URLSearchParams({ query, page, size })}`),
  getAdminDamageOptionCorpusOptions: () => request('/admin/damage-option-corpus/options'),
  getAdminDamageOptionCorpus: (className, engraving, page = 0) =>
    request(
      `/admin/damage-option-corpus?${new URLSearchParams({
        className,
        engraving,
        page,
      })}`,
    ),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getUserData: () => request('/user-data'),
  saveUserData: (data) => request('/user-data', { method: 'PUT', body: JSON.stringify(data) }),
  deleteUserData: () => request('/user-data', { method: 'DELETE' }),
  getCommunityPosts: ({ category, sort = 'latest', search = '', page = 0, size = 15 }) =>
    request(`/community/posts?${new URLSearchParams({ category, sort, search, page, size })}`),
  getCommunityPost: (id) => request(`/community/posts/${id}`),
  createCommunityPost: ({ category, title, content }) =>
    request('/community/posts', {
      method: 'POST',
      body: JSON.stringify({ category, title, content }),
    }),
  deleteCommunityPost: (id) => request(`/community/posts/${id}`, { method: 'DELETE' }),
  createCommunityComment: (postId, content) =>
    request(`/community/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  deleteCommunityComment: (id) => request(`/community/comments/${id}`, { method: 'DELETE' }),
  toggleCommunityLike: (postId) => request(`/community/posts/${postId}/like`, { method: 'POST' }),
}
