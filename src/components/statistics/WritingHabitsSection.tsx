import { useState, useEffect, useCallback } from 'react'
import { getProjectStats, computeStreak, fmtDuration } from '../../services/statsService'
import type { ProjectStats } from '../../api/tauri'
import StatsCards from './StatsCards'
import WritingCalendar from './WritingCalendar'

interface Props {
  projectId: string
  days: number
}

export default function WritingHabitsSection({ projectId, days }: Props) {
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ps = await getProjectStats(projectId, days)
      setStats(ps)
    } catch (e) {
      console.error('Failed to load habits:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, days])

  useEffect(() => { load().catch(console.error) }, [load])

  if (loading) return <div className="section-placeholder">加载中…</div>
  if (!stats) return <div className="section-placeholder">暂无数据</div>

  const writingDays = stats.daily_stats.filter((d) => d.word_count > 0).length
  const hasSessions = stats.daily_stats.some((d) => d.sessions > 0)
  const streak = computeStreak(stats.daily_stats)
  const avgDailySession = writingDays > 0
    ? Math.round(stats.total_session_duration_ms / writingDays)
    : 0

  // Edge case: daily_stats exist (sessions recorded) but all word_count=0
  // because only old-format events (pre event_version) exist.
  const hasWordCountData = stats.daily_stats.some((d) => d.word_count > 0)

  const cards = [
    {
      label: '写作天数',
      value: hasWordCountData
        ? `${writingDays} 天`
        : hasSessions
          ? '暂无数据'
          : '0 天',
      subtitle: hasWordCountData
        ? ''
        : hasSessions
          ? '保存章节后即可统计'
          : '',
    },
    {
      label: '连续写作',
      value: streak > 0 ? `${streak} 天 🔥` : '0 天',
      subtitle: '',
    },
    { label: '总使用时长', value: fmtDuration(stats.total_session_duration_ms), subtitle: '' },
    { label: '日均使用', value: fmtDuration(avgDailySession), subtitle: '有使用那天平均' },
  ]

  return (
    <div className="stats-section">
      <StatsCards cards={cards} />

      <div className="stats-chart-section">
        <h4 className="stats-chart-title">写作日历</h4>
        {stats.daily_stats.length === 0 ? (
          <div className="section-placeholder">暂无数据</div>
        ) : (
          <WritingCalendar dailyStats={stats.daily_stats} />
        )}
      </div>
    </div>
  )
}
