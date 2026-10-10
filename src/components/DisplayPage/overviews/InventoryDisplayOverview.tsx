// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-09 · GLOBAL UI · 재고·진열 Single-Page Operations Console
//   · L2 폐기 · shortcut 폐기 · modal-first
//   · Real · listExpiryImminentProducts · listInventoryChecks
//   · row click → ProductInventoryDetailModal (domain-specific · Shelf SSOT 보호)

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Storefront, Clock, ListChecks } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";
import { ProductInventoryDetailModal, type ProductInventoryDetailRow } from "./ProductInventoryDetailModal";
// 2026-10-10 · 사용자 지시 · 매장구역도 뷰어 inner tab 추가 · 공통 StoreZoneMap readonly render
import { StoreZoneMap } from "../../common/StoreZoneMap";

export interface InventoryDisplayOverviewProps { onSelectSubTab: (sub: any) => void; }

type AnyRow = Record<string, any>;

// 2026-10-10 · 사용자 지시 · inner tab · "현황" / "매장구역도" 2탭 · 홈 톤 pill 패턴
type InnerTab = "overview" | "map";

export const InventoryDisplayOverview: React.FC<InventoryDisplayOverviewProps> = () => {
  const [expiry, setExpiry] = useState<AnyRow[] | null>(null);
  const [checks, setChecks] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<ProductInventoryDetailRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // 2026-10-10 · inner tab · overview 기본 (대원칙 · 첫 탭 default)
  const [innerTab, setInnerTab] = useState<InnerTab>("overview");

  useEffect(() => {
    let alive = true;
    listExpiryImminentProducts().then((r: any) => { if (alive) setExpiry(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setExpiry([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    listInventoryChecks().then((r: any) => { if (alive) setChecks(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setChecks([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  const q = search.trim().toLowerCase();
  const expiryRows = useMemo(() => {
    if (!expiry) return [];
    return (q ? expiry.filter(r => String(r.product_name ?? "").toLowerCase().includes(q) || String(r.product_code ?? "").toLowerCase().includes(q)) : expiry).slice(0, 15);
  }, [expiry, q]);
  const checkRows = useMemo(() => {
    if (!checks) return [];
    return (q ? checks.filter(r => String(r.product_name ?? r.product_code ?? "").toLowerCase().includes(q)) : checks).slice(0, 10);
  }, [checks, q]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openDetail = useCallback((row: AnyRow) => {
    setDetail({
      id: row.id,
      product_code: row.product_code,
      product_name: row.product_name,
      barcode: row.barcode,
      category: row.category,
      current_stock: row.current_stock,
      optimal_stock: row.optimal_stock,
      expiry_date: row.expiry_date ?? row.expiry,
      shelf_positions: row.shelf_positions,
      display_location: row.display_location,
      checked_at: row.checked_at,
      created_at: row.created_at,
      qty: row.qty,
      quantity: row.quantity,
      note: row.note,
    });
  }, []);

  const expiryColumns: OverviewTableColumn[] = [
    { key: "code", label: "상품코드" },
    { key: "name", label: "상품명" },
    { key: "exp", label: "유통기한", align: "center" },
    { key: "stock", label: "재고", align: "right" },
  ];
  const expiryData = expiryRows.map(r => ({
    code: r.product_code ?? "-",
    name: r.product_name ?? "-",
    exp: r.expiry_date ?? r.expiry ?? "-",
    stock: r.current_stock != null ? Number(r.current_stock).toLocaleString() : "-",
    __onClick: () => openDetail(r),
  }));

  const checkColumns: OverviewTableColumn[] = [
    { key: "name", label: "상품" },
    { key: "when", label: "체크 일시", align: "center" },
    { key: "qty", label: "수량", align: "right" },
  ];
  const checkData = checkRows.map(r => ({
    name: r.product_name ?? r.product_code ?? "-",
    when: String(r.checked_at ?? r.created_at ?? "").slice(0, 16).replace("T", " ") || "-",
    qty: r.qty ?? r.quantity ?? "-",
    __onClick: () => openDetail(r),
  }));

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader title="재고·진열" description="재고/실재고/유통기한/진열 업무를 한 페이지에서 처리합니다" />

      {/* 2026-10-10 · 사용자 지시 · inner tab · 현황 / 매장구역도 · 홈 톤 pill 패턴 (SalesOverview·CategoryTab 벤치) */}
      <div className="px-4 sm:px-6">
        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {([
            { key: "overview", label: "현황" },
            { key: "map",      label: "매장구역도" },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setInnerTab(t.key)}
              className={`h-9 px-4 rounded-md text-[14px] font-semibold transition-colors cursor-pointer ${
                innerTab === t.key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═════════ 매장구역도 탭 · 공통 StoreZoneMap readonly 뷰어 ═════════ */}
      {innerTab === "map" && (
        <div className="px-4 sm:px-6">
          <StoreZoneMap />
        </div>
      )}

      {/* ═════════ 현황 탭 · 기존 KPI + 섹션들 ═════════ */}
      {innerTab === "overview" && (<>
      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품명·코드 검색"
        right={
          <button type="button" onClick={() => setRefreshKey(k => k + 1)}
            className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">새로고침</button>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Clock size={18} weight="fill" />} label="유통기한 임박" value={kpiValue(expiry?.length)} unit="건" tone="amber" hint="만료 임박" />
        <OverviewKpi icon={<ListChecks size={18} weight="fill" />} label="실재고 체크" value={kpiValue(checks?.length)} unit="건" tone="brand" hint="누적 기록" />
        <OverviewKpi icon={<Package size={18} weight="fill" />} label="재고 부족" value="-" tone="rose" hint="재고부족 endpoint 통합 예정" />
        <OverviewKpi icon={<Storefront size={18} weight="fill" />} label="진열 요청" value="-" tone="violet" hint="StoreZoneMap 통합 예정" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <OverviewSection
          title={<span>유통기한 임박 상품 <span className="ml-2 text-[13px] font-medium text-ink-soft">{expiryRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={expiryColumns} rows={expiryData} emptyMessage={expiry == null ? "불러오는 중..." : "임박 상품이 없습니다"} />
        </OverviewSection>

        <OverviewSection
          title={<span>실재고 체크 <span className="ml-2 text-[13px] font-medium text-ink-soft">{checkRows.length}건</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={checkColumns} rows={checkData} emptyMessage={checks == null ? "불러오는 중..." : "실재고 체크 기록이 없습니다"} />
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>진열 · 상품정보 통합 안내</span>}>
          <div className="flex items-start gap-3 p-4 border border-violet-200 bg-violet-50 rounded-lg text-[14px]">
            <Storefront size={20} className="text-violet-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-violet-800">StoreZoneMap · ProductInfo · Shelf SSOT 보호</div>
              <div className="text-[13px] text-violet-700 mt-1">
                기존 매장 구역도 (StoreZoneMap) · 상품정보 · 진열 위치 관리 기능은 Shelf SSOT (formatCompactDisplayLocation ·
                ShelfPositionsBadge) 보호 범위를 유지하면서 ProductInventoryDetailModal로 통합 예정.
                재고부족 · 진열 요청 KPI는 해당 summary endpoint 확정 후 추가.
              </div>
            </div>
          </div>
        </OverviewSection>
      </div>
      </>)}

      <ProductInventoryDetailModal open={detail != null} onClose={() => setDetail(null)} row={detail} />
    </div>
  );
};

export default InventoryDisplayOverview;
