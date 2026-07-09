import { useEffect, useState, useCallback } from 'react'
import type { ProjectMeta, UpdateProjectInput } from './types/project'
import { listProjects, createProject, updateProject, deleteProject } from './api/tauri'
import ProjectList from './components/ProjectList'
import CreateProjectDialog from './components/CreateProjectDialog'
import EditProjectDialog from './components/EditProjectDialog'
import ProjectView from './components/ProjectView'
import ProviderConfigPanel from './components/ProviderConfig'

type View = { kind: 'bookshelf' } | { kind: 'project'; id: string }

export default function App() {
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [view, setView] = useState<View>({ kind: 'bookshelf' })
  const [showCreate, setShowCreate] = useState(false)
  const [showProviderConfig, setShowProviderConfig] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects()
      setProjects(list)
    } catch (e) {
      setError(String(e))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e: unknown) => { setError(String(e)) })
  }, [refresh])

  const handleCreate = (data: { name: string; genre: string; description: string; target_words: number }) => {
    createProject(data)
      .then(() => {
        setShowCreate(false)
        refresh().catch((e: unknown) => { setError(String(e)) })
      })
      .catch((e: unknown) => { setError(String(e)) })
  }

  const handleEdit = (data: UpdateProjectInput) => {
    updateProject(data)
      .then(() => {
        setEditingProject(null)
        refresh().catch((e: unknown) => { setError(String(e)) })
      })
      .catch((e: unknown) => { setError(String(e)) })
  }

  const handleDelete = (projectId: string) => {
    deleteProject(projectId)
      .then(() => {
        // If currently viewing the deleted project, go back to bookshelf
        if (view.kind === 'project' && view.id === projectId) {
          setView({ kind: 'bookshelf' })
        }
        refresh().catch((e: unknown) => { setError(String(e)) })
      })
      .catch((e: unknown) => { setError(String(e)) })
  }

  const activeProject = view.kind === 'project'
    ? projects.find((p) => p.id === view.id) ?? null
    : null

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1 className="app-title">AI Novel Writer</h1>
        {view.kind === 'bookshelf' && (
          <button className="btn-primary" onClick={() => { setShowCreate(true) }}>
            + 新建项目
          </button>
        )}
        <button className="btn-text" onClick={() => { setShowProviderConfig(true) }} style={{ marginLeft: 12 }}>
          ⚙ AI 配置
        </button>
      </header>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={() => { setError(null) }}>✕</button>
        </div>
      )}

      <main className="app-main">
        {view.kind === 'bookshelf' ? (
          <div className="bookshelf-layout">
            <aside className="sidebar">
              <h2 className="sidebar-title">项目列表</h2>
              <ProjectList
                projects={projects}
                activeId={null}
                onSelect={(id) => { setView({ kind: 'project', id }) }}
                onEdit={(p) => { setEditingProject(p) }}
                onDelete={handleDelete}
              />
            </aside>
            <section className="content">
              <div className="welcome">
                <h2>欢迎使用 AI Novel Writer</h2>
                <p>选择左侧项目进入写作，或新建一个项目开始创作。</p>
              </div>
            </section>
          </div>
        ) : activeProject ? (
          <ProjectView
            project={activeProject}
            onBack={() => { setView({ kind: 'bookshelf' }) }}
          />
        ) : null}
      </main>

      {showCreate && (
        <CreateProjectDialog
          onConfirm={handleCreate}
          onCancel={() => { setShowCreate(false) }}
        />
      )}

      {editingProject && (
        <EditProjectDialog
          project={editingProject}
          onConfirm={handleEdit}
          onCancel={() => { setEditingProject(null) }}
        />
      )}

      {showProviderConfig && (
        <ProviderConfigPanel onClose={() => { setShowProviderConfig(false) }} />
      )}
    </div>
  )
}
