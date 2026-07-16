import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, Line, CartesianGrid,
} from 'recharts'
import { getProjectStats, getChapterWordCounts, findBestDay, fmt } from '../../services/statsService'
import type { ProjectStats, ChapterWordCount } from '../../api/tauri'
import StatsCards from './StatsCards'
import type { StatCard } from './StatsCards'

interface Props {
  projectId: string
  days: number
  targetWords?: number
}

export default function WordCountSection({ projectId, days, targetWords = 0 }: Props) {
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [chapterCounts, setChapterCounts] = useState<ChapterWordCount[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ps, ccs] = await Promise.all([
        getProjectStats(projectId, days),
        getChapterWordCounts(projectId),
      ])
      setStats(ps)
      setChapterCounts(ccs)
    } catch (e) {
      console.error('Failed to load word count stats:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId, days])

  useEffect(() => { load().catch(console.error) }, [load])

  if (loading) {
    return <div className="section-placeholder">加载中…</div>
  }

  if (!stats) {
    return <div className="section-placeholder">暂无数据</div>
  }

  const bestDay = findBestDay(stats.daily_stats)
  const progress = targetWords > 0 ? Math.min(100, Math.round((stats.total_words / targetWords) * 100)) : 0
  const remaining = targetWords > 0 ? Math.max(0, targetWords - stats.total_words) : 0

  // Overview cards
  const cards: StatCard[] = [
    { label: '累计字数', value: fmt(stats.total_words), subtitle: '文件快照' },
    {
      label: '日均字数',
      value: fmt(stats.avg_words_per_chapter > 0 ? stats.avg_words_per_chapter : 0),
      subtitle: `共 ${stats.total_chapters} 章`,
    },
    ...(bestDay
      ? [{ label: '最高日产', value: fmt(bestDay.words), subtitle: bestDay.date.slice(5) }]
      : []),
    ...(targetWords > 0
      ? [{
          label: '完成度',
          value: `${progress}%`,
          subtitle: `还剩 ${fmt(remaining)} 字`,
        }]
      : []),
  ]

  // Daily trend chart data: daily word counts + 7-day moving average
  const trendData = stats.daily_stats.map((d, i, arr) => {
    const window = arr.slice(Math.max(0, i - 6), i + 1)
    const ma = Math.round(window.reduce((s, w) => s + w.word_count, 0) / window.length)
    return {
      date: d.date.slice(5),
      words: d.word_count,
      ma7: ma,
    }
  })

  return (
    <div className="stats-section">
      <StatsCards cards={cards} />

      {/* Progress bar */}
      {targetWords > 0 && (
        <div className="stats-progress-bar-container">
          <div className="stats-progress-bar">
            <div className="stats-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="stats-progress-label">
            {fmt(stats.total_words)} / {fmt(targetWords)}
          </div>
        </div>
      )}

      {/* Daily trend chart */}
      <div className="stats-chart-section">
        <h4 className="stats-chart-title">日更趋势</h4>
        {trendData.length === 0 ? (
          <div className="section-placeholder">暂无每日数据，保存章节后生效</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
              <YAxis fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <Bar dataKey="words" fill="var(--accent)" opacity={0.7} name="每日字数" />
              <Line type="monotone" dataKey="ma7" stroke="#e74c3c" strokeWidth={2} dot={false} name="7日平均" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-chapter word count distribution */}
      <div className="stats-chart-section">
        <h4 className="stats-chart-title">每章字数分布</h4>
        {chapterCounts.length === 0 ? (
          <div className="section-placeholder">暂无章节</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(150, chapterCounts.length * 24)}>
            <BarChart
              data={[...chapterCounts].reverse()} // newest first
              layout="vertical"
              margin={{ left: 0, right: 0, top: 4, bottom: 4 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="title"
                width={70}
                fontSize={11}
                tick={{ fill: 'var(--text-secondary)' }}
              />
              <Tooltip
                formatter={(value: unknown) => [fmt(value as number), '字数']}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <Bar dataKey="word_count" fill="var(--accent)" opacity={0.7} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
