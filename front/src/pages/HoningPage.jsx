import {
  Anvil,
  Calculator,
  ChartNoAxesCombined,
  Coins,
  FlaskConical,
  Gauge,
  PackagePlus,
  Route,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import FeatureLandingPage from '../components/FeatureLandingPage'
import HoningOptimizerPage from './HoningOptimizerPage'

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
  special: {
    title: '특수 재련 효율',
    description: '특수 재련 재료의 시세와 성공 기대값을 일반 재련 비용과 비교합니다.',
    items: [
      [Sparkles, '특수 재료 선택', '사용할 특수 재련 돌파석과 적용 장비를 선택합니다.'],
      [Gauge, '성공 기대값', '단계별 성공 확률을 반영해 기대 비용을 계산합니다.'],
      [ChartNoAxesCombined, '일반 재련 비교', '같은 단계의 일반 재련 대비 절약 가치를 확인합니다.'],
    ],
  },
  support: {
    title: '보조 재련 효율',
    description: '숨결과 재련 보조 재료를 얼마나 사용하는 것이 유리한지 시세 기준으로 계산합니다.',
    items: [
      [PackagePlus, '보조 재료 구성', '용암·빙하의 숨결 등 사용할 재료 수량을 설정합니다.'],
      [FlaskConical, '확률 증가 계산', '추가 성공 확률과 장인의 기운 증가량을 반영합니다.'],
      [TrendingUp, '투입 효율 비교', '재료를 넣지 않은 경우와 단계별 비용 효율을 비교합니다.'],
    ],
  },
}

export default function HoningPage({ mode = 'optimizer' }) {
  if (mode === 'optimizer') return <HoningOptimizerPage />
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
