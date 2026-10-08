// src/components/DisplayPage/overviews/PurchaseArrivalOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 매입·입고 현황 (Reference-tone dashboard)
//   · L2 + Toolbar + KPI 4 + Main+Tasks + QuickActions + Bottom table + Right summary
//   · Real data · listStockArrivals (stockArrivalsApi)
//   · Purchase canonical (purchase-ux-worktree) 접근 0

import React, { useEffect, useState, useMemo } from "react";
import { Package, Checks as PackageCheck, Bell, Receipt, PaperPlaneTilt, Buildings, Plus, ListChecks } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
  OverviewTaskRow, OverviewQuickAction, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listStockArrivals, type StockArrival } from "../../../lib/stockArrivalsApi";

export interface PurchaseArrivalOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

const L2_TABS = [
  { key: "overview", label: "현황" },
  { key: "purchase", label: "매입" },
  { key: "stock-arrivals", label: "입고알림" },
];

export const PurchaseArrivalOverview: React.FC<PurchaseArrivalOverviewProps> = ({ onSelectSubTab }) => {
  const [arrivals, setArrivals] = useState<StockArrival[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    listStockArrivals()
      .then(rows => { if (alive) setArrivals(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setArrivals([]); });
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => {
    if (!arrivals) return { total: null, scheduled: null, published: null };
    const now = Date.now();
    const scheduled = arrivals.filter(r => {
      const d = (r as any).scheduled_at as string | undefined;
      return d && new Date(d).getTime() > now;
    }).length;
    const published = arrivals.length - scheduled;
    return { total: arrivals.length, scheduled, published };
  }, [arrivals]);

  const recent = useMemo(() => {
    if (!arrivals) return [];
    const sorted = [...arrivals].sort((a, b) => {
      const ba = String((a as any).created_at ?? "");
      const bb = String((b as any).created_at ?? "");
      return bb.localeCompare(ba);
    });
    const filtered = search.trim()
      ? sorted.filter(r => {
          const q = search.trim().toLowerCase();
          return String((r as any).title ?? "").toLowerCase().includes(q)
              || String((r as any).body ?? "").toLowerCase().includes(q);
        })
      : sorted;
    return filtered.slice(0, 8);
  }, [arrivals, search]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const columns: OverviewTableColumn[] = [
    { key: "when", label: "작성" },
    { key: "title", label: "제목" },
    { key: "scheduled", label: "발송 예정", align: "center" },
    { key: "status", label: "상태", align: "center" },
  ];
  const rows = recent.map(r => {
    const sched = (r as any).scheduled_at as string | undefined;
    const isFuture = sched && new Date(sched).getTime() > Date.now();
    return {
      when: String((r as any).created_at ?? "").slice(0, 10) || "-",
      title: String((r as any).title ?? "-"),
      scheduled: sched ? sched.slice(0, 16).replace("T", " ") : "즉시",
      status: isFuture ? "예약" : "발송됨",
    };
  });

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow
        active="overview"
        tabs={L2_TABS}
        onSelect={(k) => {
          if (k === "overview") return;
          if (k === "stock-arrivals") onSelectSubTab("stock-arrivals");
          else onSelectSubTab("purchase");
        }}
      />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="제목·내용 검색" />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Bell size={16} weight="fill" />} label="입고알림" value={kpiValue(stats.total)} unit="건" tone="brand" hint="누적 등록" />
        <OverviewKpi icon={<PaperPlaneTilt size={16} weight="fill" />} label="예약 발송" value={kpiValue(stats.scheduled)} unit="건" tone="amber" hint="발송 예정" />
        <OverviewKpi icon={<Package size={16} weight="fill" />} label="매입" value="-" tone="neutral" hint="매입 메뉴에서 확인" />
        <OverviewKpi icon={<PackageCheck size={16} weight="fill" />} label="입고 검수" value="-" tone="emerald" hint="상품입고 메뉴" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="최근 입고알림" action={
          <button type="button" onClick={() => onSelectSubTab("stock-arrivals")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
        }>
          <OverviewTable columns={columns} rows={rows} emptyMessage={arrivals == null ? "로딩 중…" : "입고알림 없음"} />
        </OverviewSection>

        <OverviewSection title="오늘 처리할 업무">
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<Package size={14} />} label="매입이력" description="공급사·상품·단가"
              tone="brand" onClick={() => onSelectSubTab("purchase")} />
            <OverviewTaskRow icon={<Receipt size={14} />} label="매입상세" description="거래명세표"
              tone="neutral" onClick={() => onSelectSubTab("purchase")} />
            <OverviewTaskRow icon={<PackageCheck size={14} />} label="상품 입고 검수" description="수량 일치 확인"
              tone="emerald" onClick={() => onSelectSubTab("purchase")} />
            <OverviewTaskRow icon={<Bell size={14} />} label="입고알림" description="전직원 알림"
              count={kpiValue(stats.total)} tone="amber" onClick={() => onSelectSubTab("stock-arrivals")} />
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <OverviewQuickAction icon={<Package size={16} weight="bold" />} label="매입이력" description="공급사·상품·단가"
          tone="brand" onClick={() => onSelectSubTab("purchase")} />
        <OverviewQuickAction icon={<Plus size={16} weight="bold" />} label="입고알림 작성" description="즉시·예약"
          tone="amber" onClick={() => onSelectSubTab("stock-arrivals")} />
        <OverviewQuickAction icon={<PackageCheck size={16} />} label="상품 입고" description="검수"
          tone="emerald" onClick={() => onSelectSubTab("purchase")} />
        <OverviewQuickAction icon={<ListChecks size={16} />} label="실재고 확인" description="상품·재고"
          tone="violet" onClick={() => onSelectSubTab("purchase")} />
        <OverviewQuickAction icon={<Buildings size={16} />} label="거래처 보기" description="공급사"
          tone="neutral" onClick={() => onSelectSubTab("purchase")} />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="입고알림 상세" action={
          <button type="button" onClick={() => onSelectSubTab("stock-arrivals")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">알림 전체</button>
        }>
          <OverviewTable columns={columns} rows={rows} emptyMessage={arrivals == null ? "로딩 중…" : "활동 없음"} />
        </OverviewSection>

        <div className="flex flex-col gap-3">
          <OverviewSection title="입고 예정 요약">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<PaperPlaneTilt size={14} />} label="예약 발송"
                count={kpiValue(stats.scheduled)} tone="amber"
                onClick={() => onSelectSubTab("stock-arrivals")} />
              <OverviewTaskRow icon={<Bell size={14} />} label="발송 완료"
                count={kpiValue(stats.published)} tone="brand"
                onClick={() => onSelectSubTab("stock-arrivals")} />
            </div>
          </OverviewSection>

          <OverviewSection title="매입 관련 바로가기">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<Package size={14} />} label="매입이력" tone="brand"
                onClick={() => onSelectSubTab("purchase")} />
              <OverviewTaskRow icon={<Receipt size={14} />} label="매입상세" tone="neutral"
                onClick={() => onSelectSubTab("purchase")} />
            </div>
          </OverviewSection>
        </div>
      </div>
    </div>
  );
};

export default PurchaseArrivalOverview;
