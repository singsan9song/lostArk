import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  ChevronDown,
  ListTree,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import {
  damageOptionTemplateKeys,
  DAMAGE_EFFECT_CONDITIONS,
  DAMAGE_EFFECT_TYPES,
  collectDamageOptionSourceEntries,
  collectResolvedDamageOptionEffects,
  compactDamageOptionRegistry,
  createMappedDamageAnalysisArmory,
  createDamageOptionRegistryResolver,
  damageOptionSkillCategory,
  damageOptionSkillCategoryLabel,
  DAMAGE_SKILL_CATEGORIES,
  dedupeDamageOptionRegistry,
  fetchBattleStatCoefficients,
  freshDamageEffect,
  freshDamageOptionRecord,
  groupDamageOptionSources,
  isCompleteDamageOptionRecord,
  loadDamageOptionRegistry,
  normalizeDamageOptionSource,
  saveDamageOptionRegistry,
  selectBattleStatRecords,
  toDamageOptionTemplate,
} from '../lib/damageOptionRegistry'
import { lostArkApi } from '../lib/api'
import DamageAnalysis from '../components/DamageAnalysis'
import { InlineItemTooltip } from '../components/ItemTooltip'
import '../damage-option-data.css'

// Used to be a hard render cap for corpus data fetched all at once (thousands of characters
// per popular engraving). The admin corpus endpoint now pages 5 best-geared characters at a
// time server-side (see CommunityPage's loadMoreMapping), so nothing arriving here is large
// enough to need a render-side cap anymore - kept as Infinity so the existing slice/limit
// logic below is a no-op rather than rewiring every call site.
const LIST_PAGE_SIZE = Infinity

function draftIdForTemplate(template) {
  let hash = 2166136261
  for (let index = 0; index < template.length; index += 1) {
    hash ^= template.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `damage-option-draft-${template.length}-${(hash >>> 0).toString(36)}`
}

function MultiTargetButtons({
  label,
  options,
  values,
  emptyLabel,
  onChange,
  optionLabel = (option) => option,
}) {
  const selected = Array.isArray(values) ? values : []
  const toggle = (value) =>
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    )
  return (
    <div className="damage-option-target-group">
      <span>{label}</span>
      <div>
        <button
          type="button"
          className={!selected.length ? 'active' : ''}
          onClick={() => onChange([])}
        >
          {emptyLabel}
        </button>
        {options.map((option) => (
          <button
            type="button"
            className={selected.includes(option) ? 'active' : ''}
            aria-pressed={selected.includes(option)}
            onClick={() => toggle(option)}
            key={option}
          >
            {optionLabel(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function DamageOptionDataPage({
  armory = null,
  profile = armory?.ArmoryProfile || {},
  skills = armory?.ArmorySkills || [],
  sourceArmories = null,
  siblings = [],
  onHover,
  embedded = false,
  managementOnly = false,
  managementView = 'unclassified',
  onClose,
}) {
  const [registry, setRegistry] = useState(loadDamageOptionRegistry)
  const [draftRecords, setDraftRecords] = useState([])
  const [sourceInput, setSourceInput] = useState('')
  const [search, setSearch] = useState('')
  const [recordFilter, setRecordFilter] = useState(
    managementOnly ? (managementView === 'saved' ? 'mapped' : 'unclassified') : 'all',
  )
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [recordLimit, setRecordLimit] = useState(LIST_PAGE_SIZE)
  const [serverState, setServerState] = useState('loading')
  const [serverMessage, setServerMessage] = useState('')
  const [showSourceBrowser, setShowSourceBrowser] = useState(managementOnly)
  const [sourceBrowserSearch, setSourceBrowserSearch] = useState('')
  const [sourceOriginLimit, setSourceOriginLimit] = useState(LIST_PAGE_SIZE)
  const [openSourceOrigin, setOpenSourceOrigin] = useState('')
  const [coefficientStatType, setCoefficientStatType] = useState('')
  const [coefficientKey, setCoefficientKey] = useState('n')
  const [trackedCoefficient, setTrackedCoefficient] = useState(null)
  const [trackedCoefficientLoading, setTrackedCoefficientLoading] = useState(false)
  const [trackingState, setTrackingState] = useState('idle')
  const [trackingMessage, setTrackingMessage] = useState('')

  const sourceArmoryRows = useMemo(
    () =>
      Array.isArray(sourceArmories) && sourceArmories.length
        ? sourceArmories
        : armory
          ? [
              {
                characterName: armory?.ArmoryProfile?.CharacterName || profile?.CharacterName || '',
                armory,
              },
            ]
          : [],
    [armory, profile?.CharacterName, sourceArmories],
  )
  const characterSourceEntries = useMemo(
    () =>
      sourceArmoryRows.flatMap((row) =>
        collectDamageOptionSourceEntries(row.armory).map((entry) => ({
          ...entry,
          origin: [row.characterName, entry.origin].filter(Boolean).join(' · '),
        })),
      ),
    [sourceArmoryRows],
  )
  const characterSourceGroups = useMemo(
    () => groupDamageOptionSources(characterSourceEntries),
    [characterSourceEntries],
  )
  const characterGroupsByTemplate = useMemo(
    () => new Map(characterSourceGroups.map((group) => [group.template, group])),
    [characterSourceGroups],
  )
  const mappedAnalysisArmory = useMemo(
    () => createMappedDamageAnalysisArmory(armory, registry),
    [armory, registry],
  )
  const mappedAnalysisEffects = useMemo(
    () => collectResolvedDamageOptionEffects(armory, registry),
    [armory, registry],
  )
  // "전투 특성" 카테고리로 등록되고 계수 추적이 켜진 레코드만 골라, 효과 타입별(치명타
  // 적중률/공격 속도/이동 속도/재사용 대기시간 감소)로 최신 추적 계수를 하나씩 불러온다 -
  // DamageAnalysis가 API 스탯값 × 이 구간의 최저값을 데미지 분석 미리보기에 반영하는 데 쓴다.
  const battleStatRecords = useMemo(
    () => selectBattleStatRecords(registry.records),
    [registry.records],
  )
  const [battleStatCoefficients, setBattleStatCoefficients] = useState({})
  useEffect(() => {
    let active = true
    fetchBattleStatCoefficients(battleStatRecords).then((next) => {
      if (active) setBattleStatCoefficients(next)
    })
    return () => {
      active = false
    }
  }, [battleStatRecords])
  const allArmorySkills = useMemo(
    () =>
      sourceArmoryRows.length
        ? sourceArmoryRows.flatMap((row) => row.armory?.ArmorySkills || [])
        : armory?.ArmorySkills || skills,
    [armory?.ArmorySkills, skills, sourceArmoryRows],
  )
  const mappedAnalysisSkills = mappedAnalysisArmory?.ArmorySkills || allArmorySkills
  const skillOptions = useMemo(
    () =>
      [...new Set((allArmorySkills || []).map((skill) => skill?.Name).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'ko'),
      ),
    [allArmorySkills],
  )
  const skillCategoryOptions = useMemo(
    () =>
      [
        ...new Set(
          [
            ...DAMAGE_SKILL_CATEGORIES,
            ...(allArmorySkills || []).map(damageOptionSkillCategory),
          ].filter(Boolean),
        ),
      ].sort((a, b) =>
        damageOptionSkillCategoryLabel(a).localeCompare(
          damageOptionSkillCategoryLabel(b),
          'ko',
        ),
      ),
    [allArmorySkills],
  )

  const loadServerRegistry = async () => {
    setServerState('loading')
    setServerMessage('')
    try {
      const stored = await lostArkApi.getDamageOptionRegistry()
      const completed = compactDamageOptionRegistry(stored || { version: 1, records: [] })
      setRegistry(completed)
      setDraftRecords([])
      saveDamageOptionRegistry(completed)
      setServerState('ready')
      setServerMessage(
        completed.records.length
          ? `서버 JSON ${completed.records.length}개 로드`
          : '서버 JSON이 비어 있습니다.',
      )
    } catch (error) {
      setServerState('error')
      setServerMessage(error.message || '서버 JSON을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    loadServerRegistry()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => saveDamageOptionRegistry(registry), 350)
    return () => window.clearTimeout(timer)
  }, [registry])

  useEffect(() => {
    setRecordLimit(LIST_PAGE_SIZE)
  }, [search, recordFilter])

  useEffect(() => {
    if (!showSourceBrowser) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowSourceBrowser(false)
        onClose?.()
      }
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, showSourceBrowser])

  const saveServerRegistry = async () => {
    const candidates = dedupeDamageOptionRegistry({
      version: 1,
      records: [...registry.records, ...draftRecords],
    })
    const invalid = candidates.records.find(
      (record) =>
        !record.ignored &&
        (record.effects || []).length > 0 &&
        !isCompleteDamageOptionRecord(record),
    )
    if (invalid) {
      setServerState('error')
      setServerMessage(`수치 변수가 연결되지 않은 원문이 있습니다: ${invalid.source}`)
      return
    }
    const completed = compactDamageOptionRegistry(candidates)
    setServerState('saving')
    setServerMessage('')
    try {
      const saved = compactDamageOptionRegistry(
        await lostArkApi.saveDamageOptionRegistry(completed),
      )
      setRegistry(saved)
      setDraftRecords([])
      setRecordFilter(managementView === 'saved' ? recordFilter : 'unclassified')
      setRecordLimit(LIST_PAGE_SIZE)
      setSelectedId(null)
      saveDamageOptionRegistry(saved)
      setServerState('saved')
      setServerMessage(
        managementView === 'saved'
          ? `서버 JSON에 ${saved.records.length}개 저장했습니다.`
          : `서버 JSON에 ${saved.records.length}개 저장했습니다. 다음 미분류 원문을 불러옵니다.`,
      )
    } catch (error) {
      setServerState('error')
      setServerMessage(error.message || '서버 JSON 저장에 실패했습니다.')
    }
  }
  const resolver = useMemo(() => createDamageOptionRegistryResolver(registry), [registry])
  const unclassifiedRecords = useMemo(() => {
    if (managementView === 'saved') return []
    const pendingByTemplate = new Map(
      draftRecords
        .filter((record) => !resolver(record.source))
        .map((record) => [record.source, record]),
    )
    const records = []
    const includedTemplates = new Set()

    for (const group of characterSourceGroups) {
      if (records.length >= LIST_PAGE_SIZE) break
      if (includedTemplates.has(group.template) || resolver(group.sources[0])) continue
      records.push(
        pendingByTemplate.get(group.template) || {
          id: draftIdForTemplate(group.template),
          source: group.template,
          // "캐릭터명 · 카테고리 · 세부" 형태인 origin에서 카테고리(스킬/전투 특성/각인/
          // 아크패시브 등)만 뽑아서 저장해둔다 - "저장 매핑 관리"는 캐릭터 코퍼스 없이
          // 이 값만으로 필터링하므로, 분류(매핑)하는 이 시점에만 구할 수 있는 값이다.
          category: group.origins[0]?.split(' · ')[1] || '',
          ignored: false,
          effects: [],
          _draft: true,
        },
      )
      includedTemplates.add(group.template)
    }

    for (const pending of pendingByTemplate.values()) {
      if (records.length >= LIST_PAGE_SIZE) break
      if (includedTemplates.has(pending.source)) continue
      records.push(pending)
      includedTemplates.add(pending.source)
    }

    return records
  }, [characterSourceGroups, draftRecords, managementView, resolver])
  // "저장 매핑 관리"는 캐릭터 코퍼스(characterSourceGroups) 없이도 서버에 저장된 전체
  // 레코드를 그대로 보여준다 - 직업/각인을 먼저 골라야 하던 예전 제약이 없어진다.
  const savedWorkRecords = useMemo(() => {
    if (managementView !== 'saved') return []
    const query = normalizeDamageOptionSource(search)
    return [...draftRecords, ...registry.records]
      .filter((record) => {
        if (recordFilter === 'ignored') return record.ignored
        if (recordFilter === 'mapped') return !record.ignored && record.effects.length > 0
        return true
      })
      .filter((record) => normalizeDamageOptionSource(record.source).includes(query))
      .filter((record) => !categoryFilter || record.category === categoryFilter)
      .slice(0, LIST_PAGE_SIZE)
  }, [categoryFilter, draftRecords, managementView, recordFilter, registry.records, search])
  const workRecords =
    managementView === 'saved' ? savedWorkRecords : unclassifiedRecords
  const workTemplateSignature = workRecords.map((record) => record.source).join('\u001f')
  const workTemplateSet = useMemo(
    () => new Set(workRecords.map((record) => record.source)),
    [workTemplateSignature],
  )
  const sourceTemplateByRaw = useMemo(() => {
    const templates = new Map()
    characterSourceGroups.forEach((group) => {
      group.sources.forEach((source) => templates.set(source, group.template))
    })
    return templates
  }, [characterSourceGroups])
  const workSourceEntries = useMemo(
    () =>
      characterSourceEntries.filter((entry) =>
        workTemplateSet.has(sourceTemplateByRaw.get(entry.source)),
      ),
    [characterSourceEntries, sourceTemplateByRaw, workTemplateSet],
  )
  const displayRecordForSource = (source) => {
    const template = groupDamageOptionSources([source])[0]?.template
    const draft = draftRecords.find((record) => record.source === template)
    if (draft) return draft
    return resolver(source)
  }
  const sourceStatusRank = (source) => {
    const record = displayRecordForSource(source)
    if (!record) return 0
    return record.ignored ? 2 : 1
  }
  useEffect(() => {
    setSourceOriginLimit(LIST_PAGE_SIZE)
    setOpenSourceOrigin('')
  }, [sourceBrowserSearch, workTemplateSignature])

  const matchingSourceOriginCount = useMemo(() => {
    const query = normalizeDamageOptionSource(sourceBrowserSearch)
    const origins = new Set()
    workSourceEntries.forEach((entry) => {
      const origin = entry.origin || '출처 미확인'
      const name = origin.split(' · ').at(-1) || origin
      if (!query || normalizeDamageOptionSource(name).includes(query)) origins.add(origin)
    })
    return origins.size
  }, [sourceBrowserSearch, workSourceEntries])
  const visibleSourceTooltipGroups = useMemo(() => {
    const query = normalizeDamageOptionSource(sourceBrowserSearch)
    const groups = new Map()
    workSourceEntries.forEach((entry, index) => {
      const origin = entry.origin || '출처 미확인'
      const name = origin.split(' · ').at(-1) || origin
      if (query && !normalizeDamageOptionSource(name).includes(query)) return
      if (!groups.has(origin) && groups.size >= sourceOriginLimit) return
      if (!groups.has(origin)) groups.set(origin, { origin, entries: [] })
      groups.get(origin).entries.push({
        ...entry,
        index,
      })
    })
    return [...groups.values()]
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort(
          (a, b) => sourceStatusRank(a.source) - sourceStatusRank(b.source) || a.index - b.index,
        ),
      }))
      .sort((a, b) => {
        const groupRank = (group) =>
          Math.min(...group.entries.map((entry) => sourceStatusRank(entry.source)))
        return groupRank(a) - groupRank(b) || a.origin.localeCompare(b.origin, 'ko')
      })
  }, [draftRecords, resolver, sourceBrowserSearch, sourceOriginLimit, workSourceEntries])
  const allRecords = useMemo(() => {
    const base =
      managementView === 'saved'
        ? registry.records
        : [...unclassifiedRecords, ...registry.records]
    const draftsById = new Map(draftRecords.map((record) => [record.id, record]))
    const draftsBySource = new Map(draftRecords.map((record) => [record.source, record]))
    const includedDraftIds = new Set()
    const overlaid = base.map((record) => {
      const draft = draftsById.get(record.id) || draftsBySource.get(record.source)
      if (!draft) return record
      includedDraftIds.add(draft.id)
      return draft
    })
    draftRecords.forEach((draft) => {
      if (!includedDraftIds.has(draft.id)) overlaid.push(draft)
    })
    return overlaid
  }, [draftRecords, managementView, registry.records, unclassifiedRecords])
  const visibleSavedRegistry = registry.records
  const availableCategories = useMemo(
    () => [...new Set(registry.records.map((record) => record.category).filter(Boolean))],
    [registry.records],
  )
  const unmappedCount = allRecords.filter(
    (record) => record._draft && !record.ignored && record.effects.length === 0,
  ).length
  const selected = allRecords.find((record) => record.id === selectedId) || null
  // "자동 추적" 시작 시 어떤 전투특성으로 추적할지 고르는 셀렉트에 채울 옵션 목록.
  const availableStatTypes = useMemo(
    () => [
      ...new Set(
        sourceArmoryRows.flatMap((row) =>
          (row.armory?.ArmoryProfile?.Stats || []).map((stat) => stat.Type),
        ),
      ),
    ].filter(Boolean),
    [sourceArmoryRows],
  )
  const coefficientTemplateKeys = selected
    ? damageOptionTemplateKeys(toDamageOptionTemplate(selected.source))
    : []
  useEffect(() => {
    if (!selected) return
    const keys = damageOptionTemplateKeys(toDamageOptionTemplate(selected.source))
    if (!keys.includes(coefficientKey)) setCoefficientKey(keys[0] || 'n')
  }, [selected])
  const coefficientEntries = useMemo(() => {
    if (!selected) return []
    const template = toDamageOptionTemplate(selected.source)
    return characterSourceEntries.filter(
      (entry) => toDamageOptionTemplate(entry.source) === template,
    )
  }, [selected, characterSourceEntries])
  // 원문이 전투특성 스탯 자체의 설명 문구(예: 특화의 "각성 스킬 피해량 {n}% 증가")면 origin이
  // 이미 "캐릭터명 · 전투 특성 · 특화"처럼 어느 스탯 소속인지 말해주고 있으므로, 그럴 땐 직접
  // 고를 필요 없이 자동으로 채운다. 스킬처럼 출처가 특정 스탯을 안 밝히는 원문은 계속 수동 선택.
  const detectedStatType = useMemo(() => {
    const types = new Set(
      coefficientEntries
        .map((entry) => {
          const parts = String(entry.origin || '').split(' · ')
          const statIndex = parts.indexOf('전투 특성')
          return statIndex >= 0 ? parts[statIndex + 1]?.trim() : null
        })
        .filter(Boolean),
    )
    return types.size === 1 ? [...types][0] : ''
  }, [coefficientEntries])
  useEffect(() => {
    if (detectedStatType) setCoefficientStatType(detectedStatType)
  }, [detectedStatType])
  const filtered = useMemo(
    () => {
      const savedOrder = new Map(
        allRecords.map((record, index) => [record.id, index]),
      )
      return allRecords
        .filter((record) => {
          if (recordFilter === 'unclassified') {
            return record._draft
          }
          if (recordFilter === 'saved') return !record._draft
          if (recordFilter === 'mapped') {
            return !record._draft && !record.ignored && record.effects.length > 0
          }
          if (recordFilter === 'ignored') return !record._draft && record.ignored
          return true
        })
        .filter((record) =>
          normalizeDamageOptionSource(record.source).includes(normalizeDamageOptionSource(search)),
        )
        .filter(
          (record) =>
            managementView !== 'saved' || !categoryFilter || record.category === categoryFilter,
        )
        .sort((a, b) => {
          const status = (record) => (record.ignored ? 2 : record.effects.length ? 1 : 0)
          return status(a) - status(b) || savedOrder.get(a.id) - savedOrder.get(b.id)
        })
    },
    [allRecords, categoryFilter, managementView, search, recordFilter],
  )
  const visibleRecords = filtered.slice(0, recordLimit)

  const addSources = () => {
    const sources = sourceInput
      .split(/\r?\n/)
      .map(normalizeDamageOptionSource)
      .filter(Boolean)
    const groups = groupDamageOptionSources(sources)
    if (!groups.length) return
    const additions = groups
      .filter((group) => !resolver(group.sources[0]))
      .filter((group) => !draftRecords.some((record) => record.source === group.template))
      .map((group) => ({ ...freshDamageOptionRecord(group.template), _draft: true }))
    if (!additions.length) return
    setDraftRecords((current) => [...current, ...additions])
    setSelectedId(additions[0].id)
    setSourceInput('')
  }

  const updateRecord = (id, updater) => {
    const transientRecord =
      draftRecords.find((record) => record.id === id) ||
      allRecords.find((record) => record.id === id)
    if (!transientRecord) return
    setDraftRecords((current) => {
      const next = { ...updater(transientRecord), _draft: true }
      const existingIndex = current.findIndex((record) => record.id === id)
      if (existingIndex < 0) return [...current, next]
      return current.map((record, index) => (index === existingIndex ? next : record))
    })
  }
  const selectedDraft = selected
    ? draftRecords.find((record) => record.id === selected.id)
    : null
  const saveSelectedRecord = async () => {
    if (!selectedDraft) return
    if (!isCompleteDamageOptionRecord(selectedDraft)) {
      setServerState('error')
      setServerMessage(
        selectedDraft.ignored
          ? '저장할 수 없는 원문입니다.'
          : '계산 효과와 수치 변수를 모두 연결한 뒤 저장하세요.',
      )
      return
    }

    const { _draft, ...persistentRecord } = selectedDraft
    const existingIndex = registry.records.findIndex(
      (record) =>
        record.id === persistentRecord.id || record.source === persistentRecord.source,
    )
    const nextRecords =
      existingIndex >= 0
        ? registry.records.map((record, index) =>
            index === existingIndex ? persistentRecord : record,
          )
        : [...registry.records, persistentRecord]
    const completed = compactDamageOptionRegistry({
      version: 1,
      records: nextRecords,
    })

    setServerState('saving')
    setServerMessage('')
    try {
      const saved = compactDamageOptionRegistry(
        await lostArkApi.saveDamageOptionRegistry(completed),
      )
      setRegistry(saved)
      setDraftRecords((current) =>
        current.filter((record) => record.id !== selectedDraft.id),
      )
      saveDamageOptionRegistry(saved)
      setServerState('saved')
      setServerMessage(`"${persistentRecord.source}" 원문을 서버 JSON에 저장했습니다.`)
      if (managementView !== 'saved') setSelectedId(null)
    } catch (error) {
      setServerState('error')
      setServerMessage(error.message || '원문을 서버 JSON에 저장하지 못했습니다.')
    }
  }
  const refreshTrackedCoefficient = async (recordId) => {
    setTrackedCoefficientLoading(true)
    try {
      setTrackedCoefficient(await lostArkApi.getDamageOptionCoefficient(recordId))
    } catch {
      setTrackedCoefficient(null)
    } finally {
      setTrackedCoefficientLoading(false)
    }
  }
  useEffect(() => {
    setTrackingState('idle')
    setTrackingMessage('')
    if (!selected?.coefficientStatType) {
      setTrackedCoefficient(null)
      return
    }
    refreshTrackedCoefficient(selected.id)
  }, [selected?.id, selected?.coefficientStatType])
  // 지금 선택한 전투특성으로 이 원문을 "상시 추적"으로 전환한다 - 어느 직업/각인의
  // 캐릭터가 저장될 때마다 서버가 알아서 구간을 좁혀서 DB에 들고 있고(백엔드
  // DamageOptionCoefficientTracker), 여기서는 그 값을 읽어오기만 한다. 기존 저장(매핑
  // 확정) 흐름과 똑같이 서버 JSON에 저장하되, coefficient* 필드만 얹어서 보낸다.
  const startTrackingCoefficient = async () => {
    if (!selected || !coefficientStatType) return
    const base = selectedDraft || selected
    const trackedRecord = {
      ...base,
      coefficientStatType,
      coefficientKey,
    }
    if (!isCompleteDamageOptionRecord(trackedRecord)) {
      setTrackingState('error')
      setTrackingMessage('계산 효과와 수치 변수를 모두 연결한 뒤 추적을 시작하세요.')
      return
    }
    const { _draft, ...persistentRecord } = trackedRecord
    const existingIndex = registry.records.findIndex(
      (record) => record.id === persistentRecord.id || record.source === persistentRecord.source,
    )
    const nextRecords =
      existingIndex >= 0
        ? registry.records.map((record, index) =>
            index === existingIndex ? persistentRecord : record,
          )
        : [...registry.records, persistentRecord]
    const completed = compactDamageOptionRegistry({ version: 1, records: nextRecords })
    setTrackingState('saving')
    setTrackingMessage('')
    try {
      const saved = compactDamageOptionRegistry(await lostArkApi.saveDamageOptionRegistry(completed))
      setRegistry(saved)
      setDraftRecords((current) => current.filter((record) => record.id !== trackedRecord.id))
      saveDamageOptionRegistry(saved)
      await lostArkApi.backfillDamageOptionCoefficient(persistentRecord.id)
      setTrackingState('saved')
      setTrackingMessage('추적을 시작했습니다 — 전체 캐릭터를 훑는 동안 잠시 후 새로고침해보세요.')
      await refreshTrackedCoefficient(persistentRecord.id)
    } catch (error) {
      setTrackingState('error')
      setTrackingMessage(error.message || '추적을 시작하지 못했습니다.')
    }
  }
  const markSourceIgnored = (source) => {
    const template = groupDamageOptionSources([source])[0]?.template
    if (!template) return
    const record = allRecords.find((item) => item.source === template)
    if (record) {
      updateRecord(record.id, (current) => ({
        ...current,
        ignored: true,
        effects: [],
      }))
      return
    }
    const ignored = {
      ...freshDamageOptionRecord(template),
      ignored: true,
      effects: [],
      _draft: true,
    }
    setDraftRecords((current) => [...current, ignored])
  }
  const selectSourceForEditing = (source) => {
    const template = groupDamageOptionSources([source])[0]?.template
    const matched =
      displayRecordForSource(source) ||
      allRecords.find((record) => record.source === template)
    if (!matched) return
    if (matched.id === selectedId) {
      setSelectedId(null)
      return
    }
    setSelectedId(matched.id)
    setRecordFilter('all')
    setSearch('')
  }

  const closeSourceBrowser = () => {
    setShowSourceBrowser(false)
    onClose?.()
  }

  return (
    <main className={`damage-option-data-page${embedded ? ' embedded' : ''}`}>
      {!managementOnly && (
        <DamageAnalysis
          profile={profile}
          skills={mappedAnalysisSkills}
          armory={mappedAnalysisArmory}
          siblings={siblings}
          onHover={onHover}
          mappedEffects={mappedAnalysisEffects}
          mappedSourceArmory={armory}
          battleStatCoefficients={battleStatCoefficients}
        />
      )}

      {showSourceBrowser && (
        <div
          className="damage-option-data-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSourceBrowser()
          }}
        >
          <div
            className="damage-option-data-modal"
            role="dialog"
            aria-modal="true"
            aria-label="API 수집 원문 툴팁 및 매핑 데이터 관리"
          >
            <div className="damage-option-data-modal-content">
      {managementView !== 'saved' && (
      <section className="damage-option-source-browser is-open">
        <header>
          <span>
            <ListTree />
            <span>
              <small>RAW TOOLTIP INVENTORY</small>
              <b>
                {managementView === 'saved'
                  ? '저장된 매핑 원문 툴팁'
                  : 'API 수집 원문 툴팁 · 현재 작업 묶음'}
              </b>
              <em>
                전체 캐릭터 {sourceArmoryRows.length}명 · 표시 템플릿 {workRecords.length}개
                {' · '}관련 출처 {matchingSourceOriginCount}개 · 관련 원문 {workSourceEntries.length}개
              </em>
            </span>
          </span>
          <button
            type="button"
            onClick={closeSourceBrowser}
          >
            모달 닫기
            <ChevronDown />
          </button>
        </header>
          <div className="damage-option-source-browser-body">
            <label className="damage-option-source-browser-search">
              <Search />
              <input
                value={sourceBrowserSearch}
                placeholder="이름 검색"
                onChange={(event) => setSourceBrowserSearch(event.target.value)}
              />
            </label>
            <p>
              {managementView === 'saved'
                ? '서버 JSON에 저장된 매핑 중 현재 필터의 최대 100개와 관련된 실제 API 원문을 표시합니다. 매핑 완료와 매핑 불필요 필터를 바꿔 기존 데이터를 수정할 수 있습니다.'
                : '전체 API 데이터 중 현재 편집할 미분류 템플릿 최대 100개와 관련된 원문만 표시합니다. 저장하면 완료된 항목을 제외하고 다음 미분류 항목으로 다시 채웁니다.'}{' '}
              적용 스킬과 스킬 분류 선택지는 전체 캐릭터 데이터를 기준으로 유지합니다.
            </p>
            <div className="damage-option-source-tooltip-list">
              {visibleSourceTooltipGroups.map((group) => {
                const isOpen = openSourceOrigin === group.origin
                const tooltipItem = group.entries.find((entry) => {
                  if (!entry.tooltipItem?.Tooltip) return false
                  try {
                    const parsed = JSON.parse(entry.tooltipItem.Tooltip)
                    return parsed && typeof parsed === 'object'
                  } catch {
                    return false
                  }
                })?.tooltipItem
                return (
                  <article className={isOpen ? 'is-open' : ''} key={group.origin}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setOpenSourceOrigin((current) =>
                          current === group.origin ? '' : group.origin,
                        )
                      }
                    >
                      <span>
                        <b>{group.origin}</b>
                        <small>원문 {group.entries.length}개</small>
                      </span>
                      <ChevronDown />
                    </button>
                    {isOpen && (
                      <div className="damage-option-tooltip-preview-layout">
                        {tooltipItem ? (
                          <InlineItemTooltip
                            item={tooltipItem}
                            className="damage-option-real-tooltip"
                          />
                        ) : (
                          <div className="game-tooltip-item game-tooltip-inline damage-option-generated-tooltip">
                            <div className="ItemTitle">
                              <span className="leftStr0">{group.origin}</span>
                            </div>
                            <div className="ItemPartBox">
                              원본 API에 구조화된 Tooltip이 없는 데이터입니다.
                            </div>
                          </div>
                        )}
                        <section className="damage-option-collected-lines">
                          <h4>수집기에 들어온 전체 원문 · {group.entries.length}개</h4>
                          <ol>
                            {group.entries.map((entry) => {
                              const matched = displayRecordForSource(entry.source)
                              const template = groupDamageOptionSources([entry.source])[0]?.template
                              const editableRecord =
                                matched ||
                                allRecords.find((record) => record.source === template)
                              const status = matched?.ignored
                                ? 'ignored'
                                : matched
                                  ? 'mapped'
                                  : 'unmapped'
                              const isSelected = editableRecord?.id === selectedId
                              return (
                                <li
                                  className={`${status}${isSelected ? ' selected' : ''}`}
                                  key={`${entry.index}-${entry.source}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => selectSourceForEditing(entry.source)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault()
                                      selectSourceForEditing(entry.source)
                                    }
                                  }}
                                >
                                  <span>
                                    <span>{entry.source}</span>
                                    <em>
                                      {status === 'mapped'
                                        ? matched?._draft
                                          ? '저장 전 편집'
                                          : '매핑 완료'
                                        : status === 'ignored'
                                          ? matched?._draft
                                            ? '저장 전 · 매핑 불필요'
                                            : '매핑 불필요'
                                          : '미분류'}
                                    </em>
                                  </span>
                                  {status === 'unmapped' && (
                                    <button
                                      type="button"
                                      title="같은 원문 템플릿 전체를 매핑 불필요로 표시"
                                      aria-label={`${entry.source} 매핑 불필요 표시`}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        markSourceIgnored(entry.source)
                                      }}
                                    >
                                      <Trash2 />
                                    </button>
                                  )}
                                </li>
                              )
                            })}
                          </ol>
                        </section>
                      </div>
                    )}
                  </article>
                )
              })}
              {!visibleSourceTooltipGroups.length && (
                <p className="damage-option-source-browser-empty">
                  검색어와 일치하는 원문이 없습니다.
                </p>
              )}
              {visibleSourceTooltipGroups.length < matchingSourceOriginCount && (
                <button
                  type="button"
                  className="damage-option-load-more"
                  onClick={() =>
                    setSourceOriginLimit((current) => current + LIST_PAGE_SIZE)
                  }
                >
                  관련 출처{' '}
                  {Math.min(
                    LIST_PAGE_SIZE,
                    matchingSourceOriginCount - visibleSourceTooltipGroups.length,
                  )}
                  개 더 보기
                </button>
              )}
            </div>
          </div>
      </section>
      )}

      <div className="damage-option-mapping-pane">
      <header className="damage-option-data-modal-toolbar">
        <span>
          <b>원문 매핑 편집</b>
          <small>{serverMessage || '변경 후 서버 JSON에 저장하세요.'}</small>
        </span>
        <div>
          <button
            type="button"
            onClick={loadServerRegistry}
            disabled={serverState === 'loading'}
          >
            <RefreshCw /> 다시 읽기
          </button>
          <button
            type="button"
            onClick={saveServerRegistry}
            disabled={serverState === 'saving'}
          >
            <Save /> 서버 JSON 저장
          </button>
        </div>
      </header>
      {managementView !== 'saved' && (
        <section className="damage-option-data-add">
          <label>
            <b>원문 등록</b>
            <small>
              숫자가 바뀌는 자리는 {'{n}'}, 두 번째 숫자는 {'{m}'}처럼 등록합니다. 같은
              템플릿은 모든 캐릭터에 재사용됩니다.
            </small>
            <textarea
              value={sourceInput}
              placeholder={'무기 공격력 +{n}'}
              onChange={(event) => setSourceInput(event.target.value)}
            />
          </label>
          <button type="button" onClick={addSources}>
            <Plus /> 데이터 추가
          </button>
        </section>
      )}

      <div className="damage-option-data-workspace">
        <aside className="damage-option-record-list">
          <header>
            <b>원문 데이터</b>
            <small>
              저장 {visibleSavedRegistry.length}개
              {managementView === 'saved'
                ? ` · 현재 표시 ${savedWorkRecords.length}개`
                : ` · 현재 작업 ${unclassifiedRecords.length}개 · 미분류 ${unmappedCount}개`}
            </small>
          </header>
          <label className="damage-option-search">
            <Search />
            <input
              value={search}
              placeholder="원문 검색"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="damage-option-record-filters">
            <button
              type="button"
              className={recordFilter === 'all' ? 'active' : ''}
              onClick={() => setRecordFilter('all')}
            >
              전체
            </button>
            {managementView !== 'saved' && (
              <button
                type="button"
                className={recordFilter === 'unclassified' ? 'active' : ''}
                onClick={() => setRecordFilter('unclassified')}
              >
                미분류 {unmappedCount}
              </button>
            )}
            <button
              type="button"
              className={recordFilter === 'saved' ? 'active' : ''}
              onClick={() => setRecordFilter('saved')}
            >
              저장 전체 {visibleSavedRegistry.length}
            </button>
            <button
              type="button"
              className={recordFilter === 'mapped' ? 'active' : ''}
              onClick={() => setRecordFilter('mapped')}
            >
              매핑 완료{' '}
              {
                visibleSavedRegistry.filter(
                  (record) => !record.ignored && record.effects.length > 0,
                ).length
              }
            </button>
            <button
              type="button"
              className={recordFilter === 'ignored' ? 'active' : ''}
              onClick={() => setRecordFilter('ignored')}
            >
              매핑 불필요 {visibleSavedRegistry.filter((record) => record.ignored).length}
            </button>
          </div>
          {managementView === 'saved' && availableCategories.length > 0 && (
            <label className="damage-option-category-filter">
              <span>카테고리</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">전체</option>
                {availableCategories.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="damage-option-record-items">
            {visibleRecords.map((record) => {
              const sourceGroup = characterGroupsByTemplate.get(record.source)
              return (
                <button
                  type="button"
                  className={selectedId === record.id ? 'active' : ''}
                  aria-pressed={selectedId === record.id}
                  onClick={() =>
                    setSelectedId((current) => (current === record.id ? null : record.id))
                  }
                  key={record.id}
                >
                  <span>{record.source}</span>
                  <small>
                    {record._draft
                      ? record.ignored
                        ? '저장 전 · 매핑 불필요'
                        : record.effects.length
                          ? `저장 전 매핑 · ${record.effects.length}개 효과`
                          : '미분류'
                      : record.ignored
                        ? '매핑 불필요'
                        : `매핑 완료 · ${record.effects.length}개 효과`}
                    {sourceGroup?.occurrenceCount
                      ? ` · 현재 캐릭터 ${sourceGroup.occurrenceCount}회`
                      : ''}
                  </small>
                  {managementView !== 'saved' && sourceGroup?.sources.length > 0 && (
                    <em>실제 원문: {sourceGroup.sources.slice(0, 2).join(' / ')}</em>
                  )}
                  {managementView !== 'saved' && sourceGroup?.origins.length > 0 && (
                    <em className="origin">
                      검출 위치: {sourceGroup.origins.slice(0, 2).join(' / ')}
                    </em>
                  )}
                </button>
              )
            })}
          </div>
          {visibleRecords.length < filtered.length && (
            <button
              type="button"
              className="damage-option-load-more"
              onClick={() => setRecordLimit((current) => current + LIST_PAGE_SIZE)}
            >
              원문 {Math.min(LIST_PAGE_SIZE, filtered.length - visibleRecords.length)}개 더 보기
            </button>
          )}
        </aside>

        <section className="damage-option-record-editor">
          {selected ? (
            <>
              <header>
                <span>
                  <small>정확 일치 원문</small>
                  <b>{selected.source}</b>
                </span>
                <button
                  type="button"
                  className={selected.ignored ? 'restore' : 'exclude'}
                  onClick={() =>
                    updateRecord(selected.id, (record) => ({
                      ...record,
                      ignored: !record.ignored,
                    }))
                  }
                >
                  {selected.ignored ? <RotateCcw /> : <Ban />}
                  {selected.ignored ? '매핑 대상으로 복구' : '매핑 불필요 표시'}
                </button>
              </header>
              <label className="damage-option-source-edit">
                <span>
                  원문 템플릿 · 변수: {damageOptionTemplateKeys(selected.source).join(', ') || '없음'}
                </span>
                <textarea
                  value={selected.source}
                  onChange={(event) =>
                    updateRecord(selected.id, (record) => ({
                      ...record,
                      source: event.target.value,
                    }))
                  }
                />
              </label>
              {managementView !== 'saved' &&
                characterGroupsByTemplate.get(selected.source)?.sources.length > 0 && (
                <div className="damage-option-source-examples">
                  <b>
                    현재 캐릭터에서 같은 원문 템플릿{' '}
                    {characterGroupsByTemplate.get(selected.source).occurrenceCount}회 · 실제 원문{' '}
                    {characterGroupsByTemplate.get(selected.source).sources.length}종
                  </b>
                  {characterGroupsByTemplate
                    .get(selected.source)
                    .sources
                    .slice(0, LIST_PAGE_SIZE)
                    .map((source) => (
                      <small key={source}>{source}</small>
                    ))}
                  {characterGroupsByTemplate.get(selected.source).sources.length > LIST_PAGE_SIZE && (
                    <small>
                      나머지{' '}
                      {characterGroupsByTemplate.get(selected.source).sources.length -
                        LIST_PAGE_SIZE}
                      종은 렌더링하지 않았습니다.
                    </small>
                  )}
                </div>
              )}
              {managementView !== 'saved' &&
                characterGroupsByTemplate.get(selected.source)?.origins.length > 0 && (
                <div className="damage-option-source-origins">
                  <b>
                    검출 위치{' '}
                    {characterGroupsByTemplate.get(selected.source).origins.length}곳
                  </b>
                  {characterGroupsByTemplate
                    .get(selected.source)
                    .origins
                    .slice(0, LIST_PAGE_SIZE)
                    .map((origin) => (
                      <small key={origin}>{origin}</small>
                    ))}
                </div>
              )}
              <div className="damage-option-effect-heading">
                <span>
                  <b>계산 효과</b>
                  <small>
                    고정 수치 없이 원문의 {'{n}'}, {'{m}'} 변수를 효과에 연결합니다.
                    저장 버튼을 눌러야 매핑이 확정됩니다.
                  </small>
                </span>
                <div className="damage-option-effect-actions">
                  <button
                    type="button"
                    disabled={selected.ignored}
                    onClick={() =>
                      updateRecord(selected.id, (record) => ({
                        ...record,
                        effects: [...record.effects, freshDamageEffect()],
                      }))
                    }
                  >
                    <Plus /> 효과 추가
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!selectedDraft || serverState === 'saving'}
                    onClick={saveSelectedRecord}
                  >
                    <Save /> {serverState === 'saving' ? '저장 중' : '저장'}
                  </button>
                </div>
              </div>
              <div className="damage-option-effect-list">
                {selected.ignored ? (
                  <p>이 원문은 매핑 불필요로 저장되며 다른 캐릭터에서도 다시 분류하지 않습니다.</p>
                ) : selected.effects.map((effect, index) => {
                  const templateKeys = damageOptionTemplateKeys(selected.source)
                  return (
                    <article key={`${selected.id}-${index}`}>
                      <select
                        value={effect.type}
                        aria-label={`${index + 1}번 계산 분류`}
                        onChange={(event) =>
                          updateRecord(selected.id, (record) => ({
                            ...record,
                            effects: record.effects.map((item, effectIndex) =>
                              effectIndex === index ? { ...item, type: event.target.value } : item,
                            ),
                          }))
                        }
                      >
                        {DAMAGE_EFFECT_TYPES.map((type) => (
                          <option value={type.value} key={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <label>
                        <span>수치 연결</span>
                        <select
                          value={effect.valueKey || ''}
                          onChange={(event) =>
                            updateRecord(selected.id, (record) => ({
                              ...record,
                              effects: record.effects.map((item, effectIndex) =>
                                effectIndex === index
                                  ? { ...item, valueKey: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        >
                          {!templateKeys.length && <option value="">변수 없음</option>}
                          {templateKeys.map((key) => (
                            <option value={key} key={key}>
                              {`{${key}}`} 값
                            </option>
                          ))}
                        </select>
                      </label>
                      <select
                        value={effect.condition || 'ALWAYS'}
                        aria-label={`${index + 1}번 적용 조건`}
                        onChange={(event) =>
                          updateRecord(selected.id, (record) => ({
                            ...record,
                            effects: record.effects.map((item, effectIndex) =>
                              effectIndex === index
                                ? { ...item, condition: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      >
                        {DAMAGE_EFFECT_CONDITIONS.map((condition) => (
                          <option value={condition.value} key={condition.value}>
                            {condition.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={effect.label || ''}
                        placeholder="효과 설명"
                        aria-label={`${index + 1}번 효과 설명`}
                        onChange={(event) =>
                          updateRecord(selected.id, (record) => ({
                            ...record,
                            effects: record.effects.map((item, effectIndex) =>
                              effectIndex === index ? { ...item, label: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        aria-label={`${index + 1}번 효과 삭제`}
                        onClick={() =>
                          updateRecord(selected.id, (record) => ({
                            ...record,
                            effects: record.effects.filter(
                              (_, effectIndex) => effectIndex !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 />
                      </button>
                      <div className="damage-option-skill-targets">
                        <MultiTargetButtons
                          label="적용 스킬 · 복수 선택"
                          options={skillOptions}
                          values={
                            effect.skillNames?.length
                              ? effect.skillNames
                              : effect.skillName
                                ? [effect.skillName]
                                : []
                          }
                          emptyLabel="전체 / 출처 자동"
                          onChange={(skillNames) =>
                            updateRecord(selected.id, (record) => ({
                              ...record,
                              effects: record.effects.map((item, effectIndex) =>
                                effectIndex === index
                                  ? { ...item, skillName: '', skillNames }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <MultiTargetButtons
                          label="스킬 분류 · 복수 선택"
                          options={skillCategoryOptions}
                          values={effect.skillCategories || []}
                          emptyLabel="분류 제한 없음"
                          optionLabel={damageOptionSkillCategoryLabel}
                          onChange={(skillCategories) =>
                            updateRecord(selected.id, (record) => ({
                              ...record,
                              effects: record.effects.map((item, effectIndex) =>
                                effectIndex === index
                                  ? { ...item, skillCategories }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="damage-option-stack-setting">
                        <label>
                          <span>적용 횟수</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={
                              effect.stackCount ??
                              (effect.stack?.enabled ? '' : 1)
                            }
                            placeholder={effect.stack?.enabled ? '횟수 입력 필요' : '1'}
                            onChange={(event) =>
                              updateRecord(selected.id, (record) => ({
                                ...record,
                                effects: record.effects.map((item, effectIndex) =>
                                  effectIndex === index
                                    ? {
                                        ...item,
                                        stackCount:
                                          event.target.value === ''
                                            ? undefined
                                            : Math.max(
                                                1,
                                                Math.floor(Number(event.target.value) || 1),
                                              ),
                                        stack:
                                          event.target.value === '' ? item.stack : null,
                                      }
                                    : item,
                                ),
                              }))
                            }
                          />
                        </label>
                        <small>
                          {effect.stack?.enabled && effect.stackCount == null
                            ? '기존 중첩 설정입니다. 적용할 고정 횟수를 입력해 주세요.'
                            : `계산: {${effect.valueKey || 'n'}} × ${
                                effect.stackCount ?? 1
                              }회`}
                        </small>
                      </div>
                    </article>
                  )
                })}
                {!selected.ignored && !selected.effects.length && (
                  <p>아직 분류되지 않은 원문입니다.</p>
                )}
              </div>
              {managementView === 'saved' && (
                <div className="damage-option-coefficient">
                  <div className="damage-option-coefficient-heading">
                    <b>전투특성 계수 자동 추적</b>
                    <small>
                      이 원문 템플릿이 있는 캐릭터가(직업 무관) 저장될 때마다 서버가 알아서
                      (전투특성 값, 표시된 %) 데이터를 쌓아 계수 구간을 좁힙니다. API가 소수점
                      2자리까지만 잘라서(버림) 보여주기 때문에, 데이터가 쌓일수록 구간이
                      좁아집니다.
                    </small>
                  </div>
                  {selected.coefficientStatType ? (
                    <>
                      <div className="damage-option-coefficient-tracking-heading">
                        <b>자동 추적 중 · {selected.coefficientStatType}</b>
                        <button
                          type="button"
                          onClick={() => refreshTrackedCoefficient(selected.id)}
                          disabled={trackedCoefficientLoading}
                        >
                          <RefreshCw className={trackedCoefficientLoading ? 'spin' : ''} />
                          새로고침
                        </button>
                      </div>
                      {trackedCoefficientLoading && !trackedCoefficient ? (
                        <p className="damage-option-coefficient-empty">불러오는 중...</p>
                      ) : !trackedCoefficient || trackedCoefficient.sampleCount === 0 ? (
                        <p className="damage-option-coefficient-empty">
                          아직 데이터가 없습니다 — 캐릭터가 갱신되면서 채워집니다.
                        </p>
                      ) : trackedCoefficient.contradictory ? (
                        <p className="damage-option-coefficient-empty error">
                          누적된 데이터끼리 구간이 겹치지 않습니다 — 전투특성 선택이 맞는지
                          확인해보세요.
                        </p>
                      ) : (
                        <div className="damage-option-coefficient-result">
                          <span>
                            {trackedCoefficient.sampleCount}건 누적 · 마지막 갱신{' '}
                            {new Date(trackedCoefficient.updatedAt).toLocaleString('ko-KR')}
                          </span>
                          <code>
                            {trackedCoefficient.low.toPrecision(10)} ~{' '}
                            {trackedCoefficient.high.toPrecision(10)}
                          </code>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="damage-option-coefficient-controls">
                        <label>
                          <span>전투특성</span>
                          <select
                            value={coefficientStatType}
                            onChange={(event) => setCoefficientStatType(event.target.value)}
                          >
                            <option value="">선택</option>
                            {availableStatTypes.map((type) => (
                              <option value={type} key={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          {detectedStatType && detectedStatType === coefficientStatType && (
                            <small>원문 출처에서 자동 감지됨</small>
                          )}
                        </label>
                        {coefficientTemplateKeys.length > 1 && (
                          <label>
                            <span>변수</span>
                            <select
                              value={coefficientKey}
                              onChange={(event) => setCoefficientKey(event.target.value)}
                            >
                              {coefficientTemplateKeys.map((key) => (
                                <option value={key} key={key}>
                                  {`{${key}}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                      <button
                        type="button"
                        className="damage-option-tracking-start"
                        disabled={!coefficientStatType || trackingState === 'saving'}
                        onClick={startTrackingCoefficient}
                      >
                        {trackingState === 'saving'
                          ? '추적 시작 중'
                          : '추적 시작 (전체 캐릭터 자동 반영)'}
                      </button>
                      {trackingMessage && (
                        <p
                          className={`damage-option-coefficient-empty${
                            trackingState === 'error' ? ' error' : ''
                          }`}
                        >
                          {trackingMessage}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="damage-option-empty">왼쪽에서 원문을 선택하세요.</p>
          )}
        </section>
      </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
