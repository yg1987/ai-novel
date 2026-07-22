import type { ChapterRef } from '../types/chapter'

const BLOCK_END = /<\/(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi
const BREAK = /<br\s*\/?>/gi
const TAG = /<[^>]*>/g
const NAMED_ENTITIES: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10
      const raw = radix === 16 ? entity.slice(2) : entity.slice(1)
      const codePoint = Number.parseInt(raw, radix)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

export function normalizeChapterContent(html: string): string {
  return decodeHtmlEntities(html.replace(BREAK, '\n').replace(BLOCK_END, '\n').replace(TAG, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function contentHash(html: string): Promise<string> {
  return sha256(normalizeChapterContent(html))
}

export async function analysisInputHash(input: {
  contentHash: string
  ref: ChapterRef
  title: string
  foreshadows: unknown[]
  promptHash: string
  provider: string
  model: string
  contentLimit: number
}): Promise<string> {
  return sha256(canonicalJson({ hashSchemaVersion: 1, ...input }))
}

export function chapterFileKey(ref: ChapterRef): string {
  const bytes = new TextEncoder().encode(JSON.stringify([ref.volume, ref.chapterId]))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
