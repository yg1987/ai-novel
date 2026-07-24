import { forwardRef, useState, useEffect, useCallback, useImperativeHandle, useRef } from 'react'
import { listChapters, listProjectFiles, readProjectFile, loadProviderConfig, saveCharacterBundle, deleteCharacter, renameCharacter } from '../api/tauri'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import { buildAIContext } from '../services/aiContext'
import { hasDuplicateCharacterName, normalizeCharacterName, validateCharacterName } from '../services/characterNames'
import { parseCharacterGender, randomCharacterName, setCharacterGender, type CharacterGender } from '../services/characterProfiles'
import { hashText, loadCharacterCatalog, loadCharacterOrder, saveCharacterOrder, syncCharacterCatalogRecord } from '../services/characterCatalog'
import { defaultCharacterModuleConfig, loadCharacterModuleConfig } from '../services/characterConfig'
import { loadCharacterRelationships } from '../services/characterRelations'
import { diagnoseCharacterMarkdown, parseCharacterMarkdown, updateCharacterMarkdownField } from '../services/characterMarkdown'
import { loadForeshadows } from '../services/foreshadowStorage'
import { loadOrganizations, saveOrganizations } from '../services/organizationStore'
import { cloneAffiliations, validateCharacterAffiliations } from '../services/characterAffiliations'
import { buildChapterSequence } from '../services/chapterCatalog'
import type { ChapterMeta, ChapterRef } from '../types/chapter'
import type { CharacterAffiliation, CharacterModuleConfig, CharacterRecord, OrganizationRecord } from '../types/character'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import Button from './Button'
import Modal from './Modal'
import RewritePreview from './RewritePreview'
import SelectionContextMenu, { type ContextMenuAction } from './SelectionContextMenu'
import CharacterSidebar from './character-panel/CharacterSidebar'
import CharacterEditor from './character-panel/CharacterEditor'
import CharacterUnsavedChangesDialog from './character-panel/CharacterUnsavedChangesDialog'
import CharacterConfigDialog from './character-panel/CharacterConfigDialog'
import './CharacterPanel.css'

interface Props {
  projectId: string
  initialCharacter?: string | null
  onInitialCharacterConsumed?: () => void
  onNavigateToCharacter?: (characterId: string) => void
  onNavigateToOrganization?: (organizationId: string) => void
  onNavigateToChapter?: (reference: ChapterRef) => void
  onNavigateToForeshadow?: (id: string) => void
}

export interface CharacterPanelHandle {
  hasUnsavedChanges: () => boolean
  saveChanges: () => Promise<boolean>
  discardChanges: () => void
}

const CHARACTER_SUBDIR = 'characters'

const CHAR_EXAMPLE = `角色：林烬
性别：男
身份/职业：玄天宗外门弟子，后觉醒太古剑魂
外貌特征：黑发黑瞳，身形清瘦，左眉有一道细疤
性格特点：沉默寡言但重情义，遇强则强，不畏权势
背景经历：自幼父母双亡，被玄天宗收养。入门十二年仍在淬体境徘徊，遭同门轻视。意外获得太古剑魂传承后命运转折。
动机目标：寻找父母死因真相，最终成为剑道至尊
说话风格：话少，常用短句。愤怒时语气冰冷
标签：["剑修", "孤儿", "逆袭", "天选之子"]`

// ─── AI prompt ───────────────────────────────────────

function buildAIPrompt(name: string, projectInfo: string): { system: string; user: string } {
  const nameLine = name.trim()
    ? `角色名：${name.trim()}`
    : '请先为角色起一个合适的名字（要符合小说类型）'

  return {
    system: `你是一个网文角色设定助手。根据以下项目信息，创建一个新的角色。

${projectInfo}

${nameLine}

请严格按以下格式输出，不要加额外说明：

角色：[名字]
性别：[男/女]
身份/职业：
外貌特征：
性格特点：
背景经历：
动机目标：
说话风格：
标签：[标签1, 标签2, ...]

要求：
- 角色设定要符合小说类型
- 背景经历要有合理的成长弧光
- 性格要立体，有优点也有缺点
- 如果名字是你起的，确保名字不落俗套、有辨识度`,
    user: `请为这部小说生成一个完整的角色卡。`,
  }
}

function buildAICompletionPrompt(name: string, content: string, projectInfo: string): { system: string; user: string } {
  return {
    system: `你是一个网文角色设定助手。请在不改变角色核心身份和已有有效设定的前提下，补全并优化角色卡。

请严格按以下格式输出完整角色卡，不要加额外说明：

角色：${name}
身份/职业：
外貌特征：
性格特点：
背景经历：
动机目标：
说话风格：
标签：[标签1, 标签2, ...]

要求：
- 保留已有的具体设定，缺失字段才补全
- 角色要符合小说类型，性格有优点也有缺点
- 不要替换角色名或凭空推翻已有内容`,
    user: `${projectInfo ? `项目信息：\n${projectInfo}\n\n` : ''}当前角色：${name}\n\n现有角色卡：\n${content || '（尚未填写，请从头生成）'}`,
  }
}

// ─── Component ───────────────────────────────────────

type PromptMode = 'create' | 'complete'
type PendingAction = { type: 'select' | 'delete' | 'rename'; name: string }
type AIDraft = { mode: PromptMode; name: string; content: string }
type RenameTarget = { name: string; nextName: string; relationshipCount: number; affiliationCount: number; foreshadowCount: number }

const promptKeys: Record<PromptMode, string> = {
  create: 'character_create',
  complete: 'character_complete',
}

const CharacterPanel = forwardRef<CharacterPanelHandle, Props>(({ projectId, initialCharacter, onInitialCharacterConsumed, onNavigateToCharacter, onNavigateToOrganization, onNavigateToChapter, onNavigateToForeshadow }, ref) => {
  const [files, setFiles] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const orderRef = useRef<string[]>([])
  useEffect(() => { orderRef.current = order }, [order])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGender, setNewGender] = useState<CharacterGender>('未知')
  const [moduleConfig, setModuleConfig] = useState<CharacterModuleConfig>(() => defaultCharacterModuleConfig())
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([])
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [affiliations, setAffiliations] = useState<CharacterAffiliation[]>([])
  const [savedAffiliations, setSavedAffiliations] = useState<CharacterAffiliation[]>([])
  const [characterRecords, setCharacterRecords] = useState<CharacterRecord[]>([])
  const [genderFilter, setGenderFilter] = useState<CharacterGender | '全部'>('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [stanceFilter, setStanceFilter] = useState('')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [genderByFile, setGenderByFile] = useState<Record<string, CharacterGender>>({})
  const [showExample, setShowExample] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptMode, setPromptMode] = useState<PromptMode>('complete')
  const [prompts, setPrompts] = useState<Record<PromptMode, string>>({ create: '', complete: '' })
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [aiDraft, setAiDraft] = useState<AIDraft | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [organizationCandidates, setOrganizationCandidates] = useState<string[]>([])
  const [selectedOrganizationCandidates, setSelectedOrganizationCandidates] = useState<string[]>([])
  const [savingOrganizationCandidates, setSavingOrganizationCandidates] = useState(false)
  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const loadRequestRef = useRef(0)
  const editAfterLoadRef = useRef<string | null>(null)
  const checkSelection = useCallback(() => {
    const ta = rewriteTextareaRef.current
    if (ta) setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const dirty = content !== savedContent || JSON.stringify(affiliations) !== JSON.stringify(savedAffiliations)
  const editingPrompt = prompts[promptMode]

  useEffect(() => {
    void Promise.all([loadPrompt(projectId, promptKeys.create), loadPrompt(projectId, promptKeys.complete)])
      .then(([create, complete]) => {
        setPrompts({ create: create ?? '', complete: complete ?? '' })
        setShowPrompt(false)
      })
      .catch(() => {})
  }, [projectId])

  const saveOrder = useCallback(async (names: string[]) => {
    const config = await loadCharacterModuleConfig(projectId)
    const { catalog } = await loadCharacterCatalog(projectId, config)
    const ids = names.flatMap((name) => catalog.records.find((record) => record.fileName === `${name}.md`)?.id ?? [])
    await saveCharacterOrder(projectId, { schemaVersion: 2, characterIds: ids })
  }, [projectId])

  const refresh = useCallback(async () => {
    const config = await loadCharacterModuleConfig(projectId)
    const [organizationStore, chapterList] = await Promise.all([loadOrganizations(projectId), listChapters(projectId)])
    setModuleConfig(config)
    setOrganizations(organizationStore.organizations)
    setChapters(chapterList)
    const catalogResult = await loadCharacterCatalog(projectId, config)
    const { catalog } = catalogResult
    const confirmedNames = new Set(organizationStore.organizations.flatMap((organization) => [organization.name, ...organization.aliases]).map((name) => name.normalize('NFC').toLocaleLowerCase()))
    const candidates = catalogResult.organizationCandidates.filter((name) => !confirmedNames.has(name.normalize('NFC').toLocaleLowerCase()))
    setOrganizationCandidates(candidates)
    setSelectedOrganizationCandidates(candidates)
    setCharacterRecords(catalog.records)
    const entries = await listProjectFiles(projectId, CHARACTER_SUBDIR)
    const charNames = entries
      .filter((e) => e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/i, ''))
    const genders = await Promise.all(charNames.map(async (name) => {
      const card = await readProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`).catch(() => '')
      return [name, parseCharacterGender(card)] as const
    }))
    setGenderByFile(Object.fromEntries(genders))

    const { order: stableOrder, upgraded } = await loadCharacterOrder(projectId, catalog.records)
    const namesById = new Map(catalog.records.map((record) => [record.id, record.fileName.replace(/\.md$/i, '')]))
    const orderedNames = stableOrder.characterIds.flatMap((id) => {
      const name = namesById.get(id)
      return name && charNames.includes(name) ? [name] : []
    })
    const mergedOrder = [...orderedNames, ...charNames.filter((name) => !orderedNames.includes(name))]
    if (upgraded || orderedNames.length !== stableOrder.characterIds.length || mergedOrder.length !== orderedNames.length) {
      const ids = mergedOrder.flatMap((name) => catalog.records.find((record) => record.fileName === `${name}.md`)?.id ?? [])
      await saveCharacterOrder(projectId, { schemaVersion: 2, characterIds: ids })
    }

    setOrder(mergedOrder)
    setFiles(mergedOrder)
    if (initialCharacter) {
      const target = catalog.records.find((record) => record.id === initialCharacter || record.name === initialCharacter || record.aliases.includes(initialCharacter))
      const targetFile = target?.fileName.replace(/\.md$/i, '')
      if (targetFile && mergedOrder.includes(targetFile)) {
        setActiveFile(targetFile)
        onInitialCharacterConsumed?.()
      }
    }
  }, [initialCharacter, onInitialCharacterConsumed, projectId])

  useEffect(() => {
    refresh().catch((e: unknown) => { setError(e instanceof Error ? e.message : String(e)) })
  }, [refresh])

  useEffect(() => {
    if (!activeFile) return
    const requestId = ++loadRequestRef.current
    setLoading(true)
    const loadActiveCharacter = async () => {
      const config = await loadCharacterModuleConfig(projectId)
      const [nextContent, { catalog }] = await Promise.all([
        readProjectFile(projectId, CHARACTER_SUBDIR, `${activeFile}.md`),
        loadCharacterCatalog(projectId, config),
      ])
      const record = catalog.records.find((item) => item.fileName === `${activeFile}.md`)
      return { nextContent, nextAffiliations: cloneAffiliations(record?.affiliations ?? []) }
    }
    void loadActiveCharacter()
      .then(({ nextContent, nextAffiliations }) => {
        if (requestId !== loadRequestRef.current) return
        const shouldEdit = editAfterLoadRef.current === activeFile
        if (shouldEdit) editAfterLoadRef.current = null
        const normalizedContent = setCharacterGender(nextContent, parseCharacterGender(nextContent))
        setContent(normalizedContent)
        setSavedContent(normalizedContent)
        setAffiliations(nextAffiliations)
        setSavedAffiliations(cloneAffiliations(nextAffiliations))
        setEditing(shouldEdit)
      })
      .catch((e: unknown) => {
        if (requestId === loadRequestRef.current) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) setLoading(false)
      })
  }, [projectId, activeFile])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!activeFile) return false
    setSaving(true)
    setError(null)
    try {
      const config = await loadCharacterModuleConfig(projectId)
      const diagnostics = diagnoseCharacterMarkdown(content, config, organizations)
      if (diagnostics.duplicateFields.length > 0) {
        setError(`存在重复标准字段：${diagnostics.duplicateFields.join('、')}。请在正文中只保留一处后再保存。`)
        return false
      }
      if (diagnostics.invalidStance || diagnostics.invalidStatus) {
        const issues = [
          diagnostics.invalidStance ? `立场“${diagnostics.invalidStance}”` : '',
          diagnostics.invalidStatus ? `角色状态“${diagnostics.invalidStatus}”` : '',
        ].filter(Boolean)
        setError(`${issues.join('、')}不在当前项目预设中，请使用结构化资料里的可选值。`)
        return false
      }
      if (diagnostics.unknownOrganizations.length > 0) {
        setOrganizationCandidates(diagnostics.unknownOrganizations)
        setSelectedOrganizationCandidates(diagnostics.unknownOrganizations)
        setError('角色卡包含未确认的组织。请先确认要创建的组织，再次保存角色卡。')
        return false
      }
      const { catalog } = await loadCharacterCatalog(projectId, config)
      const sequence = buildChapterSequence(chapters)
      const chapterPosition = (reference: { volume: string; chapterId: string }) => sequence.chapters.findIndex((chapter) => chapter.volume === reference.volume && chapter.id === reference.chapterId) + 1 || undefined
      validateCharacterAffiliations(affiliations, new Set(organizations.map((organization) => organization.id)), chapterPosition)
      const catalogWithAffiliations = {
        ...catalog,
        records: catalog.records.map((record) => record.fileName === `${activeFile}.md`
          ? { ...record, affiliations: cloneAffiliations(affiliations) }
          : record),
      }
      const nextCatalog = await syncCharacterCatalogRecord(catalogWithAffiliations, `${activeFile}.md`, content, config, organizations)
      const savedRecord = nextCatalog.records.find((record) => record.fileName === `${activeFile}.md`)
      if (savedRecord) validateCharacterAffiliations(savedRecord.affiliations, new Set(organizations.map((organization) => organization.id)), chapterPosition)
      await saveCharacterBundle(projectId, `${activeFile}.md`, content, JSON.stringify(nextCatalog, null, 2), await hashText(savedContent))
      setSavedContent(content)
      const nextAffiliations = cloneAffiliations(savedRecord?.affiliations ?? affiliations)
      setAffiliations(nextAffiliations)
      setSavedAffiliations(cloneAffiliations(nextAffiliations))
      setEditing(false)
      setNotice('角色卡已保存')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }, [activeFile, affiliations, chapters, content, organizations, projectId, savedContent])

  const discardChanges = useCallback(() => {
    setContent(savedContent)
    setAffiliations(cloneAffiliations(savedAffiliations))
    setEditing(false)
    setHasSelection(false)
  }, [savedAffiliations, savedContent])

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => dirty,
    saveChanges: handleSave,
    discardChanges,
  }), [dirty, handleSave, discardChanges])

  const selectFile = (name: string) => {
    setActiveFile(name)
    setEditing(false)
    setShowExample(false)
    setError(null)
    setNotice(null)
  }

  const requestSelect = (name: string) => {
    if (name === activeFile) return
    if (dirty) {
      setPendingAction({ type: 'select', name })
      setShowUnsavedChanges(true)
      return
    }
    selectFile(name)
  }

  const continuePendingAction = () => {
    const action = pendingAction
    setPendingAction(null)
    setShowUnsavedChanges(false)
    if (!action) return
    if (action.type === 'select') selectFile(action.name)
    else if (action.type === 'delete') setDeleteTarget(action.name)
    else void openRename(action.name)
  }

  async function openRename(name: string) {
    setError(null)
    try {
      const config = await loadCharacterModuleConfig(projectId)
      const { catalog } = await loadCharacterCatalog(projectId, config)
      const record = catalog.records.find((item) => item.fileName === `${name}.md`)
      if (!record) throw new Error('角色目录中找不到该角色，请刷新后重试。')
      const [relationships, foreshadows] = await Promise.all([
        loadCharacterRelationships(projectId),
        loadForeshadows(projectId).catch(() => null),
      ])
      setRenameTarget({
        name,
        nextName: name,
        relationshipCount: relationships.relationships.filter((item) => item.characterAId === record.id || item.characterBId === record.id).length,
        affiliationCount: record.affiliations.length,
        foreshadowCount: foreshadows?.entries.filter((item) => item.relatedCharacterIds.includes(record.id) || item.relatedCharacters.includes(record.name)).length ?? 0,
      })
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError))
    }
  }

  const requestRename = (name: string) => {
    if (name === activeFile && dirty) {
      setPendingAction({ type: 'rename', name })
      setShowUnsavedChanges(true)
      return
    }
    void openRename(name)
  }

  const handleRename = async () => {
    if (!renameTarget) return
    const nextName = normalizeCharacterName(renameTarget.nextName)
    const validationError = validateCharacterName(nextName)
    if (validationError) { setError(validationError); return }
    if (hasDuplicateCharacterName(files, nextName, renameTarget.name)) { setError('该角色名或别名已存在'); return }
    if (nextName === renameTarget.name) { setRenameTarget(null); return }
    setRenaming(true)
    setError(null)
    try {
      const oldFilename = `${renameTarget.name}.md`
      const newFilename = `${nextName}.md`
      const [config, card] = await Promise.all([
        loadCharacterModuleConfig(projectId),
        readProjectFile(projectId, CHARACTER_SUBDIR, oldFilename),
      ])
      const { catalog } = await loadCharacterCatalog(projectId, config)
      const record = catalog.records.find((item) => item.fileName === oldFilename)
      if (!record) throw new Error('角色目录中找不到该角色，请刷新后重试。')
      const relationships = await loadCharacterRelationships(projectId)
      const { order } = await loadCharacterOrder(projectId, catalog.records)
      const renamedCard = updateCharacterMarkdownField(card, '角色', nextName)
      const renamedBase = {
        ...catalog,
        records: catalog.records.map((item) => item.id === record.id ? {
          ...item,
          name: nextName,
          fileName: newFilename,
          aliases: [...new Set([...item.aliases, record.name])],
        } : item),
      }
      const nextCatalog = await syncCharacterCatalogRecord(renamedBase, newFilename, renamedCard, config)
      await renameCharacter(
        projectId,
        oldFilename,
        newFilename,
        renamedCard,
        JSON.stringify(nextCatalog, null, 2),
        JSON.stringify(relationships, null, 2),
        JSON.stringify(order, null, 2),
        await hashText(card),
      )
      if (activeFile === renameTarget.name) {
        setActiveFile(nextName)
        setContent(renamedCard)
        setSavedContent(renamedCard)
      }
      setRenameTarget(null)
      await refresh()
      setNotice(`已将角色「${renameTarget.name}」重命名为「${nextName}」；正文自由文本未批量替换`)
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError))
    } finally {
      setRenaming(false)
    }
  }

  const handleCreate = async () => {
    const name = normalizeCharacterName(newName)
    const validationError = validateCharacterName(name)
    if (validationError) { setError(validationError); return }
    if (hasDuplicateCharacterName(files, name)) { setError('该角色名已存在'); return }
    setCreating(true)
    setError(null)
    try {
      const initialContent = `角色：${name}\n性别：${newGender}\n`
      const config = await loadCharacterModuleConfig(projectId)
      const { catalog } = await loadCharacterCatalog(projectId, config)
      const nextCatalog = await syncCharacterCatalogRecord(catalog, `${name}.md`, initialContent, config)
      await saveCharacterBundle(projectId, `${name}.md`, initialContent, JSON.stringify(nextCatalog, null, 2), await hashText(''))
      await refresh()
      setNewName('')
      editAfterLoadRef.current = name
      setActiveFile(name)
      setContent(initialContent)
      setSavedContent(initialContent)
      setEditing(true)
      setNotice(`已创建角色「${name}」`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const requestDelete = (name: string) => {
    if (name === activeFile && dirty) {
      setPendingAction({ type: 'delete', name })
      setShowUnsavedChanges(true)
      return
    }
    setDeleteTarget(name)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const name = deleteTarget
    setDeletingName(name)
    setError(null)
    try {
      const [config, card] = await Promise.all([
        loadCharacterModuleConfig(projectId),
        readProjectFile(projectId, CHARACTER_SUBDIR, `${name}.md`),
      ])
      const { catalog } = await loadCharacterCatalog(projectId, config)
      const record = catalog.records.find((item) => item.fileName === `${name}.md`)
      if (!record) throw new Error('角色目录中找不到该角色，请刷新后重试。')
      const relationships = await loadCharacterRelationships(projectId)
      const { order } = await loadCharacterOrder(projectId, catalog.records)
      const nextCatalog = {
        ...catalog,
        records: catalog.records.filter((item) => item.id !== record.id),
        revision: catalog.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      const nextRelationships = {
        ...relationships,
        relationships: relationships.relationships.filter((item) => item.characterAId !== record.id && item.characterBId !== record.id),
        revision: relationships.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      const nextOrder = { ...order, characterIds: order.characterIds.filter((id) => id !== record.id) }
      await deleteCharacter(
        projectId,
        `${name}.md`,
        JSON.stringify(nextCatalog, null, 2),
        JSON.stringify(nextRelationships, null, 2),
        JSON.stringify(nextOrder, null, 2),
        await hashText(card),
      )
      if (activeFile === name) {
        setActiveFile(null)
        setContent('')
        setSavedContent('')
        setAffiliations([])
        setSavedAffiliations([])
        setEditing(false)
      }
      await refresh()
      setNotice(`已删除角色「${name}」`)
      setDeleteTarget(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingName(null)
    }
  }

  const handleRandomName = () => {
    let generated = randomCharacterName()
    let tries = 0
    while (hasDuplicateCharacterName(files, generated.name) && tries < 100) {
      generated = randomCharacterName()
      tries++
    }
    setNewName(generated.name)
    setNewGender(generated.gender)
  }

  const requestAI = async (system: string, user: string): Promise<string> => {
    const config = await loadProviderConfig()
    const provider = config.providers.find(p => p.name === config.active_profile)
    if (!provider) throw new Error('未配置 AI Provider')
    if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

    const base = provider.base_url.replace(/\/+$/, '')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.api_key}`,
      },
      body: JSON.stringify({
        model: provider.models.analysis,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.8,
        max_tokens: 2048,
      }),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content ?? ''
    if (!raw.trim()) throw new Error('AI 返回内容为空')
    return raw.trim()
  }

  const handleAICreate = async () => {
    const requestedName = normalizeCharacterName(newName)
    const validationError = requestedName ? validateCharacterName(requestedName) : null
    if (validationError) { setError(validationError); return }
    if (requestedName && hasDuplicateCharacterName(files, requestedName)) { setError('该角色名已存在'); return }
    setGenerating(true)
    setError(null)
    try {
      const projectInfo = await buildAIContext(projectId)
      const defaultPrompt = buildAIPrompt(requestedName, projectInfo)
      const raw = await requestAI(
        prompts.create.trim() || defaultPrompt.system,
        prompts.create.trim() ? `${projectInfo}\n\n${requestedName ? `角色名：${requestedName}` : '请为角色起一个合适的名字'}` : defaultPrompt.user,
      )
      const nameMatch = raw.match(/^角色[：:]\s*(.+)/m)
      const charName = normalizeCharacterName(nameMatch?.[1] ?? requestedName)
      if (!charName) throw new Error('未能确定角色名')
      const generatedNameError = validateCharacterName(charName)
      if (generatedNameError) throw new Error(generatedNameError)
      if (hasDuplicateCharacterName(files, charName)) throw new Error(`角色「${charName}」已存在`)
      setAiDraft({ mode: 'create', name: charName, content: raw })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleAIComplete = async () => {
    if (!activeFile) return
    setGenerating(true)
    setError(null)
    try {
      const projectInfo = await buildAIContext(projectId)
      const defaultPrompt = buildAICompletionPrompt(activeFile, content, projectInfo)
      const raw = await requestAI(
        prompts.complete.trim() || defaultPrompt.system,
        prompts.complete.trim() ? `${projectInfo}\n\n当前角色：${activeFile}\n\n现有角色卡：\n${content || '（尚未填写，请从头生成）'}` : defaultPrompt.user,
      )
      setAiDraft({ mode: 'complete', name: activeFile, content: raw })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGenerating(false)
    }
  }

  const acceptAIDraft = async () => {
    if (!aiDraft) return
    if (aiDraft.mode === 'complete') {
      setContent(aiDraft.content)
      setEditing(true)
      setAiDraft(null)
      setNotice('已将 AI 补全内容放入编辑器，请确认后保存')
      return
    }

    if (hasDuplicateCharacterName(files, aiDraft.name)) {
      setError(`角色「${aiDraft.name}」已存在`)
      return
    }
    setCreating(true)
    setError(null)
    try {
      const config = await loadCharacterModuleConfig(projectId)
      const { catalog } = await loadCharacterCatalog(projectId, config)
      const nextCatalog = await syncCharacterCatalogRecord(catalog, `${aiDraft.name}.md`, aiDraft.content, config)
      await saveCharacterBundle(projectId, `${aiDraft.name}.md`, aiDraft.content, JSON.stringify(nextCatalog, null, 2), await hashText(''))
      await refresh()
      setNewName('')
      setActiveFile(aiDraft.name)
      setContent(aiDraft.content)
      setSavedContent(aiDraft.content)
      setEditing(false)
      setAiDraft(null)
      setNotice(`已创建角色「${aiDraft.name}」`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const isNameDuplicate = newName.trim().length > 0 && hasDuplicateCharacterName(files, newName)
  const recordByFile = new Map(characterRecords.map((record) => [record.fileName.replace(/\.md$/i, ''), record]))
  const normalizedSearch = searchQuery.trim().normalize('NFC').toLocaleLowerCase()
  const visibleFiles = files.filter((name) => {
    const record = recordByFile.get(name)
    if (genderFilter !== '全部' && genderByFile[name] !== genderFilter) return false
    if (!record) return !normalizedSearch || name.normalize('NFC').toLocaleLowerCase().includes(normalizedSearch)
    if (normalizedSearch && ![record.name, ...record.aliases, record.identity, ...record.tags]
      .some((value) => value.normalize('NFC').toLocaleLowerCase().includes(normalizedSearch))) return false
    if (stanceFilter && record.stanceId !== stanceFilter) return false
    if (tagFilters.length > 0 && !tagFilters.every((tag) => record.tags.includes(tag))) return false
    if (organizationFilter && !record.affiliations.some((affiliation) => affiliation.organizationId === organizationFilter)) return false
    return true
  })
  const availableTags = [...new Set(characterRecords.flatMap((record) => record.tags))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  const hasActiveFilters = Boolean(normalizedSearch || genderFilter !== '全部' || stanceFilter || tagFilters.length > 0 || organizationFilter)
  const clearFilters = () => {
    setSearchQuery('')
    setGenderFilter('全部')
    setStanceFilter('')
    setTagFilters([])
    setOrganizationFilter('')
  }
  const genderCounts = files.reduce<Record<CharacterGender, number>>((counts, name) => {
    counts[genderByFile[name] ?? '未知']++
    return counts
  }, { 男: 0, 女: 0, 未知: 0 })

  const dragItemRef = useRef<{ index: number; startY: number; currentY: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ index: number; offset: number } | null>(null)

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    if (!(e.target as HTMLElement).closest('[data-drag-handle]')) return
    e.preventDefault()
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dragItemRef.current = {
      index,
      startY: e.clientY,
      currentY: e.clientY,
    }
    setDragPreview({ index, offset: 0 })

    const handleMove = (ev: MouseEvent) => {
      if (!dragItemRef.current) return
      dragItemRef.current.currentY = ev.clientY
      const offset = ev.clientY - dragItemRef.current.startY
      setDragPreview({ index: dragItemRef.current.index, offset })

      const itemHeight = rect.height
      const moveStep = Math.round(offset / itemHeight)
      const targetIndex = Math.max(0, Math.min(files.length - 1, dragItemRef.current.index + moveStep))
      
      if (targetIndex !== dragItemRef.current.index) {
        const newOrder = [...orderRef.current]
        const [moved] = newOrder.splice(dragItemRef.current.index, 1)
        if (moved) newOrder.splice(targetIndex, 0, moved)
        orderRef.current = newOrder
        setOrder(newOrder)
        setFiles(newOrder)
        dragItemRef.current.index = targetIndex
        dragItemRef.current.startY = dragItemRef.current.currentY
        setDragPreview({ index: targetIndex, offset: 0 })
      }
    }

    const handleUp = () => {
      if (dragItemRef.current) {
        void saveOrder(orderRef.current)
          .then(() => setNotice('角色排序已保存'))
          .catch((e: unknown) => {
            setError(e instanceof Error ? e.message : String(e))
            void refresh().catch((refreshError: unknown) => setError(refreshError instanceof Error ? refreshError.message : String(refreshError)))
          })
      }
      dragItemRef.current = null
      setDragPreview(null)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleRewriteMode = (mode: RewriteMode) => {
    const sel = getTextareaSelection(rewriteTextareaRef.current, content)
    if (!sel) return
    setRewriteState({ ...sel, mode })
  }

  const handleRewriteAccept = (newText: string) => {
    if (!rewriteState) return
    setContent((prev) => applyTextareaRewrite(prev, rewriteState.start, rewriteState.end, newText))
    setRewriteState(null)
  }

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  const handleOrganizationToggle = (organization: OrganizationRecord, selected: boolean) => {
    const projection = parseCharacterMarkdown(content)
    const organizationNames = new Set([organization.name, ...organization.aliases].map((name) => name.normalize('NFC').toLocaleLowerCase()))
    const nextNames = selected
      ? [...projection.organizations.filter((name) => !organizationNames.has(name.normalize('NFC').toLocaleLowerCase())), organization.name]
      : projection.organizations.filter((name) => !organizationNames.has(name.normalize('NFC').toLocaleLowerCase()))
    setContent((previous) => updateCharacterMarkdownField(previous, '所属组织', nextNames))
    setAffiliations((previous) => {
      const next = cloneAffiliations(previous)
      const existing = next.find((item) => item.organizationId === organization.id)
      if (selected) {
        if (existing) {
          if (!existing.periods.some((period) => !period.endChapter && period.status !== 'former')) {
            existing.periods.push({ id: crypto.randomUUID(), role: '', status: 'active', notes: '' })
          }
        } else {
          next.push({ organizationId: organization.id, periods: [{ id: crypto.randomUUID(), role: '', status: 'active', notes: '' }] })
        }
      } else if (existing) {
        existing.periods = existing.periods.map((period) => !period.endChapter && period.status !== 'former'
          ? { ...period, status: 'former' }
          : period)
      }
      return next
    })
  }

  const confirmOrganizationCandidates = async () => {
    setSavingOrganizationCandidates(true)
    setError(null)
    try {
      const store = await loadOrganizations(projectId)
      const timestamp = new Date().toISOString()
      const additions = selectedOrganizationCandidates.map((name) => ({
        id: crypto.randomUUID(),
        name,
        aliases: [],
        kindId: moduleConfig.organizationKinds[0]?.id ?? 'faction',
        description: '',
        status: 'active' as const,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
      const saved = additions.length > 0 ? await saveOrganizations(projectId, { ...store, organizations: [...store.organizations, ...additions] }, store.revision) : store
      setOrganizations(saved.organizations)
      setOrganizationCandidates([])
      setSelectedOrganizationCandidates([])
      setNotice(additions.length > 0 ? `已确认 ${additions.length} 个组织候选` : '已忽略组织候选')
    } catch (candidateError) {
      setError(candidateError instanceof Error ? candidateError.message : String(candidateError))
    } finally {
      setSavingOrganizationCandidates(false)
    }
  }

  return (
    <div className="panel-layout">
      <CharacterSidebar
        files={visibleFiles}
        genderByFile={genderByFile}
        genderCounts={genderCounts}
        genderFilter={genderFilter}
        searchQuery={searchQuery}
        stanceFilter={stanceFilter}
        tagFilters={tagFilters}
        organizationFilter={organizationFilter}
        stances={moduleConfig.stances}
        organizations={organizations}
        availableTags={availableTags}
        hasActiveFilters={hasActiveFilters}
        totalFiles={files.length}
        onGenderFilterChange={setGenderFilter}
        onSearchQueryChange={setSearchQuery}
        onStanceFilterChange={setStanceFilter}
        onTagFiltersChange={setTagFilters}
        onOrganizationFilterChange={setOrganizationFilter}
        onClearFilters={clearFilters}
        onOpenConfig={() => setShowConfig(true)}
        activeFile={activeFile}
        newName={newName}
        creating={creating}
        generating={generating}
        deletingName={deletingName}
        error={error}
        notice={notice}
        isNameDuplicate={isNameDuplicate}
        dragPreview={dragPreview}
        onNewNameChange={setNewName}
        onCreate={() => { void handleCreate() }}
        onRandomName={handleRandomName}
        onAICreate={() => { void handleAICreate() }}
        onSelect={requestSelect}
        onDelete={requestDelete}
        onRename={requestRename}
        onDragStart={(event, index) => { if (genderFilter === '全部') handleMouseDown(event, index) }}
      />
      <CharacterEditor
        projectId={projectId}
        activeFile={activeFile}
        characterId={activeFile ? recordByFile.get(activeFile)?.id : undefined}
        content={content}
        gender={parseCharacterGender(content)}
        editing={editing}
        loading={loading}
        saving={saving}
        generating={generating}
        hasSelection={hasSelection}
        rewriteLoading={rewriteState !== null}
        showPrompt={showPrompt}
        promptMode={promptMode}
        editingPrompt={editingPrompt}
        savingPrompt={savingPrompt}
        showExample={showExample}
        example={CHAR_EXAMPLE}
        config={moduleConfig}
        organizations={organizations}
        affiliations={affiliations}
        chapters={chapters}
        textareaRef={rewriteTextareaRef}
        onContentChange={setContent}
        onGenderChange={(gender) => setContent((previous) => setCharacterGender(previous, gender))}
        onStructuredFieldChange={(field, value) => setContent((previous) => updateCharacterMarkdownField(previous, field, value))}
        onOrganizationToggle={handleOrganizationToggle}
        onAffiliationsChange={setAffiliations}
        onOrganizationsChange={setOrganizations}
        onOrganizationCreated={(organization) => handleOrganizationToggle(organization, true)}
        onNavigateToCharacter={(characterId) => {
          const target = characterRecords.find((record) => record.id === characterId)?.fileName.replace(/\.md$/i, '')
          if (target) requestSelect(target)
          else onNavigateToCharacter?.(characterId)
        }}
        onNavigateToOrganization={onNavigateToOrganization}
        onNavigateToChapter={onNavigateToChapter}
        onNavigateToForeshadow={onNavigateToForeshadow}
        onEdit={() => { setEditing(true) }}
        onSave={() => { void handleSave() }}
        onAIComplete={() => { void handleAIComplete() }}
        onRewrite={() => handleRewriteMode('rewrite')}
        onExpand={() => handleRewriteMode('expand')}
        onPolish={() => handleRewriteMode('polish')}
        onTogglePrompt={() => setShowPrompt(!showPrompt)}
        onPromptModeChange={setPromptMode}
        onPromptChange={(value) => setPrompts((prev) => ({ ...prev, [promptMode]: value }))}
        onResetPrompt={() => {
          setSavingPrompt(true)
          void resetPrompt(projectId, promptKeys[promptMode])
            .then(() => {
              setPrompts((prev) => ({ ...prev, [promptMode]: '' }))
              setNotice('已恢复默认提示词')
            })
            .catch((promptError: unknown) => setError(promptError instanceof Error ? promptError.message : String(promptError)))
            .finally(() => setSavingPrompt(false))
        }}
        onSavePrompt={() => {
          setSavingPrompt(true)
          void savePrompt(projectId, promptKeys[promptMode], editingPrompt)
            .then(() => setNotice('提示词已保存'))
            .catch((promptError: unknown) => setError(promptError instanceof Error ? promptError.message : String(promptError)))
            .finally(() => setSavingPrompt(false))
        }}
        onToggleExample={() => { setShowExample(!showExample) }}
        onSelectionCheck={checkSelection}
        onSelectionContextMenu={(e) => {
          const ta = e.currentTarget
          if (ta.selectionStart !== ta.selectionEnd) {
            e.preventDefault()
            setContextMenu({ x: e.clientX, y: e.clientY })
          }
        }}
      />

      {rewriteState && (
        <RewritePreview
          selectedText={rewriteState.selectedText}
          beforeText={rewriteState.beforeText}
          afterText={rewriteState.afterText}
          defaultMode={rewriteState.mode}
          onAccept={handleRewriteAccept}
          onReject={() => setRewriteState(null)}
        />
      )}

      {contextMenu && (
        <SelectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
      {showConfig && <CharacterConfigDialog projectId={projectId} onSaved={(config) => { setModuleConfig(config); void refresh() }} onClose={() => setShowConfig(false)} />}
      {organizationCandidates.length > 0 && (
        <Modal className="confirm-dialog" onRequestClose={savingOrganizationCandidates ? undefined : () => setOrganizationCandidates([])}>
          <h3>确认角色卡中的组织候选</h3>
          <p>以下名称来自明确的“所属组织 / 阵营 / 势力 / 组织”字段。只会创建你勾选的组织，不会改写角色正文；确认后请再次保存角色卡。</p>
          <div className="character-organization-candidates">{organizationCandidates.map((name) => <label key={name}><input type="checkbox" checked={selectedOrganizationCandidates.includes(name)} onChange={(event) => setSelectedOrganizationCandidates(event.target.checked ? [...selectedOrganizationCandidates, name] : selectedOrganizationCandidates.filter((candidate) => candidate !== name))} />{name}</label>)}</div>
          <div className="dialog-footer"><Button variant="text" size="sm" disabled={savingOrganizationCandidates} onClick={() => { setOrganizationCandidates([]); setSelectedOrganizationCandidates([]) }}>暂不处理</Button><Button variant="primary" size="sm" loading={savingOrganizationCandidates} onClick={() => { void confirmOrganizationCandidates() }}>确认候选</Button></div>
        </Modal>
      )}
      {showUnsavedChanges && (
        <CharacterUnsavedChangesDialog
          saving={saving}
          onSave={() => { void handleSave().then((saved) => { if (saved) continuePendingAction() }) }}
          onDiscard={() => { discardChanges(); continuePendingAction() }}
          onCancel={() => { setPendingAction(null); setShowUnsavedChanges(false) }}
        />
      )}
      {deleteTarget && (
        <Modal className="confirm-dialog" onRequestClose={deletingName ? undefined : () => setDeleteTarget(null)}>
          <h2>删除角色</h2>
          <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            确定删除角色「{deleteTarget}」吗？角色卡将从当前项目中移除，无法恢复。
          </p>
          <div className="dialog-footer">
            <Button variant="secondary" size="md" disabled={deletingName !== null} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" size="md" loading={deletingName !== null} disabled={deletingName !== null} onClick={() => { void handleDelete() }}>删除角色</Button>
          </div>
        </Modal>
      )}
      {renameTarget && (
        <Modal className="confirm-dialog" onRequestClose={renaming ? undefined : () => setRenameTarget(null)}>
          <h2>重命名角色</h2>
          <label className="sub-field-label" htmlFor="character-rename-input">新角色名</label>
          <input
            id="character-rename-input"
            className="notes-input"
            value={renameTarget.nextName}
            disabled={renaming}
            autoFocus
            onChange={(event) => setRenameTarget((current) => current ? { ...current, nextName: event.target.value } : current)}
          />
          <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            将同步更新文件名、标准角色字段和结构化目录。旧名称会保留为别名；正文自由文本不会批量替换。
          </p>
          <p style={{ margin: '12px 0', color: 'var(--text-muted)' }}>
            影响：手动关系 {renameTarget.relationshipCount} 条，组织归属 {renameTarget.affiliationCount} 项，伏笔引用 {renameTarget.foreshadowCount} 条。
          </p>
          <div className="dialog-footer">
            <Button variant="secondary" size="md" disabled={renaming} onClick={() => setRenameTarget(null)}>取消</Button>
            <Button variant="primary" size="md" loading={renaming} disabled={renaming || !renameTarget.nextName.trim()} onClick={() => { void handleRename() }}>确认重命名</Button>
          </div>
        </Modal>
      )}
      {aiDraft && (
        <Modal className="confirm-dialog" onRequestClose={creating ? undefined : () => setAiDraft(null)}>
          <h2>{aiDraft.mode === 'create' ? `创建角色「${aiDraft.name}」` : `AI 补全「${aiDraft.name}」`}</h2>
          <p style={{ margin: '12px 0', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {aiDraft.mode === 'create' ? '请确认生成内容。确认后才会创建角色卡。' : '请确认生成内容。确认后会替换编辑器内容，但不会自动保存。'}
          </p>
          <textarea className="prompt-editor-textarea" readOnly value={aiDraft.content} style={{ minHeight: 280 }} />
          <div className="dialog-footer" style={{ marginTop: 14 }}>
            <Button variant="secondary" size="md" disabled={creating} onClick={() => setAiDraft(null)}>取消</Button>
            <Button variant="primary" size="md" loading={creating} disabled={creating} onClick={() => { void acceptAIDraft() }}>
              {aiDraft.mode === 'create' ? '创建角色' : '应用到编辑器'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
})

export default CharacterPanel
