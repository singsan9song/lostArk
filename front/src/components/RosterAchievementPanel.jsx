import { Activity, Info, Layers3 } from 'lucide-react'

export default function RosterAchievementPanel({ discoveries, stats }) {
  const found = discoveries || { titles: [], cardSets: [] }
  return (
    <aside className="roster-achievements">
      <section className="collection-box">
        <header>
          <span>확인된 카드 세트</span>
          <Info title="누가 검색했는지와 관계없이 이 원정대에서 확인된 장착 이력입니다." />
        </header>
        {found.cardSets.length ? (
          <div className="collection-chips">
            {found.cardSets.slice(0, 6).map((name, index) => (
              <div title={name} key={name}>
                <i className={`card-symbol symbol-${index}`}>
                  <Layers3 />
                </i>
                <span>{name.replace(/\s*\d+세트.*/, '')}</span>
              </div>
            ))}
          </div>
        ) : (
          <CollectionEmpty text="다른 원정대 캐릭터를 검색하면 공용 이력이 누적됩니다." />
        )}
      </section>
      <section className="battle-panel stat-board">
        <div className="battle-heading">
          <div>
            <Activity />
            <h2>기본 및 전투 특성</h2>
          </div>
        </div>
        <div className="basic-stats">
          <div>
            <span>공격력</span>
            <strong>{stats?.['공격력'] || '-'}</strong>
          </div>
          <div>
            <span>최대 생명력</span>
            <strong>{stats?.['최대 생명력'] || '-'}</strong>
          </div>
        </div>
        <div className="combat-stats">
          {['치명', '특화', '신속', '제압', '인내', '숙련'].map((name) => (
            <div key={name}>
              <span>{name}</span>
              <strong>{stats?.[name] || 0}</strong>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}

function CollectionEmpty({ text }) {
  return (
    <div className="collection-empty">
      <span>{text}</span>
    </div>
  )
}
