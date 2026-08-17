// src/components/common/ProductDetailPanel.tsx
// 공용 상품 상세 패널 · 재고리스트(flow) 우측 패널 구조를 공용 컴포넌트로 추출
// 구성: 모바일fullscreen헤더 + 상단 ProductInfoCard + 기간 재고 흐름 차트 + 하단 ProductInfoCard(메타)
// 사용처: StockManagePage(flow/low/diff/product/supplier), SalesTrendPage(supplier/loss), OrderManagePage(order/need)

// 2026-08-17 · apiClient 마이그레이션
import React, { useEffect, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { X, Package, TrendingUp, ChevronRight, ChevronDown, Building2, ClipboardList, History } from "lucide-react";
import { ProductInfoCard, PurchaseHistorySection } from "../ScanPage/ProductInfoCard";
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
    <div className="bg-white rounded-xl border border-line p-3 shadow-sm">
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
            {/* 1행 · 아이콘 · 제목 · 화살표 */}
            <div className="flex items-center gap-1.5">
              <TrendingUp size={14} className="text-teal-600 shrink-0" />
              <span className="text-[13px] font-bold text-zinc-800">기간별 상품흐름</span>
              {collapsed
                ? <ChevronRight size={14} className="ml-auto text-zinc-400 shrink-0" />
                : <ChevronDown size={14} className="ml-auto text-zinc-600 shrink-0" />}
            </div>
            {/* 2행 · 상품명 (줄바꿈) */}
            {productName && (
              <div className="text-[12px] font-bold text-zinc-900 break-words whitespace-normal leading-snug pl-5">
                {productName}
              </div>
            )}
            {/* 3행 · 판매량 통계 (상품명 아래) */}
            {!collapsed && (totalSaleQty > 0 || last30Sale > 0) && (
              <div className="flex items-center gap-3 flex-wrap pl-5 text-[11px] tabular-nums font-semibold text-zinc-600">
                {totalSaleQty > 0 && (
                  <span title={`stock_history.sale_qty 합계 ${totalSaleQty.toLocaleString()} / ${monthSpan}개월 = 월평균 ${avgMonthlySale}개`}>
                    월평균 판매 <span className="font-bold text-rose-700 text-[12px]">{avgMonthlySale.toLocaleString()}</span>개
                  </span>
                )}
                {last30Sale > 0 && (
                  <span title="최근 30일 판매량 (stock_history · snapshot_date >= 30일 전)">
                    최근 한달 판매 <span className="font-bold text-teal-700 text-[12px]">{last30Sale.toLocaleString()}</span>개
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })()}
      {!collapsed && (
        <>
          {/* 조회기간 행 · 개월 버튼 + 계절 버튼 · 넘칠 때 flex-wrap으로 다음 줄 */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-teal-700 shrink-0">조회기간</span>
            {/* 개월 버튼 그룹 · shrink-0 으로 버튼 뭉침 방지 */}
            <div className="inline-flex shrink-0 bg-zinc-100 border border-line rounded-lg p-0.5">
              {([1, 2, 3, 4, 5, 6] as const).map(m => {
                const active = !season && months === m;
                return (
                  <button
                    key={m}
                    onClick={() => { setSeason(null); setMonths(m); }}
                    className={`min-w-[28px] min-h-[32px] px-2 py-0.5 text-[11px] font-bold rounded-md transition cursor-pointer ${active
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900 hover:bg-white"
                    }`}
                  >{m}</button>
                );
              })}
              <span className="text-[12px] font-bold text-zinc-500 self-center px-1">개월</span>
            </div>
            {/* 계절 버튼 · shrink-0 으로 좁아져도 유지 */}
            <div className="shrink-0">
              <SeasonButtons value={season} onChange={setSeason} size="sm" hideLabel />
            </div>
          </div>
          {/* 단위 행 · 월중/10일 · 범례 좁을 때 자동 wrap */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[12px] font-bold text-zinc-600 shrink-0">단위</span>
            <div className="inline-flex shrink-0 bg-zinc-100 border border-line rounded-lg p-0.5">
              <button onClick={() => setXAxisMode("month")}
                className={`min-h-[32px] px-2.5 py-0.5 text-[11px] font-bold rounded-md transition cursor-pointer ${xAxisMode === "month" ? "bg-white text-teal-700 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}>월중</button>
              <button onClick={() => setXAxisMode("10day")}
                className={`min-h-[32px] px-2.5 py-0.5 text-[11px] font-bold rounded-md transition cursor-pointer ${xAxisMode === "10day" ? "bg-white text-teal-700 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"}`}>10일 (초·중·하순)</button>
            </div>
            {/* 범례 · sm+ 에서 우측 정렬 · 좁으면 다음 줄 */}
            <span className="text-[11px] font-semibold text-zinc-400 sm:ml-auto">매입 · 판매 · 폐기 · 손실</span>
          </div>
        </>
      )}
      {collapsed ? null : loading ? (
        <div className="flex flex-col items-center justify-center py-10 text-zinc-400 gap-2">
          <div className="w-8 h-8 border-4 border-line border-t-teal-500 rounded-full animate-spin" />
          <div className="text-sm font-bold">로딩 중...</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-[12px] text-zinc-300 py-8">기간 데이터 없음</div>
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
    </div>
  );
};

// ── 빈 상태 (상품 미선택) ────────────────────────────────────────────────────

// 2026-08-17 · 최신 트렌드 · 폰트 +2 · brand-tint 아이콘 컨테이너 · Linear/Vercel 톤
export const ProductDetailEmpty: React.FC<{ message?: string; sub?: string }> = ({
  message = "리스트에서 상품을 클릭하세요",
  sub = "상세 정보 · 재고 현황 · 매입/판매가",
}) => (
  <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 min-h-[400px] gap-3 shadow-sm">
    <div className="w-16 h-16 rounded-2xl bg-brand-tint flex items-center justify-center">
      <Package size={30} className="text-brand-deep/70" />
    </div>
    <div className="text-[15px] font-semibold text-ink tracking-tight">{message}</div>
    {sub && <div className="text-[13px] text-ink-soft">{sub}</div>}
  </div>
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
      <span className="w-[3px] h-[24px] rounded-full bg-brand-deep shrink-0" />
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
      <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
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
    <div className="bg-white rounded-xl border border-line shadow-sm px-3 py-2.5">
      {/* 상품명 · 큰 글씨 · 클릭 안됨 */}
      <div className="text-[13px] font-bold text-zinc-900 break-words whitespace-normal leading-snug">
        {product.name || "-"}
      </div>
      {/* 공급사 + 조회 버튼 */}
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        <Building2 size={12} className="text-zinc-400 shrink-0" />
        <span className="text-[12px] font-bold text-zinc-700 break-words whitespace-normal">
          {supplier || <span className="text-zinc-400 font-semibold">공급사 정보 없음</span>}
        </span>
        {canOpenSupplier && (
          <button
            type="button"
            onClick={() => onSupplierInfoOpen!(supplier)}
            className="ml-auto min-h-[32px] px-2.5 py-1 text-[11px] font-bold rounded-md border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 active:bg-sky-200 transition cursor-pointer shrink-0"
            title={`공급사 정보 조회 · ${supplier}`}
          >
            공급사조회
          </button>
        )}
      </div>
    </div>
  );
};

// 2026-07-16 · 차트 모드 · 각 섹션 접기/펼치기 지원
// 2026-07-31 · 사용자 요청 · 재편성 · 상단 헤더(상품명·공급사) → 3탭(흐름·매입·발주) → 하위 카드
const ProductDetailChartMode: React.FC<{
  product: ProductInfo;
  onProductUpdate?: (u: Partial<ProductInfo>) => void;
  onRealMapUpdate: (v: string) => void;
  context: "scan" | "stock-manage" | "order-manage";
  editable: boolean;
  onSupplierInfoOpen?: (supplierName: string) => void;
}> = ({ product, onProductUpdate, onRealMapUpdate, context, editable, onSupplierInfoOpen }) => {
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [metaCollapsed, setMetaCollapsed] = useState(false);
  return (
    <>
      {/* 상단 헤더 카드 · 상품명 + 공급사 + 공급사조회 (2026-07-31 · 사용자 요청) */}
      <ProductHeaderCard product={product} onSupplierInfoOpen={onSupplierInfoOpen} />

      {/* 3탭 · 기간별상품흐름 · 매입이력 · 발주내역 (2026-07-31 · 사용자 요청) */}
      <PurchaseOrderTabs productCode={product.code} productName={product.name} />

      {/* 상단 카드: 헤더 + 재고현황 + 매입판매가 + 발주요청 + 배정구역 · 접기 지원 (매입이력 분리됨) */}
      <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setTopCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-3 min-h-[44px] py-2 hover:bg-zinc-50 transition cursor-pointer border-b border-zinc-100"
          title={topCollapsed ? "펼치기" : "접기"}
        >
          {topCollapsed
            ? <ChevronRight size={14} className="text-zinc-400 shrink-0" />
            : <ChevronDown size={14} className="text-zinc-600 shrink-0" />}
          <Package size={16} className="text-zinc-500 shrink-0" />
          <span className="text-[13px] font-bold text-zinc-800 break-keep whitespace-normal leading-tight text-left">재고 · 매입판매가 · 발주 · 배정구역</span>
          {topCollapsed && <span className="text-[12px] font-bold text-zinc-400 ml-1 shrink-0">— 펼치기</span>}
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
              orderRequest: true, financial: true, purchaseHistory: false,
              productMeta: false, extraInfo: false,
            }}
          />
        )}
      </div>

      {/* 하단 카드: 상품코드 · 공급처 · 판매상태 · 최근매입일 + 브랜드 · 제조사 · 바코드 · 유효기간 · 메모 · 접기 지원 */}
      <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setMetaCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-3 min-h-[44px] py-2 hover:bg-zinc-50 transition cursor-pointer border-b border-zinc-100"
          title={metaCollapsed ? "펼치기" : "접기"}
        >
          {metaCollapsed
            ? <ChevronRight size={14} className="text-zinc-400 shrink-0" />
            : <ChevronDown size={14} className="text-zinc-600 shrink-0" />}
          <Package size={16} className="text-zinc-500 shrink-0" />
          <span className="text-[13px] font-bold text-zinc-800 break-keep whitespace-normal leading-tight text-left">상품 정보 · 추가 정보</span>
          {metaCollapsed && <span className="text-[12px] font-bold text-zinc-400 ml-1 shrink-0">— 펼치기</span>}
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
const PurchaseOrderTabs: React.FC<{ productCode: string; productName?: string }> = ({ productCode, productName }) => {
  const [tab, setTab] = useState<FlowTabKey>("flow");
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
  return (
    <div className="bg-white rounded-xl border border-line shadow-sm overflow-hidden">
      <div className="flex border-b border-line bg-zinc-50/50">
        {(["flow", "purchase", "order"] as const).map(k => {
          const active = tab === k;
          const label = k === "flow" ? "기간별 상품흐름" : k === "purchase" ? "매입이력" : "발주내역";
          const Icon = k === "flow" ? TrendingUp : k === "purchase" ? History : ClipboardList;
          const activeColor = k === "flow" ? "text-teal-700 border-teal-500"
                             : k === "purchase" ? "text-emerald-700 border-emerald-500"
                             : "text-sky-700 border-sky-500";
          const cls = active ? activeColor : "text-zinc-500 border-transparent hover:text-zinc-700";
          return (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`flex-1 min-h-[44px] py-2 px-2 text-[12px] font-bold border-b-2 transition cursor-pointer flex items-center justify-center gap-1 ${cls}`}
              title={label}>
              <Icon size={13} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
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
            <div className="py-6 text-center text-[13px] text-zinc-400">발주내역 로딩...</div>
          ) : orders.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-zinc-400">이 상품의 발주내역이 없습니다</div>
          ) : (
            // 발주내역 테이블 · 가로 스크롤 허용 · min-width 로 컬럼 겹침 방지
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[11px] min-w-[320px]">
                <thead className="text-[10px] font-bold text-zinc-500 border-b border-zinc-100">
                  <tr>
                    <th className="text-left px-2 py-1.5 whitespace-nowrap">요청일시</th>
                    <th className="text-left px-2 py-1.5">공급사</th>
                    <th className="text-right px-2 py-1.5 w-12">현재고</th>
                    <th className="text-right px-2 py-1.5 w-10">적정</th>
                    <th className="text-center px-2 py-1.5 w-12">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {orders.map(o => (
                    <tr key={o.id} className="hover:bg-sky-50/40">
                      <td className="px-2 py-1 tabular-nums text-zinc-600 text-[11px] whitespace-nowrap">
                        {o.requested_at ? new Date(o.requested_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-zinc-700 break-words">{o.supplier ?? "-"}</td>
                      <td className="px-2 py-1 text-[11px] text-right tabular-nums text-amber-700 font-bold">{o.current_stock ?? "-"}</td>
                      <td className="px-2 py-1 text-[11px] text-right tabular-nums text-zinc-600">{o.optimal_stock ?? "-"}</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 border whitespace-nowrap ${
                          o.status === "done" ? "bg-emerald-50 text-emerald-700 border-emerald-300" :
                          o.status === "sent" ? "bg-sky-50 text-sky-700 border-sky-300" :
                          "bg-amber-50 text-amber-700 border-amber-300"
                        }`}>
                          {o.status ?? "대기"}
                        </span>
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
