import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { getProjectStats } from '../../services/statsService'
import type { ProjectStats } from '../../api/tauri'
import { fmt, fmtDuration } from '../../services/statsService'
import StatsCards from './StatsCards'

interface Props {
  projectId: string
  days: number
}

export default function AIUsageSection({ projectId, days }: Props) {
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = await getProjectStats(projectId, days)
      setStats(ps)
    } catch (e) {
      console.error('Failed to load AI stats:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, days])

  useEffect(() => { load().catch(console.error) }, [load])

  if (loading) return <div className="section-placeholder">加载中…</div>
  if (!stats) return <div className="section-placeholder">暂无数据</div>

  const cards = [
    { label: 'AI 生成次数', value: fmt(stats.total_ai_generations), subtitle: `近 ${days} 天` },
    { label: 'Token 消耗', value: fmt(stats.total_ai_tokens), subtitle: 'output tokens' },
    { label: '平均耗时', value: fmtDuration(stats.avg_ai_duration_ms), subtitle: '每次生成' },
    { label: '最长生成', value: fmtDuration(stats.max_ai_duration_ms), subtitle: '' },
  ]

  // Daily trend data
  const trendData = stats.daily_stats
    .filter((d) => d.ai_generations > 0 || d.ai_tokens > 0)
    .map((d) => ({
      date: d.date.slice(5),
      generations: d.ai_generations,
      tokens: Math.round(d.ai_tokens / 1000), // show in K
    }))

  // Per-day bar chart data
  const barData = stats.daily_stats.map((d) => ({
    date: d.date.slice(5),
    generations: d.ai_generations,
  }))

  return (
    <div className="stats-section">
      <StatsCards cards={cards} />

      {/* Daily generations & tokens */}
      <div className="stats-chart-section">
        <h4 className="stats-chart-title">AI 使用趋势</h4>
        {trendData.length === 0 ? (
          <div className="section-placeholder">暂无 AI 使用数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis yAxisId="left" fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis yAxisId="right" orientation="right" fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="generations" stroke="var(--accent)" strokeWidth={2} name="生成次数" />
              <Line yAxisId="right" type="monotone" dataKey="tokens" stroke="#e74c3c" strokeWidth={2} name="Token(K)" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily bar chart */}
      <div className="stats-chart-section">
        <h4 className="stats-chart-title">每日生成分布</h4>
        {barData.filter((d) => d.generations > 0).length === 0 ? (
          <div className="section-placeholder">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis fontSize={12} tick={{ fill: 'var(--text-secondary)' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <Bar dataKey="generations" fill="var(--accent)" opacity={0.7} name="生成次数" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
