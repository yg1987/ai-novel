export interface StatCard {
  label: string
  value: string
  subtitle?: string
}

interface Props {
  cards: StatCard[]
}

export default function StatsCards({ cards }: Props) {
  return (
    <div className="stats-cards">
      {cards.map((card, i) => (
        <div key={i} className="stats-card">
          <div className="stats-card-label">{card.label}</div>
          <div className="stats-card-value">{card.value}</div>
          {card.subtitle && <div className="stats-card-subtitle">{card.subtitle}</div>}
        </div>
      ))}
    </div>
  )
}
