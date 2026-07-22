import { lazy, Suspense, useState } from 'react'
import type { ProjectMeta } from '../types/project'
import type { ChapterRef } from '../types/chapter'
import type { CurrentChapterRef, MaterialContextSelection } from '../types/material'
import type { BrainstormForeshadowDraft } from '../types/brainstorm'
import { useChapterSegmentSize } from '../hooks/useChapterSegmentSize'
import ExportDialog from './ExportDialog'
import ArchiveDialog from './ArchiveDialog'
import Button from './Button'

const ChapterManager = lazy(() => import('./ChapterManager'))
const CharacterPanel = lazy(() => import('./CharacterPanel'))
const WorldviewPanel = lazy(() => import('./WorldviewPanel'))
const OutlinePanel = lazy(() => import('./OutlinePanel'))
const NotesPanel = lazy(() => import('./NotesPanel'))
const ForeshadowPanel = lazy(() => import('./ForeshadowPanel'))
const SearchPanel = lazy(() => import('./SearchPanel'))
const StatisticsPanel = lazy(() => import('./statistics/StatisticsPanel'))
const ReviewPanel = lazy(() => import('./ReviewPanel'))
const ResourcePanel = lazy(() => import('./ResourcePanel'))
const BrainstormPanel = lazy(() => import('./BrainstormPanel'))
const RelationshipGraph = lazy(() => import('./relationship-graph/RelationshipGraph'))
const ChapterGraph = lazy(() => import('./ChapterGraph'))

interface Props {
  project: ProjectMeta
  onBack: () => void
}

type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats' | 'review' | 'resource' | 'brainstorm' | 'graph' | 'chaptergraph'

export default function ProjectView({ project, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('writing')
  const [chapterSegmentSize, setChapterSegmentSize] = useChapterSegmentSize(project.id)
  const [showExport, setShowExport] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [reviewChapterRef, setReviewChapterRef] = useState<ChapterRef | null>(null)
  const [navigateChapterRef, setNavigateChapterRef] = useState<string | null>(null)
  const [currentChapter, setCurrentChapter] = useState<CurrentChapterRef | null>(null)
  const [materialContextSelections, setMaterialContextSelections] = useState<MaterialContextSelection[]>([])
  const [navigateCharacter, setNavigateCharacter] = useState<string | null>(null)
  const [navigateForeshadowId, setNavigateForeshadowId] = useState<string | null>(null)
  const [navigateNotesChapterRef, setNavigateNotesChapterRef] = useState<string | null>(null)
  const [navigateNotesFilter, setNavigateNotesFilter] = useState<string | null>(null)
  const [navigateMaterialId, setNavigateMaterialId] = useState<string | null>(null)
  const [brainstormSessionId, setBrainstormSessionId] = useState<string | null>(null)
  const [brainstormForeshadowDraft, setBrainstormForeshadowDraft] = useState<BrainstormForeshadowDraft | null>(null)

  const handleNavigateToReview = (ref: ChapterRef) => {
    setReviewChapterRef(ref)
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
      materials: 'resource',
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

    if (source === 'materials') {
      const materialId = path.replace(/^materials[/\\]/, '')
      if (materialId) setNavigateMaterialId(materialId)
    }

    setTab(targetTab)
  }

  const handleChapterSelect = (chapter: CurrentChapterRef) => {
    setCurrentChapter(chapter)
    setMaterialContextSelections([])
  }

  const renderTabContent = () => {
    switch (tab) {
      case 'writing':
        return <ChapterManager projectId={project.id} projectName={project.name} segmentSize={chapterSegmentSize} onSegmentSizeChange={setChapterSegmentSize} onNavigateToReview={handleNavigateToReview} onNavigateToNotes={handleNavigateToNotes} initialChapterRef={navigateChapterRef} onChapterSelect={handleChapterSelect} currentChapter={currentChapter} materialContextSelections={materialContextSelections} onMaterialContextChange={setMaterialContextSelections} onOpenMaterial={(materialId) => { setNavigateMaterialId(materialId); setTab('resource') }} />
      case 'characters':
        return <CharacterPanel projectId={project.id} initialCharacter={navigateCharacter} />
      case 'worldview':
        return <WorldviewPanel projectId={project.id} />
      case 'outline':
        return <OutlinePanel projectId={project.id} segmentSize={chapterSegmentSize} onSegmentSizeChange={setChapterSegmentSize} onNavigateToWriting={(ref) => { setNavigateChapterRef(ref); setTab('writing') }} />
      case 'notes':
        return <NotesPanel projectId={project.id} onNavigateToChapter={handleNavigateToChapter} initialChapterRef={navigateNotesChapterRef} initialFilter={navigateNotesFilter} onHighlightComplete={() => { setNavigateNotesChapterRef(null); setNavigateNotesFilter(null) }} />
      case 'foreshadow':
        return <ForeshadowPanel projectId={project.id} currentChapterId={currentChapter?.chapterId ?? null} onNavigateToCharacter={handleNavigateToCharacter} highlightId={navigateForeshadowId} onHighlightComplete={() => setNavigateForeshadowId(null)} initialDraft={brainstormForeshadowDraft} onInitialDraftConsumed={() => setBrainstormForeshadowDraft(null)} />
      case 'search':
        return <SearchPanel projectId={project.id} onOpenFile={handleSearchOpenFile} />
      case 'stats':
        return <StatisticsPanel projectId={project.id} targetWords={project.target_words} />
      case 'review':
        return <ReviewPanel projectId={project.id} segmentSize={chapterSegmentSize} onSegmentSizeChange={setChapterSegmentSize} currentChapterRef={reviewChapterRef} onNavigateToForeshadow={handleNavigateToForeshadow} />
      case 'resource':
        return <ResourcePanel projectId={project.id} initialMaterialId={navigateMaterialId} onMaterialOpened={() => { setNavigateMaterialId(null) }} currentChapter={currentChapter} materialContextSelections={materialContextSelections} onMaterialContextChange={setMaterialContextSelections} />
      case 'brainstorm':
        return <BrainstormPanel projectId={project.id} currentChapter={currentChapter} currentSessionId={brainstormSessionId} onCurrentSessionChange={setBrainstormSessionId} onOpenForeshadowDraft={(draft) => { setBrainstormForeshadowDraft(draft); setTab('foreshadow') }} />
      case 'graph':
        return (
          <RelationshipGraph
            projectId={project.id}
            onNavigateToCharacter={handleNavigateToCharacter}
            onNavigateToChapter={handleNavigateToChapter}
            onNavigateToForeshadow={handleNavigateToForeshadow}
          />
        )
      case 'chaptergraph':
        return <ChapterGraph projectId={project.id} />
    }
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
        <button className={`tab-btn${tab === 'chaptergraph' ? ' active' : ''}`} onClick={() => { setTab('chaptergraph') }}>📊 章节图</button>
      </div>

      <div className="project-tab-content">
        <Suspense fallback={<div className="chapter-loading">加载面板…</div>}>
          {renderTabContent()}
        </Suspense>
      </div>
    </div>
  )
}
