import { Award, Info, Layers3 } from 'lucide-react'

export default function RosterAchievementPanel({ discoveries }) {
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
      <section className="collection-box title-box">
        <header>
          <span>확인된 특수 칭호</span>
          <Info title="이 원정대 캐릭터 검색에서 확인된 공용 칭호 이력입니다." />
        </header>
        {found.titles.length ? (
          <div className="title-history">
            {found.titles.slice(-4).map((title) => (
              <span key={title}>
                <Award />
                {title}
              </span>
            ))}
          </div>
        ) : (
          <CollectionEmpty text="아직 확인된 칭호가 없습니다." />
        )}
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
