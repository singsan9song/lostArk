import { useMemo, useState } from 'react'
import {
  Anvil,
  ChevronDown,
  ChevronUp,
  Coins,
  Gem,
  Layers3,
  PackageOpen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { GoldAmount } from '../components/GoldIcon'
import '../honing-optimizer.css'

const equipment = [
  { id: 'helmet', name: '투구' },
  { id: 'shoulder', name: '어깨' },
  { id: 'chest', name: '상의' },
  { id: 'pants', name: '하의' },
  { id: 'gloves', name: '장갑' },
  { id: 'weapon', name: '무기' },
]

const stages = Array.from({ length: 26 }, (_, index) => index)
const initialSettings = Object.fromEntries(equipment.map(item => [item.id, {
  current: 10,
  target: item.id === 'chest' ? 12 : 10,
}]))

const materialDefinitions = [
  { name: '누적 골드', quantity: 42638, value: 42638, Icon: Coins },
  { name: '수호석 결정', quantity: 16550, value: 16550, Icon: ShieldCheck },
  { name: '융화 재료', quantity: 186, value: 2599, Icon: PackageOpen },
  { name: '상급 아비도스', quantity: 199, value: 30828, Icon: Gem },
  { name: '운명의 파편', quantity: 169382, value: 9316, Icon: Sparkles },
]

const artisanEnergy = [0, 4.7, 9.8, 15.4, 21.6, 28.4, 35.8, 43.9]
const number = value => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })

function StageSelect({ value, onChange, allowEmpty = false, label }) {
  return (
    <label className="honing-stage-field">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))}>
        {allowEmpty && <option value="">—</option>}
        {stages.map(stage => <option key={stage} value={stage}>{stage}강</option>)}
      </select>
    </label>
  )
}

export default function HoningOptimizerPage() {
  const [advanced, setAdvanced] = useState(false)
  const [useFlame, setUseFlame] = useState(false)
  const [useThrill, setUseThrill] = useState(true)
  const [bulkCurrent, setBulkCurrent] = useState(10)
  const [bulkTarget, setBulkTarget] = useState('')
  const [draft, setDraft] = useState(initialSettings)
  const [calculated, setCalculated] = useState(initialSettings)
  const [activeEquipment, setActiveEquipment] = useState('chest')
  const [activeSegment, setActiveSegment] = useState(10)
  const [overallOpen, setOverallOpen] = useState(true)

  const resultItems = useMemo(() => equipment.filter(item => {
    const setting = calculated[item.id]
    return setting.target > setting.current
  }), [calculated])

  const selectedItem = resultItems.find(item => item.id === activeEquipment) || resultItems[0] || equipment[2]
  const selectedSetting = calculated[selectedItem.id]
  const stepCount = Math.max(1, selectedSetting.target - selectedSetting.current)
  const scale = stepCount / 2
  const estimatedLevel = 1660 + equipment.reduce((sum, item) => sum + calculated[item.id].target, 0) / equipment.length * 6.666

  const updateSetting = (id, key, value) => {
    setDraft(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } }))
  }

  const applyBulk = (key, value) => {
    if (key === 'current') setBulkCurrent(value)
    else setBulkTarget(value)
    if (value === '') return
    setDraft(previous => Object.fromEntries(equipment.map(item => [item.id, {
      ...previous[item.id],
      [key]: value,
    }])))
  }

  const calculate = () => {
    const normalized = Object.fromEntries(equipment.map(item => {
      const setting = draft[item.id]
      return [item.id, { ...setting, target: Math.max(setting.current, setting.target) }]
    }))
    const firstChanged = equipment.find(item => normalized[item.id].target > normalized[item.id].current)
    setCalculated(normalized)
    if (firstChanged) {
      setActiveEquipment(firstChanged.id)
      setActiveSegment(normalized[firstChanged.id].current)
    }
  }

  return (
    <main className="honing-optimizer-page page-content">
      <header className="honing-optimizer-heading panel">
        <span><Anvil /></span>
        <div>
          <small>HONING OPTIMIZER</small>
          <h1>재련 최적화</h1>
          <p>장비별 목표 단계를 설정하고 예상 재료와 재련 경로를 비교합니다.</p>
        </div>
      </header>

      <div className="honing-optimizer-layout">
        <aside className="honing-settings panel">
          <header>
            <div>
              <small>장비 설정</small>
              <h2>장비 목표 설정</h2>
            </div>
            <label className="honing-switch">
              <span>상급 재련</span>
              <input type="checkbox" checked={advanced} onChange={event => setAdvanced(event.target.checked)} />
              <i />
            </label>
          </header>

          <div className="honing-material-options">
            <label><input type="checkbox" checked={useFlame} onChange={event => setUseFlame(event.target.checked)} /> 운명의 업화</label>
            <label><input type="checkbox" checked={useThrill} onChange={event => setUseThrill(event.target.checked)} /> 운명의 전율</label>
          </div>

          <div className="honing-setting-list">
            <div className="honing-setting-row bulk">
              <strong>일괄</strong>
              <StageSelect label="현재" value={bulkCurrent} onChange={value => applyBulk('current', value)} />
              <StageSelect label="목표" value={bulkTarget} allowEmpty onChange={value => applyBulk('target', value)} />
            </div>
            {equipment.map(item => (
              <div className="honing-setting-row" key={item.id}>
                <strong>{item.name}</strong>
                <StageSelect label="현재" value={draft[item.id].current} onChange={value => updateSetting(item.id, 'current', value)} />
                <StageSelect label="목표" value={draft[item.id].target} onChange={value => updateSetting(item.id, 'target', value)} />
              </div>
            ))}
          </div>

          <div className="honing-estimated-level">
            <span>예상 아이템 레벨</span>
            <strong>{estimatedLevel.toFixed(2)}</strong>
          </div>
          <button className="honing-calculate" type="button" onClick={calculate}><Anvil /> 계산</button>
        </aside>

        <section className="honing-results">
          <button className="honing-overall panel" type="button" onClick={() => setOverallOpen(value => !value)}>
            <span><Layers3 /> 전체 계산 결과</span>
            <strong>{resultItems.length}개 장비</strong>
            {overallOpen ? <ChevronUp /> : <ChevronDown />}
          </button>

          <div className={`honing-overall-body panel ${overallOpen ? 'open' : ''}`}>
            {resultItems.length ? resultItems.map(item => (
              <button
                type="button"
                key={item.id}
                className={selectedItem.id === item.id ? 'active' : ''}
                onClick={() => {
                  setActiveEquipment(item.id)
                  setActiveSegment(calculated[item.id].current)
                }}
              >
                <span>{item.name}</span>
                <b>{calculated[item.id].current}강 → {calculated[item.id].target}강</b>
              </button>
            )) : <p>목표 단계가 현재 단계보다 높은 장비를 설정해 주세요.</p>}
          </div>

          <article className="honing-result-card panel">
            <header className="honing-result-title">
              <span>{selectedItem.name}</span>
              <div>
                <small>선택 장비</small>
                <h2>{selectedItem.name} {selectedSetting.current}강 → {selectedSetting.target}강</h2>
              </div>
              <em>계산 미리보기</em>
            </header>

            <div className="honing-average-cost">
              <div>
                <small>평균 비용</small>
                <strong><GoldAmount>{number(101930 * scale)}</GoldAmount></strong>
                <span><i className="silver-dot" /> {number(238666 * scale)}</span>
              </div>
              <p>현재 시세와 실제 재련 확률 데이터는 다음 단계에서 연결할 수 있습니다.</p>
            </div>

            <div className="honing-material-grid">
              {materialDefinitions.map(({ name, quantity, value, Icon }) => (
                <div key={name}>
                  <i><Icon /></i>
                  <span><small>{name}</small><b>{number(quantity * scale)}{name === '누적 골드' ? '' : '개'}</b></span>
                  <strong><GoldAmount>{number(value * scale)}</GoldAmount></strong>
                </div>
              ))}
            </div>

            <div className="honing-segments" role="tablist" aria-label="재련 구간">
              {Array.from({ length: stepCount }, (_, index) => selectedSetting.current + index).map(stage => (
                <button type="button" key={stage} className={activeSegment === stage ? 'active' : ''} onClick={() => setActiveSegment(stage)}>
                  {stage}강 → {stage + 1}강
                </button>
              ))}
            </div>

            <section className="honing-route">
              <header>
                <div><RouteIcon /><h3>최적 루트</h3></div>
                <div className="honing-route-summary">
                  <span><small>평균 시도 횟수</small><b>7회</b></span>
                  <span><small>평균 비용</small><b><GoldAmount>35,959</GoldAmount></b><em><i className="silver-dot" /> 87,622</em></span>
                  <span><small>장기백 비용</small><b><GoldAmount>81,257</GoldAmount></b><em><i className="silver-dot" /> 198,000</em></span>
                </div>
              </header>

              <div className="honing-attempt-table">
                <div className="honing-attempt-head">
                  <span>시도</span><span>기본 성공 확률</span><span>보조 재료</span><span>최종 성공 확률</span><span>장인의 기운</span><span>시도 비용</span>
                </div>
                {artisanEnergy.map((energy, index) => (
                  <div className="honing-attempt-row" key={index}>
                    <span>{index + 1}회</span>
                    <span>{10 + index}%</span>
                    <strong>미사용</strong>
                    <span>{10 + index}%</span>
                    <span>{energy}%</span>
                    <span><GoldAmount>5,417</GoldAmount></span>
                  </div>
                ))}
              </div>
            </section>
          </article>
        </section>
      </div>
    </main>
  )
}

function RouteIcon() {
  return <i className="honing-route-icon"><Anvil /></i>
}
