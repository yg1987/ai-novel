import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { listChapters, listProjectFiles } from '../api/tauri'
import { runBrainstorm } from '../services/brainstormService'
import {
  createBrainstormSession,
  deleteBrainstormSession,
  getBrainstormSessionImpact,
  listBrainstormSessions,
  loadBrainstormPreferences,
  loadBrainstormSession,
  saveBrainstormPreferences,
  saveBrainstormSession,
} from '../services/brainstormStorage'
import type { BrainstormSessionImpact } from '../services/brainstormStorage'
import { logAIGenerated } from '../services/stats'
import { buildChapterRef, generateId, saveNote } from '../services/notesStorage'
import type { CurrentChapterRef } from '../types/material'
import type { ChapterMeta } from '../types/chapter'
import {
  chapterNumberLabel,
  chapterRefKey,
  compareChapters,
  loadChapterDisplayMetadata,
  scopeDisplaySummary,
  volumeDisplayName,
  type ChapterDisplayMetadata,
} from '../services/chapterDisplay'
import type {
  BrainstormContextSource,
  BrainstormForeshadowDraft,
  BrainstormIdea,
  BrainstormMode,
  BrainstormOperation,
  BrainstormProjectPreferences,
  BrainstormRequest,
  BrainstormScope,
  BrainstormSession,
  BrainstormSessionHistoryEntry,
  CreativityLevel,
} from '../types/brainstorm'
import { BRAINSTORM_MODE_CONTEXT_PRESETS, DEFAULT_BRAINSTORM_PREFERENCES } from '../types/brainstorm'
import Button from './Button'
import Modal from './Modal'
import Pagination from './Pagination'
import './BrainstormPanel.css'

interface Props {
  projectId: string
  currentChapter: CurrentChapterRef | null
  currentSessionId: string | null
  onCurrentSessionChange: (sessionId: string | null) => void
  onOpenForeshadowDraft: (draft: BrainstormForeshadowDraft) => void
}

type BrainstormStatus = 'idle' | 'generating' | 'saving' | 'success' | 'unsaved' | 'error'
type ScopeKind = BrainstormScope['type']
type BrainstormView = 'current' | 'history'
type HistoryFavoriteFilter = 'all' | 'favorites'

interface BrainstormSettingsDraft {
  mode: BrainstormMode
  scopeKind: ScopeKind
  selectedChapterKeys: string[]
  relatedCharacters: string[]
  creativityLevel: CreativityLevel
  resultCount: number
  desiredTone: string
  mustKeepText: string
  avoidText: string
  enabledSources: BrainstormContextSource[]
}

const MODE_CONFIG: { key: BrainstormMode; label: string; desc: string }[] = [
  { key: 'plot_twist', label: '情节走向', desc: '下一步的因果与悬念' },
  { key: 'scene_idea', label: '场景创意', desc: '可以落笔的具体桥段' },
  { key: 'character_dev', label: '角色发展', desc: '动机、关系与认知变化' },
  { key: 'world_expand', label: '世界观扩展', desc: '为剧情服务的设定补全' },
]

const SOURCE_LABELS: Record<BrainstormContextSource, string> = {
  project_meta: '项目资料',
  chapter_content: '章节结尾',
  chapter_snapshot: '章节快照',
  outline: '章节大纲',
  characters: '角色资料',
  relationships: '角色关系',
  worldview: '世界观',
  foreshadows: '未回收伏笔',
  notes: '备注',
}

const CREATIVITY_LABELS: Record<CreativityLevel, string> = {
  safe: '稳妥',
  balanced: '平衡',
  bold: '大胆',
}

const HISTORY_PAGE_SIZE_OPTIONS = [10, 20, 30]
const SELECTOR_PAGE_SIZE_OPTIONS = [20, 50, 100]
const EMPTY_CHAPTER_METADATA: ChapterDisplayMetadata = { volumeNames: {}, chapterTitles: {} }

function chapterRef(chapter: ChapterMeta) {
  return { volume: chapter.volume, chapterId: chapter.id, chapterTitle: chapter.title }
}

function toLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function sameItems(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function persistedRequest(request: BrainstormRequest): BrainstormSession['request'] {
  return {
    projectId: request.projectId,
    mode: request.mode,
    problem: request.problem,
    scope: request.scope,
    relatedCharacters: request.relatedCharacters,
    creativityLevel: request.creativityLevel,
    desiredTone: request.desiredTone,
    mustKeep: request.mustKeep,
    avoid: request.avoid,
    resultCount: request.resultCount,
    enabledContextSources: request.enabledContextSources,
    derivation: request.derivation,
  }
}

function selectedKeysForScope(scope: BrainstormScope, chapters: ChapterMeta[]): string[] {
  if (scope.type === 'current_chapter') return [chapterRefKey(scope.chapter)]
  if (scope.type === 'current_volume') {
    const anchor = chapters.find((chapter) => chapter.volume === scope.volume)
    return anchor ? [chapterRefKey(anchor)] : []
  }
  if (scope.type === 'selected_chapters') return scope.chapters.map(chapterRefKey)
  return []
}

export default function BrainstormPanel({ projectId, currentChapter, currentSessionId, onCurrentSessionChange, onOpenForeshadowDraft }: Props) {
  const [mode, setMode] = useState<BrainstormMode>(DEFAULT_BRAINSTORM_PREFERENCES.mode)
  const [creativityLevel, setCreativityLevel] = useState<CreativityLevel>(DEFAULT_BRAINSTORM_PREFERENCES.creativityLevel)
  const [resultCount, setResultCount] = useState(DEFAULT_BRAINSTORM_PREFERENCES.resultCount)
  const [enabledSources, setEnabledSources] = useState<BrainstormContextSource[]>(DEFAULT_BRAINSTORM_PREFERENCES.enabledContextSources)
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
  const [chapterMetadata, setChapterMetadata] = useState<ChapterDisplayMetadata>(EMPTY_CHAPTER_METADATA)
  const [characterNames, setCharacterNames] = useState<string[]>([])
  const [scopeKind, setScopeKind] = useState<ScopeKind>('whole_project')
  const [selectedChapterKeys, setSelectedChapterKeys] = useState<string[]>([])
  const [relatedCharacters, setRelatedCharacters] = useState<string[]>([])
  const [problem, setProblem] = useState('')
  const [desiredTone, setDesiredTone] = useState('')
  const [mustKeepText, setMustKeepText] = useState('')
  const [avoidText, setAvoidText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<BrainstormSettingsDraft | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [chapterSearch, setChapterSearch] = useState('')
  const [chapterVolumeFilter, setChapterVolumeFilter] = useState('all')
  const [chapterSelectedOnly, setChapterSelectedOnly] = useState(false)
  const [chapterPage, setChapterPage] = useState(1)
  const [chapterPageSize, setChapterPageSize] = useState(SELECTOR_PAGE_SIZE_OPTIONS[0] ?? 20)
  const [characterSearch, setCharacterSearch] = useState('')
  const [status, setStatus] = useState<BrainstormStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<BrainstormSession | null>(null)
  const [derivingIdeaIds, setDerivingIdeaIds] = useState<Set<string>>(new Set())
  const [combineSelection, setCombineSelection] = useState<string[]>([])
  const [feedbackIdea, setFeedbackIdea] = useState<BrainstormIdea | null>(null)
  const [feedback, setFeedback] = useState('')
  const [noteIdea, setNoteIdea] = useState<BrainstormIdea | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [view, setView] = useState<BrainstormView>('current')
  const [historyEntries, setHistoryEntries] = useState<BrainstormSessionHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyModeFilter, setHistoryModeFilter] = useState<BrainstormMode | 'all'>('all')
  const [historyFavoriteFilter, setHistoryFavoriteFilter] = useState<HistoryFavoriteFilter>('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(HISTORY_PAGE_SIZE_OPTIONS[0] ?? 10)
  const [historySession, setHistorySession] = useState<BrainstormSession | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<BrainstormSessionHistoryEntry | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<BrainstormSessionImpact | null>(null)
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false)
  const [continuationParentSessionId, setContinuationParentSessionId] = useState<string | null>(null)
  const [continuationParentIdeas, setContinuationParentIdeas] = useState<BrainstormIdea[]>([])
  const [scaleIdea, setScaleIdea] = useState<BrainstormIdea | null>(null)
  const [scaleLevel, setScaleLevel] = useState<CreativityLevel>('balanced')
  const [moreMenuIdeaId, setMoreMenuIdeaId] = useState<string | null>(null)
  const [metadataUpdatingIds, setMetadataUpdatingIds] = useState<Set<string>>(new Set())
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const derivationControllersRef = useRef(new Map<string, AbortController>())
  const viewTabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const initialSessionIdRef = useRef(currentSessionId)

  const defaultScopeChapter = useMemo(() => {
    if (currentChapter) return currentChapter
    const latest = [...chapters].sort(compareChapters).at(-1)
    return latest ? chapterRef(latest) : null
  }, [chapters, currentChapter])

  const currentScopeChapter = useMemo(() => {
    const selectedKey = selectedChapterKeys[0]
    const selected = selectedKey ? chapters.find((chapter) => chapterRefKey(chapter) === selectedKey) : undefined
    return selected ? chapterRef(selected) : defaultScopeChapter
  }, [chapters, defaultScopeChapter, selectedChapterKeys])

  const currentScopeVolume = currentScopeChapter?.volume ?? ''
  const selectedScopeChapters = useMemo(() => chapters
    .filter((chapter) => selectedChapterKeys.includes(chapterRefKey(chapter)))
    .map(chapterRef), [chapters, selectedChapterKeys])
  const scopeForSummary: BrainstormScope = scopeKind === 'current_chapter' && currentScopeChapter
    ? { type: 'current_chapter', chapter: currentScopeChapter }
    : scopeKind === 'current_volume' && currentScopeVolume
      ? { type: 'current_volume', volume: currentScopeVolume }
      : scopeKind === 'selected_chapters'
        ? { type: 'selected_chapters', chapters: selectedScopeChapters }
        : { type: 'whole_project' }
  const scopeSummary = scopeDisplaySummary(scopeForSummary, chapters, chapterMetadata)
  const settingsSelectedRefs = settingsDraft
    ? chapters.filter((chapter) => settingsDraft.selectedChapterKeys.includes(chapterRefKey(chapter))).map(chapterRef)
    : []
  const settingsCurrentChapter = settingsDraft?.selectedChapterKeys[0]
    ? chapters.find((chapter) => chapterRefKey(chapter) === settingsDraft.selectedChapterKeys[0])
    : undefined
  const settingsCurrentChapterRef = settingsCurrentChapter ? chapterRef(settingsCurrentChapter) : defaultScopeChapter
  const settingsCurrentVolume = settingsCurrentChapterRef?.volume ?? ''
  const settingsScope: BrainstormScope = settingsDraft?.scopeKind === 'current_chapter' && settingsCurrentChapterRef
    ? { type: 'current_chapter', chapter: settingsCurrentChapterRef }
    : settingsDraft?.scopeKind === 'current_volume' && settingsCurrentVolume
      ? { type: 'current_volume', volume: settingsCurrentVolume }
      : settingsDraft?.scopeKind === 'selected_chapters'
        ? { type: 'selected_chapters', chapters: settingsSelectedRefs }
        : { type: 'whole_project' }
  const settingsScopeSummary = scopeDisplaySummary(settingsScope, chapters, chapterMetadata)
  const chapterVolumes = useMemo(() => [...new Set(
    [...chapters].sort(compareChapters).map((chapter) => chapter.volume),
  )], [chapters])
  const filteredChapters = useMemo(() => {
    const query = chapterSearch.trim().toLocaleLowerCase()
    const ordered = [...chapters].sort(compareChapters)
    return ordered.filter((chapter) => {
      if (chapterVolumeFilter !== 'all' && chapter.volume !== chapterVolumeFilter) return false
      if (chapterSelectedOnly && !settingsDraft?.selectedChapterKeys.includes(chapterRefKey(chapter))) return false
      return !query || chapterNumberLabel(chapter, chapterMetadata).toLocaleLowerCase().includes(query)
    })
  }, [chapterMetadata, chapterSearch, chapterSelectedOnly, chapterVolumeFilter, chapters, settingsDraft?.selectedChapterKeys])
  const chapterTotalPages = Math.max(1, Math.ceil(filteredChapters.length / chapterPageSize))
  const currentChapterPage = Math.min(chapterPage, chapterTotalPages)
  const pagedChapters = filteredChapters.slice((currentChapterPage - 1) * chapterPageSize, currentChapterPage * chapterPageSize)
  const filteredCharacters = useMemo(() => {
    const query = characterSearch.trim().toLocaleLowerCase()
    return query ? characterNames.filter((name) => name.toLocaleLowerCase().includes(query)) : characterNames
  }, [characterNames, characterSearch])
  const selectedCombineIdeas = useMemo(() => {
    if (!session) return []
    return combineSelection
      .map((ideaId) => session.response.ideas.find((idea) => idea.id === ideaId))
      .filter((idea): idea is BrainstormIdea => Boolean(idea))
  }, [combineSelection, session])

  const combineOperationId = `combine:${selectedCombineIdeas.map((idea) => idea.id).join(':')}`
  const contextEstimatedTokens = session?.contextManifest.reduce((total, entry) => total + entry.estimatedTokens, 0) ?? 0
  const truncatedContextCount = session?.contextManifest.filter((entry) => entry.truncated).length ?? 0
  const contextSourcesUsed = useMemo(() => [...new Set(session?.contextManifest.map((entry) => entry.source) ?? [])], [session])
  const filteredHistoryEntries = useMemo(() => historyEntries.filter((entry) => {
    if (entry.kind !== 'valid') return true
    if (historyModeFilter !== 'all' && entry.session.request.mode !== historyModeFilter) return false
    if (historyFavoriteFilter === 'favorites' && !entry.session.response.ideas.some((idea) => idea.favorite)) return false
    return true
  }), [historyEntries, historyFavoriteFilter, historyModeFilter])
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryEntries.length / historyPageSize))
  const currentHistoryPage = Math.min(historyPage, historyTotalPages)
  const pagedHistoryEntries = filteredHistoryEntries.slice((currentHistoryPage - 1) * historyPageSize, currentHistoryPage * historyPageSize)

  const cancelGeneration = useCallback(() => {
    requestIdRef.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    setStatus((previous) => previous === 'generating' || previous === 'saving' ? 'idle' : previous)
  }, [])

  const cancelDerivations = () => {
    derivationControllersRef.current.forEach((controller) => controller.abort())
    derivationControllersRef.current.clear()
    setDerivingIdeaIds(new Set())
  }

  useEffect(() => () => {
    requestIdRef.current += 1
    controllerRef.current?.abort()
    derivationControllersRef.current.forEach((controller) => controller.abort())
  }, [])

  useEffect(() => {
    let active = true
    void Promise.allSettled([
      loadBrainstormPreferences(projectId),
      listChapters(projectId),
      listProjectFiles(projectId, 'characters'),
      loadChapterDisplayMetadata(projectId),
      initialSessionIdRef.current ? loadBrainstormSession(projectId, initialSessionIdRef.current) : Promise.resolve(null),
    ]).then(([preferencesResult, chaptersResult, charactersResult, metadataResult, sessionResult]) => {
      if (!active) return
      const loadedChapters = chaptersResult.status === 'fulfilled' ? [...chaptersResult.value].sort(compareChapters) : []
      const preferences = preferencesResult.status === 'fulfilled' ? preferencesResult.value : DEFAULT_BRAINSTORM_PREFERENCES
      const restored = sessionResult.status === 'fulfilled' ? sessionResult.value : null
      setChapters(loadedChapters)
      setChapterMetadata(metadataResult.status === 'fulfilled' ? metadataResult.value : EMPTY_CHAPTER_METADATA)
      setCharacterNames(charactersResult.status === 'fulfilled'
        ? charactersResult.value.filter((file) => file.name.endsWith('.md')).map((file) => file.name.replace(/\.md$/i, ''))
        : [])
      if (restored) {
        const request = restored.request
        setMode(request.mode)
        setCreativityLevel(request.creativityLevel)
        setResultCount(request.resultCount)
        setEnabledSources(request.enabledContextSources)
        setProblem(request.problem)
        setRelatedCharacters(request.relatedCharacters)
        setDesiredTone(request.desiredTone)
        setMustKeepText(request.mustKeep.join('\n'))
        setAvoidText(request.avoid.join('\n'))
        setScopeKind(request.scope.type)
        setSelectedChapterKeys(selectedKeysForScope(request.scope, loadedChapters))
        setSession(restored)
        setStatus('success')
      } else {
        setMode(preferences.mode)
        setCreativityLevel(preferences.creativityLevel)
        setResultCount(preferences.resultCount)
        setEnabledSources(preferences.enabledContextSources)
        setSession(null)
        const latestChapter = loadedChapters.at(-1)
        const fallback = currentChapter ?? (latestChapter ? chapterRef(latestChapter) : null)
        if (fallback) {
          setScopeKind('current_chapter')
          setSelectedChapterKeys([chapterRefKey(fallback)])
        } else {
          setScopeKind('whole_project')
          setSelectedChapterKeys([])
        }
      }
      const partialFailure = chaptersResult.status === 'rejected' || charactersResult.status === 'rejected' || metadataResult.status === 'rejected'
      if (initialSessionIdRef.current && !restored) setError('当前灵感会话无法恢复')
      else if (partialFailure) setError('部分灵感设置未能加载，已保留其余可用数据')
    })
    return () => { active = false }
  }, [currentChapter, projectId])

  const preferences = (): BrainstormProjectPreferences => ({
    schemaVersion: 1,
    mode,
    creativityLevel,
    resultCount,
    enabledContextSources: enabledSources,
  })

  const persistPreferences = (next: BrainstormProjectPreferences) => {
    void saveBrainstormPreferences(projectId, next).catch(() => setError('灵感偏好未能保存'))
  }

  const resetCurrentResult = () => {
    cancelGeneration()
    cancelDerivations()
    setSession(null)
    setCombineSelection([])
    setFeedbackIdea(null)
    setNoteIdea(null)
    setError(null)
    onCurrentSessionChange(null)
  }

  const changeMode = (nextMode: BrainstormMode) => {
    if (nextMode === mode) return
    resetCurrentResult()
    const usesCurrentPreset = sameItems(enabledSources, BRAINSTORM_MODE_CONTEXT_PRESETS[mode])
    const nextSources = usesCurrentPreset ? BRAINSTORM_MODE_CONTEXT_PRESETS[nextMode] : enabledSources
    setMode(nextMode)
    setEnabledSources(nextSources)
    persistPreferences({ ...preferences(), mode: nextMode, enabledContextSources: nextSources })
  }

  const changeScope = (nextScope: ScopeKind) => {
    setSettingsDraft((previous) => previous ? {
      ...previous,
      scopeKind: nextScope,
      selectedChapterKeys: (nextScope === 'current_chapter' || nextScope === 'current_volume') && defaultScopeChapter
        ? [chapterRefKey(defaultScopeChapter)]
        : previous.selectedChapterKeys,
    } : previous)
  }

  const changeSettingsMode = (nextMode: BrainstormMode) => {
    setSettingsDraft((previous) => {
      if (!previous) return previous
      const usesCurrentPreset = sameItems(previous.enabledSources, BRAINSTORM_MODE_CONTEXT_PRESETS[previous.mode])
      return {
        ...previous,
        mode: nextMode,
        enabledSources: usesCurrentPreset ? BRAINSTORM_MODE_CONTEXT_PRESETS[nextMode] : previous.enabledSources,
      }
    })
  }

  const toggleSelectedChapter = (key: string) => {
    setSettingsDraft((previous) => previous
      ? { ...previous, selectedChapterKeys: previous.selectedChapterKeys.includes(key) ? previous.selectedChapterKeys.filter((item) => item !== key) : [...previous.selectedChapterKeys, key] }
      : previous)
  }

  const toggleRelatedCharacter = (name: string) => {
    setSettingsDraft((previous) => {
      if (!previous) return previous
      if (previous.relatedCharacters.includes(name)) {
        setSettingsError(null)
        return { ...previous, relatedCharacters: previous.relatedCharacters.filter((item) => item !== name) }
      }
      if (previous.relatedCharacters.length >= 20) {
        setSettingsError('相关角色最多选择 20 名')
        return previous
      }
      setSettingsError(null)
      return { ...previous, relatedCharacters: [...previous.relatedCharacters, name] }
    })
  }

  const openSettings = () => {
    setSettingsDraft({
      mode,
      scopeKind,
      selectedChapterKeys,
      relatedCharacters,
      creativityLevel,
      resultCount,
      desiredTone,
      mustKeepText,
      avoidText,
      enabledSources,
    })
    setChapterSearch('')
    setChapterVolumeFilter('all')
    setChapterSelectedOnly(false)
    setChapterPage(1)
    setChapterPageSize(SELECTOR_PAGE_SIZE_OPTIONS[0] ?? 20)
    setCharacterSearch('')
    setSettingsError(null)
    setSettingsOpen(true)
  }

  const closeSettings = () => {
    setSettingsOpen(false)
    setSettingsDraft(null)
    setSettingsError(null)
  }

  const applySettings = () => {
    if (!settingsDraft) return
    const mustKeep = toLines(settingsDraft.mustKeepText)
    const avoid = toLines(settingsDraft.avoidText)
    if (settingsDraft.scopeKind === 'selected_chapters' && settingsDraft.selectedChapterKeys.length === 0) {
      setSettingsError('指定章节范围至少选择一章')
      return
    }
    if (settingsDraft.mode === 'character_dev' && settingsDraft.relatedCharacters.length === 0) {
      setSettingsError('角色发展模式请至少选择一名相关角色')
      return
    }
    if (mustKeep.length > 10 || avoid.length > 10 || [...mustKeep, ...avoid].some((item) => item.length > 200)) {
      setSettingsError('必须保留和避免方向最多各 10 条，每条最多 200 个字符')
      return
    }
    const requestChanged = settingsDraft.mode !== mode
      || settingsDraft.scopeKind !== scopeKind
      || !sameItems(settingsDraft.selectedChapterKeys, selectedChapterKeys)
      || !sameItems(settingsDraft.relatedCharacters, relatedCharacters)
      || settingsDraft.creativityLevel !== creativityLevel
      || settingsDraft.resultCount !== resultCount
      || settingsDraft.desiredTone !== desiredTone
      || settingsDraft.mustKeepText !== mustKeepText
      || settingsDraft.avoidText !== avoidText
      || !sameItems(settingsDraft.enabledSources, enabledSources)
    if (requestChanged) resetCurrentResult()
    setMode(settingsDraft.mode)
    setScopeKind(settingsDraft.scopeKind)
    setSelectedChapterKeys(settingsDraft.selectedChapterKeys)
    setRelatedCharacters(settingsDraft.relatedCharacters)
    setCreativityLevel(settingsDraft.creativityLevel)
    setResultCount(settingsDraft.resultCount)
    setDesiredTone(settingsDraft.desiredTone)
    setMustKeepText(settingsDraft.mustKeepText)
    setAvoidText(settingsDraft.avoidText)
    setEnabledSources(settingsDraft.enabledSources)
    persistPreferences({
      ...preferences(),
      mode: settingsDraft.mode,
      creativityLevel: settingsDraft.creativityLevel,
      resultCount: settingsDraft.resultCount,
      enabledContextSources: settingsDraft.enabledSources,
    })
    closeSettings()
  }

  const buildScope = (): BrainstormScope | null => {
    if (scopeKind === 'whole_project') return { type: 'whole_project' }
    if (scopeKind === 'current_chapter') return currentScopeChapter ? { type: 'current_chapter', chapter: currentScopeChapter } : null
    if (scopeKind === 'current_volume') return currentScopeVolume ? { type: 'current_volume', volume: currentScopeVolume } : null
    const selected = chapters.filter((chapter) => selectedChapterKeys.includes(chapterRefKey(chapter))).map(chapterRef)
    return selected.length > 0 ? { type: 'selected_chapters', chapters: selected } : null
  }

  const handleGenerate = async () => {
    const scope = buildScope()
    if (!scope) {
      setError('当前范围没有可用章节，请选择全书背景模式或重新选择章节')
      return
    }
    cancelGeneration()
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const controller = new AbortController()
    controllerRef.current = controller
    const request: BrainstormRequest = {
      projectId,
      mode,
      problem: problem.trim(),
      scope,
      relatedCharacters,
      creativityLevel,
      desiredTone: desiredTone.trim(),
      mustKeep: toLines(mustKeepText),
      avoid: toLines(avoidText),
      resultCount,
      enabledContextSources: enabledSources,
      derivation: continuationParentSessionId ? {
        operation: 'continue',
        parentSessionId: continuationParentSessionId,
        parentIdeaIds: [],
        feedback: '',
      } : undefined,
      signal: controller.signal,
    }
    setSession(null)
    setError(null)
    setStatus('generating')
    let generatedSession: BrainstormSession | null = null
    try {
      const result = await runBrainstorm(request, continuationParentIdeas)
      if (requestId !== requestIdRef.current) return
      const nextSession = createBrainstormSession({
        projectId,
        request: persistedRequest(request),
        response: result.response,
        contextManifest: result.contextManifest,
        contextWarnings: result.contextWarnings,
        generation: result.generation,
      })
      generatedSession = nextSession
      setSession(nextSession)
      setStatus('saving')
      const currentChapterOrder = currentScopeChapter
        ? chapters.find((chapter) => chapter.id === currentScopeChapter.chapterId && chapter.volume === currentScopeChapter.volume)?.order ?? null
        : null
      logAIGenerated(projectId, currentChapterOrder, result.generation.durationMs, result.generation.outputTokens, {
        feature: 'brainstorm',
        operation: continuationParentSessionId ? 'continue' : 'generate',
        inputTokens: result.generation.inputTokens,
      })
      await saveBrainstormSession(projectId, nextSession)
      if (requestId !== requestIdRef.current) return
      onCurrentSessionChange(nextSession.id)
      setContinuationParentSessionId(null)
      setContinuationParentIdeas([])
      setStatus('success')
    } catch (caught) {
      if (requestId !== requestIdRef.current) return
      const message = caught instanceof Error ? caught.message : '生成灵感失败，请重试'
      if (!controller.signal.aborted) {
        if (generatedSession) {
          setError('本次灵感未能保存，但你仍可复制内容')
          setStatus('unsaved')
        } else {
          setError(message)
          setStatus('error')
        }
      }
    } finally {
      if (requestId === requestIdRef.current) controllerRef.current = null
    }
  }

  const retrySave = async () => {
    if (!session) return
    setStatus('saving')
    setError(null)
    try {
      await saveBrainstormSession(projectId, session)
      onCurrentSessionChange(session.id)
      setStatus('success')
    } catch {
      setStatus('unsaved')
      setError('本次灵感未能保存，但你仍可复制内容')
    }
  }

  const deriveIdeas = async (
    operation: Exclude<BrainstormOperation, 'generate' | 'continue'>,
    parentIdeas: BrainstormIdea[],
    feedbackText = '',
    creativityOverride?: CreativityLevel,
  ) => {
    if (!session || status !== 'success') return
    const parentIdeaIds = parentIdeas.map((idea) => idea.id)
    const operationId = `${operation}:${parentIdeaIds.join(':')}${creativityOverride ? `:${creativityOverride}` : ''}`
    if (derivationControllersRef.current.has(operationId)) return
    const controller = new AbortController()
    derivationControllersRef.current.set(operationId, controller)
    setDerivingIdeaIds((previous) => new Set(previous).add(operationId))
    setError(null)
    const derivation = {
      operation,
      parentSessionId: session.id,
      parentIdeaIds,
      feedback: feedbackText.trim(),
    }
    const request: BrainstormRequest = {
      ...session.request,
      creativityLevel: creativityOverride ?? session.request.creativityLevel,
      derivation,
      signal: controller.signal,
    }
    let generatedSession: BrainstormSession | null = null
    try {
      const result = await runBrainstorm(request, parentIdeas)
      if (controller.signal.aborted) return
      const parentSession = await loadBrainstormSession(projectId, session.id)
      if (!parentSession) throw new Error('来源灵感会话已删除，无法保存本次推演')
      const nextSession = createBrainstormSession({
        projectId,
        request: persistedRequest(request),
        response: result.response,
        contextManifest: result.contextManifest,
        contextWarnings: result.contextWarnings,
        generation: result.generation,
      })
      generatedSession = nextSession
      setSession(nextSession)
      setCreativityLevel(request.creativityLevel)
      setCombineSelection([])
      setStatus('saving')
      const currentChapterOrder = currentScopeChapter
        ? chapters.find((chapter) => chapter.id === currentScopeChapter.chapterId && chapter.volume === currentScopeChapter.volume)?.order ?? null
        : null
      logAIGenerated(projectId, currentChapterOrder, result.generation.durationMs, result.generation.outputTokens, {
        feature: 'brainstorm',
        operation,
        inputTokens: result.generation.inputTokens,
      })
      await saveBrainstormSession(projectId, nextSession)
      onCurrentSessionChange(nextSession.id)
      setStatus('success')
    } catch (caught) {
      if (!controller.signal.aborted) {
        if (generatedSession) {
          setStatus('unsaved')
          setError('本次推演未能保存，但你仍可复制内容')
        } else {
          setError(caught instanceof Error ? caught.message : '继续推演失败，请重试')
        }
      }
    } finally {
      derivationControllersRef.current.delete(operationId)
      setDerivingIdeaIds((previous) => {
        const next = new Set(previous)
        next.delete(operationId)
        return next
      })
    }
  }

  const formatIdea = (idea: BrainstormIdea): string => [
    idea.title,
    '',
    `核心方向：${idea.summary}`,
    idea.developmentSteps.length > 0 ? `展开方式：\n${idea.developmentSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}` : '',
    `推荐位置：${idea.suggestedLocation.chapterLabel} ${idea.suggestedLocation.positionNote}`.trim(),
    `为什么适合：${idea.whyItFits}`,
    idea.risks.length > 0 ? `风险：${idea.risks.join('；')}` : '',
  ].filter(Boolean).join('\n')

  const copyIdea = async (idea: BrainstormIdea) => {
    try {
      await navigator.clipboard.writeText(formatIdea(idea))
    } catch {
      setError('复制失败，请手动选择内容复制')
    }
  }

  const openSaveNote = (idea: BrainstormIdea) => {
    setNoteIdea(idea)
    setNoteContent(formatIdea(idea))
  }

  const saveIdeaAsNote = async () => {
    if (!session || !noteIdea || !noteContent.trim()) return
    const suggestedChapter = noteIdea.suggestedLocation.verified && noteIdea.suggestedLocation.chapterId && noteIdea.suggestedLocation.volume
      ? chapters.find((chapter) => chapter.id === noteIdea.suggestedLocation.chapterId && chapter.volume === noteIdea.suggestedLocation.volume)
      : undefined
    try {
      await saveNote(projectId, {
        id: generateId(),
        content: noteContent.trim(),
        type: 'note',
        chapterRef: suggestedChapter ? buildChapterRef(suggestedChapter.volume, suggestedChapter.id) : '',
        done: false,
        resolved: false,
        createdAt: new Date().toISOString().slice(0, 16),
        source: { type: 'brainstorm', sessionId: session.id, ideaId: noteIdea.id },
      })
      setNoteIdea(null)
      setNoteContent('')
    } catch {
      setError('保存备注失败，请重试')
    }
  }

  const openForeshadowDraft = (idea: BrainstormIdea) => {
    const relatedCharacters = idea.connections
      .filter((connection) => connection.type === 'character' && connection.verified)
      .map((connection) => connection.label)
    const locationChapter = idea.suggestedLocation.chapterId && idea.suggestedLocation.volume
      ? chapters.find((chapter) => chapter.id === idea.suggestedLocation.chapterId && chapter.volume === idea.suggestedLocation.volume)
      : undefined
    onOpenForeshadowDraft({
      name: idea.title,
      description: `${idea.summary}\n\n${idea.whyItFits}`,
      plantedChapter: idea.suggestedLocation.verified && locationChapter
        ? { volume: locationChapter.volume, chapterId: locationChapter.id }
        : undefined,
      relatedCharacters,
      notes: `来源：灵感会话 ${session?.id ?? ''} / 建议 ${idea.id}`,
    })
  }

  const toggleCombineSelection = (ideaId: string) => {
    setCombineSelection((previous) => {
      if (previous.includes(ideaId)) return previous.filter((selectedId) => selectedId !== ideaId)
      return previous.length < 2 ? [...previous, ideaId] : previous
    })
  }

  const refreshHistory = async (resetPage = false) => {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const entries = await listBrainstormSessions(projectId)
      setHistoryEntries(entries)
      if (resetPage) setHistoryPage(1)
    } catch {
      setHistoryError('灵感历史未能加载，请重试')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openHistory = () => {
    setView('history')
    setHistorySession(null)
    void refreshHistory(true)
  }

  const changeView = (nextView: BrainstormView) => {
    if (nextView === 'history') openHistory()
    else setView('current')
  }

  const handleViewTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (currentIndex + direction + 2) % 2
    if (direction === 0 && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    changeView(nextIndex === 0 ? 'current' : 'history')
    viewTabRefs.current[nextIndex]?.focus()
  }

  const updateIdeaMetadata = async (
    targetSession: BrainstormSession,
    ideaId: string,
    updates: Partial<Pick<BrainstormIdea, 'favorite' | 'dismissed'>>,
  ) => {
    const metadataId = `${targetSession.id}:${ideaId}`
    if (metadataUpdatingIds.has(metadataId)) return
    const nextSession: BrainstormSession = {
      ...targetSession,
      response: {
        ...targetSession.response,
        ideas: targetSession.response.ideas.map((idea) => idea.id === ideaId ? { ...idea, ...updates } : idea),
      },
    }
    setMetadataUpdatingIds((previous) => new Set(previous).add(metadataId))
    try {
      await saveBrainstormSession(projectId, nextSession)
      if (session?.id === targetSession.id) {
        setSession(nextSession)
        if (status === 'unsaved') {
          onCurrentSessionChange(nextSession.id)
          setStatus('success')
        }
      }
      if (historySession?.id === targetSession.id) setHistorySession(nextSession)
      setHistoryEntries((previous) => previous.map((entry) => entry.kind === 'valid' && entry.session.id === targetSession.id
        ? { kind: 'valid', session: nextSession }
        : entry))
    } catch {
      setError('更新灵感标记失败，请重试')
    } finally {
      setMetadataUpdatingIds((previous) => {
        const next = new Set(previous)
        next.delete(metadataId)
        return next
      })
    }
  }

  const deleteHistorySession = async () => {
    if (!deleteEntry) return
    const sessionId = deleteEntry.kind === 'valid' ? deleteEntry.session.id : deleteEntry.sessionId
    try {
      await deleteBrainstormSession(projectId, sessionId)
      setHistoryEntries((previous) => previous.filter((entry) => (entry.kind === 'valid' ? entry.session.id : entry.sessionId) !== sessionId))
      if (historySession?.id === sessionId) setHistorySession(null)
      if (session?.id === sessionId) {
        setSession(null)
        setStatus('idle')
        onCurrentSessionChange(null)
      }
      setDeleteEntry(null)
      setDeleteImpact(null)
    } catch {
      setHistoryError('删除灵感会话失败，请重试')
    }
  }

  const openDeleteDialog = async (entry: BrainstormSessionHistoryEntry) => {
    const sessionId = entry.kind === 'valid' ? entry.session.id : entry.sessionId
    setDeleteEntry(entry)
    setDeleteImpact(null)
    setDeleteImpactLoading(true)
    try {
      setDeleteImpact(await getBrainstormSessionImpact(projectId, sessionId))
    } catch {
      setDeleteImpact({ childSessionCount: 0, noteCount: 0 })
    } finally {
      setDeleteImpactLoading(false)
    }
  }

  const continueFromHistory = () => {
    if (!historySession) return
    const request = historySession.request
    setMode(request.mode)
    setCreativityLevel(request.creativityLevel)
    setResultCount(request.resultCount)
    setEnabledSources(request.enabledContextSources)
    setProblem(request.problem)
    setRelatedCharacters(request.relatedCharacters)
    setDesiredTone(request.desiredTone)
    setMustKeepText(request.mustKeep.join('\n'))
    setAvoidText(request.avoid.join('\n'))
    setScopeKind(request.scope.type)
    setSelectedChapterKeys(selectedKeysForScope(request.scope, chapters))
    setContinuationParentSessionId(historySession.id)
    setContinuationParentIdeas(historySession.response.ideas)
    setSession(null)
    setStatus('idle')
    setError(null)
    onCurrentSessionChange(null)
    setView('current')
  }

  return (
    <div className="panel-layout brainstorm-panel">
      <aside className="panel-sidebar brainstorm-sidebar">
        <h3>灵感模式</h3>
        <div className="brainstorm-modes">
          {MODE_CONFIG.map((item) => (
            <button key={item.key} type="button" className={`brainstorm-mode-btn${mode === item.key ? ' active' : ''}`} onClick={() => changeMode(item.key)}>
              <span className="brainstorm-mode-label">{item.label}</span>
              <span className="brainstorm-mode-desc">{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="brainstorm-scope-summary">
          <span>本次范围</span>
          <strong title={scopeSummary}>{scopeSummary}</strong>
          <Button variant="secondary" size="sm" onClick={openSettings}>范围与条件</Button>
        </div>
      </aside>

      <main className="panel-editor brainstorm-content">
        <div className="brainstorm-view-tabs" role="tablist" aria-label="灵感视图">
          <button ref={(element) => { viewTabRefs.current[0] = element }} type="button" role="tab" aria-selected={view === 'current'} className={view === 'current' ? 'active' : ''} onClick={() => changeView('current')} onKeyDown={(event) => handleViewTabKeyDown(event, 0)}>当前</button>
          <button ref={(element) => { viewTabRefs.current[1] = element }} type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => changeView('history')} onKeyDown={(event) => handleViewTabKeyDown(event, 1)}>历史</button>
        </div>
        {view === 'current' ? (
          <>
        <section className="brainstorm-controls">
          {continuationParentSessionId && (
            <div className="brainstorm-continuation-bar">
              <span>正在基于历史会话创建新会话</span>
              <Button variant="text" size="sm" onClick={() => { setContinuationParentSessionId(null); setContinuationParentIdeas([]) }}>取消继续</Button>
            </div>
          )}
          <label className="brainstorm-field"><span>我现在遇到的问题</span>
            <textarea value={problem} maxLength={1000} rows={3} placeholder="描述卡点，可留空" onChange={(event) => { resetCurrentResult(); setProblem(event.target.value) }} />
          </label>
          <div className="brainstorm-toolbar">
            <span>{scopeSummary} · {relatedCharacters.length > 0 ? `${relatedCharacters.length} 名相关角色` : '未限定角色'} · {enabledSources.length} 类上下文</span>
            <Button variant="primary" size="md" onClick={() => { void handleGenerate() }} disabled={status === 'generating' || status === 'saving'}>
              {status === 'generating' ? '正在生成灵感…' : status === 'saving' ? '正在保存…' : continuationParentSessionId ? '生成新会话' : '生成灵感'}
            </Button>
          </div>
          {error && <div className="error-bar">{error}</div>}
          {status === 'unsaved' && <Button variant="secondary" size="sm" onClick={() => { void retrySave() }}>重新保存本次灵感</Button>}
        </section>

        {session && <div className="brainstorm-context-summary">
          <span>本次上下文：估算 {contextEstimatedTokens.toLocaleString()} / 6,000 tokens</span>
          {contextSourcesUsed.map((source, index) => <span key={source}>{SOURCE_LABELS[source]}{session.contextManifest.some((entry) => entry.source === source && entry.truncated) ? '（已截断）' : ''}{index < contextSourcesUsed.length - 1 ? '、' : ''}</span>)}
          {truncatedContextCount > 0 && <p>已按优先级截断 {truncatedContextCount} 类上下文来源。</p>}
          {session.contextWarnings.length > 0 && <p>部分上下文未加载：{session.contextWarnings.join('；')}</p>}
        </div>}

        <div className="brainstorm-results">
          {session ? (
            <>
              <div className="brainstorm-combine-toolbar">
                <span>组合推演：已选择 {selectedCombineIdeas.length}/2 条建议</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={status !== 'success' || selectedCombineIdeas.length !== 2 || derivingIdeaIds.has(combineOperationId)}
                  onClick={() => { void deriveIdeas('combine', selectedCombineIdeas) }}
                >
                  {derivingIdeaIds.has(combineOperationId) ? '正在组合…' : '组合所选'}
                </Button>
              </div>
              {session.response.summary && <p className="brainstorm-response-summary">{session.response.summary}</p>}
              {session.response.ideas.map((idea, index) => (
                <article key={idea.id} className="brainstorm-card">
                  <div className="brainstorm-card-header"><span className="brainstorm-card-index">{index + 1}</span><h4>{idea.title}</h4><span>{CREATIVITY_LABELS[idea.creativityLevel]}</span></div>
                  <div className="brainstorm-card-body">
                    <h5>核心方向</h5><p>{idea.summary}</p>
                    {idea.developmentSteps.length > 0 && <><h5>展开方式</h5><ol>{idea.developmentSteps.map((step) => <li key={step}>{step}</li>)}</ol></>}
                    <h5>推荐位置</h5><p>{idea.suggestedLocation.chapterLabel || '待作者决定'} {idea.suggestedLocation.positionNote}</p>
                    <h5>为什么适合</h5><p>{idea.whyItFits}</p>
                    {idea.connections.length > 0 && <><h5>连接对象</h5><ul>{idea.connections.map((connection) => <li key={`${connection.type}-${connection.label}`}>{connection.label}{connection.verified ? '' : '（未验证）'}：{connection.reason}</li>)}</ul></>}
                    {idea.risks.length > 0 && <><h5>风险</h5><ul>{idea.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></>}
                  </div>
                  <div className="brainstorm-card-actions">
                    <label className="brainstorm-combine-choice">
                      <input
                        type="checkbox"
                        checked={combineSelection.includes(idea.id)}
                        disabled={!combineSelection.includes(idea.id) && combineSelection.length >= 2}
                        onChange={() => toggleCombineSelection(idea.id)}
                      />
                      选入组合
                    </label>
                    <Button variant="secondary" size="sm" disabled={status !== 'success' || derivingIdeaIds.has(`deepen:${idea.id}`)} onClick={() => { void deriveIdeas('deepen', [idea]) }}>
                      {derivingIdeaIds.has(`deepen:${idea.id}`) ? '正在深化…' : '深化'}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={status !== 'success' || derivingIdeaIds.has(`variant:${idea.id}`)} onClick={() => { void deriveIdeas('variant', [idea]) }}>
                      {derivingIdeaIds.has(`variant:${idea.id}`) ? '正在生成…' : '生成变体'}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={status !== 'success'} onClick={() => {
                      setScaleIdea(idea)
                      setScaleLevel(idea.creativityLevel === 'bold' ? 'balanced' : 'bold')
                    }}>调整尺度</Button>
                    <Button variant="secondary" size="sm" disabled={status !== 'success' || derivingIdeaIds.has(`redo_with_feedback:${idea.id}`)} onClick={() => { setFeedbackIdea(idea); setFeedback('') }}>
                      基于反馈重做
                    </Button>
                    <Button variant="secondary" size="sm" disabled={status === 'saving' || metadataUpdatingIds.has(`${session.id}:${idea.id}`)} onClick={() => { void updateIdeaMetadata(session, idea.id, { favorite: !idea.favorite }) }}>
                      {idea.favorite ? '取消收藏' : '收藏'}
                    </Button>
                    <div className="brainstorm-more-menu">
                      <Button variant="secondary" size="sm" aria-haspopup="menu" aria-expanded={moreMenuIdeaId === idea.id} onClick={() => setMoreMenuIdeaId((current) => current === idea.id ? null : idea.id)}>更多</Button>
                      {moreMenuIdeaId === idea.id && (
                        <div className="brainstorm-more-popover" role="menu">
                          <Button variant="text" size="sm" role="menuitem" onClick={() => { setMoreMenuIdeaId(null); void copyIdea(idea) }}>复制全文</Button>
                          <Button variant="text" size="sm" role="menuitem" onClick={() => { setMoreMenuIdeaId(null); openSaveNote(idea) }}>保存为备注</Button>
                          <Button variant="text" size="sm" role="menuitem" onClick={() => { setMoreMenuIdeaId(null); openForeshadowDraft(idea) }}>创建伏笔候选</Button>
                          <Button variant="text" size="sm" role="menuitem" disabled={status === 'saving' || metadataUpdatingIds.has(`${session.id}:${idea.id}`)} onClick={() => {
                            setMoreMenuIdeaId(null)
                            void updateIdeaMetadata(session, idea.id, { dismissed: !idea.dismissed })
                          }}>{idea.dismissed ? '恢复采用' : '标记不采用'}</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </>
          ) : (
            <div className="review-empty"><p>描述当前卡点后生成灵感，也可以直接按默认设置开始。</p></div>
          )}
        </div>
          </>
        ) : (
          <section className="brainstorm-history">
            {historySession ? (
              <>
                <div className="brainstorm-history-detail-header">
                  <Button variant="text" size="sm" onClick={() => setHistorySession(null)}>返回列表</Button>
                  <div>
                    <h3>{MODE_CONFIG.find((item) => item.key === historySession.request.mode)?.label ?? '灵感会话'}</h3>
                    <p>{historySession.createdAt.replace('T', ' ').slice(0, 16)} · {scopeDisplaySummary(historySession.request.scope, chapters, chapterMetadata)} · {historySession.response.ideas.length} 条建议</p>
                  </div>
                  <div className="brainstorm-history-detail-actions">
                    <Button variant="danger" size="sm" onClick={() => { void openDeleteDialog({ kind: 'valid', session: historySession }) }}>删除</Button>
                    <Button variant="primary" size="sm" onClick={continueFromHistory}>基于本次继续</Button>
                  </div>
                </div>
                <div className="brainstorm-history-detail-scroll">
                  {historySession.request.problem && <p className="brainstorm-history-problem">当前问题：{historySession.request.problem}</p>}
                  {historySession.response.summary && <p className="brainstorm-response-summary">{historySession.response.summary}</p>}
                  {historySession.response.ideas.map((idea, index) => {
                    const metadataId = `${historySession.id}:${idea.id}`
                    const updating = metadataUpdatingIds.has(metadataId)
                    return (
                      <article key={idea.id} className="brainstorm-card brainstorm-history-idea">
                        <div className="brainstorm-card-header"><span className="brainstorm-card-index">{index + 1}</span><h4>{idea.title}</h4><span>{CREATIVITY_LABELS[idea.creativityLevel]}</span></div>
                        <div className="brainstorm-card-body">
                          <h5>核心方向</h5><p>{idea.summary}</p>
                          {idea.developmentSteps.length > 0 && <><h5>展开方式</h5><ol>{idea.developmentSteps.map((step) => <li key={step}>{step}</li>)}</ol></>}
                          <h5>推荐位置</h5><p>{idea.suggestedLocation.chapterLabel || '待作者决定'} {idea.suggestedLocation.positionNote}</p>
                          <h5>为什么适合</h5><p>{idea.whyItFits}</p>
                          {idea.connections.length > 0 && <><h5>连接对象</h5><ul>{idea.connections.map((connection) => <li key={`${connection.type}-${connection.label}`}>{connection.label}{connection.verified ? '' : '（未验证）'}：{connection.reason}</li>)}</ul></>}
                          {idea.risks.length > 0 && <><h5>风险</h5><ul>{idea.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></>}
                        </div>
                        <div className="brainstorm-card-actions">
                          <Button variant="secondary" size="sm" disabled={updating} onClick={() => { void updateIdeaMetadata(historySession, idea.id, { favorite: !idea.favorite }) }}>
                            {idea.favorite ? '取消收藏' : '收藏'}
                          </Button>
                          <Button variant="secondary" size="sm" disabled={updating} onClick={() => { void updateIdeaMetadata(historySession, idea.id, { dismissed: !idea.dismissed }) }}>
                            {idea.dismissed ? '恢复采用' : '标记不采用'}
                          </Button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="brainstorm-history-toolbar">
                  <label>模式
                    <select value={historyModeFilter} onChange={(event) => { setHistoryModeFilter(event.target.value as BrainstormMode | 'all'); setHistoryPage(1) }}>
                      <option value="all">全部模式</option>
                      {MODE_CONFIG.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>收藏
                    <select value={historyFavoriteFilter} onChange={(event) => { setHistoryFavoriteFilter(event.target.value as HistoryFavoriteFilter); setHistoryPage(1) }}>
                      <option value="all">全部会话</option>
                      <option value="favorites">仅有收藏</option>
                    </select>
                  </label>
                  <Button variant="secondary" size="sm" onClick={() => { void refreshHistory() }} disabled={historyLoading}>刷新</Button>
                </div>
                {historyError && <div className="error-bar">{historyError}</div>}
                <div className="brainstorm-history-list">
                  {historyLoading ? (
                    <div className="review-empty"><p>正在加载灵感历史…</p></div>
                  ) : pagedHistoryEntries.length === 0 ? (
                    <div className="review-empty"><p>还没有符合条件的灵感会话。</p></div>
                  ) : pagedHistoryEntries.map((entry) => {
                    const sessionId = entry.kind === 'valid' ? entry.session.id : entry.sessionId
                    if (entry.kind !== 'valid') {
                      return (
                        <article key={sessionId} className="brainstorm-history-warning">
                          <div><strong>{entry.kind === 'newer_schema' ? '较新版本会话' : '损坏会话'}</strong><p>会话 {sessionId} 仅保留为只读警告，不会被本版本改写。</p></div>
                          <Button variant="danger" size="sm" onClick={() => { void openDeleteDialog(entry) }}>删除</Button>
                        </article>
                      )
                    }
                    const favoriteCount = entry.session.response.ideas.filter((idea) => idea.favorite).length
                    return (
                      <article key={sessionId} className="brainstorm-history-item">
                        <button type="button" className="brainstorm-history-open" onClick={() => setHistorySession(entry.session)}>
                          <span>{entry.session.createdAt.replace('T', ' ').slice(0, 16)}</span>
                          <strong>{MODE_CONFIG.find((item) => item.key === entry.session.request.mode)?.label}</strong>
                          <p>{entry.session.request.problem || '未填写具体问题'}</p>
                          <small>{scopeDisplaySummary(entry.session.request.scope, chapters, chapterMetadata)} · {entry.session.response.ideas.length} 条建议 · {favoriteCount} 个收藏</small>
                        </button>
                        <Button variant="danger" size="sm" onClick={() => { void openDeleteDialog(entry) }}>删除</Button>
                      </article>
                    )
                  })}
                </div>
                <Pagination
                  currentPage={currentHistoryPage}
                  totalPages={historyTotalPages}
                  totalItems={filteredHistoryEntries.length}
                  pageSize={historyPageSize}
                  pageSizeOptions={HISTORY_PAGE_SIZE_OPTIONS}
                  onPageChange={setHistoryPage}
                  onPageSizeChange={(nextPageSize) => { setHistoryPageSize(nextPageSize); setHistoryPage(1) }}
                />
              </>
            )}
          </section>
        )}
      </main>
      {settingsOpen && settingsDraft && (
        <Modal className="brainstorm-settings-dialog" onRequestClose={closeSettings}>
          <h3>范围与条件</h3>
          <div className="brainstorm-settings-scroll">
            <section className="brainstorm-setting-section">
              <div className="brainstorm-selector-heading"><strong>本次范围</strong><span>{settingsScopeSummary}</span></div>
              <label className="brainstorm-field">
                <select value={settingsDraft.scopeKind} onChange={(event) => changeScope(event.target.value as ScopeKind)}>
                  <option value="current_chapter" disabled={!settingsCurrentChapterRef}>当前章节{settingsCurrentChapter ? `：${chapterNumberLabel(settingsCurrentChapter, chapterMetadata)}` : ''}</option>
                  <option value="current_volume" disabled={!settingsCurrentVolume}>当前卷{settingsCurrentVolume ? `：${scopeDisplaySummary({ type: 'current_volume', volume: settingsCurrentVolume }, chapters, chapterMetadata)}` : ''}</option>
                  <option value="whole_project">全书背景</option>
                  <option value="selected_chapters" disabled={chapters.length === 0}>指定章节</option>
                </select>
              </label>
              {settingsDraft.scopeKind === 'selected_chapters' && (
                <div className="brainstorm-selector-block">
                <div className="brainstorm-selector-heading"><strong>指定章节</strong><span>已选择 {settingsDraft.selectedChapterKeys.length} 章</span></div>
                <div className="brainstorm-chapter-filters">
                  <input value={chapterSearch} placeholder="搜索卷名或章节号" onChange={(event) => { setChapterSearch(event.target.value); setChapterPage(1) }} />
                  <select aria-label="筛选分卷" value={chapterVolumeFilter} onChange={(event) => { setChapterVolumeFilter(event.target.value); setChapterPage(1) }}>
                    <option value="all">全部分卷</option>
                    {chapterVolumes.map((volume) => <option key={volume} value={volume}>{volumeDisplayName(volume, chapterMetadata)}</option>)}
                  </select>
                  <label className="brainstorm-selected-only"><input type="checkbox" checked={chapterSelectedOnly} onChange={(event) => { setChapterSelectedOnly(event.target.checked); setChapterPage(1) }} />仅看已选</label>
                </div>
                <div className="brainstorm-selector-list" role="group" aria-label="指定章节（可多选）">
                  {pagedChapters.map((chapter) => {
                    const key = chapterRefKey(chapter)
                    return <label key={key}><input type="checkbox" checked={settingsDraft.selectedChapterKeys.includes(key)} onChange={() => toggleSelectedChapter(key)} />{chapterNumberLabel(chapter, chapterMetadata)}</label>
                  })}
                  {pagedChapters.length === 0 && <span className="brainstorm-selector-empty">没有匹配的章节</span>}
                </div>
                <Pagination
                  currentPage={currentChapterPage}
                  totalPages={chapterTotalPages}
                  totalItems={filteredChapters.length}
                  pageSize={chapterPageSize}
                  pageSizeOptions={SELECTOR_PAGE_SIZE_OPTIONS}
                  onPageChange={setChapterPage}
                  onPageSizeChange={(nextPageSize) => { setChapterPageSize(nextPageSize); setChapterPage(1) }}
                  showPageJump
                />
                </div>
              )}
            </section>

            <section className="brainstorm-setting-section">
              <div className="brainstorm-selector-heading"><strong>相关角色</strong><span>已选择 {settingsDraft.relatedCharacters.length} / 20 名</span></div>
              <input value={characterSearch} placeholder="搜索角色名" onChange={(event) => setCharacterSearch(event.target.value)} />
              <div className="brainstorm-selector-list" role="group" aria-label="相关角色（可多选）">
                {filteredCharacters.map((name) => <label key={name}><input type="checkbox" checked={settingsDraft.relatedCharacters.includes(name)} onChange={() => toggleRelatedCharacter(name)} />{name}</label>)}
                {filteredCharacters.length === 0 && <span className="brainstorm-selector-empty">没有匹配的角色</span>}
              </div>
            </section>

            <section className="brainstorm-setting-section">
              <div className="brainstorm-selector-heading"><strong>生成条件</strong></div>
              <div className="brainstorm-preference-grid">
                <label className="brainstorm-field"><span>灵感模式</span>
                  <select value={settingsDraft.mode} onChange={(event) => changeSettingsMode(event.target.value as BrainstormMode)}>
                    {MODE_CONFIG.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
                <label className="brainstorm-field"><span>创意尺度</span>
                  <select value={settingsDraft.creativityLevel} onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, creativityLevel: event.target.value as CreativityLevel } : previous)}>
                    {Object.entries(CREATIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="brainstorm-field"><span>生成数量</span>
                  <select value={settingsDraft.resultCount} onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, resultCount: Number(event.target.value) } : previous)}>
                    {[3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} 条</option>)}
                  </select>
                </label>
              </div>
              <label className="brainstorm-field"><span>期望氛围</span><input value={settingsDraft.desiredTone} maxLength={100} onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, desiredTone: event.target.value } : previous)} /></label>
              <div className="brainstorm-constraint-grid">
                <label className="brainstorm-field"><span>必须保留</span><textarea value={settingsDraft.mustKeepText} rows={4} placeholder="每行一条" onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, mustKeepText: event.target.value } : previous)} /></label>
                <label className="brainstorm-field"><span>避免方向</span><textarea value={settingsDraft.avoidText} rows={4} placeholder="每行一条" onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, avoidText: event.target.value } : previous)} /></label>
              </div>
            </section>

            <section className="brainstorm-setting-section">
              <div className="brainstorm-selector-heading"><strong>上下文来源</strong><span>已启用 {settingsDraft.enabledSources.length} 类</span></div>
              <div className="brainstorm-source-list">
                {Object.entries(SOURCE_LABELS).map(([source, label]) => <label key={source}><input type="checkbox" checked={settingsDraft.enabledSources.includes(source as BrainstormContextSource)} onChange={() => setSettingsDraft((previous) => previous ? {
                  ...previous,
                  enabledSources: previous.enabledSources.includes(source as BrainstormContextSource)
                    ? previous.enabledSources.filter((item) => item !== source)
                    : [...previous.enabledSources, source as BrainstormContextSource],
                } : previous)} />{label}</label>)}
              </div>
            </section>
            {settingsError && <div className="error-bar">{settingsError}</div>}
          </div>
          <div className="brainstorm-settings-footer">
            <Button variant="text" size="sm" onClick={() => setSettingsDraft((previous) => previous ? {
              ...previous,
              mode: DEFAULT_BRAINSTORM_PREFERENCES.mode,
              creativityLevel: DEFAULT_BRAINSTORM_PREFERENCES.creativityLevel,
              resultCount: DEFAULT_BRAINSTORM_PREFERENCES.resultCount,
              enabledSources: BRAINSTORM_MODE_CONTEXT_PRESETS[DEFAULT_BRAINSTORM_PREFERENCES.mode],
            } : previous)}>恢复默认项目偏好</Button>
            <div className="dialog-footer">
              <Button variant="secondary" size="md" onClick={closeSettings}>取消</Button>
              <Button variant="primary" size="md" onClick={applySettings}>确认条件</Button>
            </div>
          </div>
        </Modal>
      )}
      {feedbackIdea && (
        <Modal className="brainstorm-dialog" onRequestClose={() => { setFeedbackIdea(null); setFeedback('') }}>
          <h3>基于反馈重做</h3>
          <p>“{feedbackIdea.title}”将保留原有上下文，并按你的反馈重新生成。</p>
          <label className="brainstorm-field">
            <span>不满意的原因或调整方向</span>
            <textarea value={feedback} rows={5} maxLength={1000} onChange={(event) => setFeedback(event.target.value)} />
          </label>
          <div className="brainstorm-dialog-actions">
            <Button variant="secondary" size="sm" onClick={() => { setFeedbackIdea(null); setFeedback('') }}>取消</Button>
            <Button variant="primary" size="sm" disabled={!feedback.trim() || derivingIdeaIds.has(`redo_with_feedback:${feedbackIdea.id}`)} onClick={() => {
              void deriveIdeas('redo_with_feedback', [feedbackIdea], feedback)
              setFeedbackIdea(null)
              setFeedback('')
            }}>重新生成</Button>
          </div>
        </Modal>
      )}
      {noteIdea && (
        <Modal className="brainstorm-dialog" onRequestClose={() => { setNoteIdea(null); setNoteContent('') }}>
          <h3>保存为备注</h3>
          <p>保存后可在备注模块继续编辑和追踪。</p>
          <label className="brainstorm-field">
            <span>备注内容</span>
            <textarea value={noteContent} rows={10} maxLength={5000} onChange={(event) => setNoteContent(event.target.value)} />
          </label>
          <div className="brainstorm-dialog-actions">
            <Button variant="secondary" size="sm" onClick={() => { setNoteIdea(null); setNoteContent('') }}>取消</Button>
            <Button variant="primary" size="sm" disabled={!noteContent.trim()} onClick={() => { void saveIdeaAsNote() }}>确认保存</Button>
          </div>
        </Modal>
      )}
      {scaleIdea && (
        <Modal className="brainstorm-dialog" onRequestClose={() => setScaleIdea(null)}>
          <h3>调整创意尺度</h3>
          <p>基于“{scaleIdea.title}”生成新的尺度版本，原建议保持不变。</p>
          <label className="brainstorm-field">
            <span>目标尺度</span>
            <select value={scaleLevel} onChange={(event) => setScaleLevel(event.target.value as CreativityLevel)}>
              {Object.entries(CREATIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="brainstorm-dialog-actions">
            <Button variant="secondary" size="sm" onClick={() => setScaleIdea(null)}>取消</Button>
            <Button variant="primary" size="sm" disabled={scaleLevel === scaleIdea.creativityLevel || derivingIdeaIds.has(`adjust_scale:${scaleIdea.id}:${scaleLevel}`)} onClick={() => {
              void deriveIdeas('adjust_scale', [scaleIdea], '', scaleLevel)
              setScaleIdea(null)
            }}>生成新版本</Button>
          </div>
        </Modal>
      )}
      {deleteEntry && (
        <Modal className="brainstorm-dialog" onRequestClose={() => { setDeleteEntry(null); setDeleteImpact(null) }}>
          <h3>删除灵感会话</h3>
          <p>{deleteImpactLoading
            ? '正在检查关联内容…'
            : `删除后无法恢复。${deleteImpact?.childSessionCount ?? 0} 个派生会话和 ${deleteImpact?.noteCount ?? 0} 条备注将保留，但会显示来源已删除。`}</p>
          <div className="brainstorm-dialog-actions">
            <Button variant="secondary" size="sm" onClick={() => { setDeleteEntry(null); setDeleteImpact(null) }}>取消</Button>
            <Button variant="danger" size="sm" disabled={deleteImpactLoading} onClick={() => { void deleteHistorySession() }}>确认删除</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
