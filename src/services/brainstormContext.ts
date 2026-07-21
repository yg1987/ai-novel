import {
  getChapterContent,
  getChapterOutline,
  listChapters,
  listProjectFiles,
  readProjectFile,
} from '../api/tauri'
import { loadSections } from './worldviewConfig'
import { loadRelationshipGraph } from './relationshipStore'
import {
  chapterContextLabel,
  chapterRefKey,
  compareChapters,
  loadChapterDisplayMetadata,
  type ChapterDisplayMetadata,
} from './chapterDisplay'
import type { ChapterMeta } from '../types/chapter'
import type {
  BrainstormContextManifestEntry,
  BrainstormContextSource,
  BrainstormEntityRef,
  BrainstormRequest,
} from '../types/brainstorm'
import { htmlToPlainText } from '../utils/htmlToText'
import { asString, isRecord } from '../utils/unknown'

const INPUT_TOKEN_BUDGET = 6_000
const CHARACTERS_PER_TOKEN = 4
const MAX_SINGLE_SOURCE_TOKENS = 1_200

export interface BrainstormAllowedEntity {
  type: BrainstormEntityRef['type']
  entityId: string
  label: string
  volume?: string
  chapterId?: string
}

export interface BrainstormContext {
  text: string
  manifest: BrainstormContextManifestEntry[]
  warnings: string[]
  allowedEntities: BrainstormAllowedEntity[]
  chapters: ChapterMeta[]
}

interface ContextSection {
  source: BrainstormContextSource
  entityIds: string[]
  labels: string[]
  text: string
  priority: number
}

export function estimateBrainstormTokens(value: string): number {
  let ascii = 0
  let nonAscii = 0
  for (const character of value) {
    if (character.codePointAt(0)! <= 0x7f) ascii += 1
    else nonAscii += 1
  }
  return Math.ceil(ascii / CHARACTERS_PER_TOKEN) + nonAscii
}

function trimToTokenBudget(value: string, budget: number): { value: string; truncated: boolean } {
  if (estimateBrainstormTokens(value) <= budget) return { value, truncated: false }
  if (budget <= 0) return { value: '', truncated: true }
  const suffix = '\n[内容已截断]'
  const contentBudget = Math.max(0, budget - estimateBrainstormTokens(suffix))
  let low = 0
  let high = value.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (estimateBrainstormTokens(value.slice(0, middle)) <= contentBudget) low = middle
    else high = middle - 1
  }
  return { value: `${value.slice(0, low).trimEnd()}${suffix}`, truncated: true }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function isEnabled(request: BrainstormRequest, source: BrainstormContextSource): boolean {
  return request.enabledContextSources.includes(source)
}

export function validateBrainstormRequest(request: BrainstormRequest): string | null {
  if (request.problem.length > 1000) return '当前问题最多 1000 个字符'
  if (request.desiredTone.length > 100) return '期望氛围最多 100 个字符'
  if (request.mustKeep.length > 10 || request.avoid.length > 10) return '必须保留和避免方向最多各 10 条'
  if ([...request.mustKeep, ...request.avoid].some((item) => item.length > 200)) return '每条限制最多 200 个字符'
  if (request.relatedCharacters.length > 20) return '相关角色最多选择 20 名'
  if (request.mode === 'character_dev' && request.relatedCharacters.length === 0) return '角色发展模式请至少选择一名相关角色'
  if (request.resultCount < 3 || request.resultCount > 6) return '生成数量必须在 3 到 6 条之间'
  if (request.scope.type === 'current_chapter' && (!request.scope.chapter.chapterId || !request.scope.chapter.volume)) return '当前章节范围缺少章节信息'
  if (request.scope.type === 'current_volume' && !request.scope.volume.trim()) return '当前卷范围缺少卷标识'
  if (request.scope.type === 'selected_chapters' && request.scope.chapters.length === 0) return '请至少选择一个章节'
  if (request.scope.type === 'selected_chapters') {
    const keys = request.scope.chapters.map((chapter) => `${chapter.volume}:${chapter.chapterId}`)
    if (unique(keys).length !== keys.length) return '指定章节不能重复'
  }
  const derivation = request.derivation
  if (!derivation) return null
  if (derivation.operation === 'generate') {
    if (derivation.parentSessionId || derivation.parentIdeaIds.length > 0) return '首次生成不能带来源建议'
    return null
  }
  if (derivation.operation === 'continue') {
    if (!derivation.parentSessionId || derivation.parentIdeaIds.length > 0) return '继续历史会话需要有效的来源会话'
    return null
  }
  if (!derivation.parentSessionId) return '派生灵感缺少来源会话'
  if (derivation.operation === 'combine') {
    if (derivation.parentIdeaIds.length !== 2) return '组合灵感必须选择两条建议'
  } else if (derivation.parentIdeaIds.length !== 1) {
    return '该操作必须基于一条建议'
  }
  if (derivation.operation === 'redo_with_feedback' && !derivation.feedback.trim()) return '请填写不满意的原因'
  return null
}

async function resolveScopeChapters(request: BrainstormRequest, allChapters: ChapterMeta[]): Promise<ChapterMeta[]> {
  const sorted = [...allChapters].sort(compareChapters)
  const scope = request.scope
  if (scope.type === 'whole_project') return sorted
  if (scope.type === 'current_volume') return sorted.filter((chapter) => chapter.volume === scope.volume)
  const requested = scope.type === 'current_chapter' ? [scope.chapter] : scope.chapters
  const keys = new Set(requested.map((chapter) => `${chapter.volume}:${chapter.chapterId}`))
  return sorted.filter((chapter) => keys.has(`${chapter.volume}:${chapter.id}`))
}

function addEntity(
  entities: BrainstormAllowedEntity[],
  type: BrainstormEntityRef['type'],
  entityId: string,
  label: string,
  details: Pick<BrainstormAllowedEntity, 'volume' | 'chapterId'> = {},
): void {
  if (!entities.some((entity) => entity.type === type && entity.entityId === entityId)) {
    entities.push({ type, entityId, label, ...details })
  }
}

async function readChapterSections(
  request: BrainstormRequest,
  scopedChapters: ChapterMeta[],
  allChapters: ChapterMeta[],
  metadata: ChapterDisplayMetadata,
  warnings: string[],
): Promise<ContextSection[]> {
  const sections: ContextSection[] = []
  const contentRelevant = request.scope.type === 'whole_project' || request.scope.type === 'current_volume'
    ? scopedChapters.slice(-3)
    : scopedChapters
  let outlineRelevant = request.scope.type === 'whole_project' ? scopedChapters : scopedChapters
  if (request.mode === 'plot_twist' && request.scope.type === 'current_chapter') {
    const current = scopedChapters[0]
    if (current) outlineRelevant = allChapters.filter((chapter) => chapter.volume === current.volume && chapter.order >= current.order)
  }

  if (isEnabled(request, 'chapter_content')) {
    for (const chapter of contentRelevant) {
      try {
        const content = htmlToPlainText(await getChapterContent(request.projectId, chapter.volume, chapter.id)).trim()
        if (!content) continue
        const ending = content.slice(-1_600)
        const label = chapterContextLabel(chapter, metadata)
        sections.push({ source: 'chapter_content', entityIds: [chapterRefKey(chapter)], labels: [label], text: `## ${label}结尾\n${ending}`, priority: 1 })
      } catch {
        warnings.push(`${chapterContextLabel(chapter, metadata)}正文未加载`)
      }
    }
  }

  if (isEnabled(request, 'chapter_snapshot')) {
    for (const chapter of contentRelevant) {
      const filename = `ch${String(chapter.order).padStart(3, '0')}.snapshot.json`
      try {
        const raw = await readProjectFile(request.projectId, 'memory/snapshots', filename)
        if (!raw.trim()) continue
        const snapshot: unknown = JSON.parse(raw)
        if (!isRecord(snapshot)) continue
        const summary = asString(snapshot.summary)
        const hook = asString(snapshot.endingHook)
        if (!summary && !hook) continue
        const label = chapterContextLabel(chapter, metadata)
        sections.push({ source: 'chapter_snapshot', entityIds: [chapterRefKey(chapter)], labels: [label], text: `## ${label}快照\n摘要：${summary}\n结尾钩子：${hook}`, priority: 3 })
      } catch {
        warnings.push(`${chapterContextLabel(chapter, metadata)}快照未加载`)
      }
    }
  }

  if (isEnabled(request, 'outline')) {
    for (const chapter of outlineRelevant) {
      try {
        const outline = (await getChapterOutline(request.projectId, chapter.volume, chapter.id)).trim()
        if (!outline) continue
        const label = chapterContextLabel(chapter, metadata)
        sections.push({ source: 'outline', entityIds: [chapterRefKey(chapter)], labels: [label], text: `## ${label}大纲\n${outline}`, priority: 1 })
      } catch {
        warnings.push(`${chapterContextLabel(chapter, metadata)}大纲未加载`)
      }
    }
  }
  return sections
}

async function readCharacterSections(request: BrainstormRequest, warnings: string[]): Promise<ContextSection[]> {
  if (!isEnabled(request, 'characters')) return []
  try {
    const files = (await listProjectFiles(request.projectId, 'characters')).filter((file) => file.name.endsWith('.md'))
    const requested = new Set(request.relatedCharacters)
    const selected = requested.size > 0
      ? files.filter((file) => requested.has(file.name.replace(/\.md$/i, '')))
      : files.slice(0, 8)
    const sections: ContextSection[] = []
    for (const file of selected) {
      const label = file.name.replace(/\.md$/i, '')
      try {
        const content = (await readProjectFile(request.projectId, 'characters', file.name)).replace(/<[^>]*>/g, '').trim()
        if (content) sections.push({
          source: 'characters', entityIds: [label], labels: [label], text: `## ${label}\n${content}`,
          priority: request.mode === 'character_dev' || request.mode === 'scene_idea' ? 2 : 3,
        })
      } catch {
        warnings.push(`角色“${label}”资料未加载`)
      }
    }
    return sections
  } catch {
    warnings.push('角色资料未加载')
    return []
  }
}

async function readWorldviewSections(request: BrainstormRequest, warnings: string[]): Promise<ContextSection[]> {
  if (!isEnabled(request, 'worldview')) return []
  try {
    const configured = await loadSections(request.projectId).catch(() => null)
    const orderedFiles = configured && configured.length > 0
      ? configured.map((section) => section.file)
      : (await listProjectFiles(request.projectId, 'worldview'))
        .map((file) => file.name)
        .filter((name) => name.endsWith('.md'))
        .sort()
    const sections: ContextSection[] = []
    for (const filename of unique(orderedFiles)) {
      if (!filename.endsWith('.md')) continue
      const label = filename.replace(/\.md$/i, '')
      try {
        const content = (await readProjectFile(request.projectId, 'worldview', filename))
          .replace(/^---[\s\S]*?---\n?/, '')
          .replace(/<[^>]*>/g, '')
          .trim()
        if (content) sections.push({
          source: 'worldview', entityIds: [label], labels: [label], text: `## ${label}\n${content}`,
          priority: request.mode === 'world_expand' || request.mode === 'scene_idea' ? 2 : 3,
        })
      } catch {
        warnings.push(`世界观“${label}”未加载`)
      }
    }
    return sections
  } catch {
    warnings.push('世界观资料未加载')
    return []
  }
}

async function readForeshadowSection(request: BrainstormRequest, warnings: string[]): Promise<ContextSection | null> {
  if (!isEnabled(request, 'foreshadows')) return null
  try {
    const raw = await readProjectFile(request.projectId, 'memory', 'foreshadows.json')
    if (!raw.trim()) return null
    const parsed: unknown = JSON.parse(raw)
    const entries = isRecord(parsed) && Array.isArray(parsed.entries) ? parsed.entries.filter(isRecord) : []
    const pending = entries.filter((entry) => entry.status !== 'resolved' && entry.status !== 'abandoned').slice(0, 10)
    if (pending.length === 0) return null
    const labels = pending.map((entry) => asString(entry.name)).filter(Boolean)
    return {
      source: 'foreshadows',
      entityIds: pending.map((entry) => asString(entry.id)).filter(Boolean),
      labels,
      text: `## 未回收伏笔\n${pending.map((entry) => `- ${asString(entry.name)}：${asString(entry.description)}`).join('\n')}`,
      priority: 3,
    }
  } catch {
    warnings.push('伏笔资料未加载')
    return null
  }
}

async function readRelationshipSection(request: BrainstormRequest, warnings: string[]): Promise<ContextSection | null> {
  if (!isEnabled(request, 'relationships')) return null
  try {
    const graph = await loadRelationshipGraph(request.projectId)
    const links = graph.links.slice(0, 20)
    if (links.length === 0) return null
    const nodeLabels = new Map(graph.nodes.map((node) => [node.id, node.label]))
    return {
      source: 'relationships',
      entityIds: links.map((link) => `${link.source}:${link.target}`),
      labels: links.map((link) => `${nodeLabels.get(link.source) ?? link.source} - ${nodeLabels.get(link.target) ?? link.target}`),
      text: `## 角色关系\n${links.map((link) => `- ${nodeLabels.get(link.source) ?? link.source} 与 ${nodeLabels.get(link.target) ?? link.target}：${link.type}${link.description ? `（${link.description}）` : ''}`).join('\n')}`,
      priority: request.mode === 'character_dev' || request.mode === 'scene_idea' ? 2 : 3,
    }
  } catch {
    warnings.push('角色关系未加载')
    return null
  }
}

async function readNotesSection(request: BrainstormRequest, warnings: string[]): Promise<ContextSection | null> {
  if (!isEnabled(request, 'notes')) return null
  try {
    const files = await listProjectFiles(request.projectId, 'notes')
    const entries: Array<{ id: string; content: string }> = []
    for (const file of files) {
      if (!file.name.endsWith('.json') || file.name === 'notes.json') continue
      const raw = await readProjectFile(request.projectId, 'notes', file.name)
      const note: unknown = JSON.parse(raw)
      if (!isRecord(note)) continue
      const content = asString(note.content).trim()
      if (content) entries.push({ id: asString(note.id, file.name.replace(/\.json$/, '')), content })
    }
    if (entries.length === 0) return null
    return {
      source: 'notes',
      entityIds: entries.slice(0, 10).map((entry) => entry.id),
      labels: entries.slice(0, 10).map((entry) => entry.content.slice(0, 60)),
      text: `## 作者备注\n${entries.slice(0, 10).map((entry) => `- ${entry.content}`).join('\n')}`,
      priority: 3,
    }
  } catch {
    warnings.push('备注未加载')
    return null
  }
}

export async function buildBrainstormContext(request: BrainstormRequest, reservedTokens = 0): Promise<BrainstormContext> {
  const validationError = validateBrainstormRequest(request)
  if (validationError) throw new Error(validationError)

  const warnings: string[] = []
  const manifest: BrainstormContextManifestEntry[] = []
  const allowedEntities: BrainstormAllowedEntity[] = []
  const chapters = (await listChapters(request.projectId)).sort(compareChapters)
  const metadata = await loadChapterDisplayMetadata(request.projectId)
  const scopedChapters = await resolveScopeChapters(request, chapters)
  if (request.scope.type !== 'whole_project' && scopedChapters.length === 0) {
    throw new Error('所选范围没有可用章节，请改用全书背景模式或重新选择章节')
  }

  scopedChapters.forEach((chapter) => addEntity(
    allowedEntities,
    'chapter',
    chapterRefKey(chapter),
    chapterContextLabel(chapter, metadata),
    { volume: chapter.volume, chapterId: chapter.id },
  ))
  const sections: ContextSection[] = []

  if (isEnabled(request, 'project_meta')) {
    try {
      const raw = await readProjectFile(request.projectId, '', 'project.json')
      const meta: unknown = JSON.parse(raw)
      if (isRecord(meta)) {
        sections.push({
          source: 'project_meta', entityIds: [], labels: [asString(meta.name)],
          text: `# 项目资料\n名称：${asString(meta.name)}\n类型：${asString(meta.genre)}\n简介：${asString(meta.description)}`,
          priority: 1,
        })
      }
    } catch {
      warnings.push('项目资料未加载')
    }
  }

  sections.push(...await readChapterSections(request, scopedChapters, chapters, metadata, warnings))
  sections.push(...await readCharacterSections(request, warnings))
  sections.push(...await readWorldviewSections(request, warnings))
  const foreshadowSection = await readForeshadowSection(request, warnings)
  if (foreshadowSection) sections.push(foreshadowSection)
  const relationshipSection = await readRelationshipSection(request, warnings)
  if (relationshipSection) sections.push(relationshipSection)
  const notesSection = await readNotesSection(request, warnings)
  if (notesSection) sections.push(notesSection)

  for (const section of sections) {
    const type: BrainstormEntityRef['type'] | null = section.source === 'characters' ? 'character'
      : section.source === 'worldview' ? 'worldview'
        : section.source === 'foreshadows' ? 'foreshadow'
          : section.source === 'outline' ? 'outline'
            : null
    if (type) section.labels.forEach((label, index) => addEntity(allowedEntities, type, section.entityIds[index] ?? label, label))
  }

  let remaining = Math.max(0, INPUT_TOKEN_BUDGET - reservedTokens)
  const textParts: string[] = []
  for (const section of sections.sort((a, b) => a.priority - b.priority)) {
    const requestedTokens = Math.min(estimateBrainstormTokens(section.text), MAX_SINGLE_SOURCE_TOKENS)
    const allowedTokens = Math.min(requestedTokens, remaining)
    const result = trimToTokenBudget(section.text, allowedTokens)
    const truncated = result.truncated || estimateBrainstormTokens(section.text) > MAX_SINGLE_SOURCE_TOKENS
    manifest.push({
      source: section.source,
      entityIds: section.entityIds,
      labels: section.labels,
      estimatedTokens: estimateBrainstormTokens(result.value),
      truncated,
    })
    if (result.value.trim()) {
      textParts.push(result.value)
      remaining -= estimateBrainstormTokens(result.value)
    }
  }

  return { text: textParts.join('\n\n'), manifest, warnings, allowedEntities, chapters }
}

export function buildBrainstormUserInstructions(request: BrainstormRequest): string {
  const scope = request.scope.type === 'current_chapter'
    ? `当前章节：${request.scope.chapter.chapterTitle}`
    : request.scope.type === 'current_volume'
      ? `当前卷：${request.scope.volume}`
      : request.scope.type === 'selected_chapters'
        ? `指定章节：${request.scope.chapters.map((chapter) => chapter.chapterTitle).join('、')}`
        : '全书背景'
  return [
    request.derivation && request.derivation.operation !== 'generate'
      ? `推演操作：${request.derivation.operation === 'continue' ? '基于历史继续' : request.derivation.operation === 'deepen' ? '深化' : request.derivation.operation === 'variant' ? '生成变体' : request.derivation.operation === 'adjust_scale' ? '调整创意尺度' : request.derivation.operation === 'combine' ? '组合建议' : '按反馈重做'}`
      : '',
    `创意尺度：${request.creativityLevel}`,
    `分析范围：${scope}`,
    `当前问题：${request.problem || '请根据项目状态主动寻找值得发展的方向。'}`,
    request.desiredTone ? `期望氛围：${request.desiredTone}` : '',
    request.mustKeep.length > 0 ? `必须保留：${request.mustKeep.join('；')}` : '',
    request.avoid.length > 0 ? `避免方向：${request.avoid.join('；')}` : '',
    request.derivation?.feedback ? `调整反馈：${request.derivation.feedback}` : '',
  ].filter(Boolean).join('\n')
}
