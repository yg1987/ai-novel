import type { BrainstormAllowedEntity } from './brainstormContext'
import type {
  BrainstormEntityRef,
  BrainstormIdea,
  BrainstormRequest,
  BrainstormResponse,
} from '../types/brainstorm'
import { asString, asStringArray, isRecord } from '../utils/unknown'

type EntityType = BrainstormEntityRef['type']

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase()
}

function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const fencedOrRaw = fenced?.[1] ?? trimmed
  const firstBrace = fencedOrRaw.indexOf('{')
  const lastBrace = fencedOrRaw.lastIndexOf('}')
  const json = firstBrace !== -1 && lastBrace > firstBrace ? fencedOrRaw.slice(firstBrace, lastBrace + 1) : fencedOrRaw
  try {
    return JSON.parse(json)
  } catch {
    throw new Error('AI 返回的内容不是有效 JSON，请重试')
  }
}

function entityType(value: unknown): EntityType | null {
  return value === 'character' || value === 'worldview' || value === 'outline' || value === 'foreshadow' || value === 'chapter'
    ? value
    : null
}

function resolveEntity(type: EntityType, label: string, allowed: BrainstormAllowedEntity[]): BrainstormEntityRef {
  const match = allowed.find((entity) => entity.type === type && normalize(entity.label) === normalize(label))
  return {
    type,
    entityId: match?.entityId,
    label,
    reason: '',
    verified: Boolean(match),
  }
}

function parseIdea(value: unknown, request: BrainstormRequest, allowed: BrainstormAllowedEntity[]): BrainstormIdea | null {
  if (!isRecord(value)) return null
  const title = asString(value.title).trim()
  const summary = asString(value.summary).trim()
  const whyItFits = asString(value.whyItFits).trim()
  const location = value.suggestedLocation
  if (!title || !summary || !whyItFits || !isRecord(location)) return null

  const chapterLabel = asString(location.chapterLabel).trim()
  const chapter = chapterLabel
    ? allowed.find((entity) => entity.type === 'chapter' && normalize(entity.label) === normalize(chapterLabel))
    : undefined
  const connections = Array.isArray(value.connections)
    ? value.connections.flatMap((item): BrainstormEntityRef[] => {
      if (!isRecord(item)) return []
      const type = entityType(item.type)
      const label = asString(item.label).trim()
      if (!type || !label) return []
      return [{ ...resolveEntity(type, label, allowed), reason: asString(item.reason).trim() }]
    })
    : []

  return {
    id: crypto.randomUUID(),
    title,
    summary,
    developmentSteps: asStringArray(value.developmentSteps).map((item) => item.trim()).filter(Boolean),
    suggestedLocation: {
      chapterId: chapter?.entityId,
      chapterLabel,
      positionNote: asString(location.positionNote).trim(),
      verified: Boolean(chapter),
    },
    whyItFits,
    connections,
    risks: asStringArray(value.risks).map((item) => item.trim()).filter(Boolean),
    hooks: asStringArray(value.hooks).map((item) => item.trim()).filter(Boolean),
    creativityLevel: request.creativityLevel,
    favorite: false,
    dismissed: false,
    parentIdeaIds: request.derivation?.parentIdeaIds ?? [],
  }
}

export function parseBrainstormResponse(
  raw: string,
  request: BrainstormRequest,
  allowedEntities: BrainstormAllowedEntity[],
): BrainstormResponse {
  if (!raw.trim()) throw new Error('AI 返回内容为空，请重试')
  const parsed = parseJsonResponse(raw)
  if (!isRecord(parsed) || !Array.isArray(parsed.ideas)) {
    throw new Error('AI 返回缺少可用的灵感建议，请重试')
  }
  const ideas = parsed.ideas
    .map((idea) => parseIdea(idea, request, allowedEntities))
    .filter((idea): idea is BrainstormIdea => idea !== null)
  if (ideas.length === 0) throw new Error('AI 返回的灵感建议不完整，请重试')
  return { summary: asString(parsed.summary).trim(), ideas: ideas.slice(0, request.resultCount) }
}
