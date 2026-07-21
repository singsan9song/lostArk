export default function GoldIcon({ className = '' }) {
  return (
    <img
      className={`currency-gold-icon ${className}`.trim()}
      src="/images/rewards/gold.PNG"
      alt="골드"
      style={{
        width: '1.15em',
        height: '1.15em',
        minWidth: 17,
        minHeight: 17,
        display: 'inline-block',
        flex: '0 0 auto',
        objectFit: 'contain',
        verticalAlign: '-3px',
      }}
    />
  )
}

export function GoldAmount({ children }) {
  return (
    <span
      className="currency-gold-amount"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'inherit',
        gap: 4,
        whiteSpace: 'nowrap',
        fontSize: 'max(1em, 14px)',
        lineHeight: 1.2,
      }}
    >
      {children}
      <GoldIcon />
    </span>
  )
}
