import { useState } from 'react'
import { BookOpen, Gem, Layers3, Shield, Sparkles, Swords } from 'lucide-react'
import { cleanApiText } from '../lib/text'
import { getEngravingIcon } from '../lib/engravingIcons'
import ItemTooltip from './ItemTooltip'
import SkillOverview from './SkillOverview'

const categories = [
  ['equipment', '장비', Shield],
  ['gem', '보석', Gem],
  ['skill', '스킬', Sparkles],
]

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
const accessoryTypes = ['목걸이', '귀걸이', '반지']
const leftEquipmentTypes = ['무기', '투구', '상의', '하의', '장갑', '어깨', '보주']
const rightEquipmentTypes = ['목걸이', '귀걸이', '반지', '어빌리티 스톤', '팔찌']
const honingTypes = ['무기', '투구', '상의', '하의', '장갑', '어깨']
const cardGradeOrder = ['일반', '고급', '희귀', '영웅', '전설', '고대']
const cardGradeIndex = (grade) => {
  const index = cardGradeOrder.indexOf(grade)
  return index === -1 ? cardGradeOrder.length - 1 : index
}
// img_card_grade.png sprite: each 134px-wide frame is separated by a 13px gap
// (147px pitch), with no trailing gap after the last frame — not 6 even slices.
const CARD_FRAME = { width: 134, height: 200, pitch: 147, displayWidth: 78 }
const cardFrameScale = CARD_FRAME.displayWidth / CARD_FRAME.width
const cardFrameSheetWidth = (5 * CARD_FRAME.pitch + CARD_FRAME.width) * cardFrameScale
const cardFrameSheetHeight = CARD_FRAME.height * cardFrameScale
const cardFramePositionX = (grade) => -(cardGradeIndex(grade) * CARD_FRAME.pitch * cardFrameScale)
// Matches the official card-slot[data-grade] name-text colors, in the same order as cardGradeOrder.
const cardGradeTextColor = ['#ffffff', '#91fe02', '#46a1ff', '#bf33ec', '#ffba16', '#d75414']
// img_profile_awake.png: two 120x36 rows (unlit, lit) of 5x 24px-wide pips;
// official slot places it at bottom:14px, centered, on a 134x200 card.
const CARD_AWAKE_PIP = 24 * cardFrameScale
const CARD_AWAKE_HEIGHT = 36 * cardFrameScale
const CARD_AWAKE_BOTTOM = 14 * cardFrameScale
const cardAwakeSheetSize = `${CARD_AWAKE_PIP * 5}px ${CARD_AWAKE_HEIGHT * 2}px`

function equipmentByOrder(equipment, types) {
  return equipment
    .filter((item) => types.includes(item.Type))
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
  const stoneEngravings = [...text.matchAll(/\[([^\]]+)\]\s*Lv\.(\d+)/g)].map(
    ([, name, value]) => ({ name, level: Number(value), harmful: name.includes('감소') }),
  )
  const stoneLevel = stoneEngravings
    .filter((item) => !item.harmful)
    .reduce((sum, item) => sum + item.level, 0)
  const braceletStats = [
    ...text.matchAll(/(체력|치명|특화|신속|제압|인내|숙련|힘|민첩|지능)\s*\+([\d,]+)/g),
  ].map(([, name, value]) => `${name} +${value}`)
  const orbName = text.match(/특수 효과\s*\[([^\]]+)\]/)?.[1]
  const orbDamage = text.match(/([\d,]+)의 고정 피해/)?.[1]
  const paradisePowerValue = text.match(/시즌3 달성 최대 낙원력\s*:\s*([\d,]+)/)?.[1]
  const paradisePower = paradisePowerValue
    ? Number(paradisePowerValue.replaceAll(',', '')).toLocaleString('ko-KR')
    : null
  const accessoryEffects = parseAccessoryEffects(tooltipPart(raw, '연마 효과'))
  return {
    quality,
    level,
    advancedHoning,
    enlightenment,
    stoneLevel,
    stoneEngravings,
    braceletStats,
    orbName,
    orbDamage,
    paradisePower,
    accessoryEffects,
  }
}

function tooltipText(raw = '') {
  try {
    const strings = []
    const walk = (value) => {
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
    const walk = (value) => {
      if (!value || typeof value !== 'object' || result) return
      if (
        cleanApiText(value.Element_000 || '') === heading &&
        typeof value.Element_001 === 'string'
      ) {
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
  // Each 연마 효과 line is its own <br>-separated segment, e.g.
  // "...<img .../>적에게 주는 피해 <FONT color='CE43FC'>+1.20%</FONT>". Parsing
  // line-by-line (rather than scanning the whole blob with indexOf + a fuzzy
  // lookahead) avoids misattributing color when two lines share a stat name
  // (e.g. "무기 공격력" appears both as a random roll and as the fixed line).
  return raw
    .split(/<br\s*\/?>/i)
    .map((segment, index) => {
      const match = segment.match(
        /([가-힣\s]+?)\s*<FONT\s+color=['"]?#?([A-F0-9]{6})['"]?[^>]*>\s*(\+[\d,]+(?:\.\d+)?%?)/i,
      )
      if (!match) return null
      const name = cleanApiText(match[1]).trim()
      const color = match[2].toUpperCase()
      const value = match[3]
      // FFD200/CE43FC = "high"/"middle" are confirmed by the real site's own
      // CSS class names (item_grade_high/item_grade_medium). FE9600 has no
      // such confirmed label — it's only ever seen on the 3rd (item-level-
      // scaled) line, where a higher bracket ("+390") showed FE9600 vs a lower
      // bracket ("+195") showing 00B5FF, so treating it as "high" here is an
      // inference from that one comparison — scoped to 연마 효과 only, not a
      // confirmed rule to reuse elsewhere.
      const tier =
        color === 'FFD200' || color === 'FE9600' ? 'high' : color === 'CE43FC' ? 'middle' : 'low'
      return { name, value, tier, color, key: `${name}-${index}` }
    })
    .filter(Boolean)
    .slice(0, 3)
}

export default function BattleOverview({ armory, profile, stats, skills }) {
  const [category, setCategory] = useState('equipment')
  const [hover, setHover] = useState(null)
  // Separate from `hover` (which drives the item tooltip): the gem list only
  // needs to indicate which gem a row belongs to (syncing the diagram
  // highlight), not pop up the full tooltip — that's reserved for hovering
  // the diagram icon itself.
  const [hoverGemSlot, setHoverGemSlot] = useState(null)
  const equipment = (armory.ArmoryEquipment || []).filter(
    (item) => !['나침반', '부적'].includes(item.Type),
  )
  const knownTypes = new Set([...leftEquipmentTypes, ...rightEquipmentTypes])
  const leftEquipment = [
    ...equipmentByOrder(equipment, leftEquipmentTypes),
    ...equipment.filter((item) => !knownTypes.has(item.Type)),
  ]
  const rightEquipment = equipmentByOrder(equipment, rightEquipmentTypes)
  const gems = armory.ArmoryGem?.Gems || []
  const gemEffects = armory.ArmoryGem?.Effects?.Skills || []
  const orderedGems = orderGems(gems, gemEffects)
  const engravings =
    armory.ArmoryEngraving?.ArkPassiveEffects || armory.ArmoryEngraving?.Effects || []
  const cards = armory.ArmoryCard?.Cards || []
  const cardEffects = armory.ArmoryCard?.Effects || []

  return (
    <div className="battle-dashboard">
      <div className="battle-two-column battle-primary-row">
        <section className="battle-panel engraving-board">
          <div className="battle-heading">
            <div>
              <Layers3 />
              <h2>각인</h2>
            </div>
            <span>{engravings.length}개 적용</span>
          </div>
          {engravings.length ? (
            <div className="battle-engravings">
              {engravings.map((item, index) => (
                <EngravingRow item={item} index={index} key={item.Name || index} />
              ))}
            </div>
          ) : (
            <Empty icon={Layers3} text="각인 정보가 없습니다." />
          )}
        </section>
        <section className="battle-panel card-board">
          <div className="battle-heading">
            <div>
              <BookOpen />
              <h2>카드</h2>
            </div>
            <span>{cardEffects.at(-1)?.Items?.at(-1)?.Name || `${cards.length}장 장착`}</span>
          </div>
          {cards.length ? (
            <div className="battle-cards">
              {cards.map((card, index) => (
                <article key={index}>
                  <div>
                    <img src={card.Icon} alt="" />
                    <div
                      className="card-frame"
                      style={{
                        backgroundSize: `${cardFrameSheetWidth}px ${cardFrameSheetHeight}px`,
                        backgroundPositionX: `${cardFramePositionX(card.Grade)}px`,
                      }}
                    />
                    <div
                      className="card-awake"
                      style={{
                        width: `${(card.AwakeTotal || 0) * CARD_AWAKE_PIP}px`,
                        height: `${CARD_AWAKE_HEIGHT}px`,
                        bottom: `${CARD_AWAKE_BOTTOM}px`,
                        backgroundSize: cardAwakeSheetSize,
                      }}
                    >
                      <div
                        className="awake"
                        style={{
                          width: `${(card.AwakeCount || 0) * CARD_AWAKE_PIP}px`,
                          backgroundSize: cardAwakeSheetSize,
                          backgroundPositionY: `-${CARD_AWAKE_HEIGHT}px`,
                        }}
                      />
                    </div>
                    <strong style={{ color: cardGradeTextColor[cardGradeIndex(card.Grade)] }}>
                      {card.Name}
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty icon={BookOpen} text="장착된 카드가 없습니다." />
          )}
        </section>
      </div>

      <nav className="battle-category-tabs">
        {categories.map(([id, label, Icon]) => (
          <button className={category === id ? 'active' : ''} onClick={() => setCategory(id)} key={id}>
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {category === 'equipment' && (
        <section className="battle-panel equipment-board">
          <div className="battle-heading">
            <div>
              <Shield />
              <h2>장비</h2>
            </div>
            <span>아이템 레벨 {profile.ItemAvgLevel}</span>
          </div>
          <div className="equipment-columns">
            <div>
              {leftEquipment.map((item, index) => (
                <EquipmentRow item={item} onHover={setHover} key={`${item.Type}-${index}`} />
              ))}
            </div>
            <div>
              {rightEquipment.map((item, index) => (
                <EquipmentRow
                  item={item}
                  accessory={accessoryTypes.includes(item.Type)}
                  onHover={setHover}
                  key={`${item.Type}-${index}`}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {category === 'gem' && (
        <section className="battle-panel gem-board">
          <div className="battle-heading">
            <div>
              <Gem />
              <h2>보석</h2>
            </div>
            <span>{gems.length}개 장착</span>
          </div>
          {gems.length ? (
            <div className="jewel-diagram-layout">
              <div className="jewel-diagram">
                {gems.map((gem) => (
                  <JewelSlot
                    gem={gem}
                    effect={gemEffects.find((item) => Number(item.GemSlot) === Number(gem.Slot))}
                    onHover={setHover}
                    onHoverSlot={setHoverGemSlot}
                    active={hoverGemSlot === gem.Slot}
                    key={gem.Slot}
                  />
                ))}
              </div>
              <div className="jewel-effect-list">
                <div className="jewel-effect-list-heading">
                  <h4>장착 중인 보석 효과</h4>
                  <span className="default-power">
                    기본 공격력 총합 : {totalBasePower(gemEffects)}%
                  </span>
                </div>
                <div className="battle-gems">
                  {orderedGems.map(({ gem, effect }, index) => (
                    <GemRow
                      gem={gem}
                      effect={effect}
                      onHoverSlot={setHoverGemSlot}
                      active={hoverGemSlot === gem.Slot}
                      key={gem.Slot ?? index}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Empty icon={Gem} text="장착된 보석이 없습니다." />
          )}
        </section>
      )}

      {category === 'skill' && (
        <SkillOverview profile={profile} skills={skills} armory={armory} onHover={setHover} />
      )}

      <ItemTooltip item={hover?.item} left={hover?.left} right={hover?.right} top={hover?.top} />
    </div>
  )
}

function EquipmentRow({ item, onHover }) {
  const details = tooltipData(item)
  if (accessoryTypes.includes(item.Type)) return <AccessoryRow item={item} details={details} onHover={onHover} />
  if (honingTypes.includes(item.Type)) return <HoningRow item={item} details={details} onHover={onHover} />
  if (item.Type === '어빌리티 스톤') return <StoneRow item={item} details={details} onHover={onHover} />
  if (item.Type === '보주') return <OrbRow item={item} details={details} onHover={onHover} />
  return (
    <article
      className={`battle-equipment ${gradeClass(item.Grade)} ${item.Type === '팔찌' ? 'bracelet-row' : ''}`}
    >
      <EquipmentIcon item={item} onHover={onHover} />
      <div className="equipment-copy">
        <strong>{item.Name}</strong>
        <span>{equipmentMeta(item, details)}</span>
      </div>
    </article>
  )
}

// Hovering only the icon (not the name/stats text) triggers the item tooltip,
// anchored to float beside the icon rather than following the cursor.
function EquipmentIcon({ item, onHover }) {
  return (
    <div
      className="equipment-icon"
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onHover?.({ item, left: rect.left, right: rect.right, top: rect.top })
      }}
      onMouseLeave={() => onHover?.(null)}
    >
      <img src={item.Icon} alt="" />
    </div>
  )
}

function HoningRow({ item, details, onHover }) {
  const enhancement = item.Name?.match(/^\+(\d+)/)?.[1]
  const itemName = item.Name?.replace(/^\+\d+\s*/, '')
  return (
    <article className={`battle-equipment honing-row ${gradeClass(item.Grade)}`}>
      <EquipmentIcon item={item} onHover={onHover} />
      <div className="equipment-copy">
        <strong>
          <em className="honing-level">
            {enhancement ? `+${enhancement}` : ''}
            {details.advancedHoning ? ` ×${details.advancedHoning}` : ''}
          </em>
          {itemName}
        </strong>
        <div className="equipment-badges">
          <b className={`quality q-${Math.floor(Number(details.quality || 0) / 10)}`}>
            {details.quality ?? '-'}
          </b>
          <span>{details.level || '-'}</span>
        </div>
      </div>
    </article>
  )
}

function AccessoryRow({ item, details, onHover }) {
  return (
    <article className={`battle-equipment accessory-row ${gradeClass(item.Grade)}`}>
      <EquipmentIcon item={item} onHover={onHover} />
      <div className="equipment-copy accessory-copy">
        <strong title={item.Name}>{item.Name}</strong>
        <div className="accessory-meta">
          <b className={`quality q-${Math.floor(Number(details.quality || 0) / 10)}`}>
            {details.quality ?? '-'}
          </b>
          <span>깨달음 +{details.enlightenment ?? 0}</span>
        </div>
      </div>
      <div className="accessory-effect-list">
        {details.accessoryEffects.length ? (
          details.accessoryEffects.map((effect) => (
            <div key={effect.key}>
              <i
                className={effect.tier}
                aria-label={effect.tier === 'high' ? '상' : effect.tier === 'middle' ? '중' : '하'}
              />
              <span>{effect.name}</span>
              <b style={effect.color !== 'FFD200' && effect.color !== 'CE43FC' ? { color: `#${effect.color}` } : undefined}>
                {effect.value}
              </b>
            </div>
          ))
        ) : (
          <small>연마 효과 없음</small>
        )}
      </div>
    </article>
  )
}

function StoneRow({ item, details, onHover }) {
  return (
    <article className={`battle-equipment stone-row ${gradeClass(item.Grade)}`}>
      <EquipmentIcon item={item} onHover={onHover} />
      <div className="equipment-copy">
        <strong>{item.Name}</strong>
        <div className="stone-total">Lv.{details.stoneLevel}</div>
      </div>
      <div className="stone-effect-list">
        {details.stoneEngravings.map((effect) => (
          <div className={effect.harmful ? 'harmful' : ''} key={effect.name}>
            <i className={effect.harmful ? 'stone-gem-red' : 'stone-gem-blue'} />
            <span>
              {effect.name} Lv.{effect.level}
            </span>
          </div>
        ))}
      </div>
    </article>
  )
}

function OrbRow({ item, details, onHover }) {
  return (
    <article className={`battle-equipment orb-row ${gradeClass(item.Grade)}`} title={item.Name}>
      <EquipmentIcon item={item} onHover={onHover} />
      <div className="equipment-copy">
        <strong>{details.orbName || item.Name}</strong>
        <span>
          {details.paradisePower
            ? `달성 낙원력 ${details.paradisePower}`
            : details.orbDamage
              ? `고정 피해 ${details.orbDamage}`
              : '특수 효과 정보 없음'}
        </span>
      </div>
    </article>
  )
}

function equipmentMeta(item, details) {
  if (honingTypes.includes(item.Type))
    return [`품질 ${details.quality ?? '-'}`, details.level && `장비 Lv.${details.level}`]
      .filter(Boolean)
      .join(' · ')
  if (accessoryTypes.includes(item.Type))
    return [
      `품질 ${details.quality ?? '-'}`,
      details.enlightenment && `깨달음 +${details.enlightenment}`,
    ]
      .filter(Boolean)
      .join(' · ')
  if (item.Type === '어빌리티 스톤') return `스톤 합레벨 Lv.${details.stoneLevel}`
  if (item.Type === '팔찌') return details.braceletStats.join(' · ') || '팔찌 효과 정보 없음'
  if (item.Type === '보주')
    return (
      [details.orbName, details.orbDamage && `고정 피해 ${details.orbDamage}`]
        .filter(Boolean)
        .join(' · ') || '특수 효과 정보 없음'
    )
  return item.Grade || ''
}

const engravingGradePosition = {
  전설: '-58px',
  영웅: '-87px',
  유물: '-116px',
}

function EngravingRow({ item, index }) {
  const baseLevel = Number(item.Level ?? 0)
  const stoneLevel = Number(item.AbilityStoneLevel ?? 0)
  const icon = getEngravingIcon(item.Name, item.Icon)
  return (
    <div className="engraving-row" title={cleanApiText(item.Description)}>
      <div className={`engraving-symbol symbol-${index % 5}`}>
        {icon ? <img src={icon} alt={`${item.Name} 각인`} /> : <span>{item.Name?.[0] || '?'}</span>}
      </div>
      <i
        className="engraving-level-mark"
        style={{ backgroundPositionX: engravingGradePosition[item.Grade] || '-116px' }}
        aria-hidden="true"
      />
      <span className="engraving-base" aria-label={`기본 각인 레벨 ${baseLevel}`}>
        × {baseLevel}
      </span>
      <strong>{item.Name}</strong>
      {stoneLevel > 0 && (
        <>
          <i className="ability-stone-mark" aria-hidden="true" />
          <span
            className="ability-stone-level"
            aria-label={`어빌리티 스톤 추가 레벨 ${stoneLevel}`}
          >
            Lv.{stoneLevel}
          </span>
        </>
      )}
    </div>
  )
}

// Matches the official .jewel__wrap layout: 11 fixed slots (top row of 4,
// middle row of 3, bottom row of 4) over bg_jewel.jpg, keyed by gem.Slot.
const JEWEL_SLOT_POSITIONS = [
  { top: 221, left: 30 },
  { top: 221, left: 113 },
  { top: 221, left: 329 },
  { top: 221, left: 412 },
  { top: 319, left: 140 },
  { top: 319, left: 223 },
  { top: 319, left: 306 },
  { top: 417, left: 30 },
  { top: 417, left: 113 },
  { top: 417, left: 329 },
  { top: 417, left: 412 },
]

function totalBasePower(effects) {
  const sum = effects.reduce((total, effect) => {
    const match = String(effect?.Option || '').match(/([\d.]+)\s*%/)
    return total + (match ? parseFloat(match[1]) : 0)
  }, 0)
  return sum.toFixed(2)
}

function JewelSlot({ gem, effect, onHover, onHoverSlot, active }) {
  const position = JEWEL_SLOT_POSITIONS[gem.Slot] ?? JEWEL_SLOT_POSITIONS[0]
  const isCooldown = gemEffectDetails(effect).isCooldown
  return (
    <div
      className={`jewel-slot ${gradeClass(gem.Grade)} ${active ? 'active' : ''}`}
      style={{ top: position.top, left: position.left }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        onHover?.({ item: gem, left: rect.left, right: rect.right, top: rect.top })
        onHoverSlot?.(gem.Slot)
      }}
      onMouseLeave={() => {
        onHover?.(null)
        onHoverSlot?.(null)
      }}
    >
      <span className="jewel_img">
        <img src={gem.Icon} alt="" />
      </span>
      <b className="jewel_level">
        <em className={isCooldown ? 'gemsymbol-time' : 'gemsymbol-attack'} />
        Lv.{gem.Level}
      </b>
    </div>
  )
}

function GemRow({ gem, effect, onHoverSlot, active }) {
  const { description } = gemEffectDetails(effect)

  return (
    <div
      className={`gem-entry ${gradeClass(gem.Grade)} ${active ? 'active' : ''}`}
      onMouseEnter={() => onHoverSlot?.(gem.Slot)}
      onMouseLeave={() => onHoverSlot?.(null)}
    >
      <span className="slot">{effect?.Icon && <img src={effect.Icon} alt="" />}</span>
      <div className="skill">
        <strong className="skill_tit">{effect?.Name || '연계 스킬 없음'}</strong>
        {description && (
          <p className="skill_detail">
            <em>{effect.Name}</em> {description}
          </p>
        )}
        {effect?.Option && (
          <p className="add_effect">
            <em>추가 효과</em> {effect.Option}
          </p>
        )}
      </div>
    </div>
  )
}

function gemEffectDetails(effect) {
  const description = cleanApiText(
    Array.isArray(effect?.Description) ? effect.Description.join(' ') : effect?.Description || '',
  )
  return {
    description,
    isCooldown: /재사용\s*대기시간/.test(description),
    amount: description.match(/\d+(?:\.\d+)?%/)?.[0],
  }
}

function orderGems(gems, effects) {
  const entries = gems.map((gem) => {
    const effect = effects.find((item) => Number(item.GemSlot) === Number(gem.Slot))
    return { gem, effect, name: effect?.Name || '', ...gemEffectDetails(effect) }
  })
  const groups = new Map()
  entries.forEach((entry) => groups.set(entry.name, [...(groups.get(entry.name) || []), entry]))
  const paired = []
  const unpaired = []

  groups.forEach((group) => {
    const damage = group.filter((item) => !item.isCooldown)
    const cooldown = group.filter((item) => item.isCooldown)
    if (damage.length && cooldown.length)
      paired.push({ name: group[0].name, items: [...damage, ...cooldown] })
    else unpaired.push(...group)
  })

  paired.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  unpaired.sort(
    (a, b) => Number(a.isCooldown) - Number(b.isCooldown) || a.name.localeCompare(b.name, 'ko'),
  )
  return [...paired.flatMap((group) => group.items), ...unpaired]
}

function ArkPassive({ passive }) {
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

function PassiveNode({ effect, groupName }) {
  const text = cleanApiText(effect.Description).replace(new RegExp(`^${groupName}\\s*`), '')
  const match = text.match(/(\d+티어)\s+(.+?)\s+(Lv\.\d+)$/)
  const tier = match?.[1] || ''
  const name = match?.[2] || text
  const level = match?.[3] || ''
  return (
    <div className="passive-node">
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

function Empty({ icon: Icon, text }) {
  return (
    <div className="battle-empty">
      <Icon />
      <span>{text}</span>
    </div>
  )
}
