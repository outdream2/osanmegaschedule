// 2026-08-16 · 프레임워크 · 페이지네이션 파라미터 파싱 + Supabase range 헬퍼
import type { Request } from "express";

export interface Pagination {
  page: number;   // 1-based
  limit: number;
  offset: number;
  from: number;   // Supabase .range(from, to)
  to: number;
}

export function parsePagination(req: Request, defaults: { limit?: number; maxLimit?: number } = {}): Pagination {
  const maxLimit = defaults.maxLimit ?? 200;
  const defLimit = defaults.limit ?? 50;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  let limit = Math.max(1, parseInt(String(req.query.limit ?? defLimit), 10) || defLimit);
  if (limit > maxLimit) limit = maxLimit;
  const offset = (page - 1) * limit;
  return { page, limit, offset, from: offset, to: offset + limit - 1 };
}

/** Supabase count 응답 · total 을 포함한 표준 페이지네이션 응답 형식 */
export function paginatedResponse<T>(items: T[], total: number | null, p: Pagination) {
  const totalCount = total ?? items.length;
  return {
    items,
    total: totalCount,
    page: p.page,
    limit: p.limit,
    hasMore: p.offset + items.length < totalCount,
  };
}
