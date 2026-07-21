import { ArrowRight } from 'lucide-react'
import '../feature-landing.css'

export default function FeatureLandingPage({ eyebrow, title, description, icon: Icon, items }) {
  return <div className="feature-landing-page">
    <header className="panel feature-landing-hero">
      <span className="feature-landing-icon"><Icon /></span>
      <div><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
    </header>
    <section className="panel feature-landing-content">
      <header><div><p>COMING SOON</p><h2>{title} 기능</h2></div><span>기능 준비 중</span></header>
      <div className="feature-landing-grid">{items.map(([ItemIcon, itemTitle, itemDescription]) => <article key={itemTitle}>
        <i><ItemIcon /></i><div><strong>{itemTitle}</strong><p>{itemDescription}</p></div><ArrowRight />
      </article>)}</div>
    </section>
  </div>
}
