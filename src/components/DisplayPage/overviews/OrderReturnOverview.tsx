// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-08 · GLOBAL UI · 발주·반품 Operations Console (final redesign)
//   · List-first · no chart · Modal drilldown · 담당자 이메일 handoff (mailto fallback)
//   · L2 Line Tabs 4개 · 현황 · 발주 · 반품 · 대조·이상
//   · Data · listOrderRequests (orderRequestsApi) · /api/order-history · /api/return-requests
//   · Overview = presentation + navigation · mutation 0 · 신규 API/calculation 0

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, ArrowsLeftRight, Warning, ShoppingCart, EnvelopeSimple, Plus } from "@phosphor-icons/react";
import { Buildings } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";
import { listOrderRequests, type OrderRequestRow } from "../../../lib/orderRequestsApi";
import { api } from "../../../lib/apiClient";
import { OrderDetailModal, type OrderDetailRow } from "./OrderDetailModal";

export interface OrderReturnOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

const L2_TABS = [
  { key: "overview", label: "현황" },
  { key: "order", label: "발주" },
  { key: "return", label: "반품" },
  { key: "reconciliation", label: "대조·이상" },
];

type ReturnRow = Record<string, any>;
type OrderHistoryRow = Record<string, any>;

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab }) => {
  const [orderReqs, setOrderReqs] = useState<OrderRequestRow[] | null>(null);
  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [history, setHistory] = useState<OrderHistoryRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [selected, setSelected] = useState<OrderDetailRow | null>(null);

  // 발주 요청 pending · listOrderRequests
  useEffect(() => {
    let alive = true;
    listOrderRequests()
      .then(rows => { if (alive) setOrderReqs(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setOrderReqs([]); });
    return () => { alive = false; };
  }, []);

  // 반품 pending · /api/return-requests?status=pending
  useEffect(() => {
    let alive = true;
    api.get<{ rows?: ReturnRow[] } | ReturnRow[]>(`/api/return-requests?status=pending&limit=200`)
      .then(({ data }) => {
        if (!alive) return;
        setReturns(Array.isArray(data) ? data : (data?.rows ?? []));
      })
      .catch(() => { if (alive) setReturns([]); });
    return () => { alive = false; };
  }, []);

  // 최근 발주이력 · /api/order-history (period 월 단위 미지원 가능 · 전체 fetch 후 frontend 필터)
  useEffect(() => {
    let alive = true;
    api.get<{ orders?: OrderHistoryRow[] }>(`/api/order-history`)
      .then(({ data }) => {
        if (!alive) return;
        setHistory(Array.isArray(data?.orders) ? (data!.orders as OrderHistoryRow[]) : []);
      })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, []);

  // 필요 필터 (최근 N일 · search)
  const periodMs = Number(period) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - periodMs;

  const needRows = useMemo(() => {
    if (!orderReqs) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? orderReqs.filter(r =>
          (r.product_name ?? "").toLowerCase().includes(q) ||
          (r.product_code ?? "").toLowerCase().includes(q) ||
          (r.supplier ?? "").toLowerCase().includes(q))
      : orderReqs;
    return filtered.slice(0, 10);
  }, [orderReqs, search]);

  const returnRows = useMemo(() => {
    if (!returns) return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? returns.filter(r =>
          String(r.product_name ?? "").toLowerCase().includes(q) ||
          String(r.supplier_name ?? r.supplier ?? "").toLowerCase().includes(q))
      : returns;
    return filtered.slice(0, 10);
  }, [returns, search]);

  const historyRows = useMemo(() => {
    if (!history) return [];
    const q = search.trim().toLowerCase();
    return history
      .filter(h => {
        const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
        const t = d ? new Date(d).getTime() : 0;
        if (t && t < cutoff) return false;
        if (!q) return true;
        return String(h.supplier ?? h.supplier_name ?? "").toLowerCase().includes(q)
            || String(h.order_no ?? h.po_no ?? "").toLowerCase().includes(q);
      })
      .slice(0, 10);
  }, [history, search, cutoff]);

  // KPI counts
  const kpiNeed = orderReqs?.length ?? null;
  const kpiReturn = returns?.length ?? null;
  const kpiHistoryTotal = history?.length ?? null;
  const kpiAnomaly: number | null = null; // 대조이상 standalone endpoint 미확인 · placeholder

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openOrderDetail = useCallback((row: any) => {
    setSelected({
      id: row.id,
      order_no: row.order_no ?? row.po_no,
      requested_at: row.order_date ?? row.requested_at ?? row.created_at,
      supplier: row.supplier,
      supplier_name: row.supplier_name,
      supplier_email: row.supplier_email,
      staff_name: row.staff_name,
      status: row.status,
      receiving_status: row.receiving_status,
      note: row.note,
      items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code,
      product_name: row.product_name,
      order_qty: row.order_qty,
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearch("");
    setPeriod("14");
  }, []);

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow
        active="overview"
        tabs={L2_TABS}
        onSelect={(k) => {
          if (k === "overview") return;
          if (k === "return") onSelectSubTab("return");
          else onSelectSubTab("purchase-order"); // 발주 · 대조·이상 모두 OrderManagePage 발주 top tab
        }}
      />

      <OverviewToolbar
        search={search}
        onSearch={setSearch}
        placeholder="상품명·코드·공급사 검색"
        right={
          <>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="h-9 px-2.5 text-[13px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint"
            >
              <option value="7">최근 7일</option>
              <option value="14">최근 14일</option>
              <option value="30">최근 30일</option>
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="h-9 px-3 text-[13px] font-medium text-ink-soft border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors"
            >
              초기화
            </button>
          </>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Package size={16} weight="fill" />} label="발주 필요" value={kpiValue(kpiNeed)} unit="건" tone="brand" hint="처리 대기" />
        <OverviewKpi icon={<ShoppingCart size={16} weight="fill" />} label="발주 이력" value={kpiValue(kpiHistoryTotal)} unit="건" tone="neutral" hint="누적" />
        <OverviewKpi icon={<ArrowsLeftRight size={16} weight="fill" />} label="반품 필요" value={kpiValue(kpiReturn)} unit="건" tone="rose" hint="처리 대기" />
        <OverviewKpi icon={<Warning size={16} weight="fill" />} label="대조 이상" value={kpiValue(kpiAnomaly)} unit="건" tone="amber" hint="대조 메뉴 확인" />
      </div>

      {/* Row 1 · 발주 필요 (70%) + 반품 필요 (30%) */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title={<span>발주 필요 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">{needRows.length}건</span></span>}
          action={
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onSelectSubTab("purchase-order")}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] cursor-pointer transition-colors">
                <Plus size={12} weight="bold" /> 발주 등록
              </button>
              <button type="button" onClick={() => onSelectSubTab("purchase-order")}
                className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 px-2 text-left text-[11px] font-semibold text-ink-soft uppercase tracking-wider">상품</th>
                  <th className="py-2 px-2 text-left text-[11px] font-semibold text-ink-soft uppercase tracking-wider">공급사</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-ink-soft uppercase tracking-wider">현재고</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-ink-soft uppercase tracking-wider">필요수량</th>
                </tr>
              </thead>
              <tbody>
                {orderReqs == null ? (
                  <tr><td colSpan={4} className="py-6 text-center text-[12px] text-ink-soft/70">로딩 중…</td></tr>
                ) : needRows.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-[12px] text-ink-soft/70">현재 발주가 필요한 상품이 없습니다</td></tr>
                ) : needRows.map(r => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                      onClick={() => openOrderDetail(r)}>
                    <td className="py-2.5 px-2 text-ink">
                      <div className="font-medium truncate">{r.product_name ?? "-"}</div>
                      <div className="text-[10px] text-ink-soft tabular-nums">{r.product_code ?? ""}</div>
                    </td>
                    <td className="py-2.5 px-2 text-ink-soft truncate">{r.supplier ?? "-"}</td>
                    <td className="py-2.5 px-2 text-right text-ink tabular-nums">{r.current_stock ?? "-"}</td>
                    <td className="py-2.5 px-2 text-right text-brand-deep font-semibold tabular-nums">{r.order_qty ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>반품 필요 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">{returnRows.length}건</span></span>}
          action={
            <button type="button" onClick={() => onSelectSubTab("return")}
              className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
          }
        >
          <div className="flex flex-col gap-0.5">
            {returns == null ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">로딩 중…</div>
            ) : returnRows.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">현재 반품할 상품이 없습니다</div>
            ) : returnRows.map((r, i) => (
              <button key={r.id ?? i} type="button"
                onClick={() => onSelectSubTab("return")}
                className="flex items-center gap-2 px-2 h-10 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
                <ArrowsLeftRight size={14} className="text-rose-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{r.product_name ?? "-"}</div>
                  <div className="text-[11px] text-ink-soft truncate">{r.supplier_name ?? r.supplier ?? "-"}</div>
                </div>
                <span className="text-[12px] font-bold text-rose-600 tabular-nums">{r.qty ?? r.quantity ?? "-"}</span>
              </button>
            ))}
          </div>
        </OverviewSection>
      </div>

      {/* Row 2 · 최근 발주이력 (70%) + 대조·이상 (30%) */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title={<span>최근 발주이력 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">최근 {period}일 · {historyRows.length}건</span></span>}
          action={
            <button type="button" onClick={() => onSelectSubTab("purchase-order")}
              className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 px-2 text-left text-[11px] font-semibold text-ink-soft uppercase tracking-wider">발주일</th>
                  <th className="py-2 px-2 text-left text-[11px] font-semibold text-ink-soft uppercase tracking-wider">발주번호</th>
                  <th className="py-2 px-2 text-left text-[11px] font-semibold text-ink-soft uppercase tracking-wider">공급사</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-ink-soft uppercase tracking-wider">품목</th>
                  <th className="py-2 px-2 text-right text-[11px] font-semibold text-ink-soft uppercase tracking-wider">금액</th>
                  <th className="py-2 px-2 text-center text-[11px] font-semibold text-ink-soft uppercase tracking-wider">상태</th>
                </tr>
              </thead>
              <tbody>
                {history == null ? (
                  <tr><td colSpan={6} className="py-6 text-center text-[12px] text-ink-soft/70">로딩 중…</td></tr>
                ) : historyRows.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-[12px] text-ink-soft/70">선택 기간의 발주이력이 없습니다</td></tr>
                ) : historyRows.map((h, i) => (
                  <tr key={h.id ?? h.order_no ?? i}
                      className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                      onClick={() => openOrderDetail(h)}>
                    <td className="py-2.5 px-2 text-ink tabular-nums">{String(h.order_date ?? h.created_at ?? h.requested_at ?? "").slice(0, 10) || "-"}</td>
                    <td className="py-2.5 px-2 text-ink tabular-nums">{h.order_no ?? h.po_no ?? "-"}</td>
                    <td className="py-2.5 px-2 text-ink-soft truncate">{h.supplier ?? h.supplier_name ?? "-"}</td>
                    <td className="py-2.5 px-2 text-right text-ink tabular-nums">{h.item_count ?? h.items_count ?? (Array.isArray(h.items) ? h.items.length : "-")}</td>
                    <td className="py-2.5 px-2 text-right text-ink font-semibold tabular-nums">{h.total_amount != null ? Number(h.total_amount).toLocaleString() : "-"}</td>
                    <td className="py-2.5 px-2 text-center text-[11px] text-ink-soft">{h.receiving_status ?? h.status ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>발주·매입 대조 이상 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">상세 메뉴 확인</span></span>}
          action={
            <button type="button" onClick={() => onSelectSubTab("purchase-order")}
              className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <button type="button"
              onClick={() => onSelectSubTab("purchase-order")}
              className="flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
              <Warning size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink">발주·매입 대조</div>
                <div className="text-[11px] text-ink-soft">OrderManage · 대조 메뉴에서 상세 확인</div>
              </div>
            </button>
            <button type="button"
              onClick={() => onSelectSubTab("purchase-order")}
              className="flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
              <Warning size={14} className="text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-ink">이상 목록</div>
                <div className="text-[11px] text-ink-soft">수량·단가·미입고 등</div>
              </div>
            </button>
            <div className="border-t border-slate-100 mt-1 pt-2">
              <a href="mailto:?subject=%5B%EB%B0%9C%EC%A3%BC%C2%B7%EB%A7%A4%EC%9E%85%20%EB%8C%80%EC%A1%B0%20%ED%99%95%EC%9D%B8%20%EC%9A%94%EC%B2%AD%5D&body=%EC%95%88%EB%85%95%ED%95%98%EC%84%B8%EC%9A%94.%0A%0A%EB%B0%9C%EC%A3%BC%C2%B7%EB%A7%A4%EC%9E%85%20%EB%8C%80%EC%A1%B0%20%EA%B3%BC%EC%A0%95%EC%97%90%EC%84%9C%20%ED%99%95%EC%9D%B8%EC%9D%B4%20%ED%95%84%EC%9A%94%ED%95%9C%20%ED%95%AD%EB%AA%A9%EC%9D%B4%20%EB%B0%9C%EA%B2%AC%EB%90%98%EC%97%88%EC%8A%B5%EB%8B%88%EB%8B%A4.%0A%0A%ED%99%95%EC%9D%B8%20%EB%B6%80%ED%83%81%EB%93%9C%EB%A6%BD%EB%8B%88%EB%8B%A4."
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-semibold text-brand-deep border border-brand-deep/20 bg-brand-tint/40 hover:bg-brand-tint/70 cursor-pointer transition-colors w-full justify-center">
                <EnvelopeSimple size={13} weight="fill" /> 담당자 이메일 작성
              </a>
            </div>
            <div className="flex items-start gap-2 px-2 py-1 text-[11px] text-ink-soft/70">
              <Buildings size={12} className="shrink-0 mt-0.5" />
              <span>상세 이상 항목은 발주 · 매입 대조 메뉴에서 확인 후 담당자별 이메일 발송 가능</span>
            </div>
          </div>
        </OverviewSection>
      </div>

      <OrderDetailModal
        open={selected != null}
        onClose={() => setSelected(null)}
        order={selected}
      />
    </div>
  );
};

export default OrderReturnOverview;
