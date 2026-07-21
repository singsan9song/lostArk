export default function CrystalIcon({ className = '' }) {
  return (
    <img
      className={`currency-crystal-icon ${className}`.trim()}
      src="/images/rewards/cristal.PNG"
      alt="크리스탈"
      style={{
        width: 16,
        height: 16,
        display: 'inline-block',
        flex: '0 0 auto',
        objectFit: 'contain',
        verticalAlign: '-3px',
      }}
    />
  )
}
