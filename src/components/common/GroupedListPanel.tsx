// src/components/common/GroupedListPanel.tsx
// 2026-08-24 · #258 · 발주 리스트 프리미엄 UI · 그룹 헤더 + 아이템 행 재사용 프리미티브
//   · UI 대원칙 준수 · Linear/Vercel/Attio 2026 톤 · 파스텔·이모지 X · 딥네이비 accent
//   · 사용처 · 발주요청 · 발주필요 · 발주이력 · 매입 등 (그룹형 리스트 전반)
//
// props · 제네릭 G(그룹) I(아이템) · 사용자가 slot 렌더링 자유
//
// 사용 예:
//   <GroupedListPanel
//     groups={vendorGroups}
//     header={<Toolbar />}
//     renderGroupHeader={(group) => <SupplierHeader ... />}
//     renderItem={(item) => <ProductRow ... />}
//     summary={<TotalsFooter />}
//     empty="발주 요청 없음"
//   />

import React from "react";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";
import { Package } from "lucide-react";

export interface GroupedListItem {
  key: string;
}
export interface GroupedListGroup<I extends GroupedListItem> {
  key: string;
  items: I[];
}

export interface GroupedListPanelProps<I extends GroupedListItem> {
  /** 그룹 배열 · 각 그룹 안 items · 최소 1개 */
  groups: GroupedListGroup<I>[];
  /** 그룹 헤더 렌더 · 공급사·날짜 등 그룹 라벨 · 액션 (발주이력 등) 슬롯 */
  renderGroupHeader: (group: GroupedListGroup<I>) => React.ReactNode;
  /** 각 아이템 렌더 · 상품 행 · 검색결과 행 등 */
  renderItem: (item: I, group: GroupedListGroup<I>) => React.ReactNode;
  /** 상단 액션 슬롯 · 검색·필터·bulk 액션 · 카운트 */
  header?: React.ReactNode;
  /** 하단 요약 · 합계 · 총 건수 · 총 금액 등 */
  summary?: React.ReactNode;
  /** 로딩 상태 · 스피너 표시 */
  loading?: boolean;
  /** 빈 상태 안내 · title (필수) · hint (선택) */
  empty?: string | { title: string; hint?: string };
  /** 컨테이너 className · min-h · max-h 등 페이지별 조정 */
  className?: string;
  /** 그룹 간 divider 색상 · default zinc-100 · Attio 규칙 */
  dividerClass?: string;
  /** 그룹 헤더 배경 · default zinc-50/60 · 그룹 구분 시각 */
  groupHeaderBgClass?: string;
}

/**
 * 발주 리스트용 그룹형 프리미엄 리스트 프리미티브
 *   · 딥네이비 (brand-deep) accent · white surface · zinc-line border
 *   · sticky group header · smooth divider · Attio "carved" 스타일
 *   · 접근성 · role=list · role=listitem · aria-label
 */
export function GroupedListPanel<I extends GroupedListItem>({
  groups,
  renderGroupHeader,
  renderItem,
  header,
  summary,
  loading = false,
  empty = "항목 없음",
  className = "",
  dividerClass = "border-zinc-100",
  groupHeaderBgClass = "bg-zinc-50/60",
}: GroupedListPanelProps<I>): React.JSX.Element {
  const emptyProps = typeof empty === "string" ? { title: empty } : empty;
  const totalItems = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <Card padding="none" rounded="2xl" clip className={`flex flex-col ${className}`}>
      {header && (
        <div className="px-4 py-3 border-b border-line bg-white shrink-0">
          {header}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto" role="list" aria-label="그룹형 리스트">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label="불러오는 중..." size={16} tone="brand" />
          </div>
        ) : totalItems === 0 ? (
          <EmptyState
            icon={Package}
            title={emptyProps.title}
            hint={emptyProps.hint}
            size="normal"
          />
        ) : (
          <div className={`divide-y ${dividerClass}`}>
            {groups.map((group) => (
              <div key={group.key} role="listitem" className="flex flex-col">
                {/* Group Header · sticky · 딥네이비 accent · Linear/Attio 톤 */}
                <div className={`sticky top-0 z-[1] ${groupHeaderBgClass} border-b border-line px-4 py-2.5`}>
                  {renderGroupHeader(group)}
                </div>
                {/* Items · divide-y · hover · 통일 스타일 */}
                <div className={`divide-y ${dividerClass}`}>
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      role="listitem"
                      className="px-4 py-2 hover:bg-brand-tint/30 transition-colors"
                    >
                      {renderItem(item, group)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {summary && !loading && totalItems > 0 && (
        <div className="px-4 py-3 border-t border-line bg-zinc-50/40 shrink-0">
          {summary}
        </div>
      )}
    </Card>
  );
}

export default GroupedListPanel;
