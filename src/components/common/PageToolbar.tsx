// 2026-08-17 · 공용 프레임워크 · 페이지 툴바 (좌 accent bar+제목·중앙 검색·우 액션)
//   · 최신 트렌드 · Linear/Vercel · 딥네이비 accent · 폰트 통일 · flex-wrap 반응형
//   · 사용처 · OrderManagePage · StaffManagePage · RequestsPage · BoardPage 등
//     동일 패턴을 컴포넌트화 · 유지보수 · 톤 일관 자동
//
// 사용 예:
//   <PageToolbar
//     icon={<ShoppingCart size={18} />}
//     title="발주 요청 목록"
//     count={12}
//     selectedCount={selected.size}
//     search={{ value, onChange, placeholder }}
//     right={<CategoryFilters ... />}
//   />
import type { ReactNode } from "react";

export interface PageToolbarSearch {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** 폭 · 기본 auto (flex-1 min-w-[160px] max-w-[260px]) */
  className?: string;
}

export interface PageToolbarProps {
  /** 좌측 아이콘 (Lucide/Phosphor) · 이미 사이즈/스트로크 지정된 상태로 전달 */
  icon?: ReactNode;
  /** 제목 */
  title: ReactNode;
  /** 총 건수 · undefined 면 안 표시 */
  count?: number;
  /** 건수 라벨 · 기본 "건" */
  countLabel?: string;
  /** 선택된 항목 · 0 이면 안 표시 · > 0 이면 딥네이비 solid 배지 */
  selectedCount?: number;
  /** 검색 입력 · 미지정 시 안 표시 */
  search?: PageToolbarSearch;
  /** 우측 액션 (필터 · 정렬 · 버튼 등) · flex-wrap 지원 */
  right?: ReactNode;
  /** 좌측 · 아이콘/제목 뒤에 추가 슬롯 · description 등 */
  leftSlot?: ReactNode;
  className?: string;
}

export function PageToolbar({
  icon, title, count, countLabel = "건", selectedCount,
  search, right, leftSlot, className = "",
}: PageToolbarProps) {
  return (
    <div className={`bg-white rounded-xl border border-line shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      {/* 좌측 · accent bar + icon + title + count + selected */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="w-[3px] h-[18px] rounded-full bg-brand-deep" />
        {icon && <span className="text-brand-deep shrink-0 inline-flex">{icon}</span>}
        <span className="text-[18px] font-bold text-ink tracking-tight">{title}</span>
        {count !== undefined && (
          <span className="text-[15px] font-semibold text-brand-deep bg-brand-tint rounded-full px-2.5 py-0.5 border border-brand/15 tabular-nums">
            {count}{countLabel}
          </span>
        )}
        {selectedCount !== undefined && selectedCount > 0 && (
          <span className="text-[15px] font-semibold bg-brand-deep text-white rounded-full px-2.5 py-0.5 tabular-nums shadow-sm">
            선택 {selectedCount}
          </span>
        )}
        {leftSlot}
      </div>

      {/* 검색 · 딥네이비 focus · rounded-lg · h-10 · flex-1 */}
      {search && (
        <input
          type="text"
          value={search.value}
          onChange={e => search.onChange(e.target.value)}
          placeholder={search.placeholder ?? "검색"}
          className={search.className ?? "text-[15px] border border-line rounded-lg px-3 h-10 flex-1 min-w-[160px] max-w-[260px] focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors bg-white text-ink placeholder-ink-soft"}
        />
      )}

      {/* 우측 · 필터·액션 slot · ml-auto */}
      {right && <div className="flex items-center gap-2 flex-wrap ml-auto">{right}</div>}
    </div>
  );
}
