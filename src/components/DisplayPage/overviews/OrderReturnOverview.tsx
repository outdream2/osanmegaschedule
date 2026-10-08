// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 발주·반품 현황 (Reference-tone dashboard)
//   · L2 Line Tabs + Toolbar + KPI 4 + Main+Tasks 70:30 + QuickActions 5 + Bottom table + Right summary
//   · Real data · listOrderRequests (orderRequestsApi) · 신규 API/계산 금지
//   · 기능 수정 없음 · 모든 widget click → setDpSubTab(기존 L2)

import React, { useEffect, useState, useMemo } from "react";
import { Truck, ArrowsLeftRight, Package, Warning, Plus, ShoppingCart, Buildings, ListChecks } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
  OverviewTaskRow, OverviewQuickAction, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listOrderRequests, type OrderRequestRow } from "../../../lib/orderRequestsApi";

export interface OrderReturnOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

const L2_TABS = [
  { key: "overview", label: "현황" },
  { key: "purchase-order", label: "발주" },
  { key: "return", label: "반품" },
];

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab }) => {
  const [orders, setOrders] = useState<OrderRequestRow[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    listOrderRequests()
      .then(rows => { if (alive) setOrders(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, []);

  // 집계 · listOrderRequests 는 pending 발주 요청 전체 (status 필드 없음 · 전부 미처리 상태)
  const stats = useMemo(() => {
    if (!orders) return { pending: null, total: null, bySupplier: new Map<string, number>() };
    const bySupplier = new Map<string, number>();
    for (const r of orders) {
      const sup = String(r.supplier ?? "-");
      bySupplier.set(sup, (bySupplier.get(sup) ?? 0) + 1);
    }
    return { pending: orders.length, total: orders.length, bySupplier };
  }, [orders]);

  // 최근 발주 (최대 8건)
  const recent = useMemo(() => {
    if (!orders) return [];
    const filtered = search.trim()
      ? orders.filter(r => {
          const q = search.trim().toLowerCase();
          const name = (r.product_name ?? "").toLowerCase();
          const code = (r.product_code ?? "").toLowerCase();
          const sup = (r.supplier ?? "").toLowerCase();
          return name.includes(q) || code.includes(q) || sup.includes(q);
        })
      : orders;
    return filtered.slice(0, 8);
  }, [orders, search]);

  // 공급사별 TOP5
  const supplierTop = useMemo(() => {
    const arr = Array.from(stats.bySupplier.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return arr;
  }, [stats.bySupplier]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const columns: OverviewTableColumn[] = [
    { key: "when", label: "일시" },
    { key: "product", label: "상품" },
    { key: "supplier", label: "공급사" },
    { key: "qty", label: "수량", align: "right" },
    { key: "status", label: "상태", align: "center" },
  ];

  const rows = recent.map(r => ({
    when: (r.requested_at ?? "").slice(0, 10) || "-",
    product: r.product_name ?? "-",
    supplier: r.supplier ?? "-",
    qty: r.order_qty != null ? r.order_qty.toLocaleString() : "-",
    status: "요청",
  }));

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow
        active="overview"
        tabs={L2_TABS}
        onSelect={(k) => {
          if (k === "overview") return;
          if (k === "return") onSelectSubTab("return");
          else onSelectSubTab("purchase-order");
        }}
      />

      <OverviewToolbar
        search={search}
        onSearch={setSearch}
        placeholder="상품·코드·공급사 검색"
      />

      {/* KPI strip · 4개 · grid-cols-4 */}
      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<ShoppingCart size={16} weight="fill" />} label="발주 요청" value={kpiValue(stats.pending)} unit="건" tone="brand" hint="처리 대기" />
        <OverviewKpi icon={<Truck size={16} weight="fill" />} label="전체 발주" value={kpiValue(stats.total)} unit="건" tone="neutral" hint="누적" />
        <OverviewKpi icon={<ArrowsLeftRight size={16} weight="fill" />} label="반품" value="-" tone="rose" hint="상세 메뉴에서 확인" />
        <OverviewKpi icon={<Warning size={16} weight="fill" />} label="이상·미입고" value="-" tone="amber" hint="상세 메뉴에서 확인" />
      </div>

      {/* Main summary + Today Tasks 70:30 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="최근 발주 요청" action={
          <button type="button" onClick={() => onSelectSubTab("purchase-order")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
        }>
          <OverviewTable columns={columns} rows={rows} emptyMessage={orders == null ? "로딩 중…" : "발주 요청 없음"} />
        </OverviewSection>

        <OverviewSection title="오늘 처리할 업무">
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<ShoppingCart size={14} />} label="발주요청" description="처리 대기"
              count={kpiValue(stats.pending)} tone="brand"
              onClick={() => onSelectSubTab("purchase-order")} />
            <OverviewTaskRow icon={<Package size={14} />} label="발주필요" description="부족 재고"
              tone="amber" onClick={() => onSelectSubTab("purchase-order")} />
            <OverviewTaskRow icon={<ArrowsLeftRight size={14} />} label="반품 처리" description="요청·처리"
              tone="rose" onClick={() => onSelectSubTab("return")} />
            <OverviewTaskRow icon={<Warning size={14} />} label="이상·미입고" description="대조 확인"
              tone="rose" onClick={() => onSelectSubTab("purchase-order")} />
          </div>
        </OverviewSection>
      </div>

      {/* Quick Actions · 5개 가로 한 줄 */}
      <div className="px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <OverviewQuickAction icon={<Plus size={16} weight="bold" />} label="발주 등록" description="신규 발주"
          tone="brand" onClick={() => onSelectSubTab("purchase-order")} />
        <OverviewQuickAction icon={<ArrowsLeftRight size={16} />} label="반품 관리" description="요청·처리"
          tone="rose" onClick={() => onSelectSubTab("return")} />
        <OverviewQuickAction icon={<Buildings size={16} />} label="공급사별 보기" description="공급사 조회"
          tone="neutral" onClick={() => onSelectSubTab("purchase-order")} />
        <OverviewQuickAction icon={<ListChecks size={16} />} label="매입 대조" description="발주·매입 확인"
          tone="amber" onClick={() => onSelectSubTab("purchase-order")} />
        <OverviewQuickAction icon={<Package size={16} />} label="재고 확인" description="상품·실재고"
          tone="violet" onClick={() => onSelectSubTab("purchase")} />
      </div>

      {/* Bottom · Main detail + Right summary 70:30 */}
      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="발주 활동 상세" action={
          <button type="button" onClick={() => onSelectSubTab("purchase-order")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">발주 전체</button>
        }>
          <OverviewTable columns={columns} rows={rows} emptyMessage={orders == null ? "로딩 중…" : "활동 없음"} />
        </OverviewSection>

        <div className="flex flex-col gap-3">
          <OverviewSection title="공급사별 발주 TOP" action={
            <span className="text-[11px] text-ink-soft">{supplierTop.length}곳</span>
          }>
            <div className="flex flex-col gap-0.5">
              {supplierTop.length === 0 && <div className="text-[12px] text-ink-soft/70 py-2">공급사 데이터 없음</div>}
              {supplierTop.map(([sup, cnt]) => (
                <OverviewTaskRow key={sup} icon={<Buildings size={14} />} label={sup}
                  count={cnt.toLocaleString()} tone="brand"
                  onClick={() => onSelectSubTab("purchase-order")} />
              ))}
            </div>
          </OverviewSection>

          <OverviewSection title="반품·이상 요약">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<ArrowsLeftRight size={14} />} label="반품 관리" description="요청·처리·이력"
                tone="rose" onClick={() => onSelectSubTab("return")} />
              <OverviewTaskRow icon={<Warning size={14} />} label="이상 품목" description="발주·매입 대조"
                tone="amber" onClick={() => onSelectSubTab("purchase-order")} />
            </div>
          </OverviewSection>
        </div>
      </div>
    </div>
  );
};

export default OrderReturnOverview;
