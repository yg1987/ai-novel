import { useEffect, useMemo, useState } from 'react'
import { hashText, loadCharacterCatalog, syncCharacterCatalogRecord } from '../services/characterCatalog'
import { readProjectFile, saveCharacterBundle } from '../api/tauri'
import { defaultCharacterModuleConfig, loadCharacterModuleConfig } from '../services/characterConfig'
import { loadOrganizations, saveOrganizations } from '../services/organizationStore'
import { buildOrganizationDeletionPlan, descendantOrganizationIds, organizationProjectionAfterDeletion, organizationProjectionAfterRename } from '../services/organizationReferences'
import type { CharacterRecord, OrganizationRecord, OrganizationStore } from '../types/character'
import Button from './Button'
import Modal from './Modal'
import './OrganizationManager.css'
import { parseCharacterMarkdown, updateCharacterMarkdownField } from '../services/characterMarkdown'

interface Props {
  projectId: string
  initialOrganizationId?: string
  modal?: boolean
  onClose?: () => void
  onChange?: (organizations: OrganizationRecord[]) => void
  onCreated?: (organization: OrganizationRecord) => void
}

interface OrganizationDraft {
  id?: string
  name: string
  aliases: string
  kindId: string
  parentId: string
  description: string
  status: OrganizationRecord['status']
}

type DeleteMode = 'migrate' | 'detach'

interface ProjectionRetry {
  organizationId: string
  previousNames: string[]
  failedCharacterIds: string[]
}

const emptyStore = (): OrganizationStore => ({ schemaVersion: 1, revision: 0, organizations: [], updatedAt: '' })

function draftFromOrganization(organization?: OrganizationRecord, defaultKindId = ''): OrganizationDraft {
  return {
    id: organization?.id,
    name: organization?.name ?? '',
    aliases: organization?.aliases.join('，') ?? '',
    kindId: organization?.kindId ?? defaultKindId,
    parentId: organization?.parentId ?? '',
    description: organization?.description ?? '',
    status: organization?.status ?? 'active',
  }
}

function organizationDepth(organization: OrganizationRecord, byId: ReadonlyMap<string, OrganizationRecord>): number {
  let depth = 0
  let parentId = organization.parentId
  const visited = new Set([organization.id])
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth++
    parentId = byId.get(parentId)?.parentId
  }
  return depth
}

function OrganizationManagerBody({ projectId, initialOrganizationId, onClose, onChange, onCreated }: Omit<Props, 'modal'>) {
  const [store, setStore] = useState<OrganizationStore>(() => emptyStore())
  const [records, setRecords] = useState<CharacterRecord[]>([])
  const [kinds, setKinds] = useState(() => defaultCharacterModuleConfig().organizationKinds)
  const [selectedId, setSelectedId] = useState<string | null>(initialOrganizationId ?? null)
  const [draft, setDraft] = useState<OrganizationDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [projectionRetry, setProjectionRetry] = useState<ProjectionRetry | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('detach')
  const [deleteTargetId, setDeleteTargetId] = useState('')
  const [importCandidates, setImportCandidates] = useState<Array<{ name: string; description: string }>>([])
  const [selectedImports, setSelectedImports] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const config = await loadCharacterModuleConfig(projectId)
        const [organizations, catalogResult] = await Promise.all([
          loadOrganizations(projectId),
          loadCharacterCatalog(projectId, config),
        ])
        if (cancelled) return
        setKinds(config.organizationKinds)
        setStore(organizations)
        setRecords(catalogResult.catalog.records)
        setSelectedId((current) => {
          if (current && organizations.organizations.some((item) => item.id === current)) return current
          return initialOrganizationId && organizations.organizations.some((item) => item.id === initialOrganizationId)
            ? initialOrganizationId
            : organizations.organizations[0]?.id ?? null
        })
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [initialOrganizationId, projectId])

  const byId = useMemo(() => new Map(store.organizations.map((organization) => [organization.id, organization])), [store.organizations])
  const sortedOrganizations = useMemo(() => store.organizations.slice().sort((left, right) => {
    const depthDifference = organizationDepth(left, byId) - organizationDepth(right, byId)
    return depthDifference || left.name.localeCompare(right.name, 'zh-CN')
  }), [byId, store.organizations])
  const selected = selectedId ? byId.get(selectedId) : undefined
  const members = selected ? records.flatMap((record) => {
    const affiliation = record.affiliations.find((item) => item.organizationId === selected.id)
    return affiliation ? [{ record, affiliation }] : []
  }) : []
  const children = selected ? store.organizations.filter((organization) => organization.parentId === selected.id) : []
  const deletionTargets = useMemo(() => {
    if (!selected) return []
    const descendants = descendantOrganizationIds(store.organizations, selected.id)
    return store.organizations.filter((organization) => organization.id !== selected.id && !descendants.has(organization.id))
  }, [selected, store.organizations])
  const kindLabel = (kindId: string) => kinds.find((kind) => kind.id === kindId)?.label ?? (kindId || '未分类')

  const beginCreate = () => {
    setDraft(draftFromOrganization(undefined, kinds.slice().sort((left, right) => left.order - right.order)[0]?.id))
    setConfirmingDelete(false)
    setError(null)
    setNotice(null)
  }

  const beginEdit = () => {
    if (!selected) return
    setDraft(draftFromOrganization(selected))
    setConfirmingDelete(false)
    setError(null)
    setNotice(null)
  }

  const beginDelete = () => {
    const defaultTarget = deletionTargets[0]?.id ?? ''
    setDeleteMode((members.length > 0 || children.length > 0) && defaultTarget ? 'migrate' : 'detach')
    setDeleteTargetId(defaultTarget)
    setConfirmingDelete(true)
    setError(null)
    setNotice(null)
  }

  const syncOrganizationRenameProjections = async (
    organization: OrganizationRecord,
    previousNames: readonly string[],
    characterIds: readonly string[],
    organizations: readonly OrganizationRecord[],
  ): Promise<{ failedIds: string[]; failedNames: string[] }> => {
    const config = await loadCharacterModuleConfig(projectId)
    const failedIds: string[] = []
    const failedNames: string[] = []
    let latestRecords = records
    for (const characterId of characterIds) {
      let record = latestRecords.find((item) => item.id === characterId)
      try {
        const { catalog } = await loadCharacterCatalog(projectId, config)
        latestRecords = catalog.records
        record = catalog.records.find((item) => item.id === characterId)
        if (!record) continue
        const card = await readProjectFile(projectId, 'characters', record.fileName)
        const projection = parseCharacterMarkdown(card)
        const nextNames = organizationProjectionAfterRename(projection.organizations, previousNames, organization.name)
        if (nextNames.every((name, index) => name === projection.organizations[index]) && nextNames.length === projection.organizations.length) continue
        const nextCard = updateCharacterMarkdownField(card, '所属组织', nextNames)
        const nextCatalog = await syncCharacterCatalogRecord(catalog, record.fileName, nextCard, config, organizations)
        await saveCharacterBundle(projectId, record.fileName, nextCard, JSON.stringify(nextCatalog, null, 2), await hashText(card))
        latestRecords = nextCatalog.records
      } catch {
        failedIds.push(characterId)
        failedNames.push(record?.name ?? characterId)
      }
    }
    setRecords(latestRecords)
    return { failedIds, failedNames }
  }

  const retryOrganizationRenameProjections = async () => {
    if (!projectionRetry) return
    const organization = store.organizations.find((item) => item.id === projectionRetry.organizationId)
    if (!organization) {
      setProjectionRetry(null)
      setError('待重试的组织已不存在，无法继续更新角色卡投影。')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const result = await syncOrganizationRenameProjections(
        organization,
        projectionRetry.previousNames,
        projectionRetry.failedCharacterIds,
        store.organizations,
      )
      if (result.failedIds.length > 0) {
        setProjectionRetry({ ...projectionRetry, failedCharacterIds: result.failedIds })
        setError(`以下角色卡投影仍未更新：${result.failedNames.join('、')}。`)
      } else {
        setProjectionRetry(null)
        setNotice('角色卡中的组织名称投影已全部更新')
      }
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : String(retryError))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) { setError('组织名称不能为空。'); return }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const timestamp = new Date().toISOString()
      const previous = draft.id ? byId.get(draft.id) : undefined
      const aliases = draft.aliases.split(/[，,]/).map((item) => item.trim()).filter(Boolean)
      if (previous && previous.name !== name) aliases.push(previous.name)
      const organization: OrganizationRecord = {
        id: previous?.id ?? crypto.randomUUID(),
        name,
        aliases: [...new Set(aliases.filter((alias) => alias !== name))],
        kindId: draft.kindId,
        parentId: draft.parentId || undefined,
        description: draft.description.trim(),
        status: draft.status,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      const organizations = previous
        ? store.organizations.map((item) => item.id === previous.id ? organization : item)
        : [...store.organizations, organization]
      const saved = await saveOrganizations(projectId, { ...store, organizations }, store.revision)
      setStore(saved)
      setSelectedId(organization.id)
      setDraft(null)
      onChange?.(saved.organizations)
      if (!previous) onCreated?.(organization)
      if (previous && previous.name !== organization.name) {
        const previousNames = [previous.name, ...previous.aliases]
        const affectedCharacterIds = records
          .filter((item) => item.affiliations.some((affiliation) => affiliation.organizationId === previous.id))
          .map((item) => item.id)
        const result = await syncOrganizationRenameProjections(organization, previousNames, affectedCharacterIds, saved.organizations)
        if (result.failedIds.length > 0) {
          setProjectionRetry({ organizationId: organization.id, previousNames, failedCharacterIds: result.failedIds })
          setError(`组织已重命名，但以下角色卡投影更新失败：${result.failedNames.join('、')}。`)
        } else {
          setProjectionRetry(null)
          setNotice('组织及角色卡投影已保存')
        }
      } else {
        setNotice('组织已保存')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    const targetId = deleteMode === 'migrate' ? deleteTargetId : undefined
    if (deleteMode === 'migrate' && !targetId) { setError('请选择迁移目标组织。'); return }
    setSaving(true)
    setError(null)
    let processedCharacters = 0
    let totalCharacters = 0
    let latestRecords = records
    try {
      const config = await loadCharacterModuleConfig(projectId)
      let { catalog } = await loadCharacterCatalog(projectId, config)
      const plan = buildOrganizationDeletionPlan(catalog.records, store.organizations, selected.id, targetId)
      totalCharacters = plan.affectedCharacterIds.length
      const target = targetId ? store.organizations.find((organization) => organization.id === targetId) : undefined
      for (const characterId of plan.affectedCharacterIds) {
        const currentRecord = catalog.records.find((record) => record.id === characterId)
        const plannedRecord = plan.records.find((record) => record.id === characterId)
        if (!currentRecord || !plannedRecord) throw new Error('角色目录在迁移过程中发生变化，请刷新后重试。')
        const card = await readProjectFile(projectId, 'characters', currentRecord.fileName)
        const projection = parseCharacterMarkdown(card)
        const sourceAffiliation = currentRecord.affiliations.find((affiliation) => affiliation.organizationId === selected.id)
        const isCurrentAffiliation = Boolean(sourceAffiliation?.periods.some((period) => !period.endChapter && period.status !== 'former'))
        const organizationNames = organizationProjectionAfterDeletion(projection.organizations, selected, target, isCurrentAffiliation)
        const nextCard = updateCharacterMarkdownField(card, '所属组织', organizationNames)
        const projectedCatalog = await syncCharacterCatalogRecord(catalog, currentRecord.fileName, nextCard, config, store.organizations)
        const nextCatalog = {
          ...projectedCatalog,
          records: projectedCatalog.records.map((record) => record.id === characterId
            ? { ...record, affiliations: plannedRecord.affiliations }
            : record),
        }
        await saveCharacterBundle(projectId, currentRecord.fileName, nextCard, JSON.stringify(nextCatalog, null, 2), await hashText(card))
        catalog = nextCatalog
        latestRecords = catalog.records
        processedCharacters++
      }
      const saved = await saveOrganizations(projectId, { ...store, organizations: plan.organizations }, store.revision)
      setStore(saved)
      setRecords(catalog.records)
      setSelectedId(saved.organizations[0]?.id ?? null)
      setConfirmingDelete(false)
      setDeleteTargetId('')
      onChange?.(saved.organizations)
    } catch (deleteError) {
      setRecords(latestRecords)
      const message = deleteError instanceof Error ? deleteError.message : String(deleteError)
      setError(processedCharacters > 0
        ? `已处理 ${processedCharacters}/${totalCharacters} 张角色卡，组织尚未删除。${message}`
        : message)
    } finally {
      setSaving(false)
    }
  }

  const openImportPreview = async () => {
    setError(null)
    try {
      const content = await readProjectFile(projectId, 'worldview', 'forces.md')
      const existingNames = new Set(store.organizations.flatMap((organization) => [organization.name, ...organization.aliases]).map((name) => name.normalize('NFC').toLocaleLowerCase()))
      const candidates = content.split(/\r?\n/).flatMap((line) => {
        const match = /^\s*(?:[-*]\s*)?([^#：:\n]{2,40})[：:]\s*(.+?)\s*$/.exec(line)
        if (!match) return []
        const name = match[1]!.trim()
        if (existingNames.has(name.normalize('NFC').toLocaleLowerCase())) return []
        return [{ name, description: match[2]!.trim() }]
      }).filter((candidate, index, all) => all.findIndex((item) => item.name.normalize('NFC').toLocaleLowerCase() === candidate.name.normalize('NFC').toLocaleLowerCase()) === index)
      if (candidates.length === 0) { setError('叙述正文中没有可预览的新组织候选。请使用“名称：描述”的行格式。'); return }
      setImportCandidates(candidates)
      setSelectedImports(candidates.map((candidate) => candidate.name))
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError))
    }
  }

  const confirmImport = async () => {
    setSaving(true)
    setError(null)
    try {
      const timestamp = new Date().toISOString()
      const additions: OrganizationRecord[] = importCandidates.filter((candidate) => selectedImports.includes(candidate.name)).map((candidate) => ({
        id: crypto.randomUUID(),
        name: candidate.name,
        aliases: [],
        kindId: kinds[0]?.id ?? 'faction',
        description: candidate.description,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
      const saved = additions.length > 0 ? await saveOrganizations(projectId, { ...store, organizations: [...store.organizations, ...additions] }, store.revision) : store
      setStore(saved)
      setImportCandidates([])
      setSelectedImports([])
      onChange?.(saved.organizations)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="organization-manager">
      <div className="organization-manager-header">
        <div>
          <h3>组织目录</h3>
          <span>结构化维护组织、层级与成员归属</span>
        </div>
        <div className="organization-manager-actions">
          <Button variant="text" size="sm" onClick={() => { void openImportPreview() }}>从正文导入</Button>
          <Button variant="secondary" size="sm" onClick={beginCreate}>+ 新建组织</Button>
          {onClose && <Button variant="text" size="sm" onClick={onClose}>关闭</Button>}
        </div>
      </div>
      {error && <div className="organization-manager-error"><span>{error}</span>{projectionRetry && <Button variant="secondary" size="xs" loading={saving} onClick={() => { void retryOrganizationRenameProjections() }}>重试角色卡投影</Button>}</div>}
      {notice && <div className="organization-manager-notice">{notice}</div>}
      <div className="organization-manager-body">
        <aside className="organization-manager-list">
          {loading ? <p className="panel-empty">正在加载组织目录…</p> : sortedOrganizations.length === 0 ? <p className="panel-empty">暂无组织，先创建一个组织</p> : sortedOrganizations.map((organization) => {
            const depth = organizationDepth(organization, byId)
            return (
              <button
                type="button"
                key={organization.id}
                className={`organization-list-item${organization.id === selectedId ? ' active' : ''}`}
                style={{ paddingLeft: 12 + depth * 16 }}
                onClick={() => { setSelectedId(organization.id); setDraft(null); setConfirmingDelete(false); setDeleteTargetId('') }}
              >
                <span>{depth > 0 ? '└ ' : ''}{organization.name}</span>
                <small>{kindLabel(organization.kindId)}{organization.status === 'dissolved' ? ' · 已解散' : ''}</small>
              </button>
            )
          })}
        </aside>
        <main className="organization-manager-detail">
          {draft ? (
            <div className="organization-form">
              <h4>{draft.id ? '编辑组织' : '新建组织'}</h4>
              <div className="organization-form-grid">
                <label><span>名称</span><input className="notes-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus /></label>
                <label><span>类型</span><select className="notes-input" value={draft.kindId} onChange={(event) => setDraft({ ...draft, kindId: event.target.value })}>{kinds.slice().sort((left, right) => left.order - right.order).map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
                <label><span>父组织</span><select className="notes-input" value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">无</option>{store.organizations.filter((organization) => organization.id !== draft.id).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
                <label><span>状态</span><select className="notes-input" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as OrganizationRecord['status'] })}><option value="active">活跃</option><option value="dissolved">已解散</option></select></label>
                <label className="organization-form-wide"><span>别名</span><input className="notes-input" value={draft.aliases} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} placeholder="多个别名用逗号分隔" /></label>
                <label className="organization-form-wide"><span>描述</span><textarea className="notes-input" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={5} /></label>
              </div>
              <div className="organization-form-actions">
                <Button variant="text" size="sm" onClick={() => setDraft(null)} disabled={saving}>取消</Button>
                <Button variant="primary" size="sm" onClick={() => { void handleSave() }} loading={saving}>保存组织</Button>
              </div>
            </div>
          ) : selected ? (
            <div className="organization-summary">
              <div className="organization-summary-title">
                <div><h4>{selected.name}</h4><span>{kindLabel(selected.kindId)} · {selected.status === 'active' ? '活跃' : '已解散'}</span></div>
                <Button variant="secondary" size="sm" onClick={beginEdit}>编辑</Button>
              </div>
              {selected.aliases.length > 0 && <p><strong>别名：</strong>{selected.aliases.join('、')}</p>}
              {selected.parentId && <p><strong>父组织：</strong>{byId.get(selected.parentId)?.name ?? '未知组织'}</p>}
              <p className="organization-description">{selected.description || '暂无组织描述'}</p>
              <section><h5>成员与归属</h5>{members.length === 0 ? <p className="panel-empty">暂无成员</p> : members.map(({ record, affiliation }) => <div key={record.id} className="organization-member-row"><strong>{record.name}</strong><span>{affiliation.periods.map((period) => period.role || (period.status === 'former' ? '历史成员' : '成员')).join('、') || '成员'}</span></div>)}</section>
              <section><h5>子组织</h5>{children.length === 0 ? <p className="panel-empty">暂无子组织</p> : children.map((child) => <button type="button" className="organization-child-link" key={child.id} onClick={() => setSelectedId(child.id)}>{child.name}</button>)}</section>
              <div className="organization-delete-area">
                {confirmingDelete ? (
                  <div className="organization-delete-confirm">
                    <span>将处理 {members.length} 名成员和 {children.length} 个子组织后删除“{selected.name}”。</span>
                    {(members.length > 0 || children.length > 0) && (
                      <div className="organization-delete-options">
                        <label><input type="radio" checked={deleteMode === 'migrate'} disabled={deletionTargets.length === 0} onChange={() => setDeleteMode('migrate')} />迁移到</label>
                        <select className="notes-input" value={deleteTargetId} disabled={deleteMode !== 'migrate'} onChange={(event) => setDeleteTargetId(event.target.value)}>
                          {deletionTargets.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                        </select>
                        <label><input type="radio" checked={deleteMode === 'detach'} onChange={() => setDeleteMode('detach')} />批量解除引用</label>
                      </div>
                    )}
                    <div className="organization-delete-actions"><Button variant="text" size="xs" onClick={() => setConfirmingDelete(false)}>取消</Button><Button variant="danger" size="xs" disabled={deleteMode === 'migrate' && !deleteTargetId} loading={saving} onClick={() => { void handleDelete() }}>确认删除</Button></div>
                  </div>
                ) : <Button variant="text" size="sm" onClick={beginDelete}>删除组织</Button>}
              </div>
            </div>
          ) : <p className="panel-empty">选择或创建组织</p>}
        </main>
      </div>
      {importCandidates.length > 0 && (
        <div className="organization-import-preview">
          <div><strong>从 forces.md 导入预览</strong><span>只会创建勾选项，叙述正文保持不变。</span></div>
          <div className="organization-import-list">{importCandidates.map((candidate) => <label key={candidate.name}><input type="checkbox" checked={selectedImports.includes(candidate.name)} onChange={(event) => setSelectedImports(event.target.checked ? [...selectedImports, candidate.name] : selectedImports.filter((name) => name !== candidate.name))} /><span><strong>{candidate.name}</strong><small>{candidate.description}</small></span></label>)}</div>
          <div className="organization-form-actions"><Button variant="text" size="sm" disabled={saving} onClick={() => { setImportCandidates([]); setSelectedImports([]) }}>取消</Button><Button variant="primary" size="sm" loading={saving} onClick={() => { void confirmImport() }}>导入所选</Button></div>
        </div>
      )}
    </div>
  )
}

export default function OrganizationManager(props: Props) {
  const body = <OrganizationManagerBody {...props} />
  return props.modal ? <Modal className="organization-manager-modal" onRequestClose={props.onClose}>{body}</Modal> : body
}
