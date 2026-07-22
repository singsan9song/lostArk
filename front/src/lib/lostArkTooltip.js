// Parses the raw `Tooltip` JSON string returned by the Lost Ark Open API into an
// ordered list of { key, type, value } nodes for rendering.
export function parseTooltip(raw) {
  if (!raw) return []
  let obj
  try {
    obj = JSON.parse(raw)
  } catch {
    return []
  }
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj)
    .filter(([, entry]) => entry && entry.type)
    .map(([key, entry]) => ({ key, type: entry.type, value: entry.value }))
}
