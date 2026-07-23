import { cleanApiText } from './text.js'

const equipmentIdByType = {
  투구: 'helmet',
  어깨: 'shoulder',
  상의: 'chest',
  하의: 'pants',
  장갑: 'gloves',
  무기: 'weapon',
}

const regularGradeCandidates = {
  3: [
    { grade: 'T3 1250 (희귀 ~ 유물)', baseLevel: 1250, levelPerStage: 15 },
    { grade: 'T3 1390 (상위 유물 ~ 고대)', baseLevel: 1390, levelPerStage: 10 },
    { grade: 'T3 1525 (상위 고대)', baseLevel: 1525, levelPerStage: 5 },
  ],
  4: [
    { grade: 'T4 1590 (4티어)', baseLevel: 1590, levelPerStage: 5 },
    { grade: 'T4 1730 (상위 고대)', baseLevel: 1730, levelPerStage: 5 },
  ],
}
const regularGradeMeta = new Map(
  Object.values(regularGradeCandidates)
    .flat()
    .map((item) => [item.grade, item]),
)

function tooltipText(raw = '') {
  try {
    const strings = []
    const walk = (value) => {
      if (typeof value === 'string') strings.push(cleanApiText(value))
      else if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(JSON.parse(raw))
    return strings.join(' ')
  } catch {
    return cleanApiText(raw)
  }
}

function inferRegularGrade(tier, itemLevel, enhancement, advancedHoning) {
  const candidates = regularGradeCandidates[tier] || []
  if (!candidates.length || !Number.isFinite(itemLevel) || !Number.isFinite(enhancement))
    return null

  const regularItemLevel = itemLevel - advancedHoning
  return [...candidates].sort((a, b) => {
    const aDifference = Math.abs(regularItemLevel - (a.baseLevel + enhancement * a.levelPerStage))
    const bDifference = Math.abs(regularItemLevel - (b.baseLevel + enhancement * b.levelPerStage))
    return aDifference - bDifference
  })[0].grade
}

export function representativeEquipmentFromArmory(armory) {
  return Object.fromEntries(
    (armory?.ArmoryEquipment || []).flatMap((item) => {
      const id = equipmentIdByType[item.Type]
      if (!id) return []

      const text = tooltipText(item.Tooltip)
      const enhancement = Number(item.Name?.match(/^\+(\d+)/)?.[1])
      const itemLevel = Number(text.match(/아이템 레벨\s*(\d{3,4})/)?.[1])
      const tier = Number(text.match(/\(티어\s*(\d+)\)/)?.[1])
      const advancedHoning = Number(text.match(/\[상급 재련\]\s*(\d+)단계/)?.[1] || 0)
      const regularGrade = inferRegularGrade(tier, itemLevel, enhancement, advancedHoning)

      if (!Number.isFinite(enhancement) || !regularGrade) return []
      return [
        [
          id,
          {
            enhancement,
            advancedHoning,
            tier,
            itemLevel,
            name: item.Name,
            type: item.Type,
            regularGrade,
            advancedGrade: tier === 3 || tier === 4 ? `T${tier}` : null,
          },
        ],
      ]
    }),
  )
}

export function itemLevelPerRegularStage(grade) {
  return regularGradeMeta.get(grade)?.levelPerStage || 0
}
