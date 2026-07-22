import { BookOpen, CircleGauge, ShieldAlert, Sparkles, Swords, Target } from 'lucide-react'
import { cleanApiText } from '../lib/text'

const gradeClass = (grade) =>
  ({
    고대: 'ancient',
    유물: 'relic',
    전설: 'legendary',
    영웅: 'epic',
    희귀: 'rare',
    고급: 'uncommon',
    일반: 'common',
  })[grade] || 'normal'

function plainTooltip(tooltip = '') {
  return cleanApiText(tooltip)
}
function hasKeyword(skill, keyword) {
  return plainTooltip(skill.Tooltip).includes(keyword)
}

// The skill description's trailing lines (부위 파괴/공격 타입/슈퍼아머/무력화/카운터 등)
// are always <br>-separated and colored #EEA839, e.g.
// "...<BR><FONT SIZE='12'><FONT COLOR='#EEA839'>부위 파괴 : 레벨 1</FONT></FONT>".
// Splitting on <br> and keeping only EEA839-colored lines isolates them from
// the plain-colored description text that precedes them in the same box.
// Some skills also repeat the same lines inside a "다음 레벨" preview block,
// bracketed by BlinkLineStart/BlinkLineEnd further down in the tooltip — stop
// before that so the current-level attributes aren't duplicated.
function skillAttributes(skill) {
  try {
    const attrs = []
    const tooltip = JSON.parse(skill.Tooltip)
    for (const entry of Object.values(tooltip)) {
      if (!entry) continue
      if (entry.type === 'BlinkLineStart') break
      if (entry.type === 'SingleTextBox' && typeof entry.value === 'string' && /EEA839/i.test(entry.value)) {
        entry.value.split(/<br\s*\/?>/i).forEach((line) => {
          if (!/EEA839/i.test(line)) return
          const match = cleanApiText(line).match(/^(.+?)\s*:\s*(.+)$/)
          if (match) attrs.push({ label: match[1].trim(), value: match[2].trim() })
        })
      }
    }
    return attrs
  } catch {
    return []
  }
}

// A selected tripod's own `Tooltip` is just a plain HTML fragment (no
// NameTagBox/type wrapper, unlike items/runes/skills), so it can't go through
// parseTooltip as-is. Wrapping it in the same {Element_000:{type,value}} shape
// ItemTooltip already parses lets it reuse that renderer without any changes.
function tripodTooltipItem(tripod) {
  return {
    Tooltip: JSON.stringify({
      Element_000: { type: 'NameTagBox', value: tripod.Name },
      Element_001: { type: 'SingleTextBox', value: tripod.Tooltip },
    }),
  }
}

function engravingSummary(armory) {
  const effects = armory.ArmoryEngraving?.ArkPassiveEffects || armory.ArmoryEngraving?.Effects || []
  const names = effects
    .map((effect) =>
      String(effect.Name || '')
        .replace(/\s*Lv\.?\s*\d+.*/i, '')
        .trim(),
    )
    .filter(Boolean)
  return { short: names.map((name) => name[0]).join(''), full: names.join(' · ') }
}

function enlightenmentBuild(armory) {
  const effects = armory.ArkPassive?.Effects || []
  const enlightenment = effects.find((effect) => String(effect.Name || '').includes('깨달음'))
  if (!enlightenment) return '깨달음 미활성'
  const text = plainTooltip(enlightenment.Description || '')
    .replace(/\s+/g, ' ')
    .trim()
  const levelName = text.match(/([가-힣][가-힣\s]{1,20}?)\s*Lv\.?\s*\d+/i)?.[1]?.trim()
  if (levelName) return levelName
  return enlightenment.Name === '깨달음' ? '깨달음 활성' : enlightenment.Name
}

export default function SkillOverview({ profile, skills, armory, onHover }) {
  const stats = Object.fromEntries((profile.Stats || []).map((item) => [item.Type, item.Value]))
  const engraving = engravingSummary(armory)
  const buildName = enlightenmentBuild(armory)
  const counters = skills.filter((skill) => hasKeyword(skill, '카운터'))
  const staggers = skills.filter((skill) => hasKeyword(skill, '무력화'))
  const destructions = skills.filter((skill) => hasKeyword(skill, '부위 파괴'))
  const passive = armory.ArkPassive || {}

  return (
    <div className="skill-dashboard">
      <div className="skill-summary-row">
        <section className="skill-summary">
          <div>
            <Swords />
            <span>
              특화 <strong>{stats['특화'] || 0}</strong> · 치명{' '}
              <strong>{stats['치명'] || 0}</strong>
            </span>
          </div>
          <div title={engraving.full}>
            <BookOpen />
            <span>{engraving.short || '각인 없음'}</span>
          </div>
          <div>
            <Sparkles />
            <span>{buildName}</span>
          </div>
        </section>
        <section className="skill-point">
          <span>스킬 포인트</span>
          <strong>{profile.UsingSkillPoint || 0}</strong>
          <small>/ {profile.TotalSkillPoint || 0}</small>
          <i
            style={{
              '--point': `${Math.min(100, ((profile.UsingSkillPoint || 0) / (profile.TotalSkillPoint || 1)) * 100)}%`,
            }}
          />
        </section>
      </div>
      <section className="skill-counts">
        <div>
          <Target />
          <span>카운터</span>
          <strong>{counters.length}개</strong>
        </div>
        <div>
          <ShieldAlert />
          <span>무력화</span>
          <strong>{staggers.length}개</strong>
        </div>
        <div>
          <CircleGauge />
          <span>부위 파괴</span>
          <strong>{destructions.length}개</strong>
        </div>
      </section>
      <div className="skill-table-row">
        <section className="skill-table">
          <header>
            <span>스킬</span>
            <span>트라이포드</span>
            <span>룬</span>
          </header>
          {skills.map((skill) => (
            <SkillRow skill={skill} onHover={onHover} key={skill.Name} />
          ))}
        </section>
        <ArkPassive passive={passive} onHover={onHover} />
      </div>
    </div>
  )
}

function ArkPassive({ passive, onHover }) {
  const groups = [
    ['진화', 'evolution'],
    ['깨달음', 'enlightenment'],
    ['도약', 'leap'],
  ]
  return (
    <section className="battle-panel passive-board">
      <div className="battle-heading">
        <div>
          <Sparkles />
          <h2>아크 패시브</h2>
        </div>
        <span>{passive.IsArkPassive ? '활성화' : '비활성화'}</span>
      </div>
      <div className="passive-columns">
        {groups.map(([name, className]) => {
          const effects = (passive.Effects || []).filter((effect) => effect.Name?.includes(name))
          return (
            <article className={className} key={name}>
              {effects.length ? (
                effects.map((effect, index) => (
                  <PassiveNode
                    effect={effect}
                    groupName={name}
                    onHover={onHover}
                    key={`${effect.Description}-${index}`}
                  />
                ))
              ) : (
                <p>활성화된 효과가 없습니다.</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PassiveNode({ effect, groupName, onHover }) {
  const text = cleanApiText(effect.Description).replace(new RegExp(`^${groupName}\\s*`), '')
  const match = text.match(/(\d+티어)\s+(.+?)\s+(Lv\.\d+)$/)
  const tier = match?.[1] || ''
  const name = match?.[2] || text
  const level = match?.[3] || ''
  return (
    <div
      className="passive-node"
      onMouseEnter={(e) => {
        if (!effect.ToolTip) return
        const rect = e.currentTarget.getBoundingClientRect()
        onHover?.({ item: { Tooltip: effect.ToolTip }, left: rect.left, right: rect.right, top: rect.top })
      }}
      onMouseLeave={() => onHover?.(null)}
    >
      {effect.Icon ? <img src={effect.Icon} alt="" /> : <Sparkles />}
      <span>
        <i>{tier}</i>
        <strong>
          {name} {level}
        </strong>
      </span>
    </div>
  )
}

function SkillRow({ skill, onHover }) {
  const tripods = (skill.Tripods || []).filter((item) => item.IsSelected)
  const attrs = skillAttributes(skill)
  return (
    <article className="skill-row">
      <div className="skill-main">
        <div
          className="skill-main-icon"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            onHover?.({ item: skill, left: rect.left, right: rect.right, top: rect.top })
          }}
          onMouseLeave={() => onHover?.(null)}
        >
          <img src={skill.Icon} alt="" />
        </div>
        <div>
          <div className="skill-name-line">
            <strong>{skill.Name}</strong>
            <span>Lv.{skill.Level}</span>
          </div>
          {attrs.length > 0 && (
            <div className="skill-attrs">
              {attrs.map((attr) => (
                <span key={attr.label}>
                  <i>{attr.label}</i>
                  {attr.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tripod-list">
        {[0, 1, 2].map((index) => {
          const tripod = tripods[index]
          return (
            <div className={!tripod ? 'empty' : ''} key={index}>
              {tripod ? (
                <>
                  <div
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      onHover?.({ item: tripodTooltipItem(tripod), left: rect.left, right: rect.right, top: rect.top })
                    }}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    <img src={tripod.Icon} alt="" />
                  </div>
                  <span>{tripod.Name}</span>
                </>
              ) : (
                <>
                  <i />
                  <span>선택 없음</span>
                </>
              )}
            </div>
          )
        })}
      </div>
      <div className={`skill-rune ${skill.Rune ? gradeClass(skill.Rune.Grade) : 'normal'}`}>
        {skill.Rune ? (
          <>
            <div
              className="rune-grade-icon"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                onHover?.({ item: skill.Rune, left: rect.left, right: rect.right, top: rect.top })
              }}
              onMouseLeave={() => onHover?.(null)}
            >
              <img src={skill.Rune.Icon} alt="" />
            </div>
            <strong>{skill.Rune.Name}</strong>
            <span>{skill.Rune.Grade}</span>
          </>
        ) : (
          <>
            <i />
            <strong>룬 없음</strong>
          </>
        )}
      </div>
    </article>
  )
}
