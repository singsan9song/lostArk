import { BookOpen, CircleGauge, ShieldAlert, Sparkles, Swords, Target } from 'lucide-react'
import { cleanApiText } from '../lib/text'

const gradeClass = grade => ({ 고대: 'ancient', 유물: 'relic', 전설: 'legendary', 영웅: 'epic', 희귀: 'rare', 고급: 'uncommon', 일반: 'common' }[grade] || 'normal')

function plainTooltip(tooltip = '') { return cleanApiText(tooltip) }
function hasKeyword(skill, keyword) { return plainTooltip(skill.Tooltip).includes(keyword) }
function cooldown(skill) { return plainTooltip(skill.Tooltip).match(/재사용 대기시간\s*(\d+(?:\.\d+)?)초/)?.[1] }

function engravingSummary(armory) {
  const effects = armory.ArmoryEngraving?.ArkPassiveEffects || armory.ArmoryEngraving?.Effects || []
  const names = effects.map(effect => String(effect.Name || '').replace(/\s*Lv\.?\s*\d+.*/i, '').trim()).filter(Boolean)
  return { short: names.map(name => name[0]).join(''), full: names.join(' · ') }
}

function enlightenmentBuild(armory) {
  const effects = armory.ArkPassive?.Effects || []
  const enlightenment = effects.find(effect => String(effect.Name || '').includes('깨달음'))
  if (!enlightenment) return '깨달음 미활성'
  const text = plainTooltip(enlightenment.Description || '').replace(/\s+/g, ' ').trim()
  const levelName = text.match(/([가-힣][가-힣\s]{1,20}?)\s*Lv\.?\s*\d+/i)?.[1]?.trim()
  if (levelName) return levelName
  return enlightenment.Name === '깨달음' ? '깨달음 활성' : enlightenment.Name
}

export default function SkillOverview({ profile, skills, armory }) {
  const stats = Object.fromEntries((profile.Stats || []).map(item => [item.Type, item.Value]))
  const engraving = engravingSummary(armory)
  const buildName = enlightenmentBuild(armory)
  const counters = skills.filter(skill => hasKeyword(skill, '카운터'))
  const staggers = skills.filter(skill => hasKeyword(skill, '무력화'))
  const destructions = skills.filter(skill => hasKeyword(skill, '부위 파괴'))

  return <div className="skill-dashboard">
    <div className="skill-summary-row">
      <section className="skill-summary"><div><Swords /><span>특화 <strong>{stats['특화'] || 0}</strong> · 치명 <strong>{stats['치명'] || 0}</strong></span></div><div title={engraving.full}><BookOpen /><span>{engraving.short || '각인 없음'}</span></div><div><Sparkles /><span>{buildName}</span></div></section>
      <section className="skill-point"><span>스킬 포인트</span><strong>{profile.UsingSkillPoint || 0}</strong><small>/ {profile.TotalSkillPoint || 0}</small><i style={{'--point':`${Math.min(100, ((profile.UsingSkillPoint || 0) / (profile.TotalSkillPoint || 1)) * 100)}%`}} /></section>
    </div>
    <section className="skill-counts"><div><Target /><span>카운터</span><strong>{counters.length}개</strong></div><div><ShieldAlert /><span>무력화</span><strong>{staggers.length}개</strong></div><div><CircleGauge /><span>부위 파괴</span><strong>{destructions.length}개</strong></div></section>
    <section className="skill-table"><header><span>스킬</span><span>트라이포드</span><span>룬</span></header>{skills.map(skill => <SkillRow skill={skill} key={skill.Name} />)}</section>
  </div>
}

function SkillRow({ skill }) {
  const tripods = (skill.Tripods || []).filter(item => item.IsSelected)
  const cd = cooldown(skill)
  return <article className="skill-row">
    <div className="skill-main"><div className="skill-main-icon"><img src={skill.Icon} alt="" /><b>{skill.Level}</b></div><div><span>{skill.Level}레벨</span><strong>{skill.Name}</strong><small>{skill.SkillType || '일반'}{cd ? ` · ${cd}초` : ''}</small></div></div>
    <div className="tripod-list">{[0,1,2].map(index => { const tripod = tripods[index]; return <div className={!tripod ? 'empty' : ''} key={index}>{tripod ? <><div><img src={tripod.Icon} alt="" /><b>{tripod.Level}</b></div><span>{tripod.Name}</span></> : <><i /><span>선택 없음</span></>}</div> })}</div>
    <div className={`skill-rune ${skill.Rune ? gradeClass(skill.Rune.Grade) : 'normal'}`}>{skill.Rune ? <><div className="rune-grade-icon"><img src={skill.Rune.Icon} alt="" /></div><strong>{skill.Rune.Name}</strong><span>{skill.Rune.Grade}</span></> : <><i /><strong>룬 없음</strong></>}</div>
  </article>
}
