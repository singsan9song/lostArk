import jobData from '../data/job.json'

export function representativeEngraving(armory, className) {
  const candidates =
    jobData.classes.find((job) => job.className === className)?.engravings || []
  if (!candidates.length) return '대표 각인 미확인'

  const enlightenmentText = (armory?.ArkPassive?.Effects || [])
    .filter((effect) => String(effect?.Name || '').includes('깨달음'))
    .flatMap((effect) => [
      effect?.Name,
      effect?.Description,
      effect?.ToolTip,
      effect?.Tooltip,
    ])
    .filter(Boolean)
    .join(' ')
  const selected = candidates.find((name) => enlightenmentText.includes(name))
  if (selected) return selected

  const engravingText = [
    ...(armory?.ArmoryEngraving?.ArkPassiveEffects || []),
    ...(armory?.ArmoryEngraving?.Effects || []),
  ]
    .flatMap((effect) => [effect?.Name, effect?.Description])
    .filter(Boolean)
    .join(' ')
  return candidates.find((name) => engravingText.includes(name)) || '대표 각인 미확인'
}
