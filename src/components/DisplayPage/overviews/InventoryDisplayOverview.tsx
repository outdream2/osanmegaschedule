// src/components/DisplayPage/overviews/InventoryDisplayOverview.tsx
// 2026-10-09 · GLOBAL UI · 재고·진열 통합 대시보드 · 한 페이지 통합 + Modal
//   · listExpiryImminentProducts · listInventoryChecks real
//   · 각 섹션 row click → OrderDetailModal (상품/실재고 상세)
//   · Shelf SSOT 보호

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Package, Storefront, Clock, ListChecks, Warning, MapPinArea, Barcode, SquaresFour } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";
import { listExpiryImminentProducts } from "../../../lib/productsApi";
import { listInventoryChecks } from "../../../lib/inventoryChecksApi";
import { OrderDetailModal, type OrderDetailRow } from "./OrderDetailModal";

export interface InventoryDisplayOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

type AnyRow = Record<string, any>;

export const InventoryDisplayOverview: React.FC<InventoryDisplayOverviewProps> = ({ onSelectSubTab }) => {
  const [expiry, setExpiry] = useState<AnyRow[] | null>(null);
  const [checks, setChecks] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrderDetailRow | null>(null);

  useEffect(() => {
    let alive = true;
    listExpiryImminentProducts().then((r: any) => { if (alive) setExpiry(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setExpiry([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    listInventoryChecks().then((r: any) => { if (alive) setChecks(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setChecks([]); });
    return () => { alive = false; };
  }, []);

  const q = search.trim().toLowerCase();

  const expiryRows = useMemo(() => {
    if (!expiry) return [];
    return (q ? expiry.filter(r => String(r.product_name ?? "").toLowerCase().includes(q) || String(r.product_code ?? "").toLowerCase().includes(q)) : expiry).slice(0, 10);
  }, [expiry, q]);

  const checkRows = useMemo(() => {
    if (!checks) return [];
    return (q ? checks.filter(r => String(r.product_name ?? r.product_code ?? "").toLowerCase().includes(q)) : checks).slice(0, 6);
  }, [checks, q]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const openDetail = useCallback((row: AnyRow) => {
    setSelected({
      id: row.id,
      product_code: row.product_code,
      product_name: row.product_name,
      note: row.expiry_date ? `유통기한: ${row.expiry_date}` : row.note,
      items: [{
        product_code: row.product_code,
        product_name: row.product_name,
        order_qty: row.current_stock,
        unit_price: null,
        amount: null,
      }],
    });
  }, []);

  const section = (opts: { key: string; icon: React.ReactNode; title: string; sub?: string; rightLabel?: string; onClick: () => void }) => (
    <button key={opts.key} type="button" onClick={opts.onClick}
      className="w-full flex items-center gap-2 px-2 h-10 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
      <span className="shrink-0 text-ink-soft">{opts.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{opts.title}</div>
        {opts.sub && <div className="text-[12px] text-ink-soft truncate">{opts.sub}</div>}
      </div>
      {opts.rightLabel && <span className="text-[14px] font-bold tabular-nums shrink-0 text-amber-700">{opts.rightLabel}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow active="overview" tabs={[{ key: "overview", label: "현황" }]} onSelect={() => {}} />
      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품명·코드 검색" />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Clock size={16} weight="fill" />} label="유통기한 임박" value={kpiValue(expiry?.length)} unit="건" tone="amber" hint="만료 임박" />
        <OverviewKpi icon={<ListChecks size={16} weight="fill" />} label="실재고 체크" value={kpiValue(checks?.length)} unit="건" tone="brand" hint="누적 기록" />
        <OverviewKpi icon={<Package size={16} weight="fill" />} label="재고 부족" value="-" tone="rose" hint="상품 메뉴 확인" />
        <OverviewKpi icon={<Storefront size={16} weight="fill" />} label="진열 요청" value="-" tone="violet" hint="진열 메뉴 확인" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OverviewSection
          title={<span>유통기한 임박 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">{expiry?.length ?? 0}건</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("purchase")} className="text-[13px] font-semibold text-brand-deep hover:underline">전체보기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {expiry == null ? <div className="py-4 text-center text-[13px] text-ink-soft/70">로딩 중…</div>
              : expiryRows.length === 0 ? <div className="py-4 text-center text-[13px] text-ink-soft/70">임박 상품이 없습니다</div>
              : expiryRows.slice(0, 6).map(r => section({
                  key: String(r.product_code ?? r.id),
                  icon: <Clock size={14} className="text-amber-500" />,
                  title: String(r.product_name ?? "-"),
                  sub: `${r.product_code ?? ""} · 재고 ${r.current_stock ?? "-"}`,
                  rightLabel: String(r.expiry_date ?? r.expiry ?? "-"),
                  onClick: () => openDetail(r),
                }))}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>실재고 체크 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">{checks?.length ?? 0}건</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("purchase")} className="text-[13px] font-semibold text-brand-deep hover:underline">전체보기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {checks == null ? <div className="py-4 text-center text-[13px] text-ink-soft/70">로딩 중…</div>
              : checkRows.length === 0 ? <div className="py-4 text-center text-[13px] text-ink-soft/70">실재고 체크 기록이 없습니다</div>
              : checkRows.map((r, i) => section({
                  key: String(r.id ?? i),
                  icon: <ListChecks size={14} className="text-brand-deep" />,
                  title: String(r.product_name ?? r.product_code ?? "-"),
                  sub: String(r.checked_at ?? r.created_at ?? "").slice(0, 10),
                  onClick: () => openDetail(r),
                }))}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>진열 · 위치 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">매장 구역도</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("store")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "disp-1", icon: <SquaresFour size={14} className="text-violet-500" />, title: "매장 구역도", sub: "진열 · 담당자 배정", onClick: () => onSelectSubTab("store") })}
            {section({ key: "disp-2", icon: <MapPinArea size={14} />, title: "진열 위치", sub: "구역·위치 조회", onClick: () => onSelectSubTab("store") })}
            {section({ key: "disp-3", icon: <Warning size={14} className="text-rose-500" />, title: "진열 요청 · 이상", sub: "미등록 · 요청건", onClick: () => onSelectSubTab("store") })}
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>상품정보 · 바로가기</span>}
          action={<button type="button" onClick={() => onSelectSubTab("purchase")} className="text-[13px] font-semibold text-brand-deep hover:underline">상품 전체</button>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
            {section({ key: "sub-1", icon: <Package size={14} className="text-brand-deep" />, title: "상품정보", sub: "마스터·조회", onClick: () => onSelectSubTab("purchase") })}
            {section({ key: "sub-2", icon: <ListChecks size={14} className="text-emerald-600" />, title: "실재고 확인", sub: "재고 체크", onClick: () => onSelectSubTab("purchase") })}
            {section({ key: "sub-3", icon: <Clock size={14} className="text-amber-500" />, title: "유통기한", sub: "임박 확인", onClick: () => onSelectSubTab("purchase") })}
            {section({ key: "sub-4", icon: <Barcode size={14} />, title: "바코드 조회", sub: "스캔 · 검색", onClick: () => onSelectSubTab("purchase") })}
          </div>
        </OverviewSection>
      </div>

      <OrderDetailModal open={selected != null} onClose={() => setSelected(null)} order={selected} />
    </div>
  );
};

export default InventoryDisplayOverview;
