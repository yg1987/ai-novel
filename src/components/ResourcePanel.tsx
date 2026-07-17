import { useCallback, useEffect, useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  createMaterial,
  deleteMaterial,
  getMaterial,
  initializeMaterialLibrary,
  listMaterialCategories,
  listMaterialKinds,
  listMaterialUsages,
  listMaterials,
  listProjects,
  restoreMaterialKindPresets,
  saveMaterialCategories,
  saveMaterialKinds,
  updateMaterial,
  previewWebMaterial,
  attachMaterialImage,
} from '../api/tauri'
import type { ProjectMeta } from '../types/project'
import type {
  CurrentChapterRef,
  MaterialCategory,
  MaterialFilter,
  MaterialItem,
  MaterialContextSelection,
  MaterialKindDefinition,
  MaterialPage,
  MaterialSummary,
  MaterialUsage,
  MaterialWriteInput,
  WebMaterialPreview,
} from '../types/material'
import Button from './Button'
import MaterialConfigModal from './MaterialConfigModal'
import MaterialDocumentWorkspace from './MaterialDocumentWorkspace'
import MaterialEditorModal from './MaterialEditorModal'
import Modal from './Modal'
import Pagination from './Pagination'
import './ResourcePanel.css'

interface Props {
  projectId: string
  initialMaterialId?: string | null
  onMaterialOpened?: () => void
  currentChapter: CurrentChapterRef | null
  materialContextSelections: MaterialContextSelection[]
  onMaterialContextChange: (selections: MaterialContextSelection[]) => void
}

const EMPTY_PAGE: MaterialPage = {
  items: [],
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
}

const SOURCE_LABELS: Record<MaterialItem['sourceType'], string> = {
  original: '原创 / 手动整理',
  book: '书籍资料',
  web: '网页',
  file: '文件',
  image: '图片参考',
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function CategoryTree({
  categories,
  selectedId,
  onSelect,
}: {
  categories: MaterialCategory[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const roots = categories
    .filter((category) => !category.parentId && category.systemKey !== 'inbox')
    .sort((a, b) => a.order - b.order)
  return (
    <div className="material-category-tree">
      {roots.map((root) => (
        <div key={root.id}>
          <button className={selectedId === root.id ? 'active' : ''} onClick={() => { onSelect(root.id); }}>
            <span className="material-nav-icon">▸</span>
            <span>{root.name}</span>
          </button>
          {categories
            .filter((category) => category.parentId === root.id)
            .sort((a, b) => a.order - b.order)
            .map((child) => (
              <button key={child.id} className={`child${selectedId === child.id ? ' active' : ''}`} onClick={() => { onSelect(child.id); }}>
                <span>{child.name}</span>
              </button>
            ))}
        </div>
      ))}
    </div>
  )
}

export default function ResourcePanel({ projectId, initialMaterialId, onMaterialOpened, currentChapter, materialContextSelections, onMaterialContextChange }: Props) {
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [kinds, setKinds] = useState<MaterialKindDefinition[]>([])
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [materialPage, setMaterialPage] = useState<MaterialPage>(EMPTY_PAGE)
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null)
  const [query, setQuery] = useState('')
  const [kindId, setKindId] = useState('')
  const [tag, setTag] = useState('')
  const [categoryId, setCategoryId] = useState<string | undefined>()
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MaterialItem | null>(null)
  const [usages, setUsages] = useState<MaterialUsage[]>([])
  const [showDocuments, setShowDocuments] = useState(false)
  const [showWebCapture, setShowWebCapture] = useState(false)
  const [webUrl, setWebUrl] = useState('')
  const [webPreview, setWebPreview] = useState<WebMaterialPreview | null>(null)
  const [webTitle, setWebTitle] = useState('')
  const [webKindId, setWebKindId] = useState('')
  const [webCategoryId, setWebCategoryId] = useState('')
  const [webLoading, setWebLoading] = useState(false)
  const [showMarkdownImport, setShowMarkdownImport] = useState(false)
  const [markdownName, setMarkdownName] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [markdownKindId, setMarkdownKindId] = useState('')
  const [markdownCategoryId, setMarkdownCategoryId] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [imageTitle, setImageTitle] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [showImageImport, setShowImageImport] = useState(false)

  const inbox = categories.find((category) => category.systemKey === 'inbox')
  const kindMap = useMemo(() => new Map(kinds.map((kind) => [kind.id, kind.name])), [kinds])
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])

  const addSelectedToContext = () => {
    if (!selectedMaterial || !currentChapter || !selectedMaterial.content) return
    const next = materialContextSelections.filter((selection) => selection.materialId !== selectedMaterial.id)
    onMaterialContextChange([...next, { materialId: selectedMaterial.id, title: selectedMaterial.title, excerpt: selectedMaterial.content }])
  }

  const filter = useMemo<MaterialFilter>(() => ({
    query: query.trim() || undefined,
    kindId: kindId || undefined,
    categoryId,
    tag: tag.trim() || undefined,
    favorite: favoritesOnly ? true : undefined,
    projectId,
  }), [categoryId, favoritesOnly, kindId, projectId, query, tag])

  const refreshConfiguration = useCallback(async () => {
    const [nextCategories, nextKinds, nextProjects] = await Promise.all([
      listMaterialCategories(),
      listMaterialKinds(),
      listProjects(),
    ])
    setCategories(nextCategories)
    setKinds(nextKinds)
    setProjects(nextProjects)
  }, [])

  const refreshPage = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listMaterials(filter, page, pageSize)
      setMaterialPage(result)
      if (result.page !== page) setPage(result.page)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }, [filter, page, pageSize])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      Promise.all([initializeMaterialLibrary(), refreshConfiguration()])
        .then(() => { if (!cancelled) setReady(true) })
        .catch((cause: unknown) => { if (!cancelled) setError(String(cause)) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [projectId, refreshConfiguration])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => { void refreshPage() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [ready, refreshPage])

  const openMaterial = useCallback(async (materialId: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const material = await getMaterial(materialId)
      setSelectedMaterial(material)
      setUsages(await listMaterialUsages(materialId))
    } catch (cause) {
      setSelectedMaterial(null)
      setError(String(cause))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!ready || !initialMaterialId) return
    const timer = window.setTimeout(() => {
      void openMaterial(initialMaterialId).finally(() => { onMaterialOpened?.() })
    }, 0)
    return () => { window.clearTimeout(timer) }
  }, [initialMaterialId, onMaterialOpened, openMaterial, ready])

  const resetPageAndSelection = () => {
    setPage(1)
    setSelectedMaterial(null)
  }

  const selectView = (view: string) => {
    setShowDocuments(false)
    setFavoritesOnly(view === 'favorites')
    setCategoryId(view === 'all' || view === 'favorites'
      ? undefined
      : view === 'inbox'
        ? inbox?.id
        : view)
    resetPageAndSelection()
  }

  const handleSaveMaterial = async (input: MaterialWriteInput) => {
    const saved = selectedMaterial
      ? await updateMaterial(selectedMaterial.id, input)
      : await createMaterial(input)
    setSelectedMaterial(saved)
    setShowEditor(false)
    setPage(1)
    await refreshPage()
  }

  const handleToggleFavorite = async () => {
    if (!selectedMaterial) return
    try {
      const updated = await updateMaterial(selectedMaterial.id, { favorite: !selectedMaterial.favorite })
      setSelectedMaterial(updated)
      await refreshPage()
    } catch (cause) {
      setError(String(cause))
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMaterial(deleteTarget.id)
      setDeleteTarget(null)
      setSelectedMaterial(null)
      await refreshPage()
    } catch (cause) {
      setError(String(cause))
    }
  }

  const handleSaveConfiguration = async (
    nextCategories: MaterialCategory[],
    nextKinds: MaterialKindDefinition[],
  ) => {
    await saveMaterialCategories(nextCategories)
    await saveMaterialKinds(nextKinds)
    setCategories(nextCategories)
    setKinds(nextKinds)
    setShowConfig(false)
    setSelectedMaterial(null)
    setPage(1)
    await refreshPage()
  }

  const fetchWebPreview = async () => {
    setWebLoading(true)
    try {
      const preview = await previewWebMaterial(webUrl)
      setWebPreview(preview)
      setWebTitle(preview.title)
      setWebKindId(kinds.find((kind) => !kind.archived)?.id ?? '')
      setWebCategoryId(inbox?.id ?? '')
    } catch (cause) {
      setError(String(cause))
    } finally {
      setWebLoading(false)
    }
  }

  const saveWebMaterial = async () => {
    if (!webPreview || !webTitle.trim() || !webKindId || !webCategoryId) return
    try {
      const saved = await createMaterial({
        title: webTitle,
        kindId: webKindId,
        content: webPreview.content,
        sourceType: 'web',
        sourceName: webPreview.sourceName,
        sourceUrl: webPreview.sourceUrl,
        categoryId: webCategoryId,
        scope: 'projects',
        projectIds: [projectId],
      })
      setShowWebCapture(false)
      setWebPreview(null)
      setWebUrl('')
      setSelectedMaterial(saved)
      setPage(1)
      await refreshPage()
    } catch (cause) {
      setError(String(cause))
    }
  }

  const chooseMarkdown = async () => {
    try {
      const path = await open({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }], multiple: false })
      if (typeof path !== 'string') return
      const content = await readTextFile(path)
      if (!content.trim()) {
        setError('Markdown 文件为空，未创建素材')
        return
      }
      const name = path.split(/[\\/]/).pop()?.replace(/\.(md|markdown)$/i, '') || '未命名 Markdown'
      setMarkdownName(name)
      setMarkdownContent(content)
      setMarkdownKindId(kinds.find((kind) => !kind.archived)?.id ?? '')
      setMarkdownCategoryId(inbox?.id ?? '')
      setShowMarkdownImport(true)
    } catch (cause) {
      setError(String(cause))
    }
  }

  const saveMarkdown = async () => {
    if (!markdownName.trim() || !markdownContent || !markdownKindId || !markdownCategoryId) return
    try {
      const saved = await createMaterial({ title: markdownName, kindId: markdownKindId, content: markdownContent, contentFormat: 'markdown', sourceType: 'file', sourceName: `${markdownName}.md`, categoryId: markdownCategoryId, scope: 'projects', projectIds: [projectId] })
      setShowMarkdownImport(false)
      setMarkdownContent('')
      setSelectedMaterial(saved)
      setPage(1)
      await refreshPage()
    } catch (cause) {
      setError(String(cause))
    }
  }

  const chooseImage = async () => {
    try {
      const path = await open({ filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }], multiple: false })
      if (typeof path !== 'string') return
      setImagePath(path)
      setImageTitle(path.split(/[\\/]/).pop()?.replace(/\.(jpg|jpeg|png|webp)$/i, '') || '图片参考')
      setImageDescription('')
      setShowImageImport(true)
    } catch (cause) { setError(String(cause)) }
  }

  const saveImage = async () => {
    const kind = kinds.find((value) => !value.archived)?.id
    if (!imagePath || !imageTitle.trim() || !kind || !inbox) return
    try {
      const material = await createMaterial({ title: imageTitle, kindId: kind, content: imageDescription, sourceType: 'image', sourceName: imagePath.split(/[\\/]/).pop() ?? '', categoryId: inbox.id, scope: 'projects', projectIds: [projectId] })
      await attachMaterialImage(material.id, imagePath)
      setShowImageImport(false); setImagePath(''); setSelectedMaterial(await getMaterial(material.id)); setPage(1)
      await refreshPage()
    } catch (cause) { setError(String(cause)) }
  }

  return (
    <div className="material-workspace">
      <aside className="material-library-nav">
        <div className="material-pane-header">
          <div>
            <h3>素材库</h3>
            <span>{materialPage.totalItems} 条可见素材</span>
          </div>
          <Button variant="text" size="sm" onClick={() => { setShowConfig(true); }} title="管理类型和分类">⚙</Button>
        </div>
        <nav className="material-primary-nav">
          <button className={!categoryId && !favoritesOnly ? 'active' : ''} onClick={() => { selectView('all'); }}>
            <span className="material-nav-icon">≡</span><span>全部素材</span>
          </button>
          <button className={categoryId === inbox?.id ? 'active' : ''} onClick={() => { selectView('inbox'); }}>
            <span className="material-nav-icon">⌑</span><span>收件箱</span>
          </button>
          <button className={favoritesOnly ? 'active' : ''} onClick={() => { selectView('favorites'); }}>
            <span className="material-nav-icon">★</span><span>收藏</span>
          </button>
          <button className={showDocuments ? 'active' : ''} onClick={() => { setShowDocuments(true); setSelectedMaterial(null); }}>
            <span className="material-nav-icon">▤</span><span>资料源</span>
          </button>
        </nav>
        <div className="material-nav-section-title">自定义分类</div>
        <div className="material-nav-scroll">
          <CategoryTree categories={categories} selectedId={categoryId} onSelect={selectView} />
          {categories.filter((category) => !category.parentId && !category.systemKey).length === 0 && (
            <p className="material-nav-empty">尚未创建自定义分类</p>
          )}
        </div>
        <div className="material-nav-footer">
          <Button variant="primary" size="md" onClick={() => { setShowDocuments(false); setSelectedMaterial(null); setShowEditor(true) }}>＋ 新建素材</Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowWebCapture(true) }}>网页摘录</Button>
          <Button variant="secondary" size="sm" onClick={() => { void chooseMarkdown() }}>导入 Markdown</Button>
          <Button variant="secondary" size="sm" onClick={() => { void chooseImage() }}>图片参考</Button>
        </div>
      </aside>

      {showDocuments ? <MaterialDocumentWorkspace projectId={projectId} categories={categories} kinds={kinds} /> : <>
      <section className="material-list-pane">
        <div className="material-list-toolbar">
          <input
            className="material-search-input"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(1) }}
            placeholder="搜索标题、正文、摘要、来源或标签"
          />
          <div className="material-filter-row">
            <select value={kindId} onChange={(event) => { setKindId(event.target.value); setPage(1) }}>
              <option value="">全部类型</option>
              {[...kinds].filter((kind) => !kind.archived).sort((a, b) => a.order - b.order).map((kind) => (
                <option key={kind.id} value={kind.id}>{kind.name}</option>
              ))}
            </select>
            <input value={tag} onChange={(event) => { setTag(event.target.value); setPage(1) }} placeholder="标签筛选" />
          </div>
        </div>

        {error && (
          <div className="material-error material-list-error" role="alert">
            <span>{error}</span>
            <button onClick={() => { setError(null); }} title="关闭">×</button>
          </div>
        )}

        <div className="material-list-scroll">
          {loading && <div className="material-state">正在加载素材…</div>}
          {!loading && materialPage.items.length === 0 && (
            <div className="material-state">
              <strong>这里还没有素材</strong>
              <Button variant="primary" size="sm" onClick={() => { setSelectedMaterial(null); setShowEditor(true) }}>新建素材</Button>
            </div>
          )}
          {!loading && materialPage.items.map((item: MaterialSummary) => (
            <button
              key={item.id}
              className={`material-list-item${selectedMaterial?.id === item.id ? ' active' : ''}`}
              onClick={() => { void openMaterial(item.id) }}
            >
              <div className="material-list-title-row">
                <strong>{item.title}</strong>
                {item.favorite && <span className="material-favorite" title="已收藏">★</span>}
              </div>
              <p>{item.summary || item.contentPreview || '空白素材'}</p>
              <div className="material-list-meta">
                <span>{kindMap.get(item.kindId) ?? '未知类型'}</span>
                {item.tags.slice(0, 2).map((itemTag) => <span key={itemTag}>#{itemTag}</span>)}
                <time>{formatDate(item.updatedAt)}</time>
              </div>
            </button>
          ))}
        </div>

        <div className="material-list-pagination">
          <Pagination
            currentPage={materialPage.page}
            totalPages={materialPage.totalPages}
            totalItems={materialPage.totalItems}
            pageSize={pageSize}
            pageSizeOptions={[20, 40, 80]}
            onPageChange={setPage}
            onPageSizeChange={(value) => { setPageSize(value); setPage(1) }}
          />
        </div>
      </section>

      <main className="material-detail-pane">
        {detailLoading ? (
          <div className="material-state">正在读取素材…</div>
        ) : selectedMaterial ? (
          <>
            <header className="material-detail-header">
              <div className="material-detail-heading">
                <div className="material-detail-eyebrow">
                  <span>{kindMap.get(selectedMaterial.kindId) ?? '未知类型'}</span>
                  <span>{categoryMap.get(selectedMaterial.categoryId) ?? '未知分类'}</span>
                </div>
                <h2>{selectedMaterial.title}</h2>
              </div>
              <div className="material-detail-actions">
                <Button variant="secondary" size="sm" onClick={addSelectedToContext} disabled={!currentChapter || !selectedMaterial.content} title={currentChapter ? '加入本章 AI 上下文' : '请先在写作页选择章节'}>加入本章上下文</Button>
                <Button variant="text" size="sm" onClick={() => { void handleToggleFavorite() }} title={selectedMaterial.favorite ? '取消收藏' : '收藏'}>
                  {selectedMaterial.favorite ? '★' : '☆'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowEditor(true); }}>编辑</Button>
                <Button variant="text" size="sm" className="material-delete-button" onClick={() => { setDeleteTarget(selectedMaterial); }}>删除</Button>
              </div>
            </header>

            <div className="material-detail-scroll">
              {selectedMaterial.summary && (
                <section className="material-detail-section material-summary-section">
                  <h3>摘要</h3>
                  <p>{selectedMaterial.summary}</p>
                </section>
              )}
              <section className="material-detail-section material-content-section">
                <h3>正文</h3>
                <pre>{selectedMaterial.content || '（空）'}</pre>
              </section>
              <section className="material-detail-section material-metadata-section">
                <h3>整理信息</h3>
                <dl>
                  <div><dt>来源</dt><dd>{SOURCE_LABELS[selectedMaterial.sourceType]}{selectedMaterial.sourceName ? ` · ${selectedMaterial.sourceName}` : ''}</dd></div>
                  {selectedMaterial.sourceUrl && <div><dt>链接</dt><dd className="material-source-url">{selectedMaterial.sourceUrl}</dd></div>}
                  <div><dt>范围</dt><dd>{selectedMaterial.scope === 'global' ? '全局素材' : selectedMaterial.projectIds.map((id) => projectMap.get(id) ?? id).join('、')}</dd></div>
                  <div><dt>标签</dt><dd>{selectedMaterial.tags.length > 0 ? selectedMaterial.tags.map((itemTag) => `#${itemTag}`).join('  ') : '无'}</dd></div>
                  <div><dt>更新</dt><dd>{formatDate(selectedMaterial.updatedAt)}</dd></div>
                </dl>
              </section>
              <section className="material-detail-section">
                <h3>使用记录</h3>
                {usages.length === 0 ? <p>尚未在章节中使用。</p> : <ul>{usages.map((usage) => <li key={usage.id}>{usage.chapterTitle} · {usage.action === 'insert' ? '插入' : 'AI 上下文'} · {formatDate(usage.createdAt)}</li>)}</ul>}
              </section>
            </div>
          </>
        ) : (
          <div className="material-state material-detail-empty">
            <strong>选择一条素材查看详情</strong>
          </div>
        )}
      </main>
      </>}

      {showEditor && (
        <MaterialEditorModal
          projectId={projectId}
          material={selectedMaterial}
          categories={categories}
          kinds={kinds}
          projects={projects}
          onSave={handleSaveMaterial}
          onClose={() => { setShowEditor(false); }}
        />
      )}
      {showConfig && (
        <MaterialConfigModal
          categories={categories}
          kinds={kinds}
          onSave={handleSaveConfiguration}
          onRestorePresets={restoreMaterialKindPresets}
          onClose={() => { setShowConfig(false); }}
        />
      )}
      {deleteTarget && (
        <Modal className="material-confirm-modal">
          <h2>删除素材</h2>
          <p>确定删除「{deleteTarget.title}」？相关使用记录也会一并删除，此操作不可恢复。</p>
          <div className="material-modal-footer">
            <Button variant="secondary" size="md" onClick={() => { setDeleteTarget(null); }}>取消</Button>
            <Button variant="danger" size="md" onClick={() => { void handleDelete() }}>删除</Button>
          </div>
        </Modal>
      )}
      {showWebCapture && (
        <Modal className="material-document-import-modal">
          <h2>网页摘录</h2>
          {!webPreview ? <><input value={webUrl} onChange={(event) => { setWebUrl(event.target.value) }} placeholder="https://example.com/article" /><div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => { setShowWebCapture(false); setWebUrl('') }}>取消</Button><Button variant="primary" size="md" onClick={() => { void fetchWebPreview() }} disabled={!webUrl.trim() || webLoading}>{webLoading ? '正在抓取...' : '获取预览'}</Button></div></> : <><input value={webTitle} onChange={(event) => { setWebTitle(event.target.value) }} placeholder="素材标题" /><select value={webKindId} onChange={(event) => { setWebKindId(event.target.value) }}>{kinds.filter((kind) => !kind.archived).map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select><select value={webCategoryId} onChange={(event) => { setWebCategoryId(event.target.value) }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><div className="material-document-excerpt-preview">{webPreview.content}</div><div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => { setWebPreview(null) }}>重新选择</Button><Button variant="primary" size="md" onClick={() => { void saveWebMaterial() }}>保存素材</Button></div></>}
        </Modal>
      )}
      {showMarkdownImport && (
        <Modal className="material-document-import-modal"><h2>导入 Markdown</h2><input value={markdownName} onChange={(event) => { setMarkdownName(event.target.value) }} placeholder="素材标题" /><select value={markdownKindId} onChange={(event) => { setMarkdownKindId(event.target.value) }}>{kinds.filter((kind) => !kind.archived).map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select><select value={markdownCategoryId} onChange={(event) => { setMarkdownCategoryId(event.target.value) }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><div className="material-document-excerpt-preview">{markdownContent}</div><div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => { setShowMarkdownImport(false); setMarkdownContent('') }}>取消</Button><Button variant="primary" size="md" onClick={() => { void saveMarkdown() }}>保存素材</Button></div></Modal>
      )}
      {showImageImport && <Modal className="material-document-import-modal"><h2>图片参考</h2><img style={{ display: 'block', width: '100%', maxHeight: 280, objectFit: 'contain' }} src={convertFileSrc(imagePath)} alt="图片预览" /><input value={imageTitle} onChange={(event) => { setImageTitle(event.target.value) }} placeholder="素材标题" /><textarea value={imageDescription} onChange={(event) => { setImageDescription(event.target.value) }} rows={3} placeholder="图片说明" /><div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => { setShowImageImport(false); setImagePath('') }}>取消</Button><Button variant="primary" size="md" onClick={() => { void saveImage() }}>保存素材</Button></div></Modal>}
    </div>
  )
}
