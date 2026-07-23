import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { getCharacterGenderStats, getProjectStats, getProjectScale, fmt } from '../../services/statsService'
import type { CharacterGenderStats, ProjectScale } from '../../services/statsService'
import type { ProjectStats } from '../../api/tauri'
import StatsCards from './StatsCards'

interface Props {
  projectId: string
  days: number
}

export default function ProjectScaleSection({ projectId }: Props) {
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [scale, setScale] = useState<ProjectScale | null>(null)
  const [genderStats, setGenderStats] = useState<CharacterGenderStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ps, sc, genders] = await Promise.all([
        getProjectStats(projectId, 30),
        getProjectScale(projectId),
        getCharacterGenderStats(projectId),
      ])
      setStats(ps)
      setScale(sc)
      setGenderStats(genders)
    } catch (e) {
      console.error('Failed to load project scale:', e)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load().catch(console.error) }, [load])

  if (loading) return <div className="section-placeholder">加载中…</div>
  if (!stats || !scale || !genderStats) return <div className="section-placeholder">暂无数据</div>

  const scaleCards = [
    { label: '项目天数', value: `${Math.max(1, stats.project_days_elapsed)} 天`, subtitle: '' },
    { label: '总章数', value: fmt(stats.total_chapters), subtitle: `${stats.total_volumes} 卷` },
    { label: '角色', value: fmt(scale.characters), subtitle: '' },
    { label: '角色性别', value: `男 ${genderStats.男} / 女 ${genderStats.女}`, subtitle: `未知 ${genderStats.未知}` },
    { label: '大纲条目', value: fmt(scale.outline), subtitle: '' },
    { label: '备注', value: fmt(scale.notes), subtitle: '' },
    { label: '素材', value: fmt(scale.resources), subtitle: '素材库总数' },
  ]

  const volumeChartData = [{
    name: '章节',
    count: stats.total_chapters,
  }, {
    name: '角色',
    count: scale.characters,
  }, {
    name: '大纲',
    count: scale.outline,
  }, {
    name: '备注',
    count: scale.notes,
  }, {
    name: '素材',
    count: scale.resources,
  }]

  return (
    <div className="stats-section">
      <StatsCards cards={scaleCards} />

      <div className="stats-chart-section">
        <h4 className="stats-chart-title">内容分布</h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={volumeChartData}>
            <XAxis dataKey="name" fontSize={12} tick={{ fill: 'var(--text-secondary)' }} />
            <YAxis fontSize={12} tick={{ fill: 'var(--text-secondary)' }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }}
            />
            <Bar dataKey="count" fill="var(--accent)" opacity={0.7} radius={[3, 3, 0, 0]} name="数量" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
