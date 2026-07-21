export const COMMUNITY_CATEGORIES = [
  { id: 'NOTICE', label: '공지사항' },
  { id: 'SUGGESTION', label: '건의사항' },
  { id: 'ROADMAP', label: '로드맵' },
]

export const communityCategoryLabel = (id) =>
  COMMUNITY_CATEGORIES.find((item) => item.id === id)?.label || id

export const formatCommunityDate = (value) => {
  const date = new Date(value)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}
