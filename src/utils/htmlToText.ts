// src/utils/htmlToText.ts

/**
 * Strip HTML tags from TipTap content, preserving paragraph structure.
 */
export function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/**
 * Strip HTML and wrap in Markdown heading format.
 */
export function htmlToMarkdown(html: string, title: string): string {
  const text = htmlToPlainText(html)
  return `# ${title}\n\n${text}`
}
