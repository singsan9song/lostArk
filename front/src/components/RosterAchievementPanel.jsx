import { useState } from 'react'
import { Info } from 'lucide-react'
import { toSafeHtml } from '../lib/lostArkHtml'

const SUPPORT_ENGRAVINGS = ['절실한 구원', '축복의 오라', '만개', '빛의 기사']

const DEALER_CARD_SETS = [
  { name: '세상을 구하는 빛', element: 'holy' },
  { name: '카제로스의 군단장', element: 'dark' },
  { name: '굳센 대지의 숨결', element: 'earth' },
  { name: '날랜 뇌전의 숨결', element: 'lightning' },
  { name: '힘찬 화염의 숨결', element: 'fire' },
  { name: '거센 파도의 숨결', element: 'water' },
]

const SUPPORT_CARD_SETS = [
  { name: '남겨진 바람의 절벽', element: 'holy' },
  { name: '신념의 길', element: 'dark' },
  { name: '잠재우는 대지의 가호', element: 'earth' },
  { name: '몰아치는 뇌전의 가호', element: 'lightning' },
  { name: '피어나는 화염의 가호', element: 'fire' },
  { name: '노래하는 파도의 가호', element: 'water' },
]

function isSupportBuild(armory) {
  const enlightenmentEffects = (armory?.ArkPassive?.Effects || []).filter((effect) =>
    String(effect?.Name || '').includes('깨달음'),
  )
  return enlightenmentEffects.some((effect) =>
    SUPPORT_ENGRAVINGS.some((name) =>
      [
        effect?.Name,
        effect?.Description,
        effect?.ToolTip,
        effect?.Tooltip,
      ]
        .filter(Boolean)
        .join(' ')
        .includes(name),
    ),
  )
}

function cardSetsWithStatus(cardSets, support) {
  const targets = support ? SUPPORT_CARD_SETS : DEALER_CARD_SETS
  return targets.map((target) => {
    const observations = cardSets
      .map((observed) => String(observed || ''))
      .filter((observed) => observed.includes(target.name))
    const awakening = observations.reduce((highest, observed) => {
      const value = Number(observed.match(/(\d+)\s*각성/)?.[1] || 0)
      return Math.max(highest, value)
    }, 0)
    return {
      ...target,
      confirmed: observations.length > 0,
      badge: awakening >= 12 ? `${awakening}각성` : observations.length ? '세트' : '',
    }
  })
}

function tooltipLines(tooltip) {
  const lines = Array.isArray(tooltip) ? tooltip : tooltip ? [tooltip] : []
  return lines.filter((line) => typeof line === 'string' && line.trim())
}

function isMobileTooltipViewport() {
  return window.matchMedia('(max-width: 600px)').matches
}

function StatValue({ stat, fallback = '-', open, onToggle, onClose }) {
  const lines = tooltipLines(stat?.Tooltip)
  const content = (
    <>
      <span>{stat?.Type}</span>
      <strong>{stat?.Value ?? fallback}</strong>
    </>
  )

  if (!lines.length) return <div className="stat-value">{content}</div>

  return (
    <div className={`stat-value stat-with-tooltip ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        aria-label={`${stat.Type} ${stat.Value}. 상세 효과 보기`}
        aria-expanded={open}
        onClick={() => {
          if (isMobileTooltipViewport()) onToggle()
        }}
        onBlur={() => {
          if (isMobileTooltipViewport()) onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {content}
      </button>
      <div className="profile-ability-tooltip" role="tooltip">
        <ul>
          {lines.map((line, index) => (
            <li
              key={`${stat.Type}-${index}`}
              dangerouslySetInnerHTML={{ __html: toSafeHtml(line) }}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function RosterAchievementPanel({ discoveries, stats, armory }) {
  const [openStat, setOpenStat] = useState(null)
  const found = discoveries || { titles: [], cardSets: [] }
  const support = isSupportBuild(armory)
  const cardSets = cardSetsWithStatus(found.cardSets || [], support)
  const profileStats = new Map(
    (armory?.ArmoryProfile?.Stats || []).map((stat) => [stat.Type, stat]),
  )

  return (
    <aside className="roster-achievements">
      <section className="collection-box">
        <header>
          <span>확인된 카드 세트 · {support ? '서포터' : '딜러'}</span>
          <Info title="현재 캐릭터의 아크 패시브 깨달음에 서포터 직업 각인이 포함되어 있는지 확인해 카드 세트를 구분합니다." />
        </header>
        <div className="collection-chips">
          {cardSets.map(({ name, element, confirmed, badge }) => (
            <div
              className={confirmed ? 'is-confirmed' : 'is-unconfirmed'}
              title={`${name} · ${confirmed ? badge : '미확인'}`}
              key={name}
            >
              <i className="card-symbol">
                <img
                  src={`/images/etc/card_${element}.png`}
                  alt=""
                  aria-hidden="true"
                />
                {badge && <b className="card-set-badge">{badge}</b>}
              </i>
              <span>{name}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="battle-panel stat-board">
        <div className="battle-heading">
          <div>
            <h2>인게임 기본 및 전투 특성</h2>
          </div>
        </div>
        <div className="basic-stats">
          {['공격력', '최대 생명력'].map((name) => (
            <StatValue
              stat={profileStats.get(name) || { Type: name, Value: stats?.[name] }}
              open={openStat === name}
              onToggle={() => setOpenStat((current) => (current === name ? null : name))}
              onClose={() => setOpenStat(null)}
              key={name}
            />
          ))}
        </div>
        <div className="combat-stats">
          {['치명', '특화', '신속', '제압', '인내', '숙련'].map((name) => (
            <StatValue
              stat={profileStats.get(name) || { Type: name, Value: stats?.[name] || 0 }}
              fallback={0}
              open={openStat === name}
              onToggle={() => setOpenStat((current) => (current === name ? null : name))}
              onClose={() => setOpenStat(null)}
              key={name}
            />
          ))}
        </div>
      </section>
    </aside>
  )
}
