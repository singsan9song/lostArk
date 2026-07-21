import { Boxes, CalendarHeart, PackageOpen, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { efficiencyToolTabs } from '../lib/toolNavigation'

const configs = {
  mari: {
    path: '/mari-shop',
    icon: ShoppingBag,
    eyebrow: 'MARI SHOP',
    title: '마리의 비밀 상점 효율',
    description: '마리 상점 판매가와 상품의 거래소 가치를 비교합니다.',
  },
  event: {
    path: '/event-shop',
    icon: CalendarHeart,
    eyebrow: 'EVENT SHOP',
    title: '이벤트 상점 효율',
    description: '이벤트 재화로 교환할 수 있는 상품의 효율을 비교합니다.',
  },
  other: {
    path: '/other-efficiency',
    icon: Boxes,
    eyebrow: 'OTHER EFFICIENCY',
    title: '기타 효율',
    description: '분류되지 않은 다양한 교환 및 구매 효율을 비교합니다.',
  },
}

export default function ToolPlaceholderPage({ type }) {
  const config = configs[type]
  const Icon = config.icon

  return (
    <div className="efficiency-page placeholder-efficiency-page">
      <nav className="efficiency-tabs">
        {efficiencyToolTabs.map(([path, label]) => (
          <Link className={path === config.path ? 'active' : ''} to={path} key={path}>
            {label}
          </Link>
        ))}
      </nav>
      <header className="efficiency-hero placeholder-efficiency-hero">
        <div className="efficiency-hero-icon">
          <Icon />
        </div>
        <div>
          <p>{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <span>{config.description}</span>
        </div>
      </header>
      <section className="panel placeholder-efficiency-content">
        <span>
          <PackageOpen />
        </span>
        <h2>페이지 준비 중</h2>
        <p>
          페이지 연결이 완료되었습니다. 상품 데이터가 준비되면 계산 기능이 이 영역에 추가됩니다.
        </p>
      </section>
    </div>
  )
}
