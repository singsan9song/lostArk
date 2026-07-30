import { readFile, writeFile } from 'node:fs/promises'

const sourceUrl = new URL('../src/data/lostark_inven_skills.json', import.meta.url)
const outputUrl = new URL('../src/data/lostark_inven_skill_constants.json', import.meta.url)
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
  outputUrl,
  `${JSON.stringify({
    source: 'lostark_inven_skills.json',
    schema_note: '직업명 → 스킬명 → 레벨 → 타수별 모션 상수',
    jobs,
  })}\n`,
  'utf8',
)
