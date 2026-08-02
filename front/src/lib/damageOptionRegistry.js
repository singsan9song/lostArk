import seedRegistry from '../data/damage-option-registry.json'
import { setLocalData } from './localData'
import { cleanApiText } from './text'

export const DAMAGE_OPTION_REGISTRY_STORAGE_KEY = 'loark-damage-option-registry-v1'

export const DAMAGE_EFFECT_TYPES = [
  { value: 'MAIN_STAT_FLAT', label: '주스탯 +', unit: 'fixed', group: 'mainStat' },
  { value: 'MAIN_STAT_PERCENT', label: '주스탯 %', unit: 'percent', group: 'mainStat' },
  { value: 'WEAPON_ATTACK_FLAT', label: '무기 공격력 +', unit: 'fixed', group: 'weaponAttack' },
  {
    value: 'WEAPON_ATTACK_PERCENT',
    label: '무기 공격력 %',
    unit: 'percent',
    group: 'weaponAttack',
  },
  {
    value: 'BASE_ATTACK_FLAT',
    label: '기본 공격력 +',
    unit: 'fixed',
    group: 'baseAttack',
  },
  {
    value: 'BASE_ATTACK_PERCENT',
    label: '기본 공격력 %',
    unit: 'percent',
    group: 'baseAttack',
  },
  { value: 'ATTACK_POWER_FLAT', label: '공격력 +', unit: 'fixed', group: 'attackPower' },
  {
    value: 'ATTACK_POWER_PERCENT',
    label: '공격력 %',
    unit: 'percent',
    group: 'attackPower',
  },
  {
    value: 'ADDITIONAL_DAMAGE_PERCENT',
    label: '추가 피해 %',
    unit: 'percent',
    group: 'additionalDamage',
  },
  {
    value: 'ADDITIONAL_DAMAGE_FLAT',
    label: '추가 피해 +',
    unit: 'fixed',
    group: 'additionalDamage',
  },
  {
    value: 'DAMAGE_INCREASE_PERCENT',
    label: '피해 증가 %',
    unit: 'percent',
    group: 'damageIncrease',
  },
  {
    value: 'DAMAGE_INCREASE_FLAT',
    label: '피해 증가 +',
    unit: 'fixed',
    group: 'damageIncrease',
  },
  {
    value: 'ENEMY_RECEIVED_DAMAGE_PERCENT',
    label: '적 받는 피해 증가 %',
    unit: 'percent',
    group: 'enemyReceivedDamage',
  },
  {
    value: 'ENEMY_RECEIVED_DAMAGE_FLAT',
    label: '적 받는 피해 증가 +',
    unit: 'fixed',
    group: 'enemyReceivedDamage',
  },
  {
    value: 'CRIT_RATE_PERCENT',
    label: '치명타 적중률 %',
    unit: 'percent',
    group: 'critRate',
  },
  {
    value: 'CRIT_DAMAGE_PERCENT',
    label: '치명타 피해 %',
    unit: 'percent',
    group: 'critDamage',
  },
  {
    value: 'CRIT_DAMAGE_FLAT',
    label: '치명타 피해 +',
    unit: 'fixed',
    group: 'critDamage',
  },
  {
    value: 'ATTACK_SPEED_PERCENT',
    label: '공격속도 %',
    unit: 'percent',
    group: 'attackSpeed',
  },
  {
    value: 'MOVE_SPEED_PERCENT',
    label: '이동속도 %',
    unit: 'percent',
    group: 'moveSpeed',
  },
  {
    value: 'COOLDOWN_REDUCTION_PERCENT',
    label: '재사용 대기시간 감소 %',
    unit: 'percent',
    group: 'cooldownReduction',
  },
  {
    value: 'COOLDOWN_REDUCTION_FLAT',
    label: '재사용 대기시간 -',
    unit: 'fixed',
    group: 'cooldownReduction',
  },
  {
    // Not wired into the actual damage multiplier: DamageAnalysis.jsx's defense-multiplier
    // calc (LUMERUS_DEFENSE_REDUCTION) is currently a fixed baseline constant, not derived
    // from any per-effect source, mapped or auto-detected. Picking this only classifies the
    // source (no longer "미분류") - see DamageAnalysis.jsx:157-160 before wiring it up further.
    value: 'DEFENSE_REDUCTION_PERCENT',
    label: '방어력 감소 %',
    unit: 'percent',
    group: 'defenseReduction',
  },
  {
    value: 'ALLY_DAMAGE_ENHANCEMENT_PERCENT',
    label: '아군 피해량 강화 효과 %',
    unit: 'percent',
    group: 'supportEffect',
  },
  {
    value: 'BRAND_POWER_PERCENT',
    label: '낙인력 %',
    unit: 'percent',
    group: 'supportEffect',
  },
  // Catch-all for options that don't fit any calculated stat bucket above. Deliberately not
  // summed anywhere in calculateRegisteredEffects, so picking it just marks the source as
  // classified (no longer "미분류") without contributing any numeric effect.
  { value: 'OTHER', label: '기타', unit: 'none', group: 'other' },
]

export const DAMAGE_EFFECT_CONDITIONS = [
  { value: 'ALWAYS', label: '상시 적용' },
  { value: 'BACK_ATTACK', label: '백어택 성공 시' },
  { value: 'HEAD_ATTACK', label: '헤드어택 성공 시' },
  { value: 'CRITICAL_HIT', label: '치명타 적중 시' },
  { value: 'STAGGERED', label: '무력화 상태의 적' },
  { value: 'HP_ABOVE_50', label: '생명력 50% 이상' },
  { value: 'CUSTOM', label: '사용자 조건' },
]

// ArmorySkills.SkillType의 상위 분류와 SkillType 0 안의 툴팁 세부 분류를
// 동일한 내부 키로 다룬다. 발현/화신 스킬은 API상 SkillType 0이지만
// [발현 스킬]/[화신 스킬] 표기가 있으므로 일반 스킬과 배타적으로 분리한다.
export const DAMAGE_SKILL_CATEGORIES = [
  '일반',
  '초각성',
  '각성기',
  '초각성기',
  '발현',
  '화신',
]

export function damageOptionSkillCategoryLabel(category = '') {
  const normalized = String(category || '').trim()
  if (!normalized) return '분류 미확인'
  return normalized.endsWith('기') ? normalized : `${normalized} 스킬`
}

export function normalizeDamageOptionSource(source = '') {
  return cleanApiText(source)
    .replace(/\s+/g, ' ')
    .trim()
}

export function damageOptionSkillCategory(skill) {
  const skillType = Number(skill?.SkillType)
  if (skillType === 1) return '초각성'
  if (skillType === 100) return '각성기'
  if (skillType === 101) return '초각성기'

  const tooltipCategory =
    normalizeDamageOptionSource(skill?.Tooltip || '').match(
      /\[([^\[\]]+?)\s*스킬\]/,
    )?.[1]?.trim() || ''

  // SkillType 0의 발현/화신/악마 등은 일반 스킬의 하위 표기가 아니라
  // 실제 계산에서 서로 겹치지 않는 전용 분류로 사용한다.
  if (skillType === 0) return tooltipCategory || '일반'
  return tooltipCategory
}

export function toDamageOptionTemplate(source = '') {
  const normalized = normalizeDamageOptionSource(source)
  if (/\{[a-zA-Z]\w*\}/.test(normalized)) return normalized
  const keys = ['n', 'm', 'k', 'p', 'q', 'r']
  let index = 0
  return normalized.replace(/\d[\d,]*(?:\.\d+)?/g, () => `{${keys[index++] || `v${index}`}}`)
}

export function collectDamageOptionSourceEntries(armory) {
  const entries = []
  const add = (value, origin, tooltipItem, instanceKey) => {
    if (typeof value !== 'string') return
    value
      .split(/<br\s*\/?>|\|/gi)
      .map(normalizeDamageOptionSource)
      .filter(Boolean)
      .forEach((line) => {
        entries.push({ source: line, origin, tooltipItem, instanceKey })
      })
  }

  const pathLabels = {
    combatStats: '전투 특성',
    equipment: '장비',
    accessories: '악세서리',
    bracelets: '팔찌',
    avatars: '아바타',
    arkPassivePoints: '아크패시브 포인트',
    arkPassiveEffects: '아크패시브 효과',
    engravings: '각인',
    skillGemEffects: '스킬 보석',
    skills: '스킬',
    arkGrid: '아크그리드',
  }
  const pathText = (path) =>
    path.map((part) => pathLabels[part] || part).join(' > ')
  const isPresentationAsset = (path, value) => {
    const leaf = path.at(-1)
    return (
      ['Icon', 'CharacterImage'].includes(leaf) &&
      typeof value === 'string' &&
      /^https?:\/\//i.test(value)
    )
  }
  const walk = (
    value,
    path = [],
    origin = pathLabels[path[0]] || '기타',
    tooltipItem = null,
    instanceKey = path[0] || '기타',
  ) => {
    if (typeof value === 'string') {
      if (isPresentationAsset(path, value)) return
      try {
        const parsed = JSON.parse(value)
        if (typeof parsed === 'string') add(value, origin, tooltipItem, instanceKey)
        else walk(parsed, path, origin, tooltipItem, instanceKey)
      } catch {
        add(value, origin, tooltipItem, instanceKey)
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      add(`${pathText(path)}: ${value}`, origin, tooltipItem, instanceKey)
    } else if (Array.isArray(value)) {
      value.forEach((entry) => walk(entry, path, origin, tooltipItem, instanceKey))
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) =>
        walk(entry, [...path, key], origin, tooltipItem, instanceKey),
      )
    }
  }
  const originText = (...parts) => parts.filter(Boolean).join(' · ')
  const scan = (root, value, origin, instanceKey = root) =>
    walk(value, [root], origin, value, instanceKey)
  const scanItems = (root, values, originForItem) =>
    (values || []).forEach((value, index) =>
      scan(root, value, originForItem(value, index), `${root}:${index}`),
    )

  const combatStats = armory?.ArmoryProfile?.Stats || []
  scanItems('combatStats', combatStats, (stat) =>
    originText('전투 특성', stat?.Type),
  )

  const equipment = armory?.ArmoryEquipment || []
  const isAccessory = (item) => ['목걸이', '귀걸이', '반지'].includes(item?.Type)
  const isBracelet = (item) => item?.Type === '팔찌'
  const isExcludedEquipment = (item) =>
    ['나침반', '부적', '보주', '문장'].includes(item?.Type)
  scanItems(
    'equipment',
    equipment.filter(
      (item) =>
        !isAccessory(item) &&
        !isBracelet(item) &&
        !isExcludedEquipment(item),
    ),
    (item) => originText('장비', item?.Type, item?.Name),
  )
  scanItems(
    'accessories',
    equipment.filter(isAccessory),
    (item) => originText('악세서리', item?.Type, item?.Name),
  )
  scanItems(
    'bracelets',
    equipment.filter(isBracelet),
    (item) => originText('팔찌', item?.Name),
  )
  scanItems('avatars', armory?.ArmoryAvatars, (avatar) =>
    originText('아바타', avatar?.Type, avatar?.Name),
  )

  const arkPassive = armory?.ArkPassive || {}
  const {
    Points: arkPassivePoints,
    Effects: arkPassiveEffects,
    ...arkPassiveState
  } = arkPassive
  scan('arkPassiveEffects', arkPassiveState, '아크패시브')
  scanItems('arkPassivePoints', arkPassivePoints, (point) =>
    originText('아크패시브 포인트', point?.Name),
  )
  scanItems('arkPassiveEffects', arkPassiveEffects, (effect) =>
    originText('아크패시브', effect?.Name),
  )

  const engravingData = armory?.ArmoryEngraving || {}
  const {
    ArkPassiveEffects: arkPassiveEngravings,
    Effects: engravingEffects,
    Engravings: engravings,
    ...engravingState
  } = engravingData
  scan('engravings', engravingState, '각인')
  ;[
    ...(arkPassiveEngravings || []),
    ...(engravingEffects || []),
    ...(engravings || []),
  ].forEach((engraving) =>
    scan('engravings', engraving, originText('각인', engraving?.Name)),
  )

  const { Skills: _skillGemSkills, ...skillGemEffectData } =
    armory?.ArmoryGem?.Effects || {}
  scan('skillGemEffects', skillGemEffectData, '스킬 보석 효과')

  const skills = armory?.ArmorySkills || []
  skills.forEach((skill) => {
    const skillData = { ...skill }
    delete skillData.Tripods
    scan('skills', skillData, originText('스킬', skill?.Name))
  })

  const arkGrid = armory?.ArkGrid || {}
  const { Slots: arkGridSlots, Effects: arkGridEffects, ...arkGridState } = arkGrid
  scan('arkGrid', arkGridState, '아크그리드')
  // 슬롯 객체의 Gems에는 개별 젬 효과가 중첩되어 들어온다. 계산에는 API가
  // ArkGrid.Effects로 제공하는 전체 합산값만 사용하므로 개별 젬은 원문
  // 수집·매핑 대상에서 제외하고 코어 자체 데이터만 스캔한다.
  const arkGridCoreSlots = (arkGridSlots || []).map((slot) => {
    const { Gems: _gems, ...coreSlot } = slot || {}
    return coreSlot
  })
  scanItems('arkGrid', arkGridCoreSlots, (slot, index) =>
    originText('아크그리드 슬롯', slot?.Name || `${index + 1}번`),
  )
  scanItems('arkGrid', arkGridEffects, (effect) =>
    originText('아크그리드 효과', effect?.Name),
  )

  return entries
}

export function collectDamageOptionSources(armory) {
  return collectDamageOptionSourceEntries(armory).map((entry) => entry.source)
}

function filterMappedDamageText(value, resolver) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object') {
      const filterNode = (node) => {
        if (typeof node === 'string') return filterMappedDamageText(node, resolver)
        if (Array.isArray(node)) return node.map(filterNode)
        if (node && typeof node === 'object') {
          return Object.fromEntries(
            Object.entries(node).map(([key, entry]) => [key, filterNode(entry)]),
          )
        }
        return node
      }
      return JSON.stringify(filterNode(parsed))
    }
  } catch {
    // 일반 원문 문자열은 아래에서 줄 단위로 매핑 여부를 확인한다.
  }
  return value
    .split(/<br\s*\/?>|\|/gi)
    .filter((line) => {
      const matched = resolver(normalizeDamageOptionSource(line))
      return matched && !matched.ignored && matched.effects.length > 0
    })
    .join('<br>')
}

export function createMappedDamageAnalysisArmory(armory, registry) {
  if (!armory) return armory
  const resolver = createDamageOptionRegistryResolver(registry)
  const clone = JSON.parse(JSON.stringify(armory))

  const sanitizeDescriptions = (value, path = []) => {
    if (Array.isArray(value)) {
      return value.map((entry, index) => sanitizeDescriptions(entry, [...path, index]))
    }
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const nextPath = [...path, key]
        const isSkillBaseTooltip =
          key === 'Tooltip' &&
          nextPath[0] === 'ArmorySkills' &&
          nextPath.length === 3
        const isDescription = key === 'Tooltip' || key === 'Description'
        const isCardEffectName =
          key === 'Name' &&
          nextPath[0] === 'ArmoryCard' &&
          nextPath.includes('Effects') &&
          nextPath.includes('Items')
        if (typeof entry === 'string' && (isDescription || isCardEffectName)) {
          return [
            key,
            isSkillBaseTooltip ? entry : filterMappedDamageText(entry, resolver),
          ]
        }
        return [key, sanitizeDescriptions(entry, nextPath)]
      }),
    )
  }

  return sanitizeDescriptions(clone)
}

export function groupDamageOptionSources(sources = []) {
  const groups = new Map()
  sources.forEach((entry) => {
    const source = typeof entry === 'string' ? entry : entry?.source
    const origin = typeof entry === 'string' ? '' : entry?.origin
    const normalized = normalizeDamageOptionSource(source)
    if (!normalized) return
    const template = toDamageOptionTemplate(normalized)
    if (!groups.has(template)) {
      groups.set(template, {
        template,
        sources: [],
        origins: [],
        occurrenceCount: 0,
        sourceSet: new Set(),
        originSet: new Set(),
      })
    }
    const group = groups.get(template)
    group.occurrenceCount += 1
    if (!group.sourceSet.has(normalized)) {
      group.sourceSet.add(normalized)
      group.sources.push(normalized)
    }
    if (origin && !group.originSet.has(origin)) {
      group.originSet.add(origin)
      group.origins.push(origin)
    }
  })
  return [...groups.values()].map(({ sourceSet: _sourceSet, originSet: _originSet, ...group }) => group)
}

export function dedupeDamageOptionRegistry(registry) {
  const records = []
  const byTemplate = new Map()
  ;(registry?.records || []).forEach((record) => {
    const source = normalizeDamageOptionSource(record.source)
    if (!source) return
    const key = source
    const existing = byTemplate.get(key)
    if (!existing) {
      const { _draft, ...persistentRecord } = record
      const next = {
        ...persistentRecord,
        source,
        ignored: Boolean(record.ignored),
        effects: [...(record.effects || [])],
      }
      byTemplate.set(key, next)
      records.push(next)
      return
    }
    existing.ignored = existing.ignored || Boolean(record.ignored)
    if (!existing.effects.length && record.effects?.length) {
      existing.effects = [...record.effects]
    }
  })
  return { version: 1, records }
}

export function compactDamageOptionRegistry(registry) {
  const deduped = dedupeDamageOptionRegistry(registry)
  return {
    ...deduped,
    records: deduped.records.filter(isCompleteDamageOptionRecord),
  }
}

export function damageOptionTemplateKeys(source = '') {
  return [
    ...new Set(
      [...normalizeDamageOptionSource(source).matchAll(/\{([a-zA-Z]\w*)\}/g)].map(
        (match) => match[1],
      ),
    ),
  ]
}

export function isCompleteDamageOptionRecord(record) {
  if (record?.ignored) return true
  if (!(record?.effects || []).length) return false
  const keys = damageOptionTemplateKeys(record.source)
  return record.effects.every(
    (effect) =>
      effect.valueKey &&
      keys.includes(effect.valueKey) &&
      (effect.stackCount == null ||
        (Number.isFinite(Number(effect.stackCount)) && Number(effect.stackCount) >= 1)) &&
      (!effect.stack?.enabled ||
        (effect.stack.maxStackKey &&
          keys.includes(effect.stack.maxStackKey) &&
          Number.isFinite(Number(effect.stack.appliedRatio)))),
  )
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const damageOptionTemplateCache = new Map()

function compileDamageOptionTemplate(template) {
  const normalizedTemplate = normalizeDamageOptionSource(template)
  const cached = damageOptionTemplateCache.get(normalizedTemplate)
  if (cached) return cached
  const keys = []
  const parts = normalizedTemplate.split(/(\{[a-zA-Z]\w*\})/g)
  const pattern = parts
    .map((part) => {
      const placeholder = part.match(/^\{([a-zA-Z]\w*)\}$/)
      if (!placeholder) return escapePattern(part)
      keys.push(placeholder[1])
      return '([+-]?\\d[\\d,]*(?:\\.\\d+)?)'
    })
    .join('')
  const compiled = {
    keys,
    pattern: new RegExp(`^${pattern}$`),
    shape: normalizedTemplate.replace(/\{[a-zA-Z]\w*\}/g, '{}'),
  }
  if (damageOptionTemplateCache.size >= 10000) damageOptionTemplateCache.clear()
  damageOptionTemplateCache.set(normalizedTemplate, compiled)
  return compiled
}

function matchCompiledDamageOptionTemplate(compiled, source) {
  const normalizedSource = normalizeDamageOptionSource(source)
  const match = normalizedSource.match(compiled.pattern)
  if (!match) return null
  const values = {}
  compiled.keys.forEach((key, index) => {
    values[key] = Number(match[index + 1].replaceAll(',', ''))
  })
  return values
}

export function matchDamageOptionTemplate(template, source) {
  return matchCompiledDamageOptionTemplate(compileDamageOptionTemplate(template), source)
}

function damageOptionSourceShape(source) {
  return toDamageOptionTemplate(source).replace(/\{[a-zA-Z]\w*\}/g, '{}')
}

export function createDamageOptionRegistryResolver(registry) {
  const byShape = new Map()
  ;(registry?.records || []).forEach((record) => {
    const compiled = compileDamageOptionTemplate(record.source)
    const entries = byShape.get(compiled.shape) || []
    entries.push({ record, compiled })
    byShape.set(compiled.shape, entries)
  })

  return (source) => {
    const candidates = byShape.get(damageOptionSourceShape(source)) || []
    for (const { record, compiled } of candidates) {
      const values = matchCompiledDamageOptionTemplate(compiled, source)
      if (!values) continue
      return {
        ...record,
        matchedSource: normalizeDamageOptionSource(source),
        values,
        effects: record.ignored
          ? []
          : (record.effects || [])
              .filter((effect) => effect.valueKey && values[effect.valueKey] != null)
              .map((effect) => {
                const baseValue = values[effect.valueKey]
                const stackCount = Number(effect.stackCount)
                const hasStackCount = Number.isFinite(stackCount) && stackCount >= 1
                const legacyStackEnabled = !hasStackCount && Boolean(effect.stack?.enabled)
                const maxStacks = legacyStackEnabled
                  ? Number(values[effect.stack.maxStackKey]) || 0
                  : null
                const appliedRatio = legacyStackEnabled
                  ? Math.min(Math.max(Number(effect.stack.appliedRatio) || 0, 0), 100)
                  : null
                const appliedStacks = hasStackCount
                  ? stackCount
                  : legacyStackEnabled
                    ? maxStacks * (appliedRatio / 100)
                    : 1
                return {
                  ...effect,
                  baseValue,
                  value: baseValue * appliedStacks,
                  stackCount: hasStackCount ? stackCount : undefined,
                  stack:
                    hasStackCount && stackCount > 1
                      ? {
                          appliedStacks: stackCount,
                          maxStacks: stackCount,
                          fixedCount: true,
                        }
                      : legacyStackEnabled
                    ? {
                        ...effect.stack,
                        maxStacks,
                        appliedRatio,
                        appliedStacks,
                      }
                    : null,
                }
              }),
      }
    }
    return null
  }
}

function cloneSeedRegistry() {
  return JSON.parse(JSON.stringify(seedRegistry))
}

export function loadDamageOptionRegistry() {
  try {
    const stored = JSON.parse(localStorage.getItem(DAMAGE_OPTION_REGISTRY_STORAGE_KEY) || 'null')
    if (stored?.version === 1 && Array.isArray(stored.records)) {
      return compactDamageOptionRegistry(stored)
    }
  } catch {
    // 손상된 로컬 데이터는 기본 데이터로 복구한다.
  }
  return cloneSeedRegistry()
}

export function saveDamageOptionRegistry(registry) {
  setLocalData(
    DAMAGE_OPTION_REGISTRY_STORAGE_KEY,
    JSON.stringify(compactDamageOptionRegistry(registry)),
  )
}

export function findDamageOptionRecord(source, registry = loadDamageOptionRegistry()) {
  return createDamageOptionRegistryResolver(registry)(source)
}

export function resolveDamageOptionSource(source, registry = loadDamageOptionRegistry()) {
  return createDamageOptionRegistryResolver(registry)(source)
}

export function collectResolvedDamageOptionEffects(armory, registry) {
  const resolver = createDamageOptionRegistryResolver(registry)
  const seen = new Set()
  const arkGridPointByOrigin = new Map(
    (armory?.ArkGrid?.Slots || []).map((slot) => [
      `아크그리드 슬롯 · ${slot?.Name || ''}`,
      Number.isFinite(Number(slot?.Point)) ? Number(slot.Point) : 0,
    ]),
  )
  return collectDamageOptionSourceEntries(armory).flatMap(
    ({ source, origin, instanceKey }, sourceIndex) => {
      const record = resolver(source)
      if (!record || record.ignored) return []
      const ownedArkGridPoint = arkGridPointByOrigin.get(origin)
      const requiredArkGridPoint = normalizeDamageOptionSource(source).match(
        /^\[(\d+)P\]/,
      )?.[1]
      if (
        ownedArkGridPoint != null &&
        requiredArkGridPoint != null &&
        Number(requiredArkGridPoint) > ownedArkGridPoint
      ) {
        return []
      }
      return (record.effects || []).flatMap((effect, effectIndex) => {
        const matchedSource = record.matchedSource || normalizeDamageOptionSource(source)
        const sourceSkillName = origin?.startsWith('스킬 · ')
          ? origin.slice('스킬 · '.length).trim()
          : ''
        const key = [
          instanceKey || origin,
          origin,
          matchedSource,
          effect.type,
          effect.valueKey,
          effect.condition || 'ALWAYS',
          effect.skillName || '',
          JSON.stringify(effect.skillNames || []),
          JSON.stringify(effect.skillCategories || []),
        ].join('|')
        if (seen.has(key)) return []
        seen.add(key)
        return [
          {
            ...effect,
            id: `${record.id || 'mapped'}-${sourceIndex}-${effectIndex}`,
            recordId: record.id,
            template: record.source,
            source: matchedSource,
            origin,
            sourceSkillName,
            values: record.values,
          },
        ]
      })
    },
  )
}

export function calculateRegisteredEffects(records, inputs, enabledConditions = new Set()) {
  const activeEffects = records.flatMap((record) =>
    (record.effects || [])
      .filter(
        (effect) =>
          effect.condition === 'ALWAYS' || enabledConditions.has(effect.condition || 'ALWAYS'),
      )
      .map((effect) => ({
        ...effect,
        source: record.source,
        occurrenceCount: Math.max(Number(record.occurrenceCount) || 1, 1),
      })),
  )
  const sum = (type) =>
    activeEffects
      .filter((effect) => effect.type === type)
      .reduce(
        (total, effect) =>
          total + (Number(effect.value) || 0) * effect.occurrenceCount,
        0,
      )
  const mainStat = (Number(inputs.mainStat) || 0) + sum('MAIN_STAT_FLAT')
  const finalMainStat = mainStat * (1 + sum('MAIN_STAT_PERCENT') / 100)
  const weaponAttack =
    ((Number(inputs.weaponAttack) || 0) + sum('WEAPON_ATTACK_FLAT')) *
    (1 + sum('WEAPON_ATTACK_PERCENT') / 100)
  const pureBaseAttack = Math.sqrt(Math.max((finalMainStat * weaponAttack) / 6, 0))
  const baseAttack =
    (pureBaseAttack + sum('BASE_ATTACK_FLAT')) * (1 + sum('BASE_ATTACK_PERCENT') / 100)
  const attackPower =
    (baseAttack + sum('ATTACK_POWER_FLAT')) * (1 + sum('ATTACK_POWER_PERCENT') / 100)
  const attackSpeedPercent = sum('ATTACK_SPEED_PERCENT')
  const moveSpeedPercent = sum('MOVE_SPEED_PERCENT')
  const finalDamageTypes = new Set([
    'DAMAGE_INCREASE_PERCENT',
    'ENEMY_RECEIVED_DAMAGE_PERCENT',
  ])
  const finalDamageMultiplier = activeEffects
    .filter((effect) => finalDamageTypes.has(effect.type))
    .reduce(
      (product, effect) =>
        product *
        Math.pow(1 + (Number(effect.value) || 0) / 100, effect.occurrenceCount),
      1,
    )

  return {
    activeEffects,
    mainStat: finalMainStat,
    weaponAttack,
    baseAttack,
    attackPower,
    attackSpeedPercent,
    moveSpeedPercent,
    finalDamageMultiplier,
    finalDamagePercent: (finalDamageMultiplier - 1) * 100,
  }
}

export function freshDamageOptionRecord(source = '') {
  return {
    id: `damage-option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: normalizeDamageOptionSource(source),
    ignored: false,
    effects: [],
  }
}

export function freshDamageEffect() {
  return {
    type: 'WEAPON_ATTACK_FLAT',
    valueKey: 'n',
    condition: 'ALWAYS',
    skillName: '',
    skillNames: [],
    skillCategories: [],
    label: '',
    stackCount: 1,
    stack: null,
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

export function damageOptionRegistryToCsv(registry) {
  const header = [
    'id',
    'source',
    'ignored',
    'effectType',
    'valueKey',
    'condition',
    'skillName',
    'skillNames',
    'skillCategories',
    'label',
    'stackCount',
  ]
  const rows = registry.records.flatMap((record) =>
    record.effects?.length
      ? record.effects.map((effect) => [
          record.id,
          record.source,
          record.ignored ? 'true' : 'false',
          effect.type,
          effect.valueKey || '',
          effect.condition || 'ALWAYS',
          effect.skillName || '',
          JSON.stringify(effect.skillNames || []),
          JSON.stringify(effect.skillCategories || []),
          effect.label || '',
          effect.stackCount ?? '',
        ])
      : [
          [
            record.id,
            record.source,
            record.ignored ? 'true' : 'false',
            '',
            '',
            '',
            '',
            '[]',
            '[]',
            '',
            '',
          ],
        ],
  )
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted && character === '"' && text[index + 1] === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  row.push(cell)
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export function damageOptionRegistryFromCsv(text) {
  const [header, ...rows] = parseCsv(text)
  const column = Object.fromEntries((header || []).map((name, index) => [name, index]))
  if (column.source == null || column.effectType == null) throw new Error('invalid csv')
  const records = []
  const byId = new Map()
  const parseArray = (value) => {
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return value.split('|').map((item) => item.trim()).filter(Boolean)
    }
  }
  rows.forEach((row, rowIndex) => {
    const id = row[column.id] || `imported-option-${rowIndex + 1}`
    let record = byId.get(id)
    if (!record) {
      record = {
        id,
        source: row[column.source] || '',
        ignored: row[column.ignored] === 'true',
        effects: [],
      }
      byId.set(id, record)
      records.push(record)
    }
    const type = row[column.effectType]
    if (!type) return
    record.effects.push({
      type,
      valueKey: row[column.valueKey] || '',
      condition: row[column.condition] || 'ALWAYS',
      skillName: column.skillName == null ? '' : row[column.skillName] || '',
      skillNames: column.skillNames == null ? [] : parseArray(row[column.skillNames]),
      skillCategories:
        column.skillCategories == null ? [] : parseArray(row[column.skillCategories]),
      label: row[column.label] || '',
      stackCount:
        column.stackCount == null || row[column.stackCount] === ''
          ? 1
          : Math.max(1, Number(row[column.stackCount]) || 1),
      stack: null,
    })
  })
  return { version: 1, records }
}
