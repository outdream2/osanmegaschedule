// src/components/common/ProductDetailPanel.tsx
// 공용 상품 상세 패널 · 재고리스트(flow) 우측 패널 구조를 공용 컴포넌트로 추출
// 구성: 모바일fullscreen헤더 + 상단 ProductInfoCard + 기간 재고 흐름 차트 + 하단 ProductInfoCard(메타)
// 사용처: StockManagePage(flow/low/diff/product/supplier), SalesTrendPage(supplier/loss), OrderManagePage(order/need)

import React, { useEffect, useRef, useState } from "react";
import { X, Package, TrendingUp } from "lucide-react";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { type ProductInfo } from "../../lib/productsCache";
import { SeasonButtons } from "./SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import {
  MultiLineChart,
  periodLabel,
  fillPeriodsWithRows,
  aggregateToMonths,
  type PeriodRow,
} from "../../lib/stockPeriodUtils";

// ── Props ───────────────────────────────────────────────────────────────────

export interface ProductDetailPanelProps {
  product: ProductInfo;
  /** 상품 필드 편집 후 부모 state 동기화 */
  onProductUpdate?: (u: Partial<ProductInfo>) => void;
  /** 실제배치구역 변경 후 부모 state 동기화 */
  onRealMapUpdate?: (v: string) => void;
  /** 닫기 버튼 클릭 (모바일 fullscreen 헤더) */
  onClose?: () => void;
  /**
   * 재고 흐름 차트 표시 여부.
   * true(default)면 flow 탭 구조(상단카드 + 차트 + 하단메타카드) 렌더.
   * false면 단순 ProductInfoCard(stock-manage 전체 섹션) 렌더 (flow 탭 외 탭용).
   */
  showChart?: boolean;
  /** ProductInfoCard context (default: "stock-manage") */
  context?: "scan" | "stock-manage" | "order-manage";
  /** 인라인 편집 여부 (default: true) */
  editable?: boolean;
}

// ── 내부: 기간 재고 흐름 차트 ──────────────────────────────────────────────

const StockFlowChart: React.FC<{ productCode: string }> = ({ productCode }) => {
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const cache = useRef<Map<string, PeriodRow[]>>(new Map());

  useEffect(() => {
    if (!productCode) { setRows([]); return; }
    const cacheKey = `${productCode}::${season ?? ""}`;
    const cached = cache.current.get(cacheKey);
    if (cached) { setRows(cached); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ code: productCode });
        if (season) params.set("season", season);
        else params.set("months", "6");
        const r = await fetch(`/api/sales-trend/product?${params}`);
        if (!r.ok) return;
        const data = await r.json();
        const fetched: PeriodRow[] = Array.isArray(data) ? data : (data.rows ?? []);
        if (!cancelled) {
          cache.current.set(cacheKey, fetched);
          setRows(fetched);
        }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [productCode, season]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 shrink-0 hover:bg-slate-50 -mx-1 px-1 py-0.5 rounded transition cursor-pointer"
          title={collapsed ? "펼치기" : "접기"}
        >
          <span className={`text-slate-400 text-xs transition-transform ${collapsed ? "" : "rotate-90"}`}>▶</span>
          <TrendingUp size={14} className="text-teal-600" />
          <span className="text-sm font-black text-slate-700">기간별 재고 흐름</span>
          {!collapsed && <span className="text-[10px] font-semibold text-slate-400">(매입 · 폐기 · 시작 · 종료 · 손실)</span>}
        </button>
        {!collapsed && (
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <div className="inline-flex items-center gap-1">
            <span className="text-[9px] font-black text-teal-700 uppercase tracking-wider">기간</span>
            <div className="inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5">
              {([1, 2, 3, 4, 5, 6] as const).map(m => {
                const active = months === m;
                return (
                  <button
                    key={m}
                    onClick={() => { setSeason(null); setMonths(m); }}
                    className={`min-w-[24px] px-1.5 py-0.5 text-[10px] font-black rounded-md transition cursor-pointer ${active
                      ? "bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white"
                    }`}
                  >{m}</button>
                );
              })}
              <span className="text-[9px] font-bold text-slate-400 self-center px-1">개월</span>
            </div>
          </div>
          <SeasonButtons value={season} onChange={setSeason} size="sm" hideLabel />
        </div>
        )}
      </div>
      {collapsed ? null : loading ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
          <div className="text-xs font-black">로딩 중...</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-[11px] text-slate-300 py-8">기간 데이터 없음</div>
      ) : (() => {
        const filled = fillPeriodsWithRows(
          rows,
          season ? 400 : months * 30,
          (start, end, period_type): PeriodRow => ({
            period_start_date: start,
            snapshot_date: end,
            period_type,
            opening_stock: 0, purchase_qty: 0, sale_qty: 0, disposal_qty: 0, closing_stock: 0,
          }),
        );
        const isMonthly = !season;
        const chartRows = season ? filled : aggregateToMonths(filled).slice(-months * 3);
        const hasDisposal = chartRows.some(r => (r.disposal_qty ?? 0) > 0);
        const chartData = {
          labels: chartRows.map(r => isMonthly
            ? (() => { const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date); return m ? `${Number(m[2])}월` : r.period_start_date; })()
            : periodLabel(r.period_start_date, r.snapshot_date)
          ),
          series: [
            { label: "매입",     color: "#10b981", kind: "bar"  as const, values: chartRows.map(r => Number(r.purchase_qty  ?? 0)), format: "count" as const },
            ...(hasDisposal ? [{ label: "폐기", color: "#f43f5e", kind: "bar" as const, values: chartRows.map(r => Number(r.disposal_qty ?? 0)), format: "count" as const }] : []),
            { label: "시작재고", color: "#94a3b8", kind: "line" as const, values: chartRows.map(r => Number(r.opening_stock ?? 0)), format: "count" as const },
            { label: "종료재고", color: "#6366f1", kind: "line" as const, values: chartRows.map(r => Number(r.closing_stock ?? 0)), format: "count" as const },
            { label: "손실(참고)", color: "#f59e0b", kind: "line" as const,
              values: chartRows.map(r => (Number(r.opening_stock ?? 0) - Number(r.sale_qty ?? 0)) - Number(r.closing_stock ?? 0)),
              format: "count" as const },
          ],
        };
        return <MultiLineChart {...chartData} />;
      })()}
    </div>
  );
};

// ── 빈 상태 (상품 미선택) ────────────────────────────────────────────────────

export const ProductDetailEmpty: React.FC<{ message?: string; sub?: string }> = ({
  message = "리스트에서 상품을 클릭하세요",
  sub = "상세 정보 · 재고 현황 · 매입/판매가",
}) => (
  <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
    <Package size={40} className="mb-3 opacity-30" />
    <div className="text-sm font-bold">{message}</div>
    {sub && <div className="text-[11px] mt-1">{sub}</div>}
  </div>
);

// ── 모바일 fullscreen 헤더 ────────────────────────────────────────────────────

export const ProductDetailMobileHeader: React.FC<{
  product: ProductInfo;
  onClose: () => void;
}> = ({ product, onClose }) => (
  <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
    <div className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onClose}
        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0"
        title="닫기"
      >
        <X size={16} strokeWidth={2.4} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-black text-slate-800 truncate leading-tight">{product.name}</div>
        <div className="text-[10px] font-mono text-slate-500 truncate">
          #{product.code} · {product.supplier ?? "-"}
        </div>
      </div>
    </div>
  </div>
);

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export const ProductDetailPanel: React.FC<ProductDetailPanelProps> = ({
  product,
  onProductUpdate,
  onRealMapUpdate,
  // onClose is handled by ProductDetailRightPanel wrapper; not used directly here
  showChart = true,
  context = "stock-manage",
  editable = true,
}) => {
  const handleRealMapUpdate = onRealMapUpdate ?? (() => {});

  if (!showChart) {
    // 단순 모드: ProductInfoCard 단독 (low/diff/product/supplier/loss/order/need 탭용)
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <ProductInfoCard
          product={product}
          context={context}
          editable={editable}
          onRealMapUpdate={handleRealMapUpdate}
          onProductUpdate={onProductUpdate}
        />
      </div>
    );
  }

  // 차트 모드: 차트(맨위) + 상단카드 + 하단 메타카드 (2026-07-16 · 사용자 요청 · 순서 변경 · 각 섹션 접기/펼치기)
  return <ProductDetailChartMode
    product={product}
    onProductUpdate={onProductUpdate}
    onRealMapUpdate={handleRealMapUpdate}
    context={context}
    editable={editable}
  />;
};

// 2026-07-16 · 차트 모드 · 각 섹션 접기/펼치기 지원 · 차트 맨 위
const ProductDetailChartMode: React.FC<{
  product: ProductInfo;
  onProductUpdate?: (u: Partial<ProductInfo>) => void;
  onRealMapUpdate: (v: string) => void;
  context: "scan" | "stock-manage" | "order-manage";
  editable: boolean;
}> = ({ product, onProductUpdate, onRealMapUpdate, context, editable }) => {
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [metaCollapsed, setMetaCollapsed] = useState(false);
  return (
    <>
      {/* 기간 재고 흐름 차트 (2026-07-16 · 맨 위로 이동 · 사용자 요청) */}
      <StockFlowChart productCode={product.code} />

      {/* 상단 카드: 헤더 + 재고현황 + 매입판매가 + 발주요청 + 배정구역 + 매입이력 · 접기 지원 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setTopCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition cursor-pointer border-b border-slate-100"
          title={topCollapsed ? "펼치기" : "접기"}
        >
          <span className={`text-slate-400 text-xs transition-transform ${topCollapsed ? "" : "rotate-90"}`}>▶</span>
          <Package size={12} className="text-slate-500" />
          <span className="text-[11px] font-black text-slate-600">재고 · 매입판매가 · 발주 · 배정구역 · 매입이력</span>
          {topCollapsed && <span className="text-[10px] font-semibold text-slate-400 ml-1">— 클릭하여 펼치기</span>}
        </button>
        {!topCollapsed && (
          <ProductInfoCard
            product={product}
            context={context}
            editable={editable}
            onRealMapUpdate={onRealMapUpdate}
            onProductUpdate={onProductUpdate}
            sections={{
              header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
              orderRequest: true, financial: true, purchaseHistory: true,
              productMeta: false, extraInfo: false,
            }}
          />
        )}
      </div>

      {/* 하단 카드: 상품코드 · 공급처 · 판매상태 · 최근매입일 + 브랜드 · 제조사 · 바코드 · 유효기간 · 메모 · 접기 지원 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setMetaCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition cursor-pointer border-b border-slate-100"
          title={metaCollapsed ? "펼치기" : "접기"}
        >
          <span className={`text-slate-400 text-xs transition-transform ${metaCollapsed ? "" : "rotate-90"}`}>▶</span>
          <TrendingUp size={12} className="text-slate-500" />
          <span className="text-[11px] font-black text-slate-600">상품 정보 (코드 · 공급처 · 판매상태 · 브랜드 · 제조사 · 바코드 · 유효기간 · 메모)</span>
          {metaCollapsed && <span className="text-[10px] font-semibold text-slate-400 ml-1">— 클릭하여 펼치기</span>}
        </button>
        {!metaCollapsed && (
          <ProductInfoCard
            product={product}
            context={context}
            editable={editable}
            onRealMapUpdate={onRealMapUpdate}
            onProductUpdate={onProductUpdate}
            sections={{
              header: false, zoneAssignment: false, stockStatus: false, actualStockInput: false,
              orderRequest: false, financial: false, purchaseHistory: false,
              productMeta: true, extraInfo: true,
            }}
          />
        )}
      </div>
    </>
  );
};

// ── 우측 패널 래퍼 (fullscreen 모달 + 빈 상태 포함 · 중복 제거용) ──────────────

export interface ProductDetailRightPanelProps {
  selected: ProductInfo | null;
  onClose: () => void;
  onProductUpdate?: (u: Partial<ProductInfo>) => void;
  onRealMapUpdate?: (v: string) => void;
  showChart?: boolean;
  context?: "scan" | "stock-manage" | "order-manage";
  editable?: boolean;
  emptyMessage?: string;
  emptySub?: string;
}

/**
 * 우측 패널 전체 래퍼:
 * - 모바일 fullscreen (fixed inset-0) 처리
 * - 빈 상태(상품 미선택) 처리
 * - ProductDetailPanel 렌더
 *
 * 사용법:
 *   <ProductDetailRightPanel
 *     selected={selectedProduct}
 *     onClose={() => setSelectedProduct(null)}
 *     onProductUpdate={...}
 *     onRealMapUpdate={...}
 *     showChart   // flow 탭만 true
 *   />
 */
export const ProductDetailRightPanel: React.FC<ProductDetailRightPanelProps> = ({
  selected,
  onClose,
  onProductUpdate,
  onRealMapUpdate,
  showChart = false,
  context = "stock-manage",
  editable = true,
  emptyMessage,
  emptySub,
}) => (
  <div
    className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${
      selected ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""
    }`}
  >
    {selected && <ProductDetailMobileHeader product={selected} onClose={onClose} />}
    {!selected ? (
      <ProductDetailEmpty message={emptyMessage} sub={emptySub} />
    ) : (
      <ProductDetailPanel
        product={selected}
        onProductUpdate={onProductUpdate}
        onRealMapUpdate={onRealMapUpdate}
        onClose={onClose}
        showChart={showChart}
        context={context}
        editable={editable}
      />
    )}
  </div>
);
