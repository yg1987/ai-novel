import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMaterial,
  getMaterialPlainText,
  initializeMaterialLibrary,
  listMaterialCategories,
  listMaterialKinds,
  listMaterials,
} from '../api/tauri'
import type {
  CurrentChapterRef,
  MaterialCategory,
  MaterialContextSelection,
  MaterialItem,
  MaterialKindDefinition,
  MaterialSummary,
} from '../types/material'
import Button from './Button'
import './MaterialSidebar.css'

interface Props {
  projectId: string
  currentChapter: CurrentChapterRef | null
  materialContextSelections: MaterialContextSelection[]
  onMaterialContextChange: (selections: MaterialContextSelection[]) => void
  onInsert: (materialId: string, text: string) => void
  onOpenMaterial: (materialId: string) => void
}

export default function MaterialSidebar({ projectId, currentChapter, materialContextSelections, onMaterialContextChange, onInsert, onOpenMaterial }: Props) {
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [kinds, setKinds] = useState<MaterialKindDefinition[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [materials, setMaterials] = useState<MaterialSummary[]>([])
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null)
  const [selectedPlainText, setSelectedPlainText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedExcerpt, setSelectedExcerpt] = useState('')

  const kindMap = useMemo(() => new Map(kinds.map((kind) => [kind.id, kind.name])), [kinds])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await initializeMaterialLibrary()
      const [nextCategories, nextKinds, page] = await Promise.all([
        listMaterialCategories(),
        listMaterialKinds(),
        listMaterials({
          projectId,
          categoryId: selectedCategory || undefined,
          query: query.trim() || undefined,
        }, 1, 100),
      ])
      setCategories(nextCategories)
      setKinds(nextKinds)
      setMaterials(page.items)
      if (selectedMaterial && !page.items.some((item) => item.id === selectedMaterial.id)) {
        setSelectedMaterial(null)
        setSelectedPlainText('')
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }, [projectId, query, selectedCategory, selectedMaterial])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [refresh])

  const handleSelect = async (materialId: string) => {
    setError(null)
    try {
      const [material, plainText] = await Promise.all([
        getMaterial(materialId),
        getMaterialPlainText(materialId),
      ])
      setSelectedMaterial(material)
      setSelectedPlainText(plainText)
      setSelectedExcerpt('')
    } catch (cause) {
      setSelectedMaterial(null)
      setSelectedPlainText('')
      setError(String(cause))
    }
  }

  const captureExcerpt = () => {
    const excerpt = window.getSelection()?.toString().trim() ?? ''
    if (excerpt) setSelectedExcerpt(excerpt)
  }

  const addToContext = () => {
    if (!selectedMaterial || !currentChapter) return
    if (selectedMaterial.sourceType === 'image') return
    const excerpt = selectedExcerpt || selectedPlainText
    if (!excerpt) return
    const next = materialContextSelections.filter((selection) => selection.materialId !== selectedMaterial.id)
    onMaterialContextChange([...next, { materialId: selectedMaterial.id, title: selectedMaterial.title, excerpt }])
  }

  return (
    <div className="material-sidebar">
      <div className="material-sidebar-header">
        <h4>素材库</h4>
        <span>{materials.length} 条</span>
      </div>
      {materialContextSelections.length > 0 && (
        <div className="material-context-list">
          <div><span>本章上下文 {materialContextSelections.length} 条</span><button onClick={() => { onMaterialContextChange([]) }}>清空</button></div>
          {materialContextSelections.map((selection) => <button key={selection.materialId} onClick={() => { onMaterialContextChange(materialContextSelections.filter((item) => item.materialId !== selection.materialId)) }}>{selection.title} ×</button>)}
        </div>
      )}

      <select
        className="material-category-select"
        value={selectedCategory}
        onChange={(event) => { setSelectedCategory(event.target.value); setSelectedMaterial(null); setSelectedPlainText('') }}
      >
        <option value="">全部可见素材</option>
        {[...categories].sort((a, b) => a.order - b.order).map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>
      <input className="material-search-input" value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder="搜索素材" />

      {error && <div className="material-sidebar-error">{error}</div>}
      <div className="material-file-list">
        {loading && <p className="material-empty">加载中…</p>}
        {!loading && materials.map((material) => (
          <button
            key={material.id}
            className={`material-file-item${selectedMaterial?.id === material.id ? ' active' : ''}`}
            onClick={() => { void handleSelect(material.id) }}
          >
            <strong>{material.title}</strong>
            <span>{kindMap.get(material.kindId) ?? '未知类型'}{material.favorite ? ' · ★' : ''}</span>
          </button>
        ))}
        {!loading && materials.length === 0 && <p className="material-empty">当前范围暂无素材</p>}
      </div>

      {selectedMaterial ? (
        <div className="material-preview">
          <div className="material-preview-header">
            <span className="material-filename">{selectedMaterial.title}</span>
            <Button variant="primary" size="sm" onClick={() => { onInsert(selectedMaterial.id, selectedExcerpt || selectedPlainText); }} disabled={selectedMaterial.sourceType === 'image' || !(selectedExcerpt || selectedPlainText)} title={selectedMaterial.sourceType === 'image' ? '图片参考不能插入正文' : undefined}>
              {selectedExcerpt ? '插入选文' : '插入全文'}
            </Button>
          </div>
          <pre className="material-preview-content" onMouseUp={captureExcerpt} onKeyUp={captureExcerpt}>{selectedPlainText || '（空）'}</pre>
          <div className="material-preview-actions">
            <Button variant="secondary" size="sm" onClick={addToContext} disabled={!currentChapter || !selectedPlainText || selectedMaterial.sourceType === 'image'} title={selectedMaterial.sourceType === 'image' ? '图片参考不加入 AI 上下文' : currentChapter ? '加入本章 AI 上下文' : '请先选择章节'}>{selectedExcerpt ? '加入选文上下文' : '加入本章上下文'}</Button>
            <Button variant="text" size="sm" onClick={() => { onOpenMaterial(selectedMaterial.id) }}>打开素材</Button>
          </div>
          {selectedExcerpt && <p className="material-sidebar-hint">已选择 {selectedExcerpt.length} 字，插入和上下文操作将使用选文。</p>}
        </div>
      ) : (
        <p className="material-empty material-sidebar-hint">选择素材后可预览并插入全文</p>
      )}
    </div>
  )
}
