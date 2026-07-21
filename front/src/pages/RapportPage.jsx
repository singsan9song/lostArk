import { useMemo, useState } from 'react'
import { Gift, Heart, RotateCcw } from 'lucide-react'

const gifts = [
  { id: 'epic', name: '영웅 호감도 아이템', points: 300 },
  { id: 'legendary', name: '전설 호감도 아이템', points: 2000 },
  { id: 'relic', name: '유물 호감도 아이템', points: 10000 },
]
const number = value => Math.max(0, Number(value) || 0)
const format = value => Math.round(value).toLocaleString('ko-KR')

export default function RapportPage() {
  const [current, setCurrent] = useState('')
  const [target, setTarget] = useState('')
  const [counts, setCounts] = useState({ epic: '', legendary: '', relic: '' })
  const result = useMemo(() => {
    const required = Math.max(0, number(target) - number(current))
    const giftPoints = gifts.reduce((sum, gift) => sum + number(counts[gift.id]) * gift.points, 0)
    const remaining = Math.max(0, required - giftPoints)
    return { required, giftPoints, remaining, overflow: Math.max(0, giftPoints - required) }
  }, [current, target, counts])
  const reset = () => { setCurrent(''); setTarget(''); setCounts({ epic: '', legendary: '', relic: '' }) }

  return <div className="rapport-page">
    <header className="rapport-hero"><span><Heart /></span><div><p>RAPPORT CALCULATOR</p><h1>호감도 계산기</h1><small>현재 호감도와 목표 수치를 입력하고 보유한 선물로 얼마나 채울 수 있는지 계산하세요.</small></div></header>
    <div className="rapport-grid">
      <section className="rapport-panel"><header><h2>목표 호감도</h2><button onClick={reset}><RotateCcw /> 초기화</button></header><div className="rapport-target-inputs"><label>현재 호감도<input inputMode="numeric" value={current} onChange={event => setCurrent(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><span>→</span><label>목표 호감도<input inputMode="numeric" value={target} onChange={event => setTarget(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label></div><div className="rapport-required"><span>목표까지 필요한 호감도</span><strong>{format(result.required)}</strong></div></section>
      <section className="rapport-panel"><header><h2>보유 호감도 선물</h2><Gift /></header><div className="rapport-gifts">{gifts.map(gift => <label key={gift.id}><span><b>{gift.name}</b><small>개당 {format(gift.points)}</small></span><input inputMode="numeric" value={counts[gift.id]} onChange={event => setCounts(value => ({ ...value, [gift.id]: event.target.value.replace(/\D/g, '') }))} placeholder="0" /><em>개</em></label>)}</div></section>
      <section className={`rapport-result ${result.remaining === 0 && result.required > 0 ? 'complete' : ''}`}><div><span>선물 호감도 합계</span><strong>{format(result.giftPoints)}</strong></div><div><span>{result.remaining ? '남은 호감도' : '초과 호감도'}</span><strong>{format(result.remaining || result.overflow)}</strong></div><p>{!result.required ? '현재 수치와 목표 수치를 입력해 주세요.' : result.remaining ? `영웅 선물 기준 약 ${Math.ceil(result.remaining / 300).toLocaleString('ko-KR')}개가 더 필요합니다.` : '목표 호감도를 달성할 수 있습니다.'}</p></section>
    </div>
  </div>
}
