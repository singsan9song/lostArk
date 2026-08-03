import { readFile, writeFile } from 'node:fs/promises'

const sourceUrl = new URL('../src/data/new_lostark_inven_skills.json', import.meta.url)
const constantsOutputUrl = new URL('../src/data/lostark_inven_skill_constants.json', import.meta.url)
const catalogOutputUrl = new URL('../src/data/lostark_inven_skill_catalog.json', import.meta.url)
const source = JSON.parse(await readFile(sourceUrl, 'utf8'))

const jobs = Object.fromEntries(
  (source.jobs || []).map((job) => [
    job.job_name,
    Object.fromEntries(
      (job.skills || []).map((skill) => [
        skill.skill_name,
        Object.fromEntries(
          (skill.levels || []).map((level) => [
            String(level.level),
            Object.entries(level.damage_hits || {})
              .sort(([left], [right]) => {
                const leftOrder = Number(left.match(/\d+/)?.[0]) || 0
                const rightOrder = Number(right.match(/\d+/)?.[0]) || 0
                return leftOrder - rightOrder
              })
              .map(([, damage]) => Number(damage.value_int)),
          ]),
        ),
      ]),
    ),
  ]),
)

await writeFile(
  constantsOutputUrl,
  `${JSON.stringify({
    source: 'new_lostark_inven_skills.json',
    schema_note: '직업명 → 스킬명 → 레벨 → 타수별 모션 상수',
    jobs,
  })}\n`,
  'utf8',
)

// Compact per-job skill catalog (highest level only) used to offer skills that never show up
// in the Lost Ark Open API's ArmorySkills for damage-analysis purposes. Keeps only the fields
// needed to synthesize a skill-shaped Tooltip - the full source file is ~11MB and must never be
// shipped to the browser directly.
const catalogJobs = Object.fromEntries(
  (source.jobs || []).map((job) => [
    job.job_name,
    (job.skills || []).flatMap((skill) => {
      const levels = skill.levels || []
      const highestLevel = levels.reduce(
        (best, level) => (best == null || Number(level.level) > Number(best.level) ? level : best),
        null,
      )
      if (!highestLevel) return []
      return [
        {
          skillName: skill.skill_name,
          level: Number(highestLevel.level),
          description: highestLevel.description || '',
          cooldownText: skill.cooldown_text || '',
          resource: highestLevel.resource || '',
          additionalEffects: skill.additional_effects || [],
          skillBookType: skill.skill_book_type || '',
          skillIdentifier: skill.skill_identifier || '',
        },
      ]
    }),
  ]),
)

await writeFile(
  catalogOutputUrl,
  `${JSON.stringify({
    source: 'new_lostark_inven_skills.json',
    schema_note: '직업명 → 스킬(최고 레벨 기준) 목록 - API에 없는 스킬을 데미지 분석에서 선택 가능하게 하는 용도',
    jobs: catalogJobs,
  })}\n`,
  'utf8',
)
