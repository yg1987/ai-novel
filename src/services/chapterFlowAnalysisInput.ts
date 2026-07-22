import { loadProviderConfig } from '../api/tauri'
import type { ChapterRef } from '../types/chapter'
import { chapterRefKey, loadChapterDisplayMetadata } from './chapterDisplay'
import { analysisInputHash, sha256 } from './chapterFlowHash'
import { loadForeshadows } from './foreshadowStorage'

export const CHAPTER_FLOW_CONTENT_LIMIT = 30_000

export const CHAPTER_FLOW_SYSTEM_PROMPT = `你是小说章节脉络分析助手。只根据提供的章节正文和伏笔上下文输出 JSON，不修改正文或正式伏笔记录。
输出格式：
{
  "summary": "本章摘要",
  "keyEvents": ["关键事件"],
  "endingHook": "章节结尾钩子或待延续事项",
  "findings": [{
    "type": "possible-resolution | possible-advance | possible-continuation | record-conflict",
    "foreshadowId": "仅可使用上下文中给出的伏笔 ID；无关联则省略",
    "summary": "判断摘要",
    "quote": "必须逐字出现在本章正文中的证据摘录",
    "confidence": 0.0
  }]
}
没有可验证原文证据时不要输出 finding。confidence 必须在 0 到 1 之间。`

export interface ChapterFlowPromptForeshadow {
  id: string
  name: string
  plannedResolutionChapter?: ChapterRef
}

export interface ChapterFlowAnalysisInput {
  title: string
  foreshadows: ChapterFlowPromptForeshadow[]
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  inputHash: string
}

export async function buildChapterFlowAnalysisInput(
  projectId: string,
  ref: ChapterRef,
  hash: string,
): Promise<ChapterFlowAnalysisInput> {
  const [metadata, store, providerConfig] = await Promise.all([
    loadChapterDisplayMetadata(projectId),
    loadForeshadows(projectId),
    loadProviderConfig().catch(() => ({ providers: [], active_profile: '' })),
  ])
  const activeProvider = providerConfig.providers.find((provider) => provider.name === providerConfig.active_profile)
  const title = metadata.chapterTitles[chapterRefKey(ref)] ?? ref.chapterId
  const foreshadows = store.entries
    .filter((entry) => entry.status !== 'resolved' && entry.status !== 'abandoned')
    .map((entry) => ({ id: entry.id, name: entry.name, plannedResolutionChapter: entry.plannedResolutionChapter }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const provider = activeProvider?.name ?? 'unconfigured'
  const model = activeProvider?.models.analysis ?? 'unconfigured'
  const inputHash = await analysisInputHash({
    contentHash: hash,
    ref,
    title,
    foreshadows,
    promptHash: await sha256(CHAPTER_FLOW_SYSTEM_PROMPT),
    provider,
    model,
    contentLimit: CHAPTER_FLOW_CONTENT_LIMIT,
  })
  return {
    title,
    foreshadows,
    provider,
    model,
    baseUrl: activeProvider?.base_url ?? '',
    apiKey: activeProvider?.api_key ?? '',
    inputHash,
  }
}
