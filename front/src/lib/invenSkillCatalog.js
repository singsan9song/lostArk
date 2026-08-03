import catalog from '../data/lostark_inven_skill_catalog.json'

// Mirrors the real Lost Ark Open API skill Tooltip element-by-element (reverse-engineered from
// an actual ArmorySkills entry: NameTagBox → CommonSkillTitle → level header → resource cost →
// description+attributes), rather than a made-up shape, so it renders through ItemTooltip.jsx
// looking like a normal skill instead of a generic text box. Anything the inven catalog doesn't
// have (icon, PvE/PvP tag, tripods) is simply left out instead of faked.
function buildSyntheticTooltip(entry) {
  const elements = {
    Element_000: { type: 'NameTagBox', value: entry.skillName },
    Element_001: {
      type: 'CommonSkillTitle',
      value: {
        name: entry.skillBookType
          ? `<FONT SIZE='12'><FONT SIZE='14' COLOR='#FFFFAC'>${entry.skillBookType}</FONT></FONT>`
          : '',
        level: entry.skillIdentifier
          ? `<FONT SIZE='12'><FONT COLOR='#B7DEE8'><FONT COLOR='#FE9A2E'>[${entry.skillIdentifier}]</FONT></FONT></FONT>`
          : '',
        middleText: '',
        leftText: entry.cooldownText ? `<FONT SIZE='12'>${entry.cooldownText}</FONT>` : '',
        slotData: { iconGrade: 0, iconPath: '', imagePath: '' },
      },
    },
  }
  let index = 2
  const push = (element) => {
    elements[`Element_${String(index).padStart(3, '0')}`] = element
    index += 1
  }

  push({ type: 'SingleTextBox', value: `스킬 레벨 ${entry.level} (최대)` })
  if (entry.resource) push({ type: 'MultiTextBox', value: `${entry.resource}|` })

  const attributeLines = (entry.additionalEffects || [])
    .map((line) => `<FONT SIZE='12'><FONT COLOR='#EEA839'>${line}</FONT></FONT>`)
    .join('<BR>')
  const descriptionValue = [
    entry.description
      ? `<FONT COLOR='#efefdf'><FONT SIZE='11'>${entry.description}</FONT></FONT>`
      : '',
    attributeLines,
  ]
    .filter(Boolean)
    .join('<BR>')
  if (descriptionValue) push({ type: 'SingleTextBox', value: descriptionValue })

  return JSON.stringify(elements)
}

// Skills the inven skill catalog has for a class but that don't appear in this character's own
// ArmorySkills (never learned, or a skill the Lost Ark Open API simply never returns). Shown at
// the catalog's highest level, since there's no real per-character level for them.
export function missingSkillsForClass(className, ownedSkills = []) {
  const entries = catalog.jobs?.[className]
  if (!entries?.length) return []
  const ownedNames = new Set(ownedSkills.map((skill) => skill.Name))
  return entries
    .filter((entry) => !ownedNames.has(entry.skillName))
    .map((entry) => ({
      Name: entry.skillName,
      Level: entry.level,
      Icon: null,
      Tooltip: buildSyntheticTooltip(entry),
      Tripods: [],
      Rune: null,
      SkillType: 0,
      synthetic: true,
    }))
}
