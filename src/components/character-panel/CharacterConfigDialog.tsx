import { useEffect, useMemo, useState } from 'react'
import { loadCharacterCatalog, saveCharacterCatalog } from '../../services/characterCatalog'
import { defaultCharacterModuleConfig, loadCharacterModuleConfig, saveCharacterModuleConfig } from '../../services/characterConfig'
import { countCharacterConfigUsage, migrateCharacterConfigReferences, type CharacterConfigReplacementMap, type CharacterConfigSection } from '../../services/characterConfigReferences'
import { loadCharacterRelationships, saveCharacterRelationships } from '../../services/characterRelations'
import { loadOrganizations, saveOrganizations } from '../../services/organizationStore'
import type { CharacterModuleConfig, OptionDefinition, RelationshipTypeDefinition } from '../../types/character'
import Button from '../Button'
import Modal from '../Modal'

interface Props {
  projectId: string
  onSaved: (config: CharacterModuleConfig) => void
  onClose: () => void
}

const sectionLabels: Record<CharacterConfigSection, string> = {
  stances: '立场',
  statuses: '角色状态',
  organizationKinds: '组织类型',
  relationshipTypes: '关系类型',
}

export default function CharacterConfigDialog({ projectId, onSaved, onClose }: Props) {
  const [original, setOriginal] = useState<CharacterModuleConfig | null>(null)
  const [draft, setDraft] = useState<CharacterModuleConfig | null>(null)
  const [section, setSection] = useState<CharacterConfigSection>('stances')
  const [replacements, setReplacements] = useState<CharacterConfigReplacementMap>({})
  const [pendingDelete, setPendingDelete] = useState<{ section: CharacterConfigSection; id: string; replacementId: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stores, setStores] = useState<{
    catalog: Awaited<ReturnType<typeof loadCharacterCatalog>>['catalog']
    organizations: Awaited<ReturnType<typeof loadOrganizations>>
    relationships: Awaited<ReturnType<typeof loadCharacterRelationships>>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const config = await loadCharacterModuleConfig(projectId)
        const [catalogResult, organizations, relationships] = await Promise.all([
          loadCharacterCatalog(projectId, config),
          loadOrganizations(projectId),
          loadCharacterRelationships(projectId),
        ])
        if (cancelled) return
        setOriginal(config)
        setDraft(structuredClone(config))
        setStores({ catalog: catalogResult.catalog, organizations, relationships })
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [projectId])

  const usageCounts = useMemo(() => {
    if (!stores) return new Map<string, number>()
    return countCharacterConfigUsage(stores)
  }, [stores])

  if (loading || !draft || !original || !stores) return <Modal className="character-config-dialog" onRequestClose={onClose}><p className="panel-empty">正在加载角色预设…</p></Modal>

  const options = draft[section]
  const patchOption = (id: string, patch: Partial<OptionDefinition & RelationshipTypeDefinition>) => {
    setDraft({ ...draft, [section]: options.map((option) => option.id === id ? { ...option, ...patch } : option) })
  }
  const addOption = () => {
    const order = options.reduce((maximum, option) => Math.max(maximum, option.order), 0) + 1
    const base = { id: `custom-${crypto.randomUUID()}`, label: '新选项', order }
    const next = section === 'relationshipTypes'
      ? { ...base, tier: 3 as const, weight: 0.5, color: '#64748b', defaultDirection: 'undirected' as const }
      : base
    setDraft({ ...draft, [section]: [...options, next] })
  }
  const requestDelete = (id: string) => {
    if (options.length <= 1) { setError(`${sectionLabels[section]}至少保留一个选项。`); return }
    const alternatives = options.filter((option) => option.id !== id)
    const used = usageCounts.get(`${section}:${id}`) ?? 0
    if (used > 0) {
      setPendingDelete({ section, id, replacementId: alternatives[0]?.id ?? '' })
      return
    }
    setDraft({ ...draft, [section]: alternatives })
  }
  const confirmReplacement = () => {
    if (!pendingDelete || !pendingDelete.replacementId) return
    setReplacements((current) => ({ ...current, [pendingDelete.section]: { ...current[pendingDelete.section], [pendingDelete.id]: pendingDelete.replacementId } }))
    setDraft({ ...draft, [pendingDelete.section]: draft[pendingDelete.section].filter((option) => option.id !== pendingDelete.id) })
    setPendingDelete(null)
  }
  const handleReset = () => {
    const defaults = defaultCharacterModuleConfig()
    const usedCustom = ([['stances', defaults.stances], ['statuses', defaults.statuses], ['organizationKinds', defaults.organizationKinds], ['relationshipTypes', defaults.relationshipTypes]] as const)
      .flatMap(([sectionName, defaultOptions]) => original[sectionName].filter((option) => !defaultOptions.some((candidate) => candidate.id === option.id) && (usageCounts.get(`${sectionName}:${option.id}`) ?? 0) > 0).map((option) => `${sectionLabels[sectionName]}“${option.label}”`))
    if (usedCustom.length > 0) { setError(`以下自定义选项仍在使用，请先逐项删除并选择替换：${usedCustom.join('、')}`); return }
    setDraft({ ...defaults, revision: original.revision, updatedAt: original.updatedAt })
    setReplacements({})
    setError(null)
  }
  const handleSave = async () => {
    if (draft.stances.some((option) => !option.label.trim()) || draft.statuses.some((option) => !option.label.trim()) || draft.organizationKinds.some((option) => !option.label.trim()) || draft.relationshipTypes.some((option) => !option.label.trim())) {
      setError('选项名称不能为空。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let catalog = stores.catalog
      let organizations = stores.organizations
      let relationships = stores.relationships
      const stanceReplacements = replacements.stances ?? {}
      const statusReplacements = replacements.statuses ?? {}
      const kindReplacements = replacements.organizationKinds ?? {}
      const relationshipReplacements = replacements.relationshipTypes ?? {}
      const migrated = migrateCharacterConfigReferences(stores, replacements)
      if (Object.keys(stanceReplacements).length > 0 || Object.keys(statusReplacements).length > 0) {
        catalog = await saveCharacterCatalog(projectId, migrated.catalog, catalog.revision)
      }
      if (Object.keys(kindReplacements).length > 0) {
        organizations = await saveOrganizations(projectId, migrated.organizations, organizations.revision)
      }
      if (Object.keys(relationshipReplacements).length > 0) {
        relationships = await saveCharacterRelationships(projectId, migrated.relationships, relationships.revision, new Set(catalog.records.map((record) => record.id)))
      }
      const saved = await saveCharacterModuleConfig(projectId, draft, original.revision)
      onSaved(saved)
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal className="character-config-dialog" onRequestClose={saving ? undefined : onClose}>
      <div className="character-config-header"><div><h3>角色模块预设</h3><span>修改仅影响当前项目</span></div><Button variant="text" size="sm" onClick={handleReset}>恢复默认</Button></div>
      <div className="character-config-tabs">{(Object.keys(sectionLabels) as CharacterConfigSection[]).map((key) => <button type="button" className={section === key ? 'active' : ''} key={key} onClick={() => setSection(key)}>{sectionLabels[key]}</button>)}</div>
      {error && <div className="character-config-error">{error}</div>}
      <div className="modal-scroll-body character-config-list">
        {options.slice().sort((left, right) => left.order - right.order).map((option) => (
          <div className={`character-config-row${section === 'relationshipTypes' ? ' relationship' : ''}`} key={option.id}>
            <input className="notes-input" value={option.label} onChange={(event) => patchOption(option.id, { label: event.target.value })} />
            <input className="notes-input" type="number" min={1} value={option.order} onChange={(event) => patchOption(option.id, { order: Number(event.target.value) })} aria-label="顺序" />
            {section === 'relationshipTypes' && <><select className="notes-input" value={(option as RelationshipTypeDefinition).tier} onChange={(event) => patchOption(option.id, { tier: Number(event.target.value) as 1 | 2 | 3 })}><option value={1}>一级</option><option value={2}>二级</option><option value={3}>三级</option></select><input className="notes-input" type="number" min={0} step={0.1} value={(option as RelationshipTypeDefinition).weight} onChange={(event) => patchOption(option.id, { weight: Number(event.target.value) })} aria-label="权重" /><input type="color" value={(option as RelationshipTypeDefinition).color} onChange={(event) => patchOption(option.id, { color: event.target.value })} aria-label="颜色" /></>}
            <Button variant="ghost" size="xs" title="删除选项" aria-label={`删除${option.label}`} onClick={() => requestDelete(option.id)}>×</Button>
          </div>
        ))}
        <Button variant="text" size="sm" onClick={addOption}>+ 添加{sectionLabels[section]}</Button>
      </div>
      <div className="character-config-footer"><Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>取消</Button><Button variant="primary" size="sm" loading={saving} onClick={() => { void handleSave() }}>保存预设</Button></div>
      {pendingDelete && (
        <div className="character-config-replacement">
          <strong>该选项正在被 {usageCounts.get(`${pendingDelete.section}:${pendingDelete.id}`) ?? 0} 条记录使用</strong>
          <span>删除前请选择替换项：</span>
          <select className="notes-input" value={pendingDelete.replacementId} onChange={(event) => setPendingDelete({ ...pendingDelete, replacementId: event.target.value })}>{draft[pendingDelete.section].filter((option) => option.id !== pendingDelete.id).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          <div><Button variant="text" size="xs" onClick={() => setPendingDelete(null)}>取消</Button><Button variant="primary" size="xs" onClick={confirmReplacement}>确认替换</Button></div>
        </div>
      )}
    </Modal>
  )
}
