// src/components/common/ProductDetailPanel.tsx
// 공용 상품 상세 패널 · 재고리스트(flow) 우측 패널 구조를 공용 컴포넌트로 추출
// 구성: 모바일fullscreen헤더 + 상단 ProductInfoCard + 기간 재고 흐름 차트 + 하단 ProductInfoCard(메타)
// 사용처: StockManagePage(flow/low/diff/product/supplier), SalesTrendPage(supplier/loss), OrderManagePage(order/need)

// 2026-08-17 · apiClient 마이그레이션
import React, { useEffect, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { X, Package, TrendingUp, ChevronRight, ChevronDown, Building2, ClipboardList, History, Info } from "lucide-react";
import { Spinner } from "./Spinner";
import { Card } from "./Card";
import { CollapseCard } from "./CollapseCard";
import { StatusPill } from "./StatusPill";
import { ProductInfoCard, PurchaseHistorySection } from "../ScanPage/ProductInfoCard";
import { type ProductInfo } from "../../lib/productsCache";
import { SeasonButtons } from "./SeasonButtons";
import { AccentBar } from "./AccentBar";
import { InlineLabel } from "./InlineLabel";
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
  /**
   * 공급사조회 버튼 클릭 콜백 · showChart 모드의 상단 헤더 카드에서 호출
   * 부모에서 supplierDetailModal 을 오픈하도록 연결
   */
  onSupplierInfoOpen?: (supplierName: string) => void;
}

// ── 내부: 기간 재고 흐름 차트 ──────────────────────────────────────────────

const StockFlowChart: React.FC<{ productCode: string; productName?: string }> = ({ productCode, productName }) => {
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // 2026-07-29 · 사용자 요청 · x축 그룹 · month(월중) / 10day(초순·중순·하순)
  const [xAxisMode, setXAxisMode] = useState<"month" | "10day">("month");
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
        const { data } = await api.get<any>(`/api/sales-trend/product?${params}`);
        const fetched: PeriodRow[] = Array.isArray(data) ? data : (data?.rows ?? []);
        if (!cancelled) {
          cache.current.set(cacheKey, fetched);
          setRows(fetched);
        }
      } catch { /* silent · 실패 시 빈 배열 유지 */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [productCode, season]);

  return (
    <Card variant="raw-sm" padding="sm" rounded="xl">
      {/* 2026-07-29 · 헤더 재정리 · 3영역으로 명확히 분리 */}
      {/* 월평균 판매량 · stock_history.sale_qty 합계 / 월수 (사용자 요청) */}
      {(() => { return null; })()}
      {/* 1행 · 제목 · 상품명 · 판매량 통계 · 화살표 */}
      {(() => {
        const totalSaleQty = rows.reduce((s, r) => s + (Number(r.sale_qty) || 0), 0);
        const monthSpan = season ? 12 : months;
        const avgMonthlySale = monthSpan > 0 ? Math.round(totalSaleQty / monthSpan) : 0;
        // 2026-07-29 · 최근 한달 (30일) 판매량 · rows 중 최근 30일 스냅샷 sale_qty 합계
        const now = new Date();
        const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const last30Sale = rows
          .filter(r => (r.snapshot_date ?? r.period_start_date ?? "") >= cutoffStr)
          .reduce((s, r) => s + (Number(r.sale_qty) || 0), 0);
        return (
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            className="w-full flex flex-col gap-1 hover:bg-zinc-50 -mx-1 px-1 py-1 rounded transition cursor-pointer mb-2 text-left"
            title={collapsed ? "펼치기" : "접기"}
          >
            {/* 1행 · 아이콘 · 제목 · 화살표 · 2026-08-17 · 딥네이비 통일 */}
            <div className="flex items-center gap-2">
              <AccentBar className="shrink-0" />
              <TrendingUp size={17} className="text-brand-deep shrink-0" />
              <span className="text-[16px] font-bold text-ink tracking-tight">기간별 상품흐름</span>
              {collapsed
                ? <ChevronRight size={17} className="ml-auto text-ink-soft shrink-0" />
                : <ChevronDown size={17} className="ml-auto text-brand-deep shrink-0" />}
            </div>
            {/* 2행 · 상품명 (줄바꿈) */}
            {productName && (
              <div className="text-[15px] font-bold text-ink break-words whitespace-normal leading-snug pl-[24px] tracking-tight">
                {productName}
              </div>
            )}
            {/* 3행 · 판매량 통계 (상품명 아래) */}
            {!collapsed && (totalSaleQty > 0 || last30Sale > 0) && (
              <div className="flex items-center gap-3 flex-wrap pl-[24px] text-[14px] tabular-nums font-medium text-ink-soft">
                {totalSaleQty > 0 && (
                  <span title={`stock_history.sale_qty 합계 ${totalSaleQty.toLocaleString()} / ${monthSpan}개월 = 월평균 ${avgMonthlySale}개`}>
                    월평균 판매 <span className="font-bold text-rose-700 text-[15px]">{avgMonthlySale.toLocaleString()}</span>개
                  </span>
                )}
                {last30Sale > 0 && (
                  <span title="최근 30일 판매량 (stock_history · snapshot_date >= 30일 전)">
                    최근 한달 판매 <span className="font-bold text-brand-deep text-[15px]">{last30Sale.toLocaleString()}</span>개
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })()}
      {!collapsed && (
        <>
          {/* 조회기간 행 · 2026-08-17 · 딥네이비 통일 · segmented pill */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <InlineLabel size="sm">조회기간</InlineLabel>
            <div className="inline-flex shrink-0 bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
              {([1, 2, 3, 4, 5, 6] as const).map(m => {
                const active = !season && months === m;
                return (
                  <button
                    key={m}
                    onClick={() => { setSeason(null); setMonths(m); }}
                    className={`min-w-[32px] min-h-[34px] px-2 py-0.5 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${active
                      ? "bg-brand-deep text-white shadow-sm"
                      : "text-ink hover:text-brand-deep hover:bg-white"
                    }`}
                  >{m}</button>
                );
              })}
              <span className="text-[14px] font-semibold text-ink-soft self-center px-1">개월</span>
            </div>
            <div className="shrink-0">
              <SeasonButtons value={season} onChange={setSeason} size="sm" hideLabel />
            </div>
          </div>
          {/* 단위 행 · 2026-08-17 · 폰트 +2 */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <InlineLabel size="sm">단위</InlineLabel>
            <div className="inline-flex shrink-0 bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
              <button onClick={() => setXAxisMode("month")}
                className={`min-h-[34px] px-3 py-0.5 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${xAxisMode === "month" ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}>월중</button>
              <button onClick={() => setXAxisMode("10day")}
                className={`min-h-[34px] px-3 py-0.5 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${xAxisMode === "10day" ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}>10일 (초·중·하순)</button>
            </div>
            <span className="text-[14px] font-medium text-ink-soft sm:ml-auto tracking-tight">매입 · 판매 · 폐기 · 손실</span>
          </div>
        </>
      )}
      {collapsed ? null : loading ? (
        <div className="flex flex-col items-center justify-center py-10 text-ink-soft gap-2">
          <Spinner size={36} tone="brand" />
          <div className="text-[14px] font-semibold tracking-tight">로딩 중...</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-[13px] text-ink-soft py-8 font-medium">기간 데이터 없음</div>
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
        // 2026-07-29 · x축 그룹 · month(월중) / 10day(초순·중순·하순)
        //   month · aggregateToMonths (기존) · "N월"
        //   10day · filled 그대로 · "N월 초순/중순/하순"
        const useMonthly = !season && xAxisMode === "month";
        const chartRows = season
          ? filled
          : (useMonthly ? aggregateToMonths(filled).slice(-months * 3) : filled.slice(-months * 3));
        const hasDisposal = chartRows.some(r => (r.disposal_qty ?? 0) > 0);
        // 10day 라벨 · period_type "early|mid|late" → 초순/중순/하순
        const partLabel = (pt: string | null | undefined): string => {
          if (pt === "early" || pt === "초순") return "초순";
          if (pt === "mid" || pt === "중순") return "중순";
          if (pt === "late" || pt === "하순") return "하순";
          return "";
        };
        const chartData = {
          labels: chartRows.map(r => {
            if (season) return periodLabel(r.period_start_date, r.snapshot_date);
            if (useMonthly) {
              const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date);
              return m ? `${Number(m[2])}월` : r.period_start_date;
            }
            // 10day 모드 · N월 초순/중순/하순
            const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date);
            const monthLabel = m ? `${Number(m[2])}월` : r.period_start_date;
            const part = partLabel(r.period_type);
            return part ? `${monthLabel} ${part}` : monthLabel;
          }),
          series: [
            { label: "매입",     color: "#10b981", kind: "bar"  as const, values: chartRows.map(r => Number(r.purchase_qty  ?? 0)), format: "count" as const },
            // 2026-07-28 · 사용자 요청 · 판매 · 꺽은선 그래프 · 붉은색
            { label: "판매",     color: "#dc2626", kind: "line" as const, values: chartRows.map(r => Number(r.sale_qty ?? 0)), format: "count" as const },
            ...(hasDisposal ? [{ label: "폐기", color: "#f43f5e", kind: "bar" as const, values: chartRows.map(r => Number(r.disposal_qty ?? 0)), format: "count" as const }] : []),
            // 2026-07-28 · 사용자 요청 · 시작재고 제거
            // 2026-07-29 · 종료재고 라인 제거 (사용자 요청)
            { label: "손실(참고)", color: "#f59e0b", kind: "line" as const,
              values: chartRows.map(r => (Number(r.opening_stock ?? 0) - Number(r.sale_qty ?? 0)) - Number(r.closing_stock ?? 0)),
              format: "count" as const },
          ],
        };
        return (
          /* 차트 overflow 래퍼 · 좁은 화면에서 x축 잘림 방지 */
          <div className="w-full overflow-x-auto -mx-1 px-1">
            <div className="min-w-[260px]">
              <MultiLineChart {...chartData} />
            </div>
          </div>
        );
      })()}
    </Card>
  );
};

// ── 빈 상태 (상품 미선택) ────────────────────────────────────────────────────

// 2026-08-17 · 최신 트렌드 · 폰트 +2 · brand-tint 아이콘 컨테이너 · Linear/Vercel 톤
export const ProductDetailEmpty: React.FC<{ message?: string; sub?: string }> = ({
  message = "리스트에서 상품을 클릭하세요",
  sub = "상세 정보 · 재고 현황 · 매입/판매가",
}) => (
  <Card variant="raw-sm" rounded="xl" className="flex-1 flex flex-col items-center justify-center p-10 min-h-[400px] gap-3">
    <div className="w-16 h-16 rounded-2xl bg-brand-tint flex items-center justify-center">
      <Package size={30} className="text-brand-deep/70" />
    </div>
    <div className="text-[15px] font-semibold text-ink tracking-tight">{message}</div>
    {sub && <div className="text-[13px] text-ink-soft">{sub}</div>}
  </Card>
);

// ── 모바일 fullscreen 헤더 · 2026-08-17 · 최신 트렌드 · accent bar + 폰트 +2 ──
export const ProductDetailMobileHeader: React.FC<{
  product: ProductInfo;
  onClose: () => void;
}> = ({ product, onClose }) => (
  <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-line shadow-sm">
    <div className="flex items-center gap-2.5 px-4 py-2">
      {/* 닫기 · 최소 44×44 접근성 · 딥네이비 톤 */}
      <button
        type="button"
        onClick={onClose}
        className="min-w-[44px] min-h-[44px] rounded-xl bg-white border border-line hover:border-brand-deep hover:bg-brand-tint flex items-center justify-center text-ink-soft hover:text-brand-deep cursor-pointer shrink-0 transition-colors"
        title="닫기"
        aria-label="닫기"
      >
        <X size={18} strokeWidth={2.4} />
      </button>
      <AccentBar size="xl" className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-bold text-ink break-keep whitespace-normal leading-tight tracking-tight">{product.name}</div>
        <div className="text-[13px] tabular-nums text-ink-soft break-words whitespace-normal leading-tight mt-0.5">
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
  onSupplierInfoOpen,
}) => {
  const handleRealMapUpdate = onRealMapUpdate ?? (() => {});

  if (!showChart) {
    // 단순 모드: ProductInfoCard 단독 (low/diff/product/supplier/loss/order/need 탭용)
    return (
      <Card padding="none" clip>
        <ProductInfoCard
          product={product}
          context={context}
          editable={editable}
          onRealMapUpdate={handleRealMapUpdate}
          onProductUpdate={onProductUpdate}
        />
      </Card>
    );
  }

  // 차트 모드: 상단 헤더(상품명·공급사) + 3탭(기간별상품흐름·매입이력·발주내역) + 하위 정보 카드
  // 2026-07-31 · 사용자 요청 · 3탭 구조 재편 · 공급사조회 버튼 추가
  return <ProductDetailChartMode
    product={product}
    onProductUpdate={onProductUpdate}
    onRealMapUpdate={handleRealMapUpdate}
    context={context}
    editable={editable}
    onSupplierInfoOpen={onSupplierInfoOpen}
  />;
};

// ── 상단 헤더 카드 (상품명 + 공급사 + 공급사조회 버튼) ─────────────────────────
// 2026-07-31 · 사용자 요청 · 우측 패널 최상단 · 상품명(크게) / 공급사 + 조회 버튼
const ProductHeaderCard: React.FC<{
  product: ProductInfo;
  onSupplierInfoOpen?: (supplierName: string) => void;
}> = ({ product, onSupplierInfoOpen }) => {
  const supplier = (product.supplier ?? "").toString().trim();
  const canOpenSupplier = !!supplier && !!onSupplierInfoOpen;
  return (
    /* 2026-08-17 · Linear/Vercel/Attio 규칙 · 히어로 카드 · Top hairline gradient (딱 1군데) + 뉴트럴 base */
    <div className="relative bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_20px_rgba(10,46,74,0.08)] overflow-hidden">
      {/* 상단 1px hairline gradient · 브랜드 accent → transparent · ONE 위치만 */}
      <div className="h-[2px] w-full bg-gradient-to-r from-brand-deep via-[#1E5A8F] to-transparent" />

      <div className="relative px-4 py-4">
        {/* 상품명 행 · brand-deep icon chip + 상품명 크게 */}
        <div className="relative flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-deep flex items-center justify-center shadow-[0_2px_8px_rgba(10,46,74,0.20)] shrink-0 ring-1 ring-brand/10">
            <Package size={20} className="text-white" strokeWidth={2.2} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="inline-flex items-center gap-1.5 mb-1">
              {/* status dot · 8px · Vercel 규칙 · 상태만 emerald */}
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
              <span className="text-[12px] font-semibold text-ink-soft uppercase tracking-widest">Product</span>
            </div>
            <div className="text-[19px] font-bold text-ink break-words whitespace-normal leading-tight tracking-tight">
              {product.name || "-"}
            </div>
          </div>
        </div>

        {/* 공급사 + 조회 버튼 · 뉴트럴 pill · icon 만 brand-deep */}
        <div className="relative mt-3.5 pt-3.5 border-t border-line/60 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-full bg-zinc-50 border border-line min-w-0 max-w-full">
            <Building2 size={15} className="text-brand-deep shrink-0" strokeWidth={2.3} />
            <span className="text-[15px] font-semibold text-ink truncate">
              {supplier || <span className="text-ink-soft font-medium">공급사 정보 없음</span>}
            </span>
          </div>
          {canOpenSupplier && (
            <button
              type="button"
              onClick={() => onSupplierInfoOpen!(supplier)}
              className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 text-[14px] font-semibold rounded-full border border-line bg-white text-ink-soft hover:border-brand-deep hover:bg-brand-tint hover:text-brand-deep transition-colors cursor-pointer shrink-0 shadow-sm"
              title={`공급사 정보 조회 · ${supplier}`}
            >
              공급사조회
              <ChevronRight size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 2026-07-16 · 차트 모드 · 각 섹션 접기/펼치기 지원
// 2026-07-31 · 사용자 요청 · 재편성 · 상단 헤더(상품명·공급사) → 3탭(흐름·매입·발주) → 하위 카드
// 2026-08-24 · 사용자 지시 · CollapseCard 2개 → 탭메뉴 통합 (총 5탭 · 좌우 길이 축소)
const ProductDetailChartMode: React.FC<{
  product: ProductInfo;
  onProductUpdate?: (u: Partial<ProductInfo>) => void;
  onRealMapUpdate: (v: string) => void;
  context: "scan" | "stock-manage" | "order-manage";
  editable: boolean;
  onSupplierInfoOpen?: (supplierName: string) => void;
}> = ({ product, onProductUpdate, onRealMapUpdate, context, editable, onSupplierInfoOpen }) => {
  // 2026-08-24 · 5탭 통합 · flow · purchase · order · inventory · info
  const [chartTab, setChartTab] = useState<"flow" | "purchase" | "order" | "inventory" | "info">("flow");
  return (
    <>
      {/* 상단 헤더 카드 · 상품명 + 공급사 + 공급사조회 (2026-07-31) */}
      <ProductHeaderCard product={product} onSupplierInfoOpen={onSupplierInfoOpen} />

      {/* 5탭 통합 · 기간별상품흐름 · 매입이력 · 발주내역 · 재고관리 · 상품정보 */}
      <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_16px_rgba(10,46,74,0.06)] overflow-hidden">
        <div className="relative flex border-b border-line bg-zinc-50/40 p-1.5 gap-1 overflow-x-auto">
          {([
            { key: "flow",      label: "상품흐름",  Icon: TrendingUp },
            { key: "purchase",  label: "매입이력",  Icon: History },
            { key: "order",     label: "발주내역",  Icon: ClipboardList },
            { key: "inventory", label: "재고관리",  Icon: Package },
            { key: "info",      label: "상품정보",  Icon: Info },
          ] as const).map(({ key, label, Icon }) => {
            const active = chartTab === key;
            const cls = active
              ? "text-ink bg-white shadow-sm ring-1 ring-line"
              : "text-ink-soft hover:text-ink hover:bg-white/70";
            return (
              <button key={key} type="button" onClick={() => setChartTab(key)}
                className={`relative flex-1 min-w-[80px] min-h-[42px] py-2 px-2 text-[14px] font-semibold rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 tracking-tight ${cls}`}
                title={label}>
                <Icon size={16} className={`shrink-0 ${active ? "text-brand-deep" : ""}`} strokeWidth={active ? 2.4 : 2} />
                <span className="truncate">{label}</span>
                {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-brand-deep" />}
              </button>
            );
          })}
        </div>
        <div>
          {(chartTab === "flow" || chartTab === "purchase" || chartTab === "order") && (
            /* 기존 PurchaseOrderTabs content 만 재사용 · 내부 탭바 숨김 (외부 5탭 이미 표시) */
            <PurchaseOrderTabs productCode={product.code} productName={product.name} initialTab={chartTab} hideTabs />
          )}
          {chartTab === "inventory" && (
            <div className="p-2">
              <ProductInfoCard
                product={product}
                context={context}
                editable={editable}
                onRealMapUpdate={onRealMapUpdate}
                onProductUpdate={onProductUpdate}
                sections={{
                  header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
                  orderRequest: true, financial: true, purchaseHistory: false,
                  productMeta: false, extraInfo: false,
                }}
              />
            </div>
          )}
          {chartTab === "info" && (
            <div className="p-2">
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
            </div>
          )}
        </div>
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
  /** 상단 헤더 카드 공급사조회 버튼 클릭 콜백 (showChart 모드에서만 노출) */
  onSupplierInfoOpen?: (supplierName: string) => void;
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
  onSupplierInfoOpen,
}) => (
  <div
    className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 transition-transform duration-150 ${
      selected
        ? /* 모바일+태블릿(<lg): fullscreen 오버레이 · lg+: 정적 패널 */
          "fixed inset-0 z-50 bg-zinc-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible"
        : ""
    }`}
  >
    {/* 모바일+태블릿 전용 sticky 헤더 (lg+ 에서 lg:hidden 으로 자동 숨김) */}
    {selected && <ProductDetailMobileHeader product={selected} onClose={onClose} />}
    {!selected ? (
      <ProductDetailEmpty message={emptyMessage} sub={emptySub} />
    ) : (
      /* 모바일+태블릿 fullscreen 내부 측면·하단 여백 · lg+ 에서 제거 */
      <div className="flex flex-col gap-3 px-3 pb-8 pt-1 lg:px-0 lg:pb-0 lg:pt-0">
        <ProductDetailPanel
          product={selected}
          onProductUpdate={onProductUpdate}
          onRealMapUpdate={onRealMapUpdate}
          onClose={onClose}
          showChart={showChart}
          context={context}
          editable={editable}
          onSupplierInfoOpen={onSupplierInfoOpen}
        />
      </div>
    )}
  </div>
);

// 2026-07-29 · 매입이력 · 발주내역 탭 전환 컴포넌트
// 2026-07-31 · 사용자 요청 · 기간별상품흐름 탭 추가 (첫 번째 · default) · 3탭 구조
//   flow · 기간별상품흐름 (StockFlowChart 재사용)
//   purchase · 매입이력 (PurchaseHistorySection)
//   order · 발주내역 (order-requests API)
interface OrderRequestRow {
  id: string;
  product_code: string;
  product_name: string;
  supplier?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  requested_at?: string | null;
  status?: string | null;
  memo?: string | null;
}
type FlowTabKey = "flow" | "purchase" | "order";
const PurchaseOrderTabs: React.FC<{ productCode: string; productName?: string; initialTab?: FlowTabKey; hideTabs?: boolean }> = ({ productCode, productName, initialTab, hideTabs = false }) => {
  // 2026-08-24 · initialTab · 부모 5탭에서 활성 탭 지정 · hideTabs · 내부 탭바 숨김 (부모가 탭 이미 표시)
  const [tab, setTab] = useState<FlowTabKey>(initialTab ?? "flow");
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const [orders, setOrders] = useState<OrderRequestRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  useEffect(() => {
    if (tab !== "order" || !productCode) return;
    setOrdersLoading(true);
    api.get<any>(`/api/order-requests?product_code=${encodeURIComponent(productCode)}`)
      .then(({ data: j }) => {
        const raw = (j != null && typeof j === "object" && "rows" in j) ? (j as { rows: unknown }).rows : j;
        setOrders(Array.isArray(raw) ? (raw as OrderRequestRow[]) : []);
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [tab, productCode]);
  // 2026-08-24 · hideTabs · 부모(5탭)에서 이미 탭 표시 · 내부 탭 UI 스킵 · content 만 렌더
  const cardWrapCls = hideTabs
    ? ""
    : "bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_16px_rgba(10,46,74,0.06)] overflow-hidden";
  return (
    /* 2026-08-17 · Attio "carved" segmented · 단일 brand accent · 폰트 +2 */
    <div className={cardWrapCls}>
      {!hideTabs && (
      <div className="relative flex border-b border-line bg-zinc-50/40 p-1.5 gap-1">
        {(["flow", "purchase", "order"] as const).map(k => {
          const active = tab === k;
          const label = k === "flow" ? "기간별 상품흐름" : k === "purchase" ? "매입이력" : "발주내역";
          const Icon = k === "flow" ? TrendingUp : k === "purchase" ? History : ClipboardList;
          const cls = active
            ? "text-ink bg-white shadow-sm ring-1 ring-line"
            : "text-ink-soft hover:text-ink hover:bg-white/70";
          return (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`relative flex-1 min-h-[42px] py-2 px-2 text-[14px] font-semibold rounded-xl transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 tracking-tight ${cls}`}
              title={label}>
              <Icon size={16} className={`shrink-0 ${active ? "text-brand-deep" : ""}`} strokeWidth={active ? 2.4 : 2} />
              <span className="truncate">{label}</span>
              {/* 활성 · 하단 2px accent · Linear 규칙 */}
              {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-brand-deep" />}
            </button>
          );
        })}
      </div>
      )}
      {tab === "flow" ? (
        /* 탭 UI 내부 · 기존 StockFlowChart 카드 스타일이 이미 white bg + border 이므로
           중첩 border 방지 위해 padding 만 최소로 유지 · 사용자 UX 동일 */
        <div className="p-2">
          <StockFlowChart productCode={productCode} productName={productName} />
        </div>
      ) : tab === "purchase" ? (
        <div className="px-3 py-2">
          <PurchaseHistorySection productCode={productCode} productName={productName} noBorderTop />
        </div>
      ) : (
        <div className="px-3 py-2">
          {ordersLoading ? (
            <div className="py-6 text-center text-[13px] text-ink-soft font-medium">발주내역 로딩...</div>
          ) : orders.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-ink-soft font-medium">이 상품의 발주내역이 없습니다</div>
          ) : (
            /* 2026-08-17 · 최신 트렌드 · 폰트 +2 · 딥네이비 헤더 톤 · status 는 semantic 색 유지 */
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[14px] min-w-[340px]">
                <thead className="text-[13px] font-semibold text-ink-soft border-b border-line bg-zinc-50/60">
                  <tr>
                    <th className="text-left px-3 py-2.5 whitespace-nowrap tracking-tight">요청일시</th>
                    <th className="text-left px-3 py-2.5 tracking-tight">공급사</th>
                    <th className="text-right px-3 py-2.5 w-16 tracking-tight">현재고</th>
                    <th className="text-right px-3 py-2.5 w-14 tracking-tight">적정</th>
                    <th className="text-center px-3 py-2.5 w-16 tracking-tight">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-brand-tint/40 transition-colors">
                      <td className="px-3 py-2 tabular-nums text-ink-soft text-[13px] whitespace-nowrap">
                        {o.requested_at ? new Date(o.requested_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="px-3 py-2 text-[14px] text-ink font-medium break-words">{o.supplier ?? "-"}</td>
                      <td className="px-3 py-2 text-[14px] text-right tabular-nums text-amber-700 font-bold">{o.current_stock ?? "-"}</td>
                      <td className="px-3 py-2 text-[14px] text-right tabular-nums text-ink-soft">{o.optimal_stock ?? "-"}</td>
                      <td className="px-3 py-2 text-center">
                        {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                        <StatusPill
                          tone={o.status === "done" ? "emerald" : o.status === "sent" ? "brand" : "amber"}
                          size="sm"
                        >
                          {o.status ?? "대기"}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
