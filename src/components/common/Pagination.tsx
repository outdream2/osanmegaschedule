// src/components/common/Pagination.tsx
// 2026-10-06 · 사용자 지시 · 조회 목록 전수 pagination · 공통 컴포넌트
//   · 모든 리스트 조회 UI 에서 재사용
//   · 데이터 slice 는 호출측 책임 · 이 컴포넌트는 UI + handler 만 담당
//   · ProductAggTab · SupplierListCard · ByProductPanel 등 기존 inline UI 통합 원형
import React from "react";

export interface PaginationProps {
  /** 전체 아이템 수 */
  totalCount: number;
  /** 현재 페이지 (1-base · clamped 전) */
  page: number;
  /** page 상태 setter */
  setPage: (p: number | ((prev: number) => number)) => void;
  /** 페이지당 아이템 수 */
  pageSize: number;
  /** pageSize 상태 setter */
  setPageSize: (n: number) => void;
  /** 선택 가능한 페이지당 옵션 · 기본 [25, 50, 100, 200] */
  pageSizeOptions?: readonly number[];
  /** totalCount === 0 일 때 숨김 (기본 true) */
  hideWhenEmpty?: boolean;
  /** 외부에서 추가 className (border/background 커스터마이즈 등) */
  className?: string;
  /** 범위 label 커스터마이즈 · 기본 "N–M / Total건" */
  rangeLabel?: (pageStart: number, pageEndExclusive: number, totalCount: number) => React.ReactNode;
}

export const Pagination: React.FC<PaginationProps> = ({
  totalCount,
  page,
  setPage,
  pageSize,
  setPageSize,
  pageSizeOptions = [25, 50, 100, 200],
  hideWhenEmpty = true,
  className,
  rangeLabel,
}) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEndExclusive = Math.min(pageStart + pageSize, totalCount);

  if (hideWhenEmpty && totalCount === 0) return null;

  const defaultLabel = `${(pageStart + 1).toLocaleString()}–${pageEndExclusive.toLocaleString()} / ${totalCount.toLocaleString()}건`;

  return (
    <div className={`shrink-0 border-t border-line bg-zinc-50/60 px-3 py-2 flex items-center gap-2 text-[14px] text-zinc-600 flex-wrap ${className ?? ""}`.trim()}>
      <span className="tabular-nums">
        {rangeLabel ? rangeLabel(pageStart, pageEndExclusive, totalCount) : defaultLabel}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <label className="text-[13px] text-zinc-500 mr-1">페이지당</label>
        <select
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value))}
          className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] cursor-pointer hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
        >
          {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={safePage <= 1}
          className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
          aria-label="첫 페이지"
        >‹‹</button>
        <button
          type="button"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
          aria-label="이전 페이지"
        >‹</button>
        <span className="px-2 tabular-nums text-[14px] font-semibold text-zinc-700">
          {safePage.toLocaleString()} / {totalPages.toLocaleString()}
        </span>
        <button
          type="button"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
          aria-label="다음 페이지"
        >›</button>
        <button
          type="button"
          onClick={() => setPage(totalPages)}
          disabled={safePage >= totalPages}
          className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
          aria-label="마지막 페이지"
        >››</button>
      </div>
    </div>
  );
};

/**
 * 2026-10-06 · usePagination 훅 · state + slice 를 함께 관리
 *   · 호출측에서 data array 전달 · { pageRows, page, setPage, pageSize, setPageSize, totalCount, pageStart, totalPages, safePage } 반환
 *   · reset 트리거 외부 제어 (resetDeps 변경 시 자동 page=1)
 */
export function usePagination<T>(
  data: readonly T[],
  options?: {
    defaultPageSize?: number;
    resetDeps?: readonly unknown[];
  },
): {
  pageRows: T[];
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  totalCount: number;
  totalPages: number;
  safePage: number;
  pageStart: number;
} {
  const [pageSize, setPageSize] = React.useState<number>(options?.defaultPageSize ?? 50);
  const [page, setPage] = React.useState<number>(1);
  const totalCount = data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // resetDeps 변경 시 · pageSize 변경 시 · totalCount 변경 시 · page 1 reset
  const resetKey = JSON.stringify([pageSize, totalCount, ...(options?.resetDeps ?? [])]);
  React.useEffect(() => { setPage(1); }, [resetKey]);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = React.useMemo(
    () => data.slice(pageStart, pageStart + pageSize),
    [data, pageStart, pageSize],
  );
  return { pageRows, page, setPage, pageSize, setPageSize, totalCount, totalPages, safePage, pageStart };
}

export default Pagination;
