import { useCallback, useEffect, useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  createMaterial,
  deleteMaterial,
  getMaterial,
  getMaterialPlainText,
  getMaterialDocumentSourceStatus,
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
  createMaterialWithImage,
  listMaterialImageAttachments,
  readMaterialImageAttachment,
  previewMarkdownMaterialImport,
} from '../api/tauri'
import type { ProjectMeta } from '../types/project'
import type {
  CurrentChapterRef,
  MaterialCategory,
  MaterialFilter,
  MaterialItem,
  MaterialContextSelection,
  MaterialKindDefinition,
  MaterialImageAttachment,
  MaterialDocumentSourceStatus,
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

interface MaterialImagePreview {
  attachment: MaterialImageAttachment
  url: string
}

interface MaterialSourceTarget {
  documentId: string
  sectionId?: string
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
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
  const [selectedPlainText, setSelectedPlainText] = useState('')
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
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [usages, setUsages] = useState<MaterialUsage[]>([])
  const [showDocuments, setShowDocuments] = useState(false)
  const [documentSelected, setDocumentSelected] = useState(false)
  const [showWebCapture, setShowWebCapture] = useState(false)
  const [webUrl, setWebUrl] = useState('')
  const [webPreview, setWebPreview] = useState<WebMaterialPreview | null>(null)
  const [webTitle, setWebTitle] = useState('')
  const [webKindId, setWebKindId] = useState('')
  const [webCategoryId, setWebCategoryId] = useState('')
  const [webLoading, setWebLoading] = useState(false)
  const [webSaving, setWebSaving] = useState(false)
  const [showMarkdownImport, setShowMarkdownImport] = useState(false)
  const [markdownName, setMarkdownName] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [markdownSourceName, setMarkdownSourceName] = useState('')
  const [markdownKindId, setMarkdownKindId] = useState('')
  const [markdownCategoryId, setMarkdownCategoryId] = useState('')
  const [markdownSaving, setMarkdownSaving] = useState(false)
  const [imagePath, setImagePath] = useState('')
  const [imageTitle, setImageTitle] = useState('')
  const [imageDescription, setImageDescription] = useState('')
  const [imageSourceName, setImageSourceName] = useState('')
  const [imageTags, setImageTags] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imagePreviews, setImagePreviews] = useState<MaterialImagePreview[]>([])
  const [sourceStatus, setSourceStatus] = useState<MaterialDocumentSourceStatus | null>(null)
  const [sourceTarget, setSourceTarget] = useState<MaterialSourceTarget | null>(null)
  const [showImageImport, setShowImageImport] = useState(false)

  const inbox = categories.find((category) => category.systemKey === 'inbox')
  const kindMap = useMemo(() => new Map(kinds.map((kind) => [kind.id, kind.name])), [kinds])
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories])
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])

  const addSelectedToContext = () => {
    if (!selectedMaterial || selectedMaterial.sourceType === 'image' || !currentChapter || !selectedPlainText) return
    const next = materialContextSelections.filter((selection) => selection.materialId !== selectedMaterial.id)
    onMaterialContextChange([...next, { materialId: selectedMaterial.id, title: selectedMaterial.title, excerpt: selectedPlainText }])
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
      const [material, plainText] = await Promise.all([
        getMaterial(materialId),
        getMaterialPlainText(materialId),
      ])
      const [nextUsages, attachments, nextSourceStatus] = await Promise.all([
        listMaterialUsages(materialId),
        listMaterialImageAttachments(materialId),
        material.sourceDocumentId
          ? getMaterialDocumentSourceStatus(material.sourceDocumentId, material.sourceSectionId)
          : Promise.resolve(null),
      ])
      const previews = await Promise.all(attachments.map(async (attachment) => {
        const content = await readMaterialImageAttachment(materialId, attachment.id)
        return {
          attachment: content.attachment,
          url: URL.createObjectURL(new Blob([new Uint8Array(content.bytes)], { type: content.attachment.mimeType })),
        }
      }))
      setSelectedMaterial(material)
      setSelectedPlainText(plainText)
      setUsages(nextUsages)
      setImagePreviews(previews)
      setSourceStatus(nextSourceStatus)
    } catch (cause) {
      setSelectedMaterial(null)
      setSelectedPlainText('')
      setImagePreviews([])
      setSourceStatus(null)
      setError(String(cause))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => () => {
    imagePreviews.forEach((preview) => { URL.revokeObjectURL(preview.url) })
  }, [imagePreviews])

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
    setSelectedPlainText('')
    setImagePreviews([])
    setSourceStatus(null)
  }

  const selectView = (view: string) => {
    setShowDocuments(false)
    setDocumentSelected(false)
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
    setSelectedPlainText(await getMaterialPlainText(saved.id))
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
    setDeleteSaving(true)
    try {
      const result = await deleteMaterial(deleteTarget.id)
      setDeleteTarget(null)
      setSelectedMaterial(null)
      setSelectedPlainText('')
      setImagePreviews([])
      setSourceStatus(null)
      await refreshPage()
      if (result.cleanupPending) {
        setError('素材已删除，部分附件正在等待下次启动重试清理')
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setDeleteSaving(false)
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
    setWebSaving(true)
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
    } finally {
      setWebSaving(false)
    }
  }

  const chooseMarkdown = async () => {
    try {
      const path = await open({ filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }], multiple: false })
      if (typeof path !== 'string') return
      const nextPreview = await previewMarkdownMaterialImport(path)
      setMarkdownName(nextPreview.title)
      setMarkdownContent(nextPreview.content)
      setMarkdownSourceName(nextPreview.sourceName)
      setMarkdownKindId(kinds.find((kind) => !kind.archived)?.id ?? '')
      setMarkdownCategoryId(inbox?.id ?? '')
      setShowMarkdownImport(true)
    } catch (cause) {
      setError(String(cause))
    }
  }

  const saveMarkdown = async () => {
    if (!markdownName.trim() || !markdownContent || !markdownKindId || !markdownCategoryId) return
    setMarkdownSaving(true)
    try {
      const saved = await createMaterial({ title: markdownName, kindId: markdownKindId, content: markdownContent, contentFormat: 'markdown', sourceType: 'file', sourceName: markdownSourceName, categoryId: markdownCategoryId, scope: 'projects', projectIds: [projectId] })
      setShowMarkdownImport(false)
      setMarkdownContent('')
      setSelectedMaterial(saved)
      setPage(1)
      await refreshPage()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setMarkdownSaving(false)
    }
  }

  const chooseImage = async () => {
    try {
      const path = await open({ filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }], multiple: false })
      if (typeof path !== 'string') return
      setImagePath(path)
      setImageTitle(path.split(/[\\/]/).pop()?.replace(/\.(jpg|jpeg|png|webp)$/i, '') || '图片参考')
      setImageDescription('')
      setImageSourceName(path.split(/[\\/]/).pop() ?? '')
      setImageTags('')
      setShowImageImport(true)
    } catch (cause) { setError(String(cause)) }
  }

  const saveImage = async () => {
    const kind = kinds.find((value) => !value.archived)?.id
    if (!imagePath || !imageTitle.trim() || !kind || !inbox) return
    setImageSaving(true)
    try {
      const material = await createMaterialWithImage({ title: imageTitle, kindId: kind, content: imageDescription, sourceType: 'image', sourceName: imageSourceName.trim(), tags: imageTags.split(/[,，]/).map((value) => value.trim()).filter(Boolean), categoryId: inbox.id, scope: 'projects', projectIds: [projectId] }, imagePath)
      setShowImageImport(false)
      setImagePath('')
      setPage(1)
      await refreshPage()
      await openMaterial(material.id)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setImageSaving(false)
    }
  }

  const openMaterialSource = () => {
    if (!selectedMaterial?.sourceDocumentId || !sourceStatus?.documentExists || !sourceStatus.sectionExists) return
    setSourceTarget({
      documentId: selectedMaterial.sourceDocumentId,
      sectionId: selectedMaterial.sourceSectionId,
    })
    setShowDocuments(true)
  }

  return (
    <div className={`material-workspace${selectedMaterial || documentSelected ? ' narrow-detail' : ''}`}>
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
          <button className={showDocuments ? 'active' : ''} onClick={() => { setShowDocuments(true); setDocumentSelected(false); setSelectedMaterial(null); }}>
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
          <Button variant="primary" size="md" onClick={() => { setShowDocuments(false); setDocumentSelected(false); setSelectedMaterial(null); setShowEditor(true) }}>＋ 新建素材</Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowWebCapture(true) }}>网页摘录</Button>
          <Button variant="secondary" size="sm" onClick={() => { void chooseMarkdown() }}>导入 Markdown</Button>
          <Button variant="secondary" size="sm" onClick={() => { void chooseImage() }}>图片参考</Button>
        </div>
      </aside>

      {showDocuments ? <MaterialDocumentWorkspace projectId={projectId} categories={categories} kinds={kinds} initialDocumentId={sourceTarget?.documentId} initialSectionId={sourceTarget?.sectionId} onSourceOpened={() => { setSourceTarget(null) }} onSelectionChange={setDocumentSelected} /> : <>
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
              <Button variant="text" size="sm" className="material-narrow-back" onClick={() => { setSelectedMaterial(null); setSelectedPlainText(''); setImagePreviews([]); setSourceStatus(null) }}>← 返回素材列表</Button>
              <div className="material-detail-heading">
                <div className="material-detail-eyebrow">
                  <span>{kindMap.get(selectedMaterial.kindId) ?? '未知类型'}</span>
                  <span>{categoryMap.get(selectedMaterial.categoryId) ?? '未知分类'}</span>
                </div>
                <h2>{selectedMaterial.title}</h2>
              </div>
              <div className="material-detail-actions">
                <Button variant="secondary" size="sm" onClick={addSelectedToContext} disabled={!currentChapter || !selectedPlainText || selectedMaterial.sourceType === 'image'} title={selectedMaterial.sourceType === 'image' ? '图片参考不加入 AI 上下文' : currentChapter ? '加入本章 AI 上下文' : '请先在写作页选择章节'}>加入本章上下文</Button>
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
              {imagePreviews.length > 0 && (
                <section className="material-detail-section material-image-section">
                  <h3>图片附件</h3>
                  <div className="material-image-list">
                    {imagePreviews.map((preview) => (
                      <figure key={preview.attachment.id}>
                        <img src={preview.url} alt={selectedMaterial.title} />
                        <figcaption>{preview.attachment.originalName} · {formatBytes(preview.attachment.size)}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
              <section className="material-detail-section material-metadata-section">
                <h3>整理信息</h3>
                <dl>
                  <div><dt>来源</dt><dd>{SOURCE_LABELS[selectedMaterial.sourceType]}{selectedMaterial.sourceName ? ` · ${selectedMaterial.sourceName}` : ''}{selectedMaterial.sourceLocator ? ` · ${selectedMaterial.sourceLocator}` : ''}{selectedMaterial.sourceDocumentId && sourceStatus && (!sourceStatus.documentExists ? <span className="material-source-missing">来源已删除</span> : !sourceStatus.sectionExists ? <span className="material-source-missing">来源章节已删除</span> : <button className="material-source-open" onClick={openMaterialSource}>打开来源</button>)}</dd></div>
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
            <Button variant="secondary" size="md" disabled={deleteSaving} onClick={() => { setDeleteTarget(null); }}>取消</Button>
            <Button variant="danger" size="md" loading={deleteSaving} onClick={() => { void handleDelete() }}>删除</Button>
          </div>
        </Modal>
      )}
      {showWebCapture && (
        <Modal className="material-document-import-modal">
          <h2>网页摘录</h2>
          {!webPreview ? <><input value={webUrl} onChange={(event) => { setWebUrl(event.target.value) }} placeholder="https://example.com/article" /><div className="material-modal-footer"><Button variant="secondary" size="md" onClick={() => { setShowWebCapture(false); setWebUrl('') }}>取消</Button><Button variant="primary" size="md" loading={webLoading} onClick={() => { void fetchWebPreview() }} disabled={!webUrl.trim()}>获取预览</Button></div></> : <><input value={webTitle} onChange={(event) => { setWebTitle(event.target.value) }} placeholder="素材标题" /><select value={webKindId} onChange={(event) => { setWebKindId(event.target.value) }}>{kinds.filter((kind) => !kind.archived).map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select><select value={webCategoryId} onChange={(event) => { setWebCategoryId(event.target.value) }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><div className="material-document-excerpt-preview">{webPreview.content}</div><div className="material-modal-footer"><Button variant="secondary" size="md" disabled={webSaving} onClick={() => { setWebPreview(null) }}>重新选择</Button><Button variant="primary" size="md" loading={webSaving} onClick={() => { void saveWebMaterial() }}>保存素材</Button></div></>}
        </Modal>
      )}
      {showMarkdownImport && (
        <Modal className="material-document-import-modal"><h2>导入 Markdown</h2><input value={markdownName} onChange={(event) => { setMarkdownName(event.target.value) }} placeholder="素材标题" /><select value={markdownKindId} onChange={(event) => { setMarkdownKindId(event.target.value) }}>{kinds.filter((kind) => !kind.archived).map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select><select value={markdownCategoryId} onChange={(event) => { setMarkdownCategoryId(event.target.value) }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><div className="material-document-excerpt-preview">{markdownContent}</div><div className="material-modal-footer"><Button variant="secondary" size="md" disabled={markdownSaving} onClick={() => { setShowMarkdownImport(false); setMarkdownContent('') }}>取消</Button><Button variant="primary" size="md" loading={markdownSaving} onClick={() => { void saveMarkdown() }}>保存素材</Button></div></Modal>
      )}
      {showImageImport && <Modal className="material-document-import-modal"><h2>图片参考</h2><img className="material-image-import-preview" src={convertFileSrc(imagePath)} alt="图片预览" /><input value={imageTitle} onChange={(event) => { setImageTitle(event.target.value) }} placeholder="素材标题" /><textarea value={imageDescription} onChange={(event) => { setImageDescription(event.target.value) }} rows={3} placeholder="图片说明" /><input value={imageSourceName} onChange={(event) => { setImageSourceName(event.target.value) }} placeholder="来源名称" /><input value={imageTags} onChange={(event) => { setImageTags(event.target.value) }} placeholder="标签，用逗号分隔" /><div className="material-modal-footer"><Button variant="secondary" size="md" disabled={imageSaving} onClick={() => { setShowImageImport(false); setImagePath('') }}>取消</Button><Button variant="primary" size="md" loading={imageSaving} onClick={() => { void saveImage() }}>保存素材</Button></div></Modal>}
    </div>
  )
}
