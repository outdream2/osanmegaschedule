// 2026-08-22 · Framework Phase 4 · FlowTab.tsx large-file 분리
// 3개 UI 섹션 · props-driven pure display
//   · FlowFilterBar · 상단 필터바 (기간·TopN·검색·판매출고계·숨김·분류)
//   · HiddenManagerModal · 숨김 상품 관리 모달
//   · SupplierDetailModalWrapper · 공급사 상세 모달 wrapper

import React from "react";
import {
  Search, Boxes, Info, EyeOff, Loader2 as LoaderIcon,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { AccentBar } from "../common/AccentBar";
import { CARD_BASE } from "../../styles/tokens";
import { SeasonButtons } from "../common/SeasonButtons";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { Modal } from "../common/Modal";
// 2026-08-22 · Framework Phase 4 · props 유연성 위해 any 사용
// ProductInfo / ProductSearchResult / HiddenProduct 다양한 형태 모두 지원 (구조적으로 유사)
type AnyProduct = any;

// ═══════════════════════════════════════════════════════════════════════════
// 1) FlowFilterBar · 상단 필터바
// ═══════════════════════════════════════════════════════════════════════════

interface FlowFilterBarProps {
  filteredFlowCount: number;
  flowMonths: number;
  flowSeason: SeasonKey | null;
  flowSnapshot: string | null;
  flowDateRange: string | null;
  flowLimit: number;
  flowCategoryFilter: "전체" | "위탁" | "선결제" | "60회전" | "90회전" | "기타";
  infoSearchQuery: string;
  infoSearchResults: AnyProduct[];
  infoSelected: AnyProduct | null;
  salesQtyMin: string;
  salesQtyMax: string;
  loading: boolean;
  setFlowSeason: (v: SeasonKey | null) => void;
  setPendingFlowMonths: (v: number) => void;
  setFlowMonths: (v: number) => void;
  setFlowLimit: (v: number) => void;
  setInfoSearchQuery: (v: string) => void;
  setInfoSearchResults: (v: AnyProduct[]) => void;
  setInfoSelected: (v: AnyProduct | null) => void;
  runInfoSearch: () => void;
  loadFlowSelectedProduct: (p: AnyProduct) => void;
  setSalesQtyMin: (v: string) => void;
  setSalesQtyMax: (v: string) => void;
  onOpenHiddenManagerModal: () => void;
  setFlowCategoryFilter: (v: FlowFilterBarProps["flowCategoryFilter"]) => void;
  onFetchStockFlow: () => void;
}

export const FlowFilterBar: React.FC<FlowFilterBarProps> = ({
  filteredFlowCount, flowMonths, flowSeason, flowSnapshot, flowDateRange,
  flowLimit, flowCategoryFilter,
  infoSearchQuery, infoSearchResults, infoSelected,
  salesQtyMin, salesQtyMax, loading,
  setFlowSeason, setPendingFlowMonths, setFlowMonths, setFlowLimit,
  setInfoSearchQuery, setInfoSearchResults, setInfoSelected, runInfoSearch,
  loadFlowSelectedProduct, setSalesQtyMin, setSalesQtyMax,
  onOpenHiddenManagerModal, setFlowCategoryFilter, onFetchStockFlow,
}) => {
  return (
    <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2`}>
      <div className="flex items-center gap-2.5">
        <AccentBar />
        <Boxes size={16} className="text-brand-deep shrink-0" />
        <span className="text-[17px] font-bold text-ink tracking-tight">상품현황리스트</span>
        <StatusPill tone="sky" size="md">{filteredFlowCount}건</StatusPill>
      </div>

      {/* 조회기간 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[15px] font-bold text-ink tracking-tight shrink-0">기간</span>
        {flowMonths === 0 && !flowSeason && flowSnapshot && (
          <span className="text-[15px] tabular-nums font-medium text-zinc-600 bg-zinc-50 border border-line rounded-md px-2 py-0.5">
            {flowDateRange ?? flowSnapshot}
          </span>
        )}
        {flowMonths > 0 && (() => {
          const today = new Date();
          const start = new Date(today.getFullYear(), today.getMonth() - flowMonths, 1);
          const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
          const e = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          return <span className="text-[15px] tabular-nums font-medium text-zinc-600 bg-zinc-50 border border-line rounded-md px-2 py-0.5">{s} ~ {e}</span>;
        })()}
        <div className="flex flex-wrap bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
          <button onClick={() => { setFlowSeason(null); setPendingFlowMonths(0); setFlowMonths(0); }}
            className={`px-2 h-6 text-[15px] font-semibold rounded transition cursor-pointer ${!flowSeason && flowMonths === 0 ? "bg-teal-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>10일</button>
          {([1, 2, 3, 4, 5, 6] as const).map(m => (
            <button key={m} onClick={() => { setFlowSeason(null); setPendingFlowMonths(m); setFlowMonths(m); }}
              className={`px-2 h-6 text-[15px] font-semibold rounded transition cursor-pointer ${!flowSeason && flowMonths === m ? "bg-teal-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>{m}개월</button>
          ))}
        </div>
        <SeasonButtons value={flowSeason} onChange={(v) => { setFlowSeason(v); if (v) { setPendingFlowMonths(0); setFlowMonths(0); } }} size="sm" hideLabel />
      </div>

      {/* Top N */}
      <div className="flex items-center gap-1.5">
        <span className="text-[15px] font-bold text-ink tracking-tight shrink-0">Top N</span>
        <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1">
          {[{ v: 100, label: "100" }, { v: 300, label: "300" }, { v: 1000, label: "1k" }, { v: 2000, label: "2k" }, { v: 50000, label: "전체" }].map(o => (
            <button key={o.v} onClick={() => setFlowLimit(o.v)}
              className={`text-[15px] font-semibold h-6 px-2 rounded transition whitespace-nowrap cursor-pointer ${flowLimit === o.v ? "bg-teal-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 정보확인 검색 */}
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        <input
          value={infoSearchQuery}
          onChange={(e) => setInfoSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runInfoSearch(); }}
          placeholder="전체 DB 검색 (정보확인)"
          className="w-48 h-7 pl-7 pr-2 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep bg-white transition"
        />
        {infoSearchResults.length > 0 && (
          <div className="absolute left-0 top-full mt-1 max-h-64 overflow-y-auto border border-line bg-white rounded-lg shadow-lg z-30 divide-y divide-zinc-100 min-w-full sm:min-w-[500px]">
            {infoSearchResults.map((p, i) => (
              <button key={`info-sr-${(p as any).product_code}-${i}`}
                onClick={() => { setInfoSelected(p); setInfoSearchQuery((p as any).product_name); setInfoSearchResults([]); }}
                className="w-full text-left px-2.5 py-1 hover:bg-sky-50 transition flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold text-zinc-800 whitespace-nowrap">{(p as any).product_name}</div>
                  <div className="text-[15px] tabular-nums text-zinc-400 whitespace-nowrap">#{(p as any).product_code} · {(p as any).supplier ?? "-"}</div>
                </div>
                <span className="text-[15px] text-zinc-400 shrink-0">재고 {(p as any).current_stock ?? "-"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 정보확인 버튼 */}
      <button
        onClick={() => {
          const target = infoSelected ?? infoSearchResults[0] ?? null;
          if (target) { loadFlowSelectedProduct(target); setInfoSearchResults([]); }
        }}
        disabled={!infoSelected && !infoSearchQuery.trim() && infoSearchResults.length === 0}
        className="flex items-center gap-1.5 text-[15px] font-semibold text-white bg-zinc-700 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-3 h-7 cursor-pointer transition shrink-0"
        title="검색 후 클릭 → 오른쪽 상세 패널에 상품 정보 표시">
        <Info size={12} /> 정보확인
      </button>

      {/* 판매출고계 범위 필터 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[15px] font-bold text-ink tracking-tight shrink-0">판매출고계</span>
        <input type="number" min={0} value={salesQtyMin} onChange={e => setSalesQtyMin(e.target.value)} placeholder="최소"
          className="w-14 h-7 px-2 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint tabular-nums text-right transition" />
        <span className="text-zinc-400 text-[15px]">~</span>
        <input type="number" min={0} value={salesQtyMax} onChange={e => setSalesQtyMax(e.target.value)} placeholder="최대"
          className="w-14 h-7 px-2 text-[15px] border border-line rounded-md outline-none focus:ring-2 focus:ring-brand-tint tabular-nums text-right transition" />
        <span className="text-zinc-400 text-[15px]">개</span>
        {(salesQtyMin || salesQtyMax) && (
          <button onClick={() => { setSalesQtyMin(""); setSalesQtyMax(""); }}
            className="text-[14px] font-semibold text-rose-500 hover:text-rose-700 px-1.5 py-1 rounded-md hover:bg-rose-50 transition cursor-pointer border border-rose-200">초기화</button>
        )}
      </div>

      {/* 숨김관리 */}
      <button onClick={onOpenHiddenManagerModal}
        className="flex items-center gap-1 text-[15px] font-semibold text-zinc-500 bg-white border border-line hover:bg-zinc-50 hover:border-zinc-300 rounded-md px-2.5 h-7 cursor-pointer transition shrink-0"
        title="숨김 처리된 상품을 확인/해제">
        <EyeOff size={12} /> 숨김관리
      </button>

      {/* 분류 세그먼트 필터 */}
      <div className="flex flex-wrap bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
        {(["전체", "위탁", "선결제", "60회전", "90회전", "기타"] as const).map(cat => (
          <button key={cat} onClick={() => setFlowCategoryFilter(cat)}
            className={`h-7 px-2.5 text-[15px] font-semibold rounded transition cursor-pointer ${
              flowCategoryFilter === cat
                ? cat === "전체"   ? "bg-zinc-700 text-white shadow-sm"
                : cat === "위탁"   ? "bg-violet-500 text-white shadow-sm"
                : cat === "선결제" ? "bg-rose-500 text-white shadow-sm"
                : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                : cat === "90회전" ? "bg-teal-500 text-white shadow-sm"
                : "bg-zinc-500 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}>{cat}</button>
        ))}
      </div>

      {/* 새로고침 */}
      <button onClick={onFetchStockFlow} disabled={loading}
        className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
        title="새로고침">
        <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) HiddenManagerModal · 숨김 상품 관리 모달
// ═══════════════════════════════════════════════════════════════════════════

interface HiddenManagerModalProps {
  open: boolean;
  onClose: () => void;
  hiddenList: AnyProduct[];
  hiddenLoading: boolean;
  hiddenUnhideBusyCode: string | null;
  loadHiddenList: () => void;
  onUnhideProduct: (code: string) => void;
}

export const HiddenManagerModal: React.FC<HiddenManagerModalProps> = ({
  open, onClose, hiddenList, hiddenLoading, hiddenUnhideBusyCode,
  loadHiddenList, onUnhideProduct,
}) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      titleAccent
      icon={
        <div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
          <EyeOff size={18} className="text-white" />
        </div>
      }
      title={
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink tracking-tight">숨김 항목 관리</div>
          <div className="text-[13px] font-medium text-ink-soft mt-0.5">숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음</div>
        </div>
      }
    >
      <div className="flex flex-col gap-0 -m-5">
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-zinc-100 bg-white">
          <span className="text-[15px] font-bold text-zinc-500">총 <span className="text-amber-700 font-bold">{hiddenList.length}</span>개 숨김</span>
          <button onClick={loadHiddenList} disabled={hiddenLoading}
            className="text-[14px] font-bold text-zinc-500 hover:text-zinc-800 border border-line hover:border-zinc-400 rounded-lg px-2 py-1 cursor-pointer transition">
            {hiddenLoading ? "..." : "새로고침"}
          </button>
        </div>
        <div className="overflow-y-auto bg-zinc-50 max-h-[60vh]">
          {hiddenLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Spinner size={40} tone="orange" />
              <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
            </div>
          ) : hiddenList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-2">
              <EyeOff size={28} className="opacity-40" />
              <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
              <div className="text-[15px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 bg-white">
              {hiddenList.map((p) => {
                const code = String((p as any).product_code ?? "");
                const busy = hiddenUnhideBusyCode === code;
                return (
                  <li key={`hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-zinc-800 break-words leading-tight">{(p as any).product_name}</div>
                      <div className="text-[14px] tabular-nums text-zinc-400 break-words whitespace-normal leading-tight">
                        #{code}{(p as any).supplier ? ` · ${(p as any).supplier}` : ""}{(p as any).real_map ? ` · ${(p as any).real_map}` : ""}{(p as any).current_stock != null ? ` · 재고 ${(p as any).current_stock}` : ""}
                      </div>
                    </div>
                    <button onClick={() => onUnhideProduct(code)} disabled={busy}
                      className="shrink-0 flex items-center gap-1 text-[14px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition">
                      {busy ? <Spinner size={11} /> : <EyeOff size={11} />}
                      다시 표시
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) SupplierDetailModalWrapper · 공급사 상세 모달 wrapper
// ═══════════════════════════════════════════════════════════════════════════

interface SupplierDetailModalWrapperProps {
  vendor: any | null;
  onClose: () => void;
}

export const SupplierDetailModalWrapper: React.FC<SupplierDetailModalWrapperProps> = ({
  vendor, onClose,
}) => {
  // 2026-08-23 · #191 Phase A · Modal 프리미티브 이관 (v3.4)
  return (
    <Modal
      open={!!vendor}
      onClose={onClose}
      size="3xl"
      zIndex={100}
      bodyPadding="none"
      showClose={false}
      cardStyle={{ maxHeight: "90vh" }}
    >
      {vendor && (
        <VendorDetailModal
          vendor={vendor}
          onClose={onClose}
          onSaved={onClose}
        />
      )}
    </Modal>
  );
};
