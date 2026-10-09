// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-09 · GLOBAL UI · 매입·입고 Single-Page Operations Console
//   · L2 폐기 · shortcut 폐기 · modal-first
//   · Real · listStockArrivals · /api/order-history · 각 row click → OrderDetailModal (shared pattern)
//   · Purchase canonical calculation (purchase-ux-worktree) 접근 0

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Bell, PaperPlaneTilt, Warning, Checks as PackageCheck } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listStockArrivals, type StockArrival } from "../../../lib/stockArrivalsApi";
import { api } from "../../../lib/apiClient";
import { OrderDetailModal, type OrderDetailRow } from "./OrderDetailModal";

export interface PurchaseArrivalOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

type AnyRow = Record<string, any>;

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = () => {
  const [arrivals, setArrivals] = useState<StockArrival[] | null>(null);
  const [history, setHistory] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [detail, setDetail] = useState<OrderDetailRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    listStockArrivals().then(r => { if (alive) setArrivals(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setArrivals([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`)
      .then(({ data }) => { if (alive) setHistory(Array.isArray(data?.orders) ? data!.orders! : []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  const cutoff = Date.now() - Number(period) * 86400000;
  const q = search.trim().toLowerCase();

  const arrivalRows = useMemo(() => {
    if (!arrivals) return [];
    const sorted = [...arrivals].sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    return (q ? sorted.filter((r: any) => String(r.title ?? "").toLowerCase().includes(q)) : sorted).slice(0, 10);
  }, [arrivals, q]);

  const scheduledRows = useMemo(() => {
    if (!arrivals) return [];
    return arrivals.filter((r: any) => r.scheduled_at && new Date(r.scheduled_at).getTime() > Date.now()).slice(0, 6);
  }, [arrivals]);

  const historyRows = useMemo(() => {
    if (!history) return [];
    return history.filter(h => {
      const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
      const t = d ? new Date(d).getTime() : 0;
      if (t && t < cutoff) return false;
      return !q || String(h.supplier ?? h.supplier_name ?? "").toLowerCase().includes(q);
    }).slice(0, 12);
  }, [history, q, cutoff]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openDetail = useCallback((row: AnyRow) => {
    setDetail({
      id: row.id, order_no: row.order_no ?? row.po_no,
      requested_at: row.order_date ?? row.requested_at ?? row.created_at,
      supplier: row.supplier, supplier_name: row.supplier_name, supplier_email: row.supplier_email,
      staff_name: row.staff_name, status: row.status, receiving_status: row.receiving_status,
      note: row.note ?? row.body,
      items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code, product_name: row.product_name ?? row.title,
      order_qty: row.order_qty ?? row.qty, total_amount: row.total_amount,
    });
  }, []);

  const historyColumns: OverviewTableColumn[] = [
    { key: "when", label: "일자" },
    { key: "no", label: "발주번호" },
    { key: "supplier", label: "공급사" },
    { key: "items", label: "품목", align: "right" },
    { key: "amount", label: "금액", align: "right" },
    { key: "status", label: "상태", align: "center" },
  ];
  const historyData = historyRows.map(h => ({
    when: String(h.order_date ?? h.created_at ?? "").slice(0, 10) || "-",
    no: h.order_no ?? h.po_no ?? "-",
    supplier: h.supplier ?? h.supplier_name ?? "-",
    items: h.item_count ?? h.items_count ?? (Array.isArray(h.items) ? h.items.length : "-"),
    amount: h.total_amount != null ? Number(h.total_amount).toLocaleString() : "-",
    status: h.receiving_status ?? h.status ?? "-",
    __onClick: () => openDetail(h),
  }));

  const arrivalColumns: OverviewTableColumn[] = [
    { key: "when", label: "작성" },
    { key: "title", label: "제목" },
    { key: "sched", label: "발송 예정", align: "center" },
    { key: "status", label: "상태", align: "center" },
  ];
  const arrivalData = arrivalRows.map(r => {
    const sched = (r as any).scheduled_at;
    const isFuture = sched && new Date(sched).getTime() > Date.now();
    return {
      when: String((r as any).created_at ?? "").slice(0, 10) || "-",
      title: (r as any).title ?? "-",
      sched: sched ? String(sched).slice(0, 16).replace("T", " ") : "즉시",
      status: isFuture ? "예약" : "발송됨",
      __onClick: () => openDetail(r as any),
    };
  });

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader title="매입·입고" description="오늘의 매입/입고 업무를 한 페이지에서 처리합니다" />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="제목·공급사·발주번호 검색"
        right={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
              className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
              <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
            </select>
            <button type="button" onClick={() => setRefreshKey(k => k + 1)}
              className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">새로고침</button>
          </>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Bell size={18} weight="fill" />} label="입고알림" value={kpiValue(arrivals?.length)} unit="건" tone="brand" hint="누적 등록" />
        <OverviewKpi icon={<PaperPlaneTilt size={18} weight="fill" />} label="예약 발송" value={kpiValue(scheduledRows.length)} unit="건" tone="amber" hint="예정" />
        <OverviewKpi icon={<Package size={18} weight="fill" />} label="매입이력" value={kpiValue(history?.length)} unit="건" tone="neutral" hint="누적" />
        <OverviewKpi icon={<PackageCheck size={18} weight="fill" />} label="입고 검수" value="-" tone="emerald" hint="상세 처리 메뉴 통합 예정" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <OverviewSection
          title={<span>입고알림 <span className="ml-2 text-[13px] font-medium text-ink-soft">{arrivalRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={arrivalColumns} rows={arrivalData} emptyMessage={arrivals == null ? "불러오는 중..." : "입고알림이 없습니다"} />
        </OverviewSection>

        <OverviewSection
          title={<span>예약 발송 <span className="ml-2 text-[13px] font-medium text-ink-soft">{scheduledRows.length}건</span></span>}
        >
          <div className="flex flex-col gap-2 text-[14px]">
            {arrivals == null ? <div className="py-4 text-center text-[13px] text-ink-soft/70">불러오는 중...</div>
              : scheduledRows.length === 0 ? <div className="py-4 text-center text-[13px] text-ink-soft/70">예약된 발송이 없습니다</div>
              : scheduledRows.map((r: any) => (
                <button key={r.id} type="button" onClick={() => openDetail(r)}
                  className="w-full flex items-center gap-2 p-2.5 text-left rounded-md hover:bg-slate-50 cursor-pointer border border-slate-100">
                  <PaperPlaneTilt size={16} className="text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink truncate">{r.title ?? "-"}</div>
                    <div className="text-[12px] text-ink-soft tabular-nums">{String(r.scheduled_at ?? "").slice(0, 16).replace("T", " ")}</div>
                  </div>
                </button>
              ))}
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection
          title={<span>최근 매입이력 <span className="ml-2 text-[13px] font-medium text-ink-soft">최근 {period}일 · {historyRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={historyColumns} rows={historyData} emptyMessage={history == null ? "불러오는 중..." : "선택 기간의 매입이력이 없습니다"} />
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>미입고 · 이상 입고</span>}>
          <div className="flex items-center gap-3 p-3 border border-amber-200 bg-amber-50 rounded-lg text-[14px]">
            <Warning size={18} className="text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-amber-800">미입고 상태 발주 자동 집계 endpoint 미확정</div>
              <div className="text-[13px] text-amber-700 mt-0.5">매입이력 각 row 상세에서 입고상태 확인 가능 · row 클릭 → 상세 Modal</div>
            </div>
          </div>
        </OverviewSection>
      </div>

      <OrderDetailModal open={detail != null} onClose={() => setDetail(null)} order={detail} />
    </div>
  );
};

export default PurchaseArrivalOverview;
