import { Fragment } from 'react'
import { createPortal } from 'react-dom'
import { toSafeHtml } from '../lib/lostArkHtml'
import { parseTooltip } from '../lib/lostArkTooltip'

// Matches the real game-tooltip-item's [data-grade] numbering (extracted from
// the live DOM: 고대 머리 방어구 renders data-grade="6").
const gradeDataNumber = {
  일반: 0,
  고급: 1,
  희귀: 2,
  영웅: 3,
  전설: 4,
  유물: 5,
  고대: 6,
}

// Real quality breakpoints, confirmed from the live CSS (qualityValue.q0-q6):
// 0-29 orange, 30-59 gold, 60-69 green, 70-89 blue, 90-99 purple, 100 amber.
function qualityBucket(quality) {
  if (quality >= 100) return 6
  if (quality >= 90) return 5
  if (quality >= 70) return 4
  if (quality >= 60) return 3
  if (quality >= 30) return 2
  return 1
}

const TOOLTIP_MARGIN = 16
const TOOLTIP_GAP = 10

export default function ItemTooltip({ item, left: itemLeft, right: itemRight, top: itemTop }) {
  if (!item?.Tooltip) return null
  const nodes = parseTooltip(item.Tooltip)
  if (!nodes.length) return null
  const isSkill = nodes.some((node) => node.type === 'CommonSkillTitle')

  const width = 342
  // Anchored to the icon (not the cursor) and fixed once shown, floating just
  // to its right — flips to the left side when there isn't room.
  const fitsOnRight = itemRight + TOOLTIP_GAP + width <= window.innerWidth - TOOLTIP_MARGIN
  const left = fitsOnRight
    ? itemRight + TOOLTIP_GAP
    : Math.max(TOOLTIP_MARGIN, itemLeft - TOOLTIP_GAP - width)
  const top = Math.min(Math.max(TOOLTIP_MARGIN, itemTop), window.innerHeight - TOOLTIP_MARGIN)

  return createPortal(
    <div
      className={`game-tooltip ${isSkill ? 'game-tooltip-skill' : 'game-tooltip-item'}`}
      data-grade={isSkill ? undefined : (gradeDataNumber[item.Grade] ?? '')}
      style={{ left, top, width }}
    >
      {nodes.map((node) => (
        <TooltipNode node={node} key={node.key} />
      ))}
    </div>,
    document.body,
  )
}

function TooltipNode({ node }) {
  switch (node.type) {
    case 'NameTagBox':
      return <div className="NameTagBox" dangerouslySetInnerHTML={{ __html: toSafeHtml(node.value) }} />
    case 'ItemTitle':
      return <ItemTitleNode value={node.value} />
    case 'CommonSkillTitle':
      return <CommonSkillTitleNode value={node.value} />
    case 'TripodSkillCustom':
      return <TripodSkillCustomNode value={node.value} />
    case 'SingleTextBox':
      return html(node.value) ? (
        <div className="SingleTextBox" dangerouslySetInnerHTML={{ __html: toSafeHtml(node.value) }} />
      ) : null
    case 'MultiTextBox':
      return <PipeSpans className="MultiTextBox" value={node.value} />
    case 'ItemPartBox':
      return <ItemPartBoxNode value={node.value} />
    case 'Progress':
      return <ProgressNode value={node.value} />
    case 'IndentStringGroup':
      return <IndentGroup value={node.value} />
    case 'ShowMeTheMoney':
      return <PipeSpans className="ShowMeTheMoney" value={node.value} />
    default:
      return <FallbackNode value={node.value} />
  }
}

function html(value) {
  return typeof value === 'string' && value.trim().length > 0
}

// The real DOM always renders every '|'-separated segment as its own <span>,
// including the empty ones (MultiTextBox's leading span, ShowMeTheMoney's
// trailing one) — so we don't filter anything out here.
function PipeSpans({ className, value }) {
  const parts = String(value ?? '').split('|')
  return (
    <div className={className}>
      {parts.map((part, index) => (
        <span key={index} dangerouslySetInnerHTML={{ __html: toSafeHtml(part) }} />
      ))}
    </div>
  )
}

function ItemTitleNode({ value }) {
  if (!value) return null
  const quality = value.qualityValue
  const showQuality = Number.isFinite(quality) && quality >= 0
  const bucket = showQuality ? qualityBucket(quality) : null
  return (
    <div className="ItemTitle">
      {value.slotData?.iconPath && (
        <span
          className="slotData"
          data-grade={value.slotData.iconGrade}
          data-pet-border={value.slotData.petBorder ?? 0}
        >
          <img src={value.slotData.iconPath} alt="" />
        </span>
      )}
      {html(value.leftStr0) && (
        <span className="leftStr0" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.leftStr0) }} />
      )}
      {html(value.rightStr0) && (
        <span className="rightStr0" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.rightStr0) }} />
      )}
      {html(value.leftStr2) && (
        <span className="leftStr2" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.leftStr2) }} />
      )}
      {showQuality && (
        <span className={`qualityValue q${bucket}`}>
          <span className="bar_txt">
            {html(value.leftStr1) && <span dangerouslySetInnerHTML={{ __html: toSafeHtml(value.leftStr1) }} />}{' '}
            {quality}
          </span>
          <span className="bar_wrap">
            <span className="bar" style={{ width: `${quality}%` }} />
          </span>
        </span>
      )}
    </div>
  )
}

function CommonSkillTitleNode({ value }) {
  if (!value) return null
  return (
    <div className="CommonSkillTitle">
      {value.slotData?.iconPath && (
        <span className="slotData" data-grade={value.slotData.iconGrade}>
          <img src={value.slotData.iconPath} alt="" />
        </span>
      )}
      <span className="name" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.name) }} />
      <span className="level" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.level) }} />
      <span className="middleText" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.middleText) }} />
      <span className="leftText" dangerouslySetInnerHTML={{ __html: toSafeHtml(value.leftText) }} />
    </div>
  )
}

function TripodSkillCustomNode({ value }) {
  if (!value) return null
  const tripods = Object.values(value).filter(Boolean)
  if (!tripods.length) return null
  return (
    <div className="TripodSkillCustom">
      {tripods.map((tripod, index) => (
        <div key={index}>
          {tripod.slotData?.iconPath && (
            <span className="slotData" data-grade={tripod.slotData.iconGrade}>
              <img src={tripod.slotData.iconPath} alt="" />
            </span>
          )}
          <span className="name" dangerouslySetInnerHTML={{ __html: toSafeHtml(tripod.name) }} />
          <span className="desc" dangerouslySetInnerHTML={{ __html: toSafeHtml(tripod.desc) }} />
        </div>
      ))}
    </div>
  )
}

function ItemPartBoxNode({ value }) {
  if (!value) return null
  const title = toSafeHtml(value.Element_000)
  const body = toSafeHtml(value.Element_001)
  if (!title && !body) return null
  return <div className="ItemPartBox" dangerouslySetInnerHTML={{ __html: `${title}<br>${body}` }} />
}

function ProgressNode({ value }) {
  if (!value || value.maximum == null) return null
  const current = Number(value.value) || 0
  const maximum = Number(value.maximum) || 0
  const pct = maximum ? Math.min(100, (current / maximum) * 100) : 0
  return (
    <div className="Progress">
      <span dangerouslySetInnerHTML={{ __html: toSafeHtml(value.title) }} />
      <div className="graph">
        <span className="bar" style={{ width: `${pct}%` }} />
        <span className="text">
          {current.toLocaleString('ko-KR')} / {maximum.toLocaleString('ko-KR')}
        </span>
      </div>
    </div>
  )
}

function IndentGroup({ value }) {
  if (!value) return null
  const groups = Object.values(value).filter(Boolean)
  if (!groups.length) return null
  return (
    <div className="IndentStringGroup">
      {groups.map((group, index) => (
        <Fragment key={index}>
          {html(group.topStr) && <span dangerouslySetInnerHTML={{ __html: toSafeHtml(group.topStr) }} />}
          {group.contentStr && (
            <div>
              {Object.values(group.contentStr)
                .filter((line) => html(line?.contentStr))
                .map((line, lineIndex) => (
                  <span
                    key={lineIndex}
                    data-bpoint={line.bPoint ? '' : undefined}
                    dangerouslySetInnerHTML={{ __html: toSafeHtml(line.contentStr) }}
                  />
                ))}
            </div>
          )}
        </Fragment>
      ))}
    </div>
  )
}

function FallbackNode({ value }) {
  if (value == null) return null
  if (html(value)) return <div className="SingleTextBox" dangerouslySetInnerHTML={{ __html: toSafeHtml(value) }} />
  if (typeof value === 'object') {
    const lines = Object.values(value).filter(html)
    if (!lines.length) return null
    return (
      <div className="ItemPartBox">
        {lines.map((line, index) => (
          <div key={index} dangerouslySetInnerHTML={{ __html: toSafeHtml(line) }} />
        ))}
      </div>
    )
  }
  return null
}
