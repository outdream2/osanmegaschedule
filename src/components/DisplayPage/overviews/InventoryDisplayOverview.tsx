// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 재고·진열 현황 (Reference-tone dashboard)
//   · L2 + Toolbar + KPI 4 + Main+Tasks + QuickActions + Bottom table + Right summary
//   · Real data · listExpiryImminentProducts + listInventoryChecks (기존 lib)
//   · Shelf SSOT 보호 (overview 표시 영역 없음)

import React, { useEffect, useState, useMemo } from "react";
import { Package, Storefront, Clock, ListChecks, Warning, MapPinArea, SquaresFour, Barcode } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
  OverviewTaskRow, OverviewQuickAction, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";

export interface InventoryDisplayOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

const L2_TABS = [
  { key: "overview", label: "현황" },
  { key: "store", label: "진열" },
  { key: "purchase", label: "상품·실재고" },
];

export const InventoryDisplayOverview: React.FC<InventoryDisplayOverviewProps> = ({ onSelectSubTab }) => {
  const [expiry, setExpiry] = useState<any[] | null>(null);
  const [checks, setChecks] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    listExpiryImminentProducts()
      .then((rows: any) => { if (alive) setExpiry(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setExpiry([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    listInventoryChecks()
      .then((rows: any) => { if (alive) setChecks(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setChecks([]); });
    return () => { alive = false; };
  }, []);

  const recent = useMemo(() => {
    if (!expiry) return [];
    const filtered = search.trim()
      ? expiry.filter(r => {
          const q = search.trim().toLowerCase();
          return String(r.product_name ?? "").toLowerCase().includes(q)
              || String(r.product_code ?? "").toLowerCase().includes(q);
        })
      : expiry;
    return filtered.slice(0, 10);
  }, [expiry, search]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();
  const expiryCount = expiry?.length ?? null;
  const checkCount = checks?.length ?? null;

  const columns: OverviewTableColumn[] = [
    { key: "code", label: "상품코드" },
    { key: "name", label: "상품명" },
    { key: "expiry", label: "유통기한", align: "center" },
    { key: "stock", label: "재고", align: "right" },
  ];
  const rows = recent.map(r => ({
    code: String(r.product_code ?? "-"),
    name: String(r.product_name ?? "-"),
    expiry: String(r.expiry_date ?? r.expiryDate ?? r.expiry ?? "-"),
    stock: r.current_stock != null ? Number(r.current_stock).toLocaleString() : "-",
  }));

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow
        active="overview"
        tabs={L2_TABS}
        onSelect={(k) => {
          if (k === "overview") return;
          if (k === "store") onSelectSubTab("store");
          else onSelectSubTab("purchase");
        }}
      />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품명·코드 검색" />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Clock size={16} weight="fill" />} label="유통기한 임박" value={kpiValue(expiryCount)} unit="건" tone="amber" hint="만료 임박" />
        <OverviewKpi icon={<ListChecks size={16} weight="fill" />} label="실재고 체크" value={kpiValue(checkCount)} unit="건" tone="brand" hint="누적 기록" />
        <OverviewKpi icon={<Package size={16} weight="fill" />} label="재고 부족" value="-" tone="rose" hint="상품 메뉴 확인" />
        <OverviewKpi icon={<Storefront size={16} weight="fill" />} label="진열 요청" value="-" tone="violet" hint="진열 메뉴 확인" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="유통기한 임박 상품" action={
          <button type="button" onClick={() => onSelectSubTab("purchase")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">전체보기</button>
        }>
          <OverviewTable columns={columns} rows={rows} emptyMessage={expiry == null ? "로딩 중…" : "유통기한 임박 상품 없음"} />
        </OverviewSection>

        <OverviewSection title="오늘 처리할 업무">
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<Storefront size={14} />} label="매장 진열" description="구역도·담당자"
              tone="brand" onClick={() => onSelectSubTab("store")} />
            <OverviewTaskRow icon={<Package size={14} />} label="상품·실재고" description="상품정보"
              tone="neutral" onClick={() => onSelectSubTab("purchase")} />
            <OverviewTaskRow icon={<Clock size={14} />} label="유통기한" description="임박 상품 확인"
              count={kpiValue(expiryCount)} tone="amber"
              onClick={() => onSelectSubTab("purchase")} />
            <OverviewTaskRow icon={<Warning size={14} />} label="진열 요청·이상" description="구역 담당"
              tone="rose" onClick={() => onSelectSubTab("store")} />
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <OverviewQuickAction icon={<Storefront size={16} weight="bold" />} label="매장 구역도" description="진열·담당자"
          tone="violet" onClick={() => onSelectSubTab("store")} />
        <OverviewQuickAction icon={<Package size={16} />} label="상품정보" description="마스터·조회"
          tone="brand" onClick={() => onSelectSubTab("purchase")} />
        <OverviewQuickAction icon={<ListChecks size={16} />} label="실재고 확인" description="재고 체크"
          tone="emerald" onClick={() => onSelectSubTab("purchase")} />
        <OverviewQuickAction icon={<Clock size={16} />} label="유통기한" description="임박 확인"
          tone="amber" onClick={() => onSelectSubTab("purchase")} />
        <OverviewQuickAction icon={<MapPinArea size={16} />} label="진열위치" description="구역·위치"
          tone="neutral" onClick={() => onSelectSubTab("store")} />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="관리 필요 상품" action={
          <button type="button" onClick={() => onSelectSubTab("purchase")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">상품 전체</button>
        }>
          <OverviewTable columns={columns} rows={rows} emptyMessage={expiry == null ? "로딩 중…" : "관리 필요 상품 없음"} />
        </OverviewSection>

        <div className="flex flex-col gap-3">
          <OverviewSection title="유통기한 요약">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<Clock size={14} />} label="임박 상품"
                count={kpiValue(expiryCount)} tone="amber"
                onClick={() => onSelectSubTab("purchase")} />
            </div>
          </OverviewSection>

          <OverviewSection title="실재고 요약">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<ListChecks size={14} />} label="누적 체크"
                count={kpiValue(checkCount)} tone="brand"
                onClick={() => onSelectSubTab("purchase")} />
              <OverviewTaskRow icon={<Barcode size={14} />} label="상품 바코드 조회" tone="neutral"
                onClick={() => onSelectSubTab("purchase")} />
            </div>
          </OverviewSection>

          <OverviewSection title="진열 관련">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<SquaresFour size={14} />} label="매장 구역도" tone="violet"
                onClick={() => onSelectSubTab("store")} />
            </div>
          </OverviewSection>
        </div>
      </div>
    </div>
  );
};

export default InventoryDisplayOverview;
