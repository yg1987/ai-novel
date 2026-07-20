import { open } from '@tauri-apps/plugin-dialog'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createMaterial,
  deleteMaterialDocument,
  getMaterialDocument,
  importMaterialDocument,
  listMaterialDocuments,
  previewMaterialDocumentImport,
  readMaterialDocumentSection,
  searchMaterialDocumentSections,
} from '../api/tauri'
import type {
  MaterialDocumentDetail,
  MaterialDocumentImportPreview,
  MaterialDocumentPage,
  MaterialDocumentSearchResult,
  MaterialDocumentSectionContent,
  MaterialCategory,
  MaterialKindDefinition,
  TxtSectionEdit,
} from '../types/material'
import Button from './Button'
import Modal from './Modal'
import Pagination from './Pagination'
import './MaterialDocumentWorkspace.css'

interface Props {
  projectId: string
  categories: MaterialCategory[]
  kinds: MaterialKindDefinition[]
  initialDocumentId?: string
  initialSectionId?: string
  onSourceOpened?: () => void
  onSelectionChange?: (selected: boolean) => void
}

const EMPTY_PAGE: MaterialDocumentPage = {
  items: [],
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export default function MaterialDocumentWorkspace({ projectId, categories, kinds, initialDocumentId, initialSectionId, onSourceOpened, onSelectionChange }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [documentPage, setDocumentPage] = useState<MaterialDocumentPage>(EMPTY_PAGE)
  const [selected, setSelected] = useState<MaterialDocumentDetail | null>(null)
  const [sectionContent, setSectionContent] = useState<MaterialDocumentSectionContent | null>(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MaterialDocumentSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [sourcePath, setSourcePath] = useState('')
  const [preview, setPreview] = useState<MaterialDocumentImportPreview | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewAuthor, setPreviewAuthor] = useState('')
  const [txtMode, setTxtMode] = useState<'detected_sections' | 'single'>('detected_sections')
  const [txtSectionEdits, setTxtSectionEdits] = useState<TxtSectionEdit[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [scope, setScope] = useState<'global' | 'projects'>('projects')
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MaterialDocumentDetail | null>(null)
  const [excerpt, setExcerpt] = useState('')
  const [showExcerpt, setShowExcerpt] = useState(false)
  const [excerptTitle, setExcerptTitle] = useState('')
  const [excerptKindId, setExcerptKindId] = useState('')
  const [excerptCategoryId, setExcerptCategoryId] = useState('')
  const [excerptTags, setExcerptTags] = useState('')
  const [excerptScope, setExcerptScope] = useState<'global' | 'projects'>('projects')
  const [excerptLocator, setExcerptLocator] = useState('')
  const [excerptSaving, setExcerptSaving] = useState(false)
  const readerRef = useRef<HTMLPreElement>(null)
  const openRequestRef = useRef(0)
  const searchRequestRef = useRef(0)

  const refreshDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const next = await listMaterialDocuments(projectId, page, pageSize)
      setDocumentPage(next)
      if (next.page !== page) setPage(next.page)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, projectId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshDocuments() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [refreshDocuments])

  const openDocument = useCallback(async (documentId: string, sectionId?: string) => {
    const requestId = ++openRequestRef.current
    setError(null)
    try {
      const detail = await getMaterialDocument(documentId)
      if (requestId !== openRequestRef.current) return
      setSelected(detail)
      onSelectionChange?.(true)
      const section = sectionId ?? detail.sections[0]?.id
      if (section) {
        const content = await readMaterialDocumentSection(documentId, section)
        if (requestId !== openRequestRef.current) return
        setSectionContent(content)
      } else {
        setSectionContent(null)
      }
    } catch (cause) {
      setError(String(cause))
    }
  }, [onSelectionChange])

  useEffect(() => {
    if (!initialDocumentId) return
    const timer = window.setTimeout(() => {
      void openDocument(initialDocumentId, initialSectionId).finally(() => { onSourceOpened?.() })
    }, 0)
    return () => { window.clearTimeout(timer) }
  }, [initialDocumentId, initialSectionId, onSourceOpened, openDocument])

  const handleSearch = useCallback(async (value: string) => {
    const requestId = ++searchRequestRef.current
    setQuery(value)
    const normalized = value.trim()
    if (!normalized) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      const results = await searchMaterialDocumentSections(normalized, projectId, 40)
      if (requestId === searchRequestRef.current) setSearchResults(results)
    } catch (cause) {
      if (requestId === searchRequestRef.current) setError(String(cause))
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false)
    }
  }, [projectId])

  const chooseSource = async () => {
    setPreviewLoading(true)
    try {
      const selectedPath = await open({
        filters: [{ name: '小说与长文本', extensions: ['txt', 'epub'] }],
        multiple: false,
      })
      if (typeof selectedPath !== 'string') return
      setSourcePath(selectedPath)
      const nextPreview = await previewMaterialDocumentImport(selectedPath)
      setPreview(nextPreview)
      setPreviewTitle(nextPreview.title)
      setPreviewAuthor(nextPreview.author)
      setTxtMode('detected_sections')
      setTxtSectionEdits(nextPreview.sections.map((section) => ({
        order: section.order,
        title: section.title,
        mergeWithPrevious: false,
      })))
    } catch (cause) {
      setError(String(cause))
    } finally {
      setPreviewLoading(false)
    }
  }

  const importDocument = async () => {
    if (!sourcePath || !preview) return
    setImporting(true)
    try {
      const document = await importMaterialDocument(
        sourcePath,
        scope,
        scope === 'projects' ? [projectId] : [],
        {
          title: previewTitle,
          author: previewAuthor,
          ...(preview.format === 'txt' ? {
            txtMode,
            txtSectionEdits: txtMode === 'detected_sections' ? txtSectionEdits : [],
          } : {}),
        },
      )
      setShowImport(false)
      setSourcePath('')
      setPreview(null)
      setPage(1)
      await refreshDocuments()
      await openDocument(document.id)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setImporting(false)
    }
  }

  const deleteDocument = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteMaterialDocument(deleteTarget.document.id)
      setDeleteTarget(null)
      setSelected(null)
      setSectionContent(null)
      onSelectionChange?.(false)
      await refreshDocuments()
      if (result.cleanupPending) {
        setError('资料源已删除，部分文件正在等待下次启动重试清理')
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setDeleting(false)
    }
  }

  const captureExcerpt = () => {
    const selection = window.getSelection()
    const reader = readerRef.current
    if (!selection || selection.rangeCount === 0 || !reader || !sectionContent) return
    const range = selection.getRangeAt(0)
    if (!reader.contains(range.commonAncestorContainer)) return
    const value = selection.toString().trim()
    if (!value) return
    const prefix = range.cloneRange()
    prefix.selectNodeContents(reader)
    prefix.setEnd(range.startContainer, range.startOffset)
    const start = prefix.toString().length
    const end = start + selection.toString().length
    setExcerpt(value)
    setExcerptTitle(`${selected?.document.title ?? '资料'}摘录`)
    setExcerptKindId(kinds.find((kind) => !kind.archived)?.id ?? '')
    setExcerptCategoryId(categories.find((category) => category.systemKey === 'inbox')?.id ?? '')
    setExcerptTags('')
    setExcerptScope('projects')
    setExcerptLocator(`${sectionContent.section.title} · 字符 ${start + 1}-${end}`)
  }

  const saveExcerpt = async () => {
    if (!selected || !sectionContent || !excerpt || !excerptTitle.trim() || !excerptKindId || !excerptCategoryId) return
    setExcerptSaving(true)
    try {
      await createMaterial({
        title: excerptTitle,
        kindId: excerptKindId,
        content: excerpt,
        sourceType: 'book',
        sourceName: selected.document.title,
        categoryId: excerptCategoryId,
        tags: excerptTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
        scope: excerptScope,
        projectIds: excerptScope === 'projects' ? [projectId] : [],
        sourceDocumentId: selected.document.id,
        sourceSectionId: sectionContent.section.id,
        sourceLocator: excerptLocator || sectionContent.section.title,
      })
      setShowExcerpt(false)
      setExcerpt('')
    } catch (cause) {
      setError(String(cause))
    } finally {
      setExcerptSaving(false)
    }
  }

  return (
    <div className={`material-document-workspace${selected ? ' has-selection' : ''}`}>
      <section className="material-list-pane material-document-list-pane">
        <div className="material-list-toolbar">
          <div className="material-document-toolbar-title">
            <h3>资料源</h3>
            <span>{documentPage.totalItems} 本当前项目可见</span>
          </div>
          <input
            className="material-search-input"
            value={query}
            onChange={(event) => { void handleSearch(event.target.value) }}
            placeholder="搜索书内章节内容"
          />
          <Button variant="primary" size="sm" onClick={() => { setShowImport(true) }}>导入 TXT / EPUB</Button>
        </div>
        {error && <div className="material-error material-list-error" role="alert"><span>{error}</span><button onClick={() => { setError(null) }} title="关闭">×</button></div>}
        <div className="material-list-scroll">
          {loading && <div className="material-state">正在加载资料源...</div>}
          {!loading && searching && <div className="material-state">正在搜索书内章节...</div>}
          {!loading && !searching && searchResults.map((result) => (
            <button key={`${result.documentId}-${result.sectionId}`} className="material-list-item" onClick={() => { void openDocument(result.documentId, result.sectionId) }}>
              <div className="material-list-title-row"><strong>{result.documentTitle}</strong><span>{result.sectionTitle}</span></div>
              <p>{result.snippet}</p>
            </button>
          ))}
          {!loading && !query && documentPage.items.length === 0 && (
            <div className="material-state"><strong>这里还没有资料源</strong><Button variant="primary" size="sm" onClick={() => { setShowImport(true) }}>导入资料</Button></div>
          )}
          {!loading && !query && documentPage.items.map((document) => (
            <button key={document.id} className={`material-list-item${selected?.document.id === document.id ? ' active' : ''}`} onClick={() => { void openDocument(document.id) }}>
              <div className="material-list-title-row"><strong>{document.title}</strong><span>{document.format.toUpperCase()}</span></div>
              <p>{document.author || '作者未知'} · {document.sectionCount} 个章节</p>
              <div className="material-list-meta"><span>{document.scope === 'global' ? '全局可用' : '当前项目'}</span><time>{formatDate(document.updatedAt)}</time></div>
            </button>
          ))}
        </div>
        {!query && <div className="material-list-pagination"><Pagination currentPage={documentPage.page} totalPages={documentPage.totalPages} totalItems={documentPage.totalItems} pageSize={pageSize} pageSizeOptions={[20, 40, 80]} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1) }} /></div>}
      </section>

      <main className="material-detail-pane material-document-detail-pane">
        {selected ? (
          <>
            <header className="material-detail-header">
              <Button variant="text" size="sm" className="material-narrow-back" onClick={() => { setSelected(null); setSectionContent(null); onSelectionChange?.(false) }}>← 返回资料列表</Button>
              <div className="material-detail-heading"><div className="material-detail-eyebrow"><span>{selected.document.format.toUpperCase()}</span><span>{selected.document.scope === 'global' ? '全局资料源' : '当前项目资料源'}</span></div><h2>{selected.document.title}</h2></div>
              <div className="material-detail-actions"><Button variant="secondary" size="sm" disabled={!excerpt} onClick={() => { setShowExcerpt(true) }}>摘为素材</Button><Button variant="text" size="sm" className="material-delete-button" onClick={() => { setDeleteTarget(selected) }}>删除</Button></div>
            </header>
            <div className="material-document-reader">
              <aside className="material-document-toc">
                <div className="material-document-author">{selected.document.author || '作者未知'}</div>
                {selected.sections.map((section) => <button key={section.id} className={sectionContent?.section.id === section.id ? 'active' : ''} onClick={() => { void openDocument(selected.document.id, section.id) }}>{section.title}</button>)}
              </aside>
              <article className="material-document-content"><h3>{sectionContent?.section.title ?? '选择章节'}</h3><pre ref={readerRef} onMouseUp={captureExcerpt}>{sectionContent?.content ?? ''}</pre></article>
            </div>
          </>
        ) : <div className="material-state material-detail-empty"><strong>选择一份资料源阅读目录和章节</strong></div>}
      </main>

      {showImport && <Modal className="material-document-import-modal">
        <h2>导入资料源</h2>
        {!preview ? <Button variant="primary" size="md" loading={previewLoading} onClick={() => { void chooseSource() }}>选择 TXT 或 EPUB</Button> : <>
          <div className="material-document-preview-fields">
            <label><span>书名</span><input value={previewTitle} maxLength={200} onChange={(event) => { setPreviewTitle(event.target.value) }} /></label>
            <label><span>作者</span><input value={previewAuthor} maxLength={200} onChange={(event) => { setPreviewAuthor(event.target.value) }} placeholder="可选" /></label>
          </div>
          <dl className="material-document-preview-meta">
            <div><dt>格式</dt><dd>{preview.format.toUpperCase()}</dd></div>
            <div><dt>章节</dt><dd>{preview.sections.length}</dd></div>
            {preview.detectedEncoding && <div><dt>检测编码</dt><dd>{preview.detectedEncoding}</dd></div>}
          </dl>
          {preview.format === 'txt' && <div className="material-document-import-mode"><span>导入方式</span><div className="material-segmented"><button type="button" className={txtMode === 'detected_sections' ? 'active' : ''} onClick={() => { setTxtMode('detected_sections') }}>按识别章节</button><button type="button" className={txtMode === 'single' ? 'active' : ''} onClick={() => { setTxtMode('single') }}>单篇长文本</button></div></div>}
          {txtMode === 'detected_sections' || preview.format === 'epub' ? (
            <div className="material-document-preview-sections">
              {preview.sections.map((section) => preview.format === 'txt' ? (
                <div className="material-document-section-edit" key={section.order}>
                  <span>{section.order + 1}</span>
                  <input value={txtSectionEdits[section.order]?.title ?? section.title} maxLength={200} onChange={(event) => { setTxtSectionEdits((current) => current.map((edit) => edit.order === section.order ? { ...edit, title: event.target.value } : edit)) }} />
                  <small>{section.characterCount} 字 · {section.contentPreview || '无正文预览'}</small>
                  {section.order > 0 && <label><input type="checkbox" checked={txtSectionEdits[section.order]?.mergeWithPrevious ?? false} onChange={(event) => { setTxtSectionEdits((current) => current.map((edit) => edit.order === section.order ? { ...edit, mergeWithPrevious: event.target.checked } : edit)) }} /><span>合并到上一节</span></label>}
                </div>
              ) : <div key={section.order}>{section.order + 1}. {section.title} · {section.characterCount} 字</div>)}
            </div>
          ) : <div className="material-document-single-summary">将全文作为一个连续章节导入，共 {preview.sections.reduce((total, section) => total + section.characterCount, 0)} 字。</div>}
          <label className="material-document-scope"><span>可见范围</span><select value={scope} onChange={(event) => { setScope(event.target.value as 'global' | 'projects') }}><option value="projects">当前项目</option><option value="global">所有项目</option></select></label>
        </>}
        <div className="material-modal-footer"><Button variant="secondary" size="md" disabled={importing} onClick={() => { setShowImport(false); setPreview(null); setSourcePath('') }}>取消</Button>{preview && <Button variant="primary" size="md" loading={importing} onClick={() => { void importDocument() }} disabled={!previewTitle.trim() || (preview.format === 'txt' && txtMode === 'detected_sections' && txtSectionEdits.some((edit) => !edit.title.trim()))}>确认导入</Button>}</div>
      </Modal>}

      {deleteTarget && <Modal className="material-confirm-modal"><h2>删除资料源</h2><p>确定删除「{deleteTarget.document.title}」？将删除原始附件和 {deleteTarget.sections.length} 个章节；已摘出的素材会保留。</p><div className="material-modal-footer"><Button variant="secondary" size="md" disabled={deleting} onClick={() => { setDeleteTarget(null) }}>取消</Button><Button variant="danger" size="md" loading={deleting} onClick={() => { void deleteDocument() }}>删除</Button></div></Modal>}

      {showExcerpt && <Modal className="material-document-import-modal"><h2>摘为素材</h2><input value={excerptTitle} onChange={(event) => { setExcerptTitle(event.target.value) }} placeholder="素材标题" /><select value={excerptKindId} onChange={(event) => { setExcerptKindId(event.target.value) }}>{kinds.filter((kind) => !kind.archived).map((kind) => <option key={kind.id} value={kind.id}>{kind.name}</option>)}</select><select value={excerptCategoryId} onChange={(event) => { setExcerptCategoryId(event.target.value) }}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><input value={excerptTags} onChange={(event) => { setExcerptTags(event.target.value) }} placeholder="标签，用逗号分隔" /><div className="material-segmented"><button type="button" className={excerptScope === 'projects' ? 'active' : ''} onClick={() => { setExcerptScope('projects') }}>当前项目</button><button type="button" className={excerptScope === 'global' ? 'active' : ''} onClick={() => { setExcerptScope('global') }}>全局素材</button></div><div className="material-document-excerpt-preview">{excerpt}</div><div className="material-modal-footer"><Button variant="secondary" size="md" disabled={excerptSaving} onClick={() => { setShowExcerpt(false) }}>取消</Button><Button variant="primary" size="md" loading={excerptSaving} onClick={() => { void saveExcerpt() }}>保存素材</Button></div></Modal>}
    </div>
  )
}
