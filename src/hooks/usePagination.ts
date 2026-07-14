// src/hooks/usePagination.ts
import { useState, useMemo, useCallback } from 'react'

interface PaginationResult<T> {
  /** 当前页码（1-based） */
  page: number
  /** 设置页码 */
  setPage: (page: number) => void
  /** 总页数 */
  totalPages: number
  /** 当前页数据切片 */
  paged: T[]
  /** 手动重置到第一页（在过滤/搜索条件变化或 pageSize 变化时调用） */
  reset: () => void
}

export function usePagination<T>(
  items: T[],
  pageSize: number = 15,
): PaginationResult<T> {
  const [page, setPage] = useState(1)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(items.length / pageSize)),
    [items.length, pageSize],
  )

  const safePage = Math.min(page, totalPages)

  const paged = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  )

  const reset = useCallback(() => setPage(1), [])

  return { page, setPage, totalPages, paged, reset }
}
