import { useEffect, useMemo, useState } from 'react'
import { listChapters } from '../../api/tauri'
import { loadCharacterCatalog } from '../../services/characterCatalog'
import { loadCharacterModuleConfig } from '../../services/characterConfig'
import { loadCharacterRelationships, saveCharacterRelationships } from '../../services/characterRelations'
import { buildChapterSequence } from '../../services/chapterCatalog'
import type { ChapterRef } from '../../types/chapter'
import type { CharacterRecord, CharacterRelationship, CharacterRelationshipStore, RelationshipPeriod, RelationshipTypeDefinition } from '../../types/character'
import Button from '../Button'
import Modal from '../Modal'

interface Props {
  projectId: string
  sourceCharacterId: string
  relationshipId?: string
  initialTargetId?: string
  onSaved: () => void
  onClose: () => void
}
interface LoadedState {
  store: CharacterRelationshipStore
  records: CharacterRecord[]
  types: RelationshipTypeDefinition[]
  chapters: Awaited<ReturnType<typeof listChapters>>
}

const refKey = (reference?: ChapterRef): string => reference ? `${reference.volume}\u0000${reference.chapterId}` : ''

function parseRef(value: string): ChapterRef | undefined {
  if (!value) return undefined
  const [volume, chapterId] = value.split('\u0000')
  return volume && chapterId ? { volume, chapterId } : undefined
}

function newRelationship(sourceCharacterId: string, targetCharacterId: string, typeId: string): CharacterRelationship {
  const timestamp = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    characterAId: sourceCharacterId,
    characterBId: targetCharacterId,
    direction: 'undirected',
    periods: [{ id: crypto.randomUUID(), typeId, status: 'active', description: '' }],
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function relationshipDraftForSource(record: CharacterRelationship, sourceCharacterId: string): CharacterRelationship {
  const clone = { ...record, periods: record.periods.map((period) => ({ ...period })) }
  if (record.characterAId === sourceCharacterId || record.characterBId !== sourceCharacterId) return clone
  const direction = record.direction === 'a-to-b' ? 'b-to-a' : record.direction === 'b-to-a' ? 'a-to-b' : 'undirected'
  return { ...clone, characterAId: sourceCharacterId, characterBId: record.characterAId, direction }
}

export default function RelationshipEditorDialog({ projectId, sourceCharacterId, relationshipId, initialTargetId, onSaved, onClose }: Props) {
  const [loaded, setLoaded] = useState<LoadedState | null>(null)
  const [draft, setDraft] = useState<CharacterRelationship | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const config = await loadCharacterModuleConfig(projectId)
        const [catalogResult, store, chapters] = await Promise.all([
          loadCharacterCatalog(projectId, config),
          loadCharacterRelationships(projectId),
          listChapters(projectId),
        ])
        if (cancelled) return
        const existing = relationshipId
          ? store.relationships.find((item) => item.id === relationshipId)
          : store.relationships.find((item) => initialTargetId && [item.characterAId, item.characterBId].includes(sourceCharacterId) && [item.characterAId, item.characterBId].includes(initialTargetId))
        const targetId = initialTargetId ?? catalogResult.catalog.records.find((record) => record.id !== sourceCharacterId)?.id ?? ''
        const nextDraft = existing
          ? relationshipDraftForSource(existing, sourceCharacterId)
          : newRelationship(sourceCharacterId, targetId, config.relationshipTypes[0]?.id ?? 'ambiguous')
        setLoaded({ store, records: catalogResult.catalog.records, types: config.relationshipTypes, chapters })
        setDraft(nextDraft)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [initialTargetId, projectId, relationshipId, sourceCharacterId])

  const recordById = useMemo(() => new Map(loaded?.records.map((record) => [record.id, record]) ?? []), [loaded?.records])
  const isExisting = Boolean(loaded?.store.relationships.some((item) => item.id === draft?.id))

  const patchPeriod = (periodId: string, patch: Partial<RelationshipPeriod>) => {
    setDraft((current) => current ? {
      ...current,
      periods: current.periods.map((period) => period.id === periodId ? { ...period, ...patch } : period),
    } : current)
  }

  const handleTargetChange = (targetCharacterId: string) => {
    if (!loaded) return
    const existing = loaded.store.relationships.find((item) => (
      item.characterAId === sourceCharacterId && item.characterBId === targetCharacterId
    ) || (
      item.characterAId === targetCharacterId && item.characterBId === sourceCharacterId
    ))
    setDraft((current) => existing
      ? relationshipDraftForSource(existing, sourceCharacterId)
      : current ? { ...current, characterAId: sourceCharacterId, characterBId: targetCharacterId } : newRelationship(sourceCharacterId, targetCharacterId, loaded.types[0]?.id ?? 'ambiguous'))
    setConfirmingDelete(false)
    setError(null)
  }

  const handleSave = async () => {
    if (!loaded || !draft) return
    if (!draft.characterBId) { setError('请选择目标角色。'); return }
    setSaving(true)
    setError(null)
    try {
      const timestamp = new Date().toISOString()
      const nextRecord = { ...draft, updatedAt: timestamp }
      const relationships = isExisting
        ? loaded.store.relationships.map((item) => item.id === nextRecord.id ? nextRecord : item)
        : [...loaded.store.relationships, nextRecord]
      const sequence = buildChapterSequence(loaded.chapters)
      const chapterPosition = (reference: ChapterRef) => {
        const index = sequence.chapters.findIndex((chapter) => chapter.volume === reference.volume && chapter.id === reference.chapterId)
        return index >= 0 ? index + 1 : undefined
      }
      await saveCharacterRelationships(projectId, { ...loaded.store, relationships }, loaded.store.revision, new Set(loaded.records.map((record) => record.id)), chapterPosition)
      onSaved()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!loaded || !draft || !isExisting) return
    setSaving(true)
    setError(null)
    try {
      const relationships = loaded.store.relationships.filter((item) => item.id !== draft.id)
      await saveCharacterRelationships(projectId, { ...loaded.store, relationships }, loaded.store.revision, new Set(loaded.records.map((record) => record.id)))
      onSaved()
      onClose()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    } finally {
      setSaving(false)
    }
  }

  const typeLabel = (typeId: string) => loaded?.types.find((type) => type.id === typeId)?.label ?? `未知关系（${typeId}）`
  const nameA = draft ? recordById.get(draft.characterAId)?.name ?? '角色 A' : '角色 A'
  const nameB = draft ? recordById.get(draft.characterBId)?.name ?? '角色 B' : '角色 B'

  return (
    <Modal className="relationship-editor-dialog" onRequestClose={saving ? undefined : onClose}>
      <div className="relationship-editor-header">
        <div><h3>{isExisting ? '编辑手动关系' : '添加手动关系'}</h3><span>章节分析证据不会覆盖这里的作者确认数据</span></div>
      </div>
      {error && <div className="relationship-editor-error">{error}</div>}
      {loading || !loaded || !draft ? <p className="review-empty">正在加载关系资料…</p> : (
        <div className="modal-scroll-body relationship-editor-body">
          <div className="relationship-editor-grid">
            <label><span>起点角色</span><input className="notes-input" value={nameA} disabled /></label>
            <label>
              <span>目标角色</span>
              <select className="notes-input" value={draft.characterBId} disabled={isExisting} onChange={(event) => handleTargetChange(event.target.value)}>
                <option value="">请选择</option>
                {loaded.records.filter((record) => record.id !== draft.characterAId).map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
              </select>
            </label>
            <label className="relationship-editor-wide">
              <span>方向</span>
              <select className="notes-input" value={draft.direction} onChange={(event) => setDraft({ ...draft, direction: event.target.value as CharacterRelationship['direction'] })}>
                <option value="undirected">无方向</option>
                <option value="a-to-b">{nameA} → {nameB}</option>
                <option value="b-to-a">{nameB} → {nameA}</option>
              </select>
            </label>
          </div>
          <div className="relationship-period-heading"><strong>关系历史</strong><Button variant="text" size="xs" onClick={() => setDraft({ ...draft, periods: [...draft.periods, { id: crypto.randomUUID(), typeId: loaded.types[0]?.id ?? 'ambiguous', status: 'ended', description: '' }] })}>+ 阶段</Button></div>
          {draft.periods.map((period) => (
            <div key={period.id} className="relationship-period-row">
              <label><span>关系类型</span><select className="notes-input" value={period.typeId} onChange={(event) => patchPeriod(period.id, { typeId: event.target.value })}>{!loaded.types.some((type) => type.id === period.typeId) && <option value={period.typeId}>{typeLabel(period.typeId)}</option>}{loaded.types.slice().sort((left, right) => left.order - right.order).map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
              <label><span>状态</span><select className="notes-input" value={period.status} onChange={(event) => patchPeriod(period.id, { status: event.target.value as RelationshipPeriod['status'] })}><option value="active">当前</option><option value="ended">已结束</option><option value="uncertain">不确定</option></select></label>
              <label><span>开始章节</span><select className="notes-input" value={refKey(period.startChapter)} onChange={(event) => patchPeriod(period.id, { startChapter: parseRef(event.target.value) })}><option value="">未设置</option>{loaded.chapters.map((chapter) => <option key={`start-${chapter.volume}-${chapter.id}`} value={refKey({ volume: chapter.volume, chapterId: chapter.id })}>{chapter.volume} · {chapter.title || chapter.id}</option>)}</select></label>
              <label><span>结束章节</span><select className="notes-input" value={refKey(period.endChapter)} onChange={(event) => patchPeriod(period.id, { endChapter: parseRef(event.target.value) })}><option value="">未设置</option>{loaded.chapters.map((chapter) => <option key={`end-${chapter.volume}-${chapter.id}`} value={refKey({ volume: chapter.volume, chapterId: chapter.id })}>{chapter.volume} · {chapter.title || chapter.id}</option>)}</select></label>
              <label className="relationship-period-description"><span>说明</span><input className="notes-input" value={period.description} onChange={(event) => patchPeriod(period.id, { description: event.target.value })} /></label>
              <Button variant="ghost" size="xs" title="删除此关系阶段" aria-label="删除关系阶段" onClick={() => setDraft({ ...draft, periods: draft.periods.filter((item) => item.id !== period.id) })}>×</Button>
            </div>
          ))}
          <label className="relationship-notes"><span>关系备注</span><textarea className="notes-input" rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          {isExisting && <div className="relationship-delete-area">{confirmingDelete ? <><span>确认删除这条作者维护的关系记录？章节证据不会被删除。</span><Button variant="text" size="xs" onClick={() => setConfirmingDelete(false)}>取消</Button><Button variant="danger" size="xs" loading={saving} onClick={() => { void handleDelete() }}>确认删除</Button></> : <Button variant="text" size="sm" onClick={() => setConfirmingDelete(true)}>删除手动关系</Button>}</div>}
        </div>
      )}
      <div className="relationship-editor-footer"><Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>取消</Button><Button variant="primary" size="sm" loading={saving} disabled={loading || !draft} onClick={() => { void handleSave() }}>保存关系</Button></div>
    </Modal>
  )
}
