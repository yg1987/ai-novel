import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMaterial,
  initializeMaterialLibrary,
  listMaterialCategories,
  listMaterialKinds,
  listMaterials,
} from '../api/tauri'
import type {
  MaterialCategory,
  MaterialItem,
  MaterialKindDefinition,
  MaterialSummary,
} from '../types/material'
import Button from './Button'
import './MaterialSidebar.css'

interface Props {
  projectId: string
  onInsert: (text: string) => void
}

export default function MaterialSidebar({ projectId, onInsert }: Props) {
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [kinds, setKinds] = useState<MaterialKindDefinition[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [materials, setMaterials] = useState<MaterialSummary[]>([])
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        }, 1, 100),
      ])
      setCategories(nextCategories)
      setKinds(nextKinds)
      setMaterials(page.items)
      if (selectedMaterial && !page.items.some((item) => item.id === selectedMaterial.id)) {
        setSelectedMaterial(null)
      }
    } catch (cause) {
      setError(String(cause))
    } finally {
      setLoading(false)
    }
  }, [projectId, selectedCategory, selectedMaterial])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [refresh])

  const handleSelect = async (materialId: string) => {
    setError(null)
    try {
      setSelectedMaterial(await getMaterial(materialId))
    } catch (cause) {
      setSelectedMaterial(null)
      setError(String(cause))
    }
  }

  return (
    <div className="material-sidebar">
      <div className="material-sidebar-header">
        <h4>素材库</h4>
        <span>{materials.length} 条</span>
      </div>

      <select
        className="material-category-select"
        value={selectedCategory}
        onChange={(event) => { setSelectedCategory(event.target.value); setSelectedMaterial(null) }}
      >
        <option value="">全部可见素材</option>
        {[...categories].sort((a, b) => a.order - b.order).map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>

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
            <Button variant="primary" size="sm" onClick={() => { onInsert(selectedMaterial.content); }} disabled={!selectedMaterial.content}>
              插入全文
            </Button>
          </div>
          <pre className="material-preview-content">{selectedMaterial.content || '（空）'}</pre>
        </div>
      ) : (
        <p className="material-empty material-sidebar-hint">选择素材后可预览并插入全文</p>
      )}
    </div>
  )
}
