import { useMemo } from 'react'
import { tokenizeQuery } from '../services/search'

interface Props {
  text: string
  query: string
}

/**
 * Highlight text matches using the same tokenizer as search.
 * Ensures CJK bigram tokenization consistency between search and display.
 */
export default function HighlightText({ text, query }: Props) {
  const parts = useMemo(() => {
    if (!query.trim() || !text) return [{ text: text ?? '', match: false }]

    const tokens = tokenizeQuery(query)
    const patterns = tokens.length > 0 ? tokens : [query.trim()]
    const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi')

    const result: Array<{ text: string; match: boolean }> = []
    let lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        result.push({ text: text.slice(lastIndex, m.index), match: false })
      }
      result.push({ text: m[0], match: true })
      lastIndex = m.index + m[0].length
    }
    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex), match: false })
    }

    return result.length > 0 ? result : [{ text, match: false }]
  }, [text, query])

  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className="search-highlight">{p.text}</mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}
