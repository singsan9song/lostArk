import { Box, Palette, Sparkles } from 'lucide-react'

const rightTypes = ['머리', '얼굴1', '얼굴2', '악기', '이동 효과']
const slotOrder = ['무기', '머리', '상의', '얼굴1', '하의', '얼굴2', '악기', '이동 효과']

function colorsFromTooltip(tooltip = '') {
  return [...new Set(tooltip.match(/#[0-9A-Fa-f]{6}/g) || [])].slice(0, 3)
}

function normalizeType(type = '') { return type.replace(' 아바타', '').replace('무기 덧입기', '무기') }

export default function AvatarOverview({ profile, avatars }) {
  const tendencies = Object.fromEntries((profile.Tendencies || []).map(item => [item.Type, item.Point]))
  const slots = slotOrder.map(type => ({ type, item: avatars.find(avatar => normalizeType(avatar.Type).includes(type)) }))
  const leftSlots = slots.filter(slot => !rightTypes.includes(slot.type))
  const rightSlots = slots.filter(slot => rightTypes.includes(slot.type))
  const dyedItems = avatars.map(item => ({ item, colors: colorsFromTooltip(item.Tooltip) })).filter(entry => entry.colors.length)

  return <div className="avatar-dashboard">
    <section className="tendency-bar">{['지성','담력','친절','매력'].map(name => <div key={name}><span>{name}</span><strong>{tendencies[name] ?? 0}</strong></div>)}</section>
    <section className="avatar-stage">
      <div className="avatar-stage-glow" />
      <div className="avatar-slots left">{leftSlots.map(slot => <AvatarSlot {...slot} key={slot.type} />)}</div>
      <div className="avatar-character">{profile.CharacterImage ? <img src={profile.CharacterImage} alt={`${profile.CharacterName} 아바타`} /> : <div><Palette /></div>}</div>
      <div className="avatar-slots right">{rightSlots.map(slot => <AvatarSlot {...slot} reverse key={slot.type} />)}</div>
    </section>
    <section className="dye-section"><div className="avatar-section-heading"><div><Palette /><h2>염색 정보</h2></div><span>{dyedItems.length ? `${dyedItems.length}개 부위` : '염색 정보 없음'}</span></div>{dyedItems.length ? <div className="dye-grid">{dyedItems.map(({ item, colors }, index) => <article key={`${item.Type}-${index}`}><header><img src={item.Icon} alt="" /><div><strong>{item.Name}</strong><span>{normalizeType(item.Type)}</span></div></header>{colors.map((color, colorIndex) => <div className="dye-row" key={color}><span>부위{colorIndex + 1}</span><i style={{backgroundColor:color}} /><code>{color.toUpperCase()}</code></div>)}</article>)}</div> : <div className="avatar-empty"><Sparkles /><p>공개된 염색 정보가 없습니다.</p></div>}</section>
  </div>
}

function AvatarSlot({ type, item, reverse }) {
  return <article className={`avatar-slot ${reverse ? 'reverse' : ''} ${item ? 'equipped' : 'empty'}`}>
    <div className="avatar-slot-icon">{item ? <img src={item.Icon} alt="" /> : <Box />}</div>
    <div><strong>{item?.Name || '착용하지 않음'}</strong><span>{type} 아바타</span></div>
  </article>
}
