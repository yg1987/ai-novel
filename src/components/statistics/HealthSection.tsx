import { useState, useEffect, useCallback } from 'react'
import { getForeshadowHealthMetrics, getReviewSummary } from '../../services/statsService'
import type { ForeshadowHealthMetrics, ReviewScoreSummary } from '../../services/statsService'
import StatsCards from './StatsCards'

interface Props {
  projectId: string
  days: number
}

export default function HealthSection({ projectId }: Props) {
  const [health, setHealth] = useState<ForeshadowHealthMetrics | null>(null)
  const [reviews, setReviews] = useState<ReviewScoreSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [h, r] = await Promise.all([
        getForeshadowHealthMetrics(projectId),
        getReviewSummary(projectId),
      ])
      setHealth(h)
      setReviews(r)
    } catch (e) {
      console.error('Failed to load health metrics:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load().catch(console.error) }, [load])

  if (loading) return <div className="section-placeholder">加载中…</div>
  if (!health) return <div className="section-placeholder">暂无数据</div>

  const recoveryRate = health.total > 0 ? Math.round((health.resolved / health.total) * 100) : 0

  const cards = [
    {
      label: '伏笔总数',
      value: `${health.total}`,
      subtitle: `已回收 ${health.resolved}`,
    },
    {
      label: '回收率',
      value: `${recoveryRate}%`,
      subtitle: `${health.resolved} / ${health.total}`,
    },
    {
      label: '活跃伏笔',
      value: `${health.active}`,
      subtitle: `待回收`,
    },
    {
      label: '健康评分',
      value: `${health.healthScore}/100`,
      subtitle: health.healthLabel,
    },
  ]

  const densityStatus =
    health.density > 0.3
      ? '⚠️ 偏高'
      : health.totalChapters > 20 && health.density < 0.05
        ? '📉 偏低'
        : '✅ 正常'

  const extraCards = [
    {
      label: '伏笔密度',
      value: `${health.density.toFixed(2)}/章`,
      subtitle: `${health.unresolved} 活跃 / ${health.totalChapters} 章 ${densityStatus}`,
    },
    ...(reviews
      ? [
          {
            label: '审查章节',
            value: `${reviews.chaptersWithReviews}`,
            subtitle: `共 ${reviews.totalIssues} 个问题`,
          },
        ]
      : []),
  ]

  return (
    <div className="stats-section">
      <StatsCards cards={cards} />

      {/* Health score bar */}
      <div className="stats-chart-section">
        <h4 className="stats-chart-title">伏笔健康度</h4>
        <div className="health-bar-container">
          <div className="health-bar">
            <div
              className="health-bar-fill"
              style={{ width: `${health.healthScore}%` }}
            />
          </div>
          <div className="health-bar-label">{health.healthLabel}</div>
        </div>
      </div>

      {/* Density + review info */}
      <div className="stats-chart-section">
        <div className="stats-cards">
          {extraCards.map((card, i) => (
            <div key={i} className="stats-card">
              <div className="stats-card-label">{card.label}</div>
              <div className="stats-card-value">{card.value}</div>
              {card.subtitle && <div className="stats-card-subtitle">{card.subtitle}</div>}
            </div>
          ))}
        </div>
      </div>

      {health.total === 0 && (
        <div className="section-placeholder" style={{ paddingTop: 0 }}>
          还没有伏笔数据，在伏笔面板添加一些伏笔吧
        </div>
      )}
    </div>
  )
}
