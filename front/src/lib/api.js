const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || `API 요청 실패 (${response.status})`)
  }

  return response.status === 204 ? null : response.json()
}

export const discordLoginUrl = `${API_BASE_URL.replace(/\/api$/, '')}/oauth2/authorization/discord`

export const lostArkApi = {
  getCharacter: (characterName) => request(`/characters/${encodeURIComponent(characterName)}`),
  getMarketPrices: (names) =>
    request('/markets/prices', { method: 'POST', body: JSON.stringify({ names }) }),
  getBraceletAuctionValue: () => request('/auctions/bracelets/value'),
  getRelicBraceletAuctionValue: () => request('/auctions/bracelets/relic/value'),
  getAbilityStoneAuctionValue: () => request('/auctions/ability-stones/value'),
  getGameContentsCalendar: () => request('/gamecontents/calendar'),
  getMariShop: () => request('/mari-shop'),
  getCacheStatus: () => request('/cache/status'),
  getCurrentUser: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getUserData: () => request('/user-data'),
  saveUserData: (data) => request('/user-data', { method: 'PUT', body: JSON.stringify(data) }),
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
