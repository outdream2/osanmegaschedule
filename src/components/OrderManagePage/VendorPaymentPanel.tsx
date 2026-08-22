// src/components/OrderManagePage/VendorPaymentPanel.tsx
// 2026-08-23 · Framework Phase 4 · 공급사별결제내역 패널 분리
import React from "react";
import { Building2 } from "lucide-react";
import { VendorListEditor } from "../LandingPage/VendorListEditor";
import type { Vendor } from "../LandingPage/VendorListEditor";
import { VendorDetailTabs } from "./VendorDetailTabs";
import { CARD_BASE } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";

interface VendorPaymentPanelProps {
  vendorPanelWidth: number;
  onVendorResizeStart: (e: React.MouseEvent) => void;
  vendorReloadKey: number;
  vendorPreselectId: number | null;
  vendorSelected: Vendor | null;
  onEditRequest: (vendorId: number) => void;
  onSelectVendor: (v: Vendor | null) => void;
}

export const VendorPaymentPanel: React.FC<VendorPaymentPanelProps> = ({
  vendorPanelWidth,
  onVendorResizeStart,
  vendorReloadKey,
  vendorPreselectId,
  vendorSelected,
  onEditRequest,
  onSelectVendor,
}) => (
  <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:min-h-[720px]">
    <div className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
      style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? vendorPanelWidth : undefined }}>
      <VendorListEditor key={vendorReloadKey} initialSelectedId={vendorPreselectId} onEditRequest={onEditRequest} compact />
    </div>
    <div onMouseDown={onVendorResizeStart}
      className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
      title="드래그하여 폭 조절">
      <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
    </div>
    <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto lg:relative ${vendorSelected ? "fixed inset-0 z-50 bg-zinc-50 p-3 lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-visible" : ""}`}>
      {vendorSelected && (
        <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-line shadow-md -mx-3 px-3 py-2 mb-1 flex items-center gap-2">
          <button type="button" onClick={() => onSelectVendor(null)}
            className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0" title="닫기">
            <span className="text-lg font-bold">×</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-zinc-800 leading-tight">{vendorSelected.company_name}</div>
            <div className="text-[14px] text-zinc-500">공급사 상세 · 결제잔고 · 매입이력</div>
          </div>
          <button type="button" onClick={() => onSelectVendor(null)}
            className="text-[15px] font-bold text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-lg px-3 py-1 transition cursor-pointer shrink-0">
            닫기
          </button>
        </div>
      )}
      {!vendorSelected ? (
        <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
          <EmptyState icon={Building2} title="리스트에서 공급사를 클릭하세요" hint="헤더 정보 + 결제잔고 + 매입이력이 표시됩니다" />
        </div>
      ) : (
        <VendorDetailTabs vendor={vendorSelected} />
      )}
    </div>
  </div>
);
