import { useEffect, useState } from 'react'
import { listChapters } from '../../api/tauri'
import { loadCharacterCatalog, resolveCharacterReferenceAsAlias, saveCharacterCatalog } from '../../services/characterCatalog'
import { getCharacterConnections, type CharacterConnections } from '../../services/characterConnections'
import { loadCharacterModuleConfig } from '../../services/characterConfig'
import { loadCharacterRelationships } from '../../services/characterRelations'
import { buildChapterSequence } from '../../services/chapterCatalog'
import { loadForeshadows } from '../../services/foreshadowStorage'
import { loadOrganizations } from '../../services/organizationStore'
import { loadChapterSnapshots } from '../../services/relationshipStore'
import type { ChapterMeta, ChapterRef } from '../../types/chapter'
import type { CharacterCatalog, CharacterModuleConfig, OrganizationStore, ReferenceDiagnostic } from '../../types/character'
import Button from '../Button'
import Modal from '../Modal'
import RelationshipEditorDialog from '../relationship-graph/RelationshipEditorDialog'

interface Props {
  projectId: string
  characterId: string
  view: 'relationships' | 'connections'
  onNavigateToCharacter?: (characterId: string) => void
  onNavigateToOrganization?: (organizationId: string) => void
  onNavigateToChapter?: (reference: ChapterRef) => void
  onNavigateToForeshadow?: (id: string) => void
}
interface LoadedData {
  connections: CharacterConnections
  catalog: CharacterCatalog
  organizations: OrganizationStore
  config: CharacterModuleConfig
  chapters: ChapterMeta[]
}

export default function CharacterConnectionsView({ projectId, characterId, view, onNavigateToCharacter, onNavigateToOrganization, onNavigateToChapter, onNavigateToForeshadow }: Props) {
  const [data, setData] = useState<LoadedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [repairDiagnostic, setRepairDiagnostic] = useState<ReferenceDiagnostic | null>(null)
  const [repairTargetId, setRepairTargetId] = useState('')
  const [repairError, setRepairError] = useState<string | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [editor, setEditor] = useState<{ relationshipId?: string; targetId?: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const config = await loadCharacterModuleConfig(projectId)
        const [catalogResult, organizations, relationshipStore, foreshadowStore, snapshots, chapters] = await Promise.all([
          loadCharacterCatalog(projectId, config),
          loadOrganizations(projectId),
          loadCharacterRelationships(projectId),
          loadForeshadows(projectId),
          loadChapterSnapshots(projectId),
          listChapters(projectId),
        ])
        if (cancelled) return
        setData({
          connections: getCharacterConnections(characterId, catalogResult.catalog, organizations, relationshipStore.relationships, foreshadowStore.entries, snapshots),
          catalog: catalogResult.catalog,
          organizations,
          config,
          chapters,
        })
        setError(null)
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [characterId, projectId, reloadKey])

  if (loading) return <div className="panel-placeholder">正在加载关联资料…</div>
  if (error || !data) return <div className="panel-placeholder">加载关联失败：{error ?? '未知错误'}</div>

  const characterById = new Map(data.catalog.records.map((record) => [record.id, record]))
  const organizationById = new Map(data.organizations.organizations.map((organization) => [organization.id, organization]))
  const sequence = buildChapterSequence(data.chapters)
  const chaptersByNumber = new Map(sequence.chapters.map((chapter, index) => [index + 1, chapter]))
  const diagnostics = data.connections.diagnostics.filter((diagnostic, index, all) => all.findIndex((item) => item.kind === diagnostic.kind && item.value === diagnostic.value) === index)

  const openRepair = (diagnostic: ReferenceDiagnostic) => {
    setRepairDiagnostic(diagnostic)
    setRepairTargetId(diagnostic.candidates?.length === 1 ? diagnostic.candidates[0]! : '')
    setRepairError(null)
  }

  const handleRepair = async () => {
    if (!repairDiagnostic || !repairTargetId) return
    setRepairing(true)
    setRepairError(null)
    try {
      const nextRecords = resolveCharacterReferenceAsAlias(data.catalog.records, repairDiagnostic.value, repairTargetId)
      const savedCatalog = await saveCharacterCatalog(projectId, { ...data.catalog, records: nextRecords }, data.catalog.revision)
      setData((current) => current ? { ...current, catalog: savedCatalog } : current)
      setRepairDiagnostic(null)
      setReloadKey((value) => value + 1)
    } catch (repairLoadError) {
      setRepairError(repairLoadError instanceof Error ? repairLoadError.message : String(repairLoadError))
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="character-connections-view">
      {view === 'relationships' ? (
        <>
          <div className="character-connections-heading"><strong>作者确认关系</strong><Button variant="secondary" size="sm" onClick={() => setEditor({})}>+ 添加关系</Button></div>
          {data.connections.relationships.length === 0 ? <p className="panel-empty">暂无手动关系，可从这里或关系图添加</p> : data.connections.relationships.map((relationship) => {
            const otherId = relationship.characterAId === characterId ? relationship.characterBId : relationship.characterAId
            const other = characterById.get(otherId)
            const current = relationship.periods.find((period) => !period.endChapter && period.status !== 'ended')
            const type = data.config.relationshipTypes.find((item) => item.id === current?.typeId)
            const direction = relationship.direction === 'undirected'
              ? '双向'
              : (relationship.direction === 'a-to-b') === (relationship.characterAId === characterId) ? '当前角色 → 对方' : '对方 → 当前角色'
            return (
              <div className="character-connection-row" key={relationship.id}>
                <button type="button" onClick={() => onNavigateToCharacter?.(otherId)}>{other?.name ?? '未知角色'}</button>
                <span>{type?.label ?? (current ? `未知关系（${current.typeId}）` : '仅有历史阶段')}</span>
                <span>{direction}</span>
                <span>{relationship.periods.length} 个阶段</span>
                <Button variant="text" size="xs" onClick={() => setEditor({ relationshipId: relationship.id })}>编辑</Button>
              </div>
            )
          })}
        </>
      ) : (
        <>
          <section><h4>组织归属</h4>{data.connections.organizationIds.length === 0 ? <p className="panel-empty">暂无组织归属</p> : data.connections.organizationIds.map((id) => <button type="button" className="character-connection-link" key={id} onClick={() => onNavigateToOrganization?.(id)}>{organizationById.get(id)?.name ?? '未知组织'}</button>)}</section>
          <section><h4>关联伏笔</h4>{data.connections.foreshadows.length === 0 ? <p className="panel-empty">暂无关联伏笔</p> : data.connections.foreshadows.map((entry) => <button type="button" className="character-connection-link" key={entry.id} onClick={() => onNavigateToForeshadow?.(entry.id)}>{entry.name}</button>)}</section>
          <section><h4>章节出场</h4>{data.connections.chapterNumbers.length === 0 ? <p className="panel-empty">章节快照中暂无出场记录</p> : data.connections.chapterNumbers.map((number) => { const chapter = chaptersByNumber.get(number); return chapter ? <button type="button" className="character-connection-link" key={`${chapter.volume}-${chapter.id}`} onClick={() => onNavigateToChapter?.({ volume: chapter.volume, chapterId: chapter.id })}>{chapter.volume} · {chapter.title || chapter.id}</button> : null })}</section>
          {diagnostics.length > 0 && <section><h4>待修复引用</h4>{diagnostics.map((diagnostic) => <div className="character-connection-diagnostic" key={`${diagnostic.kind}-${diagnostic.value}`}><span>{diagnostic.kind === 'ambiguous' ? '歧义' : '未解析'}：{diagnostic.value}</span><Button variant="text" size="xs" onClick={() => openRepair(diagnostic)}>修复</Button></div>)}</section>}
        </>
      )}
      {editor && <RelationshipEditorDialog projectId={projectId} sourceCharacterId={characterId} relationshipId={editor.relationshipId} initialTargetId={editor.targetId} onSaved={() => setReloadKey((value) => value + 1)} onClose={() => setEditor(null)} />}
      {repairDiagnostic && <Modal className="confirm-dialog" onRequestClose={repairing ? undefined : () => setRepairDiagnostic(null)}>
        <h3>修复角色引用</h3>
        <p>将“{repairDiagnostic.value}”登记为所选角色的别名。不会改写章节快照、伏笔正文或角色卡正文。</p>
        <label><span>对应角色</span><select className="notes-input" value={repairTargetId} onChange={(event) => setRepairTargetId(event.target.value)} disabled={repairing}><option value="">请选择角色</option>{data.catalog.records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>
        {repairError && <p className="character-field-conflict" role="alert">{repairError}</p>}
        <div className="dialog-footer"><Button variant="secondary" size="sm" onClick={() => setRepairDiagnostic(null)} disabled={repairing}>取消</Button><Button variant="primary" size="sm" loading={repairing} disabled={!repairTargetId} onClick={() => { void handleRepair() }}>登记别名</Button></div>
      </Modal>}
    </div>
  )
}
