// src/utils/formatAdapter.ts
// Platform-specific publish format transformation.

export type PublishPlatform = 'qidian' | 'fanqie' | 'jinjiang' | 'raw'

export interface FormatConfig {
  indentFirstLine: boolean
  paragraphSpacing: string
  separator: string
}

const PLATFORM_CONFIGS: Record<PublishPlatform, FormatConfig> = {
  qidian:   { indentFirstLine: false, paragraphSpacing: '1em',    separator: '\n\n\n' },
  fanqie:   { indentFirstLine: false, paragraphSpacing: '2em',    separator: '\n\n' },
  jinjiang: { indentFirstLine: true,  paragraphSpacing: '0.5em',  separator: '\n\n\n' },
  raw:      { indentFirstLine: false, paragraphSpacing: '1em',    separator: '\n\n---\n\n' },
}

const PLATFORM_LABELS: Record<PublishPlatform, string> = {
  qidian: '起点中文网',
  fanqie: '番茄小说',
  jinjiang: '晋江文学城',
  raw: '原始格式',
}

export { PLATFORM_LABELS }

/**
 * Strip HTML and apply platform-specific formatting rules.
 */
export function adaptForPlatform(html: string, platform: PublishPlatform): string {
  const config = PLATFORM_CONFIGS[platform]

  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()

  const paragraphs = text.split('\n').filter((p) => p.trim())
  const formatted = paragraphs.map((p) => {
    let line = p.trim()
    if (config.indentFirstLine) line = '\u3000\u3000' + line
    return line
  })

  return formatted.join('\n')
}
