// src/components/common/SplitListPanel.tsx
// 2026-08-23 · 공용 프레임워크 · Split 왼쪽 리스트 패널 통합 (#198)
//   · 마스터-디테일 좌측 · toolbar (search+filter+add) + list + loading/empty
//   · Linear/Vercel/Notion 2026 톤 · 초고해상도 · 부드러움 · 딥네이비 accent
//   · 목업 UI_MOCKUP_2026-08-21.html 톤 통일
//   · 재사용 대상 · StaffManagePage · ProductInfoPage (#177) · 향후 기타 마스터-디테일
//
// ═══════════════════════════════════════════════════════════════════
// 🔥 대원칙 (2026-08-24 · #262 · 사용자 지시)
//   SplitListPanel 사용 시 · **`search`/`onSearchChange` prop 필수 (검색창 상단 기본)**
//   · 리스트 위에 검색창이 항상 있어야 함 · UI 일관성 · 사용자 접근성
//   · filters 슬롯 안에 custom input 넣기 X · 반드시 built-in props 사용
//   · 예외 없음 · 신규 SplitListPanel 채택 시 search prop 세팅 필수
// ═══════════════════════════════════════════════════════════════════
//
// 사용:
//   <SplitListPanel
//     title="직원"
//     count={filtered.length}
//     search={search}
//     onSearchChange={setSearch}
//     onAdd={() => setCreateOpen(true)}
//     addLabel="신규 등록"
//     loading={loading}
//     empty={!loading && filtered.length === 0}
//     emptyText="직원이 없습니다"
//     filters={<Segmented ... />}
//   >
//     <table>...</table>
//   </SplitListPanel>

import React, { useCallback } from "react";
import { Search as SearchIcon, Plus, X } from "lucide-react";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";

export interface SplitListPanelProps {
  /** 패널 제목 (예: "직원" · "상품") */
  title?: React.ReactNode;
  /** 총 개수 배지 · 우측 표시 */
  count?: number;
  /** 검색 값 · 미제공 시 검색 필드 숨김 */
  search?: string;
  /** 검색 변경 콜백 */
  onSearchChange?: (v: string) => void;
  /** 검색 placeholder */
  searchPlaceholder?: string;
  /** 필터 slot · segmented control · tabs · chip 등 */
  filters?: React.ReactNode;
  /** 신규 등록 콜백 · 있으면 + 버튼 표시 */
  onAdd?: () => void;
  /** 신규 등록 버튼 라벨 · 기본 "신규 등록" */
  addLabel?: string;
  /** 신규 등록 버튼 툴팁 */
  addTitle?: string;
  /** 로딩 상태 · Spinner 표시 */
  loading?: boolean;
  /** 로딩 라벨 · 기본 "불러오는 중..." */
  loadingLabel?: string;
  /** 빈 상태 · 리스트 대신 EmptyState 표시 */
  empty?: boolean;
  /** 빈 상태 텍스트 · 기본 "데이터가 없습니다" */
  emptyText?: string;
  /** 빈 상태 힌트 (제목 아래 · optional) */
  emptyHint?: string;
  /** 빈 상태 아이콘 컴포넌트 · lucide/phosphor 등 · 미지정 시 기본 Inbox */
  emptyIcon?: React.ComponentType<{ size?: number; className?: string; weight?: string }>;
  /** 오류 · rose Card 노출 (선택) */
  error?: string | null;
  /** 헤더 우측 슬롯 · 신규 등록 버튼 앞 · 추가 액션 (예: 새로고침 · 정렬 등) */
  headerActions?: React.ReactNode;
  /** children · 실제 리스트 (table · ul · Card 등) */
  children: React.ReactNode;
  /** wrapper className */
  className?: string;
  // ── v2 확장 (2026-08-23) · 모두 optional · Phase 3 확산 지원 ──
  /**
   * 커스텀 count 표시 · count prop 대체 · "3/50" (filtered/total) 같은 복합 표시
   *   · 지정 시 · count StatusPill 대신 이 노드가 title 옆에 렌더
   */
  countDisplay?: React.ReactNode;
  /**
   * footer 슬롯 · body 아래 · shrink-0 border-t
   *   · 하단 등록/저장/action 버튼 배치 (예: StaffListPanel 하단 "신규 등록" 이관)
   */
  footer?: React.ReactNode;
  /**
   * body className override · 기본 flex-1 min-h-0 overflow-y-auto
   *   · 특수 케이스 · 예 "flex-1 min-h-0 overflow-y-auto p-3" · 내부 padding 추가
   */
  bodyClassName?: string;
  // ── v3 확장 (2026-08-23) · Phase 3 · 추가 확산 지원 ──
  /**
   * subHeader · header 아래 · body 위 · 렌더 슬롯
   *   · KPI 요약 (총 잔고 · 최근 결제일 등) · 부가 정보 (통계 배지 등) 배치
   *   · shrink-0 · border-t/b 없음 · 스타일 자유
   *   · 예: PaymentInfoTab 의 3-inline KPI (총 잔고·최근 결제일·최근 결제액)
   */
  subHeader?: React.ReactNode;
  /**
   * 2026-08-24 · #262 · 검색창을 헤더 1행 (title/count 옆) 인라인 배치 (사용자 지시)
   *   · 기본 false · 2행 (기존)
   *   · true · row1 · title + count + search + actions + add · row2 · filters 만
   *   · SupplierTab 등 · "공급사별 현황 88개 사 [검색]" 인라인 요구
   */
  searchInHeader?: boolean;
  /**
   * 2026-08-24 · v3 · 상단 gradient accent line · 랜딩 톤 시그니처
   *   · 3px · brand-deep → sky-500 → brand-deep
   *   · 기본 false · true 시 · 표시
   */
  topAccent?: boolean;
}

/**
 * 공용 · 마스터-디테일 좌측 리스트 패널
 *   · 헤더 (title + count + search + filters + actions + add)
 *   · body (loading · empty · error · children 우선순위)
 *   · Card wrapper · shadow · flex-col · h-full
 */
export function SplitListPanel({
  title,
  count,
  search,
  onSearchChange,
  searchPlaceholder = "검색...",
  filters,
  onAdd,
  addLabel = "신규 등록",
  addTitle,
  loading = false,
  loadingLabel = "불러오는 중...",
  empty = false,
  emptyText = "데이터가 없습니다",
  emptyHint,
  emptyIcon,
  error,
  headerActions,
  children,
  className = "",
  countDisplay,
  footer,
  bodyClassName,
  subHeader,
  searchInHeader = false,
  topAccent = false,
}: SplitListPanelProps) {
  const hasSearch = onSearchChange != null;
  const hasHeader = title != null || hasSearch || filters != null || onAdd != null || headerActions != null;
  const showEmpty = !loading && !error && empty;

  const clearSearch = useCallback(() => onSearchChange?.(""), [onSearchChange]);

  // 2026-08-24 · 검색창 UI 재사용 · row1 인라인 · row2 fallback 공용
  const searchInput = hasSearch ? (
    <div className="relative flex-1 min-w-0">
      <SearchIcon
        size={13}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
      <input
        type="text"
        value={search ?? ""}
        onChange={(e) => onSearchChange!(e.target.value)}
        placeholder={searchPlaceholder}
        className="w-full h-8 pl-7 pr-7 rounded-lg border border-line bg-zinc-50/60 text-[13px] font-medium text-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep focus:bg-white transition-colors"
      />
      {search && (
        <button
          type="button"
          onClick={clearSearch}
          aria-label="검색어 지우기"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-zinc-400 hover:text-ink hover:bg-zinc-100 flex items-center justify-center cursor-pointer transition-colors"
        >
          <X size={11} />
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className={`relative flex flex-col h-full min-h-0 ${className}`.trim()}>
      {/* 2026-08-24 · v3 · 상단 gradient accent (opt-in) · 랜딩 톤 · Vercel/Linear 시그니처 */}
      {topAccent && (
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-20 rounded-t-md"
        />
      )}
      {hasHeader && (
        <div className="shrink-0 px-3.5 py-2.5 border-b border-line bg-white flex flex-col gap-2">
          {/* 1행 · title + count + (searchInHeader 시 검색) + headerActions + add */}
          {(title != null || onAdd != null || headerActions != null || (searchInHeader && hasSearch)) && (
            <div className="flex items-center gap-2 min-w-0">
              {title != null && (
                <div className={`flex items-center gap-1.5 min-w-0 ${searchInHeader ? "shrink-0" : ""}`.trim()}>
                  <span className="text-[15px] font-bold text-ink tracking-tight truncate">
                    {title}
                  </span>
                  {/* 2026-08-23 v2 · countDisplay 우선 · 없으면 count StatusPill */}
                  {countDisplay != null ? (
                    countDisplay
                  ) : typeof count === "number" ? (
                    <StatusPill tone="zinc" size="xs">
                      {count}
                    </StatusPill>
                  ) : null}
                </div>
              )}
              {/* 2026-08-24 · searchInHeader · row1 인라인 검색창 (title/count 옆) */}
              {searchInHeader && hasSearch ? (
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {searchInput}
                </div>
              ) : (
                <div className="flex-1" />
              )}
              {headerActions && <div className="shrink-0 flex items-center gap-1">{headerActions}</div>}
              {onAdd && (
                <button
                  type="button"
                  onClick={onAdd}
                  title={addTitle ?? addLabel}
                  className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-brand-deep text-white text-[13px] font-bold hover:bg-[#0d3a5c] active:scale-[0.98] transition-all shadow-sm cursor-pointer"
                >
                  <Plus size={13} className="stroke-[3]" />
                  <span>{addLabel}</span>
                </button>
              )}
            </div>
          )}
          {/* 2행 · (searchInHeader 아닐 때) search + filters · (searchInHeader 일 때) filters 만 */}
          {((!searchInHeader && hasSearch) || filters) && (
            <div className="flex items-center gap-2 min-w-0">
              {!searchInHeader && searchInput}
              {filters && <div className="shrink-0">{filters}</div>}
            </div>
          )}
        </div>
      )}
      {/* 2026-08-23 v3 · subHeader · header 아래 · body 위 · KPI/부가정보 */}
      {subHeader && (
        <div className="shrink-0">{subHeader}</div>
      )}
      {/* body · flex-1 · scroll · loading > error > empty > children 우선순위 */}
      <div className={bodyClassName ?? "flex-1 min-h-0 overflow-y-auto"}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label={loadingLabel} size={20} tone="brand" />
          </div>
        ) : error ? (
          <div className="p-4">
            <Card
              variant="flat"
              padding="md"
              rounded="lg"
              bg="bg-rose-50"
              borderColor="border-rose-200"
              className="text-[13px] text-rose-700 font-medium"
            >
              {error}
            </Card>
          </div>
        ) : showEmpty ? (
          <div className="flex items-center justify-center py-12">
            <EmptyState icon={emptyIcon} title={emptyText} hint={emptyHint} />
          </div>
        ) : (
          children
        )}
      </div>
      {/* 2026-08-23 v2 · footer 슬롯 · body 아래 · 신규 등록 등 하단 action */}
      {footer && (
        <div className="shrink-0 border-t border-line bg-white">{footer}</div>
      )}
    </div>
  );
}

export default SplitListPanel;
