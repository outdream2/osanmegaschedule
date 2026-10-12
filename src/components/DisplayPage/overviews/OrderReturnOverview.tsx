// src/components/DisplayPage/overviews/OrderReturnOverview.tsx
// 2026-10-09 · GLOBAL UI · 발주·반품 Overview · 현황판보드 · 사용자 피드백 전면 반영
//   · 상단 inner tabs · 현황 / 발주필요 / 발주이력 / 발주·매입 대조
//   · 현황 · 컴팩트 pipeline strip (text) + 각 프로세스 현황판보드 (list + chart)
//   · 아이콘 badge 금지 · plain icon only
//   · 폰트 리밸런싱 · 컬러 포인트 (top accent bar · progress bar · 숫자 톤 컬러)
//   · 각 보드 click → modal · modal row click → OrderDetailModal

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ShoppingCart, Package, ClipboardText, GitDiff, Warning, Clock,
  X, ArrowRight, CaretRight, Gauge, Buildings, Calendar, EnvelopeSimple, ArrowsLeftRight,
  Trash, PaperPlaneTilt, PencilSimple, Check,
  type Icon as IconType,
} from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewPageHeader, OverviewToolbar, OverviewTable, StoreStatusBadge, type OverviewTableColumn } from "./StoreOverviewPrimitives";
import { listOrderRequests, createOrderRequest, bulkSendOrderRequests, type OrderRequestRow } from "../../../lib/orderRequestsApi";
import { useConfirm } from "../../../hooks/useConfirm";
import { useToast } from "../../../hooks/useToast";
import { api } from "../../../lib/apiClient";
import type { OrderDetailRow } from "./OrderDetailModal";
// 2026-10-09 · 사용자 지시 · OLD 페이지 그대로 embed 금지 · NEW UI 유지하면서 기능만 재구성
// 2026-10-12 · #16 Step 1 · 반품 통합 · ReturnUnifiedPanel (상 반품필요 + 하 반품확정)
import ReturnUnifiedPanel from "../../OrderManagePage/ReturnUnifiedPanel";
import { SalesRecommendationPanel } from "../../OrderManagePage/SalesRecommendationPanel";
import { OrderHistorySupplierModal } from "../../OrderManagePage/OrderHistorySupplierModal";
import { StepperInput } from "../../common/StepperInput";
import { VendorCategoryBadge } from "../../common/VendorCategoryBadge";
import { useVendors } from "../../../hooks/useVendors";
// 2026-10-09 · 사용자 지시 · 발주필요 상품 클릭 → 공급사+상품+재고 정보 모달
import type { ProductInfo } from "../../../lib/productsCache";
// 2026-10-09 · 사용자 지시 · 발주매입 대조 · 발주관리 OrderPurchaseMatchTab 기능 전부 포팅 · UI 는 FullBoard 톤 신규
import {
  getOrderPurchaseMatchList,
  confirmOrderPurchaseMatch,
  type OrderMatchRow,
  type OrderPurchaseMatchResponse,
} from "../../../lib/api/orderPurchaseMatchApi";
import {
  fmtQty,
  fmtWon,
  effectiveStatus,
  effectiveExceptionType,
  groupBySupplierAndOrder,
  buildPurchaseGroup,
  type OrderGroup,
  type FilterKey,
} from "../../OrderManagePage/OrderPurchaseMatchTab.types";
import { ExceptionNoteModal } from "../../OrderManagePage/ExceptionNoteModal";
// 2026-10-12 · 사용자 지시 · 매입이상 공통 Card (매입재고현황과 "병합")
import { PurchaseExceptionCard } from "./PurchaseExceptionCard";
// 2026-10-12 · 사용자 지시 · 매입/발주 overlay chart (bar + line)
import { PurchaseOrderOverlayChart, type PurchaseOrderOverlayDatum } from "./PurchaseOrderOverlayChart";
// 2026-10-12 · 사용자 지시 · 조회기간 필터 전체 통일 · 공통 QuickRangePills 적용
import { QuickRangePills, type QuickRangeKey } from "../../common/OverviewPeriodFilter";
import { ApiError } from "../../../lib/apiClient";
import { getErrorMessage } from "../../../lib/errorMessage";
import { shortDate } from "../../../lib/dateFormat";
import { displayVendorName } from "../../../utils/vendorNameNormalize";
// 2026-10-09 · 사용자 지시 · 발주·매입 대조 좌우 매칭 UI · 파일 분리 (large-file-critical fix)
import { MatchOverviewSection } from "./order-return/MatchOverviewSection";

export interface OrderReturnOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

type AnyRow = Record<string, any>;
type SectionKey = "order-request" | "order-need" | "stockout" | "order-history" | "match" | "mismatch" | "return-need" | "return-done";
type InnerTabKey = "overview" | "order-need" | "order-request" | "stockout" | "order-history" | "match" | "exception" | "return";

// 2026-10-09 · HomeDashboard 톤 통일 (사용자 지시 "홈화면 디자인 적용")
//   · rounded-[12px] · thin flat shadow · no top accent bar · 2-tier typography
const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";

// 2026-10-09 · 사용자 지시 · 홈 톤 · text/dot/soft 중립 (slate/ink) · bar 는 inline 세로줄 색상 유지
//   · 섹션 title/count 전부 text-ink · 아이콘 text-slate-500
//   · inline rail (title 앞 w-[3px] h-[16px]) 은 bar 색상 사용 (섹션별 포인트)
const TONE: Record<string, { text: string; dot: string; bar: string; soft: string }> = {
  brand:   { text: "text-ink", dot: "bg-slate-400", bar: "bg-sky-500",     soft: "bg-slate-100" },
  amber:   { text: "text-ink", dot: "bg-slate-400", bar: "bg-amber-500",   soft: "bg-slate-100" },
  rose:    { text: "text-ink", dot: "bg-slate-400", bar: "bg-rose-500",    soft: "bg-slate-100" },
  violet:  { text: "text-ink", dot: "bg-slate-400", bar: "bg-violet-500",  soft: "bg-slate-100" },
  red:     { text: "text-ink", dot: "bg-slate-400", bar: "bg-red-500",     soft: "bg-slate-100" },
  slate:   { text: "text-ink", dot: "bg-slate-400", bar: "bg-slate-500",   soft: "bg-slate-100" },
  emerald: { text: "text-ink", dot: "bg-slate-400", bar: "bg-emerald-500", soft: "bg-slate-100" },
  indigo:  { text: "text-ink", dot: "bg-slate-400", bar: "bg-indigo-500",  soft: "bg-slate-100" },
};

const SECTION_META: Record<SectionKey, {
  title: string; description: string; icon: IconType;
  tone: keyof typeof TONE;
}> = {
  "order-request": { title: "발주요청대기",     description: "직원이 올린 발주 요청",   icon: ShoppingCart,  tone: "brand"  },
  "order-need":    { title: "발주필요",         description: "적정재고 미달 상품",       icon: Package,       tone: "amber"  },
  "stockout":      { title: "품절임박",         description: "현재고 ≤ 2 상품",          icon: Clock,         tone: "red"    },
  "order-history": { title: "발주이력",         description: "최근 발주 기록",           icon: ClipboardText, tone: "slate"  },
  "match":         { title: "발주·매입 대조",   description: "자동 매칭 결과",           icon: GitDiff,       tone: "violet" },
  "mismatch":      { title: "매입 이상 품목",        description: "수량·금액 불일치",         icon: Warning,       tone: "rose"   },
  "return-need":   { title: "반품필요",         description: "반품 요청 대기",           icon: ArrowsLeftRight, tone: "indigo"  },
  "return-done":   { title: "반품확정",         description: "반품 처리 완료",           icon: ArrowsLeftRight, tone: "emerald"  },
};

export const OrderReturnOverview: React.FC<OrderReturnOverviewProps> = ({ onSelectSubTab: _ }) => {
  // 2026-10-12 · 사용자 지시 · 외부 overview 에서 "전체보기 →" 클릭 시 sessionStorage 로 초기 innerTab 지정
  //   · 예 · PurchaseArrivalOverview 매입이상 "전체보기" → "match" (발주매입대조)
  const [innerTab, setInnerTab] = useState<InnerTabKey>(() => {
    try {
      const stored = sessionStorage.getItem("overview-order-return.innerTab");
      if (stored) {
        sessionStorage.removeItem("overview-order-return.innerTab");
        const valid: InnerTabKey[] = ["overview", "order-need", "order-request", "stockout", "order-history", "match", "exception", "return"];
        if ((valid as string[]).includes(stored)) return stored as InnerTabKey;
      }
    } catch { /* no-op */ }
    return "overview";
  });
  const [orderReqs, setOrderReqs] = useState<OrderRequestRow[] | null>(null);
  const [lowStock, setLowStock] = useState<AnyRow[] | null>(null);
  const [history, setHistory] = useState<AnyRow[] | null>(null);
  const [match, setMatch] = useState<AnyRow | null>(null);
  const [returnsPending, setReturnsPending] = useState<AnyRow[] | null>(null);
  const [returnsDone, setReturnsDone] = useState<AnyRow[] | null>(null);
  const [search, setSearch] = useState("");
  // 2026-10-12 · 공통 QuickRangePills · "today"/"7d"/"14d"/"30d" · default "14d"
  //   · 기존 period "7"/"14"/"30" 호환 위해 periodDays (effective days) 로 변환해서 사용
  const [quickRange, setQuickRange] = useState<QuickRangeKey>("14d");
  const periodDays = quickRange === "today" ? 1 : quickRange === "7d" ? 7 : quickRange === "14d" ? 14 : quickRange === "30d" ? 30 : 14;
  const period = String(periodDays) as "1" | "7" | "14" | "30";
  const [orderDetail, setOrderDetail] = useState<OrderDetailRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // 2026-10-09 · 사용자 지시 · 적정재고 미달만 보기 토글 · uncheck 시 전체 상품 검색
  const [onlyLowStock, setOnlyLowStock] = useState(true);
  const [allProducts, setAllProducts] = useState<AnyRow[]>([]);
  const [allProductsLoading, setAllProductsLoading] = useState(false);
  // 2026-10-09 · 사용자 지시 · 발주필요 수량 · 단가 입력
  //   · needQtyEdit: product_code → qty override · 기본은 needed = opt - stock
  //   · prevPriceMap: product_code → latest_unit_price (이전 사입가 · /api/products/purchase-history)
  const [needQtyEdit, setNeedQtyEdit] = useState<Map<string, number>>(new Map());
  const [prevPriceMap, setPrevPriceMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const codes = (lowStock ?? []).map(r => String(r.product_code ?? "")).filter(Boolean);
    if (codes.length === 0) return;
    let alive = true;
    api.get<any>(`/api/products/purchase-history?codes=${encodeURIComponent(codes.join(","))}&limit=1`)
      .then(({ data }) => {
        if (!alive) return;
        const hist = data?.history ?? {};
        const m = new Map<string, number>();
        for (const code of codes) {
          const p = hist[code]?.latest_unit_price;
          if (p != null && Number.isFinite(Number(p))) m.set(code, Number(p));
        }
        setPrevPriceMap(m);
      }).catch(() => {});
    return () => { alive = false; };
  }, [lowStock]);

  // 2026-10-09 · 사용자 지시 · 발주필요 → 선택 → 발주요청 전송 flow
  const [selectedNeed, setSelectedNeed] = useState<Set<string>>(new Set());
  const [sendingToOrderReq, setSendingToOrderReq] = useState(false);
  // 2026-10-09 · 사용자 지시 · 발주요청 전송 전 확인창 (OrderManagePage.bulkRequestOrder 패턴)
  const confirm = useConfirm();
  // 2026-10-09 · 사용자 지시 · 발주필요 리스트 헤더 자동정렬
  // 2026-10-09 · fix · 단일 state object (nested setState updater · React 18 pure 위반 fix)
  const [needSort, setNeedSort] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const needSortKey = needSort.key;
  const needSortDir = needSort.dir;
  const toggleNeedSort = useCallback((key: string) => {
    setNeedSort(prev => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "asc" });
  }, []);
  const { toast, show, showSuccess, showError, clear: clearToast } = useToast();
  const toggleNeedSelection = useCallback((code: string) => {
    setSelectedNeed(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);
  const clearNeedSelection = useCallback(() => setSelectedNeed(new Set()), []);
  const toggleAllNeedSelection = useCallback((rows: AnyRow[]) => {
    setSelectedNeed(prev => {
      const codes = rows.map(r => String(r.product_code ?? "")).filter(Boolean);
      const allSelected = codes.length > 0 && codes.every(c => prev.has(c));
      if (allSelected) {
        const next = new Set(prev);
        codes.forEach(c => next.delete(c));
        return next;
      }
      return new Set([...prev, ...codes]);
    });
  }, []);

  useEffect(() => { let alive = true;
    listOrderRequests().then(r => { if (alive) setOrderReqs(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setOrderReqs([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<AnyRow[]>(`/api/stock-manage/low-stock`).then(({ data }) => {
      if (alive) setLowStock(Array.isArray(data) ? data : []);
    }).catch(() => { if (alive) setLowStock([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<{ orders?: AnyRow[] }>(`/api/order-history`).then(({ data }) => {
      if (alive) setHistory(Array.isArray(data?.orders) ? data!.orders! : []);
    }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  // 2026-10-12 · 사용자 지시 · 매입금액 overlay (purchase-details fetch · period 범위)
  const [purchases, setPurchases] = useState<AnyRow[]>([]);
  useEffect(() => {
    let alive = true;
    const to = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    const from = (() => { const d = new Date(); d.setDate(d.getDate() - (Number(period) - 1)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
    api.get<{ rows?: AnyRow[] }>(`/api/purchase-details?from=${from}&to=${to}&no_cycle=1&per_page=5000`)
      .then(({ data }) => { if (alive) setPurchases(Array.isArray(data?.rows) ? data.rows : []); })
      .catch(() => { if (alive) setPurchases([]); });
    return () => { alive = false; };
  }, [refreshKey, period]);

  // 2026-10-12 · 사용자 지시 · 발주(bar) + 매입(line overlay) 통합 데이터
  const orderOverlayChartData: PurchaseOrderOverlayDatum[] = useMemo(() => {
    const n = Number(period);
    const ymd = (daysAgo: number): string => {
      const d = new Date(); d.setDate(d.getDate() - daysAgo);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const orderMap = new Map<string, number>();
    const purchaseMap = new Map<string, number>();
    for (let i = n - 1; i >= 0; i--) { const k = ymd(i); orderMap.set(k, 0); purchaseMap.set(k, 0); }
    for (const r of (history ?? [])) {
      const d = String(r.order_date ?? r.created_at ?? "").slice(0, 10);
      if (!d || !orderMap.has(d)) continue;
      orderMap.set(d, (orderMap.get(d) ?? 0) + Number(r.total_amount ?? 0));
    }
    for (const p of purchases) {
      const d = String(p.purchase_date ?? "").slice(0, 10);
      if (!d || !purchaseMap.has(d)) continue;
      purchaseMap.set(d, (purchaseMap.get(d) ?? 0) + Number(p.amount ?? 0));
    }
    const dates = Array.from(orderMap.keys()).sort();
    return dates.map(date => ({ date, primary: orderMap.get(date) ?? 0, overlay: purchaseMap.get(date) ?? 0 }));
  }, [history, purchases, period]);
  useEffect(() => { let alive = true;
    api.get<AnyRow>(`/api/order-purchase-match?days=${period}`).then(({ data }) => {
      if (alive) setMatch(data ?? {});
    }).catch(() => { if (alive) setMatch({}); });
    return () => { alive = false; };
  }, [refreshKey, period]);
  useEffect(() => { let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=pending&limit=200`)
      .then(({ data }) => { if (alive) setReturnsPending(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsPending([]); });
    return () => { alive = false; };
  }, [refreshKey]);
  useEffect(() => { let alive = true;
    api.get<{ rows?: AnyRow[] } | AnyRow[]>(`/api/return-requests?status=done&limit=200`)
      .then(({ data }) => { if (alive) setReturnsDone(Array.isArray(data) ? data : (data?.rows ?? [])); })
      .catch(() => { if (alive) setReturnsDone([]); });
    return () => { alive = false; };
  }, [refreshKey]);

  const cutoff = Date.now() - Number(period) * 86400000;
  const q = search.trim().toLowerCase();
  const search_ = (hay: string) => !q || hay.toLowerCase().includes(q);

  // 2026-10-09 · onlyLowStock OFF 시 전체 상품에서 검색 (사용자 지시)
  //   · 검색어 있을 때만 /api/products-search 조회 (debounce 250ms)
  //   · 검색어 없으면 lowStock 그대로 (리스트 폭주 방지)
  useEffect(() => {
    if (onlyLowStock || !q) { setAllProducts([]); return; }
    setAllProductsLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<AnyRow[]>(`/api/products-search?q=${encodeURIComponent(q)}`);
        setAllProducts(Array.isArray(data) ? data : []);
      } catch { setAllProducts([]); }
      finally { setAllProductsLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [onlyLowStock, q]);

  const needRows = useMemo(() => {
    if (onlyLowStock) {
      return (lowStock ?? []).filter(r =>
        search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`)
      );
    }
    // uncheck 시: 검색어 있으면 전체상품 검색결과 · 없으면 lowStock
    if (q) {
      // allProducts + lowStock 병합 (중복 제거)
      const seen = new Set<string>();
      const merged: AnyRow[] = [];
      for (const r of allProducts) {
        const c = String(r.product_code ?? "");
        if (!c || seen.has(c)) continue;
        seen.add(c); merged.push(r);
      }
      for (const r of (lowStock ?? [])) {
        const c = String(r.product_code ?? "");
        if (!c || seen.has(c)) continue;
        if (!search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`)) continue;
        seen.add(c); merged.push(r);
      }
      return merged;
    }
    return lowStock ?? [];
  }, [lowStock, allProducts, q, onlyLowStock]);
  const stockoutRows = useMemo(() => (lowStock ?? [])
    .filter(r => Number(r.current_stock ?? 0) <= 2)
    .filter(r => search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`))
  , [lowStock, q]);
  const historyRows = useMemo(() => (history ?? []).filter(h => {
    const d = String(h.order_date ?? h.created_at ?? h.requested_at ?? "");
    const t = d ? new Date(d).getTime() : 0;
    if (t && t < cutoff) return false;
    return search_(`${h.supplier ?? h.supplier_name ?? ""} ${h.order_no ?? h.po_no ?? ""}`);
  }), [history, q, cutoff]);
  const matchRows = useMemo<AnyRow[]>(() => {
    const arr = Array.isArray(match?.matched) ? match!.matched : [];
    return arr.filter((r: AnyRow) => search_(`${r.product_name ?? ""} ${r.supplier ?? ""} ${r.order_number ?? ""}`));
  }, [match, q]);
  const mismatchRows = useMemo<AnyRow[]>(() => {
    const ex = Array.isArray(match?.exceptions) ? match!.exceptions : [];
    const um = Array.isArray(match?.unmatched) ? match!.unmatched : [];
    return [...ex, ...um].filter((r: AnyRow) => search_(`${r.product_name ?? ""} ${r.supplier ?? ""} ${r.order_number ?? ""}`));
  }, [match, q]);
  // 2026-10-09 · 사용자 지시 · 발주요청페이지 참고 · 공급사별 그룹 (localeCompare ko) · 날짜별 (requested_at desc)
  const orderReqRows = useMemo(() => {
    const filtered = (orderReqs ?? []).filter(r =>
      search_(`${r.product_name ?? ""} ${r.product_code ?? ""} ${r.supplier ?? ""}`)
    );
    return [...filtered].sort((a, b) => {
      const sa = String(a.supplier ?? "").trim() || "(공급사 미지정)";
      const sb = String(b.supplier ?? "").trim() || "(공급사 미지정)";
      const c = sa.localeCompare(sb, "ko");
      if (c !== 0) return c;
      // 같은 공급사 내 · 날짜 desc (newest first)
      const da = String(a.requested_at ?? "");
      const db = String(b.requested_at ?? "");
      return db.localeCompare(da);
    });
  }, [orderReqs, q]);

  const returnNeedRows = useMemo(() => (returnsPending ?? []).filter(r =>
    search_(`${r.product_name ?? ""} ${r.supplier ?? r.supplier_name ?? ""}`)
  ), [returnsPending, q]);
  const returnDoneRows = useMemo(() => (returnsDone ?? []).filter(r =>
    search_(`${r.product_name ?? ""} ${r.supplier ?? r.supplier_name ?? ""}`)
  ), [returnsDone, q]);

  const dataForSection = (k: SectionKey): AnyRow[] => {
    switch (k) {
      case "order-request": return orderReqRows;
      case "order-need":    return needRows;
      case "stockout":      return stockoutRows;
      case "order-history": return historyRows;
      case "match":         return matchRows;
      case "mismatch":      return mismatchRows;
      case "return-need":   return returnNeedRows;
      case "return-done":   return returnDoneRows;
    }
  };
  const countForSection = (k: SectionKey): number | null => {
    switch (k) {
      case "order-request": return orderReqs == null ? null : orderReqRows.length;
      case "order-need":    return lowStock  == null ? null : needRows.length;
      case "stockout":      return lowStock  == null ? null : stockoutRows.length;
      case "order-history": return history   == null ? null : historyRows.length;
      case "match":         return match     == null ? null : matchRows.length;
      case "mismatch":      return match     == null ? null : mismatchRows.length;
      case "return-need":   return returnsPending == null ? null : returnNeedRows.length;
      case "return-done":   return returnsDone   == null ? null : returnDoneRows.length;
    }
  };

  const openOrderDetailFromRow = useCallback((row: AnyRow) => {
    setOrderDetail({
      id: row.id, order_no: row.order_no ?? row.po_no ?? row.order_number,
      requested_at: row.order_date ?? row.requested_at ?? row.created_at,
      supplier: row.supplier, supplier_name: row.supplier_name, supplier_email: row.supplier_email,
      staff_name: row.staff_name, status: row.status, receiving_status: row.receiving_status,
      note: row.note, items: Array.isArray(row.items) ? row.items : undefined,
      product_code: row.product_code, product_name: row.product_name,
      order_qty: row.order_qty, current_stock: row.current_stock,
      total_amount: row.total_amount, reconciliation: row.reconciliation,
    });
  }, []);

  // 2026-10-09 · 사용자 지시 · 발주필요 상품 클릭 → 공급사·상품·재고 정보 모달 (ProductInfoModal)
  const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);
  const openProductInfoFromRow = useCallback(async (row: AnyRow) => {
    const code = String(row.product_code ?? "").trim();
    if (!code) return;
    try {
      const r = await api.get<ProductInfo>(`/api/products/${encodeURIComponent(code)}`);
      setSelectedProduct(r.data);
    } catch { /* silent · 조회 실패 시 미노출 */ }
  }, []);

  const columnsForSection = (k: SectionKey): OverviewTableColumn[] => {
    switch (k) {
      case "order-need":
        // 2026-10-09 · 사용자 지시 · 공급사·상품명·현재고·적정재고·상태·수량·단가·금액
        //   · "요청" 개별 button 제거 (사용자 지시 · 체크박스 일괄 발주요청으로 충분)
        return [
          { key: "sel", label: "", className: "w-[28px]" },
          { key: "supplier", label: "공급사" },
          { key: "product", label: "상품명" },
          { key: "stock", label: "현재고", align: "right" },
          { key: "optimal", label: "적정재고", align: "right" },
          { key: "status", label: "상태", align: "center", className: "w-[80px]" },
          { key: "qty", label: "수량", align: "right", className: "w-[132px]" },
          { key: "unit", label: "단가", align: "right", className: "w-[96px]" },
          { key: "amount", label: "금액", align: "right", className: "w-[112px]" },
        ];
      case "order-request":
      case "stockout":
        return [
          { key: "product", label: "상품" },
          { key: "supplier", label: "공급사" },
          { key: "stock", label: "현재고", align: "right" },
          { key: "optimal", label: "적정재고", align: "right" },
          { key: "need", label: "부족", align: "right" },
        ];
      case "order-history":
        return [
          // 2026-10-09 · 사용자 지시 · 일자 세로 wrap 방지 · whitespace-nowrap + width
          { key: "when", label: "일시", className: "whitespace-nowrap w-[108px]" },
          { key: "order_no", label: "발주번호", className: "whitespace-nowrap" },
          { key: "supplier", label: "공급사" },
          { key: "items", label: "품목", align: "right" },
          { key: "amount", label: "금액", align: "right" },
          { key: "status", label: "상태", align: "center" },
        ];
      case "match":
      case "mismatch":
        return [
          { key: "when", label: "발주일", className: "whitespace-nowrap w-[108px]" },
          { key: "order_no", label: "발주번호", className: "whitespace-nowrap" },
          { key: "product", label: "상품" },
          { key: "supplier", label: "공급사" },
          { key: "order_qty", label: "발주량", align: "right" },
          { key: "purchase_qty", label: "매입량", align: "right" },
          { key: "status", label: "상태", align: "center" },
        ];
      case "return-need":
      case "return-done":
        return [
          { key: "product", label: "상품" },
          { key: "supplier", label: "공급사" },
          { key: "reason", label: "사유" },
          { key: "qty", label: "수량", align: "right" },
          { key: "when", label: "일자", align: "center", className: "whitespace-nowrap w-[88px]" },
        ];
    }
  };

  const mapRow = (k: SectionKey, r: AnyRow): AnyRow => {
    switch (k) {
      case "order-request":
      case "order-need":
      case "stockout": {
        const stock = Number(r.current_stock ?? 0);
        const opt = Number(r.optimal_stock ?? 0);
        const short = opt - stock;
        const code = String(r.product_code ?? "");
        const isSel = k === "order-need" && selectedNeed.has(code);
        // 발주필요 전용 · 수량/단가/금액
        const needDefault = Math.max(0, short);
        const curQty = k === "order-need" ? (needQtyEdit.has(code) ? needQtyEdit.get(code)! : needDefault) : needDefault;
        const unitPrice = k === "order-need" ? (prevPriceMap.get(code) ?? Number(r.purchase_price ?? 0)) : 0;
        const amount = curQty > 0 && unitPrice > 0 ? curQty * unitPrice : 0;
        // 상태 (품절/임박/부족)
        const statusLabel = stock <= 0 ? "품절" : stock <= 2 ? "임박" : short > 0 ? "부족" : "정상";
        const statusCls = stock <= 0 ? "text-rose-600 font-semibold"
          : stock <= 2 ? "text-amber-600 font-semibold"
          : short > 0 ? "text-brand-deep font-semibold"
          : "text-slate-500";
        return {
          sel: k === "order-need" ? (
            <input type="checkbox" checked={isSel}
              onClick={(e) => e.stopPropagation()}
              onChange={() => code && toggleNeedSelection(code)}
              className="w-4 h-4 cursor-pointer accent-brand-deep"
              aria-label="발주요청 대상 선택" />
          ) : null,
          product: (<div className="flex flex-col"><span className="text-[15px] font-semibold text-ink">{r.product_name ?? "-"}</span><span className="text-[13px] text-ink-soft tabular-nums">{r.product_code ?? ""}</span></div>),
          supplier: <span className="text-[14px] text-ink">{r.supplier ?? "-"}</span>,
          stock: Number.isFinite(stock) ? <span className={`text-[15px] tabular-nums ${stock <= 0 ? "text-rose-600 font-bold" : "text-ink"}`}>{stock.toLocaleString()}</span> : "-",
          optimal: <span className="text-[15px] tabular-nums text-ink">{Number.isFinite(opt) && opt > 0 ? opt.toLocaleString() : "-"}</span>,
          need: short > 0 ? <span className="text-[15px] font-bold text-brand-deep tabular-nums">{short.toLocaleString()}</span> : "-",
          // 발주필요 전용 cells · 폰트 리밸런싱 (사용자 지시)
          status: k === "order-need" ? <span className={`text-[14px] ${statusCls}`}>{statusLabel}</span> : null,
          qty: k === "order-need" ? (
            <div onClick={(e) => e.stopPropagation()} className="inline-flex justify-end [&_input]:!text-[14px] [&_input]:!h-7 [&_button]:!h-7 [&_button]:!w-6">
              <StepperInput value={curQty} size="xs" autoSize
                onChange={(v) => {
                  const num = v === "" ? 0 : v;
                  setNeedQtyEdit(prev => { const n = new Map(prev); n.set(code, num); return n; });
                }} />
            </div>
          ) : null,
          unit: k === "order-need" ? (
            <span className="text-[15px] tabular-nums text-slate-700">
              {unitPrice > 0 ? unitPrice.toLocaleString() : <span className="text-slate-400">-</span>}
            </span>
          ) : null,
          amount: k === "order-need" ? (
            <span className="text-[15px] tabular-nums font-semibold text-ink">
              {amount > 0 ? amount.toLocaleString() : <span className="text-slate-400 font-normal">-</span>}
            </span>
          ) : null,
          // 2026-10-09 · 사용자 지시 · 발주필요/품절임박/발주요청 상품 클릭 → 공급사+상품+재고 정보 모달
          __onClick: () => openProductInfoFromRow(r),
        };
      }
      case "order-history":
        return {
          when: String(r.order_date ?? r.created_at ?? r.requested_at ?? "").slice(0, 10) || "-",
          order_no: r.order_no ?? r.po_no ?? "-",
          supplier: r.supplier ?? r.supplier_name ?? "-",
          items: r.item_count ?? r.items_count ?? (Array.isArray(r.items) ? r.items.length : "-"),
          amount: r.total_amount != null ? Number(r.total_amount).toLocaleString() : "-",
          status: r.receiving_status ?? r.status ?? "-",
          __onClick: () => openOrderDetailFromRow(r),
        };
      case "match":
      case "mismatch": {
        const oq = Number(r.order_qty ?? 0);
        const pq = Number(r.purchase_qty ?? 0);
        const diff = pq - oq;
        return {
          when: String(r.order_date ?? r.sent_at ?? "").slice(0, 10) || "-",
          order_no: r.order_number ?? r.order_no ?? "-",
          product: (<div className="flex flex-col"><span className="font-semibold text-ink">{r.product_name ?? "-"}</span><span className="text-[13px] text-slate-500 tabular-nums">{r.product_code ?? ""}</span></div>),
          supplier: r.supplier ?? "-",
          order_qty: oq.toLocaleString(),
          purchase_qty: (<span className={diff === 0 ? "" : "text-rose-600 font-bold"}>{pq.toLocaleString()}{diff !== 0 && <span className="ml-1 text-[16px]">({diff > 0 ? "+" : ""}{diff})</span>}</span>),
          status: r.match_status ?? r.exception_type ?? r.status ?? "-",
          __onClick: () => openOrderDetailFromRow(r),
        };
      }
      case "return-need":
      case "return-done":
        return {
          product: (<div className="flex flex-col"><span className="font-semibold text-ink">{r.product_name ?? "-"}</span><span className="text-[13px] text-slate-500 tabular-nums">{r.product_code ?? ""}</span></div>),
          supplier: r.supplier ?? r.supplier_name ?? "-",
          reason: <span className="text-[13px] text-slate-500 truncate">{r.reason ?? "-"}</span>,
          qty: <span className="font-semibold tabular-nums">{r.qty ?? r.quantity ?? "-"}</span>,
          when: <span className="text-[13px] tabular-nums text-slate-500">{String(r.created_at ?? r.requested_at ?? "").slice(5, 10) || "-"}</span>,
          __onClick: () => openOrderDetailFromRow(r),
        };
    }
  };

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // 2026-10-09 · bulk 발주요청 전송 (사용자 지시 · 선택 → 발주요청)
  //   · 2026-10-09 fix · 실패 사유 수집 + 콘솔 로그 · "다 안가는데" 디버깅 가능
  //   · 2026-10-09 · 사용자 지시 · 확인창 추가 (OrderManagePage.bulkRequestOrder 패턴)
  //     "발주요청 추가 · 총 N건 · 신규 N건 · 상품명·수량 · 계속하시겠습니까?"
  const sendSelectedNeedToOrderRequest = useCallback(async () => {
    if (selectedNeed.size === 0) return;
    const codes = Array.from(selectedNeed);
    // 2026-10-09 · bugfix · lowStock + allProducts 머지 pool 에서 검색
    //   · 이전 · lowStock 만 → 검색으로 allProducts 에서 선택한 상품 못 찾아 "선택된 상품의 데이터를 찾을 수 없습니다" 실패
    //   · 이후 · needRows 와 동일 pool 에서 조회 (중복 제거)
    const seen = new Set<string>();
    const pool: AnyRow[] = [];
    for (const r of allProducts) {
      const c = String(r.product_code ?? "");
      if (!c || seen.has(c)) continue;
      seen.add(c); pool.push(r);
    }
    for (const r of (lowStock ?? [])) {
      const c = String(r.product_code ?? "");
      if (!c || seen.has(c)) continue;
      seen.add(c); pool.push(r);
    }
    const selectedRows = pool.filter(r => codes.includes(String(r.product_code ?? "")));
    const missingCodes = codes.filter(c => !selectedRows.some(r => String(r.product_code ?? "") === c));
    if (selectedRows.length === 0) {
      showError("선택된 상품의 데이터를 찾을 수 없습니다");
      return;
    }
    // 신규 vs 재요청 분류 · requestedCodes = orderReqs 에 이미 올라간 코드
    const requestedCodes = new Set((orderReqs ?? []).map(r => String(r.product_code ?? "")));
    const alreadyReq = selectedRows.filter(r => requestedCodes.has(String(r.product_code ?? "")));
    const newReq = selectedRows.filter(r => !requestedCodes.has(String(r.product_code ?? "")));
    const buildDetail = (arr: typeof selectedRows): string => arr.map(r => {
      const stock = Number(r.current_stock ?? 0);
      const opt = Number(r.optimal_stock ?? 0);
      const needed = Math.max(0, opt - stock);
      return `• ${String(r.product_name ?? r.product_code ?? "-")} · 수량 ${needed}`;
    }).join("\n");
    const parts: string[] = [];
    if (newReq.length > 0) parts.push(`◆ 신규 · ${newReq.length}건\n${buildDetail(newReq)}`);
    if (alreadyReq.length > 0) parts.push(`◆ 재요청 (덮어씀) · ${alreadyReq.length}건\n${buildDetail(alreadyReq)}`);
    const proceed = await confirm({
      title: `발주요청 추가 · 총 ${selectedRows.length}건`,
      message: `${parts.join("\n\n")}\n\n계속하시겠습니까?`,
      confirmLabel: alreadyReq.length > 0 ? "추가·덮어쓰기" : "추가",
    });
    if (!proceed) return;
    setSendingToOrderReq(true);
    show(`${selectedRows.length}건 발주요청 등록 중...`);
    let ok = 0;
    const failures: Array<{ code: string; name: string; reason: string }> = [];
    for (const r of selectedRows) {
      const code = String(r.product_code ?? "");
      const name = String(r.product_name ?? code);
      try {
        const stock = Number(r.current_stock ?? 0);
        const opt = Number(r.optimal_stock ?? 0);
        const needed = Math.max(0, opt - stock);
        // 2026-10-09 · 사용자 지시 · needQtyEdit (stepper 조정값) 우선 · 없으면 needed default
        const adjustedQty = needQtyEdit.has(code) ? needQtyEdit.get(code)! : needed;
        const basePayload = {
          product_code: code,
          product_name: name,
          current_stock: Number.isFinite(stock) ? stock : null,
          optimal_stock: Number.isFinite(opt) && opt > 0 ? opt : null,
          order_qty: adjustedQty > 0 ? adjustedQty : null,
          note: `발주·반품 현황판 · 선택 발주요청 (${new Date().toLocaleString("ko-KR")})`,
        } as const;
        try {
          await createOrderRequest({
            ...basePayload,
            supplier: r.supplier ?? null,
            supplier_code: r.supplier_code ?? null,
          });
        } catch (e: any) {
          const code2 = e?.code ?? "";
          const msg = e?.message ?? "";
          if (code2 === "SUPPLIER_NOT_FOUND" || msg.includes("공급사")) {
            // 공급사 미등록 · supplier 빼고 재시도 (사용자가 발주요청대기 UI 에서 공급사 지정 가능)
            await createOrderRequest(basePayload);
          } else {
            throw e;
          }
        }
        ok++;
      } catch (e: any) {
        // ApiError.message · HttpError 서버 메시지 그대로
        const reason = e?.message ?? String(e);
        const serverCode = e?.code ?? "";
        failures.push({ code, name, reason: serverCode ? `${serverCode}: ${reason}` : reason });
        console.error(`[OrderReturnOverview] 발주요청 실패 · ${code} ${name}:`, reason, e);
      }
    }
    setSendingToOrderReq(false);
    clearNeedSelection();
    refresh();
    if (failures.length === 0) {
      showSuccess(`${ok}건 발주요청 등록 완료 · 발주요청대기 탭에서 확인`);
    } else {
      const sample = failures.slice(0, 2).map(f => `${f.name}: ${f.reason}`).join(" / ");
      showError(`${ok}건 성공 · ${failures.length}건 실패 (${sample}${failures.length > 2 ? " 외" : ""})`);
    }
    if (missingCodes.length > 0) {
      console.warn("[OrderReturnOverview] lowStock 에 없는 선택 코드:", missingCodes);
    }
  }, [selectedNeed, lowStock, allProducts, orderReqs, needQtyEdit, confirm, show, showSuccess, showError, clearNeedSelection, refresh]);

  // ═══════════════════════════════════════════════════════════════════
  //  보드 (현황판) · 아이콘 only · chart · list · 폰트 리밸런싱
  // ═══════════════════════════════════════════════════════════════════
  const Board: React.FC<{
    k: SectionKey;
    rowCount?: number;      // mini-table 보여줄 행 수
    tableColumns?: Array<{ key: string; label: string; align?: "left" | "right"; w?: string }>;
    tableRow?: (r: AnyRow) => Record<string, React.ReactNode>;
    totalLabel?: string;    // header description 뒤 appended
  }> = ({ k, rowCount = 5, tableColumns, tableRow, totalLabel }) => {
    const meta = SECTION_META[k];
    const tone = TONE[meta.tone];
    const Icon = meta.icon;
    const count = countForSection(k);
    // ─── 정렬 (사용자 지시 · 모든 리스트 헤더 자동정렬) ───
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const sortableField = (col: string): string | null => {
      if (k === "order-request" || k === "order-need" || k === "stockout") {
        if (col === "product") return "product_name";
        if (col === "stock") return "current_stock";
      } else if (k === "order-history") {
        if (col === "when") return "order_date";
        if (col === "supplier") return "supplier";
        if (col === "amount") return "total_amount";
      } else {
        if (col === "product") return "product_name";
        if (col === "variance") return "purchase_qty";
      }
      return null;
    };
    const sortedData = useMemo(() => {
      const base = dataForSection(k);
      if (!sortKey) return base;
      const field = sortableField(sortKey);
      if (!field) return base;
      const sign = sortDir === "asc" ? 1 : -1;
      return [...base].sort((a, b) => {
        const av = a[field]; const bv = b[field];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
        return String(av).localeCompare(String(bv)) * sign;
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [k, sortKey, sortDir, lowStock, orderReqs, history, match]);
    const preview = sortedData.slice(0, rowCount);
    const toggleSort = (col: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!sortableField(col)) return;
      if (sortKey === col) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
      } else {
        setSortKey(col);
        setSortDir("asc");
      }
    };

    const defaultCols: Array<{ key: string; label: string; align?: "left" | "right"; w?: string }> =
      (k === "order-request" || k === "order-need" || k === "stockout")
        ? [
            { key: "product", label: "상품" },
            { key: "stock",   label: "현재/적정", align: "right", w: "w-[96px] whitespace-nowrap" },
          ]
      : k === "order-history"
        ? [
            // 2026-10-09 · 사용자 지시 · 일자 세로 wrap 방지 · nowrap + 고정 폭
            { key: "when",     label: "일자", w: "w-[72px] whitespace-nowrap" },
            { key: "supplier", label: "공급사" },
            { key: "amount",   label: "금액", align: "right", w: "w-[88px] whitespace-nowrap" },
          ]
      : [
            // 2026-10-09 · 사용자 지시 · 이상품목 리스트 · 공급사·상품명 나란히 (2 column 분리) · info density ↑ · nowrap
            { key: "when",     label: "일자", w: "w-[64px] whitespace-nowrap" },
            { key: "product",  label: "상품" },
            { key: "supplier", label: "공급사", w: "w-[88px] whitespace-nowrap" },
            { key: "variance", label: "발주/매입", align: "right", w: "w-[96px] whitespace-nowrap" },
        ];

    const defaultRow = (r: AnyRow): Record<string, React.ReactNode> => {
      if (k === "order-request" || k === "order-need" || k === "stockout") {
        const stock = Number(r.current_stock ?? 0);
        const opt = Number(r.optimal_stock ?? 0);
        return {
          product: (
            <div className="flex flex-col min-w-0">
              <span className="truncate font-semibold text-ink text-[16px]">{r.product_name ?? "-"}</span>
              <span className="truncate text-[13px] text-slate-500">{r.supplier ?? "-"}</span>
            </div>
          ),
          stock: (
            <div className="flex items-baseline justify-end gap-0.5 tabular-nums">
              <span className={`text-[16px] font-bold ${stock <= 0 ? "text-rose-600" : stock < opt ? "text-amber-600" : "text-ink"}`}>
                {Number.isFinite(stock) ? stock.toLocaleString() : "-"}
              </span>
              <span className="text-[13px] text-slate-500">/{Number.isFinite(opt) && opt > 0 ? opt.toLocaleString() : "-"}</span>
            </div>
          ),
        };
      }
      if (k === "order-history") {
        return {
          when: <span className="text-[13px] tabular-nums text-slate-500 font-medium">{String(r.order_date ?? r.created_at ?? "").slice(5, 10) || "-"}</span>,
          supplier: <span className="truncate text-[16px] font-semibold text-ink">{r.supplier ?? r.supplier_name ?? "-"}</span>,
          amount: <span className="text-[16px] font-bold text-ink tabular-nums">{r.total_amount != null ? Number(r.total_amount).toLocaleString() : "-"}</span>,
        };
      }
      const oq = Number(r.order_qty ?? 0);
      const pq = Number(r.purchase_qty ?? 0);
      const diff = pq - oq;
      // 2026-10-09 · 사용자 지시 · 공급사·상품명 나란히 (분리된 column) · 세로 늘어짐 방지 · info 많이
      return {
        when: <span className="text-[14px] tabular-nums text-ink-soft">{String(r.order_date ?? r.sent_at ?? "").slice(5, 10) || "-"}</span>,
        product: <span className="truncate font-semibold text-ink text-[15px]">{r.product_name ?? "-"}</span>,
        supplier: <span className="truncate text-[14px] text-ink-soft">{r.supplier ?? "-"}</span>,
        variance: (
          <div className="flex items-baseline justify-end gap-0.5 tabular-nums">
            <span className="text-[14px] text-ink-soft">{oq.toLocaleString()}</span>
            <span className="text-[14px] text-ink-soft/60">/</span>
            <span className={`text-[15px] font-bold ${diff === 0 ? "text-ink" : "text-rose-600"}`}>{pq.toLocaleString()}</span>
          </div>
        ),
      };
    };

    const cols = tableColumns ?? defaultCols;
    const rowFn = tableRow ?? defaultRow;

    return (
      <button type="button" onClick={() => navigateToSection(k)}
        className="group relative text-left bg-white border border-slate-200 rounded-[12px] overflow-hidden flex flex-col flex-1 h-full min-h-[280px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:bg-slate-50/40 transition-colors duration-150 cursor-pointer"
      >
        {/* 2026-10-09 · 프로세스별 컬러 포인트 · 좌측 세로 bar (탭 step 색상과 1:1 매칭) */}
        {/* 2026-10-09 · 사용자 지시 · 좌측 색상 레일 제거 (홈 톤 통일) */}

        {/* 2026-10-09 · 사용자 지시 · 홈 톤 · 섹션 타이틀 앞 inline 3px 세로 레일 */}
        <header className="flex items-start gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
          <span className={`w-[3px] h-[16px] ${tone.bar} rounded-full shrink-0 mt-[3px]`} aria-hidden />
          <Icon size={18} weight="fill" className="text-slate-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight leading-tight">{meta.title}</span>
              <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink leading-none">
                {count == null ? "-" : count.toLocaleString()}
              </span>
              <span className="text-[13px] md:text-[14px] text-slate-500 font-medium">건</span>
            </div>
            <div className="text-[13px] md:text-[14px] text-slate-500 mt-0.5 truncate">{meta.description}{totalLabel ? ` · ${totalLabel}` : ""}</div>
          </div>
          <ArrowRight size={14} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
        </header>

        {/* list · 현황판보드 · 스크롤 (2026-10-09 · 사용자 지시 · 영역 확장 220→360px) */}
        {/* 2026-10-12 · 사용자 "들쭉날쭉 · 내용짤림 fix · 예쁘게" · body padding 통일 px-3 → px-4 */}
        <div className="flex-1 min-h-0 px-4 pb-4 overflow-y-auto max-h-[360px]"
          onClick={(e) => e.stopPropagation()}
        >
          {preview.length === 0 ? (
            <div className="min-h-[120px] flex items-center justify-center text-[13px] italic text-slate-400">
              {count == null ? "불러오는 중..." : "항목 없음"}
            </div>
          ) : (
            <table className="w-full table-fixed">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-100">
                  {cols.map(c => {
                    const canSort = sortableField(c.key) != null;
                    const isActive = sortKey === c.key;
                    return (
                      <th key={c.key}
                        onClick={canSort ? (e) => toggleSort(c.key, e) : undefined}
                        className={`py-1 px-2 text-[14px] font-bold text-ink-soft/70 uppercase tracking-wider ${c.align === "right" ? "text-right" : "text-left"} ${c.w ?? ""} ${canSort ? "cursor-pointer select-none hover:text-ink" : ""}`}
                      >
                        <span className="inline-flex items-baseline gap-0.5">
                          {c.label}
                          {canSort && (
                            <span className={`text-[14px] ${isActive ? tone.text : "text-ink-soft/40"}`}>
                              {isActive ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => {
                  const row = rowFn(r);
                  return (
                    <tr key={i} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/40 transition-colors">
                      {cols.map(c => (
                        /* 2026-10-12 · 사용자 지시 · 글씨 삐져나옴 fix · overflow-hidden + truncate (table-fixed 지원) */
                        <td key={c.key} className={`py-1 px-2 align-middle overflow-hidden text-ellipsis whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"} ${c.w ?? ""}`}
                          title={typeof row[c.key] === "string" ? String(row[c.key]) : undefined}>
                          {row[c.key] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {count != null && count > rowCount && (
          <footer className={`px-5 py-2.5 border-t border-slate-100 text-[16px] font-bold ${tone.text} ${tone.soft} flex items-center justify-between`}>
            <span>전체 {count.toLocaleString()}건 보기</span>
            <ArrowRight size={14} />
          </footer>
        )}
      </button>
    );
  };

  // ─── 통합 Inner Tabs + 발주 프로세스 (하나의 bar · 사용자 지시) ────
  // 현황 | --- 프로세스 --- ① 발주필요 → ② 발주요청대기 → ③ 발주이력 → ④ 발주·매입대조 → ⑤ 이상품목 → ⑥ 반품 --- | 품절임박
  type UnifiedTab = { kind: "tab"; k: InnerTabKey; label: string; tone: keyof typeof TONE; step?: number; count?: () => number | null }
                  | { kind: "sep"; label?: string };
  const UNIFIED_TABS: UnifiedTab[] = [
    { kind: "tab", k: "overview",      label: "현황",           tone: "brand" },
    { kind: "tab", k: "order-need",    label: "발주필요",       tone: "amber",  step: 1, count: () => countForSection("order-need") },
    { kind: "tab", k: "order-request", label: "발주요청대기",   tone: "brand",  step: 2, count: () => countForSection("order-request") },
    { kind: "tab", k: "order-history", label: "발주이력",       tone: "slate",  step: 3, count: () => countForSection("order-history") },
    { kind: "tab", k: "match",         label: "발주·매입대조", tone: "violet", step: 4, count: () => countForSection("match") },
    { kind: "tab", k: "exception",     label: "발주매입재조정", tone: "rose",   step: 5, count: () => countForSection("mismatch") },
    { kind: "tab", k: "return",        label: "반품",           tone: "emerald", step: 6, count: () => (countForSection("return-need") ?? 0) + (countForSection("return-done") ?? 0) },
    { kind: "tab", k: "stockout",      label: "품절임박",       tone: "red",    count: () => countForSection("stockout") },
  ];

  // ─── Section → InnerTab 매핑 ──────
  const sectionToInnerTab: Record<SectionKey, InnerTabKey> = {
    "order-need":    "order-need",
    "order-request": "order-request",
    "stockout":      "stockout",
    "order-history": "order-history",
    "match":         "match",
    "mismatch":      "exception",
    "return-need":   "return",
    "return-done":   "return",
  };
  const navigateToSection = (k: SectionKey) => setInnerTab(sectionToInnerTab[k]);

  return (
    <div className="flex flex-col gap-1 md:gap-2 min-h-0 pb-6 bg-[#F4F7FA] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 2026-10-09 · 사용자 지시 · 홈 랜딩페이지 톤 · compact inline hero */}
      <section className="flex items-center gap-2 py-0.5 px-4 sm:px-6 pt-4">
        <span className="w-[3px] h-[14px] bg-red-500 rounded-full shrink-0" />
        <span className="text-[14px] md:text-[15px] text-slate-700">
          <strong className="font-semibold text-ink">발주·반품 현황</strong> · 적정재고 미달 → 발주요청 → 발주이력 → 발주·매입 대조 → 이상 품목까지 한 화면
        </span>
      </section>

      {/* 2026-10-09 · 프로세스 flow · 단일 row · wrap 금지 · horizontal scroll
            · PROCESS 텍스트 라벨 제거 (step 번호 + 화살표가 flow 암시 · 공간 절약)
            · step 사이 arrowhead · subtle · 깔끔 */}
      <div className="px-4 sm:px-6">
        <nav className="flex items-stretch border-b border-slate-200 overflow-x-auto -mb-px" aria-label="발주 프로세스">
          {UNIFIED_TABS.map((t, idx) => {
            if (t.kind === "sep") return null;
            const tone = TONE[t.tone];
            const active = innerTab === t.k;
            const count = t.count ? t.count() : null;
            const prev = UNIFIED_TABS[idx - 1];
            const next = UNIFIED_TABS[idx + 1];
            const prevIsProcess = prev && prev.kind === "tab" && prev.step != null;
            const nextIsProcess = next && next.kind === "tab" && next.step != null;
            const isProcess = t.step != null;
            const groupStart = isProcess && !prevIsProcess;
            const groupEnd = isProcess && !nextIsProcess;
            const showConnector = isProcess && prevIsProcess;
            return (
              <React.Fragment key={`${t.k}-${idx}`}>
                {groupStart && <span className="shrink-0 w-4" aria-hidden />}
                {showConnector && (
                  <span className="shrink-0 inline-flex items-center h-10 px-1 pointer-events-none" aria-hidden>
                    <span className="inline-block w-4 h-[1.5px] bg-slate-300" />
                    <span className="inline-block w-0 h-0 border-y-[3.5px] border-y-transparent border-l-[5px] border-l-slate-400" />
                  </span>
                )}
                <button type="button" onClick={() => setInnerTab(t.k)}
                  className={`relative shrink-0 px-2.5 h-10 text-[14px] md:text-[15px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    active ? "text-ink font-semibold" : "text-slate-500 hover:text-ink"
                  }`}
                >
                  <span>{t.label}</span>
                  {count != null && (
                    <span className={`text-[13px] md:text-[14px] font-semibold tabular-nums leading-none px-1.5 py-0.5 rounded-full ${active ? tone.soft + " text-ink" : "bg-slate-100 text-slate-500"}`}>{count.toLocaleString()}</span>
                  )}
                  {active && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${tone.bar} rounded-full`} />}
                </button>
                {groupEnd && <span className="shrink-0 w-3" aria-hidden />}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="상품·코드·공급사·발주번호 검색"
        right={
          <>
            {/* 2026-10-12 · 사용자 지시 · 조회기간 필터 전체 통일 · 공통 QuickRangePills · 월별 생략 (API 호환) */}
            <QuickRangePills value={quickRange} onChange={setQuickRange} showMonthMode={false} />
            <button type="button" onClick={refresh}
              className="h-7 px-2.5 text-[13px] font-semibold text-slate-600 border border-slate-200 rounded-md bg-white hover:bg-slate-50 cursor-pointer transition-colors">새로고침</button>
          </>
        }
      />

      {innerTab === "overview" && (
        <>
          {/* ═══ 홈 스타일 2-col · LEFT 2fr (main) + RIGHT 1fr (side) · 하단 라인 정렬 ═══ */}
          <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-stretch">
            {/* LEFT · 주요 콘텐츠 세로 스택 · 하단 라인 정렬 (flex-1 + h-full) */}
            <div className="flex flex-col gap-4 h-full">
              {/* 2026-10-12 · 사용자 지시 · 발주(bar) + 매입금액(line overlay) 통합 chart */}
              {/* 2026-10-12 · 사용자 지시 "발주 녹색 · 매입 다른 색" · 색상 명확 분리 (발주 emerald · 매입 amber) */}
              <PurchaseOrderOverlayChart
                title="일별 발주금액"
                periodLabel={`최근 ${period}일`}
                data={orderOverlayChartData}
                primaryLabel="발주금액"
                overlayLabel="매입금액"
                barColor="#059669"
                lineColor="#D97706"
                stripColor="bg-emerald-500"
              />
              {/* 공급사별 발주비중 + 이상품목 (flex-1 로 확장) · 2026-10-12 · 사용자 "병합" · 공통 Card 사용 (현재고 column 포함) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch flex-1 min-h-0">
                <SupplierPieChart rows={historyRows} />
                <PurchaseExceptionCard period={Number(period)} onViewAll={() => setInnerTab("exception")} />
              </div>
              {/* 발주요청대기 + 발주이력 (flex-1 로 확장) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch flex-1 min-h-0">
                <Board k="order-request" rowCount={999} />
                <Board k="order-history" rowCount={999} />
              </div>
            </div>
            {/* RIGHT · 사이드바 (발주필요 · 반품필요 · 품절임박) · flex-1 로 확장해 LEFT 와 bottom align */}
            <div className="flex flex-col gap-4 h-full">
              <Board k="order-need" rowCount={999} />
              <Board k="return-need" rowCount={999} />
              <Board k="stockout" rowCount={999} />
            </div>
          </div>
        </>
      )}

      {innerTab === "order-need" && (
        // 2026-10-12 · 사용자 "들쭉날쭉" fix · items-start → items-stretch (grid 자식 높이 통일)
        <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-stretch">
          <div>
          {(() => {
            // 정렬 적용 (사용자 지시 · 자동 정렬)
            const sortField = (k: string): string | null => {
              if (k === "product") return "product_name";
              if (k === "supplier") return "supplier";
              if (k === "stock") return "current_stock";
              if (k === "optimal") return "optimal_stock";
              if (k === "need") return "__short";
              return null;
            };
            let sortedRows = needRows;
            if (needSortKey) {
              const field = sortField(needSortKey);
              if (field) {
                const sign = needSortDir === "asc" ? 1 : -1;
                sortedRows = [...needRows].map(r => ({ ...r, __short: Number(r.optimal_stock ?? 0) - Number(r.current_stock ?? 0) }))
                  .sort((a, b) => {
                    const av = (a as any)[field], bv = (b as any)[field];
                    if (av == null && bv == null) return 0;
                    if (av == null) return 1; if (bv == null) return -1;
                    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
                    return String(av).localeCompare(String(bv)) * sign;
                  });
              }
            }
            const cols = columnsForSection("order-need");
            const codes = sortedRows.map(r => String(r.product_code ?? "")).filter(Boolean);
            const allChecked = codes.length > 0 && codes.every(c => selectedNeed.has(c));
            const sortArrow = (k: string) => needSortKey === k ? (needSortDir === "asc" ? "▲" : "▼") : "↕";
            const sortableLabel = (k: string, text: string) => sortField(k) ? (
              <button type="button" onClick={() => toggleNeedSort(k)}
                className="inline-flex items-baseline gap-1 cursor-pointer hover:text-ink select-none">
                {text}
                <span className={`text-[14px] ${needSortKey === k ? "text-brand-deep" : "text-slate-400"}`}>{sortArrow(k)}</span>
              </button>
            ) : text;
            const dynamicCols = cols.map(c => c.key === "sel" ? ({
              ...c,
              label: (
                <input type="checkbox" checked={allChecked}
                  onChange={() => toggleAllNeedSelection(sortedRows)}
                  className="w-4 h-4 cursor-pointer accent-brand-deep"
                  aria-label="전체 선택" />
              ),
            }) : ({ ...c, label: sortableLabel(c.key, typeof c.label === "string" ? c.label : String(c.label ?? "")) }));
            // 2026-10-09 · "적정재고 미달 상품만" 토글 + 선택 발주 전송 pill · header 통합
            const headerAction = (
              <div className="flex items-center gap-3">
                {/* 토글 · uncheck 시 전체 상품 검색 */}
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[14px] font-medium text-ink shrink-0">
                  <input type="checkbox" checked={onlyLowStock}
                    onChange={(e) => setOnlyLowStock(e.target.checked)}
                    className="w-3.5 h-3.5 cursor-pointer accent-brand-deep" />
                  적정재고 미달만
                </label>
                {!onlyLowStock && (
                  <span className="text-[13px] text-slate-500 shrink-0">
                    {q ? (allProductsLoading ? "검색 중..." : `전체 ${allProducts.length}건`)
                       : "검색어 입력 시 전체 검색"}
                  </span>
                )}
                {selectedNeed.size > 0 && (
                  <div className="inline-flex items-center h-9 rounded-full bg-brand-deep/5 border border-brand-deep/15 overflow-hidden">
                    <span className="pl-3 pr-2 text-[15px] font-semibold text-brand-deep tabular-nums">{selectedNeed.size}</span>
                    <button type="button" onClick={clearNeedSelection}
                      className="h-9 px-2 text-[14px] font-medium text-slate-500 hover:text-ink cursor-pointer border-l border-brand-deep/15 transition-colors" title="선택 해제">
                      <X size={13} />
                    </button>
                    <button type="button" onClick={sendSelectedNeedToOrderRequest} disabled={sendingToOrderReq}
                      className="h-9 pl-3 pr-3.5 text-[15px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center gap-1.5">
                      <ShoppingCart size={13} weight="fill" />
                      발주요청대기로 보내기
                    </button>
                  </div>
                )}
              </div>
            );
            return (
              <FullBoard k="order-need" rows={sortedRows} count={countForSection("order-need")}
                columns={dynamicCols} mapper={mapRow} headerAction={headerAction} />
            );
          })()}
          </div>
          <aside className="sticky top-4">
            <SalesRecommendationPanel
              product={null} saleMonth={null} saleQuarter={null}
              onApplyQty={() => { /* 수량 override 미지원 */ }}
              onOpenDetail={() => { /* drawer 사용 */ }}
              onClose={() => { /* 사이드바 고정 */ }}
              onRequestProduct={async (code, name) => {
                try {
                  await createOrderRequest({ product_code: code, product_name: name,
                    note: `발주·반품 현황판 · 이벤트별 추천 (${new Date().toLocaleString("ko-KR")})` });
                  showSuccess(`${name} 발주요청 등록`);
                  refresh();
                } catch { showError("발주요청 등록 실패"); }
              }}
              requestedCodes={new Set((orderReqs ?? []).map(r => r.product_code))}
            />
          </aside>
        </div>
      )}
      {innerTab === "order-history" && (
        <div className="px-4 sm:px-6">
          {/* 2026-10-09 · 사용자 지시 · 발주이력 · 날짜·공급사 행 클릭 → 아래 상세품목 inline expand */}
          <OrderHistoryExpandableBoard
            orders={historyRows}
            count={countForSection("order-history")}
          />
        </div>
      )}
      {innerTab === "order-request" && (
        <div className="px-4 sm:px-6">
          <OrderRequestGroupedView
            rows={orderReqRows}
            onRowClick={(r) => openOrderDetailFromRow(r)}
            onSendSuccess={(sent) => { showSuccess(`${sent}건 발주 전송 완료`); refresh(); }}
            onSendError={(msg) => showError(msg)}
            onDeleteSuccess={(deleted) => { showSuccess(`${deleted}건 삭제 완료`); refresh(); }}
            onQtyChanged={() => refresh()}
          />
        </div>
      )}
      {innerTab === "stockout" && (
        <div className="px-4 sm:px-6">
          <FullBoard k="stockout" rows={stockoutRows} count={countForSection("stockout")} columns={columnsForSection("stockout")} mapper={mapRow} />
        </div>
      )}
      {innerTab === "match" && (
        <div className="px-4 sm:px-6">
          <MatchOverviewSection />
        </div>
      )}
      {innerTab === "exception" && (
        <div className="px-4 sm:px-6">
          <FullBoard k="mismatch" rows={mismatchRows} count={countForSection("mismatch")} columns={columnsForSection("mismatch")} mapper={mapRow} />
        </div>
      )}
      {innerTab === "return" && (
        <div className="px-4 sm:px-6">
          {/* 2026-10-12 · #16 Step 1 · 반품 통합 · ReturnUnifiedPanel (상 반품필요 + 하 반품확정)
              이전: 2-col grid (lg:grid-cols-2) 반품필요 + 반품확정 좌우 분리
              이후: 상하 2 섹션 wrapper · Step 2-6 자동 필터/체크박스/공급사 그룹 모달 예정 */}
          <ReturnUnifiedPanel />
        </div>
      )}

      {/* ═══ 발주 상세 · Right-side Slide Drawer (2025 트렌드 · Linear/Notion/Attio) ═══ */}
      <OrderDetailDrawer order={orderDetail} onClose={() => setOrderDetail(null)} />
      {/* 2026-10-09 · 사용자 지시 · 발주필요 상품 클릭 · 홈 톤 drawer (중복 X · 핵심만) */}
      <NeedProductDrawer
        product={selectedProduct}
        prevPriceMap={prevPriceMap}
        onClose={() => setSelectedProduct(null)}
      />

      {/* ═══ Toast (bulk send 결과) ═══ */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-ink text-white rounded-lg px-4 py-3 shadow-lg text-[15px] font-medium flex items-center gap-2">
          <span>{toast.message}</span>
          <button type="button" onClick={clearToast} className="ml-2 opacity-60 hover:opacity-100 cursor-pointer">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

// ═════ 발주요청대기 · 공급사별 그룹 뷰 ═════
// 2026-10-09 · 사용자 지시 · 모두 펼침 default + 2026 modern trend
//   · default · 모두 펼침 (collapsed Set 비어있으면 all expanded)
//   · lg · 2-col grid · 공급사 2개씩 가로 배치 · 공간 활용 ↑
//   · 트렌드 · Linear/Vercel/Attio 2026 톤 · thin border · subtle bg · dense info · compact row
const OrderRequestGroupedView: React.FC<{
  rows: OrderRequestRow[];
  onRowClick: (r: OrderRequestRow) => void;
  onSendSuccess?: (sent: number) => void;
  onSendError?: (msg: string) => void;
  onDeleteSuccess?: (deleted: number) => void;
  onQtyChanged?: () => void;
}> = ({ rows, onRowClick, onSendSuccess, onSendError, onDeleteSuccess, onQtyChanged }) => {
  const confirm = useConfirm();
  const [qtyEdit, setQtyEdit] = useState<Map<string, number>>(new Map());
  const [savingQty, setSavingQty] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // 2026-10-09 · 사용자 지시 · 공급사별 분류 (위탁/선결제/60회전 등) 배지 노출
  const { getVendorCategory } = useVendors();
  // 2026-10-09 · 사용자 지시 · "적정재고 미달 아닌 상품도 발주 가능해야" · 상품 검색 모달
  const [showAddModal, setShowAddModal] = useState(false);

  // 2026-10-09 · 사용자 지시 · 발주 전 담당자/연락처 검증 · vendor map prefetch
  //   · 발주요청페이지 (useOrderModal.submitOrderModal) 패턴 · pre-send validation
  const [vendorMap, setVendorMap] = useState<Map<string, { contact_name: string | null; phone: string | null; email: string | null }>>(new Map());
  useEffect(() => {
    let alive = true;
    api.get<any[]>("/api/vendors").then(({ data }) => {
      if (!alive) return;
      const m = new Map<string, { contact_name: string | null; phone: string | null; email: string | null }>();
      for (const v of (Array.isArray(data) ? data : [])) {
        const name = String(v.company_name ?? "").trim();
        if (!name) continue;
        m.set(name, { contact_name: v.contact_name ?? null, phone: v.phone ?? null, email: v.email ?? null });
      }
      setVendorMap(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // 공급사별 발주이력 모달 (OrderRequestTab · supplierHistorySupplier 패턴)
  const [historySupplier, setHistorySupplier] = useState<string | null>(null);

  const getVendor = (supplier: string) => vendorMap.get(supplier.trim());
  const hasContact = (supplier: string) => {
    const v = getVendor(supplier);
    if (!v) return false;
    return !!(v.email || v.phone);
  };
  const groups = useMemo(() => {
    const map = new Map<string, OrderRequestRow[]>();
    for (const r of rows) {
      const s = String(r.supplier ?? "").trim() || "(공급사 미지정)";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (s: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(groups.map(([s]) => s)));

  // 2026-10-09 · 사용자 지시 · 발주요청페이지 기능 그대로 · 선택 → 발주 보내기
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleGroup = (items: OrderRequestRow[]) => setSelected(prev => {
    const ids = items.map(r => String(r.id));
    const allSel = ids.every(id => prev.has(id));
    const next = new Set(prev);
    if (allSel) ids.forEach(id => next.delete(id));
    else ids.forEach(id => next.add(id));
    return next;
  });
  const toggleAll = () => setSelected(prev => {
    const ids = rows.map(r => String(r.id));
    if (ids.every(id => prev.has(id))) return new Set();
    return new Set(ids);
  });
  const clearSel = () => setSelected(new Set());

  // 2026-10-09 · 사용자 지시 · 발주요청페이지 bulk-send flow 그대로 · 공급사별 1 request · Promise.all
  //   · 서버 schema · { order_number, order_date, channels: {email,sms,kakao}, bySupplier: [{...items}] }
  //   · 공급사별 order_number 발급 · PO-YYYYMMDD-#### 패턴
  //   · 공급사 contact/email/phone · OrderRequestRow 에 있으면 전달 · 없으면 server vendors lookup
  const sendSelected = async () => {
    if (selected.size === 0) return;
    const selRows = rows.filter(r => selected.has(String(r.id)));
    if (selRows.length === 0) return;
    const supGroups = new Map<string, OrderRequestRow[]>();
    for (const r of selRows) {
      const s = String(r.supplier ?? "").trim();
      if (!s) continue; // 공급사 없는 row 는 전송 불가 (스킵)
      if (!supGroups.has(s)) supGroups.set(s, []);
      supGroups.get(s)!.push(r);
    }
    if (supGroups.size === 0) {
      onSendError?.("공급사가 지정되지 않은 발주는 전송할 수 없습니다");
      return;
    }

    // 2026-10-09 · 사용자 지시 · 발주요청페이지 (useOrderModal.submitOrderModal) pre-send validation 그대로
    //   1) 각 item · 수량 > 0 검증 (invalidItems)
    //   2) 공급사별 담당자/연락처 확인 (vendor map lookup)
    //   3) 공급사별 상세 preview + 담당자/연락처 노출
    //   4) "발송 후 되돌릴 수 없습니다" 확인 dialog
    const invalidItems: Array<{ supplier: string; product: string; issue: string }> = [];
    for (const [supplier, items] of supGroups) {
      for (const it of items) {
        const qty = Number(it.order_qty ?? 0);
        if (!qty || qty <= 0) {
          invalidItems.push({ supplier, product: String(it.product_name ?? ""), issue: "수량 미입력" });
        }
      }
    }
    if (invalidItems.length > 0) {
      const sample = invalidItems.slice(0, 3).map(v => `${v.supplier}: ${v.product} (${v.issue})`).join(" / ");
      await confirm({
        message: `발송 불가 · 필수값 누락 ${invalidItems.length}건\n${sample}${invalidItems.length > 3 ? " 외" : ""}\n\n발주량을 먼저 입력하세요.`,
        confirmLabel: "닫기", cancelLabel: "", danger: true,
      });
      return;
    }

    // 공급사별 담당자/연락처 요약 + 미등록 경고
    const supSummary = Array.from(supGroups.entries()).map(([supplier, items]) => {
      const v = getVendor(supplier);
      const contact = v?.contact_name ?? items[0]?.supplier_contact ?? "";
      const phone   = v?.phone        ?? items[0]?.supplier_phone   ?? "";
      const email   = v?.email        ?? items[0]?.supplier_email   ?? "";
      const bits = [contact, phone, email].filter(Boolean);
      const contactLine = bits.length > 0 ? bits.join(" · ") : "⚠ 담당자·연락처 미등록";
      const missing = bits.length === 0;
      return { supplier, items, contactLine, missing };
    });
    const missingSuppliers = supSummary.filter(s => s.missing).map(s => s.supplier);
    const totalItems = selRows.length;
    const supplierList = supSummary.map(s =>
      `• ${s.supplier} (${s.items.length}건)\n  ${s.contactLine}`
    ).join("\n");
    const warnMissing = missingSuppliers.length > 0
      ? `\n\n⚠ 담당자·연락처 미등록 공급사: ${missingSuppliers.join(", ")}\n→ 이메일/카톡 발송 불가 · DB 상태만 "발주완료"로 변경됩니다.\n→ 발주 설정에서 담당자·이메일·전화 등록 필요.`
      : "";
    const confirmMsg =
      `${supGroups.size}개 공급사 · 총 ${totalItems}개 상품 발송 예정\n\n${supplierList}${warnMissing}\n\n발송 후 되돌릴 수 없습니다. 계속하시겠습니까?`;
    const proceed = await confirm({ message: confirmMsg, confirmLabel: "발주 발송", cancelLabel: "취소" });
    if (!proceed) return;

    const ymd = new Date().toISOString().slice(0, 10);
    const ymdNoDash = ymd.replace(/-/g, "");
    const genOrderNumber = () => `PO-${ymdNoDash}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    setSending(true);
    try {
      const submissions = Array.from(supGroups.entries()).map(async ([supplier, items]) => {
        const first = items[0];
        try {
          const { data: body } = await api.post<any>("/api/order-requests/bulk-send", {
            order_number: genOrderNumber(),
            order_date: ymd,
            desired_arrival: null,
            memo: null,
            channels: { email: true, kakao: true, sms: false },
            bySupplier: [{
              supplier,
              supplier_contact: first.supplier_contact ?? null,
              supplier_email:   first.supplier_email   ?? null,
              supplier_phone:   first.supplier_phone   ?? null,
              items: items.map(it => {
                const stock = Number(it.current_stock ?? 0);
                const opt   = Number(it.optimal_stock ?? 0);
                const needed = Math.max(0, opt - stock);
                // 2026-10-09 · qtyEdit 로컬 override 우선 사용 (사용자 수정값)
                const oqty = qtyEdit.has(String(it.id)) ? qtyEdit.get(String(it.id))! : Number(it.order_qty ?? needed);
                return {
                  order_request_id: it.id,
                  product_code: it.product_code,
                  product_name: it.product_name,
                  current_stock: Number.isFinite(stock) ? stock : null,
                  optimal_stock: Number.isFinite(opt) ? opt : null,
                  needed_qty: needed,
                  order_qty: oqty,
                  unit_price: null,
                  memo: null,
                };
              }),
            }],
          });
          const bodyOk = body?.ok === true || body?.results?.[0]?.dispatch_id != null;
          return { supplier, ok: bodyOk, error: bodyOk ? null : "발송 실패" };
        } catch (e: any) {
          return { supplier, ok: false, error: e?.message ?? "네트워크 오류" };
        }
      });
      const results = await Promise.all(submissions);
      const succeeded = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);
      clearSel();
      if (failed.length === 0) {
        onSendSuccess?.(succeeded);
      } else {
        const detail = failed.map(f => `${f.supplier}: ${f.error}`).join(" / ");
        onSendError?.(`성공 ${succeeded} · 실패 ${failed.length} (${detail})`);
      }
    } finally { setSending(false); }
  };

  // 2026-10-09 · 사용자 지시 · 삭제 (발주요청대기 리스트에서 제거) · OrderManagePage.deleteOrder 패턴
  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const ok = await confirm({
      message: `선택한 ${ids.length}건을 발주요청대기 리스트에서 삭제하시겠습니까?`,
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await Promise.all(ids.map(id => api.del(`/api/order-requests/${id}`).catch(() => {})));
      clearSel();
      onDeleteSuccess?.(ids.length);
    } finally { setDeleting(false); }
  };

  // 2026-10-09 · saveQty 제거 (사용자 리포트 · 발주요청 중복 추가 + 알림 반복 원인)
  //   · 수량 변경은 로컬 qtyEdit Map 에만 반영 · 실제 저장은 발주 보내기 시점에만

  // 2026-10-09 · 사용자 지시 · 공급사별 발주 보내기 (header shortcut · OrderRequestTab 패턴)
  const sendSupplier = async (supplier: string, items: OrderRequestRow[]) => {
    if (items.length === 0) return;
    // 2026-10-09 · 사용자 지시 · 공급사별 발주 보내기도 pre-send 검증 + 확인창 (sendSelected 와 동일 flow)
    const invalid = items.filter(it => !Number(it.order_qty ?? 0));
    if (invalid.length > 0) {
      await confirm({
        message: `발송 불가 · 발주량 미입력 ${invalid.length}건\n${invalid.slice(0, 3).map(i => i.product_name).join(" / ")}\n\n발주량을 먼저 입력하세요.`,
        confirmLabel: "닫기", cancelLabel: "", danger: true,
      });
      return;
    }
    const v = getVendor(supplier);
    const first = items[0];
    const contact = v?.contact_name ?? first.supplier_contact ?? "";
    const phone   = v?.phone        ?? first.supplier_phone   ?? "";
    const email   = v?.email        ?? first.supplier_email   ?? "";
    const bits = [contact, phone, email].filter(Boolean);
    const contactLine = bits.length > 0 ? bits.join(" · ") : "⚠ 담당자·연락처 미등록";
    const missingWarn = bits.length === 0
      ? "\n\n⚠ 담당자·연락처 미등록 → 이메일/카톡 발송 불가 · DB 상태만 \"발주완료\"로 변경됩니다."
      : "";
    const totalQty = items.reduce((s, it) => s + Number(it.order_qty ?? 0), 0);
    const confirmMsg =
      `${supplier} · ${items.length}건 · 총 ${totalQty.toLocaleString()}개 발송 예정\n\n${contactLine}${missingWarn}\n\n발송 후 되돌릴 수 없습니다. 계속하시겠습니까?`;
    const proceed = await confirm({ message: confirmMsg, confirmLabel: "발주 발송", cancelLabel: "취소" });
    if (!proceed) return;

    setSending(true);
    try {
      const ymd = new Date().toISOString().slice(0, 10);
      const genOrderNumber = () => `PO-${ymd.replace(/-/g, "")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const { data: body } = await api.post<any>("/api/order-requests/bulk-send", {
        order_number: genOrderNumber(), order_date: ymd,
        desired_arrival: null, memo: null,
        channels: { email: true, kakao: true, sms: false },
        bySupplier: [{
          supplier,
          supplier_contact: first.supplier_contact ?? null,
          supplier_email:   first.supplier_email   ?? null,
          supplier_phone:   first.supplier_phone   ?? null,
          items: items.map(it => {
            const stock = Number(it.current_stock ?? 0);
            const opt = Number(it.optimal_stock ?? 0);
            // qtyEdit 로컬 override 우선
            const oqty = qtyEdit.has(String(it.id)) ? qtyEdit.get(String(it.id))! : Number(it.order_qty ?? Math.max(0, opt - stock));
            return {
              order_request_id: it.id, product_code: it.product_code, product_name: it.product_name,
              current_stock: Number.isFinite(stock) ? stock : null,
              optimal_stock: Number.isFinite(opt) ? opt : null,
              needed_qty: Math.max(0, opt - stock),
              order_qty: oqty,
              unit_price: null, memo: null,
            };
          }),
        }],
      });
      const bodyOk = body?.ok === true || body?.results?.[0]?.dispatch_id != null;
      if (bodyOk) onSendSuccess?.(items.length);
      else onSendError?.(`${supplier} 발송 실패`);
    } catch (e: any) {
      onSendError?.(e?.message ?? "네트워크 오류");
    } finally { setSending(false); }
  };

  if (rows.length === 0) {
    return (
      <section className={`${CARD} p-6 text-center text-[15px] text-slate-500`}>
        발주요청 대기 중인 항목이 없습니다
      </section>
    );
  }

  // 2026-10-09 · 사용자 지시 · 하나의 리스트 · 공급사 header row 교차 (Excel pivot 패턴)
  //   · 공급사가 많아도 single scrollable list · 각 공급사 header 클릭 → 그룹 접기/펼치기
  //   · 공급사 header sticky (스크롤 중 현재 그룹 라벨 유지)
  return (
    <section className={`${CARD} overflow-hidden relative flex flex-col`}>
      {/* 좌측 accent bar (브랜드 · 발주요청대기 톤) */}
      {/* 2026-10-09 · 사용자 지시 · 좌측 색상 레일 제거 */}

      {/* 상단 toolbar */}
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="w-[3px] h-[16px] bg-sky-500 rounded-full shrink-0" aria-hidden />
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사별 발주요청 대기</h3>
          <span className="text-[15px] text-slate-500 font-medium">
            공급사 <span className="font-semibold text-ink tabular-nums">{groups.length}</span>곳
            <span className="text-slate-300 mx-1">·</span>
            총 <span className="font-semibold text-ink tabular-nums">{rows.length}</span>건
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 선택 → 발주 전송 + 삭제 pill (사용자 지시 · 발주요청페이지 기능 그대로) */}
          {selected.size > 0 && (
            <div className="inline-flex items-center h-9 rounded-full bg-brand-deep/5 border border-brand-deep/15 overflow-hidden">
              <span className="pl-3 pr-2 text-[15px] font-semibold text-brand-deep tabular-nums">{selected.size}</span>
              <button type="button" onClick={clearSel}
                className="h-9 px-2 text-slate-500 hover:text-ink cursor-pointer border-l border-brand-deep/15 transition-colors" title="선택 해제">
                <X size={13} />
              </button>
              <button type="button" onClick={deleteSelected} disabled={deleting || sending}
                className="h-9 px-2.5 text-[14px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer border-l border-brand-deep/15 disabled:opacity-50 transition-colors inline-flex items-center gap-1" title="선택 삭제">
                <Trash size={13} weight="fill" /> 삭제
              </button>
              <button type="button" onClick={sendSelected} disabled={sending || deleting}
                className="h-9 pl-3 pr-3.5 text-[15px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center gap-1.5 border-l border-brand-deep/15">
                <PaperPlaneTilt size={13} weight="fill" />
                발주 보내기
              </button>
            </div>
          )}
          <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden text-[14px] font-semibold">
            <button type="button" onClick={expandAll}
              className="h-8 px-2.5 text-slate-500 hover:text-ink hover:bg-slate-50 cursor-pointer transition-colors">모두 펼치기</button>
            <span className="w-px h-4 bg-slate-200" aria-hidden />
            <button type="button" onClick={collapseAll}
              className="h-8 px-2.5 text-slate-500 hover:text-ink hover:bg-slate-50 cursor-pointer transition-colors">모두 접기</button>
          </div>
        </div>
      </header>

      {/* 하나의 테이블 · 공급사 header row 교차 · thead sticky top · supplier row sticky under */}
      <div className="max-h-[72vh] overflow-y-auto">
        <table className="w-full text-[15px]">
          <thead className="sticky top-0 bg-white z-20">
            <tr className="border-b border-slate-200">
              <th className="pl-6 pr-1 py-2 w-[36px]">
                <input type="checkbox"
                  checked={rows.length > 0 && rows.every(r => selected.has(String(r.id)))}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 cursor-pointer accent-brand-deep"
                  aria-label="전체 선택" />
              </th>
              <th className="px-3 py-2 text-left text-[14px] font-semibold text-slate-500 uppercase tracking-wider">상품 / 코드</th>
              <th className="px-3 py-2 text-left text-[14px] font-semibold text-slate-500 uppercase tracking-wider w-[112px]">요청일</th>
              {/* 2026-10-09 · 사용자 지시 · 발주요청대기 재고 = ERP 현재고 (products.current_stock) · 실재고 분해(창1~매3) 금지 */}
              <th className="px-3 py-2 text-right text-[14px] font-semibold text-slate-500 uppercase tracking-wider w-[96px]">현재고</th>
              <th className="px-3 py-2 text-right text-[14px] font-semibold text-slate-500 uppercase tracking-wider w-[112px]">현재 / 적정</th>
              <th className="px-3 py-2 text-right text-[14px] font-semibold text-slate-500 uppercase tracking-wider w-[128px]">발주량</th>
              <th className="px-3 pr-5 py-2 text-right text-[14px] font-semibold text-slate-500 uppercase tracking-wider w-[108px]">예상금액</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([supplier, items]) => {
              const isCollapsed = collapsed.has(supplier);
              const latest = String(items[0]?.requested_at ?? "").slice(0, 10) || "-";
              const subtotalQty = items.reduce((s, r) => s + Number(r.order_qty ?? 0), 0);
              return (
                <React.Fragment key={supplier}>
                  {/* 공급사 header row · sticky · 더 선명한 bg + font (2025 group hierarchy 트렌드) */}
                  <tr className="sticky top-[36px] z-10 bg-slate-100/70 border-y border-slate-200">
                    <td className="pl-6 pr-1 py-2.5 w-[36px]">
                      <input type="checkbox"
                        checked={items.every(r => selected.has(String(r.id)))}
                        onChange={() => toggleGroup(items)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 cursor-pointer accent-brand-deep"
                        aria-label={`${supplier} 전체 선택`} />
                    </td>
                    <td colSpan={6} className="pr-3 py-2">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <button type="button" onClick={() => toggle(supplier)}
                          className="flex items-baseline gap-2 min-w-0 flex-1 cursor-pointer hover:text-ink text-left">
                          <span className={`text-[14px] font-bold text-slate-400 transition-transform shrink-0 ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                          {/* 2026-10-09 · 사용자 지시 · 공급사 분류 (위탁/선결제/60회전/90회전/기타) · 공급사명 앞에 */}
                          <span className="shrink-0 self-center"><VendorCategoryBadge category={getVendorCategory(supplier)} /></span>
                          <span className="text-[15px] font-semibold text-ink tracking-tight truncate">{supplier}</span>
                          <span className="text-[14px] text-slate-500 tabular-nums shrink-0">{items.length}건</span>
                          {subtotalQty > 0 && (
                            <span className="text-[14px] text-slate-500 tabular-nums shrink-0">· 합계 {subtotalQty.toLocaleString()}</span>
                          )}
                          {!hasContact(supplier) && (
                            <span className="text-[13px] text-amber-700 font-medium shrink-0">⚠ 연락처 미등록</span>
                          )}
                        </button>
                        <span className="text-[14px] text-slate-400 tabular-nums whitespace-nowrap shrink-0">{latest}</span>
                        {/* 공급사별 발주이력 (OrderRequestTab · setSupplierHistorySupplier 패턴) */}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setHistorySupplier(supplier); }}
                          className="inline-flex items-baseline gap-1 text-[14px] font-medium text-slate-500 hover:text-ink cursor-pointer transition-colors shrink-0"
                          title={`${supplier} 발주이력`}>
                          <ClipboardText size={11} className="translate-y-[1px]" /> 이력
                        </button>
                        {/* 공급사별 발주 바로 보내기 · plain text link */}
                        <button type="button" onClick={(e) => { e.stopPropagation(); sendSupplier(supplier, items); }}
                          disabled={sending}
                          className="inline-flex items-baseline gap-1 text-[14px] font-semibold text-brand-deep hover:text-[#0d3a5c] disabled:opacity-50 cursor-pointer transition-colors shrink-0"
                          title={`${supplier} 발주서 전송`}>
                          <PaperPlaneTilt size={11} weight="fill" className="translate-y-[1px]" /> 발주 보내기
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* item rows · 공급사 상세 */}
                  {!isCollapsed && items.map(r => {
                    const cur = Number(r.current_stock ?? 0);
                    const opt = Number(r.optimal_stock ?? 0);
                    const oq = Number(r.order_qty ?? 0);
                    const low = cur <= 0;
                    const warn = !low && opt > 0 && cur < opt;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => onRowClick(r)}
                        className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 cursor-pointer transition-colors ${selected.has(String(r.id)) ? "bg-brand-tint/15" : ""}`}
                      >
                        {/* 2026-10-09 · 사용자 지시 · 공급사↔상품 hierarchy 명확화 (2025 트렌드)
                              · 좌측 세로 rail (border-l) · child indentation 명시 */}
                        <td className="pl-10 pr-1 py-2 align-middle w-[44px] relative">
                          <span className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" aria-hidden />
                          <input type="checkbox"
                            checked={selected.has(String(r.id))}
                            onChange={() => toggleOne(String(r.id))}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 cursor-pointer accent-brand-deep"
                            aria-label="발주 대상 선택" />
                        </td>
                        <td className="pl-2 pr-3 py-2 align-middle">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[15px] font-medium text-ink truncate leading-tight">{r.product_name ?? "-"}</span>
                            <span className="text-[13px] text-slate-500 tabular-nums truncate leading-tight mt-0.5">{r.product_code ?? "-"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle text-[14px] tabular-nums text-slate-500">
                          {String(r.requested_at ?? "").slice(0, 10) || "-"}
                        </td>
                        {/* 2026-10-09 · 사용자 지시 · ERP 현재고 (products.current_stock) · 실재고 분해 금지 (3분법 원칙) */}
                        <td className="px-3 py-2 align-middle text-right text-[14px] tabular-nums whitespace-nowrap">
                          {r.current_stock != null ? (
                            <span className={low ? "text-rose-500 font-semibold" : warn ? "text-amber-600 font-semibold" : "text-ink font-medium"}>
                              {Number(r.current_stock).toLocaleString()}
                            </span>
                          ) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-[15px] tabular-nums whitespace-nowrap">
                          <span className={`font-medium ${low ? "text-rose-500" : warn ? "text-amber-600" : "text-ink"}`}>{cur.toLocaleString()}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-slate-500">{opt > 0 ? opt.toLocaleString() : "-"}</span>
                        </td>
                        {/* 발주량 · StepperInput (OrderRequestTab 패턴 · 로컬 override 만 · 발주 전송 시 적용)
                            2026-10-09 fix · 사용자 리포트 "발주요청 계속 추가 · 알림 반복"
                              · 이전 · onChange 매번 createOrderRequest POST (서버 UPSERT + status='requested' 리셋 + 알림 발송)
                              · 이후 · 로컬 qtyEdit Map 저장만 · 서버 POST 없음 · 알림 발송 없음
                              · 실제 발주 보내기 시점 (sendSelected / sendSupplier) 에 qtyEdit 값 사용 */}
                        <td className="px-3 py-2 align-middle text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(() => {
                            const idStr = String(r.id);
                            const current = qtyEdit.has(idStr) ? qtyEdit.get(idStr)! : oq;
                            const modified = qtyEdit.has(idStr) && qtyEdit.get(idStr) !== oq;
                            return (
                              <div className={modified ? "ring-1 ring-brand-deep/30 rounded-md" : ""} title={modified ? "변경됨 · 발주 보내기 시 저장" : ""}>
                                <StepperInput
                                  value={current}
                                  size="xs"
                                  autoSize
                                  onChange={(v) => {
                                    const num = v === "" ? 0 : v;
                                    setQtyEdit(prev => { const n = new Map(prev); n.set(idStr, num); return n; });
                                  }}
                                />
                              </div>
                            );
                          })()}
                        </td>
                        {/* 예상 금액 · unit_price × order_qty */}
                        <td className="px-3 pr-5 py-2 align-middle text-right text-[14px] tabular-nums">
                          {(() => {
                            const unit = Number((r as any).unit_price ?? 0);
                            const amount = unit > 0 && oq > 0 ? unit * oq : 0;
                            return amount > 0 ? (
                              <span className="font-semibold text-ink">{amount.toLocaleString()}원</span>
                            ) : <span className="text-slate-400">-</span>;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 공급사별 발주이력 Modal (OrderRequestTab 패턴 그대로) */}
      {historySupplier && (
        <OrderHistorySupplierModal
          supplier={historySupplier}
          onClose={() => setHistorySupplier(null)}
        />
      )}
    </section>
  );
};

const FullBoard: React.FC<{
  k: SectionKey;
  rows: AnyRow[];
  count: number | null;
  columns: OverviewTableColumn[];
  mapper: (k: SectionKey, r: AnyRow) => AnyRow;
  headerAction?: React.ReactNode;
}> = ({ k, rows, count, columns, mapper, headerAction }) => {
  const meta = SECTION_META[k];
  const tone = TONE[meta.tone];
  const Icon = meta.icon;
  return (
    <section className={`${CARD} overflow-hidden relative`}>
      {/* 2026-10-09 · 프로세스별 컬러 포인트 · 좌측 세로 bar (탭 step 색상과 매칭) */}
      {/* 2026-10-09 · 사용자 지시 · 좌측 색상 레일 제거 (홈 톤 통일) */}
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
        <span className={`w-[3px] h-[16px] ${tone.bar} rounded-full shrink-0`} aria-hidden />
        <Icon size={18} weight="fill" className="text-slate-500 shrink-0" />
        <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{meta.title}</h3>
          <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink leading-none">
            {count == null ? "-" : count.toLocaleString()}
          </span>
          <span className="text-[13px] md:text-[14px] font-medium text-slate-500">건</span>
          <span className="text-[13px] md:text-[14px] text-slate-500 font-medium truncate">· {meta.description}</span>
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </header>
      {/* 2026-10-09 · 사용자 지시 · 리스트 너무 길어짐 fix · 세로 스크롤 (max-h + overflow-y-auto) */}
      <div className="px-4 pb-4 overflow-y-auto max-h-[65vh]">
        <OverviewTable
          columns={columns}
          rows={rows.map(r => mapper(k, r))}
          emptyMessage={count == null ? "불러오는 중..." : "항목이 없습니다"}
        />
      </div>
    </section>
  );
};

// ═════════════════════════════════════════════════════════════════
//  OrderHistoryExpandableBoard · 발주이력 · 행 클릭 inline expand
//    2026-10-09 · 사용자 지시 · 날짜·공급사 행 클릭 → 아래 상세품목 inline
//    · 홈 톤 통일 (CARD + SECTION_META["order-history"])
//    · 상세 테이블: 상품명 / 상품코드 / 발주량 / 단가 / 금액 / 현재고 / 적정재고
// ═════════════════════════════════════════════════════════════════
const OrderHistoryExpandableBoard: React.FC<{
  orders: AnyRow[];
  count: number | null;
}> = ({ orders, count }) => {
  const meta = SECTION_META["order-history"];
  const tone = TONE[meta.tone];
  const Icon = meta.icon;
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <section className={`${CARD} overflow-hidden relative`}>
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
        <span className={`w-[3px] h-[16px] ${tone.bar} rounded-full shrink-0`} aria-hidden />
        <Icon size={18} weight="fill" className="text-slate-500 shrink-0" />
        <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{meta.title}</h3>
          <span className="text-[15px] md:text-[16px] font-semibold tabular-nums text-ink leading-none">
            {count == null ? "-" : count.toLocaleString()}
          </span>
          <span className="text-[13px] md:text-[14px] font-medium text-slate-500">건</span>
          <span className="text-[15px] md:text-[16px] text-slate-500 font-medium truncate">· {meta.description}</span>
        </div>
      </header>
      <div className="px-4 pb-4 overflow-y-auto max-h-[65vh]">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_rgba(226,232,240,1)]">
            {/* 2026-10-12 · 폰트 리밸런싱 · 테이블 헤더 12 → 13 (사용자 "폰트 작게 금지" 원칙 · tiny 하한 상향) */}
            <tr className="border-b border-slate-200 bg-slate-50/60">
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-left w-[32px]"></th>
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-left whitespace-nowrap w-[108px]">일시</th>
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-left whitespace-nowrap">발주번호</th>
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-left">공급사</th>
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-right">품목</th>
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-right">금액</th>
              <th className="py-2 px-2.5 text-[13px] font-semibold text-slate-500 text-center">상태</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-[12px] text-ink-soft/70">
                  {count == null ? "불러오는 중..." : "항목이 없습니다"}
                </td>
              </tr>
            ) : (
              orders.map((r, i) => {
                const key = String(r.order_number ?? r.order_no ?? r.po_no ?? r.id ?? i);
                const isOpen = openKey === key;
                const items: AnyRow[] = Array.isArray(r.items) ? r.items : [];
                const when = String(r.order_date ?? r.sent_at ?? r.created_at ?? "").slice(0, 10) || "-";
                const orderNo = r.order_number ?? r.order_no ?? r.po_no ?? "-";
                const supplier = r.supplier ?? r.supplier_name ?? "-";
                const amount = r.total_amount != null ? Number(r.total_amount) : items.reduce((s, it) => s + Number(it.line_amount ?? 0), 0);
                const status = r.receiving_status ?? r.status ?? "-";
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => setOpenKey(isOpen ? null : key)}
                      className="border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer"
                    >
                      <td className="py-1.5 px-2.5">
                        <CaretRight size={13} weight="bold" className={`text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </td>
                      <td className="py-1.5 px-2.5 text-ink whitespace-nowrap">{when}</td>
                      <td className="py-1.5 px-2.5 text-ink whitespace-nowrap">{orderNo}</td>
                      <td className="py-1.5 px-2.5 text-ink">{supplier}</td>
                      <td className="py-1.5 px-2.5 text-right tabular-nums text-ink">{items.length || (r.item_count ?? r.items_count ?? "-")}</td>
                      <td className="py-1.5 px-2.5 text-right tabular-nums text-ink">{amount > 0 ? amount.toLocaleString() : "-"}</td>
                      <td className="py-1.5 px-2.5 text-center text-ink">{status}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={7} className="px-3 py-2">
                          {items.length === 0 ? (
                            <div className="text-[12px] text-ink-soft/70 py-3 text-center">상세품목이 없습니다</div>
                          ) : (
                            <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                              <table className="w-full text-[13px]">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-slate-50">
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-left">상품명</th>
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-left whitespace-nowrap w-[108px]">상품코드</th>
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-right w-[72px]">발주량</th>
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-right w-[88px]">단가</th>
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-right w-[112px]">금액</th>
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-right w-[72px]">현재고</th>
                                    <th className="py-1.5 px-2.5 text-[13px] font-semibold text-ink-soft text-right w-[80px]">적정재고</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((it, j) => {
                                    const qty = Number(it.order_qty ?? 0);
                                    const unit = Number(it.unit_price ?? 0);
                                    const line = Number(it.line_amount ?? (qty * unit));
                                    const stock = it.current_stock != null ? Number(it.current_stock) : null;
                                    const opt = it.optimal_stock != null ? Number(it.optimal_stock) : null;
                                    return (
                                      <tr key={j} className="border-b border-slate-100 last:border-0">
                                        <td className="py-1.5 px-2.5 text-ink">{it.product_name ?? "-"}</td>
                                        <td className="py-1.5 px-2.5 text-ink-soft tabular-nums whitespace-nowrap">{it.product_code ?? "-"}</td>
                                        <td className="py-1.5 px-2.5 text-right tabular-nums text-ink">{qty.toLocaleString()}</td>
                                        <td className="py-1.5 px-2.5 text-right tabular-nums text-ink">{unit > 0 ? unit.toLocaleString() : "-"}</td>
                                        <td className="py-1.5 px-2.5 text-right tabular-nums font-semibold text-ink">{line > 0 ? line.toLocaleString() : "-"}</td>
                                        <td className="py-1.5 px-2.5 text-right tabular-nums text-ink">{stock != null ? stock.toLocaleString() : "-"}</td>
                                        <td className="py-1.5 px-2.5 text-right tabular-nums text-ink">{opt != null && opt > 0 ? opt.toLocaleString() : "-"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// ═════════════════════════════════════════════════════════════════
//  OrderDetailInlinePanel · 모달 대신 아래 영역에 상세 표시
// ═════════════════════════════════════════════════════════════════
const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString();

const statusTone = (s: string | null | undefined): "neutral" | "brand" | "emerald" | "amber" | "rose" => {
  const k = (s ?? "").toLowerCase();
  if (k.includes("complete") || k.includes("완료") || k.includes("done")) return "emerald";
  if (k.includes("partial") || k.includes("부분")) return "amber";
  if (k.includes("cancel") || k.includes("취소") || k.includes("미입고")) return "rose";
  if (k.includes("pending") || k.includes("요청") || k.includes("대기")) return "brand";
  return "neutral";
};

const buildMailto = (o: OrderDetailRow): string | null => {
  const email = o.supplier_email;
  if (!email) return null;
  const supplier = o.supplier_name ?? o.supplier ?? "";
  const orderNo = o.order_no ?? o.po_no ?? "";
  const orderDate = (o.requested_at ?? o.created_at ?? "").slice(0, 10);
  const subject = `[발주·매입 대조 확인 요청] ${supplier} / ${orderNo}`;
  const body = ["안녕하세요.", "", "아래 발주 건의 확인이 필요합니다.", "", `발주번호: ${orderNo || "-"}`, `공급사: ${supplier || "-"}`, `발주일: ${orderDate || "-"}`, "", "확인 부탁드립니다."].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

// ─── Right-side Slide Drawer (2025 트렌드 · Linear/Notion/Attio) ────────
// · 공간 처리 최소 · 다른 콘텐츠 가리지 않음 · ESC 또는 백드롭 클릭으로 닫기
// · 480px 폭 · body overflow lock · 부드러운 slide-in transition
// 2026-10-09 · 사용자 지시 · 발주필요 상품 상세 drawer · 홈 톤 통일 · 중복 정보 제거
//   · OrderDetailDrawer 패턴 재사용 (right-side slide · backdrop blur · ESC 닫기)
//   · 핵심 정보만 · 공급사·상품명·바코드·재고(현재/적정/부족)·창고매장분해·가격·유통기한
const NeedProductDrawer: React.FC<{
  product: ProductInfo | null;
  prevPriceMap: Map<string, number>;
  onClose: () => void;
}> = ({ product, prevPriceMap, onClose }) => {
  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  const open = product != null;
  const p = product as any;
  const stock = Number(p?.current_stock ?? 0);
  const opt = Number(p?.optimal_stock ?? 0);
  const short = Math.max(0, opt - stock);
  const prevUnit = p?.product_code ? (prevPriceMap.get(String(p.product_code)) ?? null) : null;
  const purchasePrice = p?.purchase_price != null ? Number(p.purchase_price) : null;
  const salePrice = p?.sale_price != null ? Number(p.sale_price) : null;

  const stockParts = [
    { label: "창고1", v: p?.warehouse1_stock ?? p?.inv_warehouse1_stock },
    { label: "창고2", v: p?.warehouse2_stock ?? p?.inv_warehouse2_stock },
    { label: "매장1", v: p?.store1_stock ?? p?.inv_store1_stock },
    { label: "매장2", v: p?.store2_stock ?? p?.inv_store2_stock },
    { label: "매장3", v: p?.store3_stock ?? p?.inv_store3_stock },
  ];
  const hasStockBreakdown = stockParts.some(s => s.v != null);

  const statusLabel = stock <= 0 ? "품절" : stock <= 2 ? "임박" : short > 0 ? "부족" : "정상";
  const statusCls = stock <= 0 ? "text-rose-600" : stock <= 2 ? "text-amber-600" : short > 0 ? "text-brand-deep" : "text-slate-500";

  return (
    <>
      <div onClick={onClose} aria-hidden
        className={`fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 transition-opacity duration-200 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      />
      <aside role="dialog" aria-modal="true"
        className={`fixed top-0 right-0 h-dvh w-full sm:max-w-[460px] bg-white shadow-[-16px_0_48px_-16px_rgba(15,23,42,0.18)] z-50 flex flex-col transition-transform duration-250 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {product && (
          <>
            <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-slate-500 truncate">{p.supplier ?? "공급사 미지정"}</div>
                <div className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight leading-tight mt-0.5 break-words">
                  {p.product_name ?? "-"}
                </div>
                <div className="text-[13px] text-slate-500 tabular-nums mt-1">
                  {p.product_code ?? "-"}{p.barcode ? ` · ${p.barcode}` : ""}
                </div>
              </div>
              <button type="button" onClick={onClose}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
                aria-label="닫기">
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* 재고 요약 */}
              <section>
                <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2">재고</div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[16px] font-semibold tabular-nums ${stock <= 0 ? "text-rose-600" : "text-ink"}`}>{stock.toLocaleString()}</span>
                    <span className="text-[13px] text-slate-500">/ {opt > 0 ? opt.toLocaleString() : "-"}</span>
                  </div>
                  <span className={`text-[14px] font-semibold ${statusCls}`}>{statusLabel}</span>
                  {short > 0 && (
                    <span className="text-[13px] text-slate-500">
                      부족 <span className="font-semibold text-brand-deep tabular-nums">{short.toLocaleString()}</span>
                    </span>
                  )}
                </div>
              </section>

              {/* 창고·매장 분해 */}
              {hasStockBreakdown && (
                <section>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2">위치별 재고</div>
                  <div className="grid grid-cols-5 gap-2">
                    {stockParts.map((s, i) => (
                      <div key={i} className="bg-slate-50 border border-slate-100 rounded-md px-2 py-2 text-center">
                        <div className="text-[13px] text-slate-500 font-medium">{s.label}</div>
                        <div className={`text-[14px] font-semibold tabular-nums mt-0.5 ${s.v != null && Number(s.v) > 0 ? "text-ink" : "text-slate-400"}`}>
                          {s.v != null ? Number(s.v).toLocaleString() : "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 가격 */}
              <section>
                <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2">가격</div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
                  {prevUnit != null && (
                    <>
                      <dt className="text-slate-500">이전 사입가</dt>
                      <dd className="text-right font-semibold text-ink tabular-nums">{prevUnit.toLocaleString()}원</dd>
                    </>
                  )}
                  {purchasePrice != null && (
                    <>
                      <dt className="text-slate-500">사입가 (products)</dt>
                      <dd className="text-right font-medium text-ink tabular-nums">{purchasePrice.toLocaleString()}원</dd>
                    </>
                  )}
                  {salePrice != null && (
                    <>
                      <dt className="text-slate-500">판매가</dt>
                      <dd className="text-right font-medium text-ink tabular-nums">{salePrice.toLocaleString()}원</dd>
                    </>
                  )}
                </dl>
              </section>

              {/* 기타 메타 */}
              {(p.expiry_date || p.category || p.spec || p.sale_status) && (
                <section>
                  <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-2">기타</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
                    {p.expiry_date && (<><dt className="text-slate-500">유통기한</dt><dd className="text-right text-ink tabular-nums">{String(p.expiry_date).slice(0, 10)}</dd></>)}
                    {p.category && (<><dt className="text-slate-500">카테고리</dt><dd className="text-right text-ink">{p.category}</dd></>)}
                    {p.spec && (<><dt className="text-slate-500">규격</dt><dd className="text-right text-ink">{p.spec}</dd></>)}
                    {p.sale_status && (<><dt className="text-slate-500">판매 상태</dt><dd className="text-right text-ink">{p.sale_status}</dd></>)}
                  </dl>
                </section>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
};

const OrderDetailDrawer: React.FC<{ order: OrderDetailRow | null; onClose: () => void }> = ({ order, onClose }) => {
  // ESC 키 handler
  useEffect(() => {
    if (!order) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  return (
    <>
      {/* backdrop · 반투명 · fade in */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-40 transition-opacity duration-200 ${order ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden
      />
      {/* drawer · 우측 slide */}
      <aside
        role="dialog" aria-modal="true"
        className={`fixed top-0 right-0 h-dvh w-full sm:max-w-[520px] bg-white shadow-[-16px_0_48px_-16px_rgba(15,23,42,0.18)] z-50 flex flex-col transition-transform duration-250 ease-out ${order ? "translate-x-0" : "translate-x-full"}`}
      >
        {order && <OrderDetailDrawerBody order={order} onClose={onClose} />}
      </aside>
    </>
  );
};

const OrderDetailDrawerBody: React.FC<{ order: OrderDetailRow; onClose: () => void }> = ({ order, onClose }) => {
  const supplier = order.supplier_name ?? order.supplier ?? "-";
  const orderNo = order.order_no ?? order.po_no ?? String(order.id ?? "-");
  const orderDate = (order.requested_at ?? order.created_at ?? "").slice(0, 16).replace("T", " ") || "-";
  const staff = order.staff_name ?? "-";
  const status = order.receiving_status ?? order.status ?? "-";
  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : (order.product_code || order.product_name)
      ? [{ product_code: order.product_code, product_name: order.product_name, order_qty: order.order_qty, received_qty: null, unit_price: null, amount: null }]
      : [];
  const mailto = buildMailto(order);

  return (
    <section className="relative bg-white border border-slate-200 rounded-[12px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* 2026-10-09 · 사용자 지시 · 좌측 색상 레일 제거 */}
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <Package size={22} weight="fill" className="text-brand-deep shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight leading-tight">발주·매입 상세</h3>
            <p className="text-[13px] font-medium text-slate-500 mt-1">row 클릭 상세 정보</p>
          </div>
        </div>
        <button type="button" onClick={onClose}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[13px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer">
          <X size={14} /> 닫기
        </button>
      </header>
      <div className="p-5 space-y-4">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-3 text-[16px]">
          <div>
            <div className="text-[13px] text-slate-500 font-medium">발주번호</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5">{orderNo}</div>
          </div>
          <div>
            <div className="text-[13px] text-slate-500 font-medium">공급사</div>
            <div className="font-semibold text-ink mt-0.5 flex items-center gap-1"><Buildings size={13} />{supplier}</div>
          </div>
          <div>
            <div className="text-[13px] text-slate-500 font-medium">요청일시</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5 flex items-center gap-1"><Calendar size={13} />{orderDate}</div>
          </div>
          <div>
            <div className="text-[13px] text-slate-500 font-medium">담당자</div>
            <div className="font-semibold text-ink mt-0.5">{staff}</div>
          </div>
          <div>
            <div className="text-[13px] text-slate-500 font-medium">입고상태</div>
            <div className="mt-0.5"><StoreStatusBadge status={status} tone={statusTone(status)} /></div>
          </div>
        </section>
        <section className="border border-slate-200 rounded-[12px] overflow-hidden">
          <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <h4 className="text-[16px] font-semibold text-ink">발주 상품 목록</h4>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[16px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 px-3 text-left text-[13px] font-semibold text-slate-500">상품코드</th>
                  <th className="py-2.5 px-3 text-left text-[13px] font-semibold text-slate-500">상품명</th>
                  <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-slate-500">주문수량</th>
                  <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-slate-500">입고수량</th>
                  <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-slate-500">단가</th>
                  <th className="py-2.5 px-3 text-right text-[13px] font-semibold text-slate-500">금액</th>
                  <th className="py-2.5 px-3 text-center text-[13px] font-semibold text-slate-500">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-[13px] text-slate-500">상품 정보가 없습니다</td></tr>
                ) : items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 text-ink tabular-nums">{it.product_code ?? "-"}</td>
                    <td className="py-2.5 px-3 text-ink">{it.product_name ?? "-"}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.order_qty)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.received_qty)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums">{fmtNum(it.unit_price)}</td>
                    <td className="py-2.5 px-3 text-right text-ink tabular-nums font-semibold">{fmtNum(it.amount)}</td>
                    <td className="py-2.5 px-3 text-center">{it.status ? <StoreStatusBadge status={it.status} tone={statusTone(it.status)} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {order.reconciliation && (
          <section className="border border-slate-200 rounded-[12px] p-4">
            <h4 className="text-[16px] font-semibold text-ink mb-3">발주·매입 대조 요약</h4>
            <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[16px]">
              <div><span className="text-ink-soft">발주금액</span> <span className="font-semibold text-ink tabular-nums ml-1">{fmtNum(order.reconciliation.order_amount)}</span></div>
              <div><span className="text-ink-soft">매입금액</span> <span className="font-semibold text-ink tabular-nums ml-1">{fmtNum(order.reconciliation.purchase_amount)}</span></div>
              <div><span className="text-ink-soft">금액차이</span> <span className="font-semibold text-rose-600 tabular-nums ml-1">{fmtNum(order.reconciliation.diff)}</span></div>
            </div>
          </section>
        )}
        {order.note && (
          <section className="border border-slate-200 rounded-[12px] p-4 text-[16px]">
            <div className="text-[13px] font-semibold text-slate-500 mb-1">비고</div>
            <div className="text-ink whitespace-pre-wrap">{order.note}</div>
          </section>
        )}
      </div>
      {mailto && (
        <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end">
          <a href={mailto}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[16px] font-semibold bg-brand-deep text-white hover:bg-[#0d3a5c] transition-colors cursor-pointer">
            <EnvelopeSimple size={14} weight="fill" /> 담당자 이메일
          </a>
        </footer>
      )}
    </section>
  );
};

// ═════════════════════════════════════════════════════════════════
//  차트 (SVG · 외부 라이브러리 X · 폰트 리밸런싱 · 컬러 포인트)
// ═════════════════════════════════════════════════════════════════

const DailyOrderBarChart: React.FC<{ rows: AnyRow[]; period: number }> = ({ rows, period }) => {
  // 일별 발주금액 집계
  const daily = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    for (const r of rows) {
      const d = String(r.order_date ?? r.created_at ?? "").slice(0, 10);
      if (!d || !map.has(d)) continue;
      map.set(d, (map.get(d) ?? 0) + Number(r.total_amount ?? 0));
    }
    return Array.from(map.entries()).map(([date, amt]) => ({ date, amt }));
  }, [rows, period]);

  const maxAmt = Math.max(1, ...daily.map(d => d.amt));
  const totalAmt = daily.reduce((s, d) => s + d.amt, 0);
  const avgAmt = daily.length > 0 ? Math.round(totalAmt / daily.length) : 0;

  return (
    <section className="relative bg-white border border-slate-200 rounded-[12px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* 2026-10-09 · 사용자 지시 · 좌측 색상 레일 제거 */}
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-[3px] h-[16px] bg-sky-500 rounded-full shrink-0" aria-hidden />
          <div>
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">일별 발주금액</h3>
            <p className="text-[13px] md:text-[14px] text-slate-500 mt-0.5">최근 {period}일 · 총 {totalAmt.toLocaleString()}원 · 일평균 {avgAmt.toLocaleString()}원</p>
          </div>
        </div>
      </header>
      <div className="px-5 pb-5">
        <div className="flex items-end gap-1 h-[160px] border-b border-slate-200 pt-2">
          {daily.map((d, i) => {
            const h = maxAmt > 0 ? Math.round((d.amt / maxAmt) * 100) : 0;
            return (
              <div key={d.date} className="flex-1 flex flex-col justify-end items-center group min-w-0" title={`${d.date} · ${d.amt.toLocaleString()}원`}>
                <div className={`w-full rounded-t ${d.amt > 0 ? "bg-brand-deep/80 group-hover:bg-brand-deep" : "bg-slate-100"} transition-colors`}
                  style={{ height: `${Math.max(h, 2)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-[16px] font-medium text-ink-soft/70 tabular-nums">
          <span>{daily[0]?.date.slice(5) ?? ""}</span>
          <span>{daily[Math.floor(daily.length / 2)]?.date.slice(5) ?? ""}</span>
          <span>{daily[daily.length - 1]?.date.slice(5) ?? ""}</span>
        </div>
      </div>
    </section>
  );
};

const PIE_PALETTE = ["#0A4F44", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#64748B"] as const;

const SupplierPieChart: React.FC<{ rows: AnyRow[] }> = ({ rows }) => {
  // 공급사별 발주금액 집계 → Top 5 + 기타
  const slices = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const s = String(r.supplier ?? r.supplier_name ?? "미지정").trim() || "미지정";
      map.set(s, (map.get(s) ?? 0) + Number(r.total_amount ?? 0));
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    const result = top.map(([name, value]) => ({ name, value }));
    if (other > 0) result.push({ name: "기타", value: other });
    return result;
  }, [rows]);

  const total = slices.reduce((s, x) => s + x.value, 0);
  // SVG donut
  const SIZE = 160;
  const RADIUS = 68;
  const STROKE = 24;
  const CENTER = SIZE / 2;
  const CIRC = 2 * Math.PI * RADIUS;

  let accum = 0;
  const arcs = slices.map((s, i) => {
    const frac = total > 0 ? s.value / total : 0;
    const dash = CIRC * frac;
    const offset = CIRC * (1 - accum);
    accum += frac;
    return { s, color: PIE_PALETTE[i % PIE_PALETTE.length], dash, offset };
  });

  return (
    <section className="relative bg-white border border-slate-200 rounded-[12px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex flex-col h-full min-h-[360px]">
      {/* 2026-10-09 · 사용자 지시 · 좌측 색상 레일 제거 */}
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
        <span className="w-[3px] h-[16px] bg-violet-500 rounded-full shrink-0" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사별 발주 비중</h3>
          <p className="text-[13px] md:text-[14px] text-slate-500 mt-0.5">총 {total.toLocaleString()}원 · Top 5 + 기타</p>
        </div>
      </header>
      <div className="px-5 pb-5 flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          {total > 0 ? (
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#F1F5F9" strokeWidth={STROKE} />
              <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
                {arcs.map((a, i) => (
                  <circle key={i} cx={CENTER} cy={CENTER} r={RADIUS} fill="none"
                    stroke={a.color} strokeWidth={STROKE}
                    strokeDasharray={`${a.dash} ${CIRC - a.dash}`} strokeDashoffset={a.offset}
                    style={{ transition: "stroke-dashoffset 400ms, stroke-dasharray 400ms" }} />
                ))}
              </g>
              <text x={CENTER} y={CENTER - 4} textAnchor="middle" className="fill-ink font-extrabold" style={{ fontSize: 14 }}>총 공급사</text>
              <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="fill-ink font-extrabold tabular-nums" style={{ fontSize: 18 }}>{slices.length}</text>
            </svg>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[16px] italic text-ink-soft/60 border border-dashed border-slate-200 rounded-full">
              데이터 없음
            </div>
          )}
        </div>
        <ul className="flex-1 min-w-0 flex flex-col gap-1.5 text-[16px]">
          {slices.length === 0 ? (
            <li className="italic text-ink-soft/60">공급사별 데이터가 없습니다</li>
          ) : slices.map((s, i) => {
            const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0";
            return (
              <li key={s.name} className="flex items-center gap-2 min-w-0">
                <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                <span className="truncate font-semibold text-ink">{s.name}</span>
                <span className="ml-auto font-bold text-ink-soft tabular-nums shrink-0">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default OrderReturnOverview;
