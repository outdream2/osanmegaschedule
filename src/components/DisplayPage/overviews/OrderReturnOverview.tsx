// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-09 · GLOBAL UI · 발주·반품 통합 대시보드 (Unified Operations Console)
//   · 사용자 최종 지시 · 모든 하위 기능을 Overview 단일 대시보드에 섹션으로 배치
//   · 각 섹션 row click → OrderDetailModal · 별도 L2/L3 탭 없음
//   · 섹션: 발주요청 · 발주필요 · 발주이력 · 발주·매입대조 · 이상목록 · 품절임박 · 반품필요 · 반품확정
//   · Deep link 보존 (purchase-order · return 등) · OrderManagePage 자체 touch 0

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, ArrowsLeftRight, Warning, ShoppingCart, EnvelopeSimple, Plus, Buildings, ClockCountdown, CheckCircle } from "@phosphor-icons/react";
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

type AnyRow = Record<string, any>;

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab }) => {
  const [orderReqs, setOrderReqs] = useState<OrderRequestRow[] | null>(null);
  const [history, setHistory] = useState<AnyRow[] | null>(null);
  const [returnsPending, setReturnsPending] = useState<AnyRow[] | null>(null);
  const [returnsDone, setReturnsDone] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [selected, setSelected] = useState<OrderDetailRow | null>(null);

  // 발주 요청 · listOrderRequests
  useEffect(() => {
    let alive = true;
    listOrderRequests()
      .then(r => { if (alive) setOrderReqs(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setOrderReqs([]); });
    return () => { alive = false; };
  }, []);

  // 발주이력 · /api/order-history
  useEffect(() => {
    let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`)
      .then(({ data }) => { if (alive) setHistory(Array.isArray(data?.orders) ? data!.orders! : []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, []);

  // 반품 pending
  useEffect(() => {
    let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=pending&limit=200`)
      .then(({ data }) => { if (alive) setReturnsPending(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsPending([]); });
    return () => { alive = false; };
  }, []);

  // 반품 확정
  useEffect(() => {
    let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=done&limit=200`)
      .then(({ data }) => { if (alive) setReturnsDone(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsDone([]); });
    return () => { alive = false; };
  }, []);

  // Period filter · recent N days
  const cutoff = Date.now() - Number(period) * 86400000;

  const matchSearch = (hay: string, q: string) => !q || hay.toLowerCase().includes(q.toLowerCase());

  const needOrderRows = useMemo(() => {
    if (!orderReqs) return [];
    const q = search.trim();
    return orderReqs
      .filter(r => matchSearch(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`, q))
      .slice(0, 6);
  }, [orderReqs, search]);

  const historyRows = useMemo(() => {
    if (!history) return [];
    const q = search.trim();
    return history
      .filter(h => {
        const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
        const t = d ? new Date(d).getTime() : 0;
        if (t && t < cutoff) return false;
        return matchSearch(`${h.supplier ?? h.supplier_name ?? ""} ${h.order_no ?? h.po_no ?? ""}`, q);
      })
      .slice(0, 6);
  }, [history, search, cutoff]);

  const returnPendingRows = useMemo(() => {
    if (!returnsPending) return [];
    const q = search.trim();
    return returnsPending
      .filter(r => matchSearch(`${r.product_name ?? ""} ${r.supplier_name ?? r.supplier ?? ""}`, q))
      .slice(0, 6);
  }, [returnsPending, search]);

  const returnDoneRows = useMemo(() => {
    if (!returnsDone) return [];
    const q = search.trim();
    return returnsDone
      .filter(r => matchSearch(`${r.product_name ?? ""} ${r.supplier_name ?? r.supplier ?? ""}`, q))
      .slice(0, 6);
  }, [returnsDone, search]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openDetail = useCallback((row: AnyRow) => {
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
      note: row.note ?? row.reason,
      items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code,
      product_name: row.product_name,
      order_qty: row.order_qty ?? row.qty ?? row.quantity,
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearch("");
    setPeriod("14");
  }, []);

  // ─── Section row helper · click → Modal ────────────────────────────
  const sectionRow = (opts: {
    key: string;
    icon: React.ReactNode;
    title: string;
    sub?: string;
    rightLabel?: string;
    tone?: "neutral" | "brand" | "amber" | "rose" | "emerald" | "violet";
    onClick: () => void;
  }) => (
    <button key={opts.key} type="button" onClick={opts.onClick}
      className="w-full flex items-center gap-2 px-2 h-10 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
      <span className="shrink-0 text-ink-soft">{opts.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-ink truncate">{opts.title}</div>
        {opts.sub && <div className="text-[11px] text-ink-soft truncate">{opts.sub}</div>}
      </div>
      {opts.rightLabel && (
        <span className={`text-[12px] font-bold tabular-nums shrink-0 ${
          opts.tone === "brand" ? "text-brand-deep" :
          opts.tone === "amber" ? "text-amber-700" :
          opts.tone === "rose" ? "text-rose-600" :
          opts.tone === "emerald" ? "text-emerald-700" :
          opts.tone === "violet" ? "text-violet-700" :
          "text-ink-soft"
        }`}>{opts.rightLabel}</span>
      )}
    </button>
  );

  const sectionAction = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick}
      className="text-[12px] font-semibold text-brand-deep hover:underline">
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      {/* L2 Line Tabs · 현황 단일 (사용자 지시 · 모든 하위 통합) */}
      <OverviewL2TabsRow
        active="overview"
        tabs={[{ key: "overview", label: "현황" }]}
        onSelect={() => { /* overview only */ }}
      />

      <OverviewToolbar
        search={search}
        onSearch={setSearch}
        placeholder="상품명·코드·공급사·발주번호 검색"
        right={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
              className="h-9 px-2.5 text-[13px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
              <option value="7">최근 7일</option>
              <option value="14">최근 14일</option>
              <option value="30">최근 30일</option>
            </select>
            <button type="button" onClick={resetFilters}
              className="h-9 px-3 text-[13px] font-medium text-ink-soft border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">
              초기화
            </button>
          </>
        }
      />

      {/* KPI 4개 · real counts */}
      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<ShoppingCart size={16} weight="fill" />} label="발주 요청" value={kpiValue(orderReqs?.length)} unit="건" tone="brand" hint="처리 대기" />
        <OverviewKpi icon={<Package size={16} weight="fill" />} label="발주 이력" value={kpiValue(history?.length)} unit="건" tone="neutral" hint="누적" />
        <OverviewKpi icon={<ArrowsLeftRight size={16} weight="fill" />} label="반품 필요" value={kpiValue(returnsPending?.length)} unit="건" tone="rose" hint="처리 대기" />
        <OverviewKpi icon={<CheckCircle size={16} weight="fill" />} label="반품 확정" value={kpiValue(returnsDone?.length)} unit="건" tone="emerald" hint="최근 처리" />
      </div>

      {/* Row 1 · 발주요청 + 발주필요 + 품절임박 (3-col) */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OverviewSection
          title={<span>발주요청 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">{orderReqs?.length ?? 0}건</span></span>}
          action={sectionAction("전체보기", () => onSelectSubTab("purchase-order"))}
        >
          <div className="flex flex-col gap-0.5">
            {orderReqs == null ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">로딩 중…</div>
            ) : needOrderRows.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">발주 요청이 없습니다</div>
            ) : needOrderRows.map(r => sectionRow({
              key: String(r.id),
              icon: <ShoppingCart size={14} />,
              title: r.product_name ?? "-",
              sub: `${r.supplier ?? "-"} · 재고 ${r.current_stock ?? "-"}`,
              rightLabel: r.order_qty != null ? `${r.order_qty}` : "-",
              tone: "brand",
              onClick: () => openDetail(r),
            }))}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>발주필요 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">상세 메뉴 확인</span></span>}
          action={sectionAction("상세", () => onSelectSubTab("purchase-order"))}
        >
          <div className="flex flex-col gap-0.5">
            {sectionRow({
              key: "need-shortcut-1",
              icon: <Package size={14} className="text-amber-600" />,
              title: "부족 재고 상품 조회",
              sub: "재고 임계 기반 발주 필요 목록",
              rightLabel: "열기",
              tone: "amber",
              onClick: () => onSelectSubTab("purchase-order"),
            })}
            {sectionRow({
              key: "need-shortcut-2",
              icon: <Buildings size={14} />,
              title: "공급사별 발주 작성",
              sub: "선택 발주 · 공급사별 발주",
              rightLabel: "열기",
              tone: "neutral",
              onClick: () => onSelectSubTab("purchase-order"),
            })}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>품절임박 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">상세 메뉴 확인</span></span>}
          action={sectionAction("상세", () => onSelectSubTab("purchase-order"))}
        >
          <div className="flex flex-col gap-0.5">
            {sectionRow({
              key: "critical-shortcut-1",
              icon: <ClockCountdown size={14} className="text-rose-500" />,
              title: "현재고 ≤ 적정재고 10%",
              sub: "품절임박 상품 전체 조회",
              rightLabel: "열기",
              tone: "rose",
              onClick: () => onSelectSubTab("purchase-order"),
            })}
          </div>
        </OverviewSection>
      </div>

      {/* Row 2 · 발주이력 (full width) */}
      <div className="px-4 sm:px-6">
        <OverviewSection
          title={<span>최근 발주이력 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">최근 {period}일 · {historyRows.length}건</span></span>}
          action={sectionAction("발주이력 전체", () => onSelectSubTab("purchase-order"))}
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
                      onClick={() => openDetail(h)}>
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
      </div>

      {/* Row 3 · 발주매입대조 + 이상목록 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OverviewSection
          title={<span>발주·매입 대조 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">상세 메뉴 확인</span></span>}
          action={sectionAction("대조결과 전체", () => onSelectSubTab("purchase-order"))}
        >
          <div className="flex flex-col gap-0.5">
            {sectionRow({
              key: "recon-1",
              icon: <Package size={14} className="text-amber-600" />,
              title: "발주·매입 대조 결과",
              sub: "발주금액 vs 매입금액 비교",
              rightLabel: "열기",
              tone: "amber",
              onClick: () => onSelectSubTab("purchase-order"),
            })}
            <div className="border-t border-slate-100 mt-1 pt-2">
              <a href="mailto:?subject=%5B%EB%B0%9C%EC%A3%BC%C2%B7%EB%A7%A4%EC%9E%85%20%EB%8C%80%EC%A1%B0%20%ED%99%95%EC%9D%B8%20%EC%9A%94%EC%B2%AD%5D&body=%EC%95%88%EB%85%95%ED%95%98%EC%84%B8%EC%9A%94.%0A%0A%EB%B0%9C%EC%A3%BC%C2%B7%EB%A7%A4%EC%9E%85%20%EB%8C%80%EC%A1%B0%20%EA%B3%BC%EC%A0%95%EC%97%90%EC%84%9C%20%ED%99%95%EC%9D%B8%EC%9D%B4%20%ED%95%84%EC%9A%94%ED%95%9C%20%ED%95%AD%EB%AA%A9%EC%9D%B4%20%EB%B0%9C%EA%B2%AC%EB%90%98%EC%97%88%EC%8A%B5%EB%8B%88%EB%8B%A4.%0A%0A%ED%99%95%EC%9D%B8%20%EB%B6%80%ED%83%81%EB%93%9C%EB%A6%BD%EB%8B%88%EB%8B%A4."
                className="inline-flex items-center justify-center gap-1 h-8 px-2.5 w-full rounded-md text-[12px] font-semibold text-brand-deep border border-brand-deep/20 bg-brand-tint/40 hover:bg-brand-tint/70 cursor-pointer transition-colors">
                <EnvelopeSimple size={13} weight="fill" /> 담당자 이메일 작성
              </a>
            </div>
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>이상목록 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">상세 메뉴 확인</span></span>}
          action={sectionAction("이상 전체", () => onSelectSubTab("purchase-order"))}
        >
          <div className="flex flex-col gap-0.5">
            {sectionRow({
              key: "except-1",
              icon: <Warning size={14} className="text-rose-500" />,
              title: "수량 불일치 · 단가 불일치",
              sub: "발주와 매입 데이터 불일치",
              rightLabel: "열기",
              tone: "rose",
              onClick: () => onSelectSubTab("purchase-order"),
            })}
            {sectionRow({
              key: "except-2",
              icon: <Warning size={14} className="text-amber-500" />,
              title: "미입고 · 공급사 불일치",
              sub: "확인 필요 항목",
              rightLabel: "열기",
              tone: "amber",
              onClick: () => onSelectSubTab("purchase-order"),
            })}
          </div>
        </OverviewSection>
      </div>

      {/* Row 4 · 반품필요 + 반품확정 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OverviewSection
          title={<span>반품필요 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">{returnsPending?.length ?? 0}건</span></span>}
          action={sectionAction("반품 전체", () => onSelectSubTab("return"))}
        >
          <div className="flex flex-col gap-0.5">
            {returnsPending == null ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">로딩 중…</div>
            ) : returnPendingRows.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">반품 필요 항목이 없습니다</div>
            ) : returnPendingRows.map((r, i) => sectionRow({
              key: String(r.id ?? i),
              icon: <ArrowsLeftRight size={14} className="text-rose-500" />,
              title: r.product_name ?? "-",
              sub: `${r.supplier_name ?? r.supplier ?? "-"}${r.reason ? ` · ${r.reason}` : ""}`,
              rightLabel: r.qty != null ? `${r.qty}` : r.quantity != null ? `${r.quantity}` : "-",
              tone: "rose",
              onClick: () => openDetail(r),
            }))}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>반품확정 <span className="ml-1.5 text-[12px] font-medium text-ink-soft">{returnsDone?.length ?? 0}건</span></span>}
          action={sectionAction("확정 이력", () => onSelectSubTab("return"))}
        >
          <div className="flex flex-col gap-0.5">
            {returnsDone == null ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">로딩 중…</div>
            ) : returnDoneRows.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-ink-soft/70">확정된 반품이 없습니다</div>
            ) : returnDoneRows.map((r, i) => sectionRow({
              key: String(r.id ?? i),
              icon: <CheckCircle size={14} className="text-emerald-500" />,
              title: r.product_name ?? "-",
              sub: `${r.supplier_name ?? r.supplier ?? "-"}${r.created_at ? ` · ${String(r.created_at).slice(0, 10)}` : ""}`,
              rightLabel: r.qty != null ? `${r.qty}` : r.quantity != null ? `${r.quantity}` : "-",
              tone: "emerald",
              onClick: () => openDetail(r),
            }))}
          </div>
        </OverviewSection>
      </div>

      {/* Shortcut · 발주 등록 */}
      <div className="px-4 sm:px-6">
        <button type="button" onClick={() => onSelectSubTab("purchase-order")}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] cursor-pointer transition-colors">
          <Plus size={14} weight="bold" /> 발주 등록 / 상세 메뉴
        </button>
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
