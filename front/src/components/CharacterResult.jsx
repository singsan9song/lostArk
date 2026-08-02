import { useMemo, useState } from 'react'
import {
  Award,
  BarChart3,
  BookOpen,
  Box,
  ChevronDown,
  CircleGauge,
  Clock3,
  Gem,
  Grid3X3,
  History,
  Layers3,
  Palette,
  Shield,
  Sparkles,
  Swords,
  Users,
  RefreshCw,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import ProfileHero from './ProfileHero'
import BattleOverview from './BattleOverview'
import AvatarOverview from './AvatarOverview'
import RosterAchievementPanel from './RosterAchievementPanel'
import { cleanApiText } from '../lib/text'
import { getEngravingIcon } from '../lib/engravingIcons'
import { useCooldownSeconds } from '../lib/useCooldownSeconds'

// 스킬 tab folded into 전투정보's own 스킬 category (see BattleOverview).
const tabs = [
  ['overview', '전투정보', Swords],
  ['avatar', '아바타', Palette],
  ['history', '성장기록', History],
  ['collectible', '수집형 포인트', Grid3X3],
  ['expedition', '원정대', Users],
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
const numberLevel = (value) => Number(String(value || 0).replace(/,/g, ''))

export default function CharacterResult({
  data,
  onSiblingSearch,
  onCharacterRefresh,
  characterRefreshing,
  characterRefreshError,
  characterRefreshCooldownUntil,
  onRosterRefresh,
  rosterRefreshing,
  rosterError,
  rosterRefreshCooldownUntil,
}) {
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab') || 'overview'
  const tab = tabs.some(([id]) => id === requestedTab) ? requestedTab : 'overview'
  const [server, setServer] = useState('전체')
  const armory = data.armory || {}
  const profile = armory.ArmoryProfile || {}
  const equipment = armory.ArmoryEquipment || []
  const gems = armory.ArmoryGem?.Gems || []
  const engravings =
    armory.ArmoryEngraving?.ArkPassiveEffects || armory.ArmoryEngraving?.Effects || []
  const cards = armory.ArmoryCard?.Cards || []
  const cardEffects = armory.ArmoryCard?.Effects || []
  const avatars = armory.ArmoryAvatars || []
  // Memoized so a stable reference survives the 1s cooldown-timer re-render below —
  // otherwise every downstream useMemo keyed on `skills` (accessory damage calc, etc.)
  // would recompute every second even though the underlying armory data hasn't changed.
  const skills = useMemo(
    () => armory.ArmorySkills || [],
    [armory],
  )
  const collectibles = armory.Collectibles || []
  const siblings = data.siblings || []
  const stats = Object.fromEntries((profile.Stats || []).map((item) => [item.Type, item.Value]))
  const servers = useMemo(
    () => ['전체', ...new Set(siblings.map((item) => item.ServerName).filter(Boolean))],
    [siblings],
  )
  const visibleSiblings =
    server === '전체' ? siblings : siblings.filter((item) => item.ServerName === server)
  const selectTab = (id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true })

  return (
    <section className="character-result character-v2">
      <div className="character-summary-grid">
        <ProfileHero
          profile={profile}
          armory={armory}
          siblings={siblings}
          onRefresh={onCharacterRefresh}
          refreshing={characterRefreshing}
          refreshCooldownUntil={characterRefreshCooldownUntil}
        />
        <RosterAchievementPanel discoveries={data.discoveries} stats={stats} armory={armory} />
      </div>
      {characterRefreshError && (
        <p className="character-refresh-error">{characterRefreshError}</p>
      )}

      <nav className="result-tabs">
        {tabs.map(([id, label, Icon]) => (
          <button className={tab === id ? 'active' : ''} onClick={() => selectTab(id)} key={id}>
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <BattleOverview armory={armory} profile={profile} stats={stats} skills={skills} siblings={siblings} />
      )}
      {tab === 'avatar' && <AvatarOverview profile={profile} avatars={avatars} />}
      {tab === 'history' && (
        <HistoryTab
          profile={profile}
          fetchedAt={data.fetchedAt}
          growthHistory={data.growthHistory}
        />
      )}
      {tab === 'collectible' && <CollectibleTab collectibles={collectibles} />}
      {tab === 'expedition' && (
        <ExpeditionTab
          siblings={visibleSiblings}
          servers={servers}
          server={server}
          setServer={setServer}
          onSearch={onSiblingSearch}
          onRefresh={onRosterRefresh}
          refreshing={rosterRefreshing}
          refreshCooldownUntil={rosterRefreshCooldownUntil}
          error={rosterError}
        />
      )}
    </section>
  )
}

function Overview({ profile, stats, equipment, gems, engravings, cards, cardEffects }) {
  return (
    <div className="overview-layout">
      <div className="overview-main">
        <section className="result-panel">
          <PanelTitle title="전투 특성" sub="캐릭터 기본 전투 정보" />
          <div className="combat-power">
            <span className="result-icon violet">
              <Swords />
            </span>
            <div>
              <small>전투력</small>
              <strong>{profile.CombatPower || '-'}</strong>
            </div>
          </div>
          <div className="stat-grid">
            {['공격력', '최대 생명력', '치명', '특화', '신속'].map((name) => (
              <div key={name}>
                <span>{name}</span>
                <strong>{stats[name] || '-'}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="result-panel">
          <PanelTitle title="장착 장비" count={equipment.length} />
          <div className="equipment-grid">
            {equipment.map((item, i) => (
              <article
                className={`equipment-card ${gradeClass(item.Grade)}`}
                key={`${item.Type}-${i}`}
              >
                <img loading="lazy" src={item.Icon} alt="" />
                <div>
                  <span>
                    {item.Grade} · {item.Type}
                  </span>
                  <strong>{item.Name}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      <aside className="overview-side">
        <section className="result-panel">
          <PanelTitle title="캐릭터 정보" />
          <dl className="profile-list">
            <div>
              <dt>
                <CircleGauge />
                영지
              </dt>
              <dd>{profile.TownName ? `Lv.${profile.TownLevel} ${profile.TownName}` : '없음'}</dd>
            </div>
            <div>
              <dt>
                <Sparkles />
                스킬 포인트
              </dt>
              <dd>
                {profile.UsingSkillPoint || 0} / {profile.TotalSkillPoint || 0}
              </dd>
            </div>
            <div>
              <dt>
                <BarChart3 />
                명예 점수
              </dt>
              <dd>{profile.HonorPoint || 0}</dd>
            </div>
          </dl>
        </section>
        <section className="result-panel">
          <PanelTitle title="각인" count={engravings.length} />
          {engravings.length ? (
            <div className="mini-list">
              {engravings.map((item, i) => {
                const icon = getEngravingIcon(item.Name, item.Icon)
                return (
                  <div key={i}>
                    {icon ? <img loading="lazy" src={icon} alt={`${item.Name} 각인`} /> : <Layers3 />}
                    <span>
                      <strong>{item.Name}</strong>
                      <small>{cleanApiText(item.Description)}</small>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty text="각인 정보가 없습니다." icon={Layers3} />
          )}
        </section>
        <section className="result-panel">
          <PanelTitle title="보석" count={gems.length} />
          {gems.length ? (
            <div className="gem-grid compact-gems">
              {gems.map((item, i) => (
                <article className={`gem-card ${gradeClass(item.Grade)}`} key={i}>
                  <div>
                    <img loading="lazy" src={item.Icon} alt="" />
                    <b>Lv.{item.Level}</b>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty text="보석 정보가 없습니다." icon={Gem} />
          )}
        </section>
        <section className="result-panel">
          <PanelTitle title="카드" count={cards.length} />
          {cards.length ? (
            <>
              <div className="card-strip">
                {cards.map((item, i) => (
                  <img loading="lazy" src={item.Icon} title={item.Name} alt={item.Name} key={i} />
                ))}
              </div>
              {cardEffects.slice(-2).map((effect, i) => (
                <p className="card-effect" key={i}>
                  {effect.Items?.at(-1)?.Name}
                </p>
              ))}
            </>
          ) : (
            <Empty text="카드 정보가 없습니다." icon={BookOpen} />
          )}
        </section>
      </aside>
    </div>
  )
}

function AvatarTab({ avatars }) {
  const categories = [
    '무기 아바타',
    '머리 아바타',
    '상의 아바타',
    '하의 아바타',
    '얼굴1 아바타',
    '얼굴2 아바타',
  ]
  return (
    <section className="result-panel tab-page">
      <PanelTitle title="아바타" sub="현재 캐릭터가 착용 중인 외형" />
      {avatars.length ? (
        <div className="avatar-grid">
          {categories.map((type) => {
            const item = avatars.find((avatar) => avatar.Type === type)
            return (
              <article className={item ? gradeClass(item.Grade) : 'empty-slot'} key={type}>
                {item ? <img loading="lazy" src={item.Icon} alt="" /> : <Box />}
                <span>{type.replace(' 아바타', '')}</span>
                <strong>{item?.Name || '착용하지 않음'}</strong>
                {item?.IsSet && <em>세트</em>}
              </article>
            )
          })}
        </div>
      ) : (
        <Empty text="착용 중인 아바타 정보가 없습니다." icon={Palette} />
      )}
    </section>
  )
}

function SkillTab({ skills }) {
  return (
    <section className="result-panel tab-page">
      <PanelTitle title="전투 스킬" sub="레벨 2 이상 또는 룬이 장착된 스킬" count={skills.length} />
      {skills.length ? (
        <div className="skill-list">
          {skills.map((skill) => (
            <article key={skill.Name}>
              <div className="skill-icon">
                <img loading="lazy" src={skill.Icon} alt="" />
                <b>{skill.Level}</b>
              </div>
              <div className="skill-info">
                <strong>{skill.Name}</strong>
                <span>{skill.SkillType}</span>
                <div>
                  {(skill.Tripods || [])
                    .filter((item) => item.IsSelected)
                    .map((item) => (
                      <small key={item.Name}>
                        {item.Name} Lv.{item.Level}
                      </small>
                    ))}
                </div>
              </div>
              {skill.Rune && (
                <div className={`rune ${gradeClass(skill.Rune.Grade)}`}>
                  <img loading="lazy" src={skill.Rune.Icon} alt="" />
                  <span>{skill.Rune.Name}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty text="공개된 스킬 정보가 없습니다." icon={Sparkles} />
      )}
    </section>
  )
}

function HistoryTab({ profile, fetchedAt, growthHistory }) {
  const [historyScale, setHistoryScale] = useState('week')
  const [historyMetric, setHistoryMetric] = useState('itemLevel')
  const [historyChartType, setHistoryChartType] = useState('bar')
  const fallback = profile.ItemAvgLevel
    ? [{ itemLevel: profile.ItemAvgLevel, combatPower: profile.CombatPower, fetchedAt }]
    : []
  const records = growthHistory?.length ? growthHistory : fallback
  const metricKey = historyMetric === 'combatPower' ? 'combatPower' : 'itemLevel'
  const metricLabel = historyMetric === 'combatPower' ? '전투력' : '아이템 레벨'
  const allPoints = records
    .map((record) => ({
      ...record,
      value: numberLevel(record[metricKey]),
    }))
    .filter((record) => Number.isFinite(record.value) && record.value > 0)
    .sort((left, right) => new Date(left.fetchedAt || 0) - new Date(right.fetchedAt || 0))
  const points = compactGrowthPoints(allPoints, historyScale)
  const values = points.map((record) => record.value)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const range = Math.max(max - min, 1)
  const growth = points.length ? points.at(-1).value - points[0].value : 0

  return (
    <section className="result-panel tab-page history-page">
      <PanelTitle title="성장 기록" sub={`캐릭터의 ${metricLabel} 변화`} />
      <div className="growth-history">
        <div className="growth-chart-toolbar">
          <span>
            {metricLabel} 변화는 항상 표시 · 변화가 없으면{' '}
            {historyScale === 'day' ? '하루' : historyScale === 'week' ? '일주일' : '한 달'}에 한 번 표시
          </span>
          <div className="growth-chart-controls">
            <GrowthSelector
              value={historyMetric}
              setValue={setHistoryMetric}
              options={[
                ['itemLevel', '아이템 레벨'],
                ['combatPower', '전투력'],
              ]}
            />
            <GrowthSelector
              value={historyChartType}
              setValue={setHistoryChartType}
              options={[
                ['bar', '막대'],
                ['line', '선'],
              ]}
            />
            <GrowthSelector
              value={historyScale}
              setValue={setHistoryScale}
              options={[
                ['day', '하루'],
                ['week', '일주일'],
                ['month', '한 달'],
              ]}
            />
          </div>
        </div>
        {historyChartType === 'bar' ? (
          <div className="growth-chart" aria-label={`${metricLabel} 막대 성장 그래프`}>
            {points.map((record, index) => {
              const height = points.length === 1 ? 65 : 18 + ((record.value - min) / range) * 78
              const observedAt = record.fetchedAt
                ? new Date(record.fetchedAt).toLocaleString('ko-KR')
                : ''
              return (
                <div
                  className="growth-bar"
                  title={`${formatGrowthValue(record.value, historyMetric)} · ${observedAt}`}
                  key={`${record.fetchedAt || 'current'}-${index}`}
                >
                  <strong>{formatGrowthValue(record.value, historyMetric)}</strong>
                  <i style={{ height: `${height}%` }} />
                  <small>{growthDate(record.fetchedAt)}</small>
                </div>
              )
            })}
          </div>
        ) : (
          <GrowthLineChart
            points={points}
            min={min}
            range={range}
            metric={historyMetric}
            label={metricLabel}
          />
        )}
        <div className="growth-summary">
          <Clock3 />
          <div>
            <span>수집된 기록</span>
            <strong>{allPoints.length}회</strong>
          </div>
          <div>
            <span>최초 기록</span>
            <strong>{points.length ? formatGrowthValue(points[0].value, historyMetric) : '-'}</strong>
          </div>
          <div>
            <span>현재 {metricLabel}</span>
            <strong>
              {points.length
                ? formatGrowthValue(points.at(-1).value, historyMetric)
                : formatGrowthValue(
                    numberLevel(historyMetric === 'combatPower' ? profile.CombatPower : profile.ItemAvgLevel),
                    historyMetric,
                  )}
            </strong>
          </div>
          <div>
            <span>누적 성장</span>
            <strong>
              {points.length
                ? `${growth >= 0 ? '+' : ''}${formatGrowthValue(growth, historyMetric)}`
                : '-'}
            </strong>
          </div>
        </div>
        {points.length <= 1 && (
          <p className="growth-guide">
            현재부터 성장 기록을 수집합니다. 캐릭터를 다시 조회했을 때 아이템 레벨이
            변경되면 그래프에 자동으로 추가됩니다.
          </p>
        )}
      </div>
    </section>
  )
}

function GrowthSelector({ value, setValue, options }) {
  return (
    <div className="growth-segmented">
      {options.map(([optionValue, label]) => (
        <button
          type="button"
          className={value === optionValue ? 'selected' : ''}
          onClick={() => setValue(optionValue)}
          key={optionValue}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function GrowthLineChart({ points, min, range, metric, label }) {
  const width = Math.max(680, points.length * 108)
  const x = (index) => (points.length <= 1 ? width / 2 : 58 + (index * (width - 116)) / (points.length - 1))
  const y = (value) => (points.length <= 1 ? 148 : 214 - ((value - min) / range) * 142)
  const path = points.map((point, index) => `${x(index)},${y(point.value)}`).join(' ')
  return (
    <div className="growth-line-chart" aria-label={`${label} 선 성장 그래프`}>
      <svg viewBox={`0 0 ${width} 285`} style={{ width: `${width}px` }} role="img">
        <polyline points={path} />
        {points.map((point, index) => (
          <g key={`${point.fetchedAt || 'current'}-${index}`}>
            <circle cx={x(index)} cy={y(point.value)} r="6">
              <title>
                {formatGrowthValue(point.value, metric)} ·{' '}
                {point.fetchedAt ? new Date(point.fetchedAt).toLocaleString('ko-KR') : '현재'}
              </title>
            </circle>
            <text className="growth-line-value" x={x(index)} y={Math.max(20, y(point.value) - 13)}>
              {formatGrowthValue(point.value, metric)}
            </text>
            <text className="growth-line-date" x={x(index)} y="267">
              {growthDate(point.fetchedAt)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function growthDate(value) {
  return value
    ? new Date(value).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    : '현재'
}

function formatGrowthValue(value, metric) {
  if (!Number.isFinite(value)) return '-'
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: metric === 'itemLevel' ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

function compactGrowthPoints(points, scale) {
  if (points.length <= 1) return points
  const compacted = [points[0]]
  let previousValue = points[0].value
  let stableBucket = growthBucket(points[0].fetchedAt, scale)

  points.slice(1).forEach((point) => {
    const changed = point.value !== previousValue
    const bucket = growthBucket(point.fetchedAt, scale)
    if (changed || bucket !== stableBucket) {
      compacted.push(point)
      stableBucket = bucket
    }
    previousValue = point.value
  })
  return compacted
}

function growthBucket(value, scale) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return String(value || '')
  date.setHours(0, 0, 0, 0)
  if (scale === 'week') {
    const mondayOffset = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - mondayOffset)
  }
  if (scale === 'month') return `${date.getFullYear()}-${date.getMonth()}`
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function CollectibleTab({ collectibles }) {
  return (
    <section className="result-panel tab-page">
      <PanelTitle title="수집형 포인트" sub="원정대에 귀속된 수집 현황" />
      {collectibles.length ? (
        <div className="collectible-grid">
          {collectibles.map((item) => {
            const percent = Math.min(100, Math.round((item.Point / item.MaxPoint) * 100))
            return (
              <article key={item.Type}>
                <div>
                  <span>{item.Type}</span>
                  <b>{percent}%</b>
                </div>
                <strong>
                  {item.Point} <small>/ {item.MaxPoint}</small>
                </strong>
                <div className="progress">
                  <i style={{ width: `${percent}%` }} />
                </div>
                <p>
                  {
                    (item.CollectiblePoints || []).filter((point) => point.Point <= item.Point)
                      .length
                  }
                  개 보상 달성
                </p>
              </article>
            )
          })}
        </div>
      ) : (
        <Empty text="수집형 포인트 정보가 없습니다." icon={Grid3X3} />
      )}
    </section>
  )
}

function ExpeditionTab({
  siblings,
  servers,
  server,
  setServer,
  onSearch,
  onRefresh,
  refreshing,
  refreshCooldownUntil,
  error,
}) {
  return (
    <section className="result-panel tab-page">
      <div className="result-title">
        <div>
          <h3>원정대 캐릭터</h3>
          <span>같은 원정대에 소속된 캐릭터</span>
        </div>
        <div className="expedition-tab-actions">
          <RosterRefreshButton
            onRefresh={onRefresh}
            refreshing={refreshing}
            refreshCooldownUntil={refreshCooldownUntil}
          />
          <div className="server-select">
            <select value={server} onChange={(e) => setServer(e.target.value)}>
              {servers.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </div>
      </div>
      {error && <p className="expedition-refresh-error">{error}</p>}
      <div className="sibling-grid expedition-grid">
        {[...siblings]
          .sort((a, b) => numberLevel(b.ItemAvgLevel) - numberLevel(a.ItemAvgLevel))
          .map((item, i) => (
            <button
              onClick={() => onSearch(item.CharacterName)}
              key={`${item.ServerName}-${item.CharacterName}-${i}`}
            >
              <span className="sibling-avatar">
                {item.CharacterImage ? (
                  <img loading="lazy" src={item.CharacterImage} alt="" />
                ) : (
                  item.CharacterClassName?.[0]
                )}
              </span>
              <div>
                <strong>{item.CharacterName}</strong>
                <small>
                  {item.ServerName} · Lv.{item.CharacterLevel} {item.CharacterClassName}
                </small>
              </div>
              <b>Lv. {item.ItemAvgLevel || '-'}</b>
            </button>
          ))}
      </div>
    </section>
  )
}

// Owns its own 1s cooldown timer (via useCooldownSeconds) so only this button re-renders
// each second, instead of the roster refresh cooldown driving a re-render of the whole
// character page.
function RosterRefreshButton({ onRefresh, refreshing, refreshCooldownUntil }) {
  const refreshCooldown = useCooldownSeconds(refreshCooldownUntil)
  return (
    <button type="button" onClick={onRefresh} disabled={refreshing || refreshCooldown > 0}>
      <RefreshCw className={refreshing ? 'spin' : ''} />
      {refreshing
        ? '원정대 갱신 중'
        : refreshCooldown > 0
          ? `${refreshCooldown}초 후 갱신`
          : '원정대 전체 갱신'}
    </button>
  )
}

function PanelTitle({ title, sub, count }) {
  return (
    <div className="result-title">
      <div>
        <h3>{title}</h3>
        {sub && <span>{sub}</span>}
      </div>
      {count !== undefined && <b>{count}</b>}
    </div>
  )
}
function Empty({ text, icon: Icon }) {
  return (
    <div className="result-empty small">
      <Icon />
      <p>{text}</p>
    </div>
  )
}
