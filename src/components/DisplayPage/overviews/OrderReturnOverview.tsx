// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-09 · GLOBAL UI · 발주·반품 Single-Page Operations Console
//   · L2 폐기 · shortcut 폐기 · modal-first
//   · Real data · listOrderRequests · /api/order-history · /api/return-requests
//   · Row click → OrderDetailModal / ReturnDetailModal (domain-specific · action 포함)
//   · 담당자 이메일 · mailto fallback

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, ArrowsLeftRight, Warning, ShoppingCart, Plus, Buildings, EnvelopeSimple, CheckCircle } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  StoreStatusBadge, type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listOrderRequests, type OrderRequestRow } from "../../../lib/orderRequestsApi";
import { api } from "../../../lib/apiClient";
import { OrderDetailModal, type OrderDetailRow } from "./OrderDetailModal";
import { ReturnDetailModal, type ReturnRow } from "./ReturnDetailModal";

export interface OrderReturnOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

type AnyRow = Record<string, any>;

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab: _ }) => {
  const [orderReqs, setOrderReqs] = useState<OrderRequestRow[] | null>(null);
  const [history, setHistory] = useState<AnyRow[] | null>(null);
  const [returnsPending, setReturnsPending] = useState<AnyRow[] | null>(null);
  const [returnsDone, setReturnsDone] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [orderDetail, setOrderDetail] = useState<OrderDetailRow | null>(null);
  const [returnDetail, setReturnDetail] = useState<ReturnRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    listOrderRequests().then(r => { if (alive) setOrderReqs(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setOrderReqs([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`)
      .then(({ data }) => { if (alive) setHistory(Array.isArray(data?.orders) ? data!.orders! : []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=pending&limit=200`)
      .then(({ data }) => { if (alive) setReturnsPending(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsPending([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=done&limit=200`)
      .then(({ data }) => { if (alive) setReturnsDone(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsDone([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  const cutoff = Date.now() - Number(period) * 86400000;
  const q = search.trim().toLowerCase();
  const match = (hay: string) => !q || hay.toLowerCase().includes(q);

  const needRows = useMemo(() => {
    if (!orderReqs) return [];
    return orderReqs
      .filter(r => match(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`))
      .slice(0, 12);
  }, [orderReqs, q]);

  const historyRows = useMemo(() => {
    if (!history) return [];
    return history
      .filter(h => {
        const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
        const t = d ? new Date(d).getTime() : 0;
        if (t && t < cutoff) return false;
        return match(`${h.supplier ?? h.supplier_name ?? ""} ${h.order_no ?? h.po_no ?? ""}`);
      })
      .slice(0, 12);
  }, [history, q, cutoff]);

  const returnPendingRows = useMemo(() => {
    if (!returnsPending) return [];
    return returnsPending
      .filter(r => match(`${r.product_name ?? ""} ${r.supplier_name ?? r.supplier ?? ""}`))
      .slice(0, 10);
  }, [returnsPending, q]);

  const returnDoneRows = useMemo(() => {
    if (!returnsDone) return [];
    return returnsDone
      .filter(r => match(`${r.product_name ?? ""} ${r.supplier_name ?? r.supplier ?? ""}`))
      .slice(0, 10);
  }, [returnsDone, q]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openOrderDetail = useCallback((row: AnyRow) => {
    setOrderDetail({
      id: row.id, order_no: row.order_no ?? row.po_no,
      requested_at: row.order_date ?? row.requested_at ?? row.created_at,
      supplier: row.supplier, supplier_name: row.supplier_name, supplier_email: row.supplier_email,
      staff_name: row.staff_name, status: row.status, receiving_status: row.receiving_status,
      note: row.note, items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code, product_name: row.product_name,
      order_qty: row.order_qty, current_stock: row.current_stock,
      total_amount: row.total_amount,
    });
  }, []);

  const openReturnDetail = useCallback((row: AnyRow) => {
    setReturnDetail({
      id: row.id, product_name: row.product_name, product_code: row.product_code,
      supplier: row.supplier, supplier_name: row.supplier_name, supplier_email: row.supplier_email,
      qty: row.qty, quantity: row.quantity, reason: row.reason,
      status: row.status, created_at: row.created_at, note: row.note,
    });
  }, []);

  const resetFilters = useCallback(() => { setSearch(""); setPeriod("14"); }, []);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const historyColumns: OverviewTableColumn[] = [
    { key: "when", label: "일시" },
    { key: "order_no", label: "발주번호" },
    { key: "supplier", label: "공급사" },
    { key: "items", label: "품목", align: "right" },
    { key: "amount", label: "금액", align: "right" },
    { key: "status", label: "상태", align: "center" },
  ];
  const historyData = historyRows.map(h => ({
    when: String(h.order_date ?? h.created_at ?? h.requested_at ?? "").slice(0, 10) || "-",
    order_no: h.order_no ?? h.po_no ?? "-",
    supplier: h.supplier ?? h.supplier_name ?? "-",
    items: h.item_count ?? h.items_count ?? (Array.isArray(h.items) ? h.items.length : "-"),
    amount: h.total_amount != null ? Number(h.total_amount).toLocaleString() : "-",
    status: h.receiving_status ?? h.status ?? "-",
    __onClick: () => openOrderDetail(h),
  }));

  const needColumns: OverviewTableColumn[] = [
    { key: "product", label: "상품" },
    { key: "supplier", label: "공급사" },
    { key: "stock", label: "현재고", align: "right" },
    { key: "need", label: "필요수량", align: "right" },
  ];
  const needData = needRows.map(r => ({
    product: (
      <div className="flex flex-col">
        <span className="font-medium">{r.product_name ?? "-"}</span>
        <span className="text-[12px] text-ink-soft tabular-nums">{r.product_code ?? ""}</span>
      </div>
    ),
    supplier: r.supplier ?? "-",
    stock: r.current_stock ?? "-",
    need: <span className="font-semibold text-brand-deep">{r.order_qty ?? "-"}</span>,
    __onClick: () => openOrderDetail(r),
  }));

  const returnPendingData = returnPendingRows.map(r => ({
    product: (
      <div className="flex flex-col">
        <span className="font-medium">{r.product_name ?? "-"}</span>
        <span className="text-[12px] text-ink-soft">{r.reason ?? ""}</span>
      </div>
    ),
    supplier: r.supplier_name ?? r.supplier ?? "-",
    qty: <span className="font-semibold text-rose-600">{r.qty ?? r.quantity ?? "-"}</span>,
    __onClick: () => openReturnDetail(r),
  }));

  const returnDoneData = returnDoneRows.map(r => ({
    product: (
      <div className="flex flex-col">
        <span className="font-medium">{r.product_name ?? "-"}</span>
        <span className="text-[12px] text-ink-soft">{String(r.created_at ?? "").slice(0, 10)}</span>
      </div>
    ),
    supplier: r.supplier_name ?? r.supplier ?? "-",
    qty: <span className="font-semibold text-emerald-600">{r.qty ?? r.quantity ?? "-"}</span>,
    __onClick: () => openReturnDetail(r),
  }));

  const returnColumns: OverviewTableColumn[] = [
    { key: "product", label: "상품" },
    { key: "supplier", label: "공급사" },
    { key: "qty", label: "수량", align: "right" },
  ];

  const mailtoReconciliation = `mailto:?subject=${encodeURIComponent("[발주·매입 대조 확인 요청]")}&body=${encodeURIComponent("안녕하세요.\n\n발주·매입 대조 과정에서 확인이 필요한 항목이 발견되었습니다.\n\n확인 부탁드립니다.")}`;

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader
        title="발주·반품"
        description="오늘 처리해야 할 발주·반품 업무를 한 페이지에서 처리합니다"
      />

      <OverviewToolbar
        search={search}
        onSearch={setSearch}
        placeholder="상품·코드·공급사·발주번호 검색"
        right={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
              className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
              <option value="7">최근 7일</option>
              <option value="14">최근 14일</option>
              <option value="30">최근 30일</option>
            </select>
            <button type="button" onClick={resetFilters}
              className="h-10 px-3 text-[14px] font-medium text-ink-soft border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">
              초기화
            </button>
            <button type="button" onClick={refresh}
              className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">
              새로고침
            </button>
          </>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<ShoppingCart size={18} weight="fill" />} label="발주 요청" value={kpiValue(orderReqs?.length)} unit="건" tone="brand" hint="처리 대기" />
        <OverviewKpi icon={<Package size={18} weight="fill" />} label="발주 이력" value={kpiValue(history?.length)} unit="건" tone="neutral" hint="누적" />
        <OverviewKpi icon={<ArrowsLeftRight size={18} weight="fill" />} label="반품 필요" value={kpiValue(returnsPending?.length)} unit="건" tone="rose" hint="처리 대기" />
        <OverviewKpi icon={<CheckCircle size={18} weight="fill" />} label="반품 확정" value={kpiValue(returnsDone?.length)} unit="건" tone="emerald" hint="처리 완료" />
      </div>

      {/* 발주 필요 + 반품 필요 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <OverviewSection
          title={<span>발주 필요 <span className="ml-2 text-[13px] font-medium text-ink-soft">{needRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={needColumns} rows={needData} emptyMessage={orderReqs == null ? "불러오는 중..." : "현재 발주가 필요한 상품이 없습니다"} />
        </OverviewSection>

        <OverviewSection
          title={<span>반품 필요 <span className="ml-2 text-[13px] font-medium text-ink-soft">{returnPendingRows.length}건</span></span>}
        >
          <OverviewTable columns={returnColumns} rows={returnPendingData} emptyMessage={returnsPending == null ? "불러오는 중..." : "현재 반품할 상품이 없습니다"} />
        </OverviewSection>
      </div>

      {/* 최근 발주이력 · full width */}
      <div className="px-4 sm:px-6">
        <OverviewSection
          title={<span>최근 발주이력 <span className="ml-2 text-[13px] font-medium text-ink-soft">최근 {period}일 · {historyRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={historyColumns} rows={historyData} emptyMessage={history == null ? "불러오는 중..." : "선택 기간의 발주이력이 없습니다"} />
        </OverviewSection>
      </div>

      {/* 발주·매입 대조 이상 + 반품 확정 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OverviewSection
          title={<span>발주·매입 대조 이상 <span className="ml-2 text-[13px] font-medium text-ink-soft">신규 anomaly endpoint 미확인</span></span>}
          action={
            <a href={mailtoReconciliation}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-md text-[13px] font-semibold text-brand-deep border border-brand-deep/20 bg-brand-tint/40 hover:bg-brand-tint/70 cursor-pointer transition-colors">
              <EnvelopeSimple size={13} weight="fill" /> 담당자 이메일
            </a>
          }
        >
          <div className="flex flex-col gap-2 text-[14px]">
            <div className="flex items-center gap-3 p-3 border border-amber-200 bg-amber-50 rounded-lg">
              <Warning size={18} className="text-amber-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-amber-800">발주·매입 대조 결과 확인 필요</div>
                <div className="text-[12px] text-amber-700 mt-0.5">발주금액 vs 매입금액 불일치 · 수량/단가/미입고/공급사</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 border border-rose-200 bg-rose-50 rounded-lg">
              <Warning size={18} className="text-rose-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-rose-800">이상 품목 리뷰</div>
                <div className="text-[12px] text-rose-700 mt-0.5">수량·단가·공급사 불일치 발주 건을 담당자에게 확인 요청</div>
              </div>
            </div>
            <div className="text-[12px] text-ink-soft mt-1">
              <Buildings size={12} className="inline mr-1" />
              기존 발주·매입 대조 상세 로직은 발주 상세 Modal 안에서 확인 가능 (해당 발주에 reconciliation 데이터가 있을 때)
            </div>
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>반품 확정 <span className="ml-2 text-[13px] font-medium text-ink-soft">{returnDoneRows.length}건</span></span>}
        >
          <OverviewTable columns={returnColumns} rows={returnDoneData} emptyMessage={returnsDone == null ? "불러오는 중..." : "확정된 반품이 없습니다"} />
        </OverviewSection>
      </div>

      {/* Page action */}
      <div className="px-4 sm:px-6">
        <button type="button" onClick={() => setOrderDetail({ id: "new", status: "pending" })}
          disabled
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[14px] font-semibold bg-slate-100 text-slate-400 cursor-not-allowed"
          title="발주 등록은 기존 발주 메뉴에서 처리 (추후 Modal 통합 예정)">
          <Plus size={14} weight="bold" /> 발주 등록 (상세 메뉴)
        </button>
      </div>

      <OrderDetailModal open={orderDetail != null} onClose={() => setOrderDetail(null)} order={orderDetail} />
      <ReturnDetailModal open={returnDetail != null} onClose={() => setReturnDetail(null)} row={returnDetail} onChanged={refresh} />
    </div>
  );
};

export default OrderReturnOverview;
