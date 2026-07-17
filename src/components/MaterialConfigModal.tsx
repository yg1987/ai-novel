import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import type { MaterialCategory, MaterialKindDefinition } from '../types/material'
import Button from './Button'
import Modal from './Modal'

interface Props {
  categories: MaterialCategory[]
  kinds: MaterialKindDefinition[]
  onSave: (categories: MaterialCategory[], kinds: MaterialKindDefinition[]) => Promise<void>
  onRestorePresets: () => Promise<MaterialKindDefinition[]>
  onClose: () => void
}

type ConfirmTarget =
  | { type: 'category'; id: string; name: string }
  | { type: 'kind'; id: string; name: string }

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const copy = [...items]
  const [item] = copy.splice(index, 1)
  copy.splice(nextIndex, 0, item!)
  return copy
}

export default function MaterialConfigModal({
  categories: initialCategories,
  kinds: initialKinds,
  onSave,
  onRestorePresets,
  onClose,
}: Props) {
  const [tab, setTab] = useState<'categories' | 'kinds'>('categories')
  const [categories, setCategories] = useState(() => initialCategories.map((category) => ({ ...category })))
  const [kinds, setKinds] = useState(() => initialKinds.map((kind) => ({ ...kind })))
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryParent, setNewCategoryParent] = useState('')
  const [newKindName, setNewKindName] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sortedCategories = useMemo(() => {
    const roots = categories.filter((category) => !category.parentId).sort((a, b) => a.order - b.order)
    return roots.flatMap((root) => [
      root,
      ...categories.filter((category) => category.parentId === root.id).sort((a, b) => a.order - b.order),
    ])
  }, [categories])

  const addCategory = () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCategories((current) => [...current, {
      id: crypto.randomUUID(),
      name,
      parentId: newCategoryParent || null,
      order: current.filter((category) => category.parentId === (newCategoryParent || null)).length,
      systemKey: null,
    }])
    setNewCategoryName('')
  }

  const addKind = () => {
    const name = newKindName.trim()
    if (!name) return
    setKinds((current) => [...current, {
      id: crypto.randomUUID(),
      name,
      order: current.length,
      presetKey: null,
      archived: false,
    }])
    setNewKindName('')
  }

  const confirmRemove = () => {
    if (!confirmTarget) return
    if (confirmTarget.type === 'category') {
      const childIds = new Set(categories
        .filter((category) => category.parentId === confirmTarget.id)
        .map((category) => category.id))
      setCategories((current) => current.filter((category) => (
        category.id !== confirmTarget.id && !childIds.has(category.id)
      )))
    } else {
      setKinds((current) => current.map((kind) => (
        kind.id === confirmTarget.id ? { ...kind, archived: true } : kind
      )))
    }
    setConfirmTarget(null)
  }

  const moveCategory = (id: string, direction: -1 | 1) => {
    setCategories((current) => {
      const target = current.find((category) => category.id === id)
      if (!target) return current
      const siblings = current
        .filter((category) => category.parentId === target.parentId)
        .sort((a, b) => a.order - b.order)
      const index = siblings.findIndex((category) => category.id === id)
      const reordered = moveItem(siblings, index, direction)
      const orderMap = new Map(reordered.map((category, order) => [category.id, order]))
      return current.map((category) => orderMap.has(category.id)
        ? { ...category, order: orderMap.get(category.id)! }
        : category)
    })
  }

  const changeCategoryParent = (id: string, parentId: string) => {
    setCategories((current) => {
      const siblingCount = current.filter((category) => category.parentId === (parentId || null)).length
      return current.map((category) => category.id === id
        ? { ...category, parentId: parentId || null, order: siblingCount }
        : category)
    })
  }

  const moveKind = (id: string, direction: -1 | 1) => {
    setKinds((current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order)
      const index = sorted.findIndex((kind) => kind.id === id)
      return moveItem(sorted, index, direction).map((kind, order) => ({ ...kind, order }))
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(categories, kinds)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async () => {
    setSaving(true)
    setError(null)
    try {
      const restored = await onRestorePresets()
      setKinds(restored)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal className="material-config-modal">
        <div className="material-modal-header">
          <div>
            <h2>素材库设置</h2>
            <p>分类最多两级；归档类型不会影响已有素材</p>
          </div>
          <Button variant="text" size="sm" onClick={onClose} title="关闭">×</Button>
        </div>

        <div className="material-config-tabs" role="tablist">
          <button className={tab === 'categories' ? 'active' : ''} onClick={() => { setTab('categories'); }}>分类</button>
          <button className={tab === 'kinds' ? 'active' : ''} onClick={() => { setTab('kinds'); }}>类型</button>
        </div>

        {error && <div className="material-error" role="alert">{error}</div>}
        <div className="modal-scroll-body material-config-body">
          {tab === 'categories' ? (
            <>
              <div className="material-config-create">
                <input value={newCategoryName} onChange={(event) => { setNewCategoryName(event.target.value); }} placeholder="新分类名称" />
                <select value={newCategoryParent} onChange={(event) => { setNewCategoryParent(event.target.value); }}>
                  <option value="">一级分类</option>
                  {categories.filter((category) => !category.parentId && !category.systemKey).map((category) => (
                    <option key={category.id} value={category.id}>放在「{category.name}」下</option>
                  ))}
                </select>
                <Button variant="secondary" size="sm" onClick={addCategory} disabled={!newCategoryName.trim()}>添加</Button>
              </div>
              <div className="material-config-list">
                {sortedCategories.map((category) => (
                  <div className={`material-config-row${category.parentId ? ' child' : ''}`} key={category.id}>
                    <span className="material-config-grip" aria-hidden="true">⋮⋮</span>
                    <input
                      value={category.name}
                      disabled={category.systemKey === 'inbox'}
                      onChange={(event) => { setCategories((current) => current.map((candidate) => (
                        candidate.id === category.id ? { ...candidate, name: event.target.value } : candidate
                      ))); }}
                    />
                    {category.systemKey === 'inbox' && <span className="material-system-label">系统</span>}
                    {!category.systemKey && !categories.some((candidate) => candidate.parentId === category.id) && (
                      <select
                        className="material-parent-select"
                        value={category.parentId ?? ''}
                        onChange={(event) => { changeCategoryParent(category.id, event.target.value); }}
                        title="调整分类层级"
                      >
                        <option value="">一级</option>
                        {categories.filter((candidate) => !candidate.parentId && !candidate.systemKey && candidate.id !== category.id).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                        ))}
                      </select>
                    )}
                    <div className="material-config-actions">
                      <button onClick={() => { moveCategory(category.id, -1); }} title="上移">↑</button>
                      <button onClick={() => { moveCategory(category.id, 1); }} title="下移">↓</button>
                      {!category.systemKey && (
                        <button className="danger" onClick={() => { setConfirmTarget({ type: 'category', id: category.id, name: category.name }); }} title="删除">×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="material-config-create">
                <input value={newKindName} onChange={(event) => { setNewKindName(event.target.value); }} placeholder="新类型名称" />
                <Button variant="secondary" size="sm" onClick={addKind} disabled={!newKindName.trim()}>添加</Button>
                <Button variant="text" size="sm" onClick={() => { void handleRestore() }} disabled={saving}>恢复初始预设</Button>
              </div>
              <div className="material-config-list">
                {[...kinds].sort((a, b) => a.order - b.order).map((kind) => (
                  <div className={`material-config-row${kind.archived ? ' archived' : ''}`} key={kind.id}>
                    <span className="material-config-grip" aria-hidden="true">⋮⋮</span>
                    <input
                      value={kind.name}
                      onChange={(event) => { setKinds((current) => current.map((candidate) => (
                        candidate.id === kind.id ? { ...candidate, name: event.target.value } : candidate
                      ))); }}
                    />
                    {kind.presetKey && <span className="material-system-label">预设</span>}
                    {kind.archived && <span className="material-archived-label">已归档</span>}
                    <div className="material-config-actions">
                      <button onClick={() => { moveKind(kind.id, -1); }} title="上移">↑</button>
                      <button onClick={() => { moveKind(kind.id, 1); }} title="下移">↓</button>
                      {kind.archived ? (
                        <button onClick={() => { setKinds((current) => current.map((candidate) => candidate.id === kind.id ? { ...candidate, archived: false } : candidate)); }}>恢复</button>
                      ) : (
                        <button className="danger" onClick={() => { setConfirmTarget({ type: 'kind', id: kind.id, name: kind.name }); }}>归档</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="material-modal-footer">
          <Button variant="secondary" size="md" onClick={onClose}>取消</Button>
          <Button variant="primary" size="md" loading={saving} onClick={() => { void handleSave() }}>保存设置</Button>
        </div>
      </Modal>

      {confirmTarget && createPortal(
        <Modal className="material-confirm-modal">
          <h2>{confirmTarget.type === 'category' ? '删除分类' : '归档类型'}</h2>
          <p>
            {confirmTarget.type === 'category'
              ? `删除「${confirmTarget.name}」及其子分类？其中的素材会移动到收件箱。`
              : `归档「${confirmTarget.name}」？已有素材会保留，但新建素材时不再显示此类型。`}
          </p>
          <div className="material-modal-footer">
            <Button variant="secondary" size="md" onClick={() => { setConfirmTarget(null); }}>取消</Button>
            <Button variant="danger" size="md" onClick={confirmRemove}>{confirmTarget.type === 'category' ? '删除' : '归档'}</Button>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  )
}
