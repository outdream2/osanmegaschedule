// src/components/LandingPage/VendorStockPage.tsx
// 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 전환
//   · 대시보드(좌 · KPI + 기간 필터) + 리스트(우 · 검색 + 정렬 테이블) 구조
//   · SplitPanel · KpiCard · SearchBar · StatusPill · SaleStatusFilter · Card 프레임워크 사용
//   · 데이터 · GET /api/products-search?supplier=VENDOR_NAME&limit=1000
//   · 기간 필터 · UI 만 · 상품재고는 시점 데이터 (백엔드 시계열 API 확장 후 실적용) · 안내 배너 표시
//
// UI 대원칙 준수 · Attio/Linear 톤 · 화이트 베이스 · 폰트 +2 규칙 (13px+)
// 회귀 방지 · 기존 VendorStockModal 은 그대로 두되 · LandingPage 진입점만 페이지 이동으로 변경

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Package, PackageCheck, PackageX, AlertTriangle, CalendarRange } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { PAGE_CONTAINER_CLS, TEXT } from "../../styles/tokens";
import { SplitPanel } from "../common/SplitPanel";
import { SearchBar } from "../common/SearchBar";
import { KpiCard } from "../common/KpiCard";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { SplitLeftHeader } from "../common/SplitLeftHeader";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { matchesProductQuery } from "../../lib/productMatch";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import type { AuthSession } from "../../types";

// ─── 타입 ──────────────────────────────────────────────────────────────
interface VendorProduct {
  code: string;
  name: string;
  spec?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  min_stock?: number | null;
  sale_status?: string | null;
}

interface VendorStockPageProps {
  vendorName: string;
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── 정렬 컬럼 ────────────────────────────────────────────────────────
type SortKey = "code" | "name" | "current_stock" | "optimal_stock" | "min_stock" | "status";

// 재고상태 우선순위 (없음=0, 부족=1, 정상=2)
function stockStateOrder(p: VendorProduct): number {
  const cur = Number(p.current_stock ?? 0);
  const minS = Number(p.min_stock ?? 0);
  if (cur <= 0) return 0;
  if (minS > 0 && cur < minS) return 1;
  return 2;
}

const COMPARATORS: Record<SortKey, Comparator<VendorProduct>> = {
  code: (a, b) => (a.code ?? "").localeCompare(b.code ?? ""),
  name: (a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"),
  current_stock: (a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0),
  optimal_stock: (a, b) => Number(a.optimal_stock ?? 0) - Number(b.optimal_stock ?? 0),
  min_stock: (a, b) => Number(a.min_stock ?? 0) - Number(b.min_stock ?? 0),
  status: (a, b) => stockStateOrder(a) - stockStateOrder(b),
};

// ─── 재고상태 판정 ────────────────────────────────────────────────────
type StockLevel = "normal" | "low" | "none";
function getStockLevel(p: VendorProduct): StockLevel {
  const cur = Number(p.current_stock ?? 0);
  const minS = Number(p.min_stock ?? 0);
  if (cur <= 0) return "none";
  if (minS > 0 && cur < minS) return "low";
  return "normal";
}

// ─── 기간 프리셋 ──────────────────────────────────────────────────────
type PeriodPreset = "1m" | "3m" | "6m" | "custom" | null;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function shiftMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── 페이지 컴포넌트 ──────────────────────────────────────────────────
export const VendorStockPage: React.FC<VendorStockPageProps> = ({
  vendorName,
  authSession,
  onBack,
  onNavigate,
  onLogout,
}) => {
  // ─── 데이터 상태 ────────────────────────────────────────────────────
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // 기간 필터 (UI 만 · 시계열 API 확장 후 적용)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 판매중 필터 (default active · localStorage)
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({
    storageKey: "vendorStock.saleFilter",
  });

  const { toast, showError } = useToast(4000);

  // ─── 데이터 로드 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!vendorName) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data } = await api.get<{ items?: any[] }>(
          `/api/products-search?supplier=${encodeURIComponent(vendorName)}&limit=1000`,
        );
        if (!alive) return;
        const items: VendorProduct[] = Array.isArray(data?.items)
          ? data.items.map((it: any) => ({
              code: String(it.code ?? it.product_code ?? ""),
              name: String(it.name ?? it.product_name ?? ""),
              spec: it.spec ?? null,
              current_stock: it.current_stock ?? null,
              optimal_stock: it.optimal_stock ?? null,
              min_stock: it.min_stock ?? null,
              sale_status: it.sale_status ?? null,
            }))
          : [];
        setProducts(items);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : "조회 실패";
        setError(msg);
        showError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [vendorName, showError]);

  // ─── 판매중 · 검색 필터 ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!saleMatches(p.sale_status)) return false;
      if (!search) return true;
      return matchesProductQuery(
        { product_name: p.name, product_code: p.code },
        search,
      );
    });
  }, [products, search, saleMatches]);

  // ─── 정렬 ───────────────────────────────────────────────────────────
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<VendorProduct, SortKey>(
    filtered,
    "name",
    COMPARATORS,
    "asc",
  );

  // ─── KPI 집계 (필터 이후 기준 · 사용자 관점 실측) ────────────────────
  const kpi = useMemo(() => {
    let normal = 0;
    let low = 0;
    let none = 0;
    let totalStock = 0;
    for (const p of filtered) {
      const lv = getStockLevel(p);
      if (lv === "normal") normal += 1;
      else if (lv === "low") low += 1;
      else none += 1;
      totalStock += Number(p.current_stock ?? 0);
    }
    return {
      total: filtered.length,
      normal,
      low,
      none,
      totalStock,
    };
  }, [filtered]);

  // ─── 기간 프리셋 핸들러 ─────────────────────────────────────────────
  const applyPreset = useCallback((preset: Exclude<PeriodPreset, null | "custom">) => {
    const now = new Date();
    const months = preset === "1m" ? -1 : preset === "3m" ? -3 : -6;
    const from = shiftMonths(now, months);
    setDateFrom(formatDate(from));
    setDateTo(formatDate(now));
    setPeriodPreset(preset);
  }, []);

  const clearPeriod = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setPeriodPreset(null);
  }, []);

  const periodActive = !!(dateFrom || dateTo);

  // ─── 정렬 아이콘 ────────────────────────────────────────────────────
  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";
  const hdrCls =
    "px-3 py-2 cursor-pointer hover:bg-zinc-100 transition select-none text-[15px] font-semibold text-zinc-500";

  // ─── 좌측 대시보드 ──────────────────────────────────────────────────
  const dashboardNode = (
    <div className="flex flex-col gap-4 p-4">
      <SplitLeftHeader
        icon={<Package size={17} />}
        title="재고 대시보드"
        subtitle={<span className="text-[15px] text-ink-soft">공급사 상품 · ERP 현재고 기준</span>}
      />

      {/* KPI 4개 · 2x2 grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard
          icon={<Package size={14} />}
          label="총 상품수"
          value={kpi.total}
          unit="종"
          tone="brand"
          isActive={kpi.total > 0}
        />
        <KpiCard
          icon={<PackageCheck size={14} />}
          label="재고 있음"
          value={kpi.normal}
          unit="종"
          tone="emerald"
          isActive={kpi.normal > 0}
        />
        <KpiCard
          icon={<AlertTriangle size={14} />}
          label="재고 부족"
          value={kpi.low}
          unit="종"
          tone="amber"
          hint="최소재고 미만"
          isActive={kpi.low > 0}
        />
        <KpiCard
          icon={<PackageX size={14} />}
          label="재고 없음"
          value={kpi.none}
          unit="종"
          tone="rose"
          isActive={kpi.none > 0}
        />
      </div>

      {/* 총 재고 요약 */}
      <Card padding="md" variant="sm">
        <div className="flex items-center justify-between">
          <span className={`${TEXT.label} text-ink-soft`}>총 재고 수량</span>
          <span className="text-[19px] font-bold text-brand-deep tabular-nums">
            {kpi.totalStock.toLocaleString()}
          </span>
        </div>
      </Card>

      {/* 기간 필터 */}
      <Card padding="md" variant="sm">
        <div className="flex items-center gap-1.5 mb-2.5">
          <CalendarRange size={14} className="text-brand-deep" />
          <span className={`${TEXT.label} text-ink`}>기간 필터</span>
        </div>

        {/* 프리셋 버튼 3개 */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {(["1m", "3m", "6m"] as const).map((k) => {
            const label = k === "1m" ? "1개월" : k === "3m" ? "3개월" : "6개월";
            const active = periodPreset === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => applyPreset(k)}
                className={[
                  "h-8 rounded-md text-[15px] font-semibold border transition-all",
                  active
                    ? "bg-brand-deep text-white border-brand-deep shadow-sm"
                    : "bg-white text-ink-soft border-line hover:border-brand-deep hover:text-brand-deep",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 직접 지정 date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPeriodPreset("custom");
            }}
            className="flex-1 min-w-0 h-8 px-2 text-[15px] border border-line rounded-md focus:outline-none focus:border-brand-deep"
          />
          <span className="text-zinc-400 text-[15px]">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPeriodPreset("custom");
            }}
            className="flex-1 min-w-0 h-8 px-2 text-[15px] border border-line rounded-md focus:outline-none focus:border-brand-deep"
          />
        </div>

        {periodActive && (
          <button
            type="button"
            onClick={clearPeriod}
            className="mt-2 w-full h-7 text-[14px] font-semibold text-ink-soft bg-zinc-50 border border-line rounded-md hover:bg-zinc-100 transition"
          >
            기간 필터 초기화
          </button>
        )}

        {/* 안내 · 시계열 API 확장 후 실적용 */}
        <div className="mt-2.5 px-2.5 py-2 rounded-md bg-amber-50/70 border border-amber-200/70">
          <div className="text-[14px] text-amber-800 leading-relaxed">
            <span className="font-bold">안내</span> · 현재는 시점 재고만 표시됩니다.
            매입이력 시계열 연동 후 · 기간별 입출고 통계가 적용될 예정입니다.
          </div>
        </div>
      </Card>
    </div>
  );

  // ─── 우측 리스트 ────────────────────────────────────────────────────
  const listNode = (
    <div className="flex flex-col h-full min-h-0">
      {/* 상단 툴바 · SearchBar + 판매중 필터 */}
      <div className="shrink-0 p-4 pb-3 border-b border-line bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="상품명 · 코드 검색 (초성 지원)"
              resultCount={sorted.length}
              historyKey="megatown_vendorStockPage_search"
              accent="sky"
              widthClass="w-full"
            />
          </div>
          <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
        </div>
      </div>

      {/* 리스트 body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={18} tone="zinc" label="불러오는 중..." labelSize={14} />
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[14px] font-bold">
              <AlertTriangle size={16} />
              {error}
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-16 text-center text-ink-soft text-[15px]">
            {search ? "검색 결과가 없습니다" : "표시할 상품이 없습니다"}
          </div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="sticky top-0 bg-zinc-50 border-b border-line z-10">
              <tr>
                <th className="text-center px-2 py-2 w-10 text-[15px] font-semibold text-zinc-500">#</th>
                <th className={`${hdrCls} text-left w-28`} onClick={() => toggleSort("code")}>
                  상품코드{sortIcon("code")}
                </th>
                <th className={`${hdrCls} text-left`} onClick={() => toggleSort("name")}>
                  상품명{sortIcon("name")}
                </th>
                <th className={`${hdrCls} text-center w-24`} onClick={() => toggleSort("status")}>
                  재고상태{sortIcon("status")}
                </th>
                <th className={`${hdrCls} text-right w-20`} onClick={() => toggleSort("current_stock")}>
                  현재고{sortIcon("current_stock")}
                </th>
                <th className={`${hdrCls} text-right w-20`} onClick={() => toggleSort("min_stock")}>
                  최소{sortIcon("min_stock")}
                </th>
                <th className={`${hdrCls} text-right w-20`} onClick={() => toggleSort("optimal_stock")}>
                  적정{sortIcon("optimal_stock")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sorted.map((p, i) => {
                const level = getStockLevel(p);
                const pillTone = level === "normal" ? "emerald" : level === "low" ? "amber" : "rose";
                const pillLabel = level === "normal" ? "정상" : level === "low" ? "부족" : "없음";
                return (
                  <tr key={`${p.code}-${i}`} className="hover:bg-sky-50/40 transition-colors">
                    <td className="text-center px-2 py-2 text-zinc-400 tabular-nums text-[15px]">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2 font-mono text-[15px] text-zinc-600 tabular-nums">
                      {p.code}
                    </td>
                    <td className="px-3 py-2 font-semibold text-ink break-words whitespace-normal leading-tight">
                      {p.name}
                    </td>
                    <td className="text-center px-3 py-2">
                      <StatusPill tone={pillTone} size="xs" dot>
                        {pillLabel}
                      </StatusPill>
                    </td>
                    <td className="text-right px-3 py-2 font-bold text-brand-deep tabular-nums">
                      {p.current_stock ?? "-"}
                    </td>
                    <td className="text-right px-3 py-2 text-zinc-500 tabular-nums">
                      {p.min_stock ?? "-"}
                    </td>
                    <td className="text-right px-3 py-2 text-zinc-500 tabular-nums">
                      {p.optimal_stock ?? "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <AppNavHeader
        activePage="vendor-stock"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          <StatusPill tone="brand" size="md" icon={<Package size={12} />}>
            <span className="hidden sm:inline">공급사 재고</span>
          </StatusPill>
        }
      />

      <div className={`${PAGE_CONTAINER_CLS} max-w-[1600px] flex-1 flex flex-col px-4 sm:px-6 py-4 gap-3 min-h-0`}>
        {/* 페이지 헤더 · 공급사명 크게 */}
        <Card padding="md" variant="sm" topAccent>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
              <Package size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-ink-soft leading-tight">공급사 재고현황</div>
              <div className="text-[22px] font-bold text-ink tracking-tight leading-tight truncate">
                {vendorName || "-"}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <StatusPill tone="emerald" size="sm" dot>
                승인 완료
              </StatusPill>
            </div>
          </div>
        </Card>

        {/* SplitPanel · 좌 대시보드 / 우 리스트
              · wrapLeft/wrapRight true (기본) · 프레임워크의 .split-left/.split-right 자동 적용
              · 별도 raw wrapper 없이 프리미티브 재사용 (Card 스타일 = split-left/right 클래스로 통일) */}
        <div className="flex-1 min-h-0">
          <SplitPanel
            storageKey="vendorStockPage.dashboardWidth"
            defaultWidth={360}
            minWidth={280}
            maxWidth={520}
            dividerColor="indigo"
            mobileRightAsModal={false}
            left={dashboardNode}
            right={listNode}
            style={{ minHeight: "calc(100vh - 240px)" }}
          />
        </div>
      </div>

      {/* Toast · 조회 실패 등 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

export default VendorStockPage;
