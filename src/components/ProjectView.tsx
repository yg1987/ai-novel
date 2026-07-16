import { useState } from 'react'
import type { ProjectMeta } from '../types/project'
import ChapterManager from './ChapterManager'
import CharacterPanel from './CharacterPanel'
import WorldviewPanel from './WorldviewPanel'
import OutlinePanel from './OutlinePanel'
import NotesPanel from './NotesPanel'
import ForeshadowPanel from './ForeshadowPanel'
import SearchPanel from './SearchPanel'
import StatisticsPanel from './statistics/StatisticsPanel'
import ReviewPanel from './ReviewPanel'
import ResourcePanel from './ResourcePanel'
import BrainstormPanel from './BrainstormPanel'
import ExportDialog from './ExportDialog'
import RelationshipGraph from './RelationshipGraph'
import TrendingPanel from './TrendingPanel'
import ArchiveDialog from './ArchiveDialog'
import ChapterGraph from './ChapterGraph'
import Button from './Button'

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
  const [navigateChapterRef, setNavigateChapterRef] = useState<string | null>(null)
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null)
  const [navigateCharacter, setNavigateCharacter] = useState<string | null>(null)
  const [navigateForeshadowId, setNavigateForeshadowId] = useState<string | null>(null)
  const [navigateNotesChapterRef, setNavigateNotesChapterRef] = useState<string | null>(null)
  const [navigateNotesFilter, setNavigateNotesFilter] = useState<string | null>(null)

  const handleNavigateToReview = (chapterId: string) => {
    setReviewChapterId(chapterId)
    setTab('review')
  }

  const handleNavigateToChapter = (chapterRef: string) => {
    setNavigateChapterRef(chapterRef)
    setTab('writing')
  }

  const handleNavigateToCharacter = (name: string) => {
    setNavigateCharacter(name)
    setTab('characters')
  }

  const handleNavigateToForeshadow = (id: string) => {
    setNavigateForeshadowId(id)
    setTab('foreshadow')
  }

  const handleNavigateToNotes = (chapterRef: string, filter: string) => {
    setNavigateNotesChapterRef(chapterRef)
    setNavigateNotesFilter(filter)
    setTab('notes')
  }

  /** Navigate to the appropriate tab when a search result is clicked */
  const handleSearchOpenFile = (path: string, source: string) => {
    const tabMap: Record<string, Tab> = {
      characters: 'characters',
      worldview: 'worldview',
      chapters: 'writing',
      notes: 'notes',
      outline: 'outline',
      memory: 'notes',
      resources: 'resource',
    }

    const targetTab = tabMap[source]
    if (!targetTab) return

    // For characters, extract the filename (without .md) and pass as initialCharacter
    if (source === 'characters') {
      const name = path
        .replace(/^characters[/\\]/, '')
        .replace(/\.md$/, '')
      if (name) {
        setNavigateCharacter(name)
      }
    }

    setTab(targetTab)
  }

  return (
    <div className="project-view">
      <div className="project-view-header">
        <Button variant="text" size="sm" onClick={() => { onBack() }}>← 返回书架</Button>
        <h2>{project.name}</h2>
        <span className="project-status-badge">{project.status}</span>
        <Button variant="text" size="sm" onClick={() => setShowExport(true)}>📤 导出</Button>
        <Button variant="text" size="sm" onClick={() => setShowArchive(true)}>💾 存档</Button>
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
        {tab === 'writing' && <ChapterManager projectId={project.id} projectName={project.name} onNavigateToReview={handleNavigateToReview} onNavigateToNotes={handleNavigateToNotes} initialChapterRef={navigateChapterRef} onChapterSelect={(chapterId) => setCurrentChapterId(chapterId)} />}
        {tab === 'characters' && <CharacterPanel projectId={project.id} initialCharacter={navigateCharacter} />}
        {tab === 'worldview' && <WorldviewPanel projectId={project.id} />}
        {tab === 'outline' && <OutlinePanel projectId={project.id} />}
        {tab === 'notes' && <NotesPanel projectId={project.id} onNavigateToChapter={handleNavigateToChapter} initialChapterRef={navigateNotesChapterRef} initialFilter={navigateNotesFilter} onHighlightComplete={() => { setNavigateNotesChapterRef(null); setNavigateNotesFilter(null) }} />}
        {tab === 'foreshadow' && <ForeshadowPanel projectId={project.id} currentChapterId={currentChapterId} onNavigateToCharacter={handleNavigateToCharacter} highlightId={navigateForeshadowId} onHighlightComplete={() => setNavigateForeshadowId(null)} />}
        {tab === 'search' && <SearchPanel projectId={project.id} onOpenFile={handleSearchOpenFile} />}
        {tab === 'stats' && <StatisticsPanel projectId={project.id} targetWords={project.target_words} />}
        {tab === 'review' && <ReviewPanel projectId={project.id} currentChapterId={reviewChapterId} onNavigateToForeshadow={handleNavigateToForeshadow} />}
        {tab === 'resource' && <ResourcePanel projectId={project.id} />}
        {tab === 'brainstorm' && <BrainstormPanel projectId={project.id} />}
        {tab === 'graph' && (
          <RelationshipGraph
            projectId={project.id}
            onNavigateToCharacter={handleNavigateToCharacter}
            onNavigateToChapter={handleNavigateToChapter}
            onNavigateToForeshadow={handleNavigateToForeshadow}
          />
        )}
        {tab === 'trending' && <TrendingPanel />}
        {tab === 'chaptergraph' && <ChapterGraph projectId={project.id} />}
      </div>
    </div>
  )
}
