import { useState } from 'react'
import type { ProjectMeta } from '../types/project'
import ChapterManager from './ChapterManager'
import CharacterPanel from './CharacterPanel'
import WorldviewPanel from './WorldviewPanel'
import OutlinePanel from './OutlinePanel'
import NotesPanel from './NotesPanel'
import ForeshadowPanel from './ForeshadowPanel'
import SearchPanel from './SearchPanel'
import StatisticsPanel from './StatisticsPanel'
import ReviewPanel from './ReviewPanel'
import ResourcePanel from './ResourcePanel'
import BrainstormPanel from './BrainstormPanel'
import ExportDialog from './ExportDialog'
import RelationshipGraph from './RelationshipGraph'
import TrendingPanel from './TrendingPanel'
import ArchiveDialog from './ArchiveDialog'
import ChapterGraph from './ChapterGraph'

interface Props {
  project: ProjectMeta
  onBack: () => void
}

type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review' | 'resource' | 'brainstorm' | 'graph' | 'trending' | 'chaptergraph'

export default function ProjectView({ project, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('writing')
  const [showExport, setShowExport] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [reviewChapterId, setReviewChapterId] = useState<string | null>(null)

  const handleNavigateToReview = (chapterId: string) => {
    setReviewChapterId(chapterId)
    setTab('review')
  }

  return (
    <div className="project-view">
      <div className="project-view-header">
        <button className="btn-text" onClick={() => { onBack() }}>← 返回书架</button>
        <h2>{project.name}</h2>
        <span className="project-status-badge">{project.status}</span>
        <button className="btn-text" onClick={() => setShowExport(true)}>📤 导出</button>
        <button className="btn-text" onClick={() => setShowArchive(true)}>💾 存档</button>
      </div>
      {showExport && (
        <ExportDialog
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowExport(false)}
        />
      )}
      {showArchive && (
        <ArchiveDialog
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowArchive(false)}
        />
      )}

      <div className="project-info-bar">
        <span>{project.genre}</span>
        <span>目标: {project.target_words.toLocaleString()} 字</span>
      </div>
      {project.description && (
        <div className="project-desc" title={project.description}>{project.description}</div>
      )}

      <div className="project-tabs">
        <button className={`tab-btn${tab === 'writing' ? ' active' : ''}`} onClick={() => { setTab('writing') }}>✍ 写作</button>
        <button className={`tab-btn${tab === 'characters' ? ' active' : ''}`} onClick={() => { setTab('characters') }}>👤 角色</button>
        <button className={`tab-btn${tab === 'worldview' ? ' active' : ''}`} onClick={() => { setTab('worldview') }}>🌍 世界观</button>
        <button className={`tab-btn${tab === 'outline' ? ' active' : ''}`} onClick={() => { setTab('outline') }}>📋 大纲</button>
        <button className={`tab-btn${tab === 'notes' ? ' active' : ''}`} onClick={() => { setTab('notes') }}>📝 备注</button>
        <button className={`tab-btn${tab === 'foreshadow' ? ' active' : ''}`} onClick={() => { setTab('foreshadow') }}>🔍 伏笔</button>
        <button className={`tab-btn${tab === 'search' ? ' active' : ''}`} onClick={() => { setTab('search') }}>🔎 搜索</button>
        <button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => { setTab('stats') }}>📊 统计</button>
        <button className={`tab-btn${tab === 'review' ? ' active' : ''}`} onClick={() => { setTab('review') }}>🔍 审查</button>
        <button className={`tab-btn${tab === 'resource' ? ' active' : ''}`} onClick={() => { setTab('resource') }}>📦 素材</button>
        <button className={`tab-btn${tab === 'brainstorm' ? ' active' : ''}`} onClick={() => { setTab('brainstorm') }}>💡 灵感</button>
        <button className={`tab-btn${tab === 'graph' ? ' active' : ''}`} onClick={() => { setTab('graph') }}>🕸 关系图</button>
        <button className={`tab-btn${tab === 'trending' ? ' active' : ''}`} onClick={() => { setTab('trending') }}>🔥 热门</button>
        <button className={`tab-btn${tab === 'chaptergraph' ? ' active' : ''}`} onClick={() => { setTab('chaptergraph') }}>📊 章节图</button>
      </div>

      <div className="project-tab-content">
        {tab === 'writing' && <ChapterManager projectId={project.id} projectName={project.name} onNavigateToReview={handleNavigateToReview} />}
        {tab === 'characters' && <CharacterPanel projectId={project.id} />}
        {tab === 'worldview' && <WorldviewPanel projectId={project.id} />}
        {tab === 'outline' && <OutlinePanel projectId={project.id} />}
        {tab === 'notes' && <NotesPanel projectId={project.id} />}
        {tab === 'foreshadow' && <ForeshadowPanel projectId={project.id} currentChapter={1} />}
        {tab === 'search' && <SearchPanel projectId={project.id} />}
        {tab === 'stats' && <StatisticsPanel projectId={project.id} targetWords={project.target_words} />}
        {tab === 'review' && <ReviewPanel projectId={project.id} currentChapterId={reviewChapterId} />}
        {tab === 'resource' && <ResourcePanel projectId={project.id} />}
        {tab === 'brainstorm' && <BrainstormPanel projectId={project.id} />}
        {tab === 'graph' && <RelationshipGraph projectId={project.id} />}
        {tab === 'trending' && <TrendingPanel />}
        {tab === 'chaptergraph' && <ChapterGraph projectId={project.id} />}
      </div>
    </div>
  )
}
