import {
  Anvil,
  Calculator,
  Coins,
  FlaskConical,
  PackagePlus,
  Route,
  TrendingUp,
} from 'lucide-react'
import FeatureLandingPage from '../components/FeatureLandingPage'
import HoningOptimizerPage from './HoningOptimizerPage'
import AdvancedHoningOptimizerPage from './AdvancedHoningOptimizerPage'
import IntegratedHoningOptimizerPage from './IntegratedHoningOptimizerPage'
import SpecialHoningPage from './SpecialHoningPage'

const configs = {
  optimizer: {
    title: '재련 최적화',
    description:
      '목표 아이템 레벨까지 필요한 재료와 골드를 계산하고 가장 효율적인 재련 경로를 찾습니다.',
    items: [
      [Calculator, '목표 장비 설정', '현재 단계와 목표 단계를 기준으로 재련 구간을 설정합니다.'],
      [Coins, '보유 재료 반영', '귀속 및 거래 가능 재료를 나누어 실제 지출 비용에 반영합니다.'],
      [Route, '최적 경로 비교', '장비별 재련 순서와 예상 비용을 비교합니다.'],
    ],
  },
  advanced: {
    title: '상급 재련 최적화',
    description: '상급 재련 단계별 재료와 비용을 비교해 가장 효율적인 성장 경로를 계산합니다.',
    items: [
      [PackagePlus, '상급 재련 구간 설정', '장비 종류와 현재·목표 상급 재련 단계를 설정합니다.'],
      [FlaskConical, '재료 투입 계산', '상급 재련에 필요한 재료와 단계별 기대 비용을 계산합니다.'],
      [TrendingUp, '단계별 효율 비교', '아이템 레벨 상승량 대비 비용이 좋은 구간을 비교합니다.'],
    ],
  },
  integrated: {
    title: '통합 재련 최적화',
    description: '일반 재련과 상급 재련을 함께 비교해 목표 레벨까지의 최적 경로를 찾습니다.',
    items: [
      [Calculator, '통합 목표 설정', '현재 장비 상태와 최종 목표 아이템 레벨을 설정합니다.'],
      [Route, '재련 경로 통합 비교', '일반 재련과 상급 재련의 가능한 성장 순서를 비교합니다.'],
      [Coins, '최종 비용 최적화', '보유 재료와 시세를 반영해 전체 예상 지출을 최소화합니다.'],
    ],
  },
}

export default function HoningPage({ mode = 'optimizer' }) {
  if (mode === 'optimizer') return <HoningOptimizerPage />
  if (mode === 'advanced') return <AdvancedHoningOptimizerPage />
  if (mode === 'integrated') return <IntegratedHoningOptimizerPage />
  if (mode === 'special') return <SpecialHoningPage />
  const config = configs[mode] || configs.optimizer
  return (
    <FeatureLandingPage
      eyebrow="HONING LAB"
      title={config.title}
      description={config.description}
      icon={Anvil}
      items={config.items}
    />
  )
}
