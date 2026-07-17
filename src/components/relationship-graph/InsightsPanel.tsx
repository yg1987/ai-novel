import { useState } from 'react'
import Pagination from '../Pagination'
import { usePagination } from '../../hooks/usePagination'
import type { InsightItem } from '../../types/novel'

export default function InsightsPanel({ insights, onFocusInsight }: { insights: InsightItem[]; onFocusInsight: (insight: InsightItem) => void }) {
  const [pageSize, setPageSize] = useState(6)
  const { paged, page, setPage, totalPages, reset } = usePagination(insights, pageSize)
  const changePageSize = (next: number) => {
    setPageSize(next)
    reset()
  }

  return (
    <div className="graph-insights-panel">
      <div className="graph-sidebar-title"><h3>洞察</h3><span>{insights.length} 条</span></div>
      <div className="graph-insight-list">
        {insights.length === 0 ? <p className="review-empty">暂无洞察</p> : paged.map((insight, index) => (
          <button key={`${insight.type}-${page}-${index}`} className="graph-insight-card" onClick={() => onFocusInsight(insight)}>
            <strong>{insight.title}</strong>
            <p>{insight.description}</p>
            <small>{insight.suggestion}</small>
          </button>
        ))}
      </div>
      <Pagination currentPage={page} totalPages={totalPages} totalItems={insights.length} pageSize={pageSize} pageSizeOptions={[6, 10, 15]} onPageChange={setPage} onPageSizeChange={changePageSize} />
    </div>
  )
}
