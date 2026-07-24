import { forwardRef, useState, useEffect, useCallback, useImperativeHandle, useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { readProjectFile, writeProjectFile, loadProviderConfig } from '../api/tauri'
import { buildAIContext } from '../services/aiContext'
import { buildBrainstormContext, type BrainstormAllowedEntity } from '../services/brainstormContext'
import type { BrainstormContextSource } from '../types/brainstorm'
import { loadPrompt, savePrompt, resetPrompt } from '../services/aiPrompts'
import type { TextareaSelection } from '../services/rewriteUtils'
import { getTextareaSelection, applyTextareaRewrite } from '../services/rewriteUtils'
import { type RewriteMode } from '../services/rewriteService'
import {
  contentHash,
  deleteWorldviewDraft,
  loadWorldviewDraft,
  saveWorldviewDraft,
  type WorldviewDraft,
} from '../services/worldviewDrafts'
import type { ContextMenuAction } from './SelectionContextMenu'
import {
  type SectionDef,
  type SubField,
  loadSections,
  loadSectionsGenre,
  saveSections,
  getDefaultSections,
} from '../services/worldviewConfig'
import WorldviewBanner from './worldview-panel/WorldviewBanner'
import WorldviewSidebar from './worldview-panel/WorldviewSidebar'
import WorldviewEditor from './worldview-panel/WorldviewEditor'
import OrganizationManager from './OrganizationManager'
import Button from './Button'
import WorldviewDialogs from './worldview-panel/WorldviewDialogs'
import WorldviewDraftRecoveryDialog from './worldview-panel/WorldviewDraftRecoveryDialog'
import WorldviewUnsavedChangesDialog from './worldview-panel/WorldviewUnsavedChangesDialog'
import WorldviewProposalDialog from './worldview-panel/WorldviewProposalDialog'
import WorldviewBootstrapDialog, { type WorldviewBootstrapSource } from './worldview-panel/WorldviewBootstrapDialog'
import WorldviewTemplateDialog from './worldview-panel/WorldviewTemplateDialog'
import WorldviewRulesDialog from './worldview-panel/WorldviewRulesDialog'
import WorldviewAuditDialog from './worldview-panel/WorldviewAuditDialog'
import WorldviewRuleReferencesDialog from './worldview-panel/WorldviewRuleReferencesDialog'
import {
  parseWorldviewProposalResponse,
  worldviewProposalPrompt,
  type WorldviewProposal,
  type WorldviewProposalParseResult,
} from '../services/worldviewProposal'
import {
  createWorldviewTemplate,
  deleteWorldviewTemplate,
  loadWorldviewTemplates,
  type WorldviewTemplate,
} from '../services/worldviewTemplates'
import {
  createWorldviewRule,
  deleteWorldviewRule,
  loadWorldviewRules,
  updateWorldviewRule,
  type WorldviewRule,
  type WorldviewRuleInput,
} from '../services/worldviewRules'
import { checkWorldviewRules, type WorldviewRuleCheckFinding } from '../services/worldviewRuleChecks'
import { parseWorldviewAuditResponse, worldviewAuditPrompt, type WorldviewAuditParseResult, type WorldviewAuditSource } from '../services/worldviewAudit'
import { loadWorldviewAuditResult, loadWorldviewIssueStates, saveWorldviewAuditResult, updateWorldviewIssueStatus, type WorldviewIssueState, type WorldviewIssueStatus } from '../services/worldviewAuditState'
import { findWorldviewRuleReferences, type WorldviewRuleReference } from '../services/worldviewRuleReferences'
import { extractAssistantText } from '../services/chatCompletion'
import {
  buildWorldviewContent,
  getWorldviewDefaultPrompt,
  parseWorldviewSubs,
} from './worldview-panel/worldviewMarkdown'

interface Props {
  projectId: string
  initialOrganizationId?: string | null
  onInitialOrganizationConsumed?: () => void
}

interface ProposalReviewState extends WorldviewProposalParseResult {
  section: SectionDef
  baseContent: string
}

interface BootstrapProposalReview extends WorldviewProposalParseResult {
  baseContents: Record<string, string>
  sourceLabels: string[]
}

export interface WorldviewPanelHandle {
  hasUnsavedChanges: () => boolean
  saveChanges: () => Promise<boolean>
  discardChanges: () => void
}

const WorldviewPanel = forwardRef<WorldviewPanelHandle, Props>(({ projectId, initialOrganizationId, onInitialOrganizationConsumed }, ref) => {
  const [sections, setSections] = useState<SectionDef[]>([])
  const [activeSection, setActiveSection] = useState<SectionDef | null>(null)
  const [content, setContent] = useState('')
  const [subValues, setSubValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showExample, setShowExample] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [rewriteState, setRewriteState] = useState<(TextareaSelection & { mode: RewriteMode; subKey?: string }) | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)
  const [editingSectionLabel, setEditingSectionLabel] = useState('')
  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')

  const [editingSubKey, setEditingSubKey] = useState<string | null>(null)
  const [editingSubLabel, setEditingSubLabel] = useState('')
  const [newSubFieldName, setNewSubFieldName] = useState('')
  const [addingSubToKey, setAddingSubToKey] = useState<string | null>(null)

  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)
  const [genre, setGenre] = useState<string>('玄幻')
  const [savedGenre, setSavedGenre] = useState<string | null>(null)
  const [genreMismatchDismissed, setGenreMismatchDismissed] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [baseContentHash, setBaseContentHash] = useState('')
  const [pendingSection, setPendingSection] = useState<SectionDef | null>(null)
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false)
  const [savingChanges, setSavingChanges] = useState(false)
  const [draftToRecover, setDraftToRecover] = useState<WorldviewDraft | null>(null)
  const [proposalReview, setProposalReview] = useState<ProposalReviewState | null>(null)
  const [showBootstrap, setShowBootstrap] = useState(false)
  const [generatingBootstrap, setGeneratingBootstrap] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bootstrapReview, setBootstrapReview] = useState<BootstrapProposalReview | null>(null)
  const [showBootstrapReview, setShowBootstrapReview] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState<WorldviewTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesSaving, setTemplatesSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [rules, setRules] = useState<WorldviewRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesError, setRulesError] = useState<string | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const [generatingAudit, setGeneratingAudit] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditResult, setAuditResult] = useState<WorldviewAuditParseResult | null>(null)
  const [auditIssueStates, setAuditIssueStates] = useState<Record<string, WorldviewIssueState>>({})
  const [savingAuditStatus, setSavingAuditStatus] = useState(false)
  const [referenceRule, setReferenceRule] = useState<WorldviewRule | null>(null)
  const [ruleReferences, setRuleReferences] = useState<WorldviewRuleReference[]>([])
  const [referencesLoading, setReferencesLoading] = useState(false)
  const [referencesError, setReferencesError] = useState<string | null>(null)
  const [forcesView, setForcesView] = useState<'directory' | 'narrative'>('directory')
  const [organizationTargetId] = useState(initialOrganizationId ?? undefined)

  const rewriteTextareaRef = useRef<HTMLTextAreaElement>(null)
  const subFieldEndRef = useRef<HTMLDivElement>(null)
  const sectionsRef = useRef(sections)
  const draftPayloadRef = useRef<WorldviewDraft | null>(null)
  const initialOrganizationRef = useRef(initialOrganizationId)
  const consumeInitialOrganizationRef = useRef(onInitialOrganizationConsumed)

  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  const genreMismatch = savedGenre !== null && savedGenre !== genre && !genreMismatchDismissed
  const promptKey = activeSection ? `worldview_${activeSection.key}` : ''
  const hasSubs = activeSection ? activeSection.subs.length > 0 : false
  const isFreeform = !hasSubs

  const checkSelection = useCallback((event: MouseEvent<HTMLTextAreaElement> | KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = event.currentTarget
    setHasSelection(ta.selectionStart !== ta.selectionEnd)
  }, [])

  const handleSelectionContextMenu = useCallback((event: MouseEvent<HTMLTextAreaElement>) => {
    const ta = event.currentTarget
    if (ta.selectionStart !== ta.selectionEnd) {
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    }
  }, [])

  const scrollToNewSubField = useCallback(() => {
    requestAnimationFrame(() => {
      subFieldEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [])

  useEffect(() => {
    const init = async () => {
      let projectGenre = '玄幻'
      try {
        const metaRaw = await readProjectFile(projectId, '', 'project.json')
        const meta = JSON.parse(metaRaw) as { genre?: string }
        if (meta.genre) projectGenre = meta.genre
      } catch {
        // Project metadata is optional for older projects.
      }
      setGenre(projectGenre)

      let loadedSections = await loadSections(projectId)
      if (!loadedSections || loadedSections.length === 0) {
        loadedSections = getDefaultSections(projectGenre)
        await saveSections(projectId, loadedSections, projectGenre)
      }
      setSections(loadedSections)
      setSavedGenre(await loadSectionsGenre(projectId))

      if (loadedSections.length > 0) {
        const initialOrganization = initialOrganizationRef.current
        const initialSection = initialOrganization
          ? loadedSections.find((section) => section.key === 'forces') ?? loadedSections[0]!
          : loadedSections[0]!
        setActiveSection(initialSection)
        if (initialOrganization) {
          setForcesView('directory')
          consumeInitialOrganizationRef.current?.()
        }
      }
      setConfigLoaded(true)
    }
    void init()
  }, [projectId])

  useEffect(() => {
    if (!configLoaded) return
    saveSections(projectId, sectionsRef.current).catch(console.error)
  }, [sections, configLoaded, projectId])

  useEffect(() => {
    if (!activeSection) return
    loadPrompt(projectId, promptKey).then((saved) => {
      setEditingPrompt(saved ?? '')
      setShowPrompt(false)
    }).catch(() => {})
  }, [projectId, promptKey, activeSection])

  useEffect(() => {
    if (!activeSection) return
    let cancelled = false
    const loadContent = async () => {
      try {
        const nextContent = await readProjectFile(projectId, 'worldview', activeSection.file)
        const [nextHash, draft] = await Promise.all([
          contentHash(nextContent),
          loadWorldviewDraft(projectId, activeSection.file),
        ])
        if (cancelled) return
        setContent(nextContent)
        setSubValues(parseWorldviewSubs(nextContent, activeSection.subs.map((s) => s.key)))
        setBaseContentHash(nextHash)
        setDirty(false)
        setDraftToRecover(draft)
      } catch (error) {
        if (!cancelled) console.error(error)
      }
    }
    void loadContent()
    return () => { cancelled = true }
  }, [projectId, activeSection])

  const saveCurrentChanges = useCallback(async (): Promise<boolean> => {
    if (!activeSection) return false
    try {
      const nextContent = hasSubs
        ? buildWorldviewContent(activeSection.label, subValues)
        : content
      await writeProjectFile(projectId, 'worldview', activeSection.file, nextContent)
      draftPayloadRef.current = null
      await deleteWorldviewDraft(projectId, activeSection.file)
      setBaseContentHash(await contentHash(nextContent))
      setDraftToRecover(null)
      setEditing(false)
      setDirty(false)
      return true
    } catch (error) {
      console.error('保存世界观内容失败：', error)
      return false
    }
  }, [activeSection, content, hasSubs, projectId, subValues])

  const handleSave = () => { void saveCurrentChanges() }

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => dirty,
    saveChanges: saveCurrentChanges,
    discardChanges: () => {
      draftPayloadRef.current = null
      if (activeSection) void deleteWorldviewDraft(projectId, activeSection.file)
      setDraftToRecover(null)
      setDirty(false)
      setEditing(false)
    },
  }), [activeSection, dirty, projectId, saveCurrentChanges])

  useEffect(() => {
    if (!activeSection || !dirty) {
      draftPayloadRef.current = null
      return
    }
    draftPayloadRef.current = {
      schemaVersion: 1,
      sectionFile: activeSection.file,
      savedAt: new Date().toISOString(),
      baseContentHash,
      content,
      subValues,
    }
  }, [activeSection, baseContentHash, content, dirty, subValues])

  useEffect(() => {
    const draft = draftPayloadRef.current
    if (!draft) return
    const timeout = window.setTimeout(() => {
      saveWorldviewDraft(projectId, draft).catch((error: unknown) => console.error('保存世界观草稿失败：', error))
    }, 1_500)
    return () => window.clearTimeout(timeout)
  }, [projectId, activeSection, baseContentHash, content, dirty, subValues])

  useEffect(() => () => {
    const draft = draftPayloadRef.current
    if (draft) saveWorldviewDraft(projectId, draft).catch((error: unknown) => console.error('保存世界观草稿失败：', error))
  }, [projectId])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  const handleStartEdit = () => {
    if (!activeSection) return
    setSubValues(parseWorldviewSubs(content, activeSection.subs.map((s) => s.key)))
    setEditing(true)
  }

  const updateSubField = (key: string, value: string) => {
    setSubValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const selectSection = (section: SectionDef) => {
    setActiveSection(section)
    setEditing(false)
  }

  const handleSelectSection = (section: SectionDef) => {
    if (section.key === activeSection?.key) return
    if (dirty) {
      setPendingSection(section)
      setShowUnsavedChanges(true)
      return
    }
    selectSection(section)
  }

  const handleSaveAndSwitch = async () => {
    setSavingChanges(true)
    const saved = await saveCurrentChanges()
    setSavingChanges(false)
    if (!saved) return
    const target = pendingSection
    setPendingSection(null)
    setShowUnsavedChanges(false)
    if (target) selectSection(target)
  }

  const handleDiscardAndSwitch = () => {
    draftPayloadRef.current = null
    if (activeSection) void deleteWorldviewDraft(projectId, activeSection.file)
    const target = pendingSection
    setDraftToRecover(null)
    setDirty(false)
    setEditing(false)
    setPendingSection(null)
    setShowUnsavedChanges(false)
    if (target) selectSection(target)
  }

  const handleRestoreDraft = () => {
    if (!draftToRecover || draftToRecover.sectionFile !== activeSection?.file) return
    setContent(draftToRecover.content)
    setSubValues(draftToRecover.subValues)
    setDirty(true)
    setEditing(true)
    setDraftToRecover(null)
  }

  const handleDiscardDraft = () => {
    if (draftToRecover) void deleteWorldviewDraft(projectId, draftToRecover.sectionFile)
    setDraftToRecover(null)
  }

  const handleStartRenameSection = (section: SectionDef) => {
    setEditingSectionId(section.key)
    setEditingSectionLabel(section.label)
  }

  const handleRenameSection = (sectionId: string) => {
    const newLabel = editingSectionLabel.trim()
    if (!newLabel) return
    setSections((prev) => prev.map((section) => (
      section.key === sectionId ? { ...section, label: newLabel } : section
    )))
    setActiveSection((prev) => (
      prev?.key === sectionId ? { ...prev, label: newLabel } : prev
    ))
    setEditingSectionId(null)
  }

  const handleDeleteSection = (sectionId: string) => {
    const section = sections.find((item) => item.key === sectionId)
    if (!section) return
    writeProjectFile(projectId, 'worldview', section.file, '')
      .then(() => {
        setSections((prev) => {
          const next = prev.filter((item) => item.key !== sectionId)
          if (next.length === 0) return prev
          if (activeSection?.key === sectionId) setActiveSection(next[0]!)
          return next
        })
      })
      .catch(console.error)
    setDeletingSectionId(null)
  }

  const handleToggleAddSection = (show: boolean) => {
    setShowAddSection(show)
    if (!show) setNewSectionName('')
  }

  const handleAddSection = () => {
    const name = newSectionName.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    const newSection: SectionDef = {
      key: id,
      label: name,
      file: `${id}.md`,
      hint: `填写${name}的相关设定`,
      subs: [],
    }
    setSections((prev) => [...prev, newSection])
    setActiveSection(newSection)
    setEditing(false)
    setShowAddSection(false)
    setNewSectionName('')
  }

  const handleRenameSubField = (sectionKey: string, oldSubKey: string) => {
    const newLabel = editingSubLabel.trim()
    if (!newLabel) return
    const newKey = newLabel
    const updatedSections = sections.map((section) => {
      if (section.key !== sectionKey) return section
      return {
        ...section,
        subs: section.subs.map((sub) => (
          sub.key === oldSubKey ? { ...sub, key: newKey, label: newLabel } : sub
        )),
      }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find((section) => section.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    if (oldSubKey !== newKey) {
      setSubValues((prev) => {
        const next = { ...prev }
        if (oldSubKey in next) {
          next[newKey] = next[oldSubKey]!
          delete next[oldSubKey]
        }
        return next
      })
    }
    setEditingSubKey(null)
  }

  const handleDeleteSubField = (sectionKey: string, subKey: string) => {
    const updatedSections = sections.map((section) => {
      if (section.key !== sectionKey) return section
      return { ...section, subs: section.subs.filter((sub) => sub.key !== subKey) }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find((section) => section.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    setSubValues((prev) => {
      const next = { ...prev }
      delete next[subKey]
      return next
    })
  }

  const handleAddSubField = (sectionKey: string) => {
    const name = newSubFieldName.trim()
    if (!name) return
    const newSub: SubField = {
      key: name,
      label: name,
      hint: `填写${name}的相关内容`,
    }
    const wasFreeform = sections.find((section) => section.key === sectionKey)?.subs.length === 0
    const updatedSections = sections.map((section) => {
      if (section.key !== sectionKey) return section
      return { ...section, subs: [...section.subs, newSub] }
    })
    setSections(updatedSections)
    if (activeSection?.key === sectionKey) {
      const updated = updatedSections.find((section) => section.key === sectionKey)
      if (updated) setActiveSection(updated)
    }
    if (wasFreeform && content.trim()) {
      setSubValues((prev) => ({ ...prev, [name]: content }))
      setContent('')
    } else {
      setSubValues((prev) => ({ ...prev, [name]: '' }))
    }
    setNewSubFieldName('')
    setAddingSubToKey(null)
    scrollToNewSubField()
  }

  const handleCancelAddSubField = () => {
    setAddingSubToKey(null)
    setNewSubFieldName('')
  }

  const handleResetToDefaults = () => {
    const defaults = getDefaultSections(genre)
    setSections(defaults)
    setSavedGenre(genre)
    setGenreMismatchDismissed(false)
    saveSections(projectId, defaults, genre).catch(console.error)
    if (defaults.length > 0) setActiveSection(defaults[0]!)
    setEditing(false)
    setDirty(false)
    setShowResetConfirm(false)
  }

  const generateWithAI = async () => {
    if (!activeSection) return
    setGeneratingAi(true)
    setAiError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find((item) => item.name === config.active_profile)
      if (!provider) throw new Error('未配置 AI Provider')
      if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

      const context = await buildAIContext(projectId)
      const base = provider.base_url.replace(/\/+$/, '')
      const allowedTargets = hasSubs
        ? activeSection.subs.map((sub) => ({ sectionKey: activeSection.key, fieldKey: sub.key }))
        : [{ sectionKey: activeSection.key }]
      const proposalBaseContent = hasSubs
        ? buildWorldviewContent(activeSection.label, subValues)
        : content
      const systemPrompt = [
        editingPrompt.trim() || getWorldviewDefaultPrompt(activeSection, hasSubs),
        worldviewProposalPrompt(allowedTargets),
      ].join('\n\n')
      const userMessage = [
        context,
        `【当前栏目：${activeSection.label}】`,
        proposalBaseContent || '（当前栏目为空）',
      ].filter(Boolean).join('\n\n')
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.api_key}`,
        },
        body: JSON.stringify({
          model: provider.models.analysis,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.8,
          max_tokens: 2048,
        }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const raw = extractAssistantText(await res.json() as unknown)
      setProposalReview({
        ...parseWorldviewProposalResponse(raw, allowedTargets),
        section: activeSection,
        baseContent: proposalBaseContent,
      })
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error))
    } finally {
      setGeneratingAi(false)
    }
  }

  const applyProposal = (existing: string, proposal: WorldviewProposal): string => {
    if (proposal.action === 'fill_empty') return existing.trim() ? existing : proposal.content
    if (proposal.action === 'suggest_append') return existing.trim() ? `${existing.trimEnd()}\n\n${proposal.content}` : proposal.content
    return proposal.content
  }

  const handleAcceptProposals = (proposals: WorldviewProposal[]) => {
    if (!activeSection || !proposalReview || proposals.length === 0) return
    const currentContent = hasSubs
      ? buildWorldviewContent(activeSection.label, subValues)
      : content
    if (proposalReview.section.key !== activeSection.key || proposalReview.baseContent !== currentContent) {
      setProposalReview(null)
      setAiError('生成期间栏目或内容已被修改；为避免覆盖，请重新生成或手工合并')
      return
    }
    if (hasSubs) {
      setSubValues((previous) => {
        const next = { ...previous }
        for (const proposal of proposals) {
          const fieldKey = proposal.target.fieldKey
          if (!fieldKey || proposal.target.sectionKey !== activeSection.key) continue
          next[fieldKey] = applyProposal(next[fieldKey] ?? '', proposal)
        }
        return next
      })
    } else {
      const proposal = proposals.find((item) => item.target.sectionKey === activeSection.key && !item.target.fieldKey)
      if (proposal) setContent((previous) => applyProposal(previous, proposal))
    }
    setEditing(true)
    setDirty(true)
    setProposalReview(null)
  }

  const handleOpenBootstrap = () => {
    if (dirty) {
      setAiError('请先保存或放弃当前栏目的修改，再生成整份世界观草案')
      return
    }
    if (bootstrapReview) {
      setShowBootstrapReview(true)
      return
    }
    setBootstrapError(null)
    setShowBootstrap(true)
  }

  const generateBootstrap = async (sources: WorldviewBootstrapSource[], direction: string) => {
    setGeneratingBootstrap(true)
    setBootstrapError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find((item) => item.name === config.active_profile)
      if (!provider) throw new Error('未配置 AI Provider')
      if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')

      const baseContents = Object.fromEntries(await Promise.all(sections.map(async (section) => {
        try {
          return [section.key, await readProjectFile(projectId, 'worldview', section.file)] as const
        } catch {
          return [section.key, ''] as const
        }
      })))
      const enabledContextSources: BrainstormContextSource[] = ['project_meta', ...sources]
      const context = await buildBrainstormContext({
        projectId,
        mode: 'world_expand',
        problem: '为本项目建立可编辑的首版世界观设定。',
        scope: { type: 'whole_project' },
        relatedCharacters: [],
        creativityLevel: 'balanced',
        desiredTone: '',
        mustKeep: [],
        avoid: [],
        resultCount: 3,
        enabledContextSources,
      }, 1_500)
      const allowedTargets = sections.flatMap((section) => section.subs.length > 0
        ? section.subs.map((sub) => ({ sectionKey: section.key, fieldKey: sub.key }))
        : [{ sectionKey: section.key }])
      if (allowedTargets.length === 0) throw new Error('当前没有可生成的世界观栏目')

      const sectionSnapshot = sections.map((section) => {
        const existing = baseContents[section.key] ?? ''
        return `【${section.label}】\n${existing || '（当前为空）'}`
      }).join('\n\n')
      const systemPrompt = [
        '你是小说世界观助手。请优先补全空白栏目，并让规则、势力、地点和时间线相互一致。已有内容是作者资产；除非确有明确冲突，否则使用 suggest_append 或 fill_empty，不要建议直接覆盖。',
        worldviewProposalPrompt(allowedTargets, 'bootstrap'),
      ].join('\n\n')
      const userMessage = [
        context.text || '未找到可用项目资料，请根据项目类型和用户方向建立基础设定。',
        direction.trim() ? `【本次创作方向】\n${direction.trim()}` : '',
        `【现有世界观栏目】\n${sectionSnapshot}`,
      ].filter(Boolean).join('\n\n')
      const base = provider.base_url.replace(/\/+$/, '')
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.api_key}`,
        },
        body: JSON.stringify({
          model: provider.models.analysis,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.8,
          max_tokens: 4_096,
        }),
      })
      if (!response.ok) throw new Error(`API ${response.status}`)
      const raw = extractAssistantText(await response.json() as unknown)
      const labelsBySource: Partial<Record<WorldviewBootstrapSource, string>> = {
        outline: '大纲',
        characters: '主要角色',
        foreshadows: '未回收伏笔',
        worldview: '已有世界观',
      }
      const usedSources = new Set(context.manifest.map((entry) => entry.source))
      const truncatedSources = new Set(context.manifest.filter((entry) => entry.truncated).map((entry) => entry.source))
      const sourceLabel = (source: BrainstormContextSource, label: string): string => {
        return truncatedSources.has(source) ? `${label}（已按预算截断）` : label
      }
      const sourceLabels = [
        usedSources.has('project_meta') ? sourceLabel('project_meta', '项目资料') : '',
        ...sources.map((source) => usedSources.has(source) ? sourceLabel(source, labelsBySource[source] ?? source) : ''),
      ].filter((label): label is string => Boolean(label))
      setBootstrapReview({
        ...parseWorldviewProposalResponse(raw, allowedTargets),
        baseContents,
        sourceLabels,
      })
      setShowBootstrapReview(true)
      setShowBootstrap(false)
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : String(error))
    } finally {
      setGeneratingBootstrap(false)
    }
  }

  const handleAcceptBootstrap = async (proposals: WorldviewProposal[]) => {
    if (!bootstrapReview || proposals.length === 0) return
    const affectedSections = [...new Set(proposals.map((proposal) => proposal.target.sectionKey))]
    const currentContents = Object.fromEntries(await Promise.all(affectedSections.map(async (sectionKey) => {
      const section = sections.find((item) => item.key === sectionKey)
      if (!section) return [sectionKey, ''] as const
      try {
        return [sectionKey, await readProjectFile(projectId, 'worldview', section.file)] as const
      } catch {
        return [sectionKey, ''] as const
      }
    })))
    if (affectedSections.some((sectionKey) => currentContents[sectionKey] !== bootstrapReview.baseContents[sectionKey])) {
      setBootstrapReview(null)
      setShowBootstrapReview(false)
      setAiError('生成期间有世界观内容被修改；为避免覆盖，请重新生成或手工合并')
      return
    }

    const nextContents: Record<string, string> = {}
    for (const sectionKey of affectedSections) {
      const section = sections.find((item) => item.key === sectionKey)
      if (!section) continue
      const sectionProposals = proposals.filter((proposal) => proposal.target.sectionKey === sectionKey)
      const existing = currentContents[sectionKey] ?? ''
      if (section.subs.length === 0) {
        nextContents[sectionKey] = sectionProposals.reduce((value, proposal) => applyProposal(value, proposal), existing)
        continue
      }
      const values = parseWorldviewSubs(existing, section.subs.map((sub) => sub.key))
      for (const proposal of sectionProposals) {
        const fieldKey = proposal.target.fieldKey
        if (fieldKey) values[fieldKey] = applyProposal(values[fieldKey] ?? '', proposal)
      }
      nextContents[sectionKey] = buildWorldviewContent(section.label, values)
    }

    try {
      await Promise.all(affectedSections
        .filter((sectionKey) => nextContents[sectionKey] !== currentContents[sectionKey])
        .map(async (sectionKey) => {
          const section = sections.find((item) => item.key === sectionKey)
          if (section) await writeProjectFile(projectId, 'worldview', section.file, nextContents[sectionKey] ?? '')
        }))
      if (activeSection && activeSection.key in nextContents) {
        const nextContent = nextContents[activeSection.key] ?? ''
        setContent(nextContent)
        setSubValues(parseWorldviewSubs(nextContent, activeSection.subs.map((sub) => sub.key)))
        setBaseContentHash(await contentHash(nextContent))
        setDirty(false)
        setEditing(false)
      }
      setBootstrapReview(null)
    } catch (error) {
      setAiError(`采纳世界观草案失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleOpenTemplates = async () => {
    setShowTemplates(true)
    setTemplatesLoading(true)
    setTemplateError(null)
    try {
      setTemplates(await loadWorldviewTemplates(projectId))
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : String(error))
    } finally {
      setTemplatesLoading(false)
    }
  }

  const handleCreateTemplate = async (name: string) => {
    setTemplatesSaving(true)
    setTemplateError(null)
    try {
      const template = await createWorldviewTemplate(projectId, name, sections)
      setTemplates((previous) => [...previous, template])
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : String(error))
    } finally {
      setTemplatesSaving(false)
    }
  }

  const handleApplyTemplate = async (template: WorldviewTemplate) => {
    if (dirty) {
      setTemplateError('请先保存或放弃当前栏目的修改，再应用模板')
      return
    }
    setTemplatesSaving(true)
    setTemplateError(null)
    try {
      await saveSections(projectId, template.sections, genre)
      setSections(template.sections)
      setSavedGenre(genre)
      setGenreMismatchDismissed(false)
      if (template.sections.length > 0) setActiveSection(template.sections[0]!)
      setEditing(false)
      setDirty(false)
      setShowTemplates(false)
    } catch (error) {
      setTemplateError(`应用模板失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setTemplatesSaving(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    setTemplatesSaving(true)
    setTemplateError(null)
    try {
      await deleteWorldviewTemplate(projectId, templateId)
      setTemplates((previous) => previous.filter((template) => template.id !== templateId))
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : String(error))
    } finally {
      setTemplatesSaving(false)
    }
  }

  const handleOpenRules = async () => {
    setShowRules(true)
    setRulesLoading(true)
    setRulesError(null)
    try {
      setRules(await loadWorldviewRules(projectId))
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : String(error))
    } finally {
      setRulesLoading(false)
    }
  }

  const handleCreateRule = async (input: WorldviewRuleInput) => {
    setRulesSaving(true)
    setRulesError(null)
    try {
      const rule = await createWorldviewRule(projectId, input)
      setRules((previous) => [...previous, rule])
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : String(error))
    } finally {
      setRulesSaving(false)
    }
  }

  const handleUpdateRule = async (ruleId: string, input: WorldviewRuleInput) => {
    setRulesSaving(true)
    setRulesError(null)
    try {
      const rule = await updateWorldviewRule(projectId, ruleId, input)
      setRules((previous) => previous.map((item) => item.id === ruleId ? rule : item))
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : String(error))
    } finally {
      setRulesSaving(false)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    setRulesSaving(true)
    setRulesError(null)
    try {
      await deleteWorldviewRule(projectId, ruleId)
      setRules((previous) => previous.filter((rule) => rule.id !== ruleId))
    } catch (error) {
      setRulesError(error instanceof Error ? error.message : String(error))
    } finally {
      setRulesSaving(false)
    }
  }

  const handleCheckRules = async (): Promise<WorldviewRuleCheckFinding[]> => {
    const sources = await Promise.all(sections.map(async (section) => {
      if (section.key === activeSection?.key && dirty) {
        return {
          sectionKey: section.key,
          label: section.label,
          content: section.subs.length > 0 ? buildWorldviewContent(section.label, subValues) : content,
        }
      }
      try {
        return { sectionKey: section.key, label: section.label, content: await readProjectFile(projectId, 'worldview', section.file) }
      } catch {
        return { sectionKey: section.key, label: section.label, content: '' }
      }
    }))
    return checkWorldviewRules({ rules, sections, sources })
  }

  const auditSourceTypeForEntity = (entity: BrainstormAllowedEntity): WorldviewAuditSource['type'] | null => {
    if (entity.type === 'character') return 'character'
    if (entity.type === 'worldview') return 'worldview'
    if (entity.type === 'outline') return 'outline'
    if (entity.type === 'foreshadow') return 'foreshadow'
    if (entity.type === 'chapter') return 'chapter'
    return null
  }

  const handleRunAudit = async () => {
    setGeneratingAudit(true)
    setAuditError(null)
    try {
      const config = await loadProviderConfig()
      const provider = config.providers.find((item) => item.name === config.active_profile)
      if (!provider) throw new Error('未配置 AI Provider')
      if (!provider.models.analysis) throw new Error('未配置分析模型，请在 AI 配置中设置')
      const context = await buildBrainstormContext({
        projectId,
        mode: 'world_expand',
        problem: '检查世界观设定是否与角色、大纲、伏笔和近期章节一致。',
        scope: { type: 'whole_project' },
        relatedCharacters: [],
        creativityLevel: 'safe',
        desiredTone: '',
        mustKeep: [],
        avoid: [],
        resultCount: 3,
        enabledContextSources: ['project_meta', 'chapter_content', 'outline', 'characters', 'worldview', 'foreshadows'],
      }, 1_800)
      const loadedRules = await loadWorldviewRules(projectId)
      const visibleRules = loadedRules.filter((rule) => rule.status !== 'secret')
      const entitySources = context.allowedEntities.flatMap((entity) => {
        const type = auditSourceTypeForEntity(entity)
        return type ? [{ type, id: entity.entityId, label: entity.label } satisfies WorldviewAuditSource] : []
      })
      const ruleSources: WorldviewAuditSource[] = visibleRules.map((rule) => ({ type: 'rule', id: rule.id, label: rule.name }))
      const allowedSources = [...entitySources, ...ruleSources]
      const rulesText = visibleRules.length > 0
        ? `【关键规则卡片】\n${visibleRules.map((rule) => `【${rule.name}】${rule.statement}`).join('\n')}`
        : ''
      const auditContext = [context.text, rulesText].filter(Boolean).join('\n\n')
      if (!auditContext.trim()) throw new Error('没有可用于审查的项目资料')
      const base = provider.base_url.replace(/\/+$/, '')
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.api_key}` },
        body: JSON.stringify({
          model: provider.models.analysis,
          messages: [{ role: 'system', content: worldviewAuditPrompt(allowedSources) }, { role: 'user', content: auditContext }],
          temperature: 0.2,
          max_tokens: 2_500,
        }),
      })
      if (!response.ok) throw new Error(`API ${response.status}`)
      const parsedAudit = parseWorldviewAuditResponse(extractAssistantText(await response.json() as unknown), allowedSources, auditContext)
      await saveWorldviewAuditResult(projectId, parsedAudit)
      setAuditIssueStates(await loadWorldviewIssueStates(projectId))
      setAuditResult(parsedAudit)
    } catch (auditFailure) {
      setAuditError(auditFailure instanceof Error ? auditFailure.message : String(auditFailure))
    } finally {
      setGeneratingAudit(false)
    }
  }

  const handleUpdateAuditStatus = async (fingerprint: string, status: WorldviewIssueStatus) => {
    setSavingAuditStatus(true)
    try {
      const next = await updateWorldviewIssueStatus(projectId, fingerprint, status)
      setAuditIssueStates((previous) => ({ ...previous, [fingerprint]: next }))
    } catch (statusError) {
      setAuditError(statusError instanceof Error ? statusError.message : String(statusError))
    } finally {
      setSavingAuditStatus(false)
    }
  }

  const handleOpenRuleReferences = async (rule: WorldviewRule) => {
    setReferenceRule(rule)
    setRuleReferences([])
    setReferencesError(null)
    setReferencesLoading(true)
    try { setRuleReferences(await findWorldviewRuleReferences(projectId, rule)) }
    catch (referenceError) { setReferencesError(referenceError instanceof Error ? referenceError.message : String(referenceError)) }
    finally { setReferencesLoading(false) }
  }

  const handleTogglePrompt = () => {
    if (!activeSection) return
    if (!showPrompt && !editingPrompt.trim()) {
      setEditingPrompt(getWorldviewDefaultPrompt(activeSection, hasSubs))
    }
    setShowPrompt(!showPrompt)
  }

  const handleResetPrompt = async () => {
    setSavingPrompt(true)
    await resetPrompt(projectId, promptKey)
    setEditingPrompt('')
    setShowPrompt(false)
    setSavingPrompt(false)
  }

  const handleSavePrompt = async () => {
    setSavingPrompt(true)
    await savePrompt(projectId, promptKey, editingPrompt)
    setSavingPrompt(false)
  }

  const handleRewriteMode = (mode: RewriteMode) => {
    if (!activeSection) return
    if (isFreeform) {
      const selection = getTextareaSelection(rewriteTextareaRef.current, content)
      if (!selection) return
      setRewriteState({ ...selection, mode })
      return
    }
    const textarea = document.activeElement as HTMLTextAreaElement | null
    const key = textarea?.dataset?.subkey
    if (!key || !textarea) return
    const fullContent = subValues[key] ?? ''
    const selection = getTextareaSelection(textarea, fullContent)
    if (!selection) return
    setRewriteState({ ...selection, mode, subKey: key })
  }

  const handleRewriteAccept = (newText: string) => {
    if (!rewriteState) return
    if (isFreeform || !rewriteState.subKey) {
      setContent((prev) => applyTextareaRewrite(prev, rewriteState.start, rewriteState.end, newText))
    } else {
      setSubValues((prev) => ({
        ...prev,
        [rewriteState.subKey!]: applyTextareaRewrite(prev[rewriteState.subKey!] ?? '', rewriteState.start, rewriteState.end, newText),
      }))
    }
    setDirty(true)
    setRewriteState(null)
  }

  const previewContent = activeSection && hasSubs
    ? buildWorldviewContent(activeSection.label, subValues)
    : content

  const menuItems: ContextMenuAction[] = contextMenu ? [
    { label: '✏️ AI 改写', onClick: () => handleRewriteMode('rewrite') },
    { label: '📝 AI 扩写', onClick: () => handleRewriteMode('expand') },
    { label: '✨ AI 润色', onClick: () => handleRewriteMode('polish') },
  ] : []

  if (!configLoaded || !activeSection) {
    return <div className="panel-layout"><div className="panel-placeholder" style={{ height: 300 }}>加载中…</div></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <WorldviewBanner
        genreMismatch={genreMismatch}
        genre={genre}
        savedGenre={savedGenre}
        onReset={() => setShowResetConfirm(true)}
        onDismiss={() => setGenreMismatchDismissed(true)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <WorldviewSidebar
          sections={sections}
          activeSectionKey={activeSection.key}
          editingSectionId={editingSectionId}
          editingSectionLabel={editingSectionLabel}
          showAddSection={showAddSection}
          newSectionName={newSectionName}
          onSelectSection={handleSelectSection}
          onStartRenameSection={handleStartRenameSection}
          onRenameLabelChange={setEditingSectionLabel}
          onCommitRenameSection={handleRenameSection}
          onCancelRenameSection={() => setEditingSectionId(null)}
          onDeleteSection={setDeletingSectionId}
          onNewSectionNameChange={setNewSectionName}
          onAddSection={handleAddSection}
          onToggleAddSection={handleToggleAddSection}
          onOpenBootstrap={handleOpenBootstrap}
          onOpenTemplates={() => { void handleOpenTemplates() }}
          onOpenRules={() => { void handleOpenRules() }}
          onOpenAudit={() => {
            setAuditError(null)
            setShowAudit(true)
            void Promise.all([loadWorldviewAuditResult(projectId), loadWorldviewIssueStates(projectId)])
              .then(([result, states]) => {
                setAuditResult(result)
                setAuditIssueStates(states)
              })
              .catch((stateError: unknown) => { setAuditError(stateError instanceof Error ? stateError.message : String(stateError)) })
          }}
          onOpenResetConfirm={() => setShowResetConfirm(true)}
        />
        <div className="worldview-editor-shell">
          {activeSection.key === 'forces' && (
            <div className="worldview-forces-switch" role="group" aria-label="势力组织视图">
              <Button variant={forcesView === 'directory' ? 'secondary' : 'text'} size="sm" onClick={() => setForcesView('directory')}>组织目录</Button>
              <Button variant={forcesView === 'narrative' ? 'secondary' : 'text'} size="sm" onClick={() => setForcesView('narrative')}>叙述正文</Button>
            </div>
          )}
          {activeSection.key === 'forces' && forcesView === 'directory' ? (
            <OrganizationManager projectId={projectId} initialOrganizationId={organizationTargetId} />
          ) : (
            <WorldviewEditor
          activeSection={activeSection}
          previewContent={previewContent}
          content={content}
          subValues={subValues}
          editing={editing}
          dirty={dirty}
          showExample={showExample}
          showPrompt={showPrompt}
          editingPrompt={editingPrompt}
          savingPrompt={savingPrompt}
          aiError={aiError}
          generatingAi={generatingAi}
          hasSelection={hasSelection}
          rewriteState={rewriteState}
          isFreeform={isFreeform}
          contextMenu={contextMenu}
          menuItems={menuItems}
          genre={genre}
          activeSectionHint={activeSection.hint}
          rewriteTextareaRef={rewriteTextareaRef}
          subFieldEndRef={subFieldEndRef}
          addingSubToKey={addingSubToKey}
          newSubFieldName={newSubFieldName}
          editingSubKey={editingSubKey}
          editingSubLabel={editingSubLabel}
          onStartEdit={handleStartEdit}
          onSave={handleSave}
          onGenerateAi={() => { void generateWithAI() }}
          onTogglePrompt={handleTogglePrompt}
          onPromptChange={setEditingPrompt}
          onResetPrompt={() => { void handleResetPrompt() }}
          onSavePrompt={() => { void handleSavePrompt() }}
          onToggleExample={(key) => setShowExample((prev) => (prev === key ? null : key))}
          onContentChange={(value) => {
            setContent(value)
            setDirty(true)
          }}
          onUpdateSubField={updateSubField}
          onSelectionCheck={checkSelection}
          onSelectionContextMenu={handleSelectionContextMenu}
          onStartAddSubField={setAddingSubToKey}
          onNewSubFieldNameChange={setNewSubFieldName}
          onAddSubField={handleAddSubField}
          onCancelAddSubField={handleCancelAddSubField}
          onStartRenameSubField={(subKey, label) => {
            setEditingSubKey(subKey)
            setEditingSubLabel(label)
          }}
          onRenameSubFieldLabelChange={setEditingSubLabel}
          onCommitRenameSubField={handleRenameSubField}
          onCancelRenameSubField={() => setEditingSubKey(null)}
          onDeleteSubField={handleDeleteSubField}
          onRewriteMode={handleRewriteMode}
          onRewriteAccept={handleRewriteAccept}
          onRewriteReject={() => setRewriteState(null)}
          onContextMenuClose={() => setContextMenu(null)}
            />
          )}
        </div>
      </div>
      <WorldviewDialogs
        showResetConfirm={showResetConfirm}
        genre={genre}
        deletingSection={sections.find((section) => section.key === deletingSectionId) ?? null}
        onConfirmReset={handleResetToDefaults}
        onCancelReset={() => setShowResetConfirm(false)}
        onConfirmDelete={handleDeleteSection}
        onCancelDelete={() => setDeletingSectionId(null)}
      />
      {showUnsavedChanges && (
        <WorldviewUnsavedChangesDialog
          saving={savingChanges}
          onSave={() => { void handleSaveAndSwitch() }}
          onDiscard={handleDiscardAndSwitch}
          onCancel={() => {
            setPendingSection(null)
            setShowUnsavedChanges(false)
          }}
        />
      )}
      {draftToRecover && (
        <WorldviewDraftRecoveryDialog
          draft={draftToRecover}
          officialContent={content}
          baseContentChanged={Boolean(baseContentHash && draftToRecover.baseContentHash !== baseContentHash)}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
        />
      )}
      {proposalReview && (
        <WorldviewProposalDialog
          sections={[proposalReview.section]}
          response={proposalReview.response}
          ignoredCount={proposalReview.ignored.length}
          onAccept={handleAcceptProposals}
          onClose={() => setProposalReview(null)}
        />
      )}
      {showBootstrap && (
        <WorldviewBootstrapDialog
          generating={generatingBootstrap}
          error={bootstrapError}
          onGenerate={(sources, direction) => { void generateBootstrap(sources, direction) }}
          onClose={() => {
            setShowBootstrap(false)
            setBootstrapError(null)
          }}
        />
      )}
      {bootstrapReview && showBootstrapReview && (
        <WorldviewProposalDialog
          sections={sections}
          response={bootstrapReview.response}
          ignoredCount={bootstrapReview.ignored.length}
          sourceLabels={bootstrapReview.sourceLabels}
          onAccept={(proposals) => { void handleAcceptBootstrap(proposals) }}
          onRegenerate={() => {
            setShowBootstrapReview(false)
            setBootstrapError(null)
            setShowBootstrap(true)
          }}
          onClose={() => setShowBootstrapReview(false)}
        />
      )}
      {showTemplates && (
        <WorldviewTemplateDialog
          templates={templates}
          loading={templatesLoading}
          saving={templatesSaving}
          error={templateError}
          onCreate={(name) => { void handleCreateTemplate(name) }}
          onApply={(template) => { void handleApplyTemplate(template) }}
          onDelete={(templateId) => { void handleDeleteTemplate(templateId) }}
          onClose={() => {
            setShowTemplates(false)
            setTemplateError(null)
          }}
        />
      )}
      {showRules && (
        <WorldviewRulesDialog
          rules={rules}
          sections={sections}
          loading={rulesLoading}
          saving={rulesSaving}
          error={rulesError}
          onCreate={(input) => { void handleCreateRule(input) }}
          onUpdate={(ruleId, input) => { void handleUpdateRule(ruleId, input) }}
          onDelete={(ruleId) => { void handleDeleteRule(ruleId) }}
          onReferences={(rule) => { void handleOpenRuleReferences(rule) }}
          onCheck={handleCheckRules}
          onClose={() => {
            setShowRules(false)
            setRulesError(null)
          }}
        />
      )}
      {showAudit && (
        <WorldviewAuditDialog
          generating={generatingAudit}
          error={auditError}
          result={auditResult}
          issueStates={auditIssueStates}
          savingStatus={savingAuditStatus}
          onRun={() => { void handleRunAudit() }}
          onUpdateStatus={(fingerprint, status) => { void handleUpdateAuditStatus(fingerprint, status) }}
          onClose={() => {
            setShowAudit(false)
            setAuditError(null)
          }}
        />
      )}
      {referenceRule && <WorldviewRuleReferencesDialog ruleName={referenceRule.name} loading={referencesLoading} references={ruleReferences} error={referencesError} onClose={() => setReferenceRule(null)} />}
    </div>
  )
})

WorldviewPanel.displayName = 'WorldviewPanel'

export default WorldviewPanel
