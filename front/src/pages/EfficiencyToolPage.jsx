import { useMemo, useState } from 'react'
import { Calculator, Coins, Crown, Info, Skull, Sparkles, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

const configs = {
  hell: {
    path: '/hell-reward',
    icon: Skull,
    eyebrow: 'HELL REWARD',
    title: '낙원 보상 효율',
    description: '획득한 보상의 가치와 입장·소모 비용을 비교합니다.',
    fields: [
      ['reward', '획득 보상 가치', '골드'],
      ['entry', '입장 비용', '골드'],
      ['consumable', '소모품 비용', '골드'],
    ],
    calculate: (v) => ({
      net: v.reward - v.entry - v.consumable,
      efficiency: ratio(v.reward, v.entry + v.consumable),
      unit: '골드',
    }),
  },
  single: {
    path: '/single-coin',
    icon: Coins,
    eyebrow: 'CLEAR COIN',
    title: '클리어 코인 효율',
    description: '클리어 코인 교환 보상의 클리어 코인당 가치와 순효율을 확인합니다.',
    fields: [
      ['coins', '필요 코인', '개'],
      ['reward', '교환 보상 가치', '골드'],
      ['cost', '코인 획득 비용', '골드'],
    ],
    calculate: (v) => ({
      net: v.reward - v.cost,
      efficiency: ratio(v.reward, v.cost),
      unit: '골드',
      extra: { label: '클리어 코인당 가치', value: v.coins ? v.reward / v.coins : 0, unit: '골드' },
    }),
  },
  raid: {
    path: '/raid-extra',
    icon: Sparkles,
    eyebrow: 'RAID EXTRA REWARD',
    title: '레이드 더보기 효율',
    description: '레이드 더보기 비용과 추가 획득 보상의 가치를 비교합니다.',
    fields: [
      ['cost', '더보기 비용', '골드'],
      ['material', '재료 가치', '골드'],
      ['bonus', '기타 보상 가치', '골드'],
    ],
    calculate: (v) => ({
      net: v.material + v.bonus - v.cost,
      efficiency: ratio(v.material + v.bonus, v.cost),
      unit: '골드',
    }),
  },
  arkpass: {
    path: '/ark-pass',
    icon: Crown,
    eyebrow: 'ARK PASS',
    title: '아크 패스 효율',
    description: '아크 패스 구매 비용과 획득 가능한 전체 보상의 가치를 비교합니다.',
    fields: [
      ['cost', '아크 패스 구매 비용', '원'],
      ['reward', '기본 보상 가치', '원'],
      ['premium', '프리미엄 추가 보상 가치', '원'],
    ],
    calculate: (v) => ({
      net: v.reward + v.premium - v.cost,
      efficiency: ratio(v.reward + v.premium, v.cost),
      unit: '원',
    }),
  },
}

const tabs = Object.values(configs)
const ratio = (value, cost) => (cost > 0 ? (value / cost) * 100 : 0)
const number = (value) => Number(value) || 0
const format = (value) => Math.round(value).toLocaleString('ko-KR')

export default function EfficiencyToolPage({ type }) {
  const config = configs[type]
  const Icon = config.icon
  const [values, setValues] = useState(() =>
    Object.fromEntries(config.fields.map(([id]) => [id, ''])),
  )
  const result = useMemo(
    () =>
      config.calculate(
        Object.fromEntries(Object.entries(values).map(([key, value]) => [key, number(value)])),
      ),
    [config, values],
  )
  const update = (id, value) =>
    setValues((current) => ({ ...current, [id]: value.replace(/[^0-9.]/g, '') }))

  return (
    <div className="efficiency-page">
      <nav className="efficiency-tabs">
        {tabs.map((tab) => (
          <Link className={tab.path === config.path ? 'active' : ''} to={tab.path} key={tab.path}>
            {tab.title}
          </Link>
        ))}
      </nav>
      <header className="efficiency-hero">
        <div className="efficiency-hero-icon">
          <Icon />
        </div>
        <div>
          <p>{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <span>{config.description}</span>
        </div>
      </header>
      <div className="efficiency-layout">
        <section className="efficiency-form panel">
          <div className="efficiency-heading">
            <div>
              <Calculator />
              <h2>계산 기준 입력</h2>
            </div>
            <button
              onClick={() => setValues(Object.fromEntries(config.fields.map(([id]) => [id, ''])))}
            >
              초기화
            </button>
          </div>
          <div className="efficiency-fields">
            {config.fields.map(([id, label, unit]) => (
              <label key={id}>
                <span>{label}</span>
                <div>
                  <input
                    inputMode="decimal"
                    value={values[id]}
                    onChange={(event) => update(id, event.target.value)}
                    placeholder="0"
                  />
                  <em>{unit}</em>
                </div>
              </label>
            ))}
          </div>
          <p className="efficiency-note">
            <Info /> 현재는 직접 입력한 시세를 기준으로 계산합니다.
          </p>
        </section>
        <aside className={`efficiency-result panel ${result.net >= 0 ? 'positive' : 'negative'}`}>
          <span>예상 순효율</span>
          <strong>
            {result.net > 0 ? '+' : ''}
            {format(result.net)} <small>{result.unit}</small>
          </strong>
          <div>
            <TrendingUp />
            <span>비용 대비 가치</span>
            <b>{result.efficiency.toFixed(1)}%</b>
          </div>
          {result.extra && (
            <div>
              <Coins />
              <span>{result.extra.label}</span>
              <b>
                {format(result.extra.value)} {result.extra.unit}
              </b>
            </div>
          )}
          <p>
            {result.net >= 0
              ? '입력한 시세 기준으로 이득입니다.'
              : '입력한 시세 기준으로 손해입니다.'}
          </p>
        </aside>
      </div>
    </div>
  )
}
