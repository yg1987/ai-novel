import { useState } from 'react'
import WordCountSection from './WordCountSection'
import AIUsageSection from './AIUsageSection'
import WritingHabitsSection from './WritingHabitsSection'
import ProjectScaleSection from './ProjectScaleSection'
import HealthSection from './HealthSection'

interface Props {
  projectId: string
  targetWords?: number
}

type SectionId = 'words' | 'ai' | 'habits' | 'scale' | 'health'

const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: 'words', label: '📝 字数统计' },
  { id: 'ai', label: '🤖 AI 使用' },
  { id: 'habits', label: '⏱ 写作习惯' },
  { id: 'scale', label: '📊 项目规模' },
  { id: 'health', label: '💚 写作健康' },
]

export default function StatisticsPanel({ projectId, targetWords = 0 }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>('words')
  const [days, setDays] = useState(7)

  return (
    <div className="panel-layout">
      {/* ─── Sidebar ─── */}
      <div className="panel-sidebar" style={{ width: 200 }}>
        <div className="panel-sidebar-header">
          <h3>统计</h3>
        </div>
        <div className="panel-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`stats-nav-item${activeSection === item.id ? ' active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border)' }}>
          <select
            value={days}
            onChange={(e) => { setDays(Number(e.target.value)) }}
            className="stats-days-select"
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="panel-editor">
        <div className="stats-content">
          {activeSection === 'words' && (
            <WordCountSection projectId={projectId} days={days} targetWords={targetWords} />
          )}
          {activeSection === 'ai' && (
            <AIUsageSection projectId={projectId} days={days} />
          )}
          {activeSection === 'habits' && (
            <WritingHabitsSection projectId={projectId} days={days} />
          )}
          {activeSection === 'scale' && (
            <ProjectScaleSection projectId={projectId} days={days} />
          )}
          {activeSection === 'health' && (
            <HealthSection projectId={projectId} days={days} />
          )}
        </div>
      </div>
    </div>
  )
}
