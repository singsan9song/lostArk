import { Database, HelpCircle, Sigma, Swords, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cleanApiText } from '../lib/text'
import { parseKarmaDescription } from '../lib/arkPassiveKarmaTable'
import {
  DAMAGE_EFFECT_TYPES,
  damageOptionSkillCategory,
  damageOptionSkillCategoryLabel,
} from '../lib/damageOptionRegistry'
import { expeditionMainStatBonus, levelMainStatBonus } from '../lib/mainStatTables'
import { useAuth } from '../lib/auth'
import {
  PET_TRAIT_OPTIONS,
  expeditionKeyFromSiblings,
  getDamageAnalysisSettingsFor,
  normalizePetTraitValue,
  petTraitGradeClass,
  saveDamageAnalysisSettingsFor,
} from '../lib/damageAnalysisSettings'
import conditionalStackData from '../data/damage-analysis-conditional-stacks.json'
import invenSkillConstants from '../data/lostark_inven_skill_constants.json'
import '../damage-analysis.css'

// Small reference-equality LRU cache for the heaviest tooltip-parsing breakdown functions
// below. The component re-renders on every UI toggle (show/hide detail panels, etc.) with the
// same armory/profile/skill references, so most calls to these functions are pure repeats of
// the last few argument combinations - caching them here (at the function definition, not the
// call site) speeds that up without touching any call site, hook, or the function bodies
// themselves. A cache miss (genuinely new arguments) just falls back to a normal call.
function memoizeN(fn, size = 6) {
  const entries = []
  return (...args) => {
    const index = entries.findIndex(
      (entry) =>
        entry.args.length === args.length && entry.args.every((value, i) => value === args[i]),
    )
    if (index !== -1) {
      const [hit] = entries.splice(index, 1)
      entries.unshift(hit)
      return hit.result
    }
    const result = fn(...args)
    entries.unshift({ args, result })
    if (entries.length > size) entries.pop()
    return result
  }
}

// "최대 N중첩" 조건부 중 항상 적용된다고 데이터화해둔 것들 — 아이템 이름이
// 아니라 문장 패턴으로 구분한다(같은 문장 구조가 다른 캐릭터의 다른 아이템에도
// 나올 수 있어서). front/src/data/damage-analysis-conditional-stacks.json의
// pattern 문자열은 아이템 롤마다 달라지는 수치 자리에 "N"을 써둔 템플릿이고,
// "최대 30중첩"처럼 그 효과 고유의 고정 스펙인 숫자는 그대로 둔다 — 이 N을
// 숫자 매칭 정규식으로 바꿔서 실제 줄과 비교한다. 공백은 "초마다"/"초 마다"처럼
// 같은 문장이라도 표기가 갈릴 수 있어 비교 전에 아예 다 없애버린다(공백 유무
// 때문에 매칭이 깨지는 걸 막기 위함 — 등록해둔 pattern 문구를 정확히 그대로
// 안 옮겨 적어도 되게).
function stripWhitespace(text) {
  return String(text || '').replace(/\s+/g, '')
}
function patternToMatcher(pattern) {
  const escaped = stripWhitespace(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/N/g, '[\\d.]+')}$`)
}
const DATAIZED_STACK_ENTRIES = (conditionalStackData?.entries || []).map((entry) => ({
  ...entry,
  matcher: patternToMatcher(entry.pattern),
}))
function findDataizedStackEntry(line) {
  const normalized = stripWhitespace(line)
  return DATAIZED_STACK_ENTRIES.find((entry) => entry.matcher.test(normalized))
}
function isDataizedConditionalLine(line) {
  return Boolean(findDataizedStackEntry(line))
}
const ADRENALINE_STACK_ENTRY = DATAIZED_STACK_ENTRIES.find((entry) =>
  String(entry.note || '').includes("각인 '아드레날린'"),
)
function dataizedStackEntryFor(line, itemName, maxStacks) {
  return (
    findDataizedStackEntry(line) ||
    (itemName === '아드레날린' && maxStacks === 6 ? ADRENALINE_STACK_ENTRY : null)
  )
}
function isDataizedConditionalSource(source) {
  return Boolean(dataizedStackEntryFor(source.context, source.itemName, source.maxStacks))
}

// 펫 특기는 등급별로 정해진 값만 선택하며, 미설정은 일반 등급(0%)이다.
function parsePetTraitPercent(raw, emptyFallback) {
  const trimmed = String(raw ?? '').trim()
  return trimmed === '' ? emptyFallback : Math.min(1, Math.max(0, Number(trimmed) || 0))
}

function PetTraitOptionButtons({ settingKey, value, onChange, label }) {
  const normalizedValue = normalizePetTraitValue(settingKey, value)
  return (
    <div className="pet-trait-option-buttons" role="group" aria-label={label}>
      {PET_TRAIT_OPTIONS[settingKey].map((option) => (
        <button
          type="button"
          className={`${option.gradeClass}${normalizedValue === option.value ? ' active' : ''}`}
          aria-pressed={normalizedValue === option.value}
          onClick={() => onChange(String(option.value))}
          key={option.value}
        >
          {option.value}%
        </button>
      ))}
    </div>
  )
}

// 계산 체인 도중 FLOOR를 걸면 다음 단계로 갈수록 오차가 누적된다 — 표시할 때만
// 반올림하는 게 아니라 소수점을 끝까지 들고 다니고, 여기서 최대 4자리까지 보여준다.
// 계산 결과는 표시 단계에서도 임의로 소수 자릿수를 잘라내지 않는다.
// Number#toString이 돌려주는 실제 계산값의 전체 자릿수를 유지하되 정수부에만
// 천 단위 구분 기호를 붙인다.
const numberText = (value) => {
  const number = Number(String(value || 0).replaceAll(',', ''))
  if (!Number.isFinite(number)) return '0'
  const text = String(number)
  if (/[eE]/.test(text)) return text
  const [integer, fraction] = text.split('.')
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction ? `${groupedInteger}.${fraction}` : groupedInteger
}

const damageResultText = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  const floored = Math.floor(number)
  if (floored === 0) return '0'
  const sign = floored < 0 ? '-' : ''
  let remaining = Math.abs(floored)
  const units = [
    ['억', 100000000],
    ['만', 10000],
    ['천', 1000],
  ]
  const parts = []
  units.forEach(([label, unit]) => {
    const amount = Math.floor(remaining / unit)
    if (amount > 0) parts.push(`${numberText(amount)}${label}`)
    remaining %= unit
  })
  if (remaining > 0) parts.push(numberText(remaining))
  return `${sign}${parts.join(' ')}`
}

const CRIT_RATE_PER_POINT = 0.03579099
const SWIFT_SPEED_PER_POINT = 0.0171791
const SWIFT_COOLDOWN_PER_POINT = 0.0214739
const FEAST_SPEED_BONUS = 5
const WEAPON_ATTACK_FEAST_BONUS = 1800
const DEFENSE_FORMULA_CONSTANT = 6500
const LUMERUS_BASE_DEFENSE = 6500
const LUMERUS_DEFENSE_REDUCTION = 0
const LUMERUS_DAMAGE_REDUCTION_MULTIPLIER = 0.8
const LUMERUS_EFFECTIVE_DEFENSE = LUMERUS_BASE_DEFENSE * (1 - LUMERUS_DEFENSE_REDUCTION / 100)
const LUMERUS_DEFENSE_MULTIPLIER =
  (DEFENSE_FORMULA_CONSTANT / (DEFENSE_FORMULA_CONSTANT + LUMERUS_EFFECTIVE_DEFENSE)) *
  LUMERUS_DAMAGE_REDUCTION_MULTIPLIER

function combatStatValue(stats, name) {
  const value = Number(String(stats?.[name] || 0).replaceAll(',', ''))
  return Number.isFinite(value) ? value : 0
}

function combatStatConversions(stats) {
  const critical = combatStatValue(stats, '치명')
  const swiftness = combatStatValue(stats, '신속')
  return {
    critical,
    swiftness,
    critRate: critical * CRIT_RATE_PER_POINT,
    attackSpeed: swiftness * SWIFT_SPEED_PER_POINT,
    moveSpeed: swiftness * SWIFT_SPEED_PER_POINT,
    cooldownReduction: swiftness * SWIFT_COOLDOWN_PER_POINT,
  }
}

function combatStatTooltipLines(stat) {
  const tooltip = Array.isArray(stat?.Tooltip) ? stat.Tooltip : [stat?.Tooltip]
  return tooltip.map((line) => cleanApiText(line || '').trim()).filter(Boolean)
}

function profileBaseAttackPower(profile) {
  const attackStat = (profile?.Stats || []).find(
    (stat) => cleanApiText(stat?.Type || '').trim() === '공격력',
  )
  for (const line of combatStatTooltipLines(attackStat)) {
    const match = line.match(/기본\s*공격력(?:은|는|이|가|:)?\s*([\d,]+(?:\.\d+)?)/)
    if (!match) continue
    const value = Number(match[1].replaceAll(',', ''))
    if (Number.isFinite(value) && value > 0) return { value, context: line }
  }
  return { value: null, context: '' }
}

function invenSkillLevelData(profile, skill) {
  const className = cleanApiText(profile?.CharacterClassName || '').trim()
  const skillName = cleanApiText(skill?.Name || '').trim()
  const skillLevel = String(Number(skill?.Level))
  const classSkills = invenSkillConstants?.jobs?.[className]
  if (classSkills?.[skillName]?.[skillLevel]) {
    return classSkills[skillName][skillLevel]
  }
  for (const skillsByName of Object.values(invenSkillConstants?.jobs || {})) {
    if (skillsByName?.[skillName]?.[skillLevel]) {
      return skillsByName[skillName][skillLevel]
    }
  }
  return null
}

function invenMotionConstants(profile, skill) {
  const constants = invenSkillLevelData(profile, skill)
  if (!constants) return []
  return constants.map((constant, index) => {
    const value = Number(constant)
    return {
      label: `${index + 1}타`,
      value: Number.isFinite(value) ? value : null,
    }
  })
}

function tooltipWithoutLine(rawTooltip, targetLine) {
  const target = normalizeForMatch(cleanApiText(targetLine || ''))
  if (!target) return rawTooltip
  try {
    const parsed = JSON.parse(rawTooltip || '{}')
    const strip = (value) => {
      if (typeof value === 'string') {
        return value
          .split(/<br\s*\/?>/i)
          .filter((segment) => {
            const text = normalizeForMatch(cleanApiText(segment).trim())
            return text && text !== target && !text.includes(target)
          })
          .join('<br>')
      }
      if (Array.isArray(value)) return value.map(strip)
      if (value && typeof value === 'object') {
        Object.keys(value).forEach((key) => {
          value[key] = strip(value[key])
        })
      }
      return value
    }
    return JSON.stringify(strip(parsed))
  } catch {
    return rawTooltip
  }
}

function profileWithoutCombatStatLine(profile, line) {
  const match = String(line || '').match(/^(치명|특화|신속)\s*\+\s*([\d,]+)/)
  if (!match) return profile
  const statName = match[1]
  const removed = Number(match[2].replaceAll(',', ''))
  const previous = (profile?.Stats || []).find((stat) => stat.Type === statName)
  const previousValue = Number(String(previous?.Value || 0).replaceAll(',', ''))
  const nextValue = Math.max(0, previousValue - removed)
  return {
    ...profile,
    Stats: (profile?.Stats || []).map((stat) => {
      if (stat.Type !== statName) return stat
      const next = { ...stat, Value: String(nextValue) }
      if (statName === '특화' && previousValue > 0) {
        next.Tooltip = (Array.isArray(stat.Tooltip) ? stat.Tooltip : [stat.Tooltip]).map(
          (tooltip) =>
            String(tooltip || '').replace(
              /((?:일반|잠식|악마)(?:화\s*시\s*)?\s*스킬(?:의)?\s*피해량(?:이|은)?\s*)([\d,.]+)(\s*%)/g,
              (_, prefix, value, suffix) =>
                `${prefix}${numberText(
                  Number(value.replaceAll(',', '')) * (nextValue / previousValue),
                )}${suffix}`,
            ),
        )
      }
      return next
    }),
  }
}

function accessoryEngineDamageScore(armory, profile, skills, skill, settings = {}) {
  if (!skill) return null
  const stats = Object.fromEntries((profile?.Stats || []).map((stat) => [stat.Type, stat.Value]))
  const combatStats = combatStatConversions(stats)
  const category = damageOptionSkillCategory(skill)
  const enabledConditionals = defaultEnabledConditionalKeys(armory)
  const petMainStat = normalizePetTraitValue('petTraitMainStat', settings.petTraitMainStat)
  const petSpeciesDamage = normalizePetTraitValue(
    'petTraitSpeciesDamage',
    settings.petTraitSpeciesDamage,
  )
  const petAdditional = normalizePetTraitValue('petTraitAdditional', settings.petTraitAdditional)
  const mainStatData = mainStatBreakdown(armory, profile, {
    potionSourceInput: settings.potionSource ?? '',
    cardBookInput: settings.cardBook ?? '',
    azenaBlessing: Boolean(settings.azenaBlessing),
    petTraitPercent: petMainStat,
  })
  const mainStat = { name: mainStatData.mainStatName, value: mainStatData.mainStatFinal }
  const weaponAttackBase = weaponAttackBreakdown(armory)
  const weaponFeast = !settings.eventFeastEnabled && Boolean(settings.weaponAttackFeastEnabled)
  const weaponAttack = weaponFeast
    ? {
        ...weaponAttackBase,
        flat: [...weaponAttackBase.flat, { kind: 'flat', value: WEAPON_ATTACK_FEAST_BONUS }],
      }
    : weaponAttackBase
  const { finalAttackPower } = finalAttackPowerChain(
    weaponAttack,
    attackPowerBreakdown(armory),
    mainStat,
    baseAttackRateBreakdown(armory).total,
    enabledConditionals,
  )
  if (!Number.isFinite(finalAttackPower)) return null

  const additional = additionalDamageBreakdown(armory)
  const additionalTotal = [
    ...additional.weapon,
    ...additional.accessory,
    ...additional.bracelet,
  ].reduce((sum, source) => sum + source.value, petAdditional)
  const moveSpeed =
    combatStats.moveSpeed +
    (settings.eventFeastEnabled || weaponFeast ? FEAST_SPEED_BONUS : 0) +
    skillMoveSpeedFacts(skills).total
  const damageGroups = [
    ...engravingDamageFacts(armory).sources.map((source) => source.value),
    arkPassiveTierDamageBreakdown(armory, '진화', skill.Name, category, skill).total,
    arkPassiveTierDamageBreakdown(armory, '깨달음', skill.Name, category, skill).total,
    petSpeciesDamage,
    cardDamageFacts(armory).total,
    raidCaptainDamageFacts(armory, moveSpeed).total,
    massIncreaseDamageFacts(armory).total,
    arkPassiveTierDamageBreakdown(armory, '도약', skill.Name, category, skill).total,
    specializationSkillDamageFacts(profile, category).total,
    ...outgoingDamageBreakdown(armory, skill.Name, category).groups.map((group) => group.total),
  ]
  const damageMultiplier = damageGroups.reduce(
    (product, percent) => product * (1 + percent / 100),
    1,
  )
  const sharedMultiplier =
    (1 + additionalTotal / 100) *
    damageMultiplier *
    (1 + receivedDamageFacts(skills).total / 100) *
    LUMERUS_DEFENSE_MULTIPLIER

  const baseAttack = profileBaseAttackPower(profile)
  const constants = invenMotionConstants(profile, skill)
  const skillBaseDamage = skillMotionHits(skill).reduce((sum, motion) => {
    const constant = constants[motion.order - 1]?.value
    const coefficient =
      Number.isFinite(baseAttack.value) &&
      baseAttack.value > 0 &&
      Number.isFinite(constant) &&
      Number.isFinite(motion.apiDamage)
        ? (motion.apiDamage - constant) / baseAttack.value
        : null
    return Number.isFinite(coefficient)
      ? sum + (finalAttackPower * coefficient + constant) * motion.repeat
      : sum
  }, 0)
  const critMultiplier =
    (2 + critDamageBreakdown(armory).bonusTotal / 100) *
    (1 + critHitBraceletFacts(armory).total / 100)
  const critProbability = Math.min(
    1,
    Math.max(0, critRateFacts(armory, combatStats.critical, category).total / 100),
  )
  const keenPenalty = keenBluntPenaltyFacts(armory)
  const expectedPenalty = keenPenalty.active
    ? 1 - keenPenalty.rate / 100 + (keenPenalty.rate / 100) * keenPenalty.multiplier
    : 1
  return (
    (skillBaseDamage > 0 ? skillBaseDamage : finalAttackPower) *
    sharedMultiplier *
    (1 + critProbability * (critMultiplier - 1)) *
    expectedPenalty
  )
}

export function calculateAccessoryOptionShares({ armory, profile, skills, skillName, siblings }) {
  const skill = (skills || []).find((item) => item.Name === skillName) || skills?.[0]
  const characterName = profile?.CharacterName || ''
  const settings = characterName
    ? getDamageAnalysisSettingsFor(
        characterName,
        expeditionKeyFromSiblings(siblings, characterName),
      ) || {}
    : {}
  const baseline = accessoryEngineDamageScore(armory, profile, skills, skill, settings)
  if (!Number.isFinite(baseline) || baseline <= 0) return []
  const accessoryTypes = new Set(['목걸이', '귀걸이', '반지', '팔찌'])
  const typeCounts = new Map()
  return (armory?.ArmoryEquipment || []).flatMap((item, equipmentIndex) => {
    if (!accessoryTypes.has(item.Type)) return []
    const slotIndex = typeCounts.get(item.Type) || 0
    typeCounts.set(item.Type, slotIndex + 1)
    const lines = [
      ...new Set(rawLinesForItem(item.Type === '팔찌' ? 'bracelet' : 'accessory', item)),
    ]
    return lines.flatMap((line) => {
      const modifiedArmory = {
        ...armory,
        ArmoryEquipment: (armory.ArmoryEquipment || []).map((equipment, index) =>
          index === equipmentIndex
            ? { ...equipment, Tooltip: tooltipWithoutLine(equipment.Tooltip, line) }
            : equipment,
        ),
      }
      const without = accessoryEngineDamageScore(
        modifiedArmory,
        profileWithoutCombatStatLine(profile, line),
        skills,
        skill,
        settings,
      )
      if (!Number.isFinite(without) || Math.abs(baseline - without) < 1e-9) return []
      return [
        {
          type: item.Type,
          slotIndex,
          equipmentIndex,
          itemName: item.Name,
          line,
          share: ((baseline - without) / baseline) * 100,
          damageIncrease: (baseline / without - 1) * 100,
        },
      ]
    })
  })
}

function syntheticAccessoryTooltip(lines, quality = 100, itemType = '') {
  if (itemType === '팔찌') {
    return JSON.stringify({
      Element_000: {
        type: 'ItemPartBox',
        value: {
          Element_000: '팔찌 효과',
          Element_001: lines.join('<br>'),
        },
      },
    })
  }
  const mainStatLines = lines.filter((line) => /^(힘|민첩|지능)\s*\+/.test(line))
  const refineLines = lines.filter((line) => !mainStatLines.includes(line))
  return JSON.stringify({
    Element_000: {
      type: 'ItemTitle',
      value: { qualityValue: Number(quality) || 0 },
    },
    Element_001: {
      type: 'ItemPartBox',
      value: {
        Element_000: '기본 효과',
        Element_001: mainStatLines.join('<br>'),
      },
    },
    Element_002: {
      type: 'ItemPartBox',
      value: {
        Element_000: '연마 효과',
        Element_001: refineLines.join('<br>'),
      },
    },
  })
}

export function calculateAccessoryReplacement({
  armory,
  profile,
  skills,
  skillName,
  siblings,
  equipmentIndex,
  grade,
  quality,
  lines = [],
}) {
  const skill = (skills || []).find((item) => item.Name === skillName) || skills?.[0]
  if (!skill || equipmentIndex == null) return { total: null, options: [] }
  const characterName = profile?.CharacterName || ''
  const settings = characterName
    ? getDamageAnalysisSettingsFor(
        characterName,
        expeditionKeyFromSiblings(siblings, characterName),
      ) || {}
    : {}
  const baseline = accessoryEngineDamageScore(armory, profile, skills, skill, settings)
  const targetItem = armory?.ArmoryEquipment?.[equipmentIndex]
  const combatStatsFromLines = (sourceLines) => {
    const result = {}
    sourceLines.forEach((line) => {
      const match = cleanApiText(line).match(
        /(치명|특화|신속)(?:\s*\+?\s*|\s*이\s+)([\d,]+)(?:\s*증가)?/,
      )
      if (!match) return
      result[match[1]] = (result[match[1]] || 0) + Number(match[2].replaceAll(',', ''))
    })
    return result
  }
  const currentBraceletStats =
    targetItem?.Type === '팔찌'
      ? combatStatsFromLines(baseEffectRawLines(targetItem.Tooltip))
      : {}
  const buildProfile = (nextLines) => {
    if (targetItem?.Type !== '팔찌') return profile
    const nextBraceletStats = combatStatsFromLines(nextLines)
    return {
      ...profile,
      Stats: (profile?.Stats || []).map((stat) => {
        const statName = cleanApiText(stat.Type || '')
        if (!['치명', '특화', '신속'].includes(statName)) return stat
        const currentValue = Number(String(stat.Value || 0).replaceAll(',', '')) || 0
        const adjustedValue =
          currentValue +
          (nextBraceletStats[statName] || 0) -
          (currentBraceletStats[statName] || 0)
        return { ...stat, Value: String(Math.max(adjustedValue, 0)) }
      }),
    }
  }
  const buildArmory = (nextLines) => ({
    ...armory,
    ArmoryEquipment: (armory?.ArmoryEquipment || []).map((item, index) =>
      index === equipmentIndex
        ? {
            ...item,
            Grade: grade || item.Grade,
            Tooltip: syntheticAccessoryTooltip(nextLines, quality, item.Type),
          }
        : item,
    ),
  })
  const candidateArmory = buildArmory(lines)
  const candidate = accessoryEngineDamageScore(
    candidateArmory,
    buildProfile(lines),
    skills,
    skill,
    settings,
  )
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return { total: null, options: [] }
  }
  const options = lines.flatMap((line, index) => {
    const without = accessoryEngineDamageScore(
      buildArmory(lines.filter((_, lineIndex) => lineIndex !== index)),
      buildProfile(lines.filter((_, lineIndex) => lineIndex !== index)),
      skills,
      skill,
      settings,
    )
    if (!Number.isFinite(without) || Math.abs(candidate - without) < 1e-9) return []
    return [
      {
        line,
        share: ((candidate - without) / candidate) * 100,
        damageIncrease: (candidate / without - 1) * 100,
      },
    ]
  })
  return {
    total: Number.isFinite(baseline) && baseline > 0 ? (candidate / baseline - 1) * 100 : null,
    options,
  }
}

// 특화 수치에 별도 계수를 곱하지 않는다. API의 "기본 및 전투 특성" 툴팁에
// 직업별로 이미 계산되어 들어온 스킬 피해 증가율을 그대로 읽고, 피해 대상 분류와
// 현재 선택한 스킬의 [일반/잠식/악마 스킬] 분류가 일치할 때만 반영한다.
function specializationSkillDamageFacts(profile, skillCategory) {
  const stat = (profile?.Stats || []).find(
    (item) => cleanApiText(item?.Type || '').trim() === '특화',
  )
  const specialization = combatStatValue({ 특화: stat?.Value }, '특화')
  const tooltipLines = combatStatTooltipLines(stat)
  const effects = []
  ;['일반', '잠식', '악마'].forEach((category) => {
    const pattern = new RegExp(
      `${category}(?:화\\s*시\\s*)?\\s*스킬(?:의)?\\s*피해량(?:이|은)?\\s*([\\d,.]+)\\s*%\\s*증가`,
    )
    tooltipLines.forEach((line) => {
      const match = line.match(pattern)
      if (!match) return
      const value = Number(match[1].replaceAll(',', ''))
      if (Number.isFinite(value)) effects.push({ category, value, context: line })
    })
  })

  const applicableEffects = effects.filter((effect) => effect.category === skillCategory)
  const targetCategories = new Set(effects.map((effect) => effect.category))
  const targetLabel = [...targetCategories].map((category) => `${category} 스킬`).join('·')
  const total = applicableEffects.reduce((sum, effect) => sum + effect.value, 0)

  return {
    specialization,
    targetCategories,
    targetLabel,
    total,
    sources: applicableEffects.map((effect) => ({
      value: effect.value,
      itemType: '전투 특성',
      itemName: `특화 · ${effect.category} 스킬`,
      heading: '기본 및 전투 특성',
      context: effect.context,
    })),
  }
}

// ArkPassiveEffects/Effects는 API가 현재 적용 중인 각인 효과만 내려주는 목록이다.
// ArkPassiveEffects의 Level은 각인 활성 여부가 아니어서 0이어도 효과가 적용될 수
// 있으므로 Level > 0으로 다시 거르지 않는다.
function activeEngravings(armory) {
  const effects =
    armory?.ArmoryEngraving?.ArkPassiveEffects || armory?.ArmoryEngraving?.Effects || []
  return effects.filter((engraving) => engraving?.Name && engraving?.Description)
}

const KEEN_BLUNT_PENALTY_RATE = 10

function keenBluntPenaltyFacts(armory) {
  const engraving = activeEngravings(armory).find(
    (item) => stripWhitespace(item.Name) === '예리한둔기',
  )
  if (!engraving) {
    return {
      active: false,
      rate: 0,
      reduction: 0,
      multiplier: 1,
      description: '',
    }
  }
  const description = cleanApiText(engraving.Description || '')
  const reduction = Number(description.match(/([\d.]+)\s*%\s*감소된\s*피해/)?.[1])
  const appliedReduction = Number.isFinite(reduction) ? reduction : 20
  return {
    active: true,
    rate: KEEN_BLUNT_PENALTY_RATE,
    reduction: appliedReduction,
    multiplier: 1 - appliedReduction / 100,
    description,
  }
}

// 전투 조건부(중첩·버프 등) 출처는 상시 적용이 아니라서 기본은 계산에서 빼고,
// 사용자가 "마을 기준 최종 공격력" 계산식 모달에서 하나씩 체크박스로 켜면 그때만
// 합산에 포함시킨다. 배열 순서는 같은 armory/스킬 데이터에서는 항상 동일해서
// prefix+index+내용으로 만든 키가 리렌더 사이에도 안정적으로 같은 항목을 가리킨다.
const conditionalSourceKey = (prefix, source, index) =>
  `${prefix}|${index}|${source.itemName}|${source.heading}|${source.value}`

function conditionalTotals(list, enabledKeys, prefix) {
  let flat = 0
  let percent = 0
  list.forEach((source, index) => {
    if (!enabledKeys.has(conditionalSourceKey(prefix, source, index))) return
    if (source.percent) percent += source.value
    else flat += source.value
  })
  return { flat, percent }
}

// 항상 비어 있는 조건부 키 집합 — "마을 기준 최종 공격력"은 사용자가 무엇을
// 체크했든 상관없이 전투 조건부를 전부 제외한 값으로 고정해야 해서, 계산식
// 상세(모달/ATTACK_POWER_FINAL 행)와 같은 finalAttackPowerChain 함수를 이 빈
// 집합으로 한 번 더 돌려 별도로 구한다.
const EMPTY_CONDITIONAL_KEYS = new Set()

// 주스탯 → 무기 공격력 → 기본 공격력 → 최종 공격력 전체 사슬을 한 번에 계산한다.
// enabledConditionalKeys에 무엇이 들어있는지에 따라 "마을 기준"(빈 집합)과
// "조건부 반영"(실제 체크 상태) 두 가지를 같은 공식으로 구해서 서로 어긋나지
// 않게 한다.
function finalAttackPowerChain(
  weaponAttack,
  attackPower,
  mainStat,
  baseAttackRateTotal,
  enabledConditionalKeys,
  baseAttackFlatTotal = 0,
) {
  const weaponBaseTotal = weaponAttack.base.reduce((sum, source) => sum + source.value, 0)
  const weaponFlatTotal = weaponAttack.flat.reduce((sum, source) => sum + source.value, 0)
  const weaponPercentTotal = weaponAttack.percent.reduce((sum, source) => sum + source.value, 0)
  const weaponConditional = conditionalTotals(
    weaponAttack.conditional,
    enabledConditionalKeys,
    'weapon',
  )
  const weaponAttackTotal = weaponAttack.base.length
    ? (weaponBaseTotal + weaponFlatTotal + weaponConditional.flat) *
      (1 + (weaponPercentTotal + weaponConditional.percent) / 100)
    : null
  const pureAttackPower =
    weaponAttackTotal != null && mainStat.value
      ? Math.sqrt((mainStat.value * weaponAttackTotal) / 6)
      : null
  const finalBaseAttack =
    pureAttackPower != null
      ? (pureAttackPower + baseAttackFlatTotal) * (1 + baseAttackRateTotal / 100)
      : null

  const flatAtkTotal = attackPower.flat.reduce((sum, source) => sum + source.value, 0)
  const atkRatePercentTotal = attackPower.percent.reduce((sum, source) => sum + source.value, 0)
  const attackConditional = conditionalTotals(
    attackPower.conditional,
    enabledConditionalKeys,
    'attack',
  )
  const finalAttackPower =
    finalBaseAttack != null
      ? (finalBaseAttack + flatAtkTotal + attackConditional.flat) *
        (1 + (atkRatePercentTotal + attackConditional.percent) / 100)
      : null

  return { weaponAttackTotal, pureAttackPower, finalBaseAttack, finalAttackPower }
}

function selectedTripods(skill) {
  return (skill?.Tripods || []).filter((tripod) => tripod.IsSelected)
}

// 선택된 트라이포드의 "대상이 자신 및 파티원에게 받는 피해가 N% 증가" 문구는
// 캐릭터가 받는 피해가 아니라 공격 대상에게 거는 피해 증폭 디버프다. 지속시간
// 수치(예: 8.0초)를 증가율로 잘못 읽지 않도록 "받는 피해" 뒤에서 % 수치를 찾는다.
const TARGET_RECEIVED_DAMAGE_PATTERN =
  /대상(?:이|은|는)?[^|%]*?받는\s*피해(?:량)?(?:이|가|는)?[^|%]*?([\d.]+)\s*%\s*증가/g

function receivedDamageFacts(skills) {
  const sources = []
  const seen = new Set()
  ;(skills || []).forEach((skill) => {
    selectedTripods(skill).forEach((tripod) => {
      const text = cleanApiText(tripod.Tooltip || '')
      for (const match of text.matchAll(TARGET_RECEIVED_DAMAGE_PATTERN)) {
        const value = Number(match[1])
        if (!Number.isFinite(value)) continue
        // 같은 시너지 문구를 여러 스킬이 공유해도 동일 효과가 중복 합산되지 않게 한다.
        const key = `${stripWhitespace(tripod.Name || match[0])}|${value}`
        if (seen.has(key)) continue
        seen.add(key)
        sources.push({
          value,
          itemType: '스킬 트라이포드',
          itemName: skill.Name,
          heading: tripod.Name || '피해 증폭',
          context: text,
        })
      }
    })
  })
  return {
    sources,
    total: sources.reduce((sum, source) => sum + source.value, 0),
  }
}

// 장착 스킬의 선택 트라이포드에 "스킬 시전 시 자신의 이동속도가 N% 증가"가
// 있으면 해당 버프를 유지한 전투 상황으로 계산한다. 파티원에게 주는 시너지는
// 아니지만, 다른 스킬을 사용할 때도 지속시간 동안 유지되므로 모든 스킬 분석의
// 이동속도와 돌격대장 계산에 포함한다.
const SELF_MOVE_SPEED_PATTERN =
  /스킬\s*시전\s*시[^|]*?자신(?:의)?\s*이동\s*속도(?:가|는)?\s*([\d,]+(?:\.\d+)?)\s*%\s*증가/g

function skillMoveSpeedFacts(skills) {
  const sources = []
  const seen = new Set()
  ;(skills || []).forEach((skill) => {
    selectedTripods(skill).forEach((tripod) => {
      const text = cleanApiText(tripod.Tooltip || '')
      for (const match of text.matchAll(SELF_MOVE_SPEED_PATTERN)) {
        const value = Number(match[1].replaceAll(',', ''))
        if (!Number.isFinite(value)) continue
        const key = `${skill.Name}|${tripod.Name}|${value}|${text}`
        if (seen.has(key)) continue
        seen.add(key)
        sources.push({
          value,
          itemType: '스킬 트라이포드',
          itemName: skill.Name,
          heading: tripod.Name || '이동속도 증가',
          context: text,
        })
      }
    })
  })
  return {
    sources,
    total: sources.reduce((sum, source) => sum + source.value, 0),
  }
}

// 현재 장착 스킬의 선택된 트라이포드 중 파티 시너지·대상 디버프에 해당하는
// 문구를 모은다. 스킬 Tooltip에는 선택 트라이포드 데이터도 통째로 중첩되어
// 있으므로 "스킬 기본 효과"로 다시 스캔하지 않는다. 같은 이름·같은 수치의
// 시너지를 여러 스킬이 가지고 있으면 효과 하나로 묶고 적용 가능한 스킬만
// 함께 나열한다.
function skillSynergyEffects(skills) {
  const results = []
  const grouped = new Map()
  const classify = (line) => {
    const effects = []
    const addMatch = (category, pattern) => {
      const match = line.match(pattern)
      if (!match) return
      const percent = Number(match[1].replaceAll(',', ''))
      effects.push({ category, percent: Number.isFinite(percent) ? percent : null })
    }
    // 각 효과명 뒤에 실제로 붙은 %를 직접 캡처한다. 문장 앞에 실드 게이지
    // 1,100% 같은 다른 수치가 있어도 받는 피해 4%와 섞이지 않는다.
    addMatch(
      '받는 피해 증가',
      /(?:대상|적)[^|]*?받는\s*피해(?:량)?(?:를|이|가|는)?[^|%]*?([\d,]+(?:\.\d+)?)\s*%\s*증가/,
    )
    addMatch(
      '방어력 감소',
      /(?:대상|적)[^|]*?방어력(?:을|를|이|가|은|는)?[^|%]*?([\d,]+(?:\.\d+)?)\s*%\s*감소/,
    )
    addMatch(
      '치명타 저항 감소',
      /(?:대상|적)[^|]*?치명타\s*저항률?(?:을|를|이|가|은|는)?[^|%]*?([\d,]+(?:\.\d+)?)\s*%\s*감소/,
    )
    addMatch(
      '파티 피해 증가',
      /(?:자신\s*및\s*파티원|자신과\s*파티원|파티원)[^|]*?(?:주는\s*피해|피해량)[^|%]*?([\d,]+(?:\.\d+)?)\s*%\s*증가/,
    )
    addMatch(
      '파티 공격력 증가',
      /(?:자신\s*및\s*파티원|자신과\s*파티원|파티원)[^|]*?공격력[^|%]*?([\d,]+(?:\.\d+)?)\s*%\s*증가/,
    )
    addMatch(
      '파티 치명타 적중률 증가',
      /(?:자신\s*및\s*파티원|자신과\s*파티원|파티원)[^|]*?치명타\s*적중률[^|%]*?([\d,]+(?:\.\d+)?)\s*%\s*증가/,
    )
    addMatch(
      '자신 이동속도 증가',
      /스킬\s*시전\s*시[^|]*?자신(?:의)?\s*이동\s*속도(?:가|는)?\s*([\d,]+(?:\.\d+)?)\s*%\s*증가/,
    )
    return effects
  }

  const addCandidate = (skill, sourceName, rawText) => {
    const text = cleanApiText(rawText || '')
    text
      .split('|')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        classify(line).forEach(({ category, percent }) => {
          const key = `${category}|${stripWhitespace(sourceName)}|${
            Number.isFinite(percent) ? percent : stripWhitespace(line)
          }`
          if (!grouped.has(key)) {
            const effect = {
              category,
              percent: Number.isFinite(percent) ? percent : null,
              skillIcon: skill.Icon,
              sourceName,
              skills: [],
            }
            grouped.set(key, effect)
            results.push(effect)
          }
          const effect = grouped.get(key)
          if (!effect.skills.some((entry) => entry.skillName === skill.Name)) {
            effect.skills.push({ skillName: skill.Name, line })
          }
        })
      })
  }

  ;(skills || []).forEach((skill) => {
    selectedTripods(skill).forEach((tripod) => {
      addCandidate(skill, tripod.Name || '선택 트라이포드', tripod.Tooltip)
    })
  })
  return results
}

function cooldownSeconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const text = cleanApiText(value || '').trim()
  if (!text) return null

  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric

  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*분/)
  const secondMatch = text.match(/(\d+(?:\.\d+)?)\s*초/)
  if (!minuteMatch && !secondMatch) return null

  const minutes = Number(minuteMatch?.[1] || 0)
  const seconds = Number(secondMatch?.[1] || 0)
  const total = minutes * 60 + seconds
  return Number.isFinite(total) ? total : null
}

function tooltipFacts(skill) {
  const text = cleanApiText(skill?.Tooltip || '')
    .replace(/\s+/g, ' ')
    .trim()
  const cooldownText =
    text.match(
      /재사용\s*대기시간\s*:?\s*((?:\d+(?:\.\d+)?\s*분\s*)?(?:\d+(?:\.\d+)?\s*초)?)/i,
    )?.[1] ||
    text.match(
      /쿨타임\s*:?\s*((?:\d+(?:\.\d+)?\s*분\s*)?(?:\d+(?:\.\d+)?\s*초)?)/i,
    )?.[1]
  const cooldown = cooldownSeconds(skill?.Cooldown) ?? cooldownSeconds(cooldownText)
  const attackTypes = ['헤드 어택', '백 어택', '카운터', '부위 파괴', '무력화'].filter((type) =>
    text.includes(type),
  )
  const displayedDamages = [
    ...new Set([...text.matchAll(/([\d,]+(?:\.\d+)?)의\s*피해/g)].map((match) => match[1])),
  ].slice(0, 6)
  return { text, cooldown, attackTypes, displayedDamages }
}

function currentSkillDamageDescription(skill) {
  try {
    const parsed = JSON.parse(skill?.Tooltip || '{}')
    for (const element of Object.values(parsed)) {
      if (
        element?.type === 'SingleTextBox' &&
        typeof element.value === 'string' &&
        /[\d,]+(?:\.\d+)?\s*(?:의\s*)?피해/.test(cleanApiText(element.value))
      ) {
        return cleanApiText(element.value)
          .split(/부위\s*파괴|무력화|공격\s*타입|슈퍼아머/)[0]
          .trim()
      }
    }
  } catch {
    // 구조화된 툴팁이 아니면 아래 정리된 전체 텍스트를 사용한다.
  }
  return cleanApiText(skill?.Tooltip || '')
}

function skillMotionHits(skill) {
  const description = currentSkillDamageDescription(skill)
  const matches = [...description.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:의\s*)?피해/g)]
  let motions = matches.map((match, index) => {
    const nextIndex = matches[index + 1]?.index ?? description.length
    const clause = description.slice(match.index, nextIndex)
    const repeat = Number(clause.match(/피해(?:를|을)?\s*(\d+)\s*회/)?.[1]) || 1
    return {
      key: `motion-${index + 1}`,
      order: index + 1,
      repeat,
      apiDamage: Number(match[1].replaceAll(',', '')),
      context: clause.replace(/\s+/g, ' ').trim(),
    }
  })

  const tripodText = selectedTripods(skill)
    .map((tripod) => cleanApiText(tripod.Tooltip || ''))
    .join(' | ')
  if (/마지막\s*공격을?\s*(?:가하지|하지)\s*않/.test(tripodText) && motions.length > 1) {
    motions = motions.slice(0, -1)
  }
  if (!motions.length) {
    motions = [
      {
        key: 'motion-1',
        order: 1,
        repeat: 1,
        apiDamage: null,
        context: '피해 구간 자동 감지 실패',
      },
    ]
  }
  return motions.map((motion, index) => ({ ...motion, order: index + 1 }))
}

function gemFacts(armory, skillName) {
  const effects = armory.ArmoryGem?.Effects?.Skills || []
  return effects
    .filter((effect) => effect.Name === skillName)
    .map((effect) => ({
      slot: effect.GemSlot,
      text: cleanApiText(
        Array.isArray(effect.Description) ? effect.Description.join(' ') : effect.Description || '',
      ),
      option: cleanApiText(effect.Option || ''),
    }))
}

function tooltipSections(raw = '') {
  try {
    const parsed = JSON.parse(raw)
    const sections = []
    const flatten = (value) => {
      if (typeof value === 'string') return cleanApiText(value.replace(/<br\s*\/?>/gi, ' | '))
      if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(' ')
      if (value && typeof value === 'object')
        return Object.values(value).map(flatten).filter(Boolean).join(' ')
      return ''
    }
    const walk = (value) => {
      if (!value || typeof value !== 'object') return
      const heading = typeof value.Element_000 === 'string' ? cleanApiText(value.Element_000) : ''
      const text = flatten(value.Element_001)
      if (heading && text) sections.push({ heading, text })
      Object.values(value).forEach(walk)
    }
    walk(parsed)
    if (sections.length) return sections
    return [{ heading: '전체 툴팁', text: flatten(parsed) }]
  } catch {
    return [{ heading: '전체 툴팁', text: cleanApiText(raw) }]
  }
}

// profile.Stats never includes 힘/민첩/지능 — the only place they appear is each
// equipped item's "기본 효과" ItemPartBox, e.g. "힘 +15446<BR>민첩 +15446<BR>
// 지능 +15446<BR>체력 +3789". Two of the three stats are always greyed out
// (COLOR='#686660') as "doesn't apply to your class" placeholders; only the
// un-greyed one is this character's real main stat, so it must be read from
// the RAW (uncleaned) HTML — tooltipSections already strips the FONT tags
// that mark which stat is greyed.
function baseEffectRawLines(raw = '') {
  try {
    const parsed = JSON.parse(raw)
    const lines = []
    const walk = (value) => {
      if (!value || typeof value !== 'object') return
      const heading = typeof value.Element_000 === 'string' ? cleanApiText(value.Element_000) : ''
      // 팔찌는 힘/민첩/지능이 "기본 효과"가 아니라 "팔찌 효과" 아래에 나온다
      // (예: " 민첩 +14500 치명 +70 ..."), 이것도 같이 잡아야 한다.
      if (
        (heading === '기본 효과' || heading === '팔찌 효과') &&
        typeof value.Element_001 === 'string'
      ) {
        lines.push(...value.Element_001.split(/<br\s*\/?>/i))
      }
      Object.values(value).forEach(walk)
    }
    walk(parsed)
    return lines
  } catch {
    return []
  }
}

// tooltipSections는 Element_000/Element_001 형태의 구간만 잡아내는데, 어빌리티
// 스톤의 "레벨 보너스" 같은 항목은 IndentStringGroup(topStr/contentStr) 구조라
// 그 방식으로는 안 잡힌다. 기본 공격력 증가 배율은 문구가 어디 박혀 있든 다
// 긁어와야 하므로, 구조에 상관없이 모든 문자열 리프를 펼치는 범용 플래튼을
// 따로 둔다.
function flattenTooltipStrings(raw = '') {
  try {
    const strings = []
    const walk = (value) => {
      if (typeof value === 'string') strings.push(cleanApiText(value))
      else if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(JSON.parse(raw))
    return strings.join(' | ')
  } catch {
    return cleanApiText(raw)
  }
}

// 아크패시브 노드는 장비 아이템과 달리 Element_000이 문자열이 아니라
// NameTagBox 객체({type,value})이고, 실제 효과 설명은 Element_002
// (MultiTextBox)에 있다. tooltipSections는 "Element_000이 문자열인 경우만
// heading으로 인정"하는 방식이라 이 구조에서는 항상 빈 배열을 돌려준다 —
// 노드 이름과 효과 설명 텍스트를 직접 뽑는 전용 파서가 필요하다.
function arkPassiveNodeText(effect) {
  try {
    const parsed = JSON.parse(effect?.ToolTip || '')
    const nodeName =
      typeof parsed?.Element_000?.value === 'string'
        ? cleanApiText(parsed.Element_000.value)
        : effect?.Name || ''
    const rawText = typeof parsed?.Element_002?.value === 'string' ? parsed.Element_002.value : ''
    return { nodeName, text: cleanApiText(rawText.replace(/<br\s*\/?>/gi, ' | ')) }
  } catch {
    return { nodeName: effect?.Name || '', text: '' }
  }
}

function arkPassiveKarmaFacts(armory) {
  const result = {}
  ;(armory?.ArkPassive?.Points || []).forEach((point) => {
    const name = cleanApiText(point?.Name || '').trim()
    if (!['진화', '깨달음', '도약'].includes(name)) return
    const bonus = parseKarmaDescription(cleanApiText(point?.Description || ''))
    if (!bonus) return
    result[name] = {
      ...bonus,
      point: Number(point.Value) || 0,
      description: cleanApiText(point.Description || ''),
    }
  })
  return result
}

function isHyperAwakeningUltimate(skill) {
  if (Number(skill?.SkillType) === 101) return true
  if (skill?.SkillType != null) return false
  return /\[\s*초각성기\s*\]/.test(cleanApiText(skill?.Tooltip || ''))
}

const SUPPORT_ARK_PASSIVE_NAMES = ['절실한 구원', '축복의 오라', '만개', '빛의 기사']

function isSupportArkPassiveBuild(armory) {
  return (armory?.ArkPassive?.Effects || [])
    .filter((effect) => String(effect?.Name || '').includes('깨달음'))
    .some((effect) => {
      const text = [
        effect?.Name,
        effect?.Description,
        effect?.ToolTip,
        effect?.Tooltip,
      ]
        .filter(Boolean)
        .join(' ')
      return SUPPORT_ARK_PASSIVE_NAMES.some((name) => text.includes(name))
    })
}

// 아크패시브 노드 문구는 "6초 동안"/"최대 N중첩"류(전투 버프) 외에도
// "OO 상태에서"/"OO 단계에서"/"초각성 스킬이"/"사용 시"처럼 상시 적용이
// 아닌 조건부 문구가 흔해서, 장비 쪽에서 쓰던 ATTACK_POWER_CONDITIONAL보다
// 넓은 조건부 키워드 세트를 따로 둔다.
const ARK_PASSIVE_CONDITIONAL =
  /상태에서|단계|초각성|사용\s*시|발동\s*시|효과를?\s*보유|활성화|시전\s*중|중첩|동안|확률|변신|스택|조건/

// 기본 공격력 증가 배율의 출처는 두 갈래다: (1) 장비·아크패시브·아크그리드
// 툴팁에 개별 문구로 박혀 있는 "기본 공격력 +N%" — 위 범용 플래튼으로 스캔.
// (2) 보석 — 이건 Open API가 이미 "기본 공격력 총합 : N%"으로 전체 젬의
// 합산치를 따로 계산해서 주므로, 젬 하나하나의 Option 줄을 또 더하면 이중
// 합산이 된다. 그래서 보석은 그 총합 필드 하나만 쓴다.
function baseAttackRateBreakdown(armory) {
  const sources = []
  const seen = new Set()
  const pattern = /기본\s*공격력(?:이|가)?\s*([+-]?)\s*([\d.]+)\s*%/g

  const scan = (sourceKey, itemType, itemName, raw) => {
    const text = flattenTooltipStrings(raw)
    for (const line of text.split('|').map((part) => part.trim())) {
      if (isExcludedDamageAnalysisLine(line)) continue
      for (const match of line.matchAll(pattern)) {
        const number = Number(match[2])
        if (!Number.isFinite(number)) continue
        const value = match[1] === '-' ? -number : number
        const key = `${sourceKey}|${value}`
        if (seen.has(key)) continue
        seen.add(key)
        sources.push({ value, itemType, itemName, context: line })
      }
    }
  }

  ;(armory?.ArmoryEquipment || []).forEach((item, index) => {
    scan(`equip-${index}`, item.Type || '장비', item.Name || item.Type, item.Tooltip)
  })
  ;(armory?.ArkPassive?.Effects || []).forEach((effect, index) => {
    const { nodeName } = arkPassiveNodeText(effect)
    scan(
      `arkpassive-${index}`,
      `아크 패시브 ${effect.Name}`,
      nodeName || effect.Name,
      effect.ToolTip,
    )
  })
  ;(armory?.ArkGrid?.Slots || []).forEach((slot, index) => {
    arkGridActiveCoreSegments(slot).forEach((segment, segmentIndex) => {
      scan(`arkgrid-${index}-${segmentIndex}`, '아크그리드', slot.Name, segment)
    })
    ;(slot.Gems || []).forEach((gem, gemIndex) => {
      scan(`arkgrid-${index}-gem-${gemIndex}`, '아크그리드 젬', slot.Name, gem.Tooltip)
    })
  })

  const gemTotalMatch = cleanApiText(armory?.ArmoryGem?.Effects?.Description || '').match(
    /기본\s*공격력\s*총합\s*:?\s*([\d.]+)\s*%/,
  )
  if (gemTotalMatch) {
    sources.push({
      value: Number(gemTotalMatch[1]),
      itemType: '보석',
      itemName: '기본 공격력 총합 (전체 젬 합산)',
    })
  }

  const total = sources.reduce((sum, source) => sum + source.value, 0)
  return { sources, total }
}

// '공격력' 고정 증가(FLAT_ATK)·퍼센트 증가(ATK_RATE) 후보를 장비·각인·아크
// 패시브·아크그리드에서 전부 긁어온다. "무기 공격력"/"기본 공격력"(이미 다른
// 변수)과 "아군 공격력"·"파티원의 공격력"(서포터가 남에게 주는 버프, 이 캐릭터
// 자신의 스탯이 아님)은 전부 제외해야 한다.
const ATTACK_POWER_EXCLUDE = /무기\s*공격력|기본\s*공격력|아군\s*공격력|파티원/
const ATTACK_POWER_CONDITIONAL = /적중|중첩|동안|전투 중|확률|버프|효과 획득|조건|변신|스택/
const ATTACK_POWER_PATTERN =
  /공격력(?:이|가)?\s*(?:증가(?:량)?\s*)?([+-]?)\s*([\d,]+(?:\.\d+)?)\s*(%?)/g

function attackPowerBreakdown(armory) {
  const sources = []
  const seen = new Set()

  const scanSource = (sourceKey, itemType, itemName, heading, text) => {
    for (const line of text.split('|').map((part) => part.trim())) {
      if (isExcludedDamageAnalysisLine(line)) continue
      if (ATTACK_POWER_EXCLUDE.test(line)) continue
      for (const match of line.matchAll(ATTACK_POWER_PATTERN)) {
        const number = Number(match[2].replaceAll(',', ''))
        if (!Number.isFinite(number)) continue
        const rawValue = match[1] === '-' ? -number : number
        const percent = match[3] === '%'
        const conditional = ATTACK_POWER_CONDITIONAL.test(line)
        const maxStacksMatch = conditional ? line.match(/최대\s*(\d+)\s*중첩/) : null
        const maxStacks = maxStacksMatch ? Number(maxStacksMatch[1]) : null
        const appliedStacks = maxStacks
          ? Math.min(
              dataizedStackEntryFor(line, itemName, maxStacks)?.appliedStacks ??
                DEFAULT_STACK_ASSUMPTION,
              maxStacks,
            )
          : null
        const value = maxStacks ? rawValue * appliedStacks : rawValue
        const key = [sourceKey, heading, value, percent].join('|')
        if (seen.has(key)) continue
        seen.add(key)
        sources.push({
          kind: conditional ? 'conditional' : percent ? 'percent' : 'flat',
          value,
          percent,
          itemType: itemType || '장비',
          itemName: itemName || itemType || '장비',
          heading,
          context: line,
          maxStacks,
          appliedStacks,
          perStackValue: maxStacks ? rawValue : null,
        })
      }
    }
  }

  ;(armory?.ArmoryEquipment || []).forEach((item, index) => {
    tooltipSections(item.Tooltip).forEach(({ heading, text }) =>
      scanSource(`equip-${index}`, item.Type, item.Name, heading, text),
    )
  })
  const engravings = activeEngravings(armory)
  engravings.forEach((engraving, index) => {
    const text = cleanApiText(engraving.Description || '').replace(/<br\s*\/?>/gi, ' | ')
    scanSource(`engrave-${index}`, '각인', engraving.Name, '각인 효과', text)
  })
  ;(armory?.ArkPassive?.Effects || []).forEach((effect, index) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    scanSource(
      `arkpassive-${index}`,
      `아크 패시브 ${effect.Name}`,
      nodeName || effect.Name,
      '효과',
      text,
    )
  })

  // 아크그리드 코어 옵션은 [10P]/[14P]/[17P]... 포인트 구간별 문구라, 툴팁에
  // 표시된 현재 보유 포인트 이하 구간만 반영한다 — 아닌 구간까지 다 더하면
  // 아직 발동하지도 않은 미래 구간 보너스까지 합산돼 버린다.
  ;(armory?.ArkGrid?.Slots || []).forEach((slot, slotIndex) => {
    arkGridActiveCoreSegments(slot).forEach((segment, segmentIndex) => {
      scanSource(
        `arkgrid-${slot.Index ?? slotIndex}-${segmentIndex}`,
        '아크그리드',
        slot.Name,
        '코어 옵션',
        segment,
      )
    })
  })

  // 아크그리드 젬의 "[공격력]" 스탯은 API가 이미 Effects에서 전체 젬 합산치를
  // 하나로 계산해 주므로(기본 공격력 총합과 같은 방식), 젬 하나하나를 다시
  // 더하면 이중 합산이 된다. 그 합산 필드 하나만 쓴다.
  const arkGridAttackEffect = (armory?.ArkGrid?.Effects || []).find(
    (effect) => effect.Name === '공격력',
  )
  if (arkGridAttackEffect) {
    const percentMatch = cleanApiText(arkGridAttackEffect.Tooltip || '').match(/([\d.]+)\s*%/)
    if (percentMatch) {
      sources.push({
        kind: 'percent',
        value: Number(percentMatch[1]),
        percent: true,
        itemType: '아크그리드 젬',
        itemName: `공격력 총합 (Lv.${arkGridAttackEffect.Level})`,
        heading: '아크그리드 효과',
        context: cleanApiText(arkGridAttackEffect.Tooltip),
      })
    }
  }

  return {
    flat: sources.filter((source) => source.kind === 'flat'),
    percent: sources.filter((source) => source.kind === 'percent'),
    conditional: sources.filter((source) => source.kind === 'conditional'),
    sources,
  }
}

const ADDITIONAL_DAMAGE_PATTERN = /추가\s*피해(?:가|는)?\s*(?:\+)?\s*([\d.]+)\s*%/g

// "달인 : 치명타 적중률 +1.4% / 추가 피해 +1.7%, 최대 5중첩"처럼 "추가 피해"도
// 스택형 조건부로 나온다 — 적용 중첩 계산은 출처 이름(itemName)이 있어야 JSON
// 등록 값을 찾을 수 있어 호출하는 쪽(addSources)에서 처리하고, 여기서는 최대
// 중첩·스택당 값만 그대로 돌려준다.
function scanAdditionalDamagePercents(text) {
  const results = []
  for (const line of text.split('|').map((part) => part.trim())) {
    if (isExcludedDamageAnalysisLine(line)) continue
    const maxStacksMatch = line.match(/최대\s*(\d+)\s*중첩/)
    const maxStacks = maxStacksMatch ? Number(maxStacksMatch[1]) : null
    for (const match of line.matchAll(ADDITIONAL_DAMAGE_PATTERN)) {
      const rawValue = Number(match[1])
      if (!Number.isFinite(rawValue)) continue
      results.push({ rawValue, line, maxStacks })
    }
  }
  return results
}

// maxStacks가 있으면 JSON에 등록된 적용 중첩(없으면 기본 12, 최대 중첩보다
// 크면 최대 중첩으로 캡)을 곱해 실제 값을 구한다.
function resolveStackedValue(line, rawValue, maxStacks) {
  if (!maxStacks) return { value: rawValue, appliedStacks: null, perStackValue: null }
  const override = findDataizedStackEntry(line)?.appliedStacks
  const appliedStacks = Math.min(override ?? DEFAULT_STACK_ASSUMPTION, maxStacks)
  return { value: rawValue * appliedStacks, appliedStacks, perStackValue: rawValue }
}

// "추가 피해"는 deal.html 공식에서 무기/장신구/팔찌 세 항으로 따로 더해진다
// (WEAPON_ADDITIONAL/ACCESSORY_ADDITIONAL/BRACELET_ADDITIONAL). 무기 아이템 자체,
// 아크패시브 진화 노드, 아크그리드(코어 옵션+젬 합산)는 전부 게임 UI의 "무기
// 추가 피해" 한 스탯으로 합산되는 값들이라 같은 무기 버킷에 묶는다. 장신구(목걸이
// ·귀걸이·반지) 연마 효과와 팔찌 효과는 공식에서 완전히 별도 항이라 각각 따로
// 뗀다. 스킬 툴팁(트라이포드)에 나오는 "N% 추가 피해를 준다"는 그 스킬 자체의
// 타격별 피해 계산 문구이지 캐릭터 스탯이 아니라서 스캔 대상에서 제외한다.
function additionalDamageBreakdown(armory) {
  const weapon = []
  const accessory = []
  const bracelet = []
  const seen = new Set()

  const addSources = (bucket, sourceKey, itemType, itemName, heading, text) => {
    scanAdditionalDamagePercents(text).forEach(({ rawValue, line, maxStacks }) => {
      const { value, appliedStacks, perStackValue } = resolveStackedValue(line, rawValue, maxStacks)
      const key = `${sourceKey}|${heading}|${value}`
      if (seen.has(key)) return
      seen.add(key)
      bucket.push({
        value,
        itemType,
        itemName,
        heading,
        context: line,
        maxStacks,
        appliedStacks,
        perStackValue,
        percent: true,
      })
    })
  }

  ;(armory?.ArmoryEquipment || []).forEach((item, index) => {
    const bucket =
      item.Type === '무기'
        ? weapon
        : ['목걸이', '귀걸이', '반지'].includes(item.Type)
          ? accessory
          : item.Type === '팔찌'
            ? bracelet
            : null
    if (!bucket) return
    tooltipSections(item.Tooltip).forEach(({ heading, text }) =>
      addSources(bucket, `equip-${index}`, item.Type, item.Name, heading, text),
    )
  })

  ;(armory?.ArkPassive?.Effects || []).forEach((effect, index) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    addSources(
      weapon,
      `arkpassive-${index}`,
      `아크 패시브 ${effect.Name}`,
      nodeName || effect.Name,
      '효과',
      text,
    )
  })

  // 아크그리드 코어 옵션도 [10P]/[14P]... 포인트 구간별 문구라, 툴팁에 표시된
  // 현재 보유 포인트 이하 구간만 반영한다.
  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    const ownedPoint = arkGridOwnedPoint(slot)
    tooltipSections(slot.Tooltip).forEach(({ heading, text }) => {
      if (heading !== '코어 옵션') return
      text.split(/(?=\[\d+P\])/g).forEach((segment) => {
        const pointMatch = segment.match(/^\[(\d+)P\]/)
        if (!pointMatch || Number(pointMatch[1]) > ownedPoint) return
        if (!/추가\s*피해/.test(segment)) return
        scanAdditionalDamagePercents(segment).forEach(({ rawValue, line, maxStacks }) => {
          const { value, appliedStacks, perStackValue } = resolveStackedValue(
            slot.Name,
            rawValue,
            maxStacks,
          )
          const key = `arkgrid-${slot.Index}-${pointMatch[1]}-${value}`
          if (seen.has(key)) return
          seen.add(key)
          weapon.push({
            value,
            itemType: '아크그리드',
            itemName: slot.Name,
            heading: `코어 옵션 [${pointMatch[1]}P]`,
            context: line.replace(/^\[\d+P\]\s*/, '').trim(),
            maxStacks,
            appliedStacks,
            perStackValue,
            percent: true,
          })
        })
      })
    })
  })

  // 아크그리드 젬의 "[추가 피해]" 스탯은 API가 이미 Effects에서 전체 젬 합산치를
  // 하나로 계산해 주므로(기본 공격력·공격력 총합과 같은 방식), 젬 하나하나를
  // 다시 더하면 이중 합산이 된다. 그 합산 필드 하나만 쓴다.
  const arkGridAdditionalEffect = (armory?.ArkGrid?.Effects || []).find(
    (effect) => effect.Name === '추가 피해',
  )
  if (arkGridAdditionalEffect) {
    const match = cleanApiText(arkGridAdditionalEffect.Tooltip || '').match(/([\d.]+)\s*%/)
    if (match) {
      weapon.push({
        value: Number(match[1]),
        itemType: '아크그리드 젬',
        itemName: `추가 피해 총합 (Lv.${arkGridAdditionalEffect.Level})`,
        heading: '아크그리드 효과',
        context: cleanApiText(arkGridAdditionalEffect.Tooltip),
      })
    }
  }

  const total = (list) => list.reduce((sum, source) => sum + source.value, 0)
  return {
    weapon,
    accessory,
    bracelet,
    weaponTotal: total(weapon),
    accessoryTotal: total(accessory),
    braceletTotal: total(bracelet),
  }
}

// "적/보스에게 주는 피해가 N% 증가" 패턴 — "주는" 바로 앞에 "받는"이 아니라
// "주는"/"입히는"이 와야 매칭되므로, 방어형 "받는 피해" 문구는 이 패턴에 걸리지
// 않는다. "증가"는 각인·아크패시브 설명문에는 있지만 장비 연마 효과의 짧은
// "주는 피해 +N%" 표기에는 없어서 선택적으로 두되, "감소"가 붙으면(같은 코어의
// 다른 포인트 구간에서 트레이드오프로 오히려 줄어드는 경우 등) 음수로 반영한다.
// "피해"/"피해량" 두 표기와 "이/가/는" 조사 유무를 모두 허용한다(예: "적에게
// 주는 피해량이 N% 증가한다", "실드 효과가 적용되는 동안 적에게 입히는 피해가
// N% 증가한다" — 55명 데이터 스캔으로 발견한 변형 표기). 캡처그룹1은 대상
// 수식어, 캡처그룹2는 %.
const OUTGOING_DAMAGE_PATTERN =
  /([가-힣\s]*?)\s*(?:주는|입히는)\s*피해(?:량)?(?:이|가|는)?\s*\+?\s*([\d.]+)\s*%\s*(증가|감소)?/g

// "일반/잠식/악마 스킬의 피해량이 N% 증가한다"류는 선택한 스킬 툴팁의
// [일반 스킬]·[잠식 스킬]·[악마 스킬] 분류와 일치할 때만 반영한다.
// 종류가 붙지 않은 "스킬 피해량" 문구는 전체 스킬 효과로 처리한다.
// "감소"가 붙은 트레이드오프 문구는 음수로 반영한다.
const SKILL_DAMAGE_PATTERN =
  /(?:(일반|잠식|악마)\s*)?스킬(?:의)?\s*피해량이?\s*\+?\s*([\d.]+)\s*%\s*(증가|감소)?/g

function scanOutgoingDamage(text, skillCategory = '') {
  const results = []
  for (const line of text.split('|').map((part) => part.trim())) {
    if (isExcludedDamageAnalysisLine(line)) continue
    if (/악마화\s*중/.test(line) && skillCategory !== '악마') continue
    for (const match of line.matchAll(OUTGOING_DAMAGE_PATTERN)) {
      const number = Number(match[2])
      if (!Number.isFinite(number)) continue
      const value = match[3] === '감소' ? -number : number
      const qualifier = match[1].trim()
      results.push({ value, qualifier, line })
    }
    for (const match of line.matchAll(SKILL_DAMAGE_PATTERN)) {
      const requiredCategory = match[1] || ''
      if (requiredCategory && requiredCategory !== skillCategory) continue
      const number = Number(match[2])
      if (!Number.isFinite(number)) continue
      const value = match[3] === '감소' ? -number : number
      results.push({
        value,
        qualifier: requiredCategory ? `${requiredCategory} 스킬 피해량` : '스킬 피해량',
        line,
      })
    }
  }
  return results
}

const SKILL_CATEGORY_COOLDOWN_PATTERN =
  /(일반|잠식|악마)\s*스킬(?:의)?\s*재사용\s*대기\s*시간(?:이|을|를)?\s*([\d.]+)\s*(%|초)\s*(증가|감소)/g

function skillCategoryCooldownFacts(armory, skillCategory) {
  const active = []
  const conditional = []
  const seen = new Set()
  const scan = (itemType, itemName, heading, text) => {
    for (const line of text.split('|').map((part) => part.trim())) {
      for (const match of line.matchAll(SKILL_CATEGORY_COOLDOWN_PATTERN)) {
        if (match[1] !== skillCategory) continue
        const number = Number(match[2])
        if (!Number.isFinite(number)) continue
        const value = match[4] === '증가' ? -number : number
        const unit = match[3]
        const key = `${itemName}|${line}|${value}|${unit}`
        if (seen.has(key)) continue
        seen.add(key)
        const source = {
          value,
          unit,
          itemType,
          itemName,
          heading: `${heading} · ${damageOptionSkillCategoryLabel(skillCategory)}`,
          context: line.replace(/^\[\d+P\]\s*/, '').trim(),
        }
        ;(ARK_PASSIVE_CONDITIONAL.test(line) ? conditional : active).push(source)
      }
    }
  }

  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    arkGridActiveCoreSegments(slot).forEach((segment) => {
      scan('아크그리드', slot.Name, '코어 옵션', segment)
    })
  })
  ;(armory?.ArkPassive?.Effects || []).forEach((effect) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    scan(`아크 패시브 ${effect.Name}`, nodeName || effect.Name, '효과', text)
  })
  ;(armory?.ArmoryEquipment || []).forEach((item) => {
    tooltipSections(item.Tooltip).forEach(({ heading, text }) => {
      scan(item.Type || '장비', item.Name, heading, text)
    })
  })
  return { active, conditional }
}

// 아크그리드 코어 옵션·아크패시브 노드에는 "스킬"이라는 일반 단어 대신 실제
// 스킬 이름 하나만 콕 집은 피해 배율도 흔하다(예: "블러드 볼텍스의 피해량이
// 10.0% 증가한다", "금강선공의 피해량 증가 효과가 추가로 24.0% 증가한다"). 이
// 문구는 그 스킬 하나에만 적용되는 배율이라, 지금 분석 중인 스킬(skillName)의
// 이름이 그대로 들어있을 때만 반영해야 한다 — 다른 스킬에만 적용되는 배율을
// 이 스킬 계산에 잘못 합산하면 안 되기 때문이다.
function buildNamedSkillDamagePattern(skillName) {
  // 스킬명 뒤에 "의 피해량이 N%"뿐 아니라 "의 피해량 증가 효과가 추가로 N%"
  // 같은 변형도 있어 "피해량"까지만 걸고 그 뒤 숫자%는 문구를 가리지 않고
  // 가장 가까운 것을 잡는다. 단, "피해량" 요구가 없으면 "블러드 볼텍스의
  // 시전 속도가 30% 증가하며, 블러드 피어싱의 피해량이 54% 증가한다"처럼
  // 스킬명 뒤에 피해와 무관한 다른 수치(시전 속도 등)가 먼저 나오는 문장에서
  // 엉뚱한 값을 잡아버리는 문제가 있어 "피해량"이 나온 뒤의 숫자%만 허용한다.
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}의[^%]*?피해량[^%]*?([\\d.]+)\\s*%\\s*(증가|감소)?`, 'g')
}
function scanNamedSkillDamage(text, skillName) {
  if (!skillName) return []
  const pattern = buildNamedSkillDamagePattern(skillName)
  const results = []
  for (const line of text.split('|').map((part) => part.trim())) {
    if (isExcludedDamageAnalysisLine(line)) continue
    for (const match of line.matchAll(pattern)) {
      const number = Number(match[1])
      if (!Number.isFinite(number)) continue
      const value = match[2] === '감소' ? -number : number
      results.push({ value, line })
    }
  }
  return results
}

// 각인 텍스트에서 "주는 피해" 증가를 전부 긁어온다. "질량 증가"/"돌격대장"은
// deal.html 공식에서 ENGRAVING_DAMAGE와 별도 항(MASS_INCREASE_DAMAGE/
// RAID_CAPTAIN_DAMAGE)이라 여기서 빼야 이중 합산이 안 된다. 돌격대장은 실제
// 이동 속도가 있어야 계산되는 값이라 애초에 이 스캔 패턴(고정 %)에 안 걸린다.
function engravingDamageFacts(armory) {
  const engravings = activeEngravings(armory)
  const sources = []
  engravings.forEach((engraving) => {
    const normalizedName = String(engraving.Name || '').replace(/\s/g, '')
    if (['질량증가', '돌격대장'].includes(normalizedName)) return
    const text = cleanApiText(engraving.Description || '').replace(/<br\s*\/?>/gi, ' | ')
    scanOutgoingDamage(text).forEach(({ value, qualifier, line }) => {
      sources.push({
        value,
        itemType: '각인',
        itemName: engraving.Name,
        heading: qualifier || '적에게',
        context: line,
      })
    })
  })
  return { sources, total: sources.reduce((sum, source) => sum + source.value, 0) }
}

// 질량 증가는 각인이지만 deal.html 공식에서 ENGRAVING_DAMAGE와 별도 항이라
// (질량 증가 상태 on/off를 따로 반영하기 위함으로 추정) 이름으로 직접 찾는다.
function massIncreaseDamageFacts(armory) {
  const engravings = activeEngravings(armory)
  const engraving = engravings.find(
    (item) => String(item.Name || '').replace(/\s/g, '') === '질량증가',
  )
  if (!engraving) return { sources: [], total: 0 }
  const text = cleanApiText(engraving.Description || '').replace(/<br\s*\/?>/gi, ' | ')
  const sources = scanOutgoingDamage(text).map(({ value, qualifier, line }) => ({
    value,
    itemType: '각인',
    itemName: '질량 증가',
    heading: qualifier || '적에게',
    context: line,
  }))
  return { sources, total: sources.reduce((sum, source) => sum + source.value, 0) }
}

// 돌격대장은 고정 피해 증가율이 아니라 현재 이동속도 증가량 전체에 API 설명의
// 환산 계수를 곱한다. 예: 이동속도 증가량 60% × 각인 계수 40% = 피해 24% 증가.
function raidCaptainDamageFacts(armory, moveSpeedIncrease) {
  const engravings = activeEngravings(armory)
  const engraving = engravings.find(
    (item) => String(item.Name || '').replace(/\s/g, '') === '돌격대장',
  )
  if (!engraving) return { sources: [], total: 0, coefficient: 0, appliedMoveSpeed: 0 }

  const text = cleanApiText(engraving.Description || '').replace(/<br\s*\/?>/gi, ' | ')
  const pattern = /이동\s*속도\s*증가량의\s*([\d.]+)\s*%/
  const match = pattern.exec(text)
  const coefficient = Number(match?.[1])
  if (!Number.isFinite(coefficient)) {
    return { sources: [], total: 0, coefficient: 0, appliedMoveSpeed: 0 }
  }

  const appliedMoveSpeed = Math.max(Number(moveSpeedIncrease) || 0, 0)
  const value = appliedMoveSpeed * (coefficient / 100)
  return {
    sources: [
      {
        value,
        itemType: '각인',
        itemName: engraving.Name,
        heading: `이동속도 증가 ${numberText(appliedMoveSpeed)}% × ${numberText(coefficient)}%`,
        context: text,
      },
    ],
    total: value,
    coefficient,
    appliedMoveSpeed,
  }
}

// 진화/깨달음/도약 노드의 피해 배율은 "적에게 주는 피해가 N% 증가한다" 문구뿐
// 아니라("풀려난 힘" 등 일부 도약 노드), "진화형 피해가 N% 증가합니다"처럼
// "OO형 피해"라는 별도 문구로도 나온다(오히려 이쪽이 더 흔하다 — 예: 한계
// 돌파·분쇄·예리한 감각 등 진화 노드 대부분). 두 패턴을 각각 스캔해서 합친다.
function scanTierDamage(text, tierName) {
  const pattern = new RegExp(`${tierName}형\\s*피해(?:가|는)?\\s*\\+?\\s*([\\d.]+)\\s*%`, 'g')
  const results = []
  for (const line of text.split('|').map((part) => part.trim())) {
    for (const match of line.matchAll(pattern)) {
      const value = Number(match[1])
      if (Number.isFinite(value)) results.push({ value, line })
    }
  }
  return results
}

// 아크패시브 진화/깨달음/도약 노드는 "OO 상태에서"/"초각성 스킬이"처럼 상시
// 적용이 아닌 조건부 문구가 흔해서 조건부/상시를 나눠서 반환한다 — 합계에는
// 상시 적용분만 반영하고, 조건부는 참고용으로 따로 보여준다.
function arkPassiveTierDamageBreakdown(armory, tierName, skillName, skillCategory, skill) {
  const unconditional = []
  const conditional = []
  const seen = new Set()
  ;(armory?.ArkPassive?.Effects || [])
    .filter((effect) => effect.Name === tierName)
    .forEach((effect) => {
      const { nodeName, text } = arkPassiveNodeText(effect)
      // "OO 스킬명의 피해량이 N%"처럼 특정 스킬 하나만 지정한 노드 문구(예:
      // "금강선공의 피해량 증가 효과가 추가로 24.0% 증가한다")는 그 스킬을
      // 지금 분석 중일 때만 반영한다.
      const matches = [
        ...scanOutgoingDamage(text, skillCategory),
        ...scanTierDamage(text, tierName),
        ...scanNamedSkillDamage(text, skillName),
      ]
      matches.forEach(({ value, qualifier, line }) => {
        // "치명타 시"/"치명타로 적중 시" 조건부는 CRIT_HIT_BRACELET에서 따로
        // 모은다 — scanOutgoingDamage 매치는 정확한 수식어(qualifier)로,
        // scanTierDamage 매치(수식어 캡처가 없음)는 줄 전체로 판단한다.
        const key = `${nodeName}|${line}|${value}`
        if (seen.has(key)) return
        seen.add(key)
        if (CRIT_HIT_TRIGGER_PATTERN.test(qualifier !== undefined ? qualifier : line)) return
        const target = ARK_PASSIVE_CONDITIONAL.test(line) ? conditional : unconditional
        target.push({
          value,
          itemType: `아크 패시브 ${tierName}`,
          itemName: nodeName,
          heading: qualifier || '적에게',
          context: line,
        })
      })
    })
  const karma = arkPassiveKarmaFacts(armory)[tierName]
  if (tierName === '진화' && karma?.evolutionPercent) {
    unconditional.push({
      value: karma.evolutionPercent,
      itemType: '아크 패시브 카르마',
      itemName: `진화 ${karma.point}P`,
      heading: `${karma.rank}랭크 ${karma.level}레벨`,
      context: `카르마 누적 보너스 · 진화형 피해 ${karma.evolutionPercent}% 증가`,
    })
  }
  if (
    tierName === '도약' &&
    karma?.hyperAwakeningDamagePercent &&
    isHyperAwakeningUltimate(skill)
  ) {
    unconditional.push({
      value: karma.hyperAwakeningDamagePercent,
      itemType: '아크 패시브 카르마',
      itemName: `도약 ${karma.point}P`,
      heading: `${karma.rank}랭크 ${karma.level}레벨 · 초각성기`,
      context: `카르마 누적 보너스 · 초각성기 피해 ${karma.hyperAwakeningDamagePercent}% 증가`,
    })
  }
  return {
    unconditional,
    conditional,
    total: unconditional.reduce((sum, source) => sum + source.value, 0),
  }
}

// 적에게 주는 피해(OUTGOING_DAMAGE)는 각인 쪽(ENGRAVING_DAMAGE)과 아크패시브
// 쪽(EVOLUTION/ENLIGHTENMENT/LEAP_DAMAGE)이 각각 자기 항으로 이미 따로 빠지므로,
// 여기서는 장비(연마 효과 등)와 아크그리드 코어 옵션만 스캔해서 이중 합산을
// 피한다. 중요: "카테고리 안에서는 합연산, 카테고리끼리는 곱연산"이 이 계산의
// 원칙이라 여기서 나오는 출처를 전부 하나로 합치면 안 된다 — 장신구(목걸이·
// 귀걸이·반지) 연마 효과는 하나의 그룹(장신구 연마)으로 합산하고, 아크그리드
// 코어는 코어(slot.Name)마다 서로 완전히 다른 옵션·다른 스킬 대상이라 각 코어를
// 별도 그룹으로 나눈다. 그래서 결과를 flat sources/total이 아니라 그룹 목록
// (groups)으로 돌려주고, 호출부(damageIncreaseItems)에서 그룹마다 독립된
// (1+증가율) 곱연산 항을 만든다.
function outgoingDamageBreakdown(armory, skillName, skillCategory) {
  const groups = new Map()
  const addSource = (groupKey, label, source) => {
    if (!groups.has(groupKey)) groups.set(groupKey, { label, sources: [] })
    groups.get(groupKey).sources.push(source)
  }

  const ACCESSORY_TYPES = new Set(['목걸이', '귀걸이', '반지'])
  ;(armory?.ArmoryEquipment || []).forEach((item) => {
    tooltipSections(item.Tooltip).forEach(({ text }) => {
      const isAccessory = ACCESSORY_TYPES.has(item.Type)
      const groupKey = isAccessory ? 'accessory-honing' : `equip-${item.Type}-${item.Name}`
      const label = isAccessory
        ? '장신구 연마 · 적에게 주는 피해'
        : `${item.Type || '장비'} · 적에게 주는 피해`
      scanOutgoingDamage(text, skillCategory).forEach(({ value, qualifier, line }) => {
        // "치명타 시"/"치명타로 적중 시" 조건부는 여기가 아니라 CRIT_HIT_BRACELET
        // 항목(critHitBraceletFacts)에서 따로 모은다 — 이중 합산 방지. 같은 줄에
        // 조건부 없는 부분과 있는 부분이 같이 나올 수 있어(예: "적에게 주는
        // 피해가 1% 증가하고, 치명타 시 적에게 주는 피해가 0.55% 증가한다") line
        // 전체가 아니라 이 매치 앞의 수식어(qualifier)만 검사한다.
        if (CRIT_HIT_TRIGGER_PATTERN.test(qualifier)) return
        addSource(groupKey, label, {
          value,
          itemType: item.Type || '장비',
          itemName: item.Name,
          heading: qualifier || '적에게',
          context: line,
        })
      })
      scanNamedSkillDamage(text, skillName).forEach(({ value, line }) => {
        addSource(groupKey, label, {
          value,
          itemType: item.Type || '장비',
          itemName: item.Name,
          heading: `스킬 지정: ${skillName}`,
          context: line,
        })
      })
    })
  })
  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    const ownedPoint = arkGridOwnedPoint(slot)
    tooltipSections(slot.Tooltip).forEach(({ heading, text }) => {
      if (heading !== '코어 옵션') return
      text.split(/(?=\[\d+P\])/g).forEach((segment) => {
        const pointMatch = segment.match(/^\[(\d+)P\]/)
        if (!pointMatch || Number(pointMatch[1]) > ownedPoint) return
        scanOutgoingDamage(segment, skillCategory).forEach(({ value, qualifier, line }) => {
          if (CRIT_HIT_TRIGGER_PATTERN.test(qualifier)) return
          addSource(`arkgrid-core-${slot.Index}`, `아크그리드 · ${slot.Name}`, {
            value,
            itemType: '아크그리드',
            itemName: slot.Name,
            heading: `코어 옵션 [${pointMatch[1]}P] ${qualifier}`.trim(),
            context: line.replace(/^\[\d+P\]\s*/, '').trim(),
          })
        })
        // "OO 스킬명의 피해량이 N% 증가한다"처럼 특정 스킬 하나만 지정한 코어
        // 옵션은 그 스킬을 지금 분석 중일 때만 반영한다.
        scanNamedSkillDamage(segment, skillName).forEach(({ value, line }) => {
          addSource(`arkgrid-core-${slot.Index}`, `아크그리드 · ${slot.Name}`, {
            value,
            itemType: '아크그리드',
            itemName: slot.Name,
            heading: `코어 옵션 [${pointMatch[1]}P] 스킬 지정: ${skillName}`,
            context: line.replace(/^\[\d+P\]\s*/, '').trim(),
          })
        })
      })
    })
  })
  // 아크그리드 효과 집계 목록(ArkGrid.Effects)에도 "보스 피해"(보스 등급 이상
  // 몬스터에게 주는 피해)처럼 이 캐릭터 자신의 딜 배율인 항목이 있다. 공격력·
  // 추가 피해는 다른 곳(attackPowerBreakdown·additionalDamageBreakdown)에서
  // 이미 그 합산 필드를 쓰고, 낙인력·아군 관련은 서포터가 파티원에게 주는
  // 버프라 이 캐릭터의 딜이 아니므로 여기서 제외한다. 개별 코어와도 서로 다른
  // 출처(코어 조합 집계)라 따로 그룹을 둔다.
  const ARK_GRID_EFFECT_EXCLUDE = new Set([
    '공격력',
    '추가 피해',
    '낙인력',
    '아군 피해 강화',
    '아군 공격 강화',
  ])
  ;(armory?.ArkGrid?.Effects || []).forEach((effect) => {
    if (ARK_GRID_EFFECT_EXCLUDE.has(effect.Name)) return
    const text = cleanApiText(effect.Tooltip || '')
    scanOutgoingDamage(text, skillCategory).forEach(({ value, qualifier, line }) => {
      addSource('arkgrid-effects', '아크그리드 효과', {
        value,
        itemType: '아크그리드 효과',
        itemName: effect.Name,
        heading: qualifier || '적에게',
        context: line,
      })
    })
  })

  const groupList = [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    sources: group.sources,
    total: group.sources.reduce((sum, source) => sum + source.value, 0),
  }))
  return { groups: groupList, sources: groupList.flatMap((group) => group.sources) }
}

// 카드 효과는 이미 달성한(=API가 돌려주는) 세트/각성 구간만 나열되므로 전부
// 더해도 안전하다. "피해 감소"(방어형)나 속성 변환처럼 %가 없는 줄은
// 정규식이 그냥 매칭하지 않아 자동으로 빠진다.
function cardDamageFacts(armory) {
  const groups = armory?.ArmoryCard?.Effects || []
  const sources = []
  groups.forEach((group) => {
    ;(group.Items || []).forEach((item) => {
      const text = cleanApiText(item.Description || '')
      if (/감소|받는/.test(text)) return
      const match = text.match(/피해\s*\+?\s*([\d.]+)\s*%/)
      if (!match) return
      sources.push({
        value: Number(match[1]),
        itemType: '카드',
        itemName: item.Name,
        context: text,
      })
    })
  })
  return { sources, total: sources.reduce((sum, source) => sum + source.value, 0) }
}

// 치명타 피해 배율의 기본값(200%)은 로스트아크 공통 상수이고, 여기에 각인
// (예리한 둔기)·장신구 연마·아크패시브 노드에서 나오는 "치명타 피해(량)"
// 증가분을 더한다. 아크패시브는 EVOLUTION/ENLIGHTENMENT/LEAP_DAMAGE와 완전히
// 다른 패턴("치명타 피해"이지 "주는 피해"가 아님)이라 겹칠 일이 없다.
const CRIT_DAMAGE_BASE = 200
const CRIT_DAMAGE_PATTERN = /치명타\s*피해(?:량)?(?:이|가)?\s*\+?\s*([\d.]+)\s*%/g

function scanCritDamage(text) {
  const results = []
  for (const line of text.split('|').map((part) => part.trim())) {
    if (isExcludedDamageAnalysisLine(line)) continue
    for (const match of line.matchAll(CRIT_DAMAGE_PATTERN)) {
      const value = Number(match[1])
      if (Number.isFinite(value)) results.push({ value, line })
    }
  }
  return results
}

function critDamageBreakdown(armory) {
  const sources = []
  const engravings = activeEngravings(armory)
  engravings.forEach((engraving) => {
    const text = cleanApiText(engraving.Description || '')
    scanCritDamage(text).forEach(({ value, line }) => {
      sources.push({ value, itemType: '각인', itemName: engraving.Name, context: line })
    })
  })
  ;(armory?.ArmoryEquipment || []).forEach((item) => {
    tooltipSections(item.Tooltip).forEach(({ text }) => {
      scanCritDamage(text).forEach(({ value, line }) => {
        sources.push({ value, itemType: item.Type || '장비', itemName: item.Name, context: line })
      })
    })
  })
  ;(armory?.ArkPassive?.Effects || []).forEach((effect) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    scanCritDamage(text).forEach(({ value, line }) => {
      if (ARK_PASSIVE_CONDITIONAL.test(line)) return
      sources.push({
        value,
        itemType: `아크 패시브 ${effect.Name}`,
        itemName: nodeName,
        context: line,
      })
    })
  })
  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    arkGridActiveCoreSegments(slot).forEach((segment) => {
      scanCritDamage(segment).forEach(({ value, line }) => {
        sources.push({
          value,
          itemType: '아크그리드',
          itemName: slot.Name,
          heading: '코어 옵션',
          context: line,
        })
      })
    })
  })
  const bonusTotal = sources.reduce((sum, source) => sum + source.value, 0)
  return { sources, base: CRIT_DAMAGE_BASE, bonusTotal, total: CRIT_DAMAGE_BASE + bonusTotal }
}

const ATTACK_SPEED_PATTERN = /공격\s*속도(?:가|는)?\s*\+?\s*([\d.]+)\s*%\s*(증가|감소)?/g

function arkGridAttackSpeedFacts(armory) {
  const sources = []
  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    arkGridActiveCoreSegments(slot).forEach((segment) => {
      for (const line of segment.split('|').map((part) => part.trim())) {
        for (const match of line.matchAll(ATTACK_SPEED_PATTERN)) {
          const number = Number(match[1])
          if (!Number.isFinite(number)) continue
          sources.push({
            value: match[2] === '감소' ? -number : number,
            itemType: '아크그리드',
            itemName: slot.Name,
            heading: '코어 옵션',
            context: line,
          })
        }
      }
    })
  })
  return { sources, total: sources.reduce((sum, source) => sum + source.value, 0) }
}

// "치명타 시"/"치명타로 적중 시" 조건의 "주는 피해" 증가는 팔찌 하나로만 보지
// 않는다 — 아크그리드 코어 옵션·아크패시브 노드에도 같은 문구가 나오므로 장비
// 전체·아크그리드·아크패시브 어디서 나오든 전부 이 항목으로 모은다. 대신
// outgoingDamageBreakdown·arkPassiveTierDamageBreakdown 쪽에서는 이 문구가
// 있으면 제외해야 이중 합산이 안 된다(CRIT_HIT_TRIGGER_PATTERN 공유).
const CRIT_HIT_TRIGGER_PATTERN = /치명타\s*시|치명타로\s*적중\s*시/

function critHitBraceletFacts(armory) {
  const sources = []
  const seen = new Set()
  const scan = (itemType, itemName, text, sourceKey) => {
    scanOutgoingDamage(text).forEach(({ value, qualifier, line }) => {
      // 같은 줄에 조건부 없는 부분과 "치명타 시" 조건부 부분이 같이 나올 수
      // 있어(예: 아크그리드 코어 옵션의 "적에게 주는 피해 N%, 치명타 시 적에게
      // 주는 피해 M%") line 전체가 아니라 이 매치의 수식어(qualifier)만 본다.
      if (!CRIT_HIT_TRIGGER_PATTERN.test(qualifier)) return
      const key = `${sourceKey}|${qualifier}|${value}`
      if (seen.has(key)) return
      seen.add(key)
      sources.push({ value, itemType, itemName, heading: '치명타 시', context: line })
    })
  }
  ;(armory?.ArmoryEquipment || []).forEach((item, index) => {
    tooltipSections(item.Tooltip).forEach(({ text }) =>
      scan(item.Type || '장비', item.Name, text, `equip-${index}`),
    )
  })
  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    const ownedPoint = arkGridOwnedPoint(slot)
    tooltipSections(slot.Tooltip).forEach(({ heading, text }) => {
      if (heading !== '코어 옵션') return
      text.split(/(?=\[\d+P\])/g).forEach((segment) => {
        const pointMatch = segment.match(/^\[(\d+)P\]/)
        if (!pointMatch || Number(pointMatch[1]) > ownedPoint) return
        scan('아크그리드', slot.Name, segment, `arkgrid-${slot.Index}-${pointMatch[1]}`)
      })
    })
  })
  ;(armory?.ArkPassive?.Effects || []).forEach((effect, index) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    scan(`아크 패시브 ${effect.Name}`, nodeName || effect.Name, text, `arkpassive-${index}`)
  })
  return { sources, total: sources.reduce((sum, source) => sum + source.value, 0) }
}

// "치명타 적중률이 N% 증가한다" — 치명타가 터질 확률 자체를 올려주는 스탯.
// "치명타 피해(량)"(CRIT_DAMAGE, 터졌을 때의 배율)와는 완전히 다른 스탯이라
// 겹칠 일이 없다.
const CRIT_RATE_PATTERN = /치명타\s*적중률(?:이|가)?\s*\+?\s*([\d.]+)\s*%\s*(증가|감소)?/g

function scanCritRate(text, skillCategory = '') {
  const results = []
  for (const line of text.split('|').map((part) => part.trim())) {
    if (isExcludedDamageAnalysisLine(line)) continue
    // 악마화 상태에서는 [악마 스킬]만 사용할 수 있으므로 "악마화 중" 효과는
    // 별도 조건 체크 없이 악마 스킬 분석에만 자동 적용한다.
    if (/악마화\s*중/.test(line) && skillCategory !== '악마') continue
    const requiredCategory = line.match(/(일반|잠식|악마)\s*스킬/)?.[1]
    if (requiredCategory && requiredCategory !== skillCategory) continue
    for (const match of line.matchAll(CRIT_RATE_PATTERN)) {
      const number = Number(match[1])
      if (!Number.isFinite(number)) continue
      const value = match[2] === '감소' ? -number : number
      results.push({ value, line })
    }
  }
  return results
}

function critRateFacts(armory, criticalStat = 0, skillCategory = '') {
  const sources = []
  if (criticalStat > 0) {
    sources.push({
      value: criticalStat * CRIT_RATE_PER_POINT,
      itemType: 'API 전투 특성',
      itemName: `치명 ${numberText(criticalStat)} × ${CRIT_RATE_PER_POINT}%`,
    })
  }
  ;(armory?.ArmoryEquipment || []).forEach((item) => {
    tooltipSections(item.Tooltip).forEach(({ text }) => {
      scanCritRate(text, skillCategory).forEach(({ value, line }) => {
        sources.push({ value, itemType: item.Type || '장비', itemName: item.Name, context: line })
      })
    })
  })
  const engravings = activeEngravings(armory)
  engravings.forEach((engraving) => {
    const text = cleanApiText(engraving.Description || '')
    if (engraving.Name === '아드레날린') {
      const maxStacks = Number(text.match(/최대\s*(\d+)\s*중첩/)?.[1]) || null
      const appliedStacks =
        dataizedStackEntryFor(text, engraving.Name, maxStacks)?.appliedStacks ?? 0
      // 아드레날린의 추가 치명타 적중률은 최대 중첩에 도달했을 때만 발동한다.
      if (!maxStacks || appliedStacks < maxStacks) return
    }
    scanCritRate(text, skillCategory).forEach(({ value, line }) => {
      sources.push({ value, itemType: '각인', itemName: engraving.Name, context: line })
    })
  })
  ;(armory?.ArkPassive?.Effects || []).forEach((effect) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    scanCritRate(text, skillCategory).forEach(({ value, line }) => {
      if (ARK_PASSIVE_CONDITIONAL.test(line)) return
      sources.push({
        value,
        itemType: `아크 패시브 ${effect.Name}`,
        itemName: nodeName,
        context: line,
      })
    })
  })
  ;(armory?.ArkGrid?.Slots || []).forEach((slot) => {
    const ownedPoint = arkGridOwnedPoint(slot)
    tooltipSections(slot.Tooltip).forEach(({ heading, text }) => {
      if (heading !== '코어 옵션') return
      text.split(/(?=\[\d+P\])/g).forEach((segment) => {
        const pointMatch = segment.match(/^\[(\d+)P\]/)
        if (!pointMatch || Number(pointMatch[1]) > ownedPoint) return
        scanCritRate(segment, skillCategory).forEach(({ value, line }) => {
          sources.push({
            value,
            itemType: '아크그리드',
            itemName: slot.Name,
            heading: `코어 옵션 [${pointMatch[1]}P]`,
            context: line.replace(/^\[\d+P\]\s*/, '').trim(),
          })
        })
      })
    })
  })
  return { sources, total: sources.reduce((sum, source) => sum + source.value, 0) }
}

function mainStatBreakdown(
  armory,
  profile,
  { potionSourceInput = '', cardBookInput = '', azenaBlessing = false, petTraitPercent = 1 } = {},
) {
  const totals = { 힘: 0, 민첩: 0, 지능: 0 }
  const sources = []
  const percentSources = []

  ;(armory?.ArmoryEquipment || []).forEach((item) => {
    baseEffectRawLines(item.Tooltip).forEach((line) => {
      if (/COLOR=['"]?#686660/i.test(line)) return
      const cleanedLine = cleanApiText(line)
      const match = cleanedLine.match(/(힘|민첩|지능)(?:\s*\+?\s*|\s*이\s+)([\d,]+)(?:\s*증가)?/)
      if (!match) return
      const value = Number(match[2].replaceAll(',', ''))
      if (!Number.isFinite(value)) return
      totals[match[1]] += value
      sources.push({
        itemType: item.Type || '장비',
        itemName: item.Name || item.Type,
        stat: match[1],
        value,
        context: cleanedLine,
      })
    })
  })

  const [mainStatName, mainStatValue] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]

  // 아바타(무기/머리/상의/하의)의 "기본 효과"는 장비와 달리 힘/민첩/지능에
  // 고정값이 아니라 %를 준다 (예: "민첩 +1.00%"). 무기/머리/상의/하의는 각각
  // 슬롯 안에서(같은 슬롯에 후보가 여럿이면) 최댓값 하나만 쓰고, 상의·하의는
  // 원피스형(상의+하의 겸용) 아바타로 한 번에 나올 수도 있어 다음 중 더 큰
  // 값을 쓴다: (원피스형 최댓값) vs (상의 최댓값 + 하의 최댓값). 마지막으로
  // 무기/머리/상하의 셋 중 최댓값이 실제 적용되는 % 보너스다.
  const avatarSlotPercent = { 무기: 0, 머리: 0, 상의: 0, 하의: 0, 원피스: 0 }
  ;(armory?.ArmoryAvatars || []).forEach((avatar) => {
    const type = avatar.Type || ''
    const hasTop = type.includes('상의')
    const hasBottom = type.includes('하의')
    const slot = type.startsWith('무기')
      ? '무기'
      : type.startsWith('머리')
        ? '머리'
        : hasTop && hasBottom
          ? '원피스'
          : hasTop
            ? '상의'
            : hasBottom
              ? '하의'
              : null
    if (!slot) return
    tooltipSections(avatar.Tooltip).forEach(({ heading, text }) => {
      if (!/기본 효과/.test(heading)) return
      const match = text.match(/(힘|민첩|지능)\s*\+?\s*([\d.]+)\s*%/)
      if (!match) return
      const value = Number(match[2])
      if (!Number.isFinite(value)) return
      avatarSlotPercent[slot] = Math.max(avatarSlotPercent[slot], value)
      percentSources.push({
        itemType: avatar.Type || '아바타',
        itemName: avatar.Name || avatar.Type,
        stat: match[1],
        value,
        context: text,
      })
    })
  })

  // 무기/머리/상하의는 서로 다른 슬롯이라 셋을 더한다(같은 슬롯 안의 후보끼리만
  // 위에서 최댓값을 취함). 상하의만 한 번 더 특별 취급: 원피스형 아바타가
  // 상의·하의를 동시에 채우는 경우와, 상의·하의가 각각 따로인 경우 중 더 큰
  // 쪽을 쓴다.
  const topBottomPercent = Math.max(
    avatarSlotPercent.원피스,
    avatarSlotPercent.상의 + avatarSlotPercent.하의,
  )
  // 펫 특기도 API로 확인이 안 돼 사용자 입력(0~1%, 소수점 가능)을 받아 아바타 %와
  // 함께 더한다.
  const mainStatPercent =
    avatarSlotPercent.무기 + avatarSlotPercent.머리 + topBottomPercent + petTraitPercent

  // 원정대 레벨 효과·레벨에 따른 주 스탯은 규칙이 고정돼 있어 테이블로 정확히
  // 나온다. 게임 상태창에는 물약 효과가 원정대 레벨 효과와 합산된 채로만
  // 보이므로, 사용자가 그 합산 수치를 입력하면 여기서 원정대 레벨 효과를 빼서
  // 물약 효과만 역산한다 — 미입력 시엔 850 고정값을 그대로 쓴다. 카드 도감
  // 효과는 조합이 사실상 무한이라 데이터화할 수 없어 사용자 입력을 그대로
  // 쓰고, 미입력 시엔 242 고정값을 쓴다. 아제나의 축복은 켜면 고정 +6000.
  const expeditionLevel = profile?.ExpeditionLevel
  const expeditionBonus = expeditionMainStatBonus(expeditionLevel)
  const characterLevel = profile?.CharacterLevel
  const levelStatBonus = levelMainStatBonus(characterLevel) || 0

  const DEFAULT_POTION_BONUS = 850
  const DEFAULT_CARD_BOOK_BONUS = 242
  const potionSourceRaw = String(potionSourceInput ?? '').trim()
  const potionSourceValue = Number(potionSourceRaw.replaceAll(',', ''))
  const hasPotionSourceInput = potionSourceRaw !== '' && Number.isFinite(potionSourceValue)
  const potionBonus = hasPotionSourceInput
    ? potionSourceValue - expeditionBonus
    : DEFAULT_POTION_BONUS

  const cardBookRaw = String(cardBookInput ?? '').trim()
  const cardBookValue = Number(cardBookRaw.replaceAll(',', ''))
  const hasCardBookInput = cardBookRaw !== '' && Number.isFinite(cardBookValue)
  const cardBookBonus = hasCardBookInput ? cardBookValue : DEFAULT_CARD_BOOK_BONUS

  const azenaBonus = azenaBlessing ? 6000 : 0

  const totalFixedStat =
    mainStatValue + expeditionBonus + levelStatBonus + potionBonus + cardBookBonus + azenaBonus
  const mainStatFinal = totalFixedStat * (1 + mainStatPercent / 100)

  return {
    totals,
    mainStatName,
    mainStatValue,
    mainStatPercent,
    totalFixedStat,
    mainStatFinal,
    sources,
    percentSources,
    expeditionLevel,
    expeditionBonus,
    characterLevel,
    levelStatBonus,
    potionBonus,
    hasPotionSourceInput,
    cardBookBonus,
    hasCardBookInput,
    azenaBlessing,
    azenaBonus,
    petTraitPercent,
  }
}

// "공격 적중 시 30초마다 120초 동안 무기 공격력이 N 증가한다 (최대 30중첩)" 같은
// 팔찌 스택형 조건부는 실전에서 항상 최대 중첩을 유지하기 어렵다 — 최대치 대신
// 12중첩을 "적용 중첩"으로 고정해 계산의 기준값으로 삼는다(최대 중첩이 12보다
// 작으면 그 최대치를 그대로 쓴다).
const DEFAULT_STACK_ASSUMPTION = 12

function weaponAttackBreakdown(armory) {
  const sources = []
  const seen = new Set()
  const conditionalPattern = /적중|중첩|동안|전투 중|확률|버프|효과 획득|조건|변신|스택/
  // e.g. "무기 공격력이 140 증가한다. (최대 30중첩)" — the number right after the
  // bonus is the PER-STACK value; 실제 적용값은 적용 중첩(기본 12, 최대치보다
  // 작으면 최대치) × 이 값이다.
  const maxStackPattern = /최대\s*(\d+)\s*중첩/
  const pattern =
    /무기\s*공격력(?:이|가)?\s*(?:증가(?:량)?\s*)?([+-]?)\s*([\d,]+(?:\.\d+)?)\s*(%?)/g

  const scanSource = (sourceKey, itemType, itemName, heading, text) => {
    for (const line of text.split('|').map((part) => part.trim())) {
      if (isExcludedDamageAnalysisLine(line)) continue
      for (const match of line.matchAll(pattern)) {
        const number = Number(match[2].replaceAll(',', ''))
        if (!Number.isFinite(number)) continue
        const signedValue = match[1] === '-' ? -number : number
        const percent = match[3] === '%'
        const conditional = conditionalPattern.test(line)
        const maxStacks = conditional ? Number(line.match(maxStackPattern)?.[1]) || null : null
        const appliedStacks = maxStacks
          ? Math.min(
              findDataizedStackEntry(line)?.appliedStacks ?? DEFAULT_STACK_ASSUMPTION,
              maxStacks,
            )
          : null
        const kind =
          itemType === '무기' && /기본 효과/.test(heading) && !percent && !conditional
            ? 'base'
            : conditional
              ? 'conditional'
              : percent
                ? 'percent'
                : 'flat'
        const key = [sourceKey, heading, signedValue, percent, kind].join('|')
        if (seen.has(key)) continue
        seen.add(key)
        sources.push({
          kind,
          value: maxStacks ? signedValue * appliedStacks : signedValue,
          perStackValue: maxStacks ? signedValue : null,
          maxStacks,
          appliedStacks,
          percent,
          itemType: itemType || '장비',
          itemName: itemName || itemType || '장비',
          heading,
          context: line,
        })
      }
    }
  }

  ;(armory?.ArmoryEquipment || []).forEach((item, itemIndex) => {
    tooltipSections(item.Tooltip).forEach(({ heading, text }) => {
      scanSource(`equip-${itemIndex}`, item.Type, item.Name, heading, text)
    })
  })
  // 아크그리드 코어의 "코어 옵션"도 (직업에 따라) 무기 공격력을 직접 주는 경우가
  // 있어 장비/아크 패시브와 같은 방식으로 스캔한다.
  ;(armory?.ArkGrid?.Slots || []).forEach((slot, slotIndex) => {
    arkGridActiveCoreSegments(slot).forEach((segment, segmentIndex) => {
      scanSource(
        `arkgrid-${slotIndex}-${segmentIndex}`,
        '아크그리드',
        slot.Name,
        '코어 옵션',
        segment,
      )
    })
  })
  // Ark Passive nodes (진화/깨달음/도약) can also grant 무기 공격력, separately
  // from equipment — the 카르마 포인트로 인한 attack-power source the breakdown
  // was missing.
  ;(armory?.ArkPassive?.Effects || []).forEach((effect, effectIndex) => {
    const { nodeName, text } = arkPassiveNodeText(effect)
    scanSource(
      `arkpassive-${effectIndex}`,
      `아크 패시브 ${effect.Name}`,
      nodeName || effect.Name,
      '효과',
      text,
    )
  })
  // 깨달음 포인트의 무기 공격력% 보너스는 개별 노드 ToolTip 텍스트로는 잡히지
  // 않고(전체 랭크/레벨 누적치라 어느 한 노드 설명에도 안 적혀 있음), 실제
  // "N랭크 M레벨" 값을 카르마 잔영 재련표에 대입해야 정확히 나온다.
  const karmaBonus = arkPassiveKarmaFacts(armory).깨달음
  if (karmaBonus?.weaponAttackPercent) {
    sources.push({
      kind: 'percent',
      value: karmaBonus.weaponAttackPercent,
      perStackValue: null,
      maxStacks: null,
      percent: true,
      itemType: '아크 패시브',
      itemName: `깨달음 ${karmaBonus.point}P`,
      heading: `${karmaBonus.rank}랭크 ${karmaBonus.level}레벨`,
      context: '카르마의 잔영 재련 누적 보너스 (깨달음 → 무기 공격력)',
    })
  }

  return {
    base: sources.filter((source) => source.kind === 'base'),
    flat: sources.filter((source) => source.kind === 'flat'),
    percent: sources.filter((source) => source.kind === 'percent'),
    conditional: sources.filter((source) => source.kind === 'conditional'),
    sources,
  }
}

// 전투 조건부 중에서 damage-analysis-conditional-stacks.json에 적용 중첩이
// 등록된 것만 데이터화가 끝난 조건부다 — 이런 항목만 기본값으로 계산에
// 포함시키고, "최대 N중첩" 문구가 있어도 JSON에 등록 안 된 나머지 조건부는
// 사용자가 계산식 모달에서 직접 켜기 전까지는 계산에서 뺀 채로 둔다.
function defaultEnabledConditionalKeys(armory) {
  const keys = new Set()
  weaponAttackBreakdown(armory).conditional.forEach((source, index) => {
    if (source.maxStacks && isDataizedConditionalSource(source)) {
      keys.add(conditionalSourceKey('weapon', source, index))
    }
  })
  attackPowerBreakdown(armory).conditional.forEach((source, index) => {
    if (source.maxStacks && isDataizedConditionalSource(source)) {
      keys.add(conditionalSourceKey('attack', source, index))
    }
  })
  return keys
}

function MainStatBreakdown({ breakdown }) {
  const relevantPercentSources = breakdown.percentSources.filter(
    (source) => source.stat === breakdown.mainStatName,
  )
  return (
    <div className="weapon-attack-breakdown">
      <div className="weapon-attack-total">
        <span>
          <small>주 스탯 ({breakdown.mainStatName}) · 종합 근사치</small>
          <b>{numberText(breakdown.mainStatFinal)}</b>
        </span>
        <code>
          {numberText(breakdown.totalFixedStat)} × (1 + {numberText(breakdown.mainStatPercent)}%)
        </code>
      </div>

      <div className="weapon-attack-groups single-column">
        <section>
          <h5>{breakdown.mainStatName} 고정 출처</h5>
          {breakdown.sources
            .filter((source) => source.stat === breakdown.mainStatName)
            .map((source, index) => (
              <div key={`${source.itemName}-${index}`}>
                <span>
                  <b>{source.itemType}</b>
                  <small>{source.itemName}</small>
                  {source.context && (
                    <small className="source-context-text">"{source.context}"</small>
                  )}
                </span>
                <strong>+{numberText(source.value)}</strong>
              </div>
            ))}
          <div>
            <span>
              <b>원정대 레벨 효과</b>
              <small>원정대 Lv.{breakdown.expeditionLevel}</small>
            </span>
            <strong>+{numberText(breakdown.expeditionBonus)}</strong>
          </div>
          <div>
            <span>
              <b>레벨에 따른 주스탯</b>
              <small>캐릭터 Lv.{breakdown.characterLevel}</small>
            </span>
            <strong>
              {breakdown.levelStatBonus ? `+${numberText(breakdown.levelStatBonus)}` : '자료 없음'}
            </strong>
          </div>
          <div>
            <span>
              <b>물약 효과</b>
              <small>
                {breakdown.hasPotionSourceInput
                  ? '위 "계산 설정" 입력값 − 원정대 레벨 효과'
                  : '미입력 · 850 고정'}
              </small>
            </span>
            <strong>+{numberText(breakdown.potionBonus)}</strong>
          </div>
          <div>
            <span>
              <b>카드 도감 효과</b>
              <small>
                {breakdown.hasCardBookInput ? '위 "계산 설정" 입력값' : '미입력 · 242 고정'}
              </small>
            </span>
            <strong>+{numberText(breakdown.cardBookBonus)}</strong>
          </div>
          <div>
            <span>
              <b>아제나의 축복</b>
              <small>{breakdown.mainStatName} +6,000 고정 (위 "계산 설정"에서 on/off)</small>
            </span>
            <strong>{breakdown.azenaBlessing ? 'ON' : 'OFF'}</strong>
          </div>
        </section>
        {relevantPercentSources.length > 0 && (
          <section>
            <h5>{breakdown.mainStatName} % 출처 (아바타, 슬롯별 최댓값 합산)</h5>
            {relevantPercentSources.map((source, index) => (
              <div key={`${source.itemName}-${index}`}>
                <span>
                  <b>{source.itemType}</b>
                  <small>{source.itemName}</small>
                  {source.context && (
                    <small className="source-context-text">"{source.context}"</small>
                  )}
                </span>
                <strong>+{numberText(source.value)}%</strong>
              </div>
            ))}
            <div>
              <span>
                <b>우월한 유전자</b>
                <small>위 "계산 설정"에서 선택 (기본 0%)</small>
              </span>
              <strong>+{numberText(breakdown.petTraitPercent)}%</strong>
            </div>
          </section>
        )}
      </div>

      <p className="weapon-attack-note">
        장비 툴팁의 "기본 효과"에서 회색으로 표시되지 않은(=직업에 적용되는) 스탯 줄만 합산하고,
        아바타 %는 무기·머리 각각의 최댓값과 상하의(원피스형 vs 상의+하의 중 최댓값)를 더한 값에 펫
        특기 입력값까지 더해서 곱한 근사치입니다. 원정대 레벨 효과·레벨에 따른 주스탯은 정확한
        테이블 값이고, 물약 효과는 게임 상태창에 원정대 레벨 효과와 합산돼서만 보이므로 그 합산
        수치를 입력받아 원정대 레벨 효과를 뺀 값을 씁니다. 아제나의 축복은 켜면 고정 6,000을 그대로
        더합니다.
      </p>
    </div>
  )
}

function WeaponAttackBreakdown({ breakdown, enabledConditionalKeys, onToggleConditional }) {
  const [expandedStackKey, setExpandedStackKey] = useState(null)
  const showConditionals = typeof onToggleConditional === 'function'
  const groups = [
    ['base', '무기 기본값'],
    ['flat', '고정 증가'],
    ['percent', '퍼센트 증가'],
    ...(showConditionals ? [['conditional', '전투 조건부 증가']] : []),
  ]
  const baseTotal = breakdown.base.reduce((sum, source) => sum + source.value, 0)
  const flatTotal = breakdown.flat.reduce((sum, source) => sum + source.value, 0)
  const percentTotal = breakdown.percent.reduce((sum, source) => sum + source.value, 0)
  const conditional = conditionalTotals(breakdown.conditional, enabledConditionalKeys, 'weapon')

  // 로스트아크 표준 스탯 공식: (기본값 + 고정 증가) × (1 + 퍼센트 증가)
  const totalFlat = flatTotal + conditional.flat
  const totalPercent = percentTotal + conditional.percent
  const weaponAttackTotal = breakdown.base.length
    ? (baseTotal + totalFlat) * (1 + totalPercent / 100)
    : null
  return (
    <div className="weapon-attack-breakdown">
      {weaponAttackTotal != null && (
        <div className="weapon-attack-total">
          <span>
            <small>최종 무기 공격력</small>
            <b>{numberText(weaponAttackTotal)}</b>
          </span>
          <code>
            ({numberText(baseTotal)} + {numberText(totalFlat)}) × (1 + {numberText(totalPercent)}%)
          </code>
        </div>
      )}
      <div className="weapon-attack-summary">
        <span>
          <small>무기 기본값</small>
          <b>
            {breakdown.base.length
              ? breakdown.base.map((source) => numberText(source.value)).join(' · ')
              : '미확인'}
          </b>
        </span>
        <span>
          <small>고정 증가 합계</small>
          <b>{breakdown.flat.length ? `+${numberText(flatTotal)}` : '미확인'}</b>
        </span>
        <span>
          <small>퍼센트 증가 합계</small>
          <b>{breakdown.percent.length ? `+${numberText(percentTotal)}%` : '미확인'}</b>
        </span>
      </div>

      {breakdown.base.length ||
      breakdown.flat.length ||
      breakdown.percent.length ||
      (showConditionals && breakdown.conditional.length) ? (
        <div className="weapon-attack-groups">
          {groups.map(([kind, label]) => {
            const sources = breakdown[kind]
            if (!sources.length) return null
            return (
              <section key={kind}>
                <h5>{label}</h5>
                {sources.map((source, index) => {
                  const rowKey = `${source.itemName}-${source.heading}-${source.value}-${index}`
                  if (kind !== 'conditional') {
                    return (
                      <div key={rowKey}>
                        <span>
                          <b>{source.itemType}</b>
                          <small>
                            {source.itemName} · {source.heading}
                          </small>
                          {source.context && (
                            <small className="source-context-text">"{source.context}"</small>
                          )}
                        </span>
                        <strong>
                          {source.kind === 'base' ? '' : source.value >= 0 ? '+' : ''}
                          {numberText(source.value)}
                          {source.percent ? '%' : ''}
                          {source.maxStacks && (
                            <small className="stack-detail">
                              ({source.perStackValue >= 0 ? '+' : ''}
                              {numberText(source.perStackValue)}
                              {source.percent ? '%' : ''} × {source.maxStacks}중첩)
                            </small>
                          )}
                        </strong>
                      </div>
                    )
                  }
                  const key = conditionalSourceKey('weapon', source, index)
                  const checked = enabledConditionalKeys.has(key)
                  const stackExpanded = expandedStackKey === key
                  return (
                    <div
                      className={`conditional-source-row${checked ? ' checked' : ''}`}
                      key={rowKey}
                    >
                      <div className="conditional-source-row-main">
                        <label className="conditional-source-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleConditional(key)}
                          />
                          <span>
                            <b>{source.itemType}</b>
                            <small>
                              {source.itemName} · {source.heading}
                            </small>
                          </span>
                        </label>
                        <span className="conditional-source-value">
                          <strong>
                            {source.value >= 0 ? '+' : ''}
                            {numberText(source.value)}
                            {source.percent ? '%' : ''}
                            {source.maxStacks && (
                              <small className="stack-detail">
                                ({source.appliedStacks}/{source.maxStacks}중첩 적용)
                              </small>
                            )}
                          </strong>
                          {source.maxStacks && (
                            <button
                              type="button"
                              className="conditional-stack-view-btn"
                              onClick={() => setExpandedStackKey(stackExpanded ? null : key)}
                            >
                              조건부 중첩 스택 보기
                            </button>
                          )}
                        </span>
                      </div>
                      {stackExpanded && source.maxStacks && (
                        <div className="conditional-stack-detail">
                          <p>{source.context}</p>
                          <div className="conditional-stack-detail-grid">
                            <span>
                              <small>스택당 값</small>
                              <b>
                                {source.perStackValue >= 0 ? '+' : ''}
                                {numberText(source.perStackValue)}
                                {source.percent ? '%' : ''}
                              </b>
                            </span>
                            <span>
                              <small>적용 중첩 (고정값)</small>
                              <b>{source.appliedStacks}중첩</b>
                            </span>
                            <span>
                              <small>최대 중첩</small>
                              <b>{source.maxStacks}중첩</b>
                            </span>
                            <span>
                              <small>적용값 = 스택당 값 × 적용 중첩</small>
                              <b>
                                {source.value >= 0 ? '+' : ''}
                                {numberText(source.value)}
                                {source.percent ? '%' : ''}
                              </b>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>
      ) : (
        <p className="weapon-attack-empty">
          장비 툴팁에서 무기 공격력 항목을 찾지 못했습니다. 캐릭터 정보를 갱신한 뒤 다시 확인하세요.
        </p>
      )}

      <p className="weapon-attack-note">
        최종 무기 공격력 = (기본값 + 고정 증가) × (1 + 퍼센트 증가).
        {showConditionals
          ? ' 전투 중 발동하는 조건부 항목은 체크한 경우에만 합계에 포함됩니다.'
          : ' 마을 기준에서는 전투 조건부를 제외합니다.'}{' '}
        장착 중인 아크그리드 코어의 "코어 옵션" 텍스트도 위 고정 증가/퍼센트 증가 출처에 자동으로
        포함됩니다.
      </p>
    </div>
  )
}

function BaseAttackRateBreakdown({
  facts,
  mainStat,
  weaponAttackTotal,
  pureAttackPower,
  finalBaseAttack,
}) {
  const flatSources = facts.flatSources || []
  const flatTotal = flatSources.reduce((sum, source) => sum + source.value, 0)
  return (
    <div className="weapon-attack-breakdown">
      {pureAttackPower != null && (
        <div className="weapon-attack-total base-attack-power">
          <span>
            <small>기본 공격력</small>
            <b>{numberText(pureAttackPower)}</b>
          </span>
          <code>
            √({numberText(mainStat.value)} × {numberText(weaponAttackTotal)} ÷ 6)
          </code>
        </div>
      )}
      {finalBaseAttack != null && (
        <div className="weapon-attack-total">
          <span>
            <small>최종 기본 공격력</small>
            <b>{numberText(finalBaseAttack)}</b>
          </span>
          <code>
            ({numberText(pureAttackPower)} + {numberText(flatTotal)}) × (1 +{' '}
            {numberText(facts.total)}%)
          </code>
        </div>
      )}
      {flatSources.length || facts.sources.length ? (
        <div className="weapon-attack-groups single-column">
          {flatSources.length > 0 && (
            <section>
              <h5>기본 공격력 고정 증가 출처</h5>
              {flatSources.map((source, index) => (
                <div key={`base-flat-${source.itemName}-${index}`}>
                  <span>
                    <b>{source.itemType}</b>
                    <small>{source.itemName}</small>
                    {source.context && (
                      <small className="source-context-text">"{source.context}"</small>
                    )}
                  </span>
                  <strong>+{numberText(source.value)}</strong>
                </div>
              ))}
            </section>
          )}
          {facts.sources.length > 0 && (
            <section>
              <h5>기본 공격력 퍼센트 증가 출처</h5>
              {facts.sources.map((source, index) => (
                <div key={`${source.itemName}-${index}`}>
                  <span>
                    <b>{source.itemType}</b>
                    <small>{source.itemName}</small>
                    {source.context && (
                      <small className="source-context-text">"{source.context}"</small>
                    )}
                  </span>
                  <strong>+{numberText(source.value)}%</strong>
                </div>
              ))}
            </section>
          )}
        </div>
      ) : (
        <p className="weapon-attack-empty">
          장비·아크패시브·아크그리드·보석 효과에서 기본 공격력 증가 항목을 찾지 못했습니다.
        </p>
      )}
      <p className="weapon-attack-note">
        최종 기본 공격력 = (기본 공격력(√(주스탯 × 무기 공격력 ÷ 6)) + 고정 증가) × (1 +
        기본 공격력 증가 배율 합계).
      </p>
    </div>
  )
}

function AttackPowerBreakdown({
  breakdown,
  finalBaseAttack,
  finalAttackPower,
  apiAttack,
  enabledConditionalKeys,
  onToggleConditional,
}) {
  const [expandedStackKey, setExpandedStackKey] = useState(null)
  const showConditionals = typeof onToggleConditional === 'function'
  const flatTotal = breakdown.flat.reduce((sum, source) => sum + source.value, 0)
  const percentTotal = breakdown.percent.reduce((sum, source) => sum + source.value, 0)
  const conditional = conditionalTotals(breakdown.conditional, enabledConditionalKeys, 'attack')
  const totalFlat = flatTotal + conditional.flat
  const totalPercent = percentTotal + conditional.percent
  const groups = [
    ['flat', '고정 증가 (FLAT_ATK)'],
    ['percent', '퍼센트 증가 (ATK_RATE)'],
    ...(showConditionals ? [['conditional', '전투 조건부 증가']] : []),
  ]
  return (
    <div className="weapon-attack-breakdown">
      {finalAttackPower != null && (
        <div className="weapon-attack-total">
          <span>
            <small>최종 공격력{apiAttack ? ` · API 값 ${numberText(apiAttack)}` : ''}</small>
            <b>{numberText(finalAttackPower)}</b>
          </span>
          <code>
            ({numberText(finalBaseAttack)} + {numberText(totalFlat)}) × (1 +{' '}
            {numberText(totalPercent)}%)
          </code>
        </div>
      )}
      {breakdown.flat.length ||
      breakdown.percent.length ||
      (showConditionals && breakdown.conditional.length) ? (
        <div className="weapon-attack-groups">
          {groups.map(([kind, label]) => {
            const list = breakdown[kind]
            if (!list.length) return null
            return (
              <section key={kind}>
                <h5>{label}</h5>
                {list.map((source, index) => {
                  const rowKey = `${source.itemName}-${source.heading}-${index}`
                  if (kind !== 'conditional') {
                    return (
                      <div key={rowKey}>
                        <span>
                          <b>{source.itemType}</b>
                          <small>
                            {source.itemName} · {source.heading}
                          </small>
                          {source.context && (
                            <small className="source-context-text">"{source.context}"</small>
                          )}
                        </span>
                        <strong>
                          {source.value >= 0 ? '+' : ''}
                          {numberText(source.value)}
                          {source.percent ? '%' : ''}
                        </strong>
                      </div>
                    )
                  }
                  const key = conditionalSourceKey('attack', source, index)
                  const checked = enabledConditionalKeys.has(key)
                  const stackExpanded = expandedStackKey === key
                  return (
                    <div
                      className={`conditional-source-row${checked ? ' checked' : ''}`}
                      key={rowKey}
                    >
                      <div className="conditional-source-row-main">
                        <label className="conditional-source-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleConditional(key)}
                          />
                          <span>
                            <b>{source.itemType}</b>
                            <small>
                              {source.itemName} · {source.heading}
                            </small>
                          </span>
                        </label>
                        <span className="conditional-source-value">
                          <strong>
                            {source.value >= 0 ? '+' : ''}
                            {numberText(source.value)}
                            {source.percent ? '%' : ''}
                            {source.maxStacks && (
                              <small className="stack-detail">
                                ({source.appliedStacks}/{source.maxStacks}중첩 적용)
                              </small>
                            )}
                          </strong>
                          {source.maxStacks ? (
                            <button
                              type="button"
                              className="conditional-stack-view-btn"
                              onClick={() => setExpandedStackKey(stackExpanded ? null : key)}
                            >
                              조건부 중첩 스택 보기
                            </button>
                          ) : (
                            source.context && (
                              <small className="source-context-text">"{source.context}"</small>
                            )
                          )}
                        </span>
                      </div>
                      {stackExpanded && source.maxStacks && (
                        <div className="conditional-stack-detail">
                          <p>{source.context}</p>
                          <div className="conditional-stack-detail-grid">
                            <span>
                              <small>스택당 값</small>
                              <b>
                                {source.perStackValue >= 0 ? '+' : ''}
                                {numberText(source.perStackValue)}
                                {source.percent ? '%' : ''}
                              </b>
                            </span>
                            <span>
                              <small>적용 중첩 (고정값)</small>
                              <b>{source.appliedStacks}중첩</b>
                            </span>
                            <span>
                              <small>최대 중첩</small>
                              <b>{source.maxStacks}중첩</b>
                            </span>
                            <span>
                              <small>적용값 = 스택당 값 × 적용 중첩</small>
                              <b>
                                {source.value >= 0 ? '+' : ''}
                                {numberText(source.value)}
                                {source.percent ? '%' : ''}
                              </b>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>
      ) : (
        <p className="weapon-attack-empty">
          장비·각인·아크패시브·아크그리드에서 공격력 증가 항목을 찾지 못했습니다.
        </p>
      )}
      <p className="weapon-attack-note">
        최종 공격력 = (최종 기본 공격력 + 공격력 고정 증가) × (1 + 공격력 퍼센트 증가). 전투
        {showConditionals
          ? ' 조건부(중첩·버프 등)는 체크한 경우에만 합계에 포함됩니다.'
          : ' 조건부(중첩·버프 등)는 마을 기준 계산에서 제외합니다.'}{' '}
        아크그리드 코어 옵션은 API 코어 포인트가 충족된 구간만 반영했고, 아크그리드 젬은 개별 옵션을
        다시 더하면 이중 합산이 되어 API가 제공하는 합산치 하나만 사용합니다.
      </p>
    </div>
  )
}

// 주 스탯 → 무기 공격력 → 기본 공격력 → 최종 공격력의 네 단계를 같은 깊이로
// 배치하고, 단계별로 원할 때 접고 펼칠 수 있게 한다.
function AttackPowerStaircase({
  mainStatData,
  weaponAttack,
  weaponAttackTotal,
  mainStat,
  baseAttackRate,
  pureAttackPower,
  finalBaseAttack,
  attackPower,
  finalAttackPower,
  apiAttack,
  enabledConditionalKeys,
  onToggleConditional,
}) {
  const [openSteps, setOpenSteps] = useState(() => new Set([0, 1, 2, 3]))
  const toggleStep = (index) => {
    setOpenSteps((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }
  const steps = [
    { no: '①', title: `주 스탯 (${mainStatData.mainStatName})` },
    { no: '②', title: '무기 공격력' },
    {
      no: '③',
      title:
        '기본 공격력 = (√(주스탯 × 무기 공격력 ÷ 6) + 기본 공격력 고정 증가) × 기본 공격력 증가 배율',
    },
    { no: '④', title: '최종 공격력 = 기본 공격력 + 공격력 고정 증가, × (1 + 공격력 퍼센트 증가)' },
  ]
  const components = [
    <MainStatBreakdown breakdown={mainStatData} />,
    <WeaponAttackBreakdown
      breakdown={weaponAttack}
      enabledConditionalKeys={enabledConditionalKeys}
      onToggleConditional={onToggleConditional}
    />,
    <BaseAttackRateBreakdown
      facts={baseAttackRate}
      mainStat={mainStat}
      weaponAttackTotal={weaponAttackTotal}
      pureAttackPower={pureAttackPower}
      finalBaseAttack={finalBaseAttack}
    />,
    <AttackPowerBreakdown
      breakdown={attackPower}
      finalBaseAttack={finalBaseAttack}
      finalAttackPower={finalAttackPower}
      apiAttack={apiAttack}
      enabledConditionalKeys={enabledConditionalKeys}
      onToggleConditional={onToggleConditional}
    />,
  ]
  return (
    <div className="attack-power-staircase">
      {finalAttackPower != null && (
        <div className="weapon-attack-total staircase-final">
          <span>
            <small>최종 공격력{apiAttack ? ` · API 값 ${numberText(apiAttack)}` : ''}</small>
            <b>{numberText(finalAttackPower)}</b>
          </span>
        </div>
      )}
      {steps.map((step, index) => (
        <div className={`staircase-step${openSteps.has(index) ? ' is-open' : ''}`} key={step.no}>
          <button
            type="button"
            className="staircase-step-toggle"
            onClick={() => toggleStep(index)}
            aria-expanded={openSteps.has(index)}
          >
            <span>
              <em>{step.no}</em>
              {step.title}
            </span>
            <i aria-hidden="true">{openSteps.has(index) ? '−' : '+'}</i>
          </button>
          {openSteps.has(index) && (
            <div className="staircase-step-content">{components[index]}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function AdditionalDamageBreakdown({ label, sources, total, note }) {
  return (
    <div className="weapon-attack-breakdown">
      <div className="weapon-attack-total">
        <span>
          <small>{label} 합계</small>
          <b>
            {total >= 0 ? '+' : ''}
            {numberText(total)}%
          </b>
        </span>
      </div>
      {sources.length ? (
        <div className="weapon-attack-groups single-column">
          <section>
            <h5>{label} 출처</h5>
            {sources.map((source, index) => (
              <div key={`${source.itemName}-${source.heading || ''}-${index}`}>
                <span>
                  <b>{source.itemType}</b>
                  <small>
                    {source.itemName}
                    {source.heading ? ` · ${source.heading}` : ''}
                  </small>
                  {source.context && (
                    <small className="source-context-text">"{source.context}"</small>
                  )}
                </span>
                <strong>
                  {source.value >= 0 ? '+' : ''}
                  {numberText(source.value)}%
                </strong>
              </div>
            ))}
          </section>
        </div>
      ) : (
        <p className="weapon-attack-empty">해당 출처에서 {label} 항목을 찾지 못했습니다.</p>
      )}
      {note && <p className="weapon-attack-note">{note}</p>}
    </div>
  )
}

function CooldownReductionBreakdown({
  skillName,
  skillCategory,
  baseCooldown,
  percentSources,
  fixedSources,
  conditionalSources,
  percentTotal,
  fixedTotal,
  adjustedCooldown,
}) {
  const renderSources = (title, sources, conditional = false) =>
    sources.length ? (
      <section>
        <h5>{title}</h5>
        {sources.map((source, index) => (
          <div key={`${source.itemName}-${source.context || ''}-${index}`}>
            <span>
              <b>{source.itemType}</b>
              <small>
                {source.itemName}
                {source.heading ? ` · ${source.heading}` : ''}
              </small>
              {source.context && <small className="source-context-text">"{source.context}"</small>}
            </span>
            <strong>
              {conditional ? '조건부 · ' : ''}
              {source.value >= 0 ? '-' : '+'}
              {numberText(Math.abs(source.value))}
              {source.unit}
            </strong>
          </div>
        ))}
      </section>
    ) : null

  return (
    <div className="weapon-attack-breakdown">
      {adjustedCooldown != null && (
        <div className="weapon-attack-total">
          <span>
            <small>
              {skillName} · {damageOptionSkillCategoryLabel(skillCategory)}
            </small>
            <b>{numberText(adjustedCooldown)}초</b>
          </span>
          <code>
            {numberText(baseCooldown)}초 × (1 - {numberText(percentTotal)}%) -{' '}
            {numberText(fixedTotal)}초
          </code>
        </div>
      )}
      <div className="weapon-attack-groups single-column">
        {renderSources('재사용 대기시간 % 감소 출처', percentSources)}
        {renderSources('재사용 대기시간 고정 초 감소 출처', fixedSources)}
        {renderSources('조건부 · 현재 합계 제외', conditionalSources, true)}
      </div>
      <p className="weapon-attack-note">
        선택한 스킬의 {damageOptionSkillCategoryLabel(skillCategory)} 분류와 효과 문구의 스킬 종류가 일치할
        때만 반영합니다. 발동·보유 상태가 필요한 효과는 조건부 목록에만 표시하고 현재 재사용
        대기시간에서는 제외합니다.
      </p>
    </div>
  )
}

// deal.html 공식의 ADDITIONAL_DAMAGE = 1 + WEAPON_ADDITIONAL + PET_ADDITIONAL +
// ACCESSORY_ADDITIONAL + ELIXIR_ADDITIONAL + BRACELET_ADDITIONAL — 이 항들은
// 전부 합연산이라 무기/장신구/팔찌/펫 특기별로 섹션을 나누지 않고 한 목록에
// 모든 출처를 그대로 나열해 하나의 총합만 보여준다(무기 아이템 자체와
// 아크그리드 젬처럼 서로 다른 출처를 하나로 뭉치지 않고 각자 한 줄씩 유지).
function FinalAdditionalDamageBreakdown({ sources, total, note }) {
  const multiplier = 1 + total / 100
  return (
    <div className="weapon-attack-breakdown">
      <div className="weapon-attack-total">
        <span>
          <small>최종 추가 피해 합계</small>
          <b>+{numberText(total)}%</b>
        </span>
        <code>×{numberText(multiplier)}</code>
      </div>
      {sources.length ? (
        <div className="weapon-attack-groups single-column">
          <section>
            <h5>추가 피해 출처 (전부 합연산)</h5>
            {sources.map((source, index) => (
              <div key={`${source.itemName}-${source.heading || ''}-${index}`}>
                <span>
                  <b>{source.itemType}</b>
                  <small>
                    {source.itemName}
                    {source.heading ? ` · ${source.heading}` : ''}
                  </small>
                  {source.context && (
                    <small className="source-context-text">"{source.context}"</small>
                  )}
                </span>
                <strong>+{numberText(source.value)}%</strong>
              </div>
            ))}
          </section>
        </div>
      ) : (
        <p className="weapon-attack-empty">감지된 추가 피해 출처가 없습니다.</p>
      )}
      {note && <p className="weapon-attack-note">{note}</p>}
    </div>
  )
}

// deal.html 공식의 DAMAGE_INCREASE = ENGRAVING_DAMAGE × EVOLUTION_DAMAGE × ... 는
// 각 항이 (1 + 증가율)의 곱연산이다. 자동으로 값을 구할 수 있는 항목만 곱해서
// 하나의 배율로 보여주고, 아직 자동 감지가 안 되는 항목(보석·아크그리드·특화·
// 장비 세트)은 곱셈에서 빼고 Group 3의 별도 행으로 남겨둔다. items는
// 출처(값)가 있는 항목만 미리 걸러서 받고, 각 항목 아래에는 실제 게임 텍스트
// 출처를 그대로 인용해서 보여준다.
function FinalDamageIncreaseBreakdown({
  title,
  items,
  multiplier,
  totalPercent,
  showSign = true,
  emptyMessage,
  note,
}) {
  return (
    <div className="weapon-attack-breakdown">
      <div className="weapon-attack-total">
        <span>
          <small>{title}</small>
          <b>
            {showSign && totalPercent >= 0 ? '+' : ''}
            {numberText(totalPercent)}%
          </b>
        </span>
        <code>×{numberText(multiplier)}</code>
      </div>
      {items.length ? (
        <div className="weapon-attack-groups single-column">
          {items.map((item) => (
            <section key={item.key}>
              <h5>
                {item.label} · ×{numberText(1 + item.percent / 100)} ({item.percent >= 0 ? '+' : ''}
                {numberText(item.percent)}%)
              </h5>
              {item.sources.map((source, index) => (
                <div key={`${item.key}-${source.itemName}-${index}`}>
                  <span>
                    <b>{source.itemType}</b>
                    <small>
                      {source.itemName}
                      {source.heading ? ` · ${source.heading}` : ''}
                    </small>
                    {source.context && (
                      <small className="source-context-text">"{source.context}"</small>
                    )}
                  </span>
                  <strong>
                    {source.value >= 0 ? '+' : ''}
                    {numberText(source.value)}%
                  </strong>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p className="weapon-attack-empty">{emptyMessage}</p>
      )}
      <p className="weapon-attack-note">{note}</p>
    </div>
  )
}

function GemDamageBreakdown({ gems }) {
  return (
    <div className="weapon-attack-breakdown">
      {gems.length ? (
        <div className="weapon-attack-groups">
          <section>
            <h5>선택한 스킬에 연결된 보석</h5>
            {gems.map((gem, index) => (
              <div key={`${gem.slot}-${index}`}>
                <span>
                  <b>슬롯 {gem.slot}</b>
                  <small>{gem.text}</small>
                </span>
                <strong>{gem.option}</strong>
              </div>
            ))}
          </section>
        </div>
      ) : (
        <p className="weapon-attack-empty">이 스킬에 연결된 보석이 없습니다.</p>
      )}
      <p className="weapon-attack-note">
        보석 효과(피해 증가·재사용 대기시간 감소)는 스킬마다 다르며, 위 목록은 현재 선택한 스킬에
        연결된 보석만 보여줍니다.
      </p>
    </div>
  )
}

// 장착 스킬 목록 아래에 캐릭터가 가진 원본 데이터를 구분(장비/악세서리/팔찌/
// 트라이포드/아크그리드/아크패시브/보석/각인)별로 "줄" 단위로 전부 나열한다 —
// 데미지 계산에 이미 반영됐는지 여부와 무관하게, 툴팁에 적힌 문장을 한 줄씩
// 그대로 훑어볼 수 있게 하기 위한 참조용 모달이다(카드 UI가 아니라 raw 텍스트
// 목록). [태그] 줄 내용 형태로 보여준다 (예: [팔찌] 무기 공격력이 7800 증가한다).
const INVENTORY_CATEGORIES = [
  ['combatStat', '전투 특성'],
  ['arkPassivePoint', '아크패시브 포인트'],
  ['equipment', '장비'],
  ['accessory', '악세서리'],
  ['bracelet', '팔찌'],
  ['tripod', '스킬 트라이포드'],
  ['arkGrid', '아크그리드'],
  ['arkPassive', '아크패시브'],
  ['gem', '보석'],
  ['engraving', '각인'],
]

// "장비"·"악세서리" 탭에서 데미지 계산과 무관한 방어/생존 스탯·아크패시브
// 포인트 줄은 안 보이게 뺀다. \b는 한글에서 단어 경계로 작동하지 않아(한글이
// JS 정규식의 "word char"가 아님) 공백/줄끝 lookahead로 대체한다.
const EXCLUDED_EQUIPMENT_STAT_PATTERN =
  /^(물리 방어력|마법 방어력|생명 활성력|진화|깨달음|도약|체력)(?=\s|$)/

// 데미지 수치가 아니라 포인트/코어 위치를 나타내거나 조작감을 설명하는 원본 줄.
// 숨김 OFF에서는 원문 확인을 위해 다시 보여주지만 계산 출처로는 사용하지 않는다.
const EXCLUDED_DAMAGE_ANALYSIS_LINE_PATTERN =
  /^(?:\d+\s*포인트|도약\s*\+\s*[\d,]+|스킬 시전 중 경직에 면역이 된다\.?|(?:질서|혼돈)\s*-\s*(?:해|달|별))$/

function isExcludedDamageAnalysisLine(line) {
  return EXCLUDED_DAMAGE_ANALYSIS_LINE_PATTERN.test((line || '').trim())
}

// 장비·악세서리 "기본 효과"에는 힘·민첩·지능이 전부 나오지만 그중 캐릭터의
// 실제 주스탯 하나만 값이 적용되고 나머지 둘은 회색으로 표시되는 무의미한
// 자리다(원본 줄 목록은 색상 정보가 이미 지워진 뒤라 직접 구분 못 하므로,
// mainStatBreakdown이 이미 판별해둔 실제 주스탯 이름과 비교해서 걸러낸다).
function isIrrelevantMainStatLine(line, mainStatName) {
  const match = line.match(/^(힘|민첩|지능)(?=\s|$)/)
  return Boolean(match) && match[1] !== mainStatName
}

// 카테고리마다 원본 텍스트가 있는 자리가 다르다: 장비·악세서리·팔찌·아크그리드·
// 보석은 실제 툴팁 JSON이 있어 tooltipSections로 구간별 텍스트를 뽑고, 아크패시브는
// 구조가 달라 arkPassiveNodeText로 따로 뽑는다. 트라이포드는 Tooltip이 JSON이
// 아니라 순수 HTML 한 줄이고, 각인은 Tooltip 필드 자체가 없이 Description만 있다.
function rawLinesForItem(category, item) {
  if (category === 'combatStat') {
    const lines = [`${cleanApiText(item.Type || '')} ${numberText(item.Value)}`]
    lines.push(...combatStatTooltipLines(item))
    return [...new Set(lines.filter(Boolean))]
  }
  if (category === 'arkPassivePoint') {
    const name = cleanApiText(item.Name || '').trim()
    const value = Number(item.Value) || 0
    const description = cleanApiText(item.Description || '').trim()
    const lines = [`${name} ${numberText(value)} 포인트`]
    if (description) lines.push(description)
    const karma = parseKarmaDescription(description)
    if (karma) {
      if (name === '진화' && karma.evolutionPercent) {
        lines.push(`카르마 누적 보너스 · 진화형 피해 ${numberText(karma.evolutionPercent)}% 증가`)
      }
      if (name === '깨달음' && karma.weaponAttackPercent) {
        lines.push(
          `카르마 누적 보너스 · 무기 공격력 ${numberText(karma.weaponAttackPercent)}% 증가`,
        )
      }
      if (name === '도약' && karma.hyperAwakeningDamagePercent) {
        lines.push(
          `카르마 누적 보너스 · 초각성기 피해 ${numberText(karma.hyperAwakeningDamagePercent)}% 증가`,
        )
      }
    }
    return lines
  }
  if (category === 'tripod') {
    const line = cleanApiText(item.Tooltip || '')
    return line ? [line] : []
  }
  if (category === 'engraving') {
    const line = cleanApiText(item.Description || '')
    return line ? [line] : []
  }
  if (category === 'arkPassive') {
    const { text } = arkPassiveNodeText(item)
    return text
      .split('|')
      .map((line) => line.trim())
      .filter(Boolean)
  }
  const lines = []
  tooltipSections(item.Tooltip).forEach(({ text }) => {
    text
      .split('|')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => lines.push(line))
  })
  return lines
}

// 코어 옵션 활성 기준은 툴팁 안의 "15 포인트" 문구가 아니라 아크그리드 화면의
// arkgrid-core-point가 사용하는 공식 API ArkGrid.Slots[].Point 값이다.
function arkGridOwnedPoint(item) {
  const pointFromItem = Number(item?.Point)
  return Number.isFinite(pointFromItem) ? pointFromItem : 0
}

// 계산에서도 표시 필터와 같은 보유 포인트 기준을 공유한다.
function arkGridActiveCoreSegments(item) {
  const ownedPoint = arkGridOwnedPoint(item)
  return tooltipSections(item?.Tooltip)
    .filter(({ heading }) => heading === '코어 옵션')
    .flatMap(({ text }) => text.split(/(?=\[\d+P\])/g))
    .filter((segment) => {
      const pointMatch = segment.match(/^\[(\d+)P\]/)
      return pointMatch && Number(pointMatch[1]) <= ownedPoint
    })
}

// 아크그리드 코어 옵션은 "[17P]" 다음에 포인트 접두어가 없는 후속 설명이
// 이어질 수 있다. 새 "[nP]" 줄이 나오기 전까지를 같은 포인트 구간으로 보고,
// 현재 코어의 보유 포인트를 초과한 구간 전체를 원본 줄 목록에서 숨긴다.
function arkGridLinesWithinOwnedPoint(lines, item) {
  const ownedPoint = arkGridOwnedPoint(item)
  let requiredPoint = null
  return lines.filter((line) => {
    const pointMatch = line.match(/^\[(\d+)P\]/)
    if (pointMatch) requiredPoint = Number(pointMatch[1])
    return requiredPoint === null || requiredPoint <= ownedPoint
  })
}

// 아크그리드 코어 옵션 줄은 계산 함수마다 "[10P]" 같은 포인트 접두어를 남겨두기도
// 하고(무기 공격력·최종 공격력 쪽) 떼어내기도 해서(최종 추가 피해·최종 피해 증가
// 쪽), 원본 줄과 각 계산의 context를 그대로 비교하면 어긋난다. 매칭 전에 둘 다
// 접두어를 떼어내 맞춰준다.
const normalizeForMatch = (text) => (text || '').replace(/^\[\d+P\]\s*/, '').trim()

// 이미 계산된 breakdown들의 sources[].context(스캔한 원본 줄)를 모아 "이 줄이
// 실제로 어느 계산에 반영됐는지" 찾을 수 있는 색인을 만든다. 계산 로직을 다시
// 타지 않고 이미 화면에 쓰인 결과를 그대로 재사용하므로 Level 0 각인 제외,
// 조건부 제외, 이중 합산 방지 같은 규칙이 전부 그대로 반영된다.
function buildAppliedLineIndex({
  mainStatData,
  weaponAttack,
  baseAttackRate,
  attackPower,
  additionalDamageFinalSources,
  engravingDamage,
  massIncreaseDamage,
  raidCaptainDamage,
  evolutionDamage,
  enlightenmentDamage,
  leapDamage,
  outgoingDamage,
  cardDamage,
  critDamage,
  critHitBracelet,
  critRate,
  attackSpeed,
  receivedDamage,
  specializationDamage,
  gemItems,
}) {
  const index = new Map()
  const add = (context, label) => {
    const key = normalizeForMatch(context)
    if (!key) return
    if (!index.has(key)) index.set(key, new Set())
    index.get(key).add(label)
  }

  mainStatData.sources.forEach((s) =>
    add(s.context, `주 스탯(${mainStatData.mainStatName}) 고정 출처`),
  )
  weaponAttack.sources.forEach((s) => add(s.context, '무기 공격력'))
  baseAttackRate.sources.forEach((s) => add(s.context, '기본 공격력 증가 배율'))
  attackPower.sources.forEach((s) => add(s.context, '최종 공격력 (공격력 고정·퍼센트 증가)'))
  additionalDamageFinalSources.forEach((s) => add(s.context, '최종 추가 피해'))
  engravingDamage.sources.forEach((s) => add(s.context, '최종 피해 증가 · 각인 피해'))
  massIncreaseDamage.sources.forEach((s) => add(s.context, '질량 증가 피해 배율'))
  raidCaptainDamage.sources.forEach((s) => add(s.context, '최종 피해 증가 · 돌격대장'))
  evolutionDamage.unconditional.forEach((s) => add(s.context, '최종 피해 증가 · 진화형 피해'))
  evolutionDamage.conditional.forEach((s) => add(s.context, '진화형 피해 (조건부 · 합계 제외)'))
  enlightenmentDamage.unconditional.forEach((s) => add(s.context, '최종 피해 증가 · 깨달음형 피해'))
  enlightenmentDamage.conditional.forEach((s) =>
    add(s.context, '깨달음형 피해 (조건부 · 합계 제외)'),
  )
  leapDamage.unconditional.forEach((s) => add(s.context, '최종 피해 증가 · 도약형 피해'))
  leapDamage.conditional.forEach((s) => add(s.context, '도약형 피해 (조건부 · 합계 제외)'))
  outgoingDamage.groups.forEach((group) => {
    group.sources.forEach((s) => add(s.context, `최종 피해 증가 · ${group.label}`))
  })
  cardDamage.sources.forEach((s) => add(s.context, '최종 피해 증가 · 카드 피해'))
  critDamage.sources.forEach((s) => add(s.context, '치명타 피해 배율'))
  critHitBracelet.sources.forEach((s) => add(s.context, '치명타 시 주는 피해 배율'))
  critRate.sources.forEach((s) => add(s.context, '치명타 적중률'))
  attackSpeed.sources.forEach((s) => add(s.context, '공격 속도 증가'))
  receivedDamage.sources.forEach((s) => add(s.context, '적 받는 피해 배율'))
  specializationDamage.sources.forEach((s) => add(s.context, '최종 피해 증가 · 특화'))

  // 보석의 "기본 공격력" 줄은 API가 이미 전체 젬을 합산한 "기본 공격력 총합"
  // 하나로 묶어서 주기 때문에(이중 합산 방지를 위해 개별 젬 줄은 다시 스캔하지
  // 않음) baseAttackRate.sources에는 안 잡힌다. 그래도 실제로는 그 합산치에
  // 포함되는 값이라 여기서 따로 표시해준다.
  ;(gemItems || []).forEach((item) => {
    rawLinesForItem('gem', item).forEach((line) => {
      if (BASE_ATTACK_LINE_PATTERN.test(line)) add(line, '기본 공격력 증가 배율 (보석 합산에 포함)')
    })
  })

  return index
}

function lineTagForItem(category, item) {
  if (category === 'combatStat') return `전투 특성 · ${cleanApiText(item.Type || '')}`
  if (category === 'arkPassivePoint') return `아크패시브 포인트 · ${cleanApiText(item.Name || '')}`
  if (category === 'equipment' || category === 'accessory' || category === 'bracelet')
    return item.Type || '장비'
  if (category === 'tripod') return `트라이포드 · ${item.skillName}`
  if (category === 'arkGrid') return `아크그리드 · ${item.Name}`
  if (category === 'arkPassive') {
    const { nodeName } = arkPassiveNodeText(item)
    return `아크패시브(${item.Name}) · ${nodeName || item.Name}`
  }
  if (category === 'gem') return `보석 · ${cleanApiText(item.Name || '')}`
  if (category === 'engraving') return `각인 · ${item.Name}`
  return category
}

// 보석 슬롯(gem.Slot)이 어느 스킬에 연결됐는지는 ArmoryGem.Gems가 아니라
// ArmoryGem.Effects.Skills(슬롯별 스킬 매핑)에만 있다.
function gemLinkedSkillName(armory, gemSlot) {
  const effects = armory?.ArmoryGem?.Effects?.Skills || []
  return effects.find((effect) => effect.GemSlot === gemSlot)?.Name || null
}

// "기본 공격력" 증가 줄은 스킬을 안 가리고 상시 적용되는 보석 옵션이라 스킬
// 필터와 무관하게 항상 보여준다. 그 외(피해 증가·재사용 대기시간 감소 등)는
// 그 보석이 연결된 스킬이 현재 선택한 스킬일 때만 보여준다.
const BASE_ATTACK_LINE_PATTERN = /기본\s*공격력/

function gemRowsForSkill(armory, gemItems, selectedSkillName) {
  return gemItems.flatMap((item) => {
    const skillName = gemLinkedSkillName(armory, item.Slot)
    const tag = lineTagForItem('gem', item)
    return rawLinesForItem('gem', item)
      .filter((line) => BASE_ATTACK_LINE_PATTERN.test(line) || skillName === selectedSkillName)
      .map((line) => ({ tag, line }))
  })
}

// 현재 계산에 고정 중첩 수가 적용되는 항목을 원문과 함께 보여준다.
function DataizedConditionalsModal({ items, onClose }) {
  return (
    <div className="damage-formula-backdrop" onClick={onClose}>
      <section
        className="damage-formula-modal armory-lines-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>중첩 카운트 확인</h2>
            <p>
              현재 선택한 스킬 계산에 반영되는 중첩형 효과의 실제 원문과 적용 중첩 수입니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X />
          </button>
        </header>
        <div className="damage-formula-modal-body">
          {items.length ? (
            <ul className="armory-lines-list">
              {items.map((item, index) => (
                <li key={`${item.group}-${item.itemName}-${index}`}>
                  <span className="armory-line-text">
                    <b>[{item.group}]</b>
                    {item.itemName && ` ${item.itemName}`}
                    <small>"{item.context}"</small>
                  </span>
                  <span className="armory-line-applied">
                    현재 {numberText(item.appliedStacks)}중첩 적용
                    {item.perStackValue != null &&
                      ` · 1중첩 ${item.perStackValue >= 0 ? '+' : ''}${numberText(
                        item.perStackValue,
                      )}${item.percent ? '%' : ''}`}
                    {' · 최종 '}
                    {item.value >= 0 ? '+' : ''}
                    {numberText(item.value)}
                    {item.percent ? '%' : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="weapon-attack-empty">현재 적용되는 중첩형 효과가 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function ArmoryLinesModal({ armory, profile, skill, appliedLineIndex, mainStatName, onClose }) {
  const [activeCategory, setActiveCategory] = useState('combatStat')
  // 장비·악세서리의 방어/생존 스탯·주스탯 아닌 힘/민첩/지능 등을 기본은 숨기되,
  // 끄면 원본 그대로 전부 다시 보여준다.
  const [hideIrrelevantLines, setHideIrrelevantLines] = useState(true)
  const [hideUnavailableArkGridLines, setHideUnavailableArkGridLines] = useState(true)

  // BattleOverview.jsx와 같은 구분을 따른다: 나침반·부적은 전투 장비가 아니라
  // 아예 뺀다. 어빌리티 스톤은 장비가 아니라 악세서리 쪽(rightEquipmentTypes)에
  // 속한다.
  const equipment = (armory?.ArmoryEquipment || []).filter(
    (item) => !['나침반', '부적'].includes(item.Type),
  )
  const accessoryItems = equipment.filter((item) =>
    ['목걸이', '귀걸이', '반지', '어빌리티 스톤'].includes(item.Type),
  )
  const braceletItems = equipment.filter((item) => item.Type === '팔찌')
  // 보주·문장은 데미지 계산과 무관해 "장비" 탭에서 아예 뺀다(문장은 PvP 전용
  // 효과라 "모험가에게 피격 시"처럼 PvE 딜 계산과 상관없는 조건부뿐이다).
  const gearItems = equipment.filter(
    (item) =>
      !accessoryItems.includes(item) &&
      !braceletItems.includes(item) &&
      !['보주', '문장'].includes(item.Type),
  )
  // 트라이포드는 스킬마다 다른 항목이라 다른 카테고리처럼 전체를 나열하지 않고
  // 현재 선택한 스킬의 선택된 트라이포드만 보여준다.
  const tripodItems = (skill?.Tripods || [])
    .filter((tripod) => tripod.IsSelected)
    .map((tripod) => ({ ...tripod, skillName: skill?.Name }))
  const arkGridItems = armory?.ArkGrid?.Slots || []
  const arkPassiveItems = armory?.ArkPassive?.Effects || []
  const gemItems = armory?.ArmoryGem?.Gems || []
  const engravingItems =
    armory?.ArmoryEngraving?.ArkPassiveEffects || armory?.ArmoryEngraving?.Effects || []
  const combatStatItems = profile?.Stats || []
  const arkPassivePointItems = armory?.ArkPassive?.Points || []

  const dataByCategory = {
    combatStat: combatStatItems,
    arkPassivePoint: arkPassivePointItems,
    equipment: gearItems,
    accessory: accessoryItems,
    bracelet: braceletItems,
    tripod: tripodItems,
    arkGrid: arkGridItems,
    arkPassive: arkPassiveItems,
    gem: gemItems,
    engraving: engravingItems,
  }
  const items = dataByCategory[activeCategory] || []
  // 보석은 스킬-슬롯 매핑에 따라 줄 단위로 걸러야 해서 별도 함수로 뽑는다.
  const rows =
    activeCategory === 'gem'
      ? gemRowsForSkill(armory, gemItems, skill?.Name)
      : items.flatMap((item) => {
          const rawLines = rawLinesForItem(activeCategory, item)
          const hideNonDamageLines =
            activeCategory === 'arkGrid' ? hideUnavailableArkGridLines : hideIrrelevantLines
          const pointFilteredLines =
            activeCategory === 'arkGrid' && hideUnavailableArkGridLines
              ? arkGridLinesWithinOwnedPoint(rawLines, item)
              : rawLines

          return pointFilteredLines
            .filter(
              (line) =>
                (!hideNonDamageLines || !isExcludedDamageAnalysisLine(line)) &&
                (!hideIrrelevantLines ||
                  !['equipment', 'accessory'].includes(activeCategory) ||
                  (!EXCLUDED_EQUIPMENT_STAT_PATTERN.test(line) &&
                    !isIrrelevantMainStatLine(line, mainStatName))),
            )
            .map((line) => ({ tag: lineTagForItem(activeCategory, item), line }))
        })

  return (
    <div className="damage-formula-backdrop" onClick={onClose}>
      <section
        className="damage-formula-modal armory-lines-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2>보유 데이터 원본 줄 목록</h2>
            <p>
              구분을 고르면 그 아이템들의 툴팁을 한 줄씩 그대로 나열합니다. 트라이포드·보석은 현재
              선택한 스킬({skill?.Name})에 해당하는 것만 보여줍니다(보석의 "기본 공격력" 줄은 스킬과
              무관해 항상 표시). 각 줄 오른쪽에 지금 어느 계산에 실제로 반영 중인지도 표시됩니다.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기">
            <X />
          </button>
        </header>
        <div className="armory-lines-toolbar">
          <span>
            {activeCategory === 'arkGrid'
              ? '보유 포인트 초과 옵션·코어 위치 표기 숨김'
              : activeCategory === 'bracelet'
                ? '도약 포인트·경직 면역 문구 숨김'
                : '방어/생존 스탯·주스탯 아닌 힘·민첩·지능 숨김처리'}
          </span>
          <button
            type="button"
            className={`azena-toggle${
              (activeCategory === 'arkGrid' ? hideUnavailableArkGridLines : hideIrrelevantLines)
                ? ' active'
                : ''
            }`}
            onClick={() =>
              activeCategory === 'arkGrid'
                ? setHideUnavailableArkGridLines((current) => !current)
                : setHideIrrelevantLines((current) => !current)
            }
            aria-pressed={
              activeCategory === 'arkGrid' ? hideUnavailableArkGridLines : hideIrrelevantLines
            }
          >
            {(activeCategory === 'arkGrid' ? hideUnavailableArkGridLines : hideIrrelevantLines)
              ? 'ON'
              : 'OFF'}
          </button>
        </div>
        <div className="armory-inventory-tabs">
          {INVENTORY_CATEGORIES.map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={activeCategory === key ? 'active' : ''}
              onClick={() => setActiveCategory(key)}
            >
              {label}
              <em>{(dataByCategory[key] || []).length}</em>
            </button>
          ))}
        </div>
        <div className="damage-formula-modal-body armory-lines-body">
          {rows.length ? (
            <ul className="armory-lines-list">
              {rows.map((row, index) => {
                const applied = appliedLineIndex.get(normalizeForMatch(row.line))
                return (
                  <li key={`${row.tag}-${index}`}>
                    <span className="armory-line-text">
                      <b>[{row.tag}]</b> {row.line}
                    </span>
                    {applied ? (
                      <span className="armory-line-applied">
                        적용 중 · {[...applied].join(', ')}
                      </span>
                    ) : (
                      <span className="armory-line-unapplied">미적용</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="weapon-attack-empty">해당 구분에 데이터가 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  )
}

const variableGroups = [
  {
    title: '1. 스킬 공격력 계산',
    items: [
      [
        'ATTACK_POWER_FINAL',
        '최종 공격력',
        '주 스탯 → 무기 공격력 → 기본 공격력 → 최종 공격력 순서로 자동 계산',
      ],
    ],
  },
  {
    title: '2. 추가 피해 계산',
    items: [
      [
        'ADDITIONAL_DAMAGE_FINAL',
        '최종 추가 피해',
        '무기·장신구·팔찌·펫 특기 추가 피해를 전부 더한 값 (엘릭서 추가 피해는 자동 감지 불가로 미포함)',
      ],
    ],
  },
  {
    title: '3. 피해 증가 계산',
    items: [
      [
        'DAMAGE_INCREASE_FINAL',
        '최종 피해 증가',
        '각인·돌격대장·진화·깨달음·종족·카드·질량증가·도약·주는피해 배율을 전부 곱한 값 (특화·장비 세트는 자동 감지 불가로 미포함)',
      ],
    ],
  },
  {
    title: '4. 적받는피해 증가 계산',
    items: [
      ['RECEIVED_DAMAGE', '적 받는 피해 배율', '피해 증폭·낙인·서포터 효과를 모두 합친 단일 배율'],
      [
        'DEFENSE_MULTIPLIER',
        '방어력 배율',
        '루메루스 기본 방어력 6,500 · 추가 데미지 감소 20% 기준',
      ],
    ],
  },
  {
    title: '5. 치명타 확률 계산',
    items: [['CRIT_RATE', '치명타 적중률', 'API 치명 환산값에 장비 효과를 합산']],
  },
  {
    title: '6. 치명타 피해 증가 계산',
    items: [
      [
        'CRIT_DAMAGE_FINAL',
        '최종 치명타 피해 배율',
        '기본 200%에 각인·장비·아크패시브·아크그리드의 치명타 피해 증가를 합산',
      ],
    ],
  },
  {
    title: '7. 치명타 시 주는 피해 계산',
    items: [
      [
        'CRIT_HIT_DAMAGE_FINAL',
        '치명타 시 주는 피해 배율',
        '진화 회심과 장비·아크패시브·아크그리드의 치명타 시 주는 피해를 별도 곱연산',
      ],
    ],
  },
]

// Cached wrappers for the heaviest tooltip-scanning breakdown functions, used only inside the
// component below - see memoizeN's comment above. Call sites just swap the plain function name
// for the "Cached" one; arguments and return values are unchanged.
const attackPowerBreakdownCached = memoizeN(attackPowerBreakdown)
const weaponAttackBreakdownCached = memoizeN(weaponAttackBreakdown)
const additionalDamageBreakdownCached = memoizeN(additionalDamageBreakdown)
const outgoingDamageBreakdownCached = memoizeN(outgoingDamageBreakdown)
// mainStatBreakdown is NOT wrapped here: its third argument is a fresh object literal built at
// every call site, so reference-equality caching would never hit anyway.
const arkPassiveTierDamageBreakdownCached = memoizeN(arkPassiveTierDamageBreakdown)
const baseAttackRateBreakdownCached = memoizeN(baseAttackRateBreakdown)
const critRateFactsCached = memoizeN(critRateFacts)
const critDamageBreakdownCached = memoizeN(critDamageBreakdown)
const gemFactsCached = memoizeN(gemFacts)

export default function DamageAnalysis({
  armory,
  profile,
  skills,
  siblings,
  onHover,
  mappedEffects = null,
  mappedSourceArmory = null,
}) {
  const { user } = useAuth()
  const [selectedName, setSelectedName] = useState(skills[0]?.Name || '')
  const [showAttackPowerFinalDetail, setShowAttackPowerFinalDetail] = useState(false)
  const [showAdditionalDamageFinalDetail, setShowAdditionalDamageFinalDetail] = useState(false)
  const [showDamageIncreaseFinalDetail, setShowDamageIncreaseFinalDetail] = useState(false)
  const [showReceivedDamageDetail, setShowReceivedDamageDetail] = useState(false)
  const [showDefenseMultiplierDetail, setShowDefenseMultiplierDetail] = useState(false)
  const [showGemDamageDetail, setShowGemDamageDetail] = useState(false)
  const [showCritDamageFinalDetail, setShowCritDamageFinalDetail] = useState(false)
  const [showCritHitDamageFinalDetail, setShowCritHitDamageFinalDetail] = useState(false)
  const [showCritRateDetail, setShowCritRateDetail] = useState(false)
  const [showAttackSpeedDetail, setShowAttackSpeedDetail] = useState(false)
  const [showMoveSpeedDetail, setShowMoveSpeedDetail] = useState(false)
  const [showCooldownReductionDetail, setShowCooldownReductionDetail] = useState(false)
  const [showAdrenalineDetail, setShowAdrenalineDetail] = useState(false)
  const [showKeenPenaltyDetail, setShowKeenPenaltyDetail] = useState(false)
  const [potionSourceInput, setPotionSourceInput] = useState('')
  const [cardBookInput, setCardBookInput] = useState('')
  const [azenaBlessing, setAzenaBlessing] = useState(false)
  const [eventFeastEnabled, setEventFeastEnabled] = useState(false)
  const [weaponAttackFeastEnabled, setWeaponAttackFeastEnabled] = useState(false)
  const [petTraitMainStatInput, setPetTraitMainStatInput] = useState('0')
  const [petTraitSpeciesDamageInput, setPetTraitSpeciesDamageInput] = useState('0')
  const [petTraitAdditionalInput, setPetTraitAdditionalInput] = useState('0')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [showFormulaModal, setShowFormulaModal] = useState(false)
  const [showDataizedConditionalsModal, setShowDataizedConditionalsModal] = useState(false)
  const [showArmoryLinesModal, setShowArmoryLinesModal] = useState(false)
  const [showBuffSettingGuide, setShowBuffSettingGuide] = useState(false)
  const [showDamageSettingsModal, setShowDamageSettingsModal] = useState(false)
  // 저장소에는 기록하지 않고, 이 화면이 열려 있는 동안 캐릭터별 입력만 유지한다.
  const [motionInputsByCharacter, setMotionInputsByCharacter] = useState({})
  const [enabledConditionalKeys, setEnabledConditionalKeys] = useState(() =>
    defaultEnabledConditionalKeys(armory),
  )

  useEffect(() => {
    if (!skills.some((skill) => skill.Name === selectedName)) setSelectedName(skills[0]?.Name || '')
  }, [selectedName, skills])

  // 아제나의 축복은 캐릭터마다 따로 켜고 끌 수 있어 캐릭터 단위로 저장하고,
  // 펫 특기·물약/카드도감 값은 원정대(계정) 전체가 공유하는 값이라 원정대
  // 단위로 저장한다 — 캐릭터를 바꿔도 같은 원정대면 다시 입력할 필요가 없다.
  const characterName = profile?.CharacterName || ''
  const motionCharacterKey = characterName || '__current_character__'
  const updateMotionInput = (skillKey, motionKey, field, value) => {
    setMotionInputsByCharacter((current) => ({
      ...current,
      [motionCharacterKey]: {
        ...current[motionCharacterKey],
        [skillKey]: {
          ...current[motionCharacterKey]?.[skillKey],
          [motionKey]: {
            ...current[motionCharacterKey]?.[skillKey]?.[motionKey],
            [field]: value,
          },
        },
      },
    }))
  }
  const expeditionKey = useMemo(
    () => expeditionKeyFromSiblings(siblings, characterName),
    [siblings, characterName],
  )
  useEffect(() => {
    const saved = characterName ? getDamageAnalysisSettingsFor(characterName, expeditionKey) : null
    setAzenaBlessing(Boolean(saved?.azenaBlessing))
    const savedEventFeastEnabled = Boolean(saved?.eventFeastEnabled)
    setEventFeastEnabled(savedEventFeastEnabled)
    setWeaponAttackFeastEnabled(!savedEventFeastEnabled && Boolean(saved?.weaponAttackFeastEnabled))
    setPetTraitMainStatInput(normalizePetTraitValue('petTraitMainStat', saved?.petTraitMainStat))
    setPetTraitSpeciesDamageInput(
      normalizePetTraitValue('petTraitSpeciesDamage', saved?.petTraitSpeciesDamage),
    )
    setPetTraitAdditionalInput(
      normalizePetTraitValue('petTraitAdditional', saved?.petTraitAdditional),
    )
    setPotionSourceInput(saved?.potionSource ?? '')
    setCardBookInput(saved?.cardBook ?? '')
    setSaveStatus('idle')
  }, [characterName, expeditionKey])

  // 캐릭터가 바뀌면 데이터화가 끝난 조건부만 기본 체크 상태로 되돌린다.
  useEffect(() => {
    setEnabledConditionalKeys(defaultEnabledConditionalKeys(armory))
  }, [characterName])

  const handleToggleConditional = (key) => {
    setEnabledConditionalKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleToggleEventFeast = () => {
    const next = !eventFeastEnabled
    setEventFeastEnabled(next)
    if (next) setWeaponAttackFeastEnabled(false)
  }

  const handleToggleWeaponAttackFeast = () => {
    const next = !weaponAttackFeastEnabled
    setWeaponAttackFeastEnabled(next)
    if (next) setEventFeastEnabled(false)
  }

  // 저장한 뒤 값을 더 건드리면 "저장됨" 표시가 안 맞으므로 다시 idle로 되돌린다.
  useEffect(() => {
    setSaveStatus('idle')
  }, [
    azenaBlessing,
    eventFeastEnabled,
    weaponAttackFeastEnabled,
    petTraitMainStatInput,
    petTraitSpeciesDamageInput,
    petTraitAdditionalInput,
    potionSourceInput,
    cardBookInput,
  ])

  const handleSaveDamageSettings = () => {
    if (!characterName) return
    saveDamageAnalysisSettingsFor(characterName, expeditionKey, {
      azenaBlessing,
      eventFeastEnabled,
      weaponAttackFeastEnabled,
      petTraitMainStat: petTraitMainStatInput,
      petTraitSpeciesDamage: petTraitSpeciesDamageInput,
      petTraitAdditional: petTraitAdditionalInput,
      potionSource: potionSourceInput,
      cardBook: cardBookInput,
    })
    setSaveStatus('saved')
    setShowDamageSettingsModal(false)
  }

  const handleCancelDamageSettings = () => {
    const saved = characterName ? getDamageAnalysisSettingsFor(characterName, expeditionKey) : null
    setAzenaBlessing(Boolean(saved?.azenaBlessing))
    const savedEventFeastEnabled = Boolean(saved?.eventFeastEnabled)
    setEventFeastEnabled(savedEventFeastEnabled)
    setWeaponAttackFeastEnabled(!savedEventFeastEnabled && Boolean(saved?.weaponAttackFeastEnabled))
    setPetTraitMainStatInput(normalizePetTraitValue('petTraitMainStat', saved?.petTraitMainStat))
    setPetTraitSpeciesDamageInput(
      normalizePetTraitValue('petTraitSpeciesDamage', saved?.petTraitSpeciesDamage),
    )
    setPetTraitAdditionalInput(
      normalizePetTraitValue('petTraitAdditional', saved?.petTraitAdditional),
    )
    setPotionSourceInput(saved?.potionSource ?? '')
    setCardBookInput(saved?.cardBook ?? '')
    setShowDamageSettingsModal(false)
  }

  const skill = skills.find((item) => item.Name === selectedName) || skills[0]
  const stats = useMemo(
    () => Object.fromEntries((profile.Stats || []).map((stat) => [stat.Type, stat.Value])),
    [profile.Stats],
  )
  const combatStats = combatStatConversions(stats)

  if (!skill)
    return (
      <section className="battle-panel damage-analysis-empty">
        <Swords />
        <b>분석할 스킬이 없습니다.</b>
        <span>캐릭터 정보를 갱신한 뒤 다시 확인하세요.</span>
      </section>
    )

  const facts = tooltipFacts(skill)
  const mappedMode = Array.isArray(mappedEffects)
  // 카르마 랭크·레벨은 매핑 대상 원문이 아니라 API Point.Description에서
  // 별도로 읽는 고정 데이터다. 데미지 분석 2용 armory는 미매핑 Description을
  // 비우므로 반드시 필터링 전 원본 armory를 사용해야 한다.
  const karmaSourceArmory = mappedSourceArmory || armory
  const karmaFacts = arkPassiveKarmaFacts(karmaSourceArmory)
  const evolutionKarma = karmaFacts.진화
  const enlightenmentKarma = karmaFacts.깨달음
  const leapKarma = karmaFacts.도약
  const supportArkPassiveBuild = isSupportArkPassiveBuild(karmaSourceArmory)
  const automaticMappedKarmaEffects = mappedMode
    ? [
        ...(evolutionKarma?.evolutionPercent
          ? [
              {
                type: supportArkPassiveBuild
                  ? 'BRAND_POWER_PERCENT'
                  : 'DAMAGE_INCREASE_PERCENT',
                value: evolutionKarma.evolutionPercent,
                baseValue: evolutionKarma.evolutionPercent,
                condition: 'ALWAYS',
                label: supportArkPassiveBuild ? '낙인력' : '진화형 피해',
                skillNames: [],
                skillCategories: [],
                origin: '아크 패시브 카르마 · 진화',
                template: `${evolutionKarma.rank}랭크 ${evolutionKarma.level}레벨`,
                source: supportArkPassiveBuild
                  ? `카르마 누적 보너스 · 낙인력 ${evolutionKarma.evolutionPercent}% 증가`
                  : `카르마 누적 보너스 · 진화형 피해 ${evolutionKarma.evolutionPercent}% 증가`,
              },
            ]
          : []),
        ...(enlightenmentKarma?.weaponAttackPercent
          ? [
              {
                type: 'WEAPON_ATTACK_PERCENT',
                value: enlightenmentKarma.weaponAttackPercent,
                baseValue: enlightenmentKarma.weaponAttackPercent,
                condition: 'ALWAYS',
                label: '무기 공격력',
                skillNames: [],
                skillCategories: [],
                origin: '아크 패시브 카르마 · 깨달음',
                template: `${enlightenmentKarma.rank}랭크 ${enlightenmentKarma.level}레벨`,
                source: `카르마 누적 보너스 · 무기 공격력 ${enlightenmentKarma.weaponAttackPercent}% 증가`,
              },
            ]
          : []),
        ...(leapKarma?.hyperAwakeningDamagePercent
          ? [
              {
                type: 'DAMAGE_INCREASE_PERCENT',
                value: leapKarma.hyperAwakeningDamagePercent,
                baseValue: leapKarma.hyperAwakeningDamagePercent,
                condition: 'ALWAYS',
                label: '초각성기 피해',
                skillNames: [],
                skillCategories: ['초각성기'],
                origin: '아크 패시브 카르마 · 도약',
                template: `${leapKarma.rank}랭크 ${leapKarma.level}레벨 · 초각성기`,
                source: `카르마 누적 보너스 · 초각성기 피해 ${leapKarma.hyperAwakeningDamagePercent}% 증가`,
              },
            ]
          : []),
      ]
    : []
  const mappedEffectsForSkill = mappedMode
    ? [...mappedEffects, ...automaticMappedKarmaEffects].filter((effect) => {
          const targetSkillNames = effect.skillNames?.length
            ? effect.skillNames
            : effect.skillName
              ? [effect.skillName]
              : []
          const targetSkillCategories = effect.skillCategories || []
          const selectedSkillCategory = damageOptionSkillCategory(skill)
          const hasExplicitSkillTarget =
            targetSkillNames.length > 0 || targetSkillCategories.length > 0
          if (
            hasExplicitSkillTarget &&
            !targetSkillNames.includes(skill.Name) &&
            !targetSkillCategories.includes(selectedSkillCategory)
          ) {
            return false
          }
          if (
            !hasExplicitSkillTarget &&
            effect.sourceSkillName &&
            effect.sourceSkillName !== skill.Name
          ) {
            return false
          }
          if (!effect.condition || effect.condition === 'ALWAYS') return true
          if (effect.condition === 'BACK_ATTACK') return facts.attackTypes.includes('백 어택')
          if (effect.condition === 'HEAD_ATTACK') return facts.attackTypes.includes('헤드 어택')
          return false
        })
    : []
  const mappedSources = (type) =>
    mappedEffectsForSkill
      .filter((effect) => effect.type === type)
      .map((effect) => {
        const explicitNames = effect.skillNames?.length
          ? effect.skillNames
          : effect.skillName
            ? [effect.skillName]
            : []
        const explicitCategories = effect.skillCategories || []
        const targetLabel = [
          ...explicitCategories.map(damageOptionSkillCategoryLabel),
          ...explicitNames,
        ].join(', ')
        const automaticTarget = !targetLabel && effect.sourceSkillName
        return {
          value: Number(effect.value) || 0,
          baseValue: Number(effect.baseValue) || 0,
          itemType: '등록 데이터',
          itemName: targetLabel
            ? `${effect.origin || '매핑 원문'} · ${targetLabel} 전용`
            : automaticTarget
              ? `${effect.origin || '매핑 원문'} · ${effect.sourceSkillName} 전용 (출처 자동)`
              : effect.origin || '매핑 원문',
          heading: [effect.template || type, effect.label].filter(Boolean).join(' · '),
          context: effect.source,
          condition: effect.condition || 'ALWAYS',
          maxStacks: effect.stack?.maxStacks ?? null,
          appliedStacks: effect.stack?.appliedStacks ?? null,
          perStackValue: effect.stack ? Number(effect.baseValue) || 0 : null,
          percent: type.endsWith('_PERCENT'),
        }
      })
  const motionHits = skillMotionHits(skill)
  const baseAttackTooltip = profileBaseAttackPower(profile)
  const storedMotionConstants = invenMotionConstants(profile, skill)
  const motionInputs = motionInputsByCharacter[motionCharacterKey]?.[skill.Name] || {}
  const motionRepeat = (motion) => {
    const input = motionInputs[motion.key]?.repeat
    if (String(input ?? '').trim() === '') return motion.repeat
    const parsed = Number(input)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : motion.repeat
  }
  const totalHitCount = motionHits.reduce((sum, motion) => sum + motionRepeat(motion), 0)
  const hitSummaryForSkill = (candidate) => {
    const motions = skillMotionHits(candidate)
    const saved = motionInputsByCharacter[motionCharacterKey]?.[candidate.Name] || {}
    const total = motions.reduce((sum, motion) => {
      const value = saved[motion.key]?.repeat
      const parsed = String(value ?? '').trim() === '' ? motion.repeat : Number(value)
      return sum + (Number.isFinite(parsed) ? Math.max(0, parsed) : motion.repeat)
    }, 0)
    return { total, motions: motions.length }
  }
  const selectedSkillCategory = damageOptionSkillCategory(skill)
  const skillMoveSpeed = skillMoveSpeedFacts(skills)
  const baseSkillCooldown = Number(facts.cooldown)
  const categoryCooldown = skillCategoryCooldownFacts(armory, selectedSkillCategory)
  const arkGridAttackSpeed = arkGridAttackSpeedFacts(armory)
  const activeFeastName = eventFeastEnabled
    ? '이벤트 만찬'
    : weaponAttackFeastEnabled
      ? '무공 만찬'
      : ''
  const feastSpeedSource = activeFeastName
    ? {
        value: FEAST_SPEED_BONUS,
        itemType: '만찬',
        itemName: `${activeFeastName} · 공격속도/이동속도`,
        context: `공격속도와 이동속도 ${FEAST_SPEED_BONUS}% 증가`,
      }
    : null
  const attackSpeedSources = [
    ...(combatStats.swiftness > 0
      ? [
          {
            value: combatStats.attackSpeed,
            itemType: 'API 전투 특성',
            itemName: `신속 ${numberText(combatStats.swiftness)} × ${SWIFT_SPEED_PER_POINT}%`,
          },
        ]
      : []),
    ...(mappedMode ? mappedSources('ATTACK_SPEED_PERCENT') : arkGridAttackSpeed.sources),
    ...(feastSpeedSource ? [feastSpeedSource] : []),
  ]
  const attackSpeed = {
    sources: attackSpeedSources,
    total: attackSpeedSources.reduce((sum, source) => sum + source.value, 0),
  }
  const moveSpeedSources = [
    ...(combatStats.swiftness > 0
      ? [
          {
            value: combatStats.moveSpeed,
            itemType: 'API 전투 특성',
            itemName: `신속 ${numberText(combatStats.swiftness)} × ${SWIFT_SPEED_PER_POINT}%`,
          },
        ]
      : []),
    ...(feastSpeedSource ? [feastSpeedSource] : []),
    ...(mappedMode ? mappedSources('MOVE_SPEED_PERCENT') : skillMoveSpeed.sources),
  ]
  const moveSpeed = {
    sources: moveSpeedSources,
    total: moveSpeedSources.reduce((sum, source) => sum + source.value, 0),
  }
  const cooldownReductionSources = [
    ...(combatStats.swiftness > 0
      ? [
          {
            value: combatStats.cooldownReduction,
            unit: '%',
            itemType: 'API 전투 특성',
            itemName: `신속 ${numberText(combatStats.swiftness)} × ${SWIFT_COOLDOWN_PER_POINT}%`,
          },
        ]
      : []),
    ...(mappedMode
      ? mappedSources('COOLDOWN_REDUCTION_PERCENT').map((source) => ({
          ...source,
          unit: '%',
        }))
      : categoryCooldown.active.filter((source) => source.unit === '%')),
  ]
  const cooldownFixedSources = mappedMode
    ? mappedSources('COOLDOWN_REDUCTION_FLAT').map((source) => ({
        ...source,
        unit: '초',
      }))
    : categoryCooldown.active.filter((source) => source.unit === '초')
  const cooldownReductionTotal = cooldownReductionSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const cooldownFixedTotal = cooldownFixedSources.reduce((sum, source) => sum + source.value, 0)
  const adjustedCooldown = Number.isFinite(baseSkillCooldown)
    ? Math.max(0, baseSkillCooldown * (1 - cooldownReductionTotal / 100) - cooldownFixedTotal)
    : null
  const tripods = selectedTripods(skill)
  const gems = gemFactsCached(armory, skill.Name)
  const arkGridEffects = armory?.ArkGrid?.Effects || []
  const mappedWeaponFlatSources = mappedMode
    ? mappedSources('WEAPON_ATTACK_FLAT').map((source) => ({ ...source, kind: 'base' }))
    : []
  const mappedWeaponPercentSources = mappedMode
    ? mappedSources('WEAPON_ATTACK_PERCENT').map((source) => ({ ...source, kind: 'percent' }))
    : []
  const weaponAttackBase = mappedMode
    ? {
        base: mappedWeaponFlatSources,
        flat: [],
        percent: mappedWeaponPercentSources,
        conditional: [],
        sources: [...mappedWeaponFlatSources, ...mappedWeaponPercentSources],
      }
    : weaponAttackBreakdownCached(armory)
  const weaponAttackFeastSource = weaponAttackFeastEnabled
    ? {
        kind: 'flat',
        value: WEAPON_ATTACK_FEAST_BONUS,
        perStackValue: null,
        maxStacks: null,
        percent: false,
        itemType: '만찬',
        itemName: '무공 만찬',
        heading: '무기 공격력',
        context: `무기 공격력 ${numberText(WEAPON_ATTACK_FEAST_BONUS)} 증가`,
      }
    : null
  const weaponAttack = weaponAttackFeastSource
    ? {
        ...weaponAttackBase,
        flat: [...weaponAttackBase.flat, weaponAttackFeastSource],
        sources: [...weaponAttackBase.sources, weaponAttackFeastSource],
      }
    : weaponAttackBase
  // 펫 특기는 API로 확인이 안 돼 사용자 선택을 받는다. 세 종류 모두 일반
  // 등급(0%)이 기본이고, 선택한 등급의 고정 수치를 각 계산에 반영한다.
  const petTraitMainStatPercent = parsePetTraitPercent(petTraitMainStatInput, 0)
  const petTraitSpeciesDamagePercent = parsePetTraitPercent(petTraitSpeciesDamageInput, 0)
  const petTraitAdditionalPercent = parsePetTraitPercent(petTraitAdditionalInput, 0)
  const detectedMainStatData = mainStatBreakdown(mappedSourceArmory || armory, profile, {
    potionSourceInput,
    cardBookInput,
    azenaBlessing,
    petTraitPercent: petTraitMainStatPercent,
  })
  const mappedMainStatName = detectedMainStatData.mainStatName
  const isMappedMainStatSource = (source) => {
    const namedStat = source.context?.match(/^(힘|민첩|지능)(?=\s|$)/)?.[1]
    return !namedStat || namedStat === mappedMainStatName
  }
  const mappedMainStatFlatSources = mappedMode
    ? mappedSources('MAIN_STAT_FLAT')
        .filter(isMappedMainStatSource)
        .map((source) => ({ ...source, stat: mappedMainStatName }))
    : []
  const mappedMainStatPercentSources = mappedMode
    ? mappedSources('MAIN_STAT_PERCENT')
        .filter(isMappedMainStatSource)
        .map((source) => ({ ...source, stat: mappedMainStatName }))
    : []
  const mappedMainStatValue = mappedMainStatFlatSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const mappedMainStatPercent = mappedMainStatPercentSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const mappedMainStatFixedTotal =
    mappedMainStatValue +
    detectedMainStatData.expeditionBonus +
    detectedMainStatData.levelStatBonus +
    detectedMainStatData.potionBonus +
    detectedMainStatData.cardBookBonus +
    detectedMainStatData.azenaBonus
  const mainStatData = mappedMode
    ? {
        ...detectedMainStatData,
        totals: {
          힘: mappedMainStatName === '힘' ? mappedMainStatValue : 0,
          민첩: mappedMainStatName === '민첩' ? mappedMainStatValue : 0,
          지능: mappedMainStatName === '지능' ? mappedMainStatValue : 0,
        },
        mainStatValue: mappedMainStatValue,
        mainStatPercent: mappedMainStatPercent + petTraitMainStatPercent,
        totalFixedStat: mappedMainStatFixedTotal,
        mainStatFinal:
          mappedMainStatFixedTotal *
          (1 + (mappedMainStatPercent + petTraitMainStatPercent) / 100),
        sources: mappedMainStatFlatSources,
        percentSources: mappedMainStatPercentSources,
      }
    : detectedMainStatData
  const mainStat = { name: mainStatData.mainStatName, value: mainStatData.mainStatFinal }
  const attack = stats['공격력']

  const mappedBaseAttackPercentSources = mappedMode
    ? mappedSources('BASE_ATTACK_PERCENT')
    : []
  const mappedBaseAttackFlatSources = mappedMode ? mappedSources('BASE_ATTACK_FLAT') : []
  const baseAttackRate = mappedMode
    ? {
        sources: mappedBaseAttackPercentSources,
        flatSources: mappedBaseAttackFlatSources,
        total: mappedBaseAttackPercentSources.reduce((sum, source) => sum + source.value, 0),
      }
    : baseAttackRateBreakdownCached(armory)
  const mappedAttackFlatSources = mappedMode
    ? mappedSources('ATTACK_POWER_FLAT').map((source) => ({ ...source, kind: 'flat' }))
    : []
  const mappedAttackPercentSources = mappedMode
    ? mappedSources('ATTACK_POWER_PERCENT').map((source) => ({ ...source, kind: 'percent' }))
    : []
  const attackPower = mappedMode
    ? {
        flat: mappedAttackFlatSources,
        percent: mappedAttackPercentSources,
        conditional: [],
        sources: [...mappedAttackFlatSources, ...mappedAttackPercentSources],
      }
    : attackPowerBreakdownCached(armory)
  const mappedBaseAttackFlatTotal = mappedBaseAttackFlatSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const adrenalineAttackSources = attackPower.conditional
    .map((source, index) => ({ source, key: conditionalSourceKey('attack', source, index) }))
    .filter(
      ({ source, key }) => source.itemName === '아드레날린' && enabledConditionalKeys.has(key),
    )
    .map(({ source }) => source)
  const adrenalineAttackTotal = adrenalineAttackSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const mappedStackCountItems = mappedMode
    ? mappedEffectsForSkill.flatMap((effect) => {
        const appliedStacks = Number(effect.stack?.appliedStacks ?? effect.stackCount)
        if (!Number.isFinite(appliedStacks) || appliedStacks <= 1) return []
        return [
          {
            group:
              DAMAGE_EFFECT_TYPES.find((candidate) => candidate.value === effect.type)?.label ||
              effect.type,
            itemName: effect.origin || '매핑 원문',
            context: effect.source || effect.template || '',
            appliedStacks,
            maxStacks: Number(effect.stack?.maxStacks) || appliedStacks,
            perStackValue: Number(effect.baseValue) || 0,
            value: Number(effect.value) || 0,
            percent: effect.type?.endsWith('_PERCENT'),
          },
        ]
      })
    : []
  const dataizedConditionalItems = mappedMode
    ? mappedStackCountItems
    : [
        ...weaponAttack.conditional
          .filter((source) => source.maxStacks && isDataizedConditionalSource(source))
          .map((source) => ({ ...source, group: '무기 공격력' })),
        ...attackPower.conditional
          .filter((source) => source.maxStacks && isDataizedConditionalSource(source))
          .map((source) => ({ ...source, group: '공격력' })),
      ]

  // 데미지 분석 2의 마을 기준 공격력에는 전투 중 쌓이는 고정 중첩 효과를
  // 항목 전체로 제외한다. 중첩 모달에는 그대로 남겨 실제 설정값을 확인할 수 있다.
  const withoutMappedStacks = (sources) =>
    mappedMode
      ? sources.filter((source) => Number(source.appliedStacks ?? 1) <= 1)
      : sources
  const townWeaponAttack = mappedMode
    ? {
        ...weaponAttack,
        base: withoutMappedStacks(weaponAttack.base),
        flat: withoutMappedStacks(weaponAttack.flat),
        percent: withoutMappedStacks(weaponAttack.percent),
        conditional: [],
        sources: withoutMappedStacks(weaponAttack.sources),
      }
    : weaponAttack
  const townAttackPower = mappedMode
    ? {
        ...attackPower,
        flat: withoutMappedStacks(attackPower.flat),
        percent: withoutMappedStacks(attackPower.percent),
        conditional: [],
        sources: withoutMappedStacks(attackPower.sources),
      }
    : attackPower
  const townBaseAttackPercentSources = withoutMappedStacks(baseAttackRate.sources)
  const townBaseAttackFlatSources = withoutMappedStacks(baseAttackRate.flatSources || [])
  const townBaseAttackRate = mappedMode
    ? {
        ...baseAttackRate,
        sources: townBaseAttackPercentSources,
        flatSources: townBaseAttackFlatSources,
        total: townBaseAttackPercentSources.reduce((sum, source) => sum + source.value, 0),
      }
    : baseAttackRate
  const townMainStatFlatSources = withoutMappedStacks(mappedMainStatFlatSources)
  const townMainStatPercentSources = withoutMappedStacks(mappedMainStatPercentSources)
  const townMappedMainStatValue = townMainStatFlatSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const townMappedMainStatPercent = townMainStatPercentSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )
  const townMappedMainStatFixedTotal =
    townMappedMainStatValue +
    detectedMainStatData.expeditionBonus +
    detectedMainStatData.levelStatBonus +
    detectedMainStatData.potionBonus +
    detectedMainStatData.cardBookBonus +
    detectedMainStatData.azenaBonus
  const townMainStatData = mappedMode
    ? {
        ...mainStatData,
        totals: {
          힘: mappedMainStatName === '힘' ? townMappedMainStatValue : 0,
          민첩: mappedMainStatName === '민첩' ? townMappedMainStatValue : 0,
          지능: mappedMainStatName === '지능' ? townMappedMainStatValue : 0,
        },
        mainStatValue: townMappedMainStatValue,
        mainStatPercent: townMappedMainStatPercent + petTraitMainStatPercent,
        totalFixedStat: townMappedMainStatFixedTotal,
        mainStatFinal:
          townMappedMainStatFixedTotal *
          (1 + (townMappedMainStatPercent + petTraitMainStatPercent) / 100),
        sources: townMainStatFlatSources,
        percentSources: townMainStatPercentSources,
      }
    : mainStatData
  const townMainStat = {
    name: townMainStatData.mainStatName,
    value: townMainStatData.mainStatFinal,
  }
  const townMappedBaseAttackFlatTotal = townBaseAttackFlatSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )

  // 아래 상세 분석은 체크한 전투 조건부를 반영한다.
  const { weaponAttackTotal, pureAttackPower, finalBaseAttack, finalAttackPower } =
    finalAttackPowerChain(
      weaponAttack,
      attackPower,
      mainStat,
      baseAttackRate.total,
      enabledConditionalKeys,
      mappedBaseAttackFlatTotal,
    )

  // 위쪽 마을 기준 최종 공격력은 체크 상태와 무관하게 전투 조건부를 전부 제외한다.
  const {
    weaponAttackTotal: weaponAttackTotalTown,
    pureAttackPower: pureAttackPowerTown,
    finalBaseAttack: finalBaseAttackTown,
    finalAttackPower: finalAttackPowerTown,
  } = finalAttackPowerChain(
    townWeaponAttack,
    townAttackPower,
    townMainStat,
    townBaseAttackRate.total,
    EMPTY_CONDITIONAL_KEYS,
    townMappedBaseAttackFlatTotal,
  )

  const mappedAdditionalDamageSources = mappedMode
    ? [
        ...mappedSources('ADDITIONAL_DAMAGE_PERCENT'),
        ...mappedSources('ADDITIONAL_DAMAGE_FLAT'),
      ]
    : []
  const additionalDamage = mappedMode
    ? {
        weapon: mappedAdditionalDamageSources,
        accessory: [],
        bracelet: [],
        weaponTotal: mappedAdditionalDamageSources.reduce(
          (sum, source) => sum + source.value,
          0,
        ),
        accessoryTotal: 0,
        braceletTotal: 0,
      }
    : additionalDamageBreakdownCached(armory)
  // deal.html의 ADDITIONAL_DAMAGE는 무기/장신구/팔찌/펫 추가 피해를 전부 더한
  // 값이라, 섹션별 소계 대신 모든 출처를 한 목록에 그대로 나열해 하나의
  // 합계로 보여준다 (무기 아이템·아크그리드 젬처럼 서로 다른 출처를 한 줄로
  // 뭉치지 않고 각자 유지).
  const additionalDamageFinalSources = [
    ...additionalDamage.weapon,
    ...additionalDamage.accessory,
    ...additionalDamage.bracelet,
    ...(petTraitAdditionalPercent > 0
      ? [
          {
            value: petTraitAdditionalPercent,
            itemType: '펫 특기',
            itemName: '끓어오르는 힘 (계산 설정 입력값)',
          },
        ]
      : []),
  ]
  const additionalDamageFinalTotal = additionalDamageFinalSources.reduce(
    (sum, source) => sum + source.value,
    0,
  )

  const engravingDamage = engravingDamageFacts(armory)
  const massIncreaseDamage = massIncreaseDamageFacts(armory)
  const raidCaptainDamage = raidCaptainDamageFacts(armory, moveSpeed.total)
  const evolutionDamage = arkPassiveTierDamageBreakdownCached(
    armory,
    '진화',
    skill.Name,
    selectedSkillCategory,
    skill,
  )
  const enlightenmentDamage = arkPassiveTierDamageBreakdownCached(
    armory,
    '깨달음',
    skill.Name,
    selectedSkillCategory,
    skill,
  )
  const leapDamage = arkPassiveTierDamageBreakdownCached(
    armory,
    '도약',
    skill.Name,
    selectedSkillCategory,
    skill,
  )
  const outgoingDamage = outgoingDamageBreakdownCached(armory, skill.Name, selectedSkillCategory)
  const specializationDamage = specializationSkillDamageFacts(profile, selectedSkillCategory)
  const cardDamage = cardDamageFacts(armory)
  // deal.html의 DAMAGE_INCREASE는 각 항이 (1 + 증가율)로 곱해지는 곱연산이라,
  // 자동으로 값을 구할 수 있는 항목만 모아 하나의 배율로 계산한다. 보석·
  // 아크그리드·특화·장비 세트처럼 아직 자동 감지가 안 되는 항목은
  // 곱셈에서 빼고 Group 3에 별도 행으로 남겨둔다.
  const detectedDamageIncreaseItems = [
    ...engravingDamage.sources.map((source, index) => ({
      key: `ENGRAVING_DAMAGE__${source.itemName}__${index}`,
      label: `각인 · ${source.itemName}`,
      percent: source.value,
      sources: [source],
    })),
    {
      key: 'EVOLUTION_DAMAGE',
      label: '진화형 피해',
      percent: evolutionDamage.total,
      sources: evolutionDamage.unconditional,
    },
    {
      key: 'ENLIGHTENMENT_DAMAGE',
      label: '깨달음형 피해',
      percent: enlightenmentDamage.total,
      sources: enlightenmentDamage.unconditional,
    },
    {
      key: 'SPECIALIZATION_SKILL_DAMAGE',
      label: `특화 · ${specializationDamage.targetLabel || '스킬'} 피해`,
      percent: specializationDamage.total,
      sources: specializationDamage.sources,
    },
    {
      key: 'SPECIES_DAMAGE',
      label: '종족 추가 피해 (펫 특기)',
      percent: petTraitSpeciesDamagePercent,
      sources:
        petTraitSpeciesDamagePercent > 0
          ? [
              {
                value: petTraitSpeciesDamagePercent,
                itemType: '펫 특기',
                itemName: '자연 선택 (악마) (계산 설정 입력값)',
              },
            ]
          : [],
    },
    {
      key: 'CARD_DAMAGE',
      label: '카드 피해',
      percent: cardDamage.total,
      sources: cardDamage.sources,
    },
    {
      key: 'RAID_CAPTAIN_DAMAGE',
      label: '돌격대장',
      percent: raidCaptainDamage.total,
      sources: raidCaptainDamage.sources,
    },
    {
      key: 'MASS_INCREASE_DAMAGE',
      label: '질량 증가',
      percent: massIncreaseDamage.total,
      sources: massIncreaseDamage.sources,
    },
    {
      key: 'LEAP_DAMAGE',
      label: '도약형 피해',
      percent: leapDamage.total,
      sources: leapDamage.unconditional,
    },
    // "적에게 주는 피해"는 출처별로 완전히 다른 스킬/조건에 붙는 별개의 버프라
    // 하나로 합치지 않고 그룹(장신구 연마, 아크그리드 코어별, 아크그리드 효과)
    // 마다 독립된 곱연산 항으로 넣는다 — 그룹 내부에서만 합연산.
    ...outgoingDamage.groups.map((group) => ({
      key: `OUTGOING_DAMAGE__${group.key}`,
      label: group.label,
      percent: group.total,
      sources: group.sources,
    })),
  ]
  const damageIncreaseItems = mappedMode
    ? [
        ...mappedSources('DAMAGE_INCREASE_PERCENT'),
        ...mappedSources('DAMAGE_INCREASE_FLAT'),
      ].map((source, index) => ({
        key: `MAPPED_DAMAGE_INCREASE__${index}`,
        label: source.itemName,
        percent: source.value,
        sources: [source],
      }))
    : detectedDamageIncreaseItems
  const damageIncreaseMultiplier = damageIncreaseItems.reduce(
    (product, item) => product * (1 + item.percent / 100),
    1,
  )
  // 값이 0인(=출처가 아예 없는) 항목만 계산식 상세 목록에서 뺀다 — 곱연산에서
  // (1+0%)=×1이라 빼도 최종 배율은 그대로다. 트레이드오프로 음수가 된 항목은
  // 실제로 배율을 깎아먹는 값이라 반드시 보여줘야 한다.
  const damageIncreaseResolvedItems = damageIncreaseItems.filter(
    (item) => item.percent !== 0 || item.sources.length > 0,
  )
  const mappedReceivedDamageSources = mappedMode
    ? [
        ...mappedSources('ENEMY_RECEIVED_DAMAGE_PERCENT'),
        ...mappedSources('ENEMY_RECEIVED_DAMAGE_FLAT'),
      ]
    : []
  const receivedDamage = mappedMode
    ? {
        sources: mappedReceivedDamageSources,
        total: mappedReceivedDamageSources.reduce((sum, source) => sum + source.value, 0),
      }
    : receivedDamageFacts(skills)
  const receivedDamageMultiplier = 1 + receivedDamage.total / 100
  const characterSkillSynergies = skillSynergyEffects(skills)

  const mappedCritDamageSources = mappedMode
    ? [
        ...mappedSources('CRIT_DAMAGE_PERCENT'),
        ...mappedSources('CRIT_DAMAGE_FLAT'),
      ]
    : []
  const critDamage = mappedMode
    ? {
        sources: mappedCritDamageSources,
        base: CRIT_DAMAGE_BASE,
        bonusTotal: mappedCritDamageSources.reduce((sum, source) => sum + source.value, 0),
        total:
          CRIT_DAMAGE_BASE +
          mappedCritDamageSources.reduce((sum, source) => sum + source.value, 0),
      }
    : critDamageBreakdownCached(armory)
  const critHitBracelet = mappedMode
    ? { sources: [], total: 0 }
    : critHitBraceletFacts(armory)
  const mappedCritRateSources = mappedMode ? mappedSources('CRIT_RATE_PERCENT') : []
  const critRate = mappedMode
    ? {
        sources: [
          ...(combatStats.critical > 0
            ? [
                {
                  value: combatStats.critical * CRIT_RATE_PER_POINT,
                  itemType: 'API 전투 특성',
                  itemName: `치명 ${numberText(combatStats.critical)} × ${CRIT_RATE_PER_POINT}%`,
                },
              ]
            : []),
          ...mappedCritRateSources,
        ],
        total:
          combatStats.critical * CRIT_RATE_PER_POINT +
          mappedCritRateSources.reduce((sum, source) => sum + source.value, 0),
      }
    : critRateFactsCached(armory, combatStats.critical, selectedSkillCategory)
  // 6번 치명타 피해는 기본 200%에 치명타 피해 증가분을 합연산한다.
  // 7번 "치명타 시 주는 피해"는 치명타 피해와 다른 별도 곱연산 항이다.
  const critDamageItems = [
    {
      key: 'CRIT_DAMAGE',
      label: '치명타 피해 배율 (기본 200% 포함)',
      percent: 100 + critDamage.bonusTotal,
      sources: [
        { value: 100, itemType: '기본값', itemName: '치명타 피해 기본 배율 200%' },
        ...critDamage.sources,
      ],
    },
  ]
  const critHitDamageItems = [
    {
      key: 'CRIT_HIT_BRACELET',
      label: '치명타 시 주는 피해 배율',
      percent: critHitBracelet.total,
      sources: critHitBracelet.sources,
    },
  ]
  const critDamageMultiplier = critDamageItems.reduce(
    (product, item) => product * (1 + item.percent / 100),
    1,
  )
  const critDamageResolvedItems = critDamageItems.filter((item) => item.percent !== 0)
  const critHitDamageMultiplier = critHitDamageItems.reduce(
    (product, item) => product * (1 + item.percent / 100),
    1,
  )
  const critHitDamageResolvedItems = critHitDamageItems.filter(
    (item) => item.percent !== 0 || item.sources.length > 0,
  )
  const criticalTotalMultiplier = critDamageMultiplier * critHitDamageMultiplier
  const keenPenalty = keenBluntPenaltyFacts(armory)
  const calculationAttack =
    finalAttackPower != null ? finalAttackPower : Number(String(attack || '').replaceAll(',', ''))
  const sharedDamageMultiplier =
    (1 + additionalDamageFinalTotal / 100) *
    damageIncreaseMultiplier *
    receivedDamageMultiplier *
    LUMERUS_DEFENSE_MULTIPLIER
  const motionResults = motionHits.map((motion) => {
    const storedConstant = storedMotionConstants[motion.order - 1]
    const constant = storedConstant?.value
    const coefficient =
      Number.isFinite(motion.apiDamage) &&
      Number.isFinite(constant) &&
      Number.isFinite(baseAttackTooltip.value) &&
      baseAttackTooltip.value > 0
        ? (motion.apiDamage - constant) / baseAttackTooltip.value
        : null
    const ready =
      Number.isFinite(coefficient) &&
      Number.isFinite(constant) &&
      Number.isFinite(calculationAttack)
    const repeat = motionRepeat(motion)
    const basePerHit = ready ? calculationAttack * coefficient + constant : null
    const normalPerHit = basePerHit != null ? basePerHit * sharedDamageMultiplier : null
    return {
      ...motion,
      repeat,
      coefficient,
      constant,
      constantContext: storedConstant?.context || '',
      ready,
      basePerHit,
      normalPerHit,
      normalTotal: normalPerHit != null ? normalPerHit * repeat : null,
      criticalPerHit: normalPerHit != null ? normalPerHit * criticalTotalMultiplier : null,
      criticalTotal: normalPerHit != null ? normalPerHit * criticalTotalMultiplier * repeat : null,
    }
  })
  const motionInputsReady =
    motionResults.length > 0 && motionResults.every((motion) => motion.ready)
  const normalFinalDamage = motionInputsReady
    ? motionResults.reduce((sum, motion) => sum + motion.normalTotal, 0)
    : null
  const criticalFinalDamage =
    normalFinalDamage != null ? normalFinalDamage * criticalTotalMultiplier : null
  const criticalProbability = Math.min(1, Math.max(0, critRate.total / 100))
  const keenPenaltyProbability = keenPenalty.active ? keenPenalty.rate / 100 : 0
  const damageCases =
    normalFinalDamage == null
      ? []
      : [
          {
            key: 'critical-normal',
            critical: true,
            penalized: false,
            probability: criticalProbability * (1 - keenPenaltyProbability),
            damage: criticalFinalDamage,
          },
          {
            key: 'normal-normal',
            critical: false,
            penalized: false,
            probability: (1 - criticalProbability) * (1 - keenPenaltyProbability),
            damage: normalFinalDamage,
          },
          ...(keenPenalty.active
            ? [
                {
                  key: 'critical-penalty',
                  critical: true,
                  penalized: true,
                  probability: criticalProbability * keenPenaltyProbability,
                  damage: criticalFinalDamage * keenPenalty.multiplier,
                },
                {
                  key: 'normal-penalty',
                  critical: false,
                  penalized: true,
                  probability: (1 - criticalProbability) * keenPenaltyProbability,
                  damage: normalFinalDamage * keenPenalty.multiplier,
                },
              ]
            : []),
        ]
  const expectedFinalDamage = damageCases.reduce(
    (sum, damageCase) => sum + damageCase.damage * damageCase.probability,
    0,
  )

  // "보유 데이터 원본 줄 목록" 모달에서 각 줄이 지금 어느 계산에 반영 중인지
  // 보여주기 위한 색인 — 이미 위에서 구한 breakdown 결과들을 그대로 재사용한다.
  const appliedLineIndex = buildAppliedLineIndex({
    mainStatData,
    weaponAttack,
    baseAttackRate,
    attackPower,
    additionalDamageFinalSources,
    engravingDamage,
    massIncreaseDamage,
    raidCaptainDamage,
    evolutionDamage,
    enlightenmentDamage,
    leapDamage,
    outgoingDamage,
    cardDamage,
    critDamage,
    critHitBracelet,
    critRate,
    attackSpeed,
    receivedDamage,
    specializationDamage,
    gemItems: armory?.ArmoryGem?.Gems || [],
  })

  return (
    <section className="damage-analysis">
      <div className="damage-settings-row">
        <section className="damage-settings-section">
          <div className="damage-section-title">
            <Sigma />
            <span>
              <h4>계산 설정</h4>
              <small>현재 캐릭터와 원정대에 적용 중인 설정값입니다.</small>
            </span>
            <button
              type="button"
              className="damage-settings-open-button"
              onClick={() => setShowDamageSettingsModal(true)}
            >
              설정 변경
            </button>
          </div>
          <div className="damage-settings-summary">
            <div>
              <span className="damage-setting-label">
                <img loading="lazy" src="/images/etc/shop_icon_9888.png" alt="" />
                <span>
                  <b>아제나의 축복</b>
                  <small>캐릭터 전용</small>
                </span>
              </span>
              <strong>{azenaBlessing ? 'ON' : 'OFF'}</strong>
            </div>
            <div>
              <span className="damage-setting-label">
                <i className={petTraitGradeClass('petTraitMainStat', petTraitMainStatInput)}>
                  <img loading="lazy" src="/images/etc/pet03.png" alt="" />
                </i>
                <span>
                  <b>우월한 유전자</b>
                  <small>주 스탯</small>
                </span>
              </span>
              <strong>{normalizePetTraitValue('petTraitMainStat', petTraitMainStatInput)}%</strong>
            </div>
            <div>
              <span className="damage-setting-label">
                <i
                  className={petTraitGradeClass(
                    'petTraitSpeciesDamage',
                    petTraitSpeciesDamageInput,
                  )}
                >
                  <img loading="lazy" src="/images/etc/pet01.png" alt="" />
                </i>
                <span>
                  <b>자연 선택 (악마)</b>
                  <small>악마 계열 피해량</small>
                </span>
              </span>
              <strong>
                {normalizePetTraitValue('petTraitSpeciesDamage', petTraitSpeciesDamageInput)}%
              </strong>
            </div>
            <div>
              <span className="damage-setting-label">
                <i className={petTraitGradeClass('petTraitAdditional', petTraitAdditionalInput)}>
                  <img loading="lazy" src="/images/etc/pet02.png" alt="" />
                </i>
                <span>
                  <b>끓어오르는 힘</b>
                  <small>추가 피해</small>
                </span>
              </span>
              <strong>
                {normalizePetTraitValue('petTraitAdditional', petTraitAdditionalInput)}%
              </strong>
            </div>
            <div>
              <span>
                <b>물약 + 원정대 레벨 효과</b>
                <small>원정대 공용</small>
              </span>
              <strong>{potionSourceInput || '850 (기본)'}</strong>
            </div>
            <div>
              <span>
                <b>카드 도감 주 스탯 효과</b>
                <small>원정대 공용</small>
              </span>
              <strong>{cardBookInput || '242 (기본)'}</strong>
            </div>
            <div>
              <span className="damage-setting-label">
                <i className="damage-setting-placeholder-icon" aria-hidden="true">
                  ?
                </i>
                <span>
                  <b>이벤트 만찬</b>
                  <small>공격속도·이동속도 +{FEAST_SPEED_BONUS}%</small>
                </span>
              </span>
              <strong>{eventFeastEnabled ? 'ON' : 'OFF'}</strong>
            </div>
            <div>
              <span className="damage-setting-label">
                <i className="damage-setting-placeholder-icon" aria-hidden="true">
                  ?
                </i>
                <span>
                  <b>무공 만찬</b>
                  <small>
                    무기 공격력 +{numberText(WEAPON_ATTACK_FEAST_BONUS)} · 공격속도·이동속도 +
                    {FEAST_SPEED_BONUS}%
                  </small>
                </span>
              </span>
              <strong>{weaponAttackFeastEnabled ? 'ON' : 'OFF'}</strong>
            </div>
          </div>
        </section>

        <div className="town-final-attack-power-column">
          <div className="battle-panel town-final-attack-power">
            <div className="damage-section-title">
              <Swords />
              <span>
                <h4>마을 기준 최종 공격력</h4>
                <small>
                  전투 조건부를 전부 제외한 값입니다. 조건부 반영값은 아래 최종 공격력 상세에서
                  확인합니다.
                </small>
              </span>
              <button
                type="button"
                className="town-final-attack-power-help"
                onClick={() => setShowFormulaModal(true)}
                aria-label="계산식 보기"
              >
                <HelpCircle />
              </button>
            </div>
            {finalAttackPowerTown != null ? (
              <div className="town-final-attack-power-value">
                <b>{numberText(finalAttackPowerTown)}</b>
              </div>
            ) : (
              <p className="weapon-attack-empty">계산에 필요한 데이터가 부족합니다.</p>
            )}
          </div>
          <button
            type="button"
            className="town-final-attack-power-conditional-btn"
            onClick={() => setShowDataizedConditionalsModal(true)}
          >
            중첩 카운트 확인하기 ({dataizedConditionalItems.length})
          </button>
          <button
            type="button"
            className="town-final-attack-power-conditional-btn"
            onClick={() => setShowArmoryLinesModal(true)}
          >
            보유 데이터 원본 줄 전체 목록 보기
          </button>
          {characterSkillSynergies.length > 0 && (
            <section className="skill-synergy-summary">
              <header>
                <b>보유 스킬 시너지·디버프</b>
                <span>{characterSkillSynergies.length}개</span>
              </header>
              <div>
                {characterSkillSynergies.map((effect, index) => (
                  <article
                    key={`${effect.sourceName}-${effect.category}-${effect.percent}-${index}`}
                  >
                    {effect.skillIcon ? (
                      <img loading="lazy" src={effect.skillIcon} alt="" />
                    ) : (
                      <Swords />
                    )}
                    <span>
                      <strong>
                        {effect.category}
                        {effect.percent != null ? ` · +${numberText(effect.percent)}%` : ''}
                      </strong>
                      <small>
                        {effect.sourceName} · 적용 스킬{' '}
                        {effect.skills.map((entry) => entry.skillName).join(', ')}
                      </small>
                      <div className="skill-synergy-lines">
                        {effect.skills.map((entry) => (
                          <p key={entry.skillName}>
                            <b>{entry.skillName}</b> {entry.line}
                          </p>
                        ))}
                      </div>
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {showDamageSettingsModal && (
        <div className="damage-formula-backdrop" onClick={handleCancelDamageSettings}>
          <section
            className="damage-settings-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${characterName} 캐릭터 설정`}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>캐릭터 설정</h2>
                <p>
                  <b>{characterName}</b> · 계산 설정
                </p>
              </div>
              <button type="button" onClick={handleCancelDamageSettings} aria-label="닫기">
                <X />
              </button>
            </header>
            <div className="damage-settings-edit-tabs">
              <b>계산 설정</b>
            </div>
            <div className="damage-settings-edit-body">
              <p>
                아제나의 축복은 이 캐릭터에만, 나머지 값은 같은 원정대의 모든 캐릭터에 공통으로
                적용됩니다.{' '}
                {user
                  ? '로그인 상태라 서버에도 저장됩니다.'
                  : '로그인하지 않아 이 브라우저에만 저장됩니다.'}
              </p>
              <div className="damage-settings-grid">
                <div className="card-effect-input">
                  <span className="damage-setting-label">
                    <img loading="lazy" src="/images/etc/shop_icon_9888.png" alt="" />
                    <span>
                      <b>아제나의 축복</b>
                      <small>주 스탯 +6,000</small>
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`azena-toggle${azenaBlessing ? ' active' : ''}`}
                    onClick={() => setAzenaBlessing((current) => !current)}
                    aria-pressed={azenaBlessing}
                  >
                    {azenaBlessing ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="card-effect-input">
                  <span className="damage-setting-label">
                    <i className="damage-setting-placeholder-icon" aria-hidden="true">
                      ?
                    </i>
                    <span>
                      <b>이벤트 만찬</b>
                      <small>공격속도·이동속도 +{FEAST_SPEED_BONUS}%</small>
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`azena-toggle${eventFeastEnabled ? ' active' : ''}`}
                    onClick={handleToggleEventFeast}
                    aria-pressed={eventFeastEnabled}
                  >
                    {eventFeastEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="card-effect-input">
                  <span className="damage-setting-label">
                    <i className="damage-setting-placeholder-icon" aria-hidden="true">
                      ?
                    </i>
                    <span>
                      <b>무공 만찬</b>
                      <small>
                        무기 공격력 +{numberText(WEAPON_ATTACK_FEAST_BONUS)} · 공격속도·이동속도 +
                        {FEAST_SPEED_BONUS}%
                      </small>
                    </span>
                  </span>
                  <button
                    type="button"
                    className={`azena-toggle${weaponAttackFeastEnabled ? ' active' : ''}`}
                    onClick={handleToggleWeaponAttackFeast}
                    aria-pressed={weaponAttackFeastEnabled}
                  >
                    {weaponAttackFeastEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="card-effect-input">
                  <span className="damage-setting-label">
                    <i className={petTraitGradeClass('petTraitMainStat', petTraitMainStatInput)}>
                      <img loading="lazy" src="/images/etc/pet03.png" alt="" />
                    </i>
                    <span>
                      <b>우월한 유전자</b>
                      <small>주 스탯 · 기본 0%</small>
                    </span>
                  </span>
                  <PetTraitOptionButtons
                    settingKey="petTraitMainStat"
                    value={petTraitMainStatInput}
                    onChange={setPetTraitMainStatInput}
                    label="우월한 유전자 등급"
                  />
                </div>
                <div className="card-effect-input">
                  <span className="damage-setting-label">
                    <i
                      className={petTraitGradeClass(
                        'petTraitSpeciesDamage',
                        petTraitSpeciesDamageInput,
                      )}
                    >
                      <img loading="lazy" src="/images/etc/pet01.png" alt="" />
                    </i>
                    <span>
                      <b>자연 선택 (악마)</b>
                      <small>악마 계열 피해량 · 기본 0%</small>
                    </span>
                  </span>
                  <PetTraitOptionButtons
                    settingKey="petTraitSpeciesDamage"
                    value={petTraitSpeciesDamageInput}
                    onChange={setPetTraitSpeciesDamageInput}
                    label="자연 선택 악마 등급"
                  />
                </div>
                <div className="card-effect-input">
                  <span className="damage-setting-label">
                    <i
                      className={petTraitGradeClass('petTraitAdditional', petTraitAdditionalInput)}
                    >
                      <img loading="lazy" src="/images/etc/pet02.png" alt="" />
                    </i>
                    <span>
                      <b>끓어오르는 힘</b>
                      <small>추가 피해 · 기본 0%</small>
                    </span>
                  </span>
                  <PetTraitOptionButtons
                    settingKey="petTraitAdditional"
                    value={petTraitAdditionalInput}
                    onChange={setPetTraitAdditionalInput}
                    label="끓어오르는 힘 등급"
                  />
                </div>
                <div className="card-effect-input damage-settings-full-row">
                  <span className="damage-setting-input-copy">
                    <label htmlFor="potion-source-input">
                      물약+원정대 레벨 효과로 오른 주 스탯 수치 (미입력 시 물약 850 고정)
                    </label>
                    <button type="button" onClick={() => setShowBuffSettingGuide(true)}>
                      확인 방법
                    </button>
                  </span>
                  <input
                    id="potion-source-input"
                    type="text"
                    inputMode="numeric"
                    value={potionSourceInput}
                    onChange={(event) => setPotionSourceInput(event.target.value)}
                    placeholder={`예: ${mainStatData.expeditionBonus + 850}`}
                  />
                </div>
                <div className="card-effect-input damage-settings-full-row">
                  <span className="damage-setting-input-copy">
                    <label htmlFor="card-book-input">
                      카드 도감 주 스탯 효과 (미입력 시 242 고정)
                    </label>
                    <button type="button" onClick={() => setShowBuffSettingGuide(true)}>
                      확인 방법
                    </button>
                  </span>
                  <input
                    id="card-book-input"
                    type="text"
                    inputMode="numeric"
                    value={cardBookInput}
                    onChange={(event) => setCardBookInput(event.target.value)}
                    placeholder="예: 242"
                  />
                </div>
              </div>
            </div>
            <footer>
              <button type="button" onClick={handleCancelDamageSettings}>
                취소
              </button>
              <button type="button" className="primary" onClick={handleSaveDamageSettings}>
                저장
              </button>
            </footer>
          </section>
        </div>
      )}

      {showBuffSettingGuide && (
        <div
          className="damage-formula-backdrop damage-setting-guide-backdrop"
          onClick={() => setShowBuffSettingGuide(false)}
        >
          <section
            className="damage-formula-modal damage-setting-guide-modal"
            role="dialog"
            aria-modal="true"
            aria-label="주 스탯 효과 확인 방법"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>주 스탯 효과 확인 방법</h2>
                <p>인게임에서 표시된 위치의 수치를 확인해 입력하세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBuffSettingGuide(false)}
                aria-label="닫기"
              >
                <X />
              </button>
            </header>
            <div className="damage-setting-guide-image">
              <img
                loading="lazy"
                src="/images/etc/buff_setting.png"
                alt="주 스탯 효과 확인 위치 안내"
              />
            </div>
          </section>
        </div>
      )}

      {showFormulaModal && (
        <div className="damage-formula-backdrop" onClick={() => setShowFormulaModal(false)}>
          <section
            className="damage-formula-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>최종 공격력 계산식</h2>
                <p>
                  주 스탯 → 무기 공격력 → 기본 공격력 → 최종 공격력 순서로 계산합니다. 전투 중
                  발동하는 조건부 항목은 표시하거나 합산하지 않고, 마을 기준 상시 적용값만
                  보여줍니다.
                </p>
              </div>
              <button type="button" onClick={() => setShowFormulaModal(false)} aria-label="닫기">
                <X />
              </button>
            </header>
            <div className="damage-formula-modal-body">
              <AttackPowerStaircase
                mainStatData={townMainStatData}
                weaponAttack={townWeaponAttack}
                weaponAttackTotal={weaponAttackTotalTown}
                mainStat={townMainStat}
                baseAttackRate={townBaseAttackRate}
                pureAttackPower={pureAttackPowerTown}
                finalBaseAttack={finalBaseAttackTown}
                attackPower={townAttackPower}
                finalAttackPower={finalAttackPowerTown}
                apiAttack={attack}
                enabledConditionalKeys={EMPTY_CONDITIONAL_KEYS}
                onToggleConditional={null}
              />
            </div>
          </section>
        </div>
      )}

      <div className="damage-analysis-layout">
        <aside className="battle-panel damage-skill-list">
          <header>
            <b>장착 스킬</b>
            <span>{skills.length}개</span>
          </header>
          <div>
            {skills.map((item) => {
              const hitSummary = hitSummaryForSkill(item)
              return (
                <button
                  className={item.Name === skill.Name ? 'active' : ''}
                  type="button"
                  onClick={() => setSelectedName(item.Name)}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    onHover?.({
                      item,
                      left: rect.left,
                      right: rect.right,
                      top: rect.top,
                    })
                  }}
                  onMouseLeave={() => onHover?.(null)}
                  key={item.Name}
                >
                  {item.Icon ? <img loading="lazy" src={item.Icon} alt="" /> : <Swords />}
                  <span>
                    <b>{item.Name}</b>
                    <small>
                      Lv.{item.Level}
                      {mappedMode
                        ? ` · ${damageOptionSkillCategoryLabel(
                            damageOptionSkillCategory(item),
                          )}`
                        : ''}
                      {' · '}총 {numberText(hitSummary.total)}타 · 모션 {hitSummary.motions}개
                    </small>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        {showArmoryLinesModal && (
          <ArmoryLinesModal
            armory={armory}
            profile={profile}
            skill={skill}
            appliedLineIndex={appliedLineIndex}
            mainStatName={mainStatData.mainStatName}
            onClose={() => setShowArmoryLinesModal(false)}
          />
        )}

        {showDataizedConditionalsModal && (
          <DataizedConditionalsModal
            items={dataizedConditionalItems}
            onClose={() => setShowDataizedConditionalsModal(false)}
          />
        )}

        <main className="damage-analysis-detail">
          <header>
            {skill.Icon && <img loading="lazy" src={skill.Icon} alt="" />}
            <span>
              <small>
                {skill.Type || '스킬'}
                {mappedMode
                  ? ` · ${damageOptionSkillCategoryLabel(selectedSkillCategory)}`
                  : ''}
              </small>
              <h3>{skill.Name}</h3>
              <em>Lv.{skill.Level}</em>
            </span>
          </header>

          <section className="damage-combat-stat-summary" aria-label="핵심 전투 수치">
            <article>
              <small>공격 속도</small>
              <strong>+{numberText(attackSpeed.total)}%</strong>
            </article>
            <article>
              <small>재사용 대기시간 감소</small>
              <strong>
                {numberText(cooldownReductionTotal)}%
                {cooldownFixedTotal ? ` + ${numberText(cooldownFixedTotal)}초` : ''}
              </strong>
              {adjustedCooldown != null && (
                <em>
                  {numberText(baseSkillCooldown)}초 → {numberText(adjustedCooldown)}초
                </em>
              )}
            </article>
            <article>
              <small>치명타 적중률</small>
              <strong>{numberText(critRate.total)}%</strong>
            </article>
            <article>
              <small>치명타 피해</small>
              <strong>{numberText(critDamageMultiplier * 100)}%</strong>
            </article>
          </section>

          <section className="motion-hit-input-section">
            <div className="damage-section-title">
              <Database />
              <span>
                <h4>타수별 스킬 계수·모션 상수</h4>
                <small>
                  공격력 툴팁과 스킬 데이터로 자동 계산 · 총 {numberText(totalHitCount)}타 · 모션{' '}
                  {motionHits.length}개
                </small>
              </span>
            </div>
            <div className="motion-hit-input-list">
              {motionHits.map((motion) => {
                const input = motionInputs[motion.key] || {}
                const resolvedMotion = motionResults.find((item) => item.key === motion.key)
                return (
                  <article key={motion.key}>
                    <header>
                      <span>
                        <b>{motion.order}타 모션</b>
                        <small>
                          {motion.apiDamage != null
                            ? `API 표시 피해 ${numberText(motion.apiDamage)}`
                            : motion.context}
                        </small>
                      </span>
                      <label>
                        반복
                        <input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={input.repeat ?? motion.repeat}
                          onChange={(event) =>
                            updateMotionInput(skill.Name, motion.key, 'repeat', event.target.value)
                          }
                          aria-label={`${motion.order}타 반복 횟수`}
                        />
                        회
                      </label>
                    </header>
                    <div>
                      <label>
                        <span>스킬 계수</span>
                        <strong>
                          {Number.isFinite(resolvedMotion?.coefficient)
                            ? numberText(resolvedMotion.coefficient)
                            : '확인 불가'}
                        </strong>
                      </label>
                      <label>
                        <span>모션 상수</span>
                        <strong>
                          {Number.isFinite(resolvedMotion?.constant)
                            ? numberText(resolvedMotion.constant)
                            : '데이터 없음'}
                        </strong>
                      </label>
                    </div>
                    <p>
                      {motion.context}
                      {Number.isFinite(resolvedMotion?.coefficient) &&
                        ` · (${numberText(motion.apiDamage)} - ${numberText(resolvedMotion.constant)}) ÷ ${numberText(baseAttackTooltip.value)}`}
                    </p>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="damage-missing-section battle-panel">
            <div className="damage-section-title">
              <Database />
              <span>
                <h4>계산을 위해 추가로 필요한 데이터</h4>
                <small>Open API에 구조화된 계산값이 없어 별도 스킬 DB가 필요합니다.</small>
              </span>
            </div>
            {variableGroups.map((group) => (
              <div className="damage-variable-group" key={group.title}>
                <h5 className="damage-variable-group-title">{group.title}</h5>
                <div className="damage-variable-table">
                  {group.items.map(([variable, label, reason]) => {
                    const detail = {
                      ATTACK_POWER_FINAL: {
                        resolved: mainStatData.sources.length > 0,
                        expanded: showAttackPowerFinalDetail,
                        toggle: () => setShowAttackPowerFinalDetail((current) => !current),
                        summary: finalAttackPower != null ? numberText(finalAttackPower) : '',
                        Component: (
                          <AttackPowerStaircase
                            mainStatData={mainStatData}
                            weaponAttack={weaponAttack}
                            weaponAttackTotal={weaponAttackTotal}
                            mainStat={mainStat}
                            baseAttackRate={baseAttackRate}
                            pureAttackPower={pureAttackPower}
                            finalBaseAttack={finalBaseAttack}
                            attackPower={attackPower}
                            finalAttackPower={finalAttackPower}
                            apiAttack={attack}
                            enabledConditionalKeys={enabledConditionalKeys}
                            onToggleConditional={handleToggleConditional}
                          />
                        ),
                      },
                      ADDITIONAL_DAMAGE_FINAL: {
                        resolved: additionalDamageFinalSources.length > 0,
                        expanded: showAdditionalDamageFinalDetail,
                        toggle: () => setShowAdditionalDamageFinalDetail((current) => !current),
                        summary: `×${numberText(1 + additionalDamageFinalTotal / 100)}`,
                        Component: (
                          <FinalAdditionalDamageBreakdown
                            sources={additionalDamageFinalSources}
                            total={additionalDamageFinalTotal}
                            note="무기 아이템·아크패시브 진화 노드·아크그리드 코어 옵션·아크그리드 젬(무기 추가 피해), 목걸이·귀걸이·반지 연마(장신구 추가 피해), 팔찌 효과(팔찌 추가 피해), 펫 특기(펫 추가 피해) 출처를 하나로 합친 값입니다. 엘릭서 추가 피해는 자동 감지가 안 돼 별도 항목으로 남아 있습니다."
                          />
                        ),
                      },
                      DAMAGE_INCREASE_FINAL: {
                        resolved: true,
                        expanded: showDamageIncreaseFinalDetail,
                        toggle: () => setShowDamageIncreaseFinalDetail((current) => !current),
                        summary: `×${numberText(damageIncreaseMultiplier)}`,
                        Component: (
                          <FinalDamageIncreaseBreakdown
                            title="최종 피해 증가"
                            items={damageIncreaseResolvedItems}
                            multiplier={damageIncreaseMultiplier}
                            totalPercent={(damageIncreaseMultiplier - 1) * 100}
                            emptyMessage="감지된 피해 증가 출처가 없습니다."
                            note={`출처가 있는 항목을 위에 나열했고, 각 항목을 (1 + 증가율)로 바꿔 전부 곱하면 ×${numberText(damageIncreaseMultiplier)}입니다. 돌격대장은 현재 계산된 이동속도 증가량 전체에 각인 설명의 환산 계수를 곱해 반영했습니다. 보석·아크그리드·특화 스킬·장비 세트처럼 아직 자동 감지가 안 되는 항목은 곱셈에서 제외했습니다.`}
                          />
                        ),
                      },
                      RECEIVED_DAMAGE: {
                        resolved: receivedDamage.sources.length > 0,
                        expanded: showReceivedDamageDetail,
                        toggle: () => setShowReceivedDamageDetail((current) => !current),
                        summary: `×${numberText(receivedDamageMultiplier)}`,
                        Component: (
                          <FinalDamageIncreaseBreakdown
                            title="적 받는 피해 배율"
                            items={[
                              {
                                key: 'TARGET_RECEIVED_DAMAGE',
                                label: '대상 피해 증폭',
                                percent: receivedDamage.total,
                                sources: receivedDamage.sources,
                              },
                            ]}
                            multiplier={receivedDamageMultiplier}
                            totalPercent={receivedDamage.total}
                            emptyMessage="감지된 적 받는 피해 증가 효과가 없습니다."
                            note={`현재 보고 있는 스킬 하나가 아니라 장착된 전체 스킬의 선택 트라이포드에서 피해 증폭 효과를 찾고, 캐릭터 공통 배율로 적용합니다. 따라서 피해 증폭 스킬을 장착했다면 어떤 데모닉 스킬을 선택해도 ×${numberText(receivedDamageMultiplier)}가 적용됩니다. 동일한 피해 증폭은 중복 합산하지 않으며, 캐릭터 자신이 받는 피해 증가는 포함하지 않습니다.`}
                          />
                        ),
                      },
                      DEFENSE_MULTIPLIER: {
                        resolved: true,
                        expanded: showDefenseMultiplierDetail,
                        toggle: () => setShowDefenseMultiplierDetail((current) => !current),
                        summary: `×${numberText(LUMERUS_DEFENSE_MULTIPLIER)}`,
                        Component: (
                          <div className="weapon-attack-breakdown">
                            <div className="weapon-attack-total">
                              <span>
                                <small>루메루스 기준 방어력 배율</small>
                                <b>×{numberText(LUMERUS_DEFENSE_MULTIPLIER)}</b>
                              </span>
                              <code>
                                {DEFENSE_FORMULA_CONSTANT} ÷ ({DEFENSE_FORMULA_CONSTANT} + (
                                {numberText(LUMERUS_BASE_DEFENSE)} × (1 -{' '}
                                {numberText(LUMERUS_DEFENSE_REDUCTION)}%))) ×{' '}
                                {numberText(LUMERUS_DAMAGE_REDUCTION_MULTIPLIER)}
                              </code>
                            </div>
                            <p className="weapon-attack-note">
                              루메루스 기본 방어력은 {numberText(LUMERUS_BASE_DEFENSE)}이고, 추가
                              데미지 감소 20%를 ×{numberText(LUMERUS_DAMAGE_REDUCTION_MULTIPLIER)}로
                              적용합니다. 현재 방어력 감소 효과는{' '}
                              {numberText(LUMERUS_DEFENSE_REDUCTION)}%입니다. 방어력 감소 효과가
                              생기면 유효 방어력 부분만 달라집니다.
                            </p>
                          </div>
                        ),
                      },
                      GEM_DAMAGE: {
                        resolved: gems.length > 0,
                        expanded: showGemDamageDetail,
                        toggle: () => setShowGemDamageDetail((current) => !current),
                        summary: gems.length ? `${gems.length}개 보석` : '',
                        Component: <GemDamageBreakdown gems={gems} />,
                      },
                      CRIT_DAMAGE_FINAL: {
                        resolved: true,
                        expanded: showCritDamageFinalDetail,
                        toggle: () => setShowCritDamageFinalDetail((current) => !current),
                        summary: `${numberText(critDamageMultiplier * 100)}%`,
                        Component: (
                          <FinalDamageIncreaseBreakdown
                            title="최종 치명타 피해 배율"
                            items={critDamageResolvedItems}
                            multiplier={critDamageMultiplier}
                            totalPercent={critDamageMultiplier * 100}
                            showSign={false}
                            emptyMessage="감지된 치명타 피해 출처가 없습니다."
                            note={`기본 치명타 피해 200%에 각인·장비·아크패시브·현재 보유 포인트 이하 아크그리드에서 감지된 '치명타 피해(량)' 증가분만 더한 값입니다. 치명타 시 주는 피해는 포함하지 않고 7번에서 별도로 곱합니다. 현재 치명타 피해 배율은 ×${numberText(critDamageMultiplier)}입니다.`}
                          />
                        ),
                      },
                      CRIT_HIT_DAMAGE_FINAL: {
                        resolved: true,
                        expanded: showCritHitDamageFinalDetail,
                        toggle: () => setShowCritHitDamageFinalDetail((current) => !current),
                        summary: `×${numberText(critHitDamageMultiplier)}`,
                        Component: (
                          <FinalDamageIncreaseBreakdown
                            title="치명타 시 주는 피해 배율"
                            items={critHitDamageResolvedItems}
                            multiplier={critHitDamageMultiplier}
                            totalPercent={(critHitDamageMultiplier - 1) * 100}
                            emptyMessage="감지된 치명타 시 주는 피해 출처가 없습니다."
                            note={`진화 회심과 장비·아크패시브·아크그리드의 '치명타 시' 또는 '치명타로 적중 시' 주는 피해 효과를 각각 (1 + 증가율)로 바꿔 곱합니다. 6번 치명타 피해 ×${numberText(critDamageMultiplier)}와 별도 항이며, 최종 치명타에는 두 값을 곱한 ×${numberText(criticalTotalMultiplier)}가 적용됩니다.`}
                          />
                        ),
                      },
                      CRIT_RATE: {
                        resolved: critRate.sources.length > 0,
                        expanded: showCritRateDetail,
                        toggle: () => setShowCritRateDetail((current) => !current),
                        summary: `${critRate.total >= 0 ? '+' : ''}${numberText(critRate.total)}%`,
                        Component: (
                          <AdditionalDamageBreakdown
                            label="치명타 적중률"
                            sources={critRate.sources}
                            total={critRate.total}
                            note={`API 최종 치명 ${numberText(combatStats.critical)} × ${CRIT_RATE_PER_POINT}%를 기본 치명타 확률로 반영했습니다. 팔찌·장비의 '치명 +N'은 API 최종 치명에 이미 포함되므로 따로 더하지 않습니다. 여기에 장비·각인·아크패시브·아크그리드에서 감지된 치명타 적중률을 합산했습니다. '악마화 중' 효과는 선택 스킬이 [악마 스킬]일 때만 적용합니다. 시너지·스킬 트라이포드 보정치는 포함되지 않습니다.`}
                          />
                        ),
                      },
                      ATTACK_SPEED: {
                        resolved: attackSpeed.sources.length > 0,
                        expanded: showAttackSpeedDetail,
                        toggle: () => setShowAttackSpeedDetail((current) => !current),
                        summary: `+${numberText(attackSpeed.total)}%`,
                        Component: (
                          <AdditionalDamageBreakdown
                            label="공격 속도 증가"
                            sources={attackSpeedSources}
                            total={attackSpeed.total}
                            note={`API 최종 신속 ${numberText(combatStats.swiftness)} × ${SWIFT_SPEED_PER_POINT}% 환산값, 현재 보유 포인트 이하의 아크그리드 공격 속도 옵션${activeFeastName ? `, ${activeFeastName} +${FEAST_SPEED_BONUS}%` : ''}를 합산했습니다. 팔찌·장비의 '신속 +N'은 별도로 더하지 않습니다.`}
                          />
                        ),
                      },
                      MOVE_SPEED: {
                        resolved: moveSpeed.sources.length > 0,
                        expanded: showMoveSpeedDetail,
                        toggle: () => setShowMoveSpeedDetail((current) => !current),
                        summary: `+${numberText(moveSpeed.total)}%`,
                        Component: (
                          <AdditionalDamageBreakdown
                            label="이동 속도 증가"
                            sources={moveSpeed.sources}
                            total={moveSpeed.total}
                            note={`API 최종 신속 ${numberText(combatStats.swiftness)} × ${SWIFT_SPEED_PER_POINT}%${activeFeastName ? `, ${activeFeastName} +${FEAST_SPEED_BONUS}%` : ''}${skillMoveSpeed.sources.length ? `, 보유 스킬 시전 이동속도 +${numberText(skillMoveSpeed.total)}%` : ''}를 합산해 이동속도 증가량 ${numberText(moveSpeed.total)}%로 계산했습니다. 돌격대장은 이 값을 그대로 받아 각인 계수 ${numberText(raidCaptainDamage.coefficient)}%를 곱합니다.`}
                          />
                        ),
                      },
                      COOLDOWN_REDUCTION: {
                        resolved:
                          cooldownReductionSources.length > 0 ||
                          cooldownFixedSources.length > 0 ||
                          categoryCooldown.conditional.length > 0,
                        expanded: showCooldownReductionDetail,
                        toggle: () => setShowCooldownReductionDetail((current) => !current),
                        summary:
                          adjustedCooldown != null
                            ? `${selectedSkillCategory || '분류 미확인'} · ${numberText(adjustedCooldown)}초`
                            : selectedSkillCategory || '',
                        Component: (
                          <CooldownReductionBreakdown
                            skillName={skill.Name}
                            skillCategory={selectedSkillCategory}
                            baseCooldown={baseSkillCooldown}
                            percentSources={cooldownReductionSources}
                            fixedSources={cooldownFixedSources}
                            conditionalSources={categoryCooldown.conditional}
                            percentTotal={cooldownReductionTotal}
                            fixedTotal={cooldownFixedTotal}
                            adjustedCooldown={adjustedCooldown}
                          />
                        ),
                      },
                      KEEN_PENALTY_RATE: {
                        resolved: keenPenalty.active,
                        expanded: showKeenPenaltyDetail,
                        toggle: () => setShowKeenPenaltyDetail((current) => !current),
                        summary: keenPenalty.active ? `${numberText(keenPenalty.rate)}%` : '',
                        Component: (
                          <div className="weapon-attack-breakdown">
                            <div className="weapon-attack-total">
                              <span>
                                <small>예리한 둔기 패널티</small>
                                <b>
                                  확률 {numberText(keenPenalty.rate)}% · 피해 ×
                                  {numberText(keenPenalty.multiplier)}
                                </b>
                              </span>
                              <code>{keenPenalty.description}</code>
                            </div>
                            <p className="weapon-attack-note">
                              패널티 발동 여부는 치명타 여부와 별개이므로 최종 결과를 네 가지
                              조합으로 나눠 계산합니다.
                            </p>
                          </div>
                        ),
                      },
                      KEEN_PENALTY_DAMAGE: {
                        resolved: keenPenalty.active,
                        expanded: showKeenPenaltyDetail,
                        toggle: () => setShowKeenPenaltyDetail((current) => !current),
                        summary: keenPenalty.active
                          ? `×${numberText(keenPenalty.multiplier)} (-${numberText(keenPenalty.reduction)}%)`
                          : '',
                        Component: (
                          <div className="weapon-attack-breakdown">
                            <div className="weapon-attack-total">
                              <span>
                                <small>예리한 둔기 패널티</small>
                                <b>
                                  확률 {numberText(keenPenalty.rate)}% · 피해 ×
                                  {numberText(keenPenalty.multiplier)}
                                </b>
                              </span>
                              <code>{keenPenalty.description}</code>
                            </div>
                            <p className="weapon-attack-note">
                              패널티 발동 여부는 치명타 여부와 별개이므로 최종 결과를 네 가지
                              조합으로 나눠 계산합니다.
                            </p>
                          </div>
                        ),
                      },
                      COMBAT_ATK_RATE: {
                        resolved: attackPower.conditional.some(
                          (source) => source.itemName === '아드레날린',
                        ),
                        expanded: showAdrenalineDetail,
                        toggle: () => setShowAdrenalineDetail((current) => !current),
                        summary: adrenalineAttackSources.length
                          ? `+${numberText(adrenalineAttackTotal)}%`
                          : '미적용',
                        Component: (
                          <AdditionalDamageBreakdown
                            label="아드레날린 공격력 증가"
                            sources={adrenalineAttackSources}
                            total={adrenalineAttackTotal}
                            note="아드레날린은 정해둔 5중첩을 적용하며, 스택당 API 공격력 증가율 × 5로 계산합니다. 최대 6중첩 도달 시에만 발동하는 추가 치명타 적중률은 5중첩 기준에서 제외합니다. 이 공격력 증가는 위 최종 공격력 계산에 이미 반영되므로 다시 곱하지 않습니다."
                          />
                        ),
                      },
                    }[variable]
                    const resolved = detail?.resolved
                    return (
                      <div className="variable-row-group" key={variable}>
                        <div
                          className={`variable-row${resolved ? ' resolved-variable' : ''}`}
                          role={resolved ? 'button' : undefined}
                          tabIndex={resolved ? 0 : undefined}
                          aria-expanded={resolved ? detail.expanded : undefined}
                          onClick={resolved ? detail.toggle : undefined}
                          onKeyDown={
                            resolved
                              ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    detail.toggle()
                                  }
                                }
                              : undefined
                          }
                        >
                          <code>{variable}</code>
                          <span>
                            <b>{label}</b>
                            <small>{reason}</small>
                          </span>
                          {resolved ? (
                            <span className="variable-row-result">
                              {detail.summary && <strong>{detail.summary}</strong>}
                              <em>{detail.expanded ? '▲' : '▼'}</em>
                            </span>
                          ) : (
                            <em>미입력</em>
                          )}
                        </div>
                        {resolved && detail.expanded && (
                          <div className="weapon-attack-detail-row">{detail.Component}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="damage-case-results">
            <div className="damage-section-title">
              <Sigma />
              <span>
                <h4>자동 최종 데미지 계산</h4>
                <small>자동 산출한 스킬 계수와 저장된 모션 상수로 아래 결과를 계산합니다.</small>
              </span>
            </div>
            {motionResults.some((motion) => motion.ready) && (
              <div className="motion-hit-result-list">
                {motionResults.map((motion) => (
                  <article className={motion.ready ? 'resolved' : ''} key={motion.key}>
                    <header>
                      <b>
                        {motion.order}타 모션 × {numberText(motion.repeat)}회
                      </b>
                      <small>{motion.ready ? '계산 완료' : '자동 계산 데이터 부족'}</small>
                    </header>
                    {motion.ready && (
                      <div>
                        <span>
                          <small>비치명 1회</small>
                          <strong>{damageResultText(motion.normalPerHit)}</strong>
                        </span>
                        <span>
                          <small>비치명 모션 합계</small>
                          <strong>{damageResultText(motion.normalTotal)}</strong>
                        </span>
                        <span>
                          <small>치명타 1회</small>
                          <strong>{damageResultText(motion.criticalPerHit)}</strong>
                        </span>
                        <span>
                          <small>치명타 모션 합계</small>
                          <strong>{damageResultText(motion.criticalTotal)}</strong>
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            {motionInputsReady ? (
              <>
                <div className="damage-case-result-grid">
                  {damageCases.map((damageCase) => (
                    <article
                      className={`${damageCase.critical ? 'critical' : 'normal'}${
                        damageCase.penalized ? ' penalized' : ''
                      }`}
                      key={damageCase.key}
                    >
                      <span>
                        <b>{damageCase.critical ? '치명타 발생' : '치명타 미발생'}</b>
                        <small>예리한 둔기 패널티 {damageCase.penalized ? '발동' : '미발동'}</small>
                      </span>
                      <strong>{damageResultText(damageCase.damage)}</strong>
                      <em>발생 확률 {numberText(damageCase.probability * 100)}%</em>
                    </article>
                  ))}
                </div>
                <div className="damage-case-expected">
                  <span>
                    <small>모든 경우를 확률로 합산한 기대 데미지</small>
                    <b>{damageResultText(expectedFinalDamage)}</b>
                  </span>
                  <code>
                    Σ((공격력 × 타수별 스킬 계수 + 타수별 모션 상수) × 반복 횟수) ×{' '}
                    {numberText(sharedDamageMultiplier)}
                  </code>
                </div>
                <p className="damage-case-note">
                  내부 계산은 소수점을 유지하고 결과 표시에서만 FLOOR 처리해 억·만·천 단위로
                  구분합니다. 툴팁에서 감지한 반복 타수와 사용자가 보정한 횟수를 합산합니다. 아직
                  자동 계산되지 않는 트라이포드 피해 배율·백어택·헤드어택 등의 값은 현재 결과에서
                  ×1입니다.
                  {keenPenalty.active
                    ? ` 예리한 둔기는 패널티 확률 ${numberText(keenPenalty.rate)}%, 발동 시 ×${numberText(keenPenalty.multiplier)}로 적용했습니다.`
                    : ' 활성화된 예리한 둔기가 없어 패널티 경우는 표시하지 않습니다.'}
                </p>
              </>
            ) : (
              <div className="damage-case-input-required">
                <b>스킬 계수 자동 계산에 필요한 데이터가 부족합니다.</b>
                <small>
                  공격력 전투 특성의 기본 공격력, 스킬 툴팁 표시 피해, 해당 레벨의 모션 상수를
                  확인해 주세요.
                </small>
              </div>
            )}
          </section>
        </main>
      </div>
    </section>
  )
}
