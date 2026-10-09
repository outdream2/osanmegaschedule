// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-09 · GLOBAL UI · 매입·입고 통합 대시보드 · 한 페이지 통합 + Modal
//   · 사용자 지시 · 매장 하위 전부 통합 대시보드로 · 자세한 내용은 모달
//   · Real · listStockArrivals · /api/order-history (매입 완료 포함) · 각 섹션 row click → OrderDetailModal
//   · Purchase canonical calculation 접근 0 · purchase-ux-worktree 보호

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Bell, PaperPlaneTilt, Receipt, Buildings, ClockCountdown, Warning, Checks as PackageCheck } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";
import { listStockArrivals, type StockArrival } from "../../../lib/stockArrivalsApi";
import { api } from "../../../lib/apiClient";
import { OrderDetailModal, type OrderDetailRow } from "./OrderDetailModal";

export interface PurchaseArrivalOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

type AnyRow = Record<string, any>;

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  const [arrivals, setArrivals] = useState<StockArrival[] | null>(null);
  const [history, setHistory] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");
  const [selected, setSelected] = useState<OrderDetailRow | null>(null);

  useEffect(() => {
    let alive = true;
    listStockArrivals()
      .then(r => { if (alive) setArrivals(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setArrivals([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`)
      .then(({ data }) => { if (alive) setHistory(Array.isArray(data?.orders) ? data!.orders! : []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, []);

  const cutoff = Date.now() - Number(period) * 86400000;
  const q = search.trim().toLowerCase();

  const arrivalRows = useMemo(() => {
    if (!arrivals) return [];
    const sorted = [...arrivals].sort((a, b) => String((b as any).created_at ?? "").localeCompare(String((a as any).created_at ?? "")));
    return (q ? sorted.filter(r => String((r as any).title ?? "").toLowerCase().includes(q)) : sorted).slice(0, 6);
  }, [arrivals, q]);

  const scheduledRows = useMemo(() => {
    if (!arrivals) return [];
    return arrivals.filter(r => {
      const d = (r as any).scheduled_at as string | undefined;
      return d && new Date(d).getTime() > Date.now();
    }).slice(0, 6);
  }, [arrivals]);

  const purchaseHistoryRows = useMemo(() => {
    if (!history) return [];
    return history
      .filter(h => {
        const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
        const t = d ? new Date(d).getTime() : 0;
        if (t && t < cutoff) return false;
        return !q || String(h.supplier ?? h.supplier_name ?? "").toLowerCase().includes(q)
             || String(h.order_no ?? h.po_no ?? "").toLowerCase().includes(q);
      })
      .slice(0, 10);
  }, [history, q, cutoff]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openDetail = useCallback((row: AnyRow) => {
    setSelected({
      id: row.id, order_no: row.order_no ?? row.po_no, requested_at: row.order_date ?? row.requested_at ?? row.created_at,
      supplier: row.supplier, supplier_name: row.supplier_name, supplier_email: row.supplier_email,
      staff_name: row.staff_name, status: row.status, receiving_status: row.receiving_status, note: row.note ?? row.body,
      items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code, product_name: row.product_name ?? row.title, order_qty: row.order_qty ?? row.qty,
    });
  }, []);

  const sectionRow = (opts: { key: string; icon: React.ReactNode; title: string; sub?: string; rightLabel?: string; tone?: string; onClick: () => void }) => (
    <button key={opts.key} type="button" onClick={opts.onClick}
      className="w-full flex items-center gap-2 px-2 h-10 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
      <span className="shrink-0 text-ink-soft">{opts.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{opts.title}</div>
        {opts.sub && <div className="text-[12px] text-ink-soft truncate">{opts.sub}</div>}
      </div>
      {opts.rightLabel && <span className="text-[14px] font-bold tabular-nums shrink-0 text-brand-deep">{opts.rightLabel}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow active="overview" tabs={[{ key: "overview", label: "현황" }]} onSelect={() => {}} />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품·공급사·발주번호·제목 검색"
        right={
          <>
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
              className="h-9 px-2.5 text-[13px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
              <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
            </select>
          </>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Bell size={16} weight="fill" />} label="입고알림" value={kpiValue(arrivals?.length)} unit="건" tone="brand" hint="누적 등록" />
        <OverviewKpi icon={<PaperPlaneTilt size={16} weight="fill" />} label="예약 발송" value={kpiValue(scheduledRows.length)} unit="건" tone="amber" hint="발송 예정" />
        <OverviewKpi icon={<Package size={16} weight="fill" />} label="매입이력" value={kpiValue(history?.length)} unit="건" tone="neutral" hint="누적" />
        <OverviewKpi icon={<PackageCheck size={16} weight="fill" />} label="입고 검수" value="-" tone="emerald" hint="상세 메뉴 확인" />
      </div>

      {/* Row 1 · 입고알림 + 예약발송 + 미입고/이상 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OverviewSection
          title={<span>입고알림 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">{arrivals?.length ?? 0}건</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("stock-arrivals")} className="text-[13px] font-semibold text-brand-deep hover:underline">전체보기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {arrivals == null ? <div className="py-4 text-center text-[13px] text-ink-soft/70">로딩 중…</div>
              : arrivalRows.length === 0 ? <div className="py-4 text-center text-[13px] text-ink-soft/70">입고알림이 없습니다</div>
              : arrivalRows.map(r => sectionRow({
                  key: String((r as any).id),
                  icon: <Bell size={14} />,
                  title: String((r as any).title ?? "-"),
                  sub: String((r as any).created_at ?? "").slice(0, 10),
                  rightLabel: (r as any).scheduled_at ? "예약" : "발송",
                  onClick: () => openDetail(r as any),
                }))}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>예약 발송 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">{scheduledRows.length}건</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("stock-arrivals")} className="text-[13px] font-semibold text-brand-deep hover:underline">관리</button>}
        >
          <div className="flex flex-col gap-0.5">
            {arrivals == null ? <div className="py-4 text-center text-[13px] text-ink-soft/70">로딩 중…</div>
              : scheduledRows.length === 0 ? <div className="py-4 text-center text-[13px] text-ink-soft/70">예약된 발송이 없습니다</div>
              : scheduledRows.map(r => sectionRow({
                  key: String((r as any).id),
                  icon: <PaperPlaneTilt size={14} className="text-amber-500" />,
                  title: String((r as any).title ?? "-"),
                  sub: String((r as any).scheduled_at ?? "").slice(0, 16).replace("T", " "),
                  rightLabel: "예약",
                  onClick: () => openDetail(r as any),
                }))}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>미입고 · 이상 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">상세 메뉴 확인</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("purchase")} className="text-[13px] font-semibold text-brand-deep hover:underline">매입 전체</button>}
        >
          <div className="flex flex-col gap-0.5">
            {sectionRow({ key: "arr-ex-1", icon: <Warning size={14} className="text-rose-500" />, title: "미입고 발주 확인", sub: "입고예정일 지남 · 미처리", rightLabel: "열기", onClick: () => onSelectSubTab("purchase") })}
            {sectionRow({ key: "arr-ex-2", icon: <ClockCountdown size={14} className="text-amber-500" />, title: "단가변동 · 수량 차이", sub: "대조 결과 확인", rightLabel: "열기", onClick: () => onSelectSubTab("purchase") })}
          </div>
        </OverviewSection>
      </div>

      {/* Row 2 · 최근 매입이력 (full width table) */}
      <div className="px-4 sm:px-6">
        <OverviewSection
          title={<span>최근 매입이력 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">최근 {period}일 · {purchaseHistoryRows.length}건</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("purchase")} className="text-[13px] font-semibold text-brand-deep hover:underline">매입 전체</button>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 px-2 text-left text-[12px] font-semibold text-ink-soft uppercase tracking-wider">일자</th>
                  <th className="py-2 px-2 text-left text-[12px] font-semibold text-ink-soft uppercase tracking-wider">발주번호</th>
                  <th className="py-2 px-2 text-left text-[12px] font-semibold text-ink-soft uppercase tracking-wider">공급사</th>
                  <th className="py-2 px-2 text-right text-[12px] font-semibold text-ink-soft uppercase tracking-wider">품목</th>
                  <th className="py-2 px-2 text-right text-[12px] font-semibold text-ink-soft uppercase tracking-wider">금액</th>
                  <th className="py-2 px-2 text-center text-[12px] font-semibold text-ink-soft uppercase tracking-wider">상태</th>
                </tr>
              </thead>
              <tbody>
                {history == null ? <tr><td colSpan={6} className="py-6 text-center text-[13px] text-ink-soft/70">로딩 중…</td></tr>
                  : purchaseHistoryRows.length === 0 ? <tr><td colSpan={6} className="py-6 text-center text-[13px] text-ink-soft/70">선택 기간의 매입이력이 없습니다</td></tr>
                  : purchaseHistoryRows.map((h, i) => (
                    <tr key={h.id ?? h.order_no ?? i} className="border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer" onClick={() => openDetail(h)}>
                      <td className="py-2.5 px-2 text-ink tabular-nums">{String(h.order_date ?? h.created_at ?? "").slice(0, 10) || "-"}</td>
                      <td className="py-2.5 px-2 text-ink tabular-nums">{h.order_no ?? h.po_no ?? "-"}</td>
                      <td className="py-2.5 px-2 text-ink-soft truncate">{h.supplier ?? h.supplier_name ?? "-"}</td>
                      <td className="py-2.5 px-2 text-right text-ink tabular-nums">{h.item_count ?? (Array.isArray(h.items) ? h.items.length : "-")}</td>
                      <td className="py-2.5 px-2 text-right text-ink font-semibold tabular-nums">{h.total_amount != null ? Number(h.total_amount).toLocaleString() : "-"}</td>
                      <td className="py-2.5 px-2 text-center text-[12px] text-ink-soft">{h.receiving_status ?? h.status ?? "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </OverviewSection>
      </div>

      <OrderDetailModal open={selected != null} onClose={() => setSelected(null)} order={selected} />
    </div>
  );
};

export default PurchaseArrivalOverview;
