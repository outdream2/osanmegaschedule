// src/components/ScanPage/PurchaseHistorySection.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · ProductInfoCard 에서 이관
// ═══════════════════════════════════════════════════════════════════════
// 매입 이력 섹션 (2026-07-15) · purchase_details 조회 · 최근 20건 매입 · 총합
// ═══════════════════════════════════════════════════════════════════════
// 프레임워크: Spinner · PurchaseHistoryList · apiClient
import React, { useEffect, useState } from "react";
import { TrendingUp, ChevronRight, ChevronDown } from "lucide-react";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { Spinner } from "../common/Spinner";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { fmtWonCompact } from "../../lib/format";

export const PurchaseHistorySection: React.FC<{ productCode: string; productName?: string; noBorderTop?: boolean }> = ({ productCode, productName, noBorderTop }) => {
  const { toast, showError } = useToast();
  const [rows, setRows] = useState<Array<PurchaseHistoryRow & { purchase_date: string; supplier_name: string | null; quantity: number; amount: number; total: number; unit_price: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!productCode) return;
    setLoading(true);
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ rows?: any[] }>(`/api/purchase-details?product_code=${encodeURIComponent(productCode)}&limit=200`)
      .then(({ data: j }) => setRows(Array.isArray(j?.rows) ? j.rows : []))
      .catch((err) => { setRows([]); showError(`매입이력 로드 실패: ${err instanceof Error ? err.message : String(err)}`); })
      .finally(() => setLoading(false));
  }, [productCode]);
  const fmt = (n: number) => n.toLocaleString();
  const fmtWon = fmtWonCompact;
  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
  // 2026-07-16 · 평균 매입 (건당 평균 매입액)
  const avgAmt = rows.length > 0 ? Math.round(totalAmt / rows.length) : 0;
  // 2026-07-16 · 평균 매입주기 (연속 매입일 간 평균 일수 · 정렬 후 diff)
  const avgCycleDays = (() => {
    if (rows.length < 2) return null;
    const dates = rows
      .map(r => (r.purchase_date ? new Date(String(r.purchase_date)).getTime() : NaN))
      .filter(t => Number.isFinite(t))
      .sort((a, b) => a - b);
    if (dates.length < 2) return null;
    let sum = 0;
    for (let i = 1; i < dates.length; i++) sum += (dates[i] - dates[i - 1]);
    return Math.round(sum / (dates.length - 1) / (1000 * 60 * 60 * 24));
  })();
  // 2026-07-29 · 공급사 컬럼 중복 제거 · 제목 아래 요약 표시 (반복 정보)
  const distinctSuppliers = Array.from(new Set(rows.map(r => (r.supplier_name ?? "").trim()).filter(Boolean)));
  const supplierSummary = distinctSuppliers.length === 0 ? null
    : distinctSuppliers.length === 1 ? distinctSuppliers[0]
    : `${distinctSuppliers[0]} 외 ${distinctSuppliers.length - 1}개사`;
  // 2026-07-29 · 월평균 주문 수량 (총 매입 수량 / 개월 수) · 첫~마지막 매입일 사이의 개월 수 기준
  const avgMonthlyQty = (() => {
    if (rows.length < 2) return null;
    const times = rows.map(r => r.purchase_date ? new Date(String(r.purchase_date)).getTime() : NaN).filter(t => Number.isFinite(t));
    if (times.length < 2) return null;
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const spanDays = Math.max(1, Math.round((maxT - minT) / (86400 * 1000)));
    const spanMonths = spanDays / 30;
    if (spanMonths <= 0) return null;
    return Math.round(totalQty / spanMonths);
  })();
  return (
    <div className={noBorderTop ? "" : "mt-3 border-t border-line pt-3"}>
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      {/* 2026-07-29 · 헤더 · 상품명·통계·화살표 별도 라인으로 정리 */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex flex-col gap-1 text-left hover:bg-zinc-50 -mx-2 px-2 py-1 rounded transition cursor-pointer"
      >
        {/* 1행 · 아이콘 · "매입 이력" 라벨 · 화살표 */}
        <div className="flex items-center gap-1.5">
          <TrendingUp size={13} className="text-emerald-600 shrink-0" />
          <span className="text-[13px] font-bold text-zinc-800">매입 이력</span>
          {productName && (
            <span className="text-[11px] font-semibold text-zinc-400 break-keep whitespace-normal leading-tight min-w-0 flex-1 line-clamp-1">
              {productName}
            </span>
          )}
          {collapsed
            ? <ChevronRight size={14} className="ml-auto text-zinc-400 shrink-0" />
            : <ChevronDown size={14} className="ml-auto text-zinc-600 shrink-0" />}
        </div>
        {/* 2행 · 통계 (건수 · 총량 · 총액 · 평균 · 주기) */}
        {loading ? (
          <span className="text-[11px] text-zinc-400"><Spinner size={10} tone="zinc" className="mr-1" />로딩...</span>
        ) : rows.length === 0 ? (
          <span className="text-[11px] text-zinc-400 italic">이력 없음</span>
        ) : (
          <div className="text-[11px] tabular-nums text-zinc-600 flex items-center gap-1.5 flex-wrap">
            <span className="font-bold">{rows.length}건</span>
            <span className="text-zinc-300">·</span>
            <span>총 <span className="font-bold text-zinc-800">{fmt(totalQty)}</span>개</span>
            <span className="text-zinc-300">·</span>
            <span className="text-emerald-700 font-bold">{fmtWon(totalAmt)}</span>
            {avgAmt > 0 && (<>
              <span className="text-zinc-300">·</span>
              <span title="건당 평균 매입액">평균 <span className="text-indigo-600 font-bold">{fmtWon(avgAmt)}</span></span>
            </>)}
            {avgCycleDays != null && (<>
              <span className="text-zinc-300">·</span>
              <span title="평균 매입주기">주기 <span className="text-sky-600 font-bold">{avgCycleDays}일</span></span>
            </>)}
          </div>
        )}
      </button>
      {/* 2026-07-29 · 제목 아래 공급사 (반복이라 컬럼에서 제거하고 여기로) + 월평균 주문 수량 · 이모지·배지 지양 */}
      {!collapsed && (supplierSummary || avgMonthlyQty != null) && (
        <div className="-mx-2 px-2 pb-1.5 flex items-center gap-2 flex-wrap text-[10px]">
          {supplierSummary && (
            <span className="text-zinc-500 font-semibold">공급사 <span className="font-bold text-sky-700">{supplierSummary}</span></span>
          )}
          {supplierSummary && avgMonthlyQty != null && <span className="text-zinc-300">·</span>}
          {avgMonthlyQty != null && (
            <span className="tabular-nums text-zinc-500 font-semibold" title="월평균 주문 수량 = 총 매입 수량 / (최초 매입일부터 최근 매입일까지의 개월수)">
              월평균 주문 <span className="font-bold text-indigo-700">{fmt(avgMonthlyQty)}</span>개
            </span>
          )}
        </div>
      )}
      {!collapsed && rows.length > 0 && (
        // 2026-08-04 · 공통 PurchaseHistoryList 사용 · 헤더 자동 정렬 + 매입 간격 표시
        <div className="border border-line rounded-lg overflow-hidden flex flex-col" style={{ maxHeight: "12rem" }}>
          <PurchaseHistoryList
            rows={rows.slice(0, 20)}
            showSupplier={false}
            showGap
            emptyText="이력 없음"
            footerHint={rows.length > 20 ? `최근 20건만 표시 · 전체 ${rows.length}건` : undefined}
          />
        </div>
      )}
    </div>
  );
};
