import { setLocalData } from './localData'

export const HONING_INVENTORY_STORAGE_KEY = 'loark-character-honing-materials'

export function getCharacterHoningInventories() {
  try {
    const value = JSON.parse(localStorage.getItem(HONING_INVENTORY_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export function saveCharacterHoningInventories(inventories) {
  setLocalData(HONING_INVENTORY_STORAGE_KEY, JSON.stringify(inventories))
  return inventories
}

export function normalizeHoningInventory(inventory = {}) {
  return Object.fromEntries(
    Object.entries(inventory)
      .map(([name, count]) => [name, Math.max(0, Math.floor(Number(count) || 0))])
      .filter(([, count]) => count > 0),
  )
}

export function applyOwnedMaterialsToResults(results, inventory, getUnitPrice) {
  const remaining = { ...normalizeHoningInventory(inventory) }
  let totalDiscount = 0

  const adjusted = results.map((result) => {
    let ownedDiscount = 0
    const materials = result.materials.map((material) => {
      const available = remaining[material.name] || 0
      const ownedUsed = Math.min(available, material.expectedCount ?? material.count ?? 0)
      const expectedCount = material.expectedCount ?? material.count ?? 0
      const purchaseCount = Math.max(0, expectedCount - ownedUsed)
      const unitPrice = getUnitPrice(material.name)
      const discount = unitPrice === null ? 0 : ownedUsed * unitPrice
      remaining[material.name] = Math.max(0, available - ownedUsed)
      ownedDiscount += discount
      return {
        ...material,
        ownedUsed,
        purchaseCount,
        ownedSaving: discount,
        cost:
          material.cost === undefined
            ? unitPrice === null
              ? null
              : expectedCount * unitPrice
            : material.cost,
      }
    })

    totalDiscount += ownedDiscount
    return {
      ...result,
      materials,
      ownedDiscount,
    }
  })

  return { results: adjusted, totalDiscount, remaining }
}
