// src/components/LandingPage/VendorStockPage.tsx
// 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 전환
// 2026-09-18 · f8045e8e · 응답 형식 fix + supplier only 검색 지원 (크리티컬)
// 2026-09-18 · #303 · SupplierTab 구조 재사용 · 좌 제품 리스트 · 우 상세 (사용자 지시)
//
// 안전 규칙 · API 호출 · state · handler · props 시그니처 완전 유지 · UI 만 변경

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, AlertTriangle, RefreshCw } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { SplitPanel } from "../common/SplitPanel";
import { SearchBar } from "../common/SearchBar";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { SplitListPanel } from "../common/SplitListPanel";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { matchesProductQuery } from "../../lib/productMatch";
import { type ProductInfo } from "../../lib/productsCache";
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
  // 판매량 · products-search 응답에 last_snapshot_qty 있으면 사용
  last_snapshot_qty?: number | null;
  supplier?: string | null;
  display_location?: string | null;
}

interface VendorStockPageProps {
  vendorName: string;
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── 정렬 컬럼 ────────────────────────────────────────────────────────
type SortKey = "code" | "name" | "current_stock" | "optimal_stock" | "min_stock" | "status" | "sale_qty";

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
  sale_qty: (a, b) => Number(a.last_snapshot_qty ?? 0) - Number(b.last_snapshot_qty ?? 0),
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

function fmtNum(v: number | null | undefined): string {
  if (v == null || v === 0) return "-";
  return Number(v).toLocaleString();
}

// ─── VendorProduct → ProductInfo 변환 ────────────────────────────────
function toProductInfo(p: VendorProduct): ProductInfo {
  return {
    code: p.code,
    name: p.name,
    spec: p.spec ?? "",
    location: p.display_location ?? null,
    current_stock: p.current_stock ?? null,
    optimal_stock: p.optimal_stock ?? null,
    min_stock: p.min_stock ?? null,
    supplier: p.supplier ?? null,
  };
}

// ─── 정렬 헤더 셀 ─────────────────────────────────────────────────────
function SortTh({
  children,
  sortKey: k,
  currentKey,
  currentDir,
  onToggle,
  className = "",
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: "asc" | "desc";
  onToggle: (k: SortKey) => void;
  className?: string;
}) {
  const active = currentKey === k;
  const arrow = active ? (currentDir === "desc" ? " ▼" : " ▲") : "";
  return (
    <th
      onClick={() => onToggle(k)}
      className={[
        "py-2 cursor-pointer select-none hover:bg-zinc-50 transition text-[15px] font-bold text-zinc-500 uppercase tracking-wider",
        active ? "text-zinc-800" : "",
        className,
      ].join(" ")}
    >
      {children}
      <span className={active ? "text-zinc-600" : "text-zinc-300"}>{arrow || " ⇅"}</span>
    </th>
  );
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

  // 선택 상품 (우측 상세)
  const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);

  // 판매중 필터 (default active · localStorage)
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({
    storageKey: "vendorStock.saleFilter",
  });

  const { toast, showError } = useToast(4000);

  // ─── 데이터 로드 ────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    if (!vendorName) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // 2026-09-18 · 사용자 지시 fix · 응답 형식 호환 · API 는 배열 직접 반환 · legacy { items } 도 지원
        const { data } = await api.get<any>(
          `/api/products-search?supplier=${encodeURIComponent(vendorName)}&limit=1000`,
        );
        if (!alive) return;
        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        const items: VendorProduct[] = rows.map((it: any) => ({
          code: String(it.code ?? it.product_code ?? ""),
          name: String(it.name ?? it.product_name ?? ""),
          spec: it.spec ?? null,
          current_stock: it.current_stock ?? null,
          optimal_stock: it.optimal_stock ?? null,
          min_stock: it.min_stock ?? null,
          sale_status: it.sale_status ?? null,
          last_snapshot_qty: it.last_snapshot_qty ?? null,
          supplier: it.supplier ?? vendorName,
          display_location: it.display_location ?? it.location ?? null,
        }));
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

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup ?? undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorName]);

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
    "status",
    COMPARATORS,
    "asc",
  );

  // ─── 상품 클릭 → 우측 상세 ──────────────────────────────────────────
  const handleProductClick = useCallback((p: VendorProduct) => {
    setSelectedProduct(toProductInfo(p));
  }, []);

  // ─── 좌측 · 제품 리스트 ─────────────────────────────────────────────
  const listNode = (
    <SplitListPanel
      topAccent
      title={
        <span className="inline-flex items-center gap-1.5">
          <Package size={14} className="text-brand-deep shrink-0" />
          <span className="text-[17px] font-bold text-ink">제품 리스트</span>
        </span>
      }
      countDisplay={
        <span className="text-[16px] font-semibold tabular-nums text-zinc-400 bg-zinc-50 border border-line rounded px-1.5 py-0.5">
          {sorted.length}종
        </span>
      }
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="상품명 · 코드 검색 (초성 지원)"
      filters={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[16px] font-semibold text-zinc-400 uppercase tracking-wider">필터</span>
          <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-brand-tint hover:border-brand-deep text-zinc-400 hover:text-brand-deep transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            {loading ? <Spinner size={13} tone="zinc" /> : <RefreshCw size={13} />}
          </button>
        </div>
      }
      bodyClassName="relative flex-1 overflow-auto"
    >
      {/* 로딩 오버레이 · 기존 데이터 있을 때 */}
      {loading && products.length > 0 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 backdrop-blur-[1px] pointer-events-none">
          <Spinner size={24} tone="sky" label="불러오는 중..." labelSize={15} />
        </div>
      )}

      {/* 상태별 렌더 */}
      {sorted.length === 0 ? (
        loading ? (
          <LoadingState tone="sky" size="compact" label="데이터 로딩중..." />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[16px] font-bold">
              <AlertTriangle size={15} />
              {error}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Package}
            title={search ? "검색 결과 없음" : "표시할 상품이 없습니다"}
            hint={search ? `"${search}" 에 해당하는 상품이 없습니다` : undefined}
            size="compact"
          />
        )
      ) : (
        <>
          {/* ── 모바일 카드뷰 (md 미만) ── */}
          <div className={`md:hidden flex flex-col divide-y divide-zinc-100 ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            {sorted.map((p, idx) => {
              const level = getStockLevel(p);
              const pillTone = level === "normal" ? "emerald" : level === "low" ? "amber" : "rose";
              const pillLabel = level === "normal" ? "정상" : level === "low" ? "부족" : "없음";
              const isSelected = selectedProduct?.code === p.code;
              const cur = Number(p.current_stock ?? 0);
              return (
                <button
                  key={`${p.code}-${idx}-m`}
                  type="button"
                  onClick={() => handleProductClick(p)}
                  className={[
                    "w-full text-left px-4 py-3 transition-colors min-h-[44px] flex flex-col gap-1.5",
                    isSelected
                      ? "bg-brand-tint/60 border-l-2 border-brand-deep"
                      : "hover:bg-brand-tint/30",
                  ].join(" ")}
                >
                  {/* Row 1: 상품명 */}
                  <span className={`text-[16px] font-semibold leading-snug whitespace-normal break-words break-keep ${isSelected ? "text-sky-800" : "text-zinc-700"}`}>
                    {p.name}
                  </span>
                  {/* Row 2: 코드 + 규격 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] text-zinc-400 font-medium">{p.code}</span>
                    {p.spec && <span className="text-[13px] text-zinc-300 whitespace-normal break-words">{p.spec}</span>}
                  </div>
                  {/* Row 3: 재고 수치 + 상태 */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-[14px] font-semibold tabular-nums ${level === "none" ? "text-rose-600" : level === "low" ? "text-amber-600" : "text-zinc-700"}`}>
                      현재고 {cur > 0 ? cur.toLocaleString() : "0"}
                    </span>
                    {p.last_snapshot_qty != null && (
                      <span className="text-[13px] font-medium text-zinc-500 tabular-nums">판매 {fmtNum(p.last_snapshot_qty)}</span>
                    )}
                    <StatusPill tone={pillTone} size="xs" dot>{pillLabel}</StatusPill>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── PC 표뷰 (md 이상) ── */}
          <table
            className={`hidden md:table w-full text-[16px] min-w-[480px] ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}
            style={{ borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead className="sticky top-0 z-10 bg-zinc-100/70 border-b border-line">
              <tr>
                <th className="text-center py-2 w-8 text-[15px] font-bold text-zinc-500 uppercase tracking-wider">#</th>
                <SortTh
                  sortKey="name"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onToggle={toggleSort}
                  className="text-left px-3"
                >
                  상품명
                </SortTh>
                <SortTh
                  sortKey="current_stock"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onToggle={toggleSort}
                  className="text-right px-3 w-20"
                >
                  현재고
                </SortTh>
                <SortTh
                  sortKey="sale_qty"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onToggle={toggleSort}
                  className="text-right px-3 w-20"
                >
                  판매량
                </SortTh>
                <SortTh
                  sortKey="optimal_stock"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onToggle={toggleSort}
                  className="text-right px-3 w-20"
                >
                  적정재고
                </SortTh>
                <SortTh
                  sortKey="status"
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onToggle={toggleSort}
                  className="text-center px-3 w-20"
                >
                  상태
                </SortTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sorted.map((p, idx) => {
                const level = getStockLevel(p);
                const pillTone = level === "normal" ? "emerald" : level === "low" ? "amber" : "rose";
                const pillLabel = level === "normal" ? "정상" : level === "low" ? "부족" : "없음";
                const isSelected = selectedProduct?.code === p.code;
                const cur = Number(p.current_stock ?? 0);
                const saleQty = p.last_snapshot_qty;

                return (
                  <tr
                    key={`${p.code}-${idx}`}
                    onClick={() => handleProductClick(p)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-brand-tint/60 hover:bg-brand-tint"
                        : "hover:bg-brand-tint/30"
                    }`}
                    title="클릭 → 오른쪽 패널에 상세"
                  >
                    <td className="text-center py-2 text-[16px] font-semibold text-zinc-400 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="text-left px-3 py-2 align-top">
                      <div className="flex flex-col leading-tight gap-0.5">
                        <span
                          className={`text-[17px] font-semibold break-words whitespace-normal leading-snug ${
                            isSelected ? "text-sky-800" : "text-zinc-700"
                          }`}
                        >
                          {p.name}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[15px] text-zinc-400 font-medium">{p.code}</span>
                          {p.spec && (
                            <span className="text-[14px] text-zinc-300 break-words whitespace-normal">{p.spec}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`text-right px-3 py-2 text-[17px] tabular-nums font-semibold ${
                      level === "none" ? "text-rose-600" : level === "low" ? "text-amber-600" : "text-zinc-700"
                    }`}>
                      {cur > 0 ? cur.toLocaleString() : <span className="text-rose-400 font-bold">0</span>}
                    </td>
                    <td className="text-right px-3 py-2 text-[17px] tabular-nums font-semibold text-zinc-500">
                      {fmtNum(saleQty)}
                    </td>
                    <td className="text-right px-3 py-2 text-[17px] tabular-nums font-semibold text-zinc-500">
                      {fmtNum(p.optimal_stock)}
                    </td>
                    <td className="text-center px-3 py-2">
                      <StatusPill tone={pillTone} size="xs" dot>
                        {pillLabel}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </SplitListPanel>
  );

  // ─── 우측 · 제품 상세 정보 ─────────────────────────────────────────
  const detailNode = (
    <ProductDetailRightPanel
      selected={selectedProduct}
      onClose={() => setSelectedProduct(null)}
      showChart={true}
      context="stock-manage"
      editable={false}
      emptyMessage="제품을 클릭하세요"
      emptySub="왼쪽 리스트에서 상품을 선택하면 상세 정보가 표시됩니다"
    />
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
          <div className="flex items-center gap-2">
            <StatusPill tone="brand" size="md" icon={<Package size={12} />}>
              <span className="hidden sm:inline">{vendorName || "공급사"}</span>
            </StatusPill>
            <StatusPill tone="emerald" size="sm" dot>
              <span className="hidden sm:inline">승인 완료</span>
            </StatusPill>
          </div>
        }
      />

      <div className={`${PAGE_CONTAINER_CLS} max-w-[1600px] flex-1 flex flex-col px-4 sm:px-6 py-4 gap-3 min-h-0`}>
        {/* SplitPanel · 좌 제품 리스트 / 우 상세 */}
        <div className="flex-1 min-h-0">
          <SplitPanel
            storageKey="vendorStockPage.listWidth"
            defaultWidth={480}
            minWidth={320}
            maxWidth={700}
            dividerColor="indigo"
            mobileRightAsModal={true}
            left={listNode}
            right={detailNode}
            style={{ minHeight: "calc(100vh - 180px)" }}
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
