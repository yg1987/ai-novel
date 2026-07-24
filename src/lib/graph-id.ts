import type { GraphNodeType } from '../types/novel'
import type { ChapterRef } from '../types/chapter'

export type GraphNodeId =
  | `character:${string}`
  | `location:${string}`
  | `item:${string}`
  | `organization:${string}`
  | `event:${string}`
  | `chapter:${string}`
  | `foreshadowing:${string}`

const NODE_TYPES: GraphNodeType[] = [
  'character',
  'location',
  'item',
  'organization',
  'event',
  'chapter',
  'foreshadowing',
]

function normalizeRawId(value: string): string {
  return value.trim()
}

export function characterNodeId(name: string): GraphNodeId {
  return `character:${normalizeRawId(name)}`
}

export function locationNodeId(name: string): GraphNodeId {
  return `location:${normalizeRawId(name)}`
}

export function itemNodeId(name: string): GraphNodeId {
  return `item:${normalizeRawId(name)}`
}

export function organizationNodeId(name: string): GraphNodeId {
  return `organization:${normalizeRawId(name)}`
}

export function chapterNodeId(reference: ChapterRef): GraphNodeId {
  return `chapter:${encodeURIComponent(reference.volume)}/${encodeURIComponent(reference.chapterId)}`
}

export function parseChapterNodeRaw(raw: string): ChapterRef | null {
  const separator = raw.indexOf('/')
  if (separator <= 0 || separator === raw.length - 1) return null
  try {
    return { volume: decodeURIComponent(raw.slice(0, separator)), chapterId: decodeURIComponent(raw.slice(separator + 1)) }
  } catch {
    return null
  }
}

export function eventNodeId(chapterId: string, index: number): GraphNodeId {
  return `event:${normalizeRawId(chapterId)}:${index}`
}

export function foreshadowingNodeId(id: string): GraphNodeId {
  return `foreshadowing:${normalizeRawId(id)}`
}

export function parseGraphNodeId(id: string): { type: GraphNodeType; raw: string } | null {
  const separator = id.indexOf(':')
  if (separator <= 0) return null
  const type = id.slice(0, separator) as GraphNodeType
  const raw = id.slice(separator + 1)
  if (!NODE_TYPES.includes(type) || raw.length === 0) return null
  return { type, raw }
}
