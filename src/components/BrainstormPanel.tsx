import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { listChapters, listProjectFiles } from '../api/tauri'
import { runBrainstorm } from '../services/brainstormService'
import {
  createBrainstormSession,
  deleteBrainstormSession,
  listBrainstormSessions,
  loadBrainstormPreferences,
  loadBrainstormSession,
  saveBrainstormPreferences,
  saveBrainstormSession,
} from '../services/brainstormStorage'
import { logAIGenerated } from '../services/stats'
import { buildChapterRef, generateId, saveNote } from '../services/notesStorage'
import type { CurrentChapterRef } from '../types/material'
import type { ChapterMeta } from '../types/chapter'
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
import { DEFAULT_BRAINSTORM_PREFERENCES } from '../types/brainstorm'
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
const SELECTOR_PAGE_SIZE = 20

function chapterRef(chapter: ChapterMeta) {
  return { volume: chapter.volume, chapterId: chapter.id, chapterTitle: chapter.title }
}

function chapterKey(chapter: { volume: string; chapterId: string }): string {
  return `${chapter.volume}:${chapter.chapterId}`
}

function toLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function sameItems(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function formatChapterLabel(chapter: ChapterMeta): string {
  return `${chapter.volume} · 第 ${chapter.order} 章《${chapter.title}》`
}

export default function BrainstormPanel({ projectId, currentChapter, currentSessionId, onCurrentSessionChange, onOpenForeshadowDraft }: Props) {
  const [mode, setMode] = useState<BrainstormMode>(DEFAULT_BRAINSTORM_PREFERENCES.mode)
  const [creativityLevel, setCreativityLevel] = useState<CreativityLevel>(DEFAULT_BRAINSTORM_PREFERENCES.creativityLevel)
  const [resultCount, setResultCount] = useState(DEFAULT_BRAINSTORM_PREFERENCES.resultCount)
  const [enabledSources, setEnabledSources] = useState<BrainstormContextSource[]>(DEFAULT_BRAINSTORM_PREFERENCES.enabledContextSources)
  const [chapters, setChapters] = useState<ChapterMeta[]>([])
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
  const [chapterSearch, setChapterSearch] = useState('')
  const [chapterPage, setChapterPage] = useState(1)
  const [characterSearch, setCharacterSearch] = useState('')
  const [characterPage, setCharacterPage] = useState(1)
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
  const [historyPageSize, setHistoryPageSize] = useState(HISTORY_PAGE_SIZE_OPTIONS[0])
  const [historySession, setHistorySession] = useState<BrainstormSession | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<BrainstormSessionHistoryEntry | null>(null)
  const [metadataUpdatingIds, setMetadataUpdatingIds] = useState<Set<string>>(new Set())
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const derivationControllersRef = useRef(new Map<string, AbortController>())
  const viewTabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const currentScopeChapter = useMemo(() => {
    if (currentChapter) return currentChapter
    const latest = [...chapters].sort((a, b) => b.order - a.order)[0]
    return latest ? chapterRef(latest) : null
  }, [chapters, currentChapter])

  const currentScopeVolume = currentScopeChapter?.volume ?? ''
  const currentScopeChapterMeta = currentScopeChapter
    ? chapters.find((chapter) => chapter.id === currentScopeChapter.chapterId && chapter.volume === currentScopeChapter.volume)
    : undefined
  const scopeSummary = scopeKind === 'current_chapter'
    ? currentScopeChapterMeta ? formatChapterLabel(currentScopeChapterMeta) : currentScopeChapter?.chapterTitle ?? '未选择章节'
    : scopeKind === 'current_volume'
      ? `当前卷：${currentScopeVolume}`
      : scopeKind === 'selected_chapters'
        ? `已指定 ${selectedChapterKeys.length} 章`
        : '全书背景'
  const filteredChapters = useMemo(() => {
    const query = chapterSearch.trim().toLocaleLowerCase()
    const ordered = [...chapters].sort((left, right) => left.order - right.order)
    return query ? ordered.filter((chapter) => formatChapterLabel(chapter).toLocaleLowerCase().includes(query)) : ordered
  }, [chapterSearch, chapters])
  const chapterTotalPages = Math.max(1, Math.ceil(filteredChapters.length / SELECTOR_PAGE_SIZE))
  const currentChapterPage = Math.min(chapterPage, chapterTotalPages)
  const pagedChapters = filteredChapters.slice((currentChapterPage - 1) * SELECTOR_PAGE_SIZE, currentChapterPage * SELECTOR_PAGE_SIZE)
  const filteredCharacters = useMemo(() => {
    const query = characterSearch.trim().toLocaleLowerCase()
    return query ? characterNames.filter((name) => name.toLocaleLowerCase().includes(query)) : characterNames
  }, [characterNames, characterSearch])
  const characterTotalPages = Math.max(1, Math.ceil(filteredCharacters.length / SELECTOR_PAGE_SIZE))
  const currentCharacterPage = Math.min(characterPage, characterTotalPages)
  const pagedCharacters = filteredCharacters.slice((currentCharacterPage - 1) * SELECTOR_PAGE_SIZE, currentCharacterPage * SELECTOR_PAGE_SIZE)
  const selectedCombineIdeas = useMemo(() => {
    if (!session) return []
    return combineSelection
      .map((ideaId) => session.response.ideas.find((idea) => idea.id === ideaId))
      .filter((idea): idea is BrainstormIdea => Boolean(idea))
  }, [combineSelection, session])

  const combineOperationId = `combine:${selectedCombineIdeas.map((idea) => idea.id).join(':')}`
  const contextEstimatedTokens = session?.contextManifest.reduce((total, entry) => total + entry.estimatedTokens, 0) ?? 0
  const truncatedContextCount = session?.contextManifest.filter((entry) => entry.truncated).length ?? 0
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
    Promise.all([
      loadBrainstormPreferences(projectId),
      listChapters(projectId),
      listProjectFiles(projectId, 'characters'),
    ]).then(([preferences, loadedChapters, files]) => {
      if (!active) return
      setMode(preferences.mode)
      setCreativityLevel(preferences.creativityLevel)
      setResultCount(preferences.resultCount)
      setEnabledSources(preferences.enabledContextSources)
      setChapters(loadedChapters)
      setCharacterNames(files.filter((file) => file.name.endsWith('.md')).map((file) => file.name.replace(/\.md$/i, '')))
      const latestChapter = [...loadedChapters].sort((a, b) => b.order - a.order)[0]
      const fallback = currentChapter ?? (latestChapter ? chapterRef(latestChapter) : null)
      if (fallback) {
        setScopeKind('current_chapter')
        setSelectedChapterKeys([chapterKey(fallback)])
      }
    }).catch(() => {
      if (active) setError('灵感设置未能完整加载，仍可使用默认设置')
    })
    return () => { active = false }
  }, [currentChapter, projectId])

  useEffect(() => {
    let active = true
    if (!currentSessionId) {
      return () => { active = false }
    }
    loadBrainstormSession(projectId, currentSessionId).then((loaded) => {
      if (!active) return
      if (loaded) {
        setSession(loaded)
        setStatus('success')
      } else {
        setError('当前灵感会话无法恢复')
      }
    }, () => {
      if (active) setError('当前灵感会话无法恢复')
    })
    return () => { active = false }
  }, [currentSessionId, projectId])

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
    setMode(nextMode)
    persistPreferences({ ...preferences(), mode: nextMode })
  }

  const changeScope = (nextScope: ScopeKind) => {
    setSettingsDraft((previous) => previous ? { ...previous, scopeKind: nextScope } : previous)
  }

  const toggleSelectedChapter = (key: string) => {
    setSettingsDraft((previous) => previous
      ? { ...previous, selectedChapterKeys: previous.selectedChapterKeys.includes(key) ? previous.selectedChapterKeys.filter((item) => item !== key) : [...previous.selectedChapterKeys, key] }
      : previous)
  }

  const toggleRelatedCharacter = (name: string) => {
    setSettingsDraft((previous) => previous
      ? { ...previous, relatedCharacters: previous.relatedCharacters.includes(name) ? previous.relatedCharacters.filter((item) => item !== name) : [...previous.relatedCharacters, name] }
      : previous)
  }

  const openSettings = () => {
    setSettingsDraft({
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
    setChapterPage(1)
    setCharacterSearch('')
    setCharacterPage(1)
    setSettingsOpen(true)
  }

  const closeSettings = () => {
    setSettingsOpen(false)
    setSettingsDraft(null)
  }

  const applySettings = () => {
    if (!settingsDraft) return
    const requestChanged = settingsDraft.scopeKind !== scopeKind
      || !sameItems(settingsDraft.selectedChapterKeys, selectedChapterKeys)
      || !sameItems(settingsDraft.relatedCharacters, relatedCharacters)
      || settingsDraft.creativityLevel !== creativityLevel
      || settingsDraft.resultCount !== resultCount
      || settingsDraft.desiredTone !== desiredTone
      || settingsDraft.mustKeepText !== mustKeepText
      || settingsDraft.avoidText !== avoidText
      || !sameItems(settingsDraft.enabledSources, enabledSources)
    if (requestChanged) resetCurrentResult()
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
    const selected = chapters.filter((chapter) => selectedChapterKeys.includes(chapterKey(chapter))).map(chapterRef)
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
      signal: controller.signal,
    }
    setSession(null)
    setError(null)
    setStatus('generating')
    let generatedSession: BrainstormSession | null = null
    try {
      const result = await runBrainstorm(request)
      if (requestId !== requestIdRef.current) return
      const sessionRequest = {
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
      const nextSession = createBrainstormSession({
        projectId,
        request: sessionRequest,
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
        operation: 'generate',
        inputTokens: result.generation.inputTokens,
      })
      await saveBrainstormSession(projectId, nextSession)
      if (requestId !== requestIdRef.current) return
      onCurrentSessionChange(nextSession.id)
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
    operation: Exclude<BrainstormOperation, 'generate'>,
    parentIdeas: BrainstormIdea[],
    feedbackText = '',
  ) => {
    if (!session || status !== 'success') return
    const parentIdeaIds = parentIdeas.map((idea) => idea.id)
    const operationId = `${operation}:${parentIdeaIds.join(':')}`
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
        request: { ...session.request, derivation },
        response: result.response,
        contextManifest: result.contextManifest,
        contextWarnings: result.contextWarnings,
        generation: result.generation,
      })
      generatedSession = nextSession
      setSession(nextSession)
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
    const suggestedChapter = noteIdea.suggestedLocation.verified && noteIdea.suggestedLocation.chapterId
      ? chapters.find((chapter) => chapter.id === noteIdea.suggestedLocation.chapterId)
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
    onOpenForeshadowDraft({
      name: idea.title,
      description: `${idea.summary}\n\n${idea.whyItFits}`,
      plantedChapterId: idea.suggestedLocation.verified ? idea.suggestedLocation.chapterId ?? '' : '',
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
    } catch {
      setHistoryError('删除灵感会话失败，请重试')
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
    if (request.scope.type === 'current_chapter') setSelectedChapterKeys([chapterKey(request.scope.chapter)])
    if (request.scope.type === 'selected_chapters') setSelectedChapterKeys(request.scope.chapters.map(chapterKey))
    setSession(historySession)
    setStatus('success')
    setError(null)
    onCurrentSessionChange(historySession.id)
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
          <label className="brainstorm-field"><span>我现在遇到的问题</span>
            <textarea value={problem} maxLength={1000} rows={3} placeholder="描述卡点，可留空" onChange={(event) => { resetCurrentResult(); setProblem(event.target.value) }} />
          </label>
          <div className="brainstorm-toolbar">
            <span>{scopeSummary} · {relatedCharacters.length > 0 ? `${relatedCharacters.length} 名相关角色` : '未限定角色'} · {enabledSources.length} 类上下文</span>
            <Button variant="primary" size="md" onClick={() => { void handleGenerate() }} disabled={status === 'generating' || status === 'saving'}>
              {status === 'generating' ? '正在生成灵感…' : status === 'saving' ? '正在保存…' : '生成灵感'}
            </Button>
          </div>
          {error && <div className="error-bar">{error}</div>}
          {status === 'unsaved' && <Button variant="secondary" size="sm" onClick={() => { void retrySave() }}>重新保存本次灵感</Button>}
        </section>

        {session && <div className="brainstorm-context-summary">
          <span>本次上下文：估算 {contextEstimatedTokens.toLocaleString()} / 6,000 tokens</span>
          {session.contextManifest.map((entry, index) => <span key={`${entry.source}-${index}`}>{SOURCE_LABELS[entry.source]}{entry.truncated ? '（已截断）' : ''}{index < session.contextManifest.length - 1 ? '、' : ''}</span>)}
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
                    <Button variant="secondary" size="sm" disabled={status !== 'success' || derivingIdeaIds.has(`redo_with_feedback:${idea.id}`)} onClick={() => { setFeedbackIdea(idea); setFeedback('') }}>
                      基于反馈重做
                    </Button>
                    <Button variant="secondary" size="sm" disabled={status === 'saving' || metadataUpdatingIds.has(`${session.id}:${idea.id}`)} onClick={() => { void updateIdeaMetadata(session, idea.id, { favorite: !idea.favorite }) }}>
                      {idea.favorite ? '取消收藏' : '收藏'}
                    </Button>
                    <Button variant="secondary" size="sm" disabled={status === 'saving' || metadataUpdatingIds.has(`${session.id}:${idea.id}`)} onClick={() => { void updateIdeaMetadata(session, idea.id, { dismissed: !idea.dismissed }) }}>
                      {idea.dismissed ? '恢复采用' : '标记不采用'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => { void copyIdea(idea) }}>复制</Button>
                    <Button variant="secondary" size="sm" onClick={() => openSaveNote(idea)}>保存为备注</Button>
                    <Button variant="secondary" size="sm" onClick={() => openForeshadowDraft(idea)}>创建伏笔候选</Button>
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
                    <p>{historySession.createdAt.replace('T', ' ').slice(0, 16)} · {historySession.response.ideas.length} 条建议</p>
                  </div>
                  <div className="brainstorm-history-detail-actions">
                    <Button variant="secondary" size="sm" onClick={() => setDeleteEntry({ kind: 'valid', session: historySession })}>删除</Button>
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
                          <Button variant="secondary" size="sm" onClick={() => setDeleteEntry(entry)}>删除</Button>
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
                          <small>{entry.session.response.ideas.length} 条建议 · {favoriteCount} 个收藏</small>
                        </button>
                        <Button variant="secondary" size="sm" onClick={() => setDeleteEntry(entry)}>删除</Button>
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
            <label className="brainstorm-field">
              <span>本次范围</span>
              <select value={settingsDraft.scopeKind} onChange={(event) => changeScope(event.target.value as ScopeKind)}>
                <option value="current_chapter" disabled={!currentScopeChapter}>当前章节{currentScopeChapterMeta ? `：${formatChapterLabel(currentScopeChapterMeta)}` : ''}</option>
                <option value="current_volume" disabled={!currentScopeVolume}>当前卷{currentScopeVolume ? `：${currentScopeVolume}` : ''}</option>
                <option value="whole_project">全书背景</option>
                <option value="selected_chapters" disabled={chapters.length === 0}>指定章节</option>
              </select>
            </label>

            {settingsDraft.scopeKind === 'selected_chapters' && (
              <section className="brainstorm-setting-section">
                <div className="brainstorm-selector-heading"><strong>指定章节</strong><span>已选择 {settingsDraft.selectedChapterKeys.length} 章</span></div>
                <input value={chapterSearch} placeholder="搜索卷名、章节号或标题" onChange={(event) => { setChapterSearch(event.target.value); setChapterPage(1) }} />
                <div className="brainstorm-selector-list" role="group" aria-label="指定章节（可多选）">
                  {pagedChapters.map((chapter) => {
                    const key = chapterKey(chapter)
                    return <label key={key}><input type="checkbox" checked={settingsDraft.selectedChapterKeys.includes(key)} onChange={() => toggleSelectedChapter(key)} />{formatChapterLabel(chapter)}</label>
                  })}
                </div>
                <Pagination currentPage={currentChapterPage} totalPages={chapterTotalPages} totalItems={filteredChapters.length} pageSize={SELECTOR_PAGE_SIZE} onPageChange={setChapterPage} />
              </section>
            )}

            <section className="brainstorm-setting-section">
              <div className="brainstorm-selector-heading"><strong>相关角色</strong><span>可多选，已选择 {settingsDraft.relatedCharacters.length} 名</span></div>
              <input value={characterSearch} placeholder="搜索角色名" onChange={(event) => { setCharacterSearch(event.target.value); setCharacterPage(1) }} />
              <div className="brainstorm-selector-list" role="group" aria-label="相关角色（可多选）">
                {pagedCharacters.map((name) => <label key={name}><input type="checkbox" checked={settingsDraft.relatedCharacters.includes(name)} onChange={() => toggleRelatedCharacter(name)} />{name}</label>)}
                {pagedCharacters.length === 0 && <span className="brainstorm-selector-empty">没有匹配的角色</span>}
              </div>
              <Pagination currentPage={currentCharacterPage} totalPages={characterTotalPages} totalItems={filteredCharacters.length} pageSize={SELECTOR_PAGE_SIZE} onPageChange={setCharacterPage} />
            </section>

            <div className="brainstorm-setting-grid">
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
              <label className="brainstorm-field"><span>期望氛围</span><input value={settingsDraft.desiredTone} maxLength={100} onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, desiredTone: event.target.value } : previous)} /></label>
              <label className="brainstorm-field"><span>必须保留</span><textarea value={settingsDraft.mustKeepText} rows={3} placeholder="每行一条" onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, mustKeepText: event.target.value } : previous)} /></label>
              <label className="brainstorm-field"><span>避免方向</span><textarea value={settingsDraft.avoidText} rows={3} placeholder="每行一条" onChange={(event) => setSettingsDraft((previous) => previous ? { ...previous, avoidText: event.target.value } : previous)} /></label>
            </div>

            <Button variant="text" size="sm" className="brainstorm-setting-reset" onClick={() => setSettingsDraft((previous) => previous ? {
              ...previous,
              creativityLevel: DEFAULT_BRAINSTORM_PREFERENCES.creativityLevel,
              resultCount: DEFAULT_BRAINSTORM_PREFERENCES.resultCount,
              enabledSources: DEFAULT_BRAINSTORM_PREFERENCES.enabledContextSources,
            } : previous)}>恢复默认偏好</Button>

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
          </div>
          <div className="dialog-footer">
            <Button variant="secondary" size="md" onClick={closeSettings}>取消</Button>
            <Button variant="primary" size="md" onClick={applySettings}>确认条件</Button>
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
      {deleteEntry && (
        <Modal className="brainstorm-dialog" onRequestClose={() => setDeleteEntry(null)}>
          <h3>删除灵感会话</h3>
          <p>删除后无法恢复该会话及其建议。已有派生会话不会被改写，但会保留来源记录。</p>
          <div className="brainstorm-dialog-actions">
            <Button variant="secondary" size="sm" onClick={() => setDeleteEntry(null)}>取消</Button>
            <Button variant="primary" size="sm" onClick={() => { void deleteHistorySession() }}>确认删除</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
