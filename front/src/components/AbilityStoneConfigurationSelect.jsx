import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { GoldAmount } from './GoldIcon'
import '../ability-stone-choice.css'

const formatGold = value => Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const OPEN_EVENT = 'loark:ability-stone-choice-open'
const KIT_IMAGE = '/images/rewards/use_13_225.png'

export default function AbilityStoneConfigurationSelect({ data, loading, selectedId, onSelect, label = '가격 조합' }) {
  const configurations = data?.configurations || []
  const selected = configurations.find(configuration => configuration.id === selectedId)
    || configurations.find(configuration => configuration.id === data?.selectedConfigurationId)
    || configurations[0]
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const instanceId = useId()

  useEffect(() => {
    const closeFromOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOtherChoice = event => {
      if (event.detail !== instanceId) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    window.addEventListener(OPEN_EVENT, closeOtherChoice)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside)
      window.removeEventListener(OPEN_EVENT, closeOtherChoice)
    }
  }, [instanceId])

  const toggle = () => {
    if (loading || !configurations.length) return
    setOpen(current => {
      const next = !current
      if (next) window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: instanceId }))
      return next
    })
  }

  const choose = configuration => {
    onSelect(configuration.id)
    setOpen(false)
  }

  return <div className={`ability-stone-choice ${open ? 'expanded' : ''}`} ref={rootRef}>
    <button className="ability-stone-choice-current" type="button" aria-expanded={open} onClick={toggle} disabled={loading || !configurations.length}>
      <img src={KIT_IMAGE} alt="" />
      <span>
        <small>{label}</small>
        <b>{loading ? '조회 중' : selected?.name || '가격 없음'}</b>
      </span>
      {selected && <em>선택됨</em>}
      <strong>{loading || !selected ? '--' : <GoldAmount>{formatGold(selected.currentMinPrice)}</GoldAmount>}</strong>
      <ChevronDown />
    </button>
    <div className="ability-stone-choice-motion" aria-hidden={!open}>
      <div>
        <section className="ability-stone-choice-options" aria-label="어빌리티 스톤 가격 조합 선택">
          {configurations.map(configuration => {
            const active = configuration.id === selected?.id
            return <button type="button" className={active ? 'selected' : ''} onClick={() => choose(configuration)} key={configuration.id}>
              <img src={KIT_IMAGE} alt="" />
              <span>
                <b>{configuration.name}</b>
                <small>{(configuration.engravings || []).join(' + ')} · {configuration.penalty}</small>
              </span>
              {active && <em><Check />선택됨</em>}
              <strong><GoldAmount>{formatGold(configuration.currentMinPrice)}</GoldAmount></strong>
            </button>
          })}
        </section>
      </div>
    </div>
  </div>
}
