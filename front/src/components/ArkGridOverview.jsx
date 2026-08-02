import { useState } from 'react'
import { Grid3X3 } from 'lucide-react'
import { toSafeHtml } from '../lib/lostArkHtml'

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

// Matches the official .arkgrid__slot_list absolute positions (extracted from
// the live profile.pc.css): 6 core slots arranged in a hexagon over
// bg_arkgrid.jpg, keyed by each slot's own Index (0-5) — not array order.
const CORE_POSITIONS = [
  { top: 96, left: 192 },
  { top: 202, left: 369 },
  { top: 368, left: 369 },
  { top: 458, left: 189 },
  { top: 368, left: 18 },
  { top: 202, left: 18 },
]

// Each core has its own gem layout (the 4 satellite gem slots point outward
// from the hexagon's center), one fixed set per core Index — also lifted
// directly from the live CSS ([data-layout-type="N"] .gem_slotM).
const GEM_POSITIONS = [
  [
    { top: 25, left: 86 },
    { top: 51, left: 30 },
    { top: 114, left: 29 },
    { top: 150, left: 86 },
  ],
  [
    { top: 55, left: 146 },
    { top: 27, left: 87 },
    { top: 53, left: 29 },
    { top: 117, left: 29 },
  ],
  [
    { top: 124, left: 148 },
    { top: 64, left: 146 },
    { top: 33, left: 89 },
    { top: 59, left: 31 },
  ],
  [
    { top: 151, left: 88 },
    { top: 119, left: 152 },
    { top: 55, left: 151 },
    { top: 29, left: 89 },
  ],
  [
    { top: 117, left: 30 },
    { top: 151, left: 88 },
    { top: 118, left: 144 },
    { top: 52, left: 145 },
  ],
  [
    { top: 52, left: 30 },
    { top: 119, left: 30 },
    { top: 151, left: 88 },
    { top: 120, left: 148 },
  ],
]

export default function ArkGridOverview({ arkGrid, onHover }) {
  const [openEffect, setOpenEffect] = useState(null)
  const slots = arkGrid?.Slots || []
  const effects = arkGrid?.Effects || []

  return (
    <section className="battle-panel arkgrid-board">
      <div className="battle-heading">
        <div>
          <Grid3X3 />
          <h2>아크그리드</h2>
        </div>
        {slots.length > 0 && <span>{slots.length}개 코어 장착</span>}
      </div>
      {slots.length ? (
        <div className="arkgrid-layout">
          <div className="arkgrid-diagram">
            {slots.map((slot) => (
              <ArkGridCore
                slot={slot}
                position={CORE_POSITIONS[slot.Index] ?? CORE_POSITIONS[0]}
                gemPositions={GEM_POSITIONS[slot.Index] ?? GEM_POSITIONS[0]}
                onHover={onHover}
                key={slot.Index}
              />
            ))}
          </div>
          <div className="arkgrid-effect-panel">
            <h4>장착 중인 아크 그리드 효과</h4>
            <ul className="arkgrid-core-list">
              {slots.map((slot) => (
                <li className={gradeClass(slot.Grade)} key={slot.Index}>
                  <span
                    className="arkgrid-core-list-icon"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      onHover?.({ item: slot, left: rect.left, right: rect.right, top: rect.top })
                    }}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    <img loading="lazy" src={slot.Icon} alt="" />
                  </span>
                  <strong className="arkgrid-core-name">{slot.Name}</strong>
                  <b className="arkgrid-core-point">{slot.Point}P</b>
                </li>
              ))}
            </ul>
            {effects.length ? (
              <ul className="arkgrid-effect-list">
                {effects.map((effect, index) => {
                  const effectKey = effect.Name || index
                  return (
                  <li
                    className={openEffect === effectKey ? 'is-open' : ''}
                    tabIndex={0}
                    aria-expanded={openEffect === effectKey}
                    onClick={() => {
                      if (window.matchMedia('(max-width: 600px)').matches) {
                        setOpenEffect((current) => (current === effectKey ? null : effectKey))
                      }
                    }}
                    onBlur={() => {
                      if (window.matchMedia('(max-width: 600px)').matches) setOpenEffect(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setOpenEffect(null)
                    }}
                    key={effectKey}
                  >
                    <span>
                      {effect.Name} <em>Lv. {effect.Level}</em>
                    </span>
                    <div
                      className="arkgrid-effect-tooltip"
                      dangerouslySetInnerHTML={{ __html: toSafeHtml(effect.Tooltip) }}
                    />
                  </li>
                  )
                })}
              </ul>
            ) : (
              <p className="arkgrid-no-effect">적용된 효과가 없습니다.</p>
            )}
          </div>
        </div>
      ) : (
        <Empty icon={Grid3X3} text="아크그리드 정보가 없습니다." />
      )}
    </section>
  )
}

function ArkGridCore({ slot, position, gemPositions, onHover }) {
  return (
    <div className="arkgrid-slot" style={{ top: position.top, left: position.left }}>
      <span
        className={`arkgrid-core-slot ${gradeClass(slot.Grade)}`}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          onHover?.({ item: slot, left: rect.left, right: rect.right, top: rect.top })
        }}
        onMouseLeave={() => onHover?.(null)}
      >
        <img loading="lazy" src={slot.Icon} alt="" />
      </span>
      {(slot.Gems || []).map((gem, index) => {
        const gemPosition = gemPositions[index] ?? gemPositions[0]
        return (
          <span
            className={`arkgrid-gem-slot ${gradeClass(gem.Grade)} ${gem.IsActive ? 'active' : ''}`}
            style={{ top: gemPosition.top, left: gemPosition.left }}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              onHover?.({ item: gem, left: rect.left, right: rect.right, top: rect.top })
            }}
            onMouseLeave={() => onHover?.(null)}
            key={gem.Index ?? index}
          >
            <img loading="lazy" src={gem.Icon} alt="" />
          </span>
        )
      })}
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
