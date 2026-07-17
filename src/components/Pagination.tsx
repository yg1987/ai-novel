// src/components/Pagination.tsx
import './Pagination.css'

interface PaginationProps {
  /** 当前页码（1-based） */
  currentPage: number
  /** 总页数 */
  totalPages: number
  /** 总条数（未分页前，用于显示"共 N 条"） */
  totalItems: number
  /** 当前每页条数 */
  pageSize?: number
  /** 可选条数列表（不传则不显示下拉框） */
  pageSizeOptions?: number[]
  /** 页码变化回调 */
  onPageChange: (page: number) => void
  /** 每页条数变化回调（用户切换下拉框时触发） */
  onPageSizeChange?: (pageSize: number) => void
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  if (totalItems === 0) return null

  return (
    <div className="pagination">
      <button
        className="pagination-btn"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        ← 上一页
      </button>
      <span className="pagination-info">
        第 {currentPage} / {totalPages} 页，共 {totalItems} 条
      </span>
      {onPageSizeChange && pageSize && pageSizeOptions && (
        <span className="pagination-size">
          每页
          <select
            className="pagination-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          条
        </span>
      )}
      <button
        className="pagination-btn"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        下一页 →
      </button>
    </div>
  )
}
