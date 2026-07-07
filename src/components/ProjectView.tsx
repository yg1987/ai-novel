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

interface Props {
  project: ProjectMeta
  onBack: () => void
}

type Tab = 'writing' | 'characters' | 'worldview' | 'outline' | 'notes' | 'foreshadow' | 'search' | 'stats'

export default function ProjectView({ project, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('writing')

  return (
    <div className="project-view">
      <div className="project-view-header">
        <button className="btn-text" onClick={() => { onBack() }}>← 返回书架</button>
        <h2>{project.name}</h2>
        <span className="project-status-badge">{project.status}</span>
      </div>

      <div className="project-info-bar">
        <span>{project.genre}</span>
        <span>目标: {project.target_words.toLocaleString()} 字</span>
        {project.description && <span>{project.description}</span>}
      </div>

      <div className="project-tabs">
        <button className={`tab-btn${tab === 'writing' ? ' active' : ''}`} onClick={() => { setTab('writing') }}>✍ 写作</button>
        <button className={`tab-btn${tab === 'characters' ? ' active' : ''}`} onClick={() => { setTab('characters') }}>👤 角色</button>
        <button className={`tab-btn${tab === 'worldview' ? ' active' : ''}`} onClick={() => { setTab('worldview') }}>🌍 世界观</button>
        <button className={`tab-btn${tab === 'outline' ? ' active' : ''}`} onClick={() => { setTab('outline') }}>📋 大纲</button>
        <button className={`tab-btn${tab === 'notes' ? ' active' : ''}`} onClick={() => { setTab('notes') }}>📝 备注</button>
        <button className={`tab-btn${tab === 'foreshadow' ? ' active' : ''}`} onClick={() => { setTab('foreshadow') }}>🔍 伏笔</button>
        <button className={`tab-btn${tab === 'search' ? ' active' : ''}`} onClick={() => { setTab('search') }}>🔎 搜索</button>
        <button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => { setTab('stats') }}>📊 统计</button>
      </div>

      <div className="project-tab-content">
        {tab === 'writing' && <ChapterManager projectId={project.id} targetWords={project.target_words} />}
        {tab === 'characters' && <CharacterPanel projectId={project.id} />}
        {tab === 'worldview' && <WorldviewPanel projectId={project.id} />}
        {tab === 'outline' && <OutlinePanel projectId={project.id} />}
        {tab === 'notes' && <NotesPanel projectId={project.id} />}
        {tab === 'foreshadow' && <ForeshadowPanel projectId={project.id} currentChapter={1} />}
        {tab === 'search' && <SearchPanel projectId={project.id} />}
        {tab === 'stats' && <StatisticsPanel projectId={project.id} targetWords={project.target_words} />}
      </div>
    </div>
  )
}
