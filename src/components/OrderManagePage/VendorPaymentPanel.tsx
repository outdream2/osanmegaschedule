// src/components/OrderManagePage/VendorPaymentPanel.tsx
// 2026-08-23 · Framework Phase 4 · 공급사별결제내역 패널 분리
// 2026-09-10 · #71 · 사용자 지시 · 상단 툴바 (기간·계절 통합) + SplitPanel 배치
import React from "react";
import { Building2, RefreshCw } from "lucide-react";
import { VendorListEditor } from "../LandingPage/VendorListEditor";
import type { Vendor } from "../LandingPage/VendorListEditor";
import { VendorDetailTabs } from "./VendorDetailTabs";
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { MonthToggleSelector } from "../common/MonthToggleSelector";
import { SeasonButtons } from "../common/SeasonButtons";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제
import { displayVendorName } from "../../utils/vendorNameNormalize";

interface VendorPaymentPanelProps {
  vendorPanelWidth: number;
  onVendorResizeStart: (e: React.MouseEvent) => void;
  vendorReloadKey: number;
  vendorPreselectId: number | null;
  vendorSelected: Vendor | null;
  onEditRequest: (vendorId: number) => void;
  onSelectVendor: (v: Vendor | null) => void;
  // 2026-10-06 · 사용자 지시 · 월 멀티선택 통일 (매입이력 STANDARD · MonthToggleSelector)
  //   · periodMonths/onPeriodMonthsChange 교체 · selectedMonths 리스트
  //   · 비연속 월 지원 · months_list 로 하위 fetch
  selectedMonths: string[];
  onSelectedMonthsChange: (v: string[]) => void;
  periodSeason: string | null;
  onPeriodSeasonChange: (v: string | null) => void;
}

export const VendorPaymentPanel: React.FC<VendorPaymentPanelProps> = ({
  vendorPanelWidth,
  onVendorResizeStart,
  vendorReloadKey,
  vendorPreselectId,
  vendorSelected,
  onEditRequest,
  onSelectVendor,
  selectedMonths,
  onSelectedMonthsChange,
  periodSeason,
  onPeriodSeasonChange,
}) => {
  const [refreshTick, setRefreshTick] = React.useState(0);
  return (
    <div className="flex flex-col gap-2">
      {/* 2026-09-10 · #71 · 상단 통합 툴바 · 기간 + 계절 + 새로고침 (다른 페이지 스타일과 통일) */}
      {/* 2026-10-06 · 월 멀티선택 통일 (매입이력 STANDARD) · 비연속 월 지원 */}
      <div className={`${CARD_BASE} px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5`}>
        <span className="text-[14px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">기간</span>
        <MonthToggleSelector
          selectedMonths={selectedMonths}
          onChange={months => { onSelectedMonthsChange(months); onPeriodSeasonChange(null); }}
          maxMonths={6}
          minOne
          ariaLabel="공급사별 결제내역 기간"
        />
        {selectedMonths.length > 0 && !periodSeason && (
          <span className="text-[13px] text-ink-soft tabular-nums">{selectedMonths.length}개월 선택</span>
        )}
        <SeasonButtons
          value={(periodSeason as any) ?? null}
          onChange={(v: any) => onPeriodSeasonChange(v ?? null)}
          size="sm"
          hideLabel
        />
        <button
          type="button"
          onClick={() => setRefreshTick(t => t + 1)}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition cursor-pointer"
          title="새로고침"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* SplitPanel · 좌 리스트 · 우 상세 · 2026-09-11 · #123 · 사용자 지시 · 세로 스크롤 복구 · height 명시 · min-h-only 였을 때 · 무한 확장 → 스크롤 사라짐 */}
      <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[720px] lg:h-[calc(100vh-260px)] lg:max-h-[820px]">
        <div className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? vendorPanelWidth : undefined }}>
          <VendorListEditor
            key={`${vendorReloadKey}-${refreshTick}`}
            initialSelectedId={vendorPreselectId}
            onEditRequest={onEditRequest}
            compact
            externalSelectedMonths={selectedMonths}
          />
        </div>
        <div onMouseDown={onVendorResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>
        {/* 2026-09-25 · 스크롤 수정 · lg:overflow-visible → lg:overflow-y-auto
            · lg:overflow-visible 이 overflow-y-auto 를 덮어써서 데스크탑 스크롤 소멸
            · 모바일 fixed fullscreen → overflow-y-auto 이미 적용됨 · lg 에서도 명시 */}
        <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto ${vendorSelected ? "fixed inset-0 z-50 bg-zinc-50 p-3 lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-y-auto" : ""}`}>
          {vendorSelected && (
            <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-line shadow-md -mx-3 px-3 py-2 mb-1 flex items-center gap-2">
              <button type="button" onClick={() => onSelectVendor(null)}
                className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0" title="닫기">
                <span className="text-lg font-bold">×</span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-bold text-zinc-800 leading-tight">{displayVendorName(vendorSelected.company_name) || vendorSelected.company_name}</div>
                <div className="text-[16px] text-zinc-500">공급사 상세 · 결제잔고 · 매입이력</div>
              </div>
              <button type="button" onClick={() => onSelectVendor(null)}
                className="text-[17px] font-bold text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-lg px-3 py-1 transition cursor-pointer shrink-0">
                닫기
              </button>
            </div>
          )}
          {!vendorSelected ? (
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState icon={Building2} title="리스트에서 공급사를 클릭하세요" hint="헤더 정보 + 결제잔고 + 매입이력이 표시됩니다" />
            </div>
          ) : (
            <VendorDetailTabs
              vendor={vendorSelected}
              externalSelectedMonths={selectedMonths}
              externalPeriodSeason={periodSeason}
            />
          )}
        </div>
      </div>
    </div>
  );
};
