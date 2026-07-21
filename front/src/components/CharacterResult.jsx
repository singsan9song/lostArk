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
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import ProfileHero from './ProfileHero'
import BattleOverview from './BattleOverview'
import AvatarOverview from './AvatarOverview'
import SkillOverview from './SkillOverview'
import RosterAchievementPanel from './RosterAchievementPanel'
import { cleanApiText } from '../lib/text'
import { getEngravingIcon } from '../lib/engravingIcons'

const tabs = [
  ['overview', '전투정보', Swords],
  ['avatar', '아바타', Palette],
  ['skill', '스킬', Sparkles],
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

export default function CharacterResult({ data, onSiblingSearch }) {
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
  const skills = (armory.ArmorySkills || []).filter((skill) => skill.Level > 1 || skill.Rune)
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
        <ProfileHero profile={profile} siblings={siblings} />
        <RosterAchievementPanel discoveries={data.discoveries} />
      </div>

      <nav className="result-tabs">
        {tabs.map(([id, label, Icon]) => (
          <button className={tab === id ? 'active' : ''} onClick={() => selectTab(id)} key={id}>
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <BattleOverview armory={armory} profile={profile} stats={stats} />}
      {tab === 'avatar' && <AvatarOverview profile={profile} avatars={avatars} />}
      {tab === 'skill' && <SkillOverview profile={profile} skills={skills} armory={armory} />}
      {tab === 'history' && <HistoryTab profile={profile} fetchedAt={data.fetchedAt} />}
      {tab === 'collectible' && <CollectibleTab collectibles={collectibles} />}
      {tab === 'expedition' && (
        <ExpeditionTab
          siblings={visibleSiblings}
          servers={servers}
          server={server}
          setServer={setServer}
          onSearch={onSiblingSearch}
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
                <img src={item.Icon} alt="" />
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
                    {icon ? <img src={icon} alt={`${item.Name} 각인`} /> : <Layers3 />}
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
                    <img src={item.Icon} alt="" />
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
                  <img src={item.Icon} title={item.Name} alt={item.Name} key={i} />
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
                {item ? <img src={item.Icon} alt="" /> : <Box />}
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
                <img src={skill.Icon} alt="" />
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
                  <img src={skill.Rune.Icon} alt="" />
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

function HistoryTab({ profile, fetchedAt }) {
  return (
    <section className="result-panel tab-page history-page">
      <PanelTitle title="성장 기록" sub="캐릭터의 아이템 레벨 변화" />
      <div className="history-placeholder">
        <div className="chart-fake">
          <span style={{ height: '28%' }} />
          <span style={{ height: '35%' }} />
          <span style={{ height: '42%' }} />
          <span style={{ height: '55%' }} />
          <span style={{ height: '63%' }} />
          <span style={{ height: '82%' }} />
          <span style={{ height: '92%' }} />
        </div>
        <Clock3 />
        <h3>오늘부터 성장 기록을 수집합니다</h3>
        <p>
          공식 API는 과거 이력을 제공하지 않습니다. 검색 시점의 아이템 레벨을 저장하면
          <br />
          추후 이곳에서 {profile.CharacterName}님의 성장 그래프를 확인할 수 있습니다.
        </p>
        <div>
          <span>현재 아이템 레벨</span>
          <strong>{profile.ItemAvgLevel}</strong>
          <small>{fetchedAt ? new Date(fetchedAt).toLocaleString('ko-KR') : '방금 전'} 기준</small>
        </div>
      </div>
    </section>
  )
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

function ExpeditionTab({ siblings, servers, server, setServer, onSearch }) {
  return (
    <section className="result-panel tab-page">
      <div className="result-title">
        <div>
          <h3>원정대 캐릭터</h3>
          <span>같은 원정대에 소속된 캐릭터</span>
        </div>
        <div className="server-select">
          <select value={server} onChange={(e) => setServer(e.target.value)}>
            {servers.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <ChevronDown />
        </div>
      </div>
      <div className="sibling-grid expedition-grid">
        {[...siblings]
          .sort((a, b) => numberLevel(b.ItemAvgLevel) - numberLevel(a.ItemAvgLevel))
          .map((item, i) => (
            <button
              onClick={() => onSearch(item.CharacterName)}
              key={`${item.ServerName}-${item.CharacterName}-${i}`}
            >
              <span className="sibling-avatar">{item.CharacterClassName?.[0]}</span>
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
