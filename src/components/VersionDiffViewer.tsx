import { useState } from 'react'

interface DiffLine {
  type: 'same' | 'added' | 'removed'
  content: string
  oldLine?: number
  newLine?: number
}

interface Props {
  oldText: string
  newText: string
  oldLabel?: string
  newLabel?: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.replace(/<[^>]*>/g, '').split('\n')
  const newLines = newText.replace(/<[^>]*>/g, '').split('\n')

  // Simple LCS-based diff (for typical chapter sizes this is sufficient)
  const dp: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    Array(newLines.length + 1).fill(0)
  )
  for (let i = 1; i <= oldLines.length; i++) {
    const oldLine = oldLines[i - 1]!
    const prevRow = dp[i - 1]!
    const curRow = dp[i]!
    for (let j = 1; j <= newLines.length; j++) {
      curRow[j] = oldLine === newLines[j - 1]!
        ? prevRow[j - 1]! + 1
        : Math.max(prevRow[j]!, curRow[j - 1]!)
    }
  }

  const reversed: DiffLine[] = []
  let i = oldLines.length, j = newLines.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1]! === newLines[j - 1]!) {
      reversed.push({ type: 'same', content: oldLines[i - 1]!, oldLine: i, newLine: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      reversed.push({ type: 'added', content: newLines[j - 1]!, newLine: j })
      j--
    } else {
      reversed.push({ type: 'removed', content: oldLines[i - 1]!, oldLine: i })
      i--
    }
  }
  return reversed.reverse()
}

export default function VersionDiffViewer({ oldText, newText }: Props) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified')
  const diffLines = computeDiff(oldText, newText)

  const added = diffLines.filter((l) => l.type === 'added').length
  const removed = diffLines.filter((l) => l.type === 'removed').length

  return (
    <div className="diff-viewer">
      <div className="diff-viewer-header">
        <div className="diff-stats">
          <span className="diff-stat-added">+{added} 行</span>
          <span className="diff-stat-removed">-{removed} 行</span>
        </div>
        <div className="diff-view-mode">
          <button className={`tab-btn${viewMode === 'unified' ? ' active' : ''}`} onClick={() => setViewMode('unified')}>统一视图</button>
          <button className={`tab-btn${viewMode === 'split' ? ' active' : ''}`} onClick={() => setViewMode('split')}>分栏视图</button>
        </div>
      </div>

      <div className="diff-content">
        {diffLines.map((line, idx) => (
          <div key={idx} className={`diff-line diff-${line.type}`}>
            {viewMode === 'unified' ? (
              <>
                <span className="diff-line-num">{line.oldLine ?? ''}</span>
                <span className="diff-line-num">{line.newLine ?? ''}</span>
                <span className={`diff-prefix diff-${line.type}`}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className="diff-text">{line.content || ' '}</span>
              </>
            ) : (
              <span className="diff-text">{line.content || ' '}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
