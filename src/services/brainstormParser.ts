import { jsonrepair } from 'jsonrepair'
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

function parseCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate)
  } catch {
    return JSON.parse(jsonrepair(candidate))
  }
}

function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim().replace(/^\uFEFF/u, '')
  const candidates: string[] = []
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) candidates.push(match[1].trim())
  }
  const structures = [
    { start: trimmed.indexOf('{'), end: trimmed.lastIndexOf('}') },
    { start: trimmed.indexOf('['), end: trimmed.lastIndexOf(']') },
  ].filter((item) => item.start !== -1).sort((left, right) => left.start - right.start)
  for (const structure of structures) {
    candidates.push(trimmed.slice(structure.start, structure.end > structure.start ? structure.end + 1 : undefined))
  }
  candidates.push(trimmed)
  return [...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean))]
}

function parseJsonResponse(raw: string): unknown {
  for (const candidate of jsonCandidates(raw)) {
    try {
      let parsed = parseCandidate(candidate)
      if (typeof parsed === 'string' && parsed.trim() !== candidate) parsed = parseCandidate(parsed.trim())
      if (Array.isArray(parsed)) return { summary: '', ideas: parsed }
      return parsed
    } catch {
      // Try the next extracted candidate before rejecting the response.
    }
  }
  throw new Error('AI 返回的内容不是有效 JSON，请重试')
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
      volume: chapter?.volume,
      chapterId: chapter?.chapterId,
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
