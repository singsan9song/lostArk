import { Activity, BookOpen, Gem, Layers3, Shield, Sparkles, Swords } from 'lucide-react'
import { cleanApiText } from '../lib/text'
import { getEngravingIcon } from '../lib/engravingIcons'

const gradeClass = grade => ({ 고대: 'ancient', 유물: 'relic', 전설: 'legendary', 영웅: 'epic', 희귀: 'rare', 고급: 'uncommon', 일반: 'common' }[grade] || 'normal')
const accessoryTypes = ['목걸이', '귀걸이', '반지']
const leftEquipmentTypes = ['무기', '투구', '상의', '하의', '장갑', '어깨', '보주']
const rightEquipmentTypes = ['목걸이', '귀걸이', '반지', '어빌리티 스톤', '팔찌']
const honingTypes = ['무기', '투구', '상의', '하의', '장갑', '어깨']

function equipmentByOrder(equipment, types) {
  return equipment
    .filter(item => types.includes(item.Type))
    .sort((a, b) => types.indexOf(a.Type) - types.indexOf(b.Type))
}

function tooltipData(item) {
  const raw = item?.Tooltip || ''
  const qualityValue = Number(raw.match(/"qualityValue"\s*:\s*(-?\d+)/i)?.[1])
  const quality = Number.isFinite(qualityValue) && qualityValue >= 0 ? qualityValue : null
  const text = tooltipText(raw)
  const level = text.match(/아이템 레벨\s*(\d{3,4})/i)?.[1]
  const advancedHoning = text.match(/\[상급 재련\]\s*(\d+)단계/)?.[1]
  const enlightenment = text.match(/깨달음\s*\+(\d+)/)?.[1]
  const stoneEngravings = [...text.matchAll(/\[([^\]]+)\]\s*Lv\.(\d+)/g)].map(([, name, value]) => ({ name, level: Number(value), harmful: name.includes('감소') }))
  const stoneLevel = stoneEngravings.filter(item => !item.harmful).reduce((sum, item) => sum + item.level, 0)
  const braceletStats = [...text.matchAll(/(체력|치명|특화|신속|제압|인내|숙련|힘|민첩|지능)\s*\+([\d,]+)/g)]
    .map(([, name, value]) => `${name} +${value}`)
  const orbName = text.match(/특수 효과\s*\[([^\]]+)\]/)?.[1]
  const orbDamage = text.match(/([\d,]+)의 고정 피해/)?.[1]
  const paradisePowerValue = text.match(/시즌3 달성 최대 낙원력\s*:\s*([\d,]+)/)?.[1]
  const paradisePower = paradisePowerValue ? Number(paradisePowerValue.replaceAll(',', '')).toLocaleString('ko-KR') : null
  const accessoryEffects = parseAccessoryEffects(tooltipPart(raw, '연마 효과'))
  return { quality, level, advancedHoning, enlightenment, stoneLevel, stoneEngravings, braceletStats, orbName, orbDamage, paradisePower, accessoryEffects }
}

function tooltipText(raw = '') {
  try {
    const strings = []
    const walk = value => {
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

function tooltipPart(raw, heading) {
  try {
    let result = ''
    const walk = value => {
      if (!value || typeof value !== 'object' || result) return
      if (cleanApiText(value.Element_000 || '') === heading && typeof value.Element_001 === 'string') {
        result = value.Element_001
        return
      }
      Object.values(value).forEach(walk)
    }
    walk(JSON.parse(raw))
    return result
  } catch {
    return ''
  }
}

function parseAccessoryEffects(raw = '') {
  const plain = cleanApiText(raw)
  return [...plain.matchAll(/([가-힣\s]+?)\s*(\+[\d,]+(?:\.\d+)?%?)/g)].map((match, index) => {
    const name = match[1].trim()
    const value = match[2]
    const rawIndex = raw.indexOf(name)
    const color = raw.slice(Math.max(0, rawIndex), rawIndex + name.length + 150).match(/COLOR=['"]?#?([A-F0-9]{6})/i)?.[1]?.toUpperCase()
    const tier = color === 'FFD200' ? 'high' : color === 'CE43FC' ? 'middle' : 'low'
    return { name, value, tier, key: `${name}-${index}` }
  }).slice(0, 3)
}

export default function BattleOverview({ armory, profile, stats }) {
  const equipment = (armory.ArmoryEquipment || []).filter(item => !['나침반', '부적'].includes(item.Type))
  const knownTypes = new Set([...leftEquipmentTypes, ...rightEquipmentTypes])
  const leftEquipment = [...equipmentByOrder(equipment, leftEquipmentTypes), ...equipment.filter(item => !knownTypes.has(item.Type))]
  const rightEquipment = equipmentByOrder(equipment, rightEquipmentTypes)
  const gems = armory.ArmoryGem?.Gems || []
  const gemEffects = armory.ArmoryGem?.Effects?.Skills || []
  const orderedGems = orderGems(gems, gemEffects)
  const engravings = armory.ArmoryEngraving?.ArkPassiveEffects || armory.ArmoryEngraving?.Effects || []
  const cards = armory.ArmoryCard?.Cards || []
  const cardEffects = armory.ArmoryCard?.Effects || []
  const passive = armory.ArkPassive || {}

  return <div className="battle-dashboard">
    <div className="battle-two-column battle-primary-row">
      <section className="battle-panel stat-board"><div className="battle-heading"><div><Activity /><h2>기본 및 전투 특성</h2></div></div><div className="basic-stats"><div><span>공격력</span><strong>{stats['공격력'] || '-'}</strong></div><div><span>최대 생명력</span><strong>{stats['최대 생명력'] || '-'}</strong></div></div><div className="combat-stats">{['치명','특화','신속','제압','인내','숙련'].map(name => <div key={name}><span>{name}</span><strong>{stats[name] || 0}</strong></div>)}</div></section>
      <section className="battle-panel card-board"><div className="battle-heading"><div><BookOpen /><h2>카드</h2></div><span>{cardEffects.at(-1)?.Items?.at(-1)?.Name || `${cards.length}장 장착`}</span></div>{cards.length ? <div className="battle-cards">{cards.map((card, index) => <article key={index}><div><img src={card.Icon} alt="" /><i>{card.AwakeCount || 0}</i></div><strong>{card.Name}</strong><span>각성 {card.AwakeCount || 0}/{card.AwakeTotal || 0}</span></article>)}</div> : <Empty icon={BookOpen} text="장착된 카드가 없습니다." />}</section>
    </div>

    <div className="battle-two-column battle-loadout-row">
      <section className="battle-panel equipment-board">
        <div className="battle-heading"><div><Shield /><h2>장비</h2></div><span>아이템 레벨 {profile.ItemAvgLevel}</span></div>
        <div className="equipment-columns"><div>{leftEquipment.map((item, index) => <EquipmentRow item={item} key={`${item.Type}-${index}`} />)}</div><div>{rightEquipment.map((item, index) => <EquipmentRow item={item} accessory={accessoryTypes.includes(item.Type)} key={`${item.Type}-${index}`} />)}</div></div>
      </section>

      <section className="battle-panel gem-board">
        <div className="battle-heading"><div><Gem /><h2>보석</h2></div><span>{gems.length}개 장착</span></div>
        {gems.length ? <div className="battle-gems">{orderedGems.map(({ gem, effect }, index) => <GemRow gem={gem} effect={effect} key={gem.Slot ?? index} />)}</div> : <Empty icon={Gem} text="장착된 보석이 없습니다." />}
      </section>
    </div>

    <div className="battle-two-column battle-build-row">
      <ArkPassive passive={passive} />
      <section className="battle-panel engraving-board"><div className="battle-heading"><div><Layers3 /><h2>각인</h2></div><span>{engravings.length}개 적용</span></div>{engravings.length ? <div className="battle-engravings">{engravings.map((item, index) => <EngravingRow item={item} index={index} key={item.Name || index} />)}</div> : <Empty icon={Layers3} text="각인 정보가 없습니다." />}</section>
    </div>
  </div>
}

function EquipmentRow({ item }) {
  const details = tooltipData(item)
  if (accessoryTypes.includes(item.Type)) return <AccessoryRow item={item} details={details} />
  if (honingTypes.includes(item.Type)) return <HoningRow item={item} details={details} />
  if (item.Type === '어빌리티 스톤') return <StoneRow item={item} details={details} />
  if (item.Type === '보주') return <OrbRow item={item} details={details} />
  const meta = equipmentMeta(item, details)
  return <article className={`battle-equipment ${gradeClass(item.Grade)}`} title={meta}>
    <div className="equipment-icon"><img src={item.Icon} alt="" /><em>{item.Grade?.[0]}</em></div>
    <div className="equipment-copy">
      <strong>{item.Name}</strong>
      <span>{meta}</span>
    </div>
  </article>
}

function HoningRow({ item, details }) {
  const enhancement = item.Name?.match(/^\+(\d+)/)?.[1]
  const itemName = item.Name?.replace(/^\+\d+\s*/, '')
  return <article className={`battle-equipment honing-row ${gradeClass(item.Grade)}`}>
    <div className="equipment-icon"><img src={item.Icon} alt="" /><em>{item.Grade?.[0]}</em></div>
    <div className="equipment-copy">
      <strong><em className="honing-level">{enhancement ? `+${enhancement}` : ''}{details.advancedHoning ? ` ×${details.advancedHoning}` : ''}</em>{itemName}</strong>
      <div className="equipment-badges"><b className={`quality q-${Math.floor(Number(details.quality || 0) / 10)}`}>{details.quality ?? '-'}</b><span>{details.level || '-'}</span></div>
    </div>
  </article>
}

function AccessoryRow({ item, details }) {
  return <article className={`battle-equipment accessory-row ${gradeClass(item.Grade)}`}>
    <div className="equipment-icon"><img src={item.Icon} alt="" /><em>{item.Grade?.[0]}</em></div>
    <div className="equipment-copy accessory-copy">
      <strong title={item.Name}>{item.Name}</strong>
      <div className="accessory-meta"><b className={`quality q-${Math.floor(Number(details.quality || 0) / 10)}`}>{details.quality ?? '-'}</b><span>깨달음 +{details.enlightenment ?? 0}</span></div>
    </div>
    <div className="accessory-effect-list">{details.accessoryEffects.length ? details.accessoryEffects.map(effect => <div key={effect.key}><i className={effect.tier}>{effect.tier === 'high' ? '상' : effect.tier === 'middle' ? '중' : '하'}</i><span>{effect.name}</span><b>{effect.value}</b></div>) : <small>연마 효과 없음</small>}</div>
  </article>
}

function StoneRow({ item, details }) {
  return <article className={`battle-equipment stone-row ${gradeClass(item.Grade)}`}>
    <div className="equipment-icon"><img src={item.Icon} alt="" /><em>{item.Grade?.[0]}</em></div>
    <div className="equipment-copy"><strong>{item.Name}</strong><div className="stone-total">Lv.{details.stoneLevel}</div></div>
    <div className="stone-effect-list">{details.stoneEngravings.map(effect => <div className={effect.harmful ? 'harmful' : ''} key={effect.name}><i>{effect.level}</i><span>{effect.name}</span></div>)}</div>
  </article>
}

function OrbRow({ item, details }) {
  return <article className={`battle-equipment orb-row ${gradeClass(item.Grade)}`} title={item.Name}>
    <div className="equipment-icon"><img src={item.Icon} alt="" /><em>{item.Grade?.[0]}</em></div>
    <div className="equipment-copy"><strong>{details.orbName || item.Name}</strong><span>{details.paradisePower ? `달성 낙원력 ${details.paradisePower}` : details.orbDamage ? `고정 피해 ${details.orbDamage}` : '특수 효과 정보 없음'}</span></div>
  </article>
}

function equipmentMeta(item, details) {
  if (honingTypes.includes(item.Type)) return [`품질 ${details.quality ?? '-'}`, details.level && `장비 Lv.${details.level}`].filter(Boolean).join(' · ')
  if (accessoryTypes.includes(item.Type)) return [`품질 ${details.quality ?? '-'}`, details.enlightenment && `깨달음 +${details.enlightenment}`].filter(Boolean).join(' · ')
  if (item.Type === '어빌리티 스톤') return `스톤 합레벨 Lv.${details.stoneLevel}`
  if (item.Type === '팔찌') return details.braceletStats.join(' · ') || '팔찌 효과 정보 없음'
  if (item.Type === '보주') return [details.orbName, details.orbDamage && `고정 피해 ${details.orbDamage}`].filter(Boolean).join(' · ') || '특수 효과 정보 없음'
  return item.Grade || ''
}

function EngravingRow({ item, index }) {
  const baseLevel = Number(item.Level ?? 0)
  const stoneLevel = Number(item.AbilityStoneLevel ?? 0)
  const icon = getEngravingIcon(item.Name, item.Icon)
  return <div className="engraving-row" title={cleanApiText(item.Description)}>
    <div className={`engraving-symbol symbol-${index % 5}`}>{icon ? <img src={icon} alt={`${item.Name} 각인`} /> : <span>{item.Name?.[0] || '?'}</span>}</div>
    <i className="engraving-level-mark" aria-hidden="true" />
    <span className="engraving-base" aria-label={`기본 각인 레벨 ${baseLevel}`}>× {baseLevel}</span>
    <strong>{item.Name}</strong>
    {stoneLevel > 0 && <><i className="ability-stone-mark" aria-hidden="true" /><span className="ability-stone-level" aria-label={`어빌리티 스톤 추가 레벨 ${stoneLevel}`}>Lv.{stoneLevel}</span></>}
  </div>
}

function GemRow({ gem, effect }) {
  const { description, isCooldown, amount } = gemEffectDetails(effect)
  const typeLabel = isCooldown ? '쿨타임 감소' : '피해 증가'
  const amountLabel = amount ? `${isCooldown ? '-' : '+'}${amount}` : ''

  return <div className={`gem-entry ${gradeClass(gem.Grade)}`} title={description || cleanApiText(gem.Name)}>
    <div className="gem-grade-icon"><span className="gem-image-clip"><img src={gem.Icon} alt="" /></span><b>{gem.Level}</b></div>
    <div className="gem-link-copy">
      <div className="gem-skill-line">{effect?.Icon && <img src={effect.Icon} alt="" />}<strong>{effect?.Name || '연계 스킬 없음'}</strong></div>
      <span className={`gem-effect-badge ${isCooldown ? 'cooldown' : 'damage'}`}>{typeLabel}{amountLabel && <em>{amountLabel}</em>}</span>
    </div>
  </div>
}

function gemEffectDetails(effect) {
  const description = cleanApiText(Array.isArray(effect?.Description) ? effect.Description.join(' ') : effect?.Description || '')
  return {
    description,
    isCooldown: /재사용\s*대기시간/.test(description),
    amount: description.match(/\d+(?:\.\d+)?%/)?.[0],
  }
}

function orderGems(gems, effects) {
  const entries = gems.map(gem => {
    const effect = effects.find(item => Number(item.GemSlot) === Number(gem.Slot))
    return { gem, effect, name: effect?.Name || '', ...gemEffectDetails(effect) }
  })
  const groups = new Map()
  entries.forEach(entry => groups.set(entry.name, [...(groups.get(entry.name) || []), entry]))
  const paired = []
  const unpaired = []

  groups.forEach(group => {
    const damage = group.filter(item => !item.isCooldown)
    const cooldown = group.filter(item => item.isCooldown)
    if (damage.length && cooldown.length) paired.push({ name: group[0].name, items: [...damage, ...cooldown] })
    else unpaired.push(...group)
  })

  paired.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  unpaired.sort((a, b) => Number(a.isCooldown) - Number(b.isCooldown) || a.name.localeCompare(b.name, 'ko'))
  return [...paired.flatMap(group => group.items), ...unpaired]
}

function ArkPassive({ passive }) {
  const groups = [['진화', 'evolution'], ['깨달음', 'enlightenment'], ['도약', 'leap']]
  return <section className="battle-panel passive-board"><div className="battle-heading"><div><Sparkles /><h2>아크 패시브</h2></div><span>{passive.IsArkPassive ? '활성화' : '비활성화'}</span></div><div className="passive-columns">{groups.map(([name, className]) => { const effects = (passive.Effects || []).filter(effect => effect.Name?.includes(name)); return <article className={className} key={name}>{effects.length ? effects.map((effect, index) => <PassiveNode effect={effect} groupName={name} key={`${effect.Description}-${index}`} />) : <p>활성화된 효과가 없습니다.</p>}</article> })}</div></section>
}

function PassiveNode({ effect, groupName }) {
  const text = cleanApiText(effect.Description).replace(new RegExp(`^${groupName}\\s*`), '')
  const match = text.match(/(\d+티어)\s+(.+?)\s+(Lv\.\d+)$/)
  const tier = match?.[1] || ''
  const name = match?.[2] || text
  const level = match?.[3] || ''
  return <div className="passive-node">{effect.Icon ? <img src={effect.Icon} alt="" /> : <Sparkles />}<span><i>{tier}</i><strong>{name} {level}</strong></span></div>
}

function Empty({ icon: Icon, text }) { return <div className="battle-empty"><Icon /><span>{text}</span></div> }
