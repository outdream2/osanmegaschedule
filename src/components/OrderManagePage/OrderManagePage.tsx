// src/components/OrderManagePage/OrderManagePage.tsx
// 발주관리 페이지 — 매장관리 · 재고관리 · 입고알림관리 옆의 서브탭으로 노출
// 기존 요청목록의 '발주요청' 탭 컨텐츠를 독립 페이지로 분리
// 거래명세서 서브탭에서는 거래명세서 OCR(OcrPage) 노출
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useVendors } from "../../hooks/useVendors";
// 2026-08-03 (#201) · 발주필요 검색 · 공통 SearchBar · SearchFilterChips · 한글 초성
import { SearchBar } from "../common/SearchBar";
import { SearchFilterChips, type ChipOption } from "../common/SearchFilterChips";
import { matchHangul } from "../common/hangulSearch";
import { useSortableTabs, type TabHandlerProps } from "../../hooks/useSortableTabs";
import { Loader2, Package, ShoppingCart, RefreshCw, Trash2, CheckSquare, Square, Send, Mail, MessageSquare, PackageCheck, AlertTriangle, Building2, ClipboardList, CheckCircle2, ChevronRight, ChevronDown, TrendingUp, ScanLine, PackagePlus, RotateCcw, X, Search, Info, MapPin } from "lucide-react";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
import { OcrPage } from "../OcrPage";
// 2026-08-03 · 매입 서브탭 임베드용 · ScanPage · ProductArrivalPage
import { ScanPage } from "../ScanPage/ScanPage";
import { ProductArrivalPage } from "../ProductArrivalPage/ProductArrivalPage";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
// VendorListEditor · VendorDetailModal · Vendor — split 패널 구성 (static import · panel 모드 지원)
import { VendorListEditor, VendorDetailModal } from "../LandingPage/VendorListEditor";
import type { Vendor } from "../LandingPage/VendorListEditor";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
// 2026-08-03 · 공급사명 정제 유틸 · vat 부가정보 제거 (표시·분류 조회 통일)
import { stripVendorAnnotation, isVatAnnotation, displayVendorName } from "../../utils/vendorNameNormalize";
import { OrderHistoryTab } from "./OrderHistoryTab";
import { StockReconciliationTab } from "../StockManagePage/StockReconciliationTab";
import { TrendingTab } from "./TrendingTab";
import { FlowTab } from "../StockManagePage/FlowTab";
import { DiffTab } from "../StockManagePage/DiffTab";
import { SupplierTab } from "../StockManagePage/SupplierTab";
import { ReturnListPanel } from "./ReturnListPanel";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
import { PaymentInfoTab } from "./PaymentInfoTab";
import { VatPreparePage } from "../VatPreparePage/VatPreparePage";
import { CategoryTab } from "./CategoryTab";
import { VendorDetailTabs } from "./VendorDetailTabs";
import { BarChart2, PieChart, ArrowLeftRight, Boxes, Wallet, Calculator } from "lucide-react";
// 2026-08-03 (#183) · 공통 TabBar (level 1 · Level-1 발주/매입/결제/통계 탭) · duplicate 스타일 흡수
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
// T-CSS Phase 2 · 2026-08-06 · 디자인 토큰 + 공통 컴포넌트 마이그레이션
import { CARD_BASE, MODAL_BACKDROP } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
// T-COMMON-InventoryEditModal · 2026-08-06 · 실재고 입력·편집 공통 모달
import { InventoryEditModal } from "../common/InventoryEditModal";
import type { InventoryEditModalInitialValues } from "../common/InventoryEditModal";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useReferenceValues } from "../../hooks/useReferenceValues";

interface OrderRequest {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  requested_at: string;
  supplier?: string | null;
  supplier_contact?: string | null; // 담당자
  supplier_email?: string | null;
  supplier_phone?: string | null;
  balance?: number | null;           // 계산 잔고
  ocr_balance?: number | null;       // 거래명세서 OCR 잔고 (비교용)
}

interface ProductInfo {
  code?: string;
  name?: string;
  product_code?: string;
  product_name?: string;
  current_stock?: number | null;
  optimal_stock?: number | null;
  supplier?: string | null;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 60) return `${diff}분 전`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / (60 * 24))}일 전`;
};

interface GoodsReceipt {
  id: string;
  order_number: string;
  supplier: string;
  supplier_contact?: string | null;
  status: "pending" | "partial" | "complete" | "over" | "returned";
  dispatched_at: string;
  received_at?: string | null;
  item_count: number;
  items?: Array<{
    product_code: string;
    product_name: string;
    order_qty: number;
    received_qty?: number | null;
  }>;
  note?: string | null;
}

interface OrderManagePageProps {
  ocrTabAuthSession?: AuthSession | null;
  ocrTabOnBack?: () => void;
  ocrTabOnNavigate?: (page: AppNavPage) => void;
  ocrTabOnLogout?: () => void;
  /** DisplayPage 서브탭 진입 시 고정할 Level-1 탭. 미지정 시 기존 기본값("purchase-order") */
  initialTopTab?: "purchase-order" | "purchase" | "payment" | "statistics";
  /** true 이면 Level-1 탭 UI 렌더 skip (DisplayPage 서브탭 모드) */
  hideTopTabs?: boolean;
}

// ArrivalMatchTab 제거됨 (2026-07-31 · 사용자 요청)

// ── 발주필요 탭 · 조건 설정 (localStorage 저장) ─────────────────────
//   · 사용자 요청 (2026-08-03) · 발주필요 상품 필터 조건 커스텀 + 저장
//   · 페이지 로딩 시 저장된 조건으로 초기화
type NeedCategoryFilterKey = string; // DB 동적 카테고리 지원 · "all" + 임의 카테고리
type OrderNeedShortageBasis = "optimal" | "min" | "realStock";
// 2026-08-03 (#189) · 정렬 기본값 · 최근 한달 판매량 필터와 함께 저장
//   · "sale_month" · 최근 한달 판매량 (top-sales?months 로 enrich)
//   · 나머지 · 기존 NeedSortKey 와 동일
type OrderNeedDefaultSortKey =
  | "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short"
  | "sale_month";
interface OrderNeedFilterConfig {
  /** 부족 판정 기준 · optimal(추천적정재고) · min(최소재고) · realStock(실재고) */
  shortageBasis: OrderNeedShortageBasis;
  /** 카테고리 필터 초기값 */
  defaultCategory: NeedCategoryFilterKey;
  /** 실재고 미입력 상품 포함 여부 · false 이면 invStockMap 에 없는 상품 제외 */
  includeMissingRealStock: boolean;
  /** 최소 부족 개수 · 부족량이 이 값 이상만 표시 (>=1) */
  minShortage: number;
  /** 2026-08-03 (#189) · 최근 한달(30일) 판매량 최소 (개) · N 이상만 표시 · 0 이면 필터 미적용 */
  minMonthlySales: number;
  /** 2026-08-03 (#189) · 기본 정렬 · 페이지 진입 시 적용 */
  defaultSortKey: OrderNeedDefaultSortKey;
  /** 2026-08-03 (#189) · 기본 정렬 방향 */
  defaultSortDir: "asc" | "desc";
}
const ORDER_NEED_CONFIG_KEY = "megatown_orderNeedFilterConfig";
const DEFAULT_ORDER_NEED_CONFIG: OrderNeedFilterConfig = {
  shortageBasis: "optimal",
  defaultCategory: "all",
  includeMissingRealStock: true,
  minShortage: 1,
  minMonthlySales: 0,
  // 2026-08-03 (#189) · 기본 정렬 · 최근 한달 판매량 desc (많이 팔린 상품 우선)
  defaultSortKey: "sale_month",
  defaultSortDir: "desc",
};
const loadOrderNeedConfig = (): OrderNeedFilterConfig => {
  try {
    const raw = localStorage.getItem(ORDER_NEED_CONFIG_KEY);
    if (!raw) return DEFAULT_ORDER_NEED_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_ORDER_NEED_CONFIG;
    const validBasis: OrderNeedShortageBasis[] = ["optimal", "min", "realStock"];
    const validCat: NeedCategoryFilterKey[] = ["all", "위탁", "선결제", "60회전", "90회전", "기타"];
    const validSortKey: OrderNeedDefaultSortKey[] = [
      "supplier", "contact", "name", "current", "inv", "optimal", "short",
      "sale_month",
    ];
    return {
      shortageBasis: validBasis.includes(parsed.shortageBasis) ? parsed.shortageBasis : DEFAULT_ORDER_NEED_CONFIG.shortageBasis,
      defaultCategory: validCat.includes(parsed.defaultCategory) ? parsed.defaultCategory : DEFAULT_ORDER_NEED_CONFIG.defaultCategory,
      includeMissingRealStock: typeof parsed.includeMissingRealStock === "boolean" ? parsed.includeMissingRealStock : DEFAULT_ORDER_NEED_CONFIG.includeMissingRealStock,
      minShortage: (typeof parsed.minShortage === "number" && parsed.minShortage >= 1) ? Math.floor(parsed.minShortage) : DEFAULT_ORDER_NEED_CONFIG.minShortage,
      // 2026-08-03 (#189) · 새 필드 · 하위 호환 · fallback = DEFAULT
      minMonthlySales: (typeof parsed.minMonthlySales === "number" && parsed.minMonthlySales >= 0) ? Math.floor(parsed.minMonthlySales) : DEFAULT_ORDER_NEED_CONFIG.minMonthlySales,
      defaultSortKey: validSortKey.includes(parsed.defaultSortKey) ? parsed.defaultSortKey : DEFAULT_ORDER_NEED_CONFIG.defaultSortKey,
      defaultSortDir: (parsed.defaultSortDir === "asc" || parsed.defaultSortDir === "desc") ? parsed.defaultSortDir : DEFAULT_ORDER_NEED_CONFIG.defaultSortDir,
    };
  } catch { return DEFAULT_ORDER_NEED_CONFIG; }
};

const OrderManagePage: React.FC<OrderManagePageProps> = ({
  ocrTabAuthSession,
  ocrTabOnBack,
  ocrTabOnNavigate,
  ocrTabOnLogout,
  initialTopTab,
  hideTopTabs = false,
}) => {
  // DB + 하드코딩 병합 reference 값
  const { vendorCategories: dbVendorCategories } = useReferenceValues();
  const confirm = useConfirm();

  // Level-1 탭 (발주 / 매입 / 결제 / 통계) — 2026-08-03 재구성
  // initialTopTab 이 있으면 해당 탭으로 초기화 · props 변경 시 useEffect 로 감지 (재mount 없이)
  const [topTab, setTopTab] = useState<"purchase-order" | "purchase" | "payment" | "statistics">(initialTopTab ?? "purchase-order");
  // 2026-08-03 · props 변경 시 topTab state 동기화 · DisplayPage 서브탭 전환 · 재mount 대신 state 업데이트 · 각 컴포넌트 mount 유지 · 재fetch 없음
  useEffect(() => {
    if (initialTopTab && initialTopTab !== topTab) setTopTab(initialTopTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopTab]);
  // Level-2 서브탭 상태
  // 2026-08-10 · #16 · 발주이력 탭 추가
  const [purchaseOrderSubTab, setPurchaseOrderSubTab] = useState<"order" | "need" | "critical" | "history">("need");
  const [purchaseSubTab, setPurchaseSubTab] = useState<"receipt" | "reconciliation" | "scan" | "productarrival" | "return" | "purchase-history">("receipt");
  const [paymentSubTab, setPaymentSubTab] = useState<"vendor" | "payment-input" | "vat-prepare">("vendor");
  const [statSubTab, setStatSubTab] = useState<"trending" | "category" | "flow" | "diff" | "supplier">("trending");

  // 2026-08-03 · 관리자(level>=8) 전용 · 서브탭 long-press 드래그 재정렬 (useSortableTabs 훅)
  //   · storageKey 는 memory feedback_tab_reorder 규칙 준수 (tabOrder.<page-key>)
  //   · isAdmin 아니면 훅은 원본 순서 그대로 · 모든 이벤트 no-op
  const isAdmin = (ocrTabAuthSession?.level ?? 0) >= 8;

  // 2026-08-03 · 입고내역 상태·로직 · ProductArrivalPage 내부 탭으로 이동 (arrivalTab: "history")
  //   기존 arrivals · loadArrivals · selectedArrivalId · arrivalDetail · deleteArrival 모두 ProductArrivalPage 로 옮김

  // 공급사관리 서브 pill (재고관리 스타일 · 대시보드/원본데이터)
  // (removed 2026-07-16) vendorPageTab — VendorListEditor 를 한 줄 리스트 + 모달 방식으로 통일
  // 원본데이터 → 대시보드 전환 시 자동 선택될 공급사 id
  const [vendorPreselectId, setVendorPreselectId] = useState<number | null>(null);

  // ── 공급사관리(vendor) 탭 · 좌우 분할 레이아웃 state ──
  // 공급사 패널 폭 (useResizablePanel 훅 · god-phase1)
  const { width: vendorPanelWidth, startResize: onVendorResizeStart } = useResizablePanel({
    storageKey: "megatown_order_vendor_w",
    defaultWidth: 640,
    minWidth: 320,
    maxWidth: 1000,
  });
  // 우측 패널용 선택된 공급사 (vendor 탭)
  const [vendorSelected, setVendorSelected] = useState<Vendor | null>(null);
  const [vendorReloadKey, setVendorReloadKey] = useState(0);
  // 2026-07-30 · 사용자 요청 · 발주요청/발주필요 리스트에서 공급사 클릭 시 모달로 공급사 정보 조회/수정
  const [supplierInfoModal, setSupplierInfoModal] = useState<Vendor | null>(null);
  // ── 그룹 헤더 클릭 접기 · 발주필요 탭 (needCollapsed) ──
  const [needCollapsed, setNeedCollapsed] = useState<Set<string>>(new Set());
  const toggleNeedGroup = (g: string) => setNeedCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isNeedCollapsed = (g: string) => needCollapsed.has(g);
  // T-COMMON-InventoryEditModal · 발주요청 리스트 실재고 입력·편집 모달
  const [inventoryEditModal, setInventoryEditModal] = useState<{
    code: string;
    name: string;
    initialValues: InventoryEditModalInitialValues;
  } | null>(null);
  // ── 그룹 헤더 클릭 접기 · 발주요청 탭 (orderCollapsed) ──
  const [orderGroupCollapsed, setOrderGroupCollapsed] = useState<Set<string>>(new Set());
  const toggleOrderGroup = (g: string) => setOrderGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isOrderGroupCollapsed = (g: string) => orderGroupCollapsed.has(g);
  // 2026-07-30 · 사용자 요청 · 공급사 관리 페이지와 동일 방식으로 공급사 정보 조회
  //   findVendor (로컬 캐시) 우선 · 실패 시 API 재조회 (이름 부분 매칭 fallback)
  // T25 · 공급사 마스터 · 공용 훅 · 아래 openSupplierInfo/handleVendorEditRequest 에서 사용
  //   (useVendors 호출 위치 · declare-before-use 준수)
  const { vendors, vendorCategoryMap, getVendorCategory, findVendorByName } = useVendors();

  // 공급사 정보 팝업 · 캐시(findVendorByName) 활용 (inline fetch 제거)
  const openSupplierInfo = (supplierName: string | null | undefined) => {
    if (!supplierName) return;
    const name = String(supplierName).trim();
    if (!name) return;
    const found = findVendorByName(name);
    if (found) { setSupplierInfoModal(found as unknown as Vendor); return; }
    alert(`공급사 정보 없음: ${supplierName}`);
  };
  // 공급사 클릭 → 캐시에서 id 조회 후 우측 패널 표시 (inline fetch 제거)
  const handleVendorEditRequest = useCallback((vendorId: number) => {
    const found = vendors.find(v => v.id === vendorId);
    if (found) setVendorSelected(found as unknown as Vendor);
  }, [vendors]);

  // 거래명세서(OCR) 상태
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptFilter, setReceiptFilter] = useState<"all" | "pending" | "partial" | "complete">("all");

  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  // 2026-08-10 · #39 · 발주정보 · 상품별 이전 사입가 캐시 (purchase-history · latest_unit_price)
  const [prevPriceMap, setPrevPriceMap] = useState<Map<string, number>>(new Map());
  // 2026-08-10 · 사용자 요청 · 물류팀장에게 발송 (PDF) · 기본 체크
  const [notifyLogisticsLeader, setNotifyLogisticsLeader] = useState<boolean>(true);
  // 2026-08-10 · 발주리스트 · 주문수량 사용자 편집 (id → qty · 없으면 자동 displayShort)
  const [orderQtyOverride, setOrderQtyOverride] = useState<Map<string, number>>(new Map());
  // 2026-08-10 · 사용자 요청 · 발주필요 리스트 체크박스 · 일괄 발주요청 (복원)
  const [selectedLowStock, setSelectedLowStock] = useState<Set<string>>(new Set());
  const [bulkRequesting, setBulkRequesting] = useState(false);
  const toggleLowStockOne = (code: string) => {
    setSelectedLowStock(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  };
  const clearLowStockSelection = () => setSelectedLowStock(new Set());
  const bulkRequestOrder = async () => {
    if (selectedLowStock.size === 0) return;
    const codes = Array.from(selectedLowStock);
    setBulkRequesting(true);
    try {
      // 각 상품 · 개별 요청 (기존 handleRequestOrder 재사용)
      const products = lowStock.filter(p => codes.includes(getCode(p)));
      for (const p of products) {
        await handleRequestOrder(p);
      }
      clearLowStockSelection();
    } finally {
      setBulkRequesting(false);
    }
  };
  const [orderSearch, setOrderSearch] = useState("");
  // 2026-08-06 · 사용자 요청 · 발주요청 리스트 · 공급사 분류 필터
  const [orderCategoryFilter, setOrderCategoryFilter] = useState<NeedCategoryFilterKey>("all");

  // ── 발주필요(need) 탭 정렬 ──
  //   · 2026-08-03 (#189) · "sale_month" 추가 · orderNeedConfig.defaultSort* 로 초기화
  type NeedSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short" | "sale_month";
  const [needSortKey, setNeedSortKey] = useState<NeedSortKey>(() => loadOrderNeedConfig().defaultSortKey as NeedSortKey);
  const [needSortDir, setNeedSortDir] = useState<"asc" | "desc">(() => loadOrderNeedConfig().defaultSortDir);
  const handleNeedSort = (k: NeedSortKey) => {
    if (needSortKey === k) setNeedSortDir(d => d === "asc" ? "desc" : "asc");
    else { setNeedSortKey(k); setNeedSortDir("asc"); }
  };
  const needArrow = (k: NeedSortKey) => needSortKey !== k ? " ⇅" : needSortDir === "asc" ? " ▲" : " ▼";

  // ── 발주요청(order) 탭 정렬 ──
  type OrderSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short";
  const [orderSortKey, setOrderSortKey] = useState<OrderSortKey>("short");
  const [orderSortDir, setOrderSortDir] = useState<"asc" | "desc">("desc");
  const handleOrderSort = (k: OrderSortKey) => {
    if (orderSortKey === k) setOrderSortDir(d => d === "asc" ? "desc" : "asc");
    else { setOrderSortKey(k); setOrderSortDir("asc"); }
  };
  const orderArrow = (k: OrderSortKey) => orderSortKey !== k ? " ⇅" : orderSortDir === "asc" ? " ▲" : " ▼";

  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());
  const [lowStockSearch, setLowStockSearch] = useState("");
  const [orderReqCollapsed, setOrderReqCollapsed] = useState(false);
  const [lowStockCollapsed, setLowStockCollapsed] = useState(false);
  // (공급사 마스터 useVendors 는 상단에서 호출됨 · declare-before-use 준수)

  // 공급사 임포트 로직은 LandingPage 데이터 업로드 > 공급사관리 로 이동됨 (여기서 제거 · 2026-07-15)
  // vendorMap: 원본·공백정규화·소문자 세 가지 형태로 저장 (매칭률 극대화)
  const vendorMap = useMemo(() => {
    const m = new Map<string, { contact_name: string | null; phone: string | null; email: string | null }>();
    for (const v of vendors) {
      const info = { contact_name: v.contact_name, phone: v.phone, email: v.email };
      m.set(v.company_name.trim(), info);
      m.set(v.company_name.replace(/\s+/g, ""), info);
      m.set(v.company_name.trim().toLowerCase(), info);
    }
    return m;
  }, [vendors]);
  // 공급사명 lookup 헬퍼 (여러 변형 시도)
  const findVendor = useCallback((supplierName: string | null | undefined) => {
    if (!supplierName) return undefined;
    const s = supplierName.trim();
    return vendorMap.get(s)
      ?? vendorMap.get(s.replace(/\s+/g, ""))
      ?? vendorMap.get(s.toLowerCase());
  }, [vendorMap]);

  // 담당자 클릭 팝오버 (전화번호·이메일)
  const [contactPopover, setContactPopover] = useState<null | { anchor: DOMRect; name: string; phone: string | null; email: string | null }>(null);
  // 상품 상세 모달 (상품명 클릭 시 · products 테이블 전체 컬럼 조회 후 non-null 만 표시)
  const [detailProduct, setDetailProduct] = useState<{ code: string; name: string } | null>(null);
  const [detailFull, setDetailFull] = useState<Record<string, any> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  useEffect(() => {
    if (!detailProduct) { setDetailFull(null); setDetailError(null); return; }
    setDetailLoading(true); setDetailError(null);
    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(detailProduct.code)}`);
        if (res.ok) setDetailFull(await res.json());
        else { const b = await res.json().catch(() => ({})); setDetailError(b.error ?? `조회 실패 (${res.status})`); }
      } catch (err: any) { setDetailError(err?.message ?? "네트워크 오류"); }
      finally { setDetailLoading(false); }
    })();
  }, [detailProduct]);

  // ── 발주요청(order) 탭 · 좌우 분할 레이아웃 state ──
  // 발주 패널 폭 (useResizablePanel 훅 · god-phase1)
  const { width: orderPanelWidth, startResize: onOrderResizeStart } = useResizablePanel({
    storageKey: "megatown_ordermanage_order_w",
    defaultWidth: 640,
    minWidth: 320,
    maxWidth: 1000,
  });
  // 우측 패널용 선택 상품 (발주요청 탭)
  const [orderPanelProduct, setOrderPanelProduct] = useState<{ code: string; name: string } | null>(null);
  const [orderPanelFull, setOrderPanelFull] = useState<Record<string, any> | null>(null);
  const [orderPanelLoading, setOrderPanelLoading] = useState(false);
  const [orderPanelError, setOrderPanelError] = useState<string | null>(null);
  useEffect(() => {
    if (!orderPanelProduct) { setOrderPanelFull(null); setOrderPanelError(null); return; }
    setOrderPanelLoading(true); setOrderPanelError(null);
    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(orderPanelProduct.code)}`);
        if (res.ok) setOrderPanelFull(await res.json());
        else { const b = await res.json().catch(() => ({})); setOrderPanelError(b.error ?? `조회 실패 (${res.status})`); }
      } catch (err: any) { setOrderPanelError(err?.message ?? "네트워크 오류"); }
      finally { setOrderPanelLoading(false); }
    })();
  }, [orderPanelProduct]);

  // ── 발주필요(need) 탭 · 좌우 분할 레이아웃 state ──
  // 발주필요 패널 폭 (useResizablePanel 훅 · god-phase1)
  const { width: needPanelWidth, startResize: onNeedResizeStart } = useResizablePanel({
    storageKey: "megatown_ordermanage_need_w",
    defaultWidth: 600,
    minWidth: 320,
    maxWidth: 1000,
  });
  // ── 발주필요(need) 탭 · 조건 설정 (localStorage · 저장·로딩) ──
  //   · 사용자 요청 (2026-08-03) · 필터 조건 커스텀 · 페이지 진입 시 저장된 조건 로딩
  //   · 저장 키: megatown_orderNeedFilterConfig
  type NeedCategoryFilter = NeedCategoryFilterKey;
  const [orderNeedConfig, setOrderNeedConfig] = useState<OrderNeedFilterConfig>(() => loadOrderNeedConfig());
  // needFilterModalOpen · needFilterDraft 제거됨 (모달 → 인라인 통합 · 2026-08-03)
  // 발주판정 고급설정 펼침/접힘 state (details 대신 React 제어)
  const [needAdvancedOpen, setNeedAdvancedOpen] = useState(false);
  const [needCategoryFilter, setNeedCategoryFilter] = useState<NeedCategoryFilter>(orderNeedConfig.defaultCategory);
  // 설정된 defaultCategory 변경 시 · 현재 카테고리 필터도 즉시 반영 (사용자가 저장한 순간 UI 동기화)
  useEffect(() => { setNeedCategoryFilter(orderNeedConfig.defaultCategory); }, [orderNeedConfig.defaultCategory]);
  // 2026-08-03 (#189) · 설정된 defaultSort 변경 시 · 현재 정렬 상태도 즉시 반영 (모달 저장 순간 UI 동기화)
  useEffect(() => {
    setNeedSortKey(orderNeedConfig.defaultSortKey as NeedSortKey);
    setNeedSortDir(orderNeedConfig.defaultSortDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNeedConfig.defaultSortKey, orderNeedConfig.defaultSortDir]);

  // 2026-08-03 (#206/#207) · 발주필요 탭 · 인라인 4조건 입력 (split 위쪽 · 헤더 영역)
  //   · localStorage 키: megatown_orderNeed_inline
  //   · 매입일 N일 이상 · 재고 N개 이하 · 최근 한달 판매량 N개 이하 · 최근 3달 판매량 N개 이하
  //   · 0 이면 해당 조건 미적용 · Settings 모달(#187/#189) 과 AND 병존
  //   · #207 · 판매 잘 되는 상품 → 판매 저조 상품 필터로 방향 반전 (≥N → ≤N)
  //   · 하위 호환 · legacy minSales (≥N 방향) 는 maxSalesMonth 0 으로 초기화 (마이그레이션)
  const ORDER_NEED_INLINE_KEY = "megatown_orderNeed_inline";
  interface OrderNeedInline {
    maxCurrent: number;
    maxSalesMonth: number;    // 최근 30일 판매량 ≤ N
    maxSalesQuarter: number;  // 최근 90일 판매량 ≤ N
    // #232 · 각 조건 · 체크박스 활성/비활성 · 기본 모두 false (적정재고 이하만 노출)
    currentEnabled: boolean;
    salesMonthEnabled: boolean;
    salesQuarterEnabled: boolean;
  }
  const DEFAULT_INLINE: OrderNeedInline = {
    maxCurrent: 50, maxSalesMonth: 50, maxSalesQuarter: 100,
    // #232 · 기본 모두 미체크 → 적정재고 이하 상품 모두 표시
    currentEnabled: false, salesMonthEnabled: false, salesQuarterEnabled: false,
  };
  const loadInlineFilter = (): OrderNeedInline => {
    try {
      const raw = localStorage.getItem(ORDER_NEED_INLINE_KEY);
      if (!raw) return DEFAULT_INLINE;
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return DEFAULT_INLINE;
      const hasLegacyMinSales = "minSales" in p && !("maxSalesMonth" in p);
      return {
        maxCurrent:      typeof p.maxCurrent      === "number" && p.maxCurrent      >= 0 ? Math.floor(p.maxCurrent)      : DEFAULT_INLINE.maxCurrent,
        maxSalesMonth:   hasLegacyMinSales ? 0 : (typeof p.maxSalesMonth === "number" && p.maxSalesMonth >= 0 ? Math.floor(p.maxSalesMonth) : DEFAULT_INLINE.maxSalesMonth),
        maxSalesQuarter: typeof p.maxSalesQuarter === "number" && p.maxSalesQuarter >= 0 ? Math.floor(p.maxSalesQuarter) : DEFAULT_INLINE.maxSalesQuarter,
        // #232 · enabled 플래그 · 하위호환 (없으면 false)
        currentEnabled:      typeof p.currentEnabled      === "boolean" ? p.currentEnabled      : DEFAULT_INLINE.currentEnabled,
        salesMonthEnabled:   typeof p.salesMonthEnabled   === "boolean" ? p.salesMonthEnabled   : DEFAULT_INLINE.salesMonthEnabled,
        salesQuarterEnabled: typeof p.salesQuarterEnabled === "boolean" ? p.salesQuarterEnabled : DEFAULT_INLINE.salesQuarterEnabled,
      };
    } catch { return DEFAULT_INLINE; }
  };
  const [needInlineMaxCurrent,        setNeedInlineMaxCurrent]        = useState<number>(() => loadInlineFilter().maxCurrent);
  const [needInlineMaxSalesMonth,     setNeedInlineMaxSalesMonth]     = useState<number>(() => loadInlineFilter().maxSalesMonth);
  const [needInlineMaxSalesQuarter,   setNeedInlineMaxSalesQuarter]   = useState<number>(() => loadInlineFilter().maxSalesQuarter);
  // #232 · 각 조건 체크박스 · 기본 미체크 (적정재고 이하만 표시)
  const [needCurrentEnabled,      setNeedCurrentEnabled]      = useState<boolean>(() => loadInlineFilter().currentEnabled);
  const [needSalesMonthEnabled,   setNeedSalesMonthEnabled]   = useState<boolean>(() => loadInlineFilter().salesMonthEnabled);
  const [needSalesQuarterEnabled, setNeedSalesQuarterEnabled] = useState<boolean>(() => loadInlineFilter().salesQuarterEnabled);
  // deferred values — 입력 즉시 state · 필터는 [조회] 클릭 시 적용
  const [deferredInlineCurrent,       setDeferredInlineCurrent]       = useState(needInlineMaxCurrent);
  const [deferredInlineSalesMonth,    setDeferredInlineSalesMonth]    = useState(needInlineMaxSalesMonth);
  const [deferredInlineSalesQuarter,  setDeferredInlineSalesQuarter]  = useState(needInlineMaxSalesQuarter);
  // #232 · deferred enabled (조회 클릭 시 반영)
  const [deferredCurrentEnabled,      setDeferredCurrentEnabled]      = useState(needCurrentEnabled);
  const [deferredSalesMonthEnabled,   setDeferredSalesMonthEnabled]   = useState(needSalesMonthEnabled);
  const [deferredSalesQuarterEnabled, setDeferredSalesQuarterEnabled] = useState(needSalesQuarterEnabled);
  const inlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 2026-08-06 · 실시간 필터 반영 · 조회 중 표시 (사용자 요청)
  const [inlineFiltering, setInlineFiltering] = useState(false);
  const updateInline = useCallback((field: "current" | "salesMonth" | "salesQuarter", raw: string) => {
    const n = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (!Number.isFinite(n)) return;
    if (field === "current")      setNeedInlineMaxCurrent(n);
    if (field === "salesMonth")   setNeedInlineMaxSalesMonth(n);
    if (field === "salesQuarter") setNeedInlineMaxSalesQuarter(n);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // [조회] 버튼 · 명시적 필터 적용 (기존 유지 · 사용자가 명시적 조회 원할 때)
  const applyInlineFilter = useCallback(() => {
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    setDeferredInlineCurrent(needInlineMaxCurrent);
    setDeferredInlineSalesMonth(needInlineMaxSalesMonth);
    setDeferredInlineSalesQuarter(needInlineMaxSalesQuarter);
    setDeferredCurrentEnabled(needCurrentEnabled);
    setDeferredSalesMonthEnabled(needSalesMonthEnabled);
    setDeferredSalesQuarterEnabled(needSalesQuarterEnabled);
    setInlineFiltering(false);
    try {
      localStorage.setItem(ORDER_NEED_INLINE_KEY, JSON.stringify({
        maxCurrent: needInlineMaxCurrent,
        maxSalesMonth: needInlineMaxSalesMonth,
        maxSalesQuarter: needInlineMaxSalesQuarter,
        currentEnabled: needCurrentEnabled,
        salesMonthEnabled: needSalesMonthEnabled,
        salesQuarterEnabled: needSalesQuarterEnabled,
      }));
    } catch { /**/ }
  }, [needInlineMaxCurrent, needInlineMaxSalesMonth, needInlineMaxSalesQuarter, needCurrentEnabled, needSalesMonthEnabled, needSalesQuarterEnabled]);

  // 2026-08-06 · 실시간 필터 · 체크박스/입력 변경 시 400ms debounce 후 자동 적용 (사용자 요청)
  //   · 조회중 배지로 로딩 표시 · 완료 시 자동 사라짐
  useEffect(() => {
    setInlineFiltering(true);
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    inlineDebounceRef.current = setTimeout(() => {
      applyInlineFilter();
    }, 400);
    return () => { if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current); };
  }, [needInlineMaxCurrent, needInlineMaxSalesMonth, needInlineMaxSalesQuarter, needCurrentEnabled, needSalesMonthEnabled, needSalesQuarterEnabled, applyInlineFilter]);
  const resetInlineFilter = () => {
    if (inlineDebounceRef.current) clearTimeout(inlineDebounceRef.current);
    setNeedCurrentEnabled(false); setNeedSalesMonthEnabled(false); setNeedSalesQuarterEnabled(false);
    setDeferredCurrentEnabled(false); setDeferredSalesMonthEnabled(false); setDeferredSalesQuarterEnabled(false);
    try {
      localStorage.setItem(ORDER_NEED_INLINE_KEY, JSON.stringify({
        maxCurrent: needInlineMaxCurrent,
        maxSalesMonth: needInlineMaxSalesMonth,
        maxSalesQuarter: needInlineMaxSalesQuarter,
        currentEnabled: false, salesMonthEnabled: false, salesQuarterEnabled: false,
      }));
    } catch { /**/ }
  };
  const inlineActive = deferredCurrentEnabled || deferredSalesMonthEnabled || deferredSalesQuarterEnabled;

  // 2026-08-03 (#189) · 발주필요 · 최근 한달 판매량 enrich map
  //   · 필터 조건 (minMonthlySales) + 정렬 (sale_month) 에 사용
  //   · top-sales?months=6 재활용 (ReturnListPanel 이 이미 warm 시켜둠 · 서버 캐시 TTL 활용)
  //   · 발주필요 탭 · 필터 활성화 or 정렬 활성화 시에만 fetch (성능 · 필요없으면 skip)
  interface NeedExtra {
    saleMonth: number | null;    // 최근 30일 · top-sales sale_qty_month
    saleQuarter: number | null;  // 최근 90일 · top-sales sale_qty_90d · #207 신규
  }
  const [needExtraMap, setNeedExtraMap] = useState<Map<string, NeedExtra>>(() => new Map());
  const [needExtraLoaded, setNeedExtraLoaded] = useState(false);
  const needExtraRequired = (
    orderNeedConfig.minMonthlySales > 0 ||
    orderNeedConfig.defaultSortKey === "sale_month" ||
    needSortKey === "sale_month" ||
    // 2026-08-03 (#206/#207) · 인라인 필터도 enrich 필요
    deferredInlineSalesMonth > 0 ||
    deferredInlineSalesQuarter > 0
  );
  useEffect(() => {
    if (!needExtraRequired || needExtraLoaded) return;
    let alive = true;
    (async () => {
      try {
        // months=6 · 매입주기 계산에 충분한 이력 · limit=5000 · 전체 상품 커버
        const res = await fetch("/api/stock-manage/top-sales?months=6&limit=5000&sort=sale&dir=desc");
        if (!res.ok) return;
        const body = await res.json();
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : (Array.isArray(body) ? body : []);
        const m = new Map<string, NeedExtra>();
        for (const r of rows) {
          const code = String(r?.product_code ?? "").trim();
          if (!code) continue;
          const saleMonth = r?.sale_qty_month != null ? Number(r.sale_qty_month) : null;
          const saleQuarter = r?.sale_qty_90d != null ? Number(r.sale_qty_90d) : null;  // #207 · 3달
          m.set(code, {
            saleMonth:   Number.isFinite(saleMonth)   ? saleMonth   : null,
            saleQuarter: Number.isFinite(saleQuarter) ? saleQuarter : null,
          });
        }
        if (alive) { setNeedExtraMap(m); setNeedExtraLoaded(true); }
      } catch { /* silent · 필터/정렬 스킵 · 기존 동작 유지 */ }
    })();
    return () => { alive = false; };
  }, [needExtraRequired, needExtraLoaded]);
  // 2026-08-03 (#201) · 발주필요 · 추가 검색 필터 (기존 조건 설정 위에 UX 개선)
  //   · stockStatus · 다중 선택 · zero(0)·low(<=3)·warning(부족<10)·healthy(부족>=10)
  //   · needSearchDeferred · React 18 useDeferredValue · 입력 즉시 반응 · 필터링만 유예
  type NeedStockStatus = "zero" | "low" | "warning";
  const [needStockStatus, setNeedStockStatus] = useState<Set<NeedStockStatus>>(new Set());
  const toggleNeedStockStatus = useCallback((k: NeedStockStatus) => {
    setNeedStockStatus(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }, []);
  // 우측 패널용 선택 상품 (발주필요 탭)
  const [needPanelProduct, setNeedPanelProduct] = useState<{ code: string; name: string } | null>(null);
  const [needPanelFull, setNeedPanelFull] = useState<Record<string, any> | null>(null);
  const [needPanelLoading, setNeedPanelLoading] = useState(false);
  const [needPanelError, setNeedPanelError] = useState<string | null>(null);
  useEffect(() => {
    if (!needPanelProduct) { setNeedPanelFull(null); setNeedPanelError(null); return; }
    setNeedPanelLoading(true); setNeedPanelError(null);
    (async () => {
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(needPanelProduct.code)}`);
        if (res.ok) setNeedPanelFull(await res.json());
        else { const b = await res.json().catch(() => ({})); setNeedPanelError(b.error ?? `조회 실패 (${res.status})`); }
      } catch (err: any) { setNeedPanelError(err?.message ?? "네트워크 오류"); }
      finally { setNeedPanelLoading(false); }
    })();
  }, [needPanelProduct]);

  const loadOrderReqs = useCallback(async () => {
    setOrderLoading(true); setOrderError(null);
    try {
      const res = await fetch("/api/order-requests");
      if (res.ok) {
        const list: OrderRequest[] = await res.json();
        setOrderReqs(list);
        // 2026-08-10 · #39 · 이전 사입가 batch fetch (purchase-history · latest_unit_price)
        const codes = Array.from(new Set(list.map(r => r.product_code).filter(Boolean)));
        if (codes.length > 0) {
          try {
            const r = await fetch(`/api/products/purchase-history?codes=${encodeURIComponent(codes.join(","))}&limit=1`);
            if (r.ok) {
              const j = await r.json();
              const hist = j?.history ?? {};
              const map = new Map<string, number>();
              for (const code of codes) {
                const p = hist[code]?.latest_unit_price;
                if (p != null && Number.isFinite(Number(p))) map.set(code, Number(p));
              }
              setPrevPriceMap(map);
            }
          } catch { /* silent */ }
        }
      }
      else { const b = await res.json().catch(() => ({})); setOrderError(b.error ?? `서버 오류 (${res.status})`); setOrderReqs([]); }
    } catch { setOrderError("네트워크 오류"); setOrderReqs([]); }
    finally { setOrderLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await fetch("/api/stock-manage/low-stock");
      if (res.ok) { const data = await res.json(); setProducts(Array.isArray(data) ? data : []); }
    } finally { setProductsLoading(false); }
  }, []);

  // 전체 products (구역·spec) — 발주요청 리스트에서 low-stock 아닌 상품에도 정보 필요
  const [allProductsMap, setAllProductsMap] = useState<Record<string, any>>({});
  const reloadAllProductsMap = useCallback(async () => {
    try {
      const res = await fetch("/api/products-map");
      if (res.ok) setAllProductsMap(await res.json());
    } catch { /* silent */ }
  }, []);
  useEffect(() => { reloadAllProductsMap(); }, [reloadAllProductsMap]);
  // 전체 inventory_checks (창고1·창고2·매장1·매장2·매장3 재고 + 매장 구역) 매핑
  type InvSplit = {
    warehouse: number | null;   // 창고 합계 (w1+w2 · 하위 호환용)
    store: number | null;       // 매장 합계 (s1+s2+s3 · 하위 호환용)
    w1: number | null; w2: number | null;
    s1: number | null; s2: number | null; s3: number | null;
    s1z: string | null; s2z: string | null; s3z: string | null;
  };
  const [invMap, setInvMap] = useState<Record<string, InvSplit>>({});
  const loadInvMap = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory-checks");
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list)) return;
      const m: Record<string, InvSplit> = {};
      const numOrNull = (v: unknown) => v == null ? null : Number(v);
      const strOrNull = (v: unknown) => v == null ? null : String(v);
      for (const r of list) {
        const code = String((r as any).product_code ?? "").trim();
        if (!code || m[code]) continue;
        const w1 = numOrNull((r as any).warehouse1_stock ?? (r as any).warehouse_stock);
        const w2 = numOrNull((r as any).warehouse2_stock);
        const s1 = numOrNull((r as any).store_stock);
        const s2 = numOrNull((r as any).store_stock_2);
        const s3 = numOrNull((r as any).store3_stock);
        const whSum = (w1 != null || w2 != null) ? (Number(w1) || 0) + (Number(w2) || 0) : null;
        const stSum = (s1 != null || s2 != null || s3 != null) ? (Number(s1) || 0) + (Number(s2) || 0) + (Number(s3) || 0) : null;
        m[code] = {
          warehouse: whSum, store: stSum,
          w1, w2, s1, s2, s3,
          s1z: strOrNull((r as any).store1_zone),
          s2z: strOrNull((r as any).store2_zone),
          s3z: strOrNull((r as any).store3_zone),
        };
      }
      setInvMap(m);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { loadInvMap(); }, [loadInvMap]);
  // ✅ 실재고 수정 이벤트 수신 → 자동 재조회
  useEffect(() => {
    const handler = () => { loadInvMap(); loadProducts(); loadOrderReqs(); };
    window.addEventListener("inventory-checks-updated", handler);
    return () => window.removeEventListener("inventory-checks-updated", handler);
  }, [loadInvMap, loadProducts, loadOrderReqs]);

  useEffect(() => { loadOrderReqs(); loadProducts(); }, [loadOrderReqs, loadProducts]);

  // 거래명세서(OCR) 목록 로드 (order_dispatches → goods_receipts 통합 조회)
  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    try {
      const res = await fetch("/api/goods-receipts");
      if (res.ok) {
        const data = await res.json();
        setReceipts(Array.isArray(data) ? data : (data?.receipts ?? []));
      }
    } catch { /* silent · 서버 API 미구성일 수 있음 */ }
    finally { setReceiptsLoading(false); }
  }, []);
  useEffect(() => { if (topTab === "purchase" && purchaseSubTab === "receipt") loadReceipts(); }, [topTab, purchaseSubTab, loadReceipts]);

  // 입고 확정 (부분/완전)
  const markReceived = async (receipt: GoodsReceipt, receivedQtyMap?: Record<string, number>) => {
    const proceed = await confirm({
      message: receivedQtyMap
        ? `${receipt.supplier} · #${receipt.order_number} 입고 확정할까요?\n(부분입고: 수량 조정됨)`
        : `${receipt.supplier} · #${receipt.order_number} 완전 입고 확정할까요?`,
    });
    if (!proceed) return;
    try {
      const res = await fetch(`/api/goods-receipts/${receipt.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          received_at: new Date().toISOString(),
          received_qty_map: receivedQtyMap ?? null,
        }),
      });
      if (!res.ok) {
        alert(`입고 확정 실패\n※ 서버 API (/api/goods-receipts) 미구성일 수 있습니다.\n\nSupabase 마이그레이션 SQL:\nCREATE TABLE goods_receipts (id UUID PRIMARY KEY, dispatch_id UUID, order_number TEXT, supplier TEXT, status TEXT, received_at TIMESTAMPTZ, ...);\nCREATE TABLE goods_receipt_items (...);`);
        return;
      }
      alert(`✅ 입고 확정 완료\n#${receipt.order_number}`);
      loadReceipts();
    } catch (err: any) { alert(`오류: ${err?.message ?? err}`); }
  };

  const getCode = (p: ProductInfo) => p.code ?? p.product_code ?? "";
  const getName = (p: ProductInfo) => p.name ?? p.product_name ?? "";

  // 실재고 (창고1·창고2·매장1·매장2·매장3 + 매장 구역) 맵 · inventory_checks · low-stock fallback
  type InvStockEntry = {
    warehouse: number | null; store: number | null; total: number;
    w1: number | null; w2: number | null;
    s1: number | null; s2: number | null; s3: number | null;
    s1z: string | null; s2z: string | null; s3z: string | null;
  };
  const invStockMap = new Map<string, InvStockEntry>();
  for (const [code, iv] of Object.entries(invMap)) {
    const wh = iv.warehouse;
    const st = iv.store;
    if (wh != null || st != null) {
      const total = (Number(wh) || 0) + (Number(st) || 0);
      invStockMap.set(code, { warehouse: wh, store: st, total, w1: iv.w1, w2: iv.w2, s1: iv.s1, s2: iv.s2, s3: iv.s3, s1z: iv.s1z, s2z: iv.s2z, s3z: iv.s3z });
    }
  }
  // low-stock에서 병합 (invMap에 없는 경우 fallback · 5분리 불가 · 단일 값만)
  for (const p of products) {
    const code = getCode(p);
    if (!code || invStockMap.has(code)) continue;
    const wh = (p as any).warehouse_stock;
    const st = (p as any).store_stock;
    if (wh != null || st != null) {
      const total = (Number(wh) || 0) + (Number(st) || 0);
      invStockMap.set(code, { warehouse: wh, store: st, total, w1: wh, w2: null, s1: st, s2: null, s3: null, s1z: null, s2z: null, s3z: null });
    }
  }

  // 구역 (real_map=실제배치구역, spec=전산배치구역) 맵 — 전체 products에서 우선 구축
  const zoneMap = new Map<string, { real_map: string | null; spec: string | null }>();
  for (const [code, p] of Object.entries(allProductsMap)) {
    const realMap = (p as any).real_map ?? (p as any).realMap ?? null;
    const spec    = (p as any).spec ?? null;
    if (realMap || spec) zoneMap.set(code, { real_map: realMap, spec });
  }
  // low-stock에서도 병합 (fallback)
  for (const p of products) {
    const code = getCode(p);
    if (!code || zoneMap.has(code)) continue;
    const realMap = (p as any).real_map ?? null;
    const spec    = (p as any).spec ?? null;
    if (realMap || spec) zoneMap.set(code, { real_map: realMap, spec });
  }

  const requestedCodes = new Set(orderReqs.map(r => r.product_code));
  // ── 발주필요 · 부족 판정 (orderNeedConfig 반영) ──
  //   · shortageBasis · optimal(추천적정) · min(최소재고) · realStock(실재고 vs 추천적정)
  //   · includeMissingRealStock · false 이면 실재고(invStockMap) 미입력 상품 제외
  //   · minShortage · (기준-비교값) >= minShortage 인 상품만 포함
  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock != null ? Number(p.optimal_stock) : NaN;
    const minS = (p as any).min_stock != null ? Number((p as any).min_stock) : NaN;
    const code = getCode(p);
    const invEntry = code ? invStockMap.get(code) : undefined;
    const realTotal = invEntry ? Number(invEntry.total) : NaN;

    // 실재고 미입력 상품 · includeMissingRealStock=false 이면 제외
    if (!orderNeedConfig.includeMissingRealStock && !invEntry) return false;

    let shortage = 0;
    if (orderNeedConfig.shortageBasis === "min") {
      // 최소재고 기준 · min_stock 없거나 0 이하면 skip (판단 불가)
      if (isNaN(cur) || isNaN(minS) || minS <= 0) return false;
      shortage = minS - cur;
    } else if (orderNeedConfig.shortageBasis === "realStock") {
      // 실재고 vs 추천적정재고
      if (isNaN(opt) || opt <= 0) return false;
      if (isNaN(realTotal)) return false;   // 실재고 없으면 판단 불가 (미입력 포함 옵션과 별개)
      shortage = opt - realTotal;
    } else {
      // 기본 · optimal · 현재고 vs 추천적정재고
      if (isNaN(cur) || isNaN(opt) || opt <= 0) return false;
      shortage = opt - cur;
    }
    if (shortage < Math.max(1, orderNeedConfig.minShortage)) return false;

    // 2026-08-03 (#189) · 최근 한달 판매량 필터 (enrich 데이터 필요 · 미로딩 시 skip)
    //   · 0 이면 미적용
    //   · enrich 데이터 없는 상품 · 안전상 통과 (오탐 방지 · 미로딩 상태에서 사라지지 않음)
    //   · 데이터 있고 기준 미달 시에만 제외
    if (orderNeedConfig.minMonthlySales > 0) {
      const extra = code ? needExtraMap.get(code) : undefined;
      if (extra) {
        if (extra.saleMonth == null || extra.saleMonth < orderNeedConfig.minMonthlySales) return false;
      }
      // enrich 미로딩 상품 · 로딩 완료 후에만 엄격 적용 (needExtraLoaded=true)
      else if (needExtraLoaded) {
        return false;
      }
    }
    // 2026-08-03 (#206/#207) · 인라인 3조건 필터 (Settings 모달과 AND · debounced)
    //   · maxCurrent      > 0 이면 현재고           <= maxCurrent      (재고 N개 이하)
    //   · maxSalesMonth   > 0 이면 최근 30일 판매량 <= maxSalesMonth   (#207 · 저조 상품 · enrich · 미로딩 시 미달 판정)
    //   · maxSalesQuarter > 0 이면 최근 90일 판매량 <= maxSalesQuarter (#207 · 저조 상품 · enrich · 미로딩 시 미달 판정)
    // #232 · 체크박스 미체크 조건은 skip
    if (deferredCurrentEnabled && deferredInlineCurrent > 0) {
      if (isNaN(cur) || cur > deferredInlineCurrent) return false;
    }
    if ((deferredSalesMonthEnabled && deferredInlineSalesMonth > 0) ||
        (deferredSalesQuarterEnabled && deferredInlineSalesQuarter > 0)) {
      const extra = code ? needExtraMap.get(code) : undefined;
      if (extra) {
        if (deferredSalesMonthEnabled && deferredInlineSalesMonth > 0) {
          const s = extra.saleMonth ?? 0;
          if (s > deferredInlineSalesMonth) return false;
        }
        if (deferredSalesQuarterEnabled && deferredInlineSalesQuarter > 0) {
          const s = extra.saleQuarter ?? 0;
          if (s > deferredInlineSalesQuarter) return false;
        }
      }
    }
    return true;
  }).sort((a, b) => (Number(b.optimal_stock) - Number(b.current_stock)) - (Number(a.optimal_stock) - Number(a.current_stock)));

  const handleRequestOrder = async (p: ProductInfo) => {
    const code = getCode(p);
    setRequestingOrder(prev => { const n = new Set(prev); n.add(code); return n; });
    try {
      const res = await fetch("/api/order-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: code,
          product_name: getName(p),
          current_stock: p.current_stock,
          optimal_stock: p.optimal_stock,
          supplier: p.supplier,
          requested_at: new Date().toISOString(),
        }),
      });
      if (res.ok) await loadOrderReqs();
    } finally {
      setRequestingOrder(prev => { const n = new Set(prev); n.delete(code); return n; });
    }
  };

  const deleteOrder = async (ids: string[]) => {
    await Promise.all(ids.map(id => fetch(`/api/order-requests/${id}`, { method: "DELETE" }).catch(() => {})));
    setSelectedOrder(new Set());
    loadOrderReqs();
  };

  const [sendingBulk, setSendingBulk] = useState(false);
  // 2026-08-10 · #28 · 카카오톡 채널 추가 (SolAPI 알림톡 · env 없으면 서버가 400 반환 · gracefully fail)
  // 2026-08-10 · 사용자 요청 · 카카오톡 기본 선택 (email/sms=false)
  const [bulkChannels, setBulkChannels] = useState<{ email: boolean; sms: boolean; kakao: boolean }>({ email: false, sms: false, kakao: true });

  // 발주 모달 (표준 발주서 포맷 · 단일/일괄 공용)
  interface OrderModalItem {
    order_request_id: string;
    product_code: string;
    product_name: string;
    current_stock: number | null;
    optimal_stock: number | null;
    warehouse_stock?: number | null;
    store_stock?: number | null;
    order_qty: number;  // 발주 수량 (편집 가능)
    unit_price?: number | null;
    prev_unit_price?: number | null;  // 이전 사입단가 (purchase_details latest · 참고)
    memo?: string;
  }
  interface OrderModalSupplier {
    supplier: string;
    order_number: string;  // 공급사별 고유 발주번호 (각각 별도 발주서)
    supplier_contact?: string | null;
    supplier_email?: string | null;
    supplier_phone?: string | null;
    // 2026-08-10 · 사용자 요청 · 특이사항·요청 메모 · 공급사별 개별 저장
    memo?: string;
    balance?: number | null;
    ocr_balance?: number | null;
    // OCR 거래명세서 이력 (해당 공급사)
    ocr_statements?: Array<{
      id: string | number;
      saved_at: string;
      supplier: string;
      total_amount: number | null;
      balance: number | null;
    }>;
    ocr_loading?: boolean;
    items: OrderModalItem[];
  }
  const [orderModal, setOrderModal] = useState<null | {
    orderNumber: string;
    orderDate: string;
    desiredArrival: string;
    memo: string;
    channels: { email: boolean; sms: boolean; kakao: boolean };
    suppliers: OrderModalSupplier[];
  }>(null);

  // 발주 모달 열기
  const openOrderModal = (rows: OrderRequest[]) => {
    if (rows.length === 0) return;
    // 공급사별 그룹핑 (각 공급사마다 고유 발주번호)
    // 2026-08-10 · BUG FIX · r.supplier 대부분 null → products.supplier fallback (디스플레이와 동일 규칙)
    // vendors 캐시로 담당자/이메일/전화 보강 · 그룹핑 실패 방지
    const today = new Date();
    const ymdNow = today.toISOString().slice(0, 10);
    const genOrderNumber = () => `PO-${ymdNow.replace(/-/g, "")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const bySupplier = new Map<string, OrderModalSupplier>();
    for (const r of rows) {
      // 코드 변형 시도 (leading zeros · 8자리 패딩) · allProductsMap 조회
      const codeVars = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
      const prod = codeVars.map(c => allProductsMap[c]).find(Boolean) as any;
      // 우선순위: products.supplier → r.supplier → "(공급사 미지정)"
      const resolvedSupplier: string = (prod?.supplier || r.supplier || "").trim() || "(공급사 미지정)";
      const vendor = findVendorByName(resolvedSupplier);
      const sup = resolvedSupplier;
      if (!bySupplier.has(sup)) {
        bySupplier.set(sup, {
          supplier: sup,
          order_number: genOrderNumber(),
          supplier_contact: vendor?.contact_name || r.supplier_contact || prod?.supplier_contact || null,
          supplier_email:   vendor?.email        || r.supplier_email   || null,
          supplier_phone:   vendor?.phone        || r.supplier_phone   || null,
          balance: r.balance ?? null,
          ocr_balance: r.ocr_balance ?? null,
          items: [],
        });
      }
      const need = (r.optimal_stock ?? 0) - (r.current_stock ?? 0);
      bySupplier.get(sup)!.items.push({
        order_request_id: r.id,
        product_code: r.product_code,
        product_name: r.product_name,
        current_stock: r.current_stock,
        optimal_stock: r.optimal_stock,
        order_qty: Math.max(1, need),
        memo: "",
      });
    }
    // 대표 발주번호 (요약 표시용) · 실제 발주는 공급사별 개별 order_number 사용
    const orderNumber = `PO-${ymdNow.replace(/-/g, "")}-BULK-${String(Math.floor(Math.random() * 900) + 100)}`;
    const arrival = new Date(today.getTime() + 3 * 86400000).toISOString().slice(0, 10);
    const suppliersList = [...bySupplier.values()].map(s => ({ ...s, ocr_loading: true, ocr_statements: [] as any[] }));

    // 2026-08-10 · 이전 사입단가 조회 · 전체 상품코드 · latest_unit_price 채우기
    (async () => {
      try {
        const codes = Array.from(new Set(suppliersList.flatMap(s => s.items.map(it => it.product_code)).filter(Boolean)));
        if (codes.length === 0) return;
        const r = await fetch(`/api/products/purchase-history?codes=${encodeURIComponent(codes.join(","))}&limit=1`);
        if (!r.ok) return;
        const j = await r.json();
        const hist = j?.history ?? {};
        setOrderModal(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            suppliers: prev.suppliers.map(s => ({
              ...s,
              items: s.items.map(it => {
                const prev_unit_price = hist[it.product_code]?.latest_unit_price ?? null;
                return {
                  ...it,
                  prev_unit_price,
                  unit_price: it.unit_price ?? prev_unit_price ?? null,
                };
              }),
            })),
          };
        });
      } catch { /* ignore */ }
    })();

    // OCR 거래명세서 조회 (공급사별 · 비동기 병렬)
    Promise.all(suppliersList.map(async (s) => {
      if (s.supplier === "(공급사 미지정)") return { supplier: s.supplier, items: [] as any[] };
      try {
        const res = await fetch(`/api/ocr-confirmed-items?supplier=${encodeURIComponent(s.supplier)}&hasBalance=true`);
        if (!res.ok) return { supplier: s.supplier, items: [] as any[] };
        const data = await res.json();
        return { supplier: s.supplier, items: Array.isArray(data?.items) ? data.items : [] };
      } catch { return { supplier: s.supplier, items: [] as any[] }; }
    })).then((results) => {
      setOrderModal(prev => {
        if (!prev) return prev;
        const map = new Map<string, any[]>(results.map(r => [r.supplier, r.items]));
        return {
          ...prev,
          suppliers: prev.suppliers.map(s => {
            const items = map.get(s.supplier) ?? [];
            // 최신순 정렬 후 최대 10건만
            const sorted = [...items].sort((a: any, b: any) => String(b.saved_at).localeCompare(String(a.saved_at)));
            const latestBalance = sorted.find((it: any) => it.balance != null)?.balance ?? null;
            return {
              ...s,
              ocr_loading: false,
              ocr_statements: sorted.slice(0, 10),
              ocr_balance: latestBalance,
            };
          }),
        };
      });
    });

    setOrderModal({
      orderNumber,
      orderDate: ymdNow,
      desiredArrival: arrival,
      memo: "",
      channels: { ...bulkChannels },
      suppliers: suppliersList,
    });
  };

  // 모달 상태 편집 헬퍼
  const updateModalItem = (supIdx: number, itemIdx: number, patch: Partial<OrderModalItem>) => {
    setOrderModal(prev => {
      if (!prev) return prev;
      const suppliers = prev.suppliers.map((s, i) => i !== supIdx ? s : {
        ...s,
        items: s.items.map((it, j) => j !== itemIdx ? it : { ...it, ...patch }),
      });
      return { ...prev, suppliers };
    });
  };

  // 발주 확정 발송
  const submitOrderModal = async () => {
    if (!orderModal) return;
    if (!orderModal.channels.email && !orderModal.channels.sms && !orderModal.channels.kakao) { alert("이메일·문자·카카오톡 중 하나 이상 선택해주세요."); return; }
    const totalItems = orderModal.suppliers.reduce((n, s) => n + s.items.length, 0);
    const proceed = await confirm({
      message: `${orderModal.suppliers.length}개 공급사 · ${totalItems}개 상품에 발주서 ${orderModal.suppliers.length}건을 각각 발송합니다.\n\n계속하시겠습니까?`,
    });
    if (!proceed) return;
    setSendingBulk(true);
    try {
      // 공급사별로 별도 발주서 (각각 고유 order_number) — 병렬 발송
      const submissions = orderModal.suppliers.map(async (s) => {
        try {
          const res = await fetch("/api/order-requests/bulk-send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              order_number: s.order_number,
              order_date: orderModal.orderDate,
              desired_arrival: orderModal.desiredArrival,
              memo: s.memo ?? orderModal.memo,
              channels: orderModal.channels,
              bySupplier: [{
                supplier: s.supplier,
                supplier_contact: s.supplier_contact,
                supplier_email: s.supplier_email,
                supplier_phone: s.supplier_phone,
                items: s.items.map(it => ({
                  order_request_id: it.order_request_id,
                  product_code: it.product_code,
                  product_name: it.product_name,
                  current_stock: it.current_stock,
                  optimal_stock: it.optimal_stock,
                  needed_qty: (it.optimal_stock ?? 0) - (it.current_stock ?? 0),
                  order_qty: it.order_qty,
                  memo: it.memo,
                })),
              }],
            }),
          });
          const body = await res.json().catch(() => ({}));
          const outcomes = Array.isArray(body?.results?.[0]?.outcomes) ? body.results[0].outcomes as string[] : [];
          return {
            supplier: s.supplier,
            order_number: s.order_number,
            ok: res.ok,
            status: res.status,
            error: body?.error ?? null,
            outcomes,
          };
        } catch (e: any) {
          return { supplier: s.supplier, order_number: s.order_number, ok: false, status: 0, error: `네트워크 오류: ${e?.message ?? e}`, outcomes: [] as string[] };
        }
      });
      const results = await Promise.all(submissions);
      const succeeded = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);
      // 2026-08-10 · 사용자 요청 · 실패 사유 자세히 · 채널별 outcome + error 메시지
      const summaryLines = [
        `✅ 성공: ${succeeded}건 / ❌ 실패: ${failed.length}건`,
        "",
        ...results.filter(r => r.ok).map(r => {
          const details = r.outcomes.length > 0 ? ` · ${r.outcomes.join(" · ")}` : "";
          return `✅ ${r.supplier} → #${r.order_number}${details}`;
        }),
        ...(failed.length > 0 ? ["", `❌ 실패 상세:`, ...failed.map(r => {
          const reason = r.error ? ` · ${r.error}` : (r.status ? ` · HTTP ${r.status}` : "");
          const outc = r.outcomes.length > 0 ? ` · outcomes: ${r.outcomes.join(", ")}` : "";
          return `  · ${r.supplier} (#${r.order_number})${reason}${outc}`;
        })] : []),
      ].join("\n");
      alert(`발주서 ${orderModal.suppliers.length}건 발송 결과\n\n${summaryLines}`);
      setOrderModal(null);
      setSelectedOrder(new Set());
      loadOrderReqs();
    } catch (err: any) {
      alert(`❌ 발주 발송 오류: ${err?.message ?? err}`);
    } finally {
      setSendingBulk(false);
    }
  };

  // 선택된 발주요청을 공급사별로 그룹핑 후 일괄 발주 (이메일·문자 발송)
  // 개별 발주 (단일 상품) — 발주 모달 열기
  const handleSingleOrder = (r: OrderRequest) => openOrderModal([r]);

  // 일괄 발주 — 선택 상품으로 발주 모달 열기
  const handleBulkOrder = () => {
    const selected = orderReqs.filter(r => selectedOrder.has(r.id));
    if (selected.length === 0) { alert("발주할 상품을 선택해주세요."); return; }
    openOrderModal(selected);
  };

  const toggleOne = (id: string) => {
    setSelectedOrder(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelectedOrder(prev => prev.size === orderReqs.length ? new Set() : new Set(orderReqs.map(r => r.id)));
  };
  const allChecked = selectedOrder.size === orderReqs.length && orderReqs.length > 0;

  // 검색 + 공급사 분류 필터링 (2026-08-06 · 사용자 요청)
  const orderReqsFiltered = orderReqs.filter(r => {
    // 1) 검색
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      const ok = (r.product_name?.toLowerCase().includes(q) ||
                  r.product_code?.toLowerCase().includes(q) ||
                  r.supplier?.toLowerCase().includes(q));
      if (!ok) return false;
    }
    // 2) 카테고리 필터 (전체 · 위탁 · 선결제 · 60회전 · 90회전 · 기타)
    if (orderCategoryFilter !== "all") {
      const supplierName = String(r.supplier ?? "").trim();
      const cat = supplierName ? getVendorCategory(supplierName) : null;
      if (orderCategoryFilter === "기타") {
        const validCats = ["위탁", "선결제", "60회전", "90회전", "기타"];
        if (cat && validCats.includes(cat) && cat !== "기타") return false;
      } else {
        if (cat !== orderCategoryFilter) return false;
      }
    }
    return true;
  });
  // 2026-08-03 (#201) · React 18 useDeferredValue · 입력 즉시 · 필터링만 유예 (60fps 유지)
  //   · matchHangul · 원문 부분일치 + 한글 초성 매칭 (자체 구현 · zero-dep)
  //   · needStockStatus · 다중 선택 · zero(0)·low(1~3)·warning(부족>=10)
  const deferredNeedSearch = useDeferredValue(lowStockSearch);
  const lowStockFiltered = useMemo(() => lowStock.filter(p => {
    // 1) 검색 필터 (통합 · 상품명·코드·공급사 + 한글 초성)
    const q = deferredNeedSearch.trim();
    if (q) {
      const name = getName(p);
      const code = getCode(p);
      const sup  = p.supplier ?? "";
      const ok = matchHangul(name, q) || matchHangul(code, q) || matchHangul(sup, q);
      if (!ok) return false;
    }
    // 2) 카테고리 필터 (전체 · 위탁 · 선결제 · 60회전 · 90회전 · 기타)
    if (needCategoryFilter !== "all") {
      const supplierName = String(p.supplier ?? "").trim();
      const cat = supplierName ? getVendorCategory(supplierName) : null;
      if (needCategoryFilter === "기타") {
        const validCats = ["위탁", "선결제", "60회전", "90회전", "기타"];
        if (cat && validCats.includes(cat) && cat !== "기타") return false;
      } else {
        if (cat !== needCategoryFilter) return false;
      }
    }
    // 재고 상태 chip 필터 · 2026-08-04 · 사용자 요청으로 제거
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lowStock, deferredNeedSearch, needCategoryFilter, vendorCategoryMap]);

  // 2026-08-03 (#201) · 재고 상태 chip · 실시간 카운트 (검색·카테고리 만족 후 · 상태별 개수)
  //   · UX 원칙 · dead-end 방지 · 각 chip 옆에 만족 상품 수 노출
  const stockStatusCounts = useMemo(() => {
    let zero = 0, low = 0, warning = 0;
    for (const p of lowStock) {
      // 검색·카테고리 통과 여부만 체크 (chip 자체는 배제)
      const q = deferredNeedSearch.trim();
      if (q) {
        const name = getName(p);
        const code = getCode(p);
        const sup  = p.supplier ?? "";
        if (!(matchHangul(name, q) || matchHangul(code, q) || matchHangul(sup, q))) continue;
      }
      if (needCategoryFilter !== "all") {
        const supplierName = String(p.supplier ?? "").trim();
        const cat = supplierName ? getVendorCategory(supplierName) : null;
        if (needCategoryFilter === "기타") {
          const validCats = ["위탁", "선결제", "60회전", "90회전", "기타"];
          if (cat && validCats.includes(cat) && cat !== "기타") continue;
        } else {
          if (cat !== needCategoryFilter) continue;
        }
      }
      const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
      const opt = p.optimal_stock != null ? Number(p.optimal_stock) : NaN;
      const shortage = (!isNaN(cur) && !isNaN(opt)) ? (opt - cur) : NaN;
      if (!isNaN(cur) && cur <= 0) zero++;
      else if (!isNaN(cur) && cur > 0 && cur <= 3) low++;
      if (!isNaN(shortage) && shortage >= 10) warning++;
    }
    return { zero, low, warning };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowStock, deferredNeedSearch, needCategoryFilter, vendorCategoryMap]);

  const stockStatusChipOptions: ChipOption<NeedStockStatus>[] = useMemo(() => ([
    { key: "zero",    label: "재고 0",    color: "rose",   count: stockStatusCounts.zero,    hint: "ERP 현재고 0 이하" },
    { key: "low",     label: "저재고",    color: "amber",  count: stockStatusCounts.low,     hint: "ERP 현재고 1~3" },
    { key: "warning", label: "부족 심각",  color: "violet", count: stockStatusCounts.warning, hint: "부족량(추천적정-현재고) 10 이상" },
  ]), [stockStatusCounts]);

  // ── 2026-08-03 · 서브탭 정의 (useSortableTabs 재정렬 대상) ──
  //   · 각 페이지별 storageKey 는 memory feedback_tab_reorder 규칙 준수 (tabOrder.<page>)
  //   · badge 는 렌더 시 별도 계산 (여기서는 순서·label·icon·color 만 유지)
  type PurchaseOrderKey = "order" | "need" | "critical" | "history";
  type PurchaseKey = "receipt" | "reconciliation" | "scan" | "productarrival" | "return" | "purchase-history";
  type PaymentKey = "vendor" | "payment-input" | "vat-prepare";
  type StatKey = "trending" | "category" | "flow" | "diff" | "supplier";
  interface SubTabDef<K extends string> { key: K; label: string; icon: React.ElementType; color: string; }

  const purchaseOrderDefaultTabs: SubTabDef<PurchaseOrderKey>[] = useMemo(() => [
    { key: "order",    label: "발주요청",   icon: ShoppingCart,  color: "sky"    },
    { key: "need",     label: "발주필요",   icon: ClipboardList, color: "rose"   },
    { key: "critical", label: "품절임박",   icon: AlertTriangle, color: "amber"  }, // 2026-08-04 · 실재고 기준
    { key: "history",  label: "발주이력",   icon: Package,       color: "indigo" }, // 2026-08-10 · #16 · status='ordered' · order_number 그룹
  ], []);
  const purchaseDefaultTabs: SubTabDef<PurchaseKey>[] = useMemo(() => [
    { key: "purchase-history", label: "매입이력",   icon: Building2,      color: "sky"     },
    { key: "return",           label: "반품필요",   icon: ArrowLeftRight, color: "rose"    },
    { key: "receipt",          label: "거래명세서", icon: PackageCheck,   color: "violet"  },
    { key: "scan",             label: "실재고입력", icon: ScanLine,       color: "amber"   },
    { key: "productarrival",   label: "상품입고",   icon: PackagePlus,    color: "teal"    },
    { key: "reconciliation",   label: "실재고",     icon: CheckCircle2,   color: "emerald" },
  ], []);
  const paymentDefaultTabs: SubTabDef<PaymentKey>[] = useMemo(() => [
    { key: "vendor",        label: "공급사관리", icon: Building2,     color: "teal"   },
    { key: "payment-input", label: "결제입력",   icon: Wallet,        color: "amber"  },
    { key: "vat-prepare",   label: "부가세 준비", icon: Calculator,    color: "rose"   },
  ], []);
  const statDefaultTabs: SubTabDef<StatKey>[] = useMemo(() => [
    { key: "trending", label: "급상승",         icon: TrendingUp,    color: "indigo" },
    { key: "category", label: "카테고리별현황", icon: PieChart,      color: "amber"  },
    { key: "flow",     label: "상품현황",       icon: Boxes,         color: "sky"    },
    { key: "supplier", label: "공급사별현황",   icon: Building2,     color: "emerald"}, // 2026-08-04 통계로 다시 이동 (사용자 재요청)
    { key: "diff",     label: "손실추적",       icon: AlertTriangle, color: "rose"   },
  ], []);

  const purchaseOrderSortable = useSortableTabs("tabOrder.purchase-order", purchaseOrderDefaultTabs, isAdmin);
  const purchaseSortable      = useSortableTabs("tabOrder.purchase",       purchaseDefaultTabs,      isAdmin);

  // 반품필요 탭 배지 · ReturnListPanel 에서 dispatch 하는 CustomEvent 리스닝
  const [returnNeedCount, setReturnNeedCount] = useState<number>(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.count === "number") setReturnNeedCount(detail.count);
    };
    window.addEventListener("return-need-count", handler);
    return () => window.removeEventListener("return-need-count", handler);
  }, []);
  const paymentSortable       = useSortableTabs("tabOrder.payment",        paymentDefaultTabs,       isAdmin);
  const statSortable          = useSortableTabs("tabOrder.statistics",     statDefaultTabs,          isAdmin);

  // 2026-08-03 · 페이지 진입(마운트) 시 · 모든 서브탭 · 재정렬된 순서의 첫 탭으로 리셋
  //   · useSortableTabs 훅 결과 (localStorage 순서 반영) 의 첫 원소 사용
  //   · 이전 세션 서브탭 상태 무시 · 사용자 요청 (모든 메뉴 진입 시 · 첫 서브탭 기본 표시)
  //   · 마운트 1회만 · 이후 사용자가 다른 서브탭 클릭하면 그 상태 유지
  useEffect(() => {
    const first0 = purchaseOrderSortable.tabs[0]?.key as "order" | "need" | undefined;
    const first1 = purchaseSortable.tabs[0]?.key as "receipt" | "reconciliation" | "scan" | "productarrival" | "return" | "purchase-history" | undefined;
    const first2 = paymentSortable.tabs[0]?.key as "vendor" | "payment-input" | "vat-prepare" | undefined;
    const first3 = statSortable.tabs[0]?.key as "trending" | "category" | "flow" | "diff" | undefined;
    if (first0) setPurchaseOrderSubTab(first0);
    if (first1) setPurchaseSubTab(first1);
    if (first2) setPaymentSubTab(first2);
    if (first3) setStatSubTab(first3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 서브탭 렌더 헬퍼 ──
  //   2026-08-03 (#183) · 공통 TabBar (level 2 · nested variant) 로 리팩터
  //   · 기존 API 시그니처 유지 (tabs · activeTab · setTab · sortable) · duplicate 스타일 흡수
  //   · sortable 미제공 시에도 기존 no-op 동작 그대로
  const renderSubTabs = <K extends string>(
    tabs: { k: K; label: string; icon: React.ElementType; color: string; badge?: number }[],
    activeTab: K,
    setTab: (k: K) => void,
    sortable?: { getTabProps: (key: K) => TabHandlerProps; isDragging: boolean },
  ) => (
    <TabBar<K>
      level={2}
      variant="nested"
      tabs={tabs.map((t): CommonTabDef<K> => ({
        key: t.k,
        label: t.label,
        icon: t.icon as CommonTabDef<K>["icon"],
        color: t.color as CommonTabDef<K>["color"],
        badge: t.badge,
      }))}
      activeKey={activeTab}
      onSelect={setTab}
      badgeColor="rose"
      sortable={sortable ? {
        getTabProps: (keyOrTab) => sortable.getTabProps(typeof keyOrTab === "string" ? keyOrTab : keyOrTab.key),
        isDragging: sortable.isDragging,
      } : undefined}
    />
  );

  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 py-4 flex flex-col gap-4">
      {/* ── Level-1 탭 (발주 / 매입 / 결제 / 통계) — 2026-08-03 재구성 ── */}
      {/* hideTopTabs=true 이면 DisplayPage 서브탭 모드 · Level-1 탭 UI 숨김 */}
      {/* 2026-08-03 (#183) · 공통 TabBar (level 2) 로 리팩터 · duplicate 스타일 흡수 */}
      {!hideTopTabs && (
        <TabBar<typeof topTab>
          level={2}
          tabs={[
            { key: "purchase-order", label: "발주", icon: ShoppingCart, color: "sky"    },
            { key: "purchase",       label: "매입", icon: PackageCheck, color: "violet" },
            { key: "payment",        label: "결제/세금", icon: BarChart2,    color: "teal"   },
            { key: "statistics",     label: "통계", icon: PieChart,     color: "indigo" },
          ] as CommonTabDef<typeof topTab>[]}
          activeKey={topTab}
          onSelect={setTopTab}
        />
      )}

      {/* ══ 발주 탭 (purchase-order) ══ */}
      {topTab === "purchase-order" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<PurchaseOrderKey>(
            purchaseOrderSortable.tabs.map(t => {
              // 2026-08-06 · 발주 서브탭 배지 · 발주필요·발주요청·품절임박 갯수 (사용자 요청)
              let badge: number | undefined;
              if (t.key === "need") badge = lowStockFiltered.length;
              else if (t.key === "order") badge = orderReqsFiltered.length;
              else if (t.key === "critical") {
                // 2026-08-06 · ERP재고 3개 이하 (사용자 요청 · 실재고 → ERP 기준 변경)
                badge = products.filter(p => {
                  const cur = Number(p.current_stock ?? NaN);
                  if (!Number.isFinite(cur)) return false;
                  return cur <= 3;
                }).length;
              }
              return {
                k: t.key,
                label: t.label,
                icon: t.icon,
                color: t.color,
                badge: badge && badge > 0 ? badge : undefined,
              };
            }),
            purchaseOrderSubTab,
            setPurchaseOrderSubTab,
            { getTabProps: purchaseOrderSortable.getTabProps, isDragging: purchaseOrderSortable.isDragging },
          )}
          {/* ── 발주필요 서브탭 ── */}
          {purchaseOrderSubTab === "need" && (<>
        <div className="flex flex-col gap-2">
          {/* ══ 통합 조건 카드 · 검색 + 재고상태 + 카테고리 + 4조건 + 발주판정 설정 ══ */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            {/* ── Row 1: 검색 + 재고상태 chip ── */}
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100">
              <SearchBar
                value={lowStockSearch}
                onChange={setLowStockSearch}
                placeholder="상품·코드·공급사 검색 (한글 초성 · 예: ㅇㅅㅌ)"
                resultCount={lowStockFiltered.length}
                resultUnit="건"
                historyKey="megatown_orderNeed_search_history"
                accent="rose"
                widthClass="w-64 sm:w-80"
              />
              {/* 재고상태 필터 · 2026-08-04 · 사용자 요청으로 완전 제거 (필터·기능 모두) */}
              {lowStockSearch.trim() && (
                <button
                  type="button"
                  onClick={() => { setLowStockSearch(""); }}
                  className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-black text-slate-500 hover:text-rose-600 transition cursor-pointer"
                  title="검색 초기화"
                >
                  <RotateCcw size={11} />초기화
                </button>
              )}
            </div>

            {/* 2026-08-10 · #31 · Row 2 + Row 3 통합 · 분류 · 발주조건 · PC 한줄 · 모바일 2줄 wrap */}
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 bg-slate-50/40">
              {/* 분류 그룹 */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[12px] font-black uppercase tracking-wider text-slate-500 shrink-0">분류</span>
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 gap-0.5 flex-wrap">
                  {(["all", ...dbVendorCategories] as string[]).map(cat => {
                    const label = cat === "all" ? "전체" : cat;
                    const activeCls =
                      cat === "all"    ? "bg-slate-100  text-slate-800  border-slate-300"
                      : cat === "위탁"   ? "bg-violet-50  text-violet-700 border-violet-300"
                      : cat === "선결제" ? "bg-rose-50    text-rose-700   border-rose-300"
                      : cat === "60회전" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : cat === "90회전" ? "bg-teal-50    text-teal-700   border-teal-300"
                      : "bg-slate-50   text-slate-700  border-slate-300";
                    const active = needCategoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNeedCategoryFilter(cat)}
                        className={[
                          "px-3 h-8 rounded-md text-[13px] font-black leading-none border transition-colors cursor-pointer whitespace-nowrap",
                          active ? activeCls : "bg-white text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50",
                        ].join(" ")}
                        title={`${label} 카테고리만 표시`}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>

              {/* 발주 조건 그룹 · 통합 · PC 같은 행 · 모바일 wrap */}
              <span className="text-[13px] font-black tracking-tight text-slate-700 shrink-0 whitespace-nowrap">발주 조건</span>
              <span className="text-[10.5px] text-slate-400 shrink-0 whitespace-nowrap">체크·입력 시 자동 조회</span>
              {/* 조건 3종 · 한 그룹 · nowrap · 스크롤 X · 아주 컴팩트 (모바일 320px 도 fit) */}
              <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
                {/* 빈 span (기존 label 제거 · 위 span 사용) */}
                <span className="sr-only">발주 조건 (컴팩트)</span>

                {/* 조건 1 · 최근 한달 판매량 N개 이하 */}
                <label className="inline-flex items-center gap-1 shrink-0">
                  <input type="checkbox" checked={needSalesMonthEnabled} onChange={e => setNeedSalesMonthEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-400 cursor-pointer" />
                  <span className={`text-[11px] font-bold whitespace-nowrap ${needSalesMonthEnabled ? "text-slate-700" : "text-slate-400"}`}>1M판매</span>
                  <input
                    type="number" min={0} step={1}
                    disabled={!needSalesMonthEnabled}
                    value={needInlineMaxSalesMonth === 0 ? "" : needInlineMaxSalesMonth}
                    onChange={e => updateInline("salesMonth", e.target.value)}
                    placeholder="50"
                    className="w-12 h-7 px-1.5 rounded-md border border-slate-200 text-[12px] font-bold text-slate-800 text-right tabular-nums bg-white
                               focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                               hover:border-slate-300 transition placeholder:text-slate-300 disabled:bg-slate-50 disabled:opacity-50"
                  />
                  <span className={`text-[11px] whitespace-nowrap ${needSalesMonthEnabled ? "text-slate-500" : "text-slate-300"}`}>개↓</span>
                </label>

                {/* 조건 3 · 최근 3달 판매량 N개 이하 */}
                <label className="inline-flex items-center gap-1 shrink-0">
                  <input type="checkbox" checked={needSalesQuarterEnabled} onChange={e => setNeedSalesQuarterEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-400 cursor-pointer" />
                  <span className={`text-[11px] font-bold whitespace-nowrap ${needSalesQuarterEnabled ? "text-slate-700" : "text-slate-400"}`}>3M판매</span>
                  <input
                    type="number" min={0} step={1}
                    disabled={!needSalesQuarterEnabled}
                    value={needInlineMaxSalesQuarter === 0 ? "" : needInlineMaxSalesQuarter}
                    onChange={e => updateInline("salesQuarter", e.target.value)}
                    placeholder="100"
                    className="w-12 h-7 px-1.5 rounded-md border border-slate-200 text-[12px] font-bold text-slate-800 text-right tabular-nums bg-white
                               focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400
                               hover:border-slate-300 transition placeholder:text-slate-300 disabled:bg-slate-50 disabled:opacity-50"
                  />
                  <span className={`text-[11px] whitespace-nowrap ${needSalesQuarterEnabled ? "text-slate-500" : "text-slate-300"}`}>개↓</span>
                </label>
              </div>

              {/* 새로고침 · sm 이상 우측 밀림 */}
              <button
                onClick={loadProducts}
                disabled={productsLoading}
                className="sm:ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-slate-400 hover:text-rose-500 transition disabled:opacity-40 cursor-pointer"
                title="새로고침"
              >
                <RefreshCw size={13} className={productsLoading ? "animate-spin" : ""} />
              </button>

              {/* 2026-08-06 · 실시간 배지 제거 · 조회중일 때만 표시 (사용자 요청) */}
              {inlineFiltering && (
                <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] font-black whitespace-nowrap shrink-0">
                  <Loader2 size={12} className="animate-spin" />조회중...
                </span>
              )}

              {/* 초기화 버튼 (조건 활성 시) */}
              {inlineActive && (
                <button
                  type="button"
                  onClick={resetInlineFilter}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 bg-white
                             hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600
                             text-[11px] font-black text-slate-500 transition cursor-pointer shrink-0"
                  title="발주 조건 모두 초기화"
                >
                  <X size={11} />초기화
                </button>
              )}

              {/* 적용 중 조건 요약 badge */}
              {inlineActive && (
                <div className="hidden sm:flex items-center gap-1.5 ml-1 flex-wrap">
                  {deferredCurrentEnabled && deferredInlineCurrent > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700 whitespace-nowrap">
                      재고 ≤{deferredInlineCurrent}개
                    </span>
                  )}
                  {deferredSalesMonthEnabled && deferredInlineSalesMonth > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-700 whitespace-nowrap">
                      한달 판매 ≤{deferredInlineSalesMonth}개
                    </span>
                  )}
                  {deferredSalesQuarterEnabled && deferredInlineSalesQuarter > 0 && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] font-bold text-indigo-700 whitespace-nowrap">
                      3달 판매 ≤{deferredInlineSalesQuarter}개
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Row 4: 발주판정 고급설정 (구 톱니바퀴 모달 내용 · React 제어 펼침/접힘) ── */}
            <div>
              <button
                type="button"
                onClick={() => setNeedAdvancedOpen(o => !o)}
                className="w-full px-4 py-2 flex items-center gap-2 cursor-pointer select-none bg-slate-50/60 hover:bg-slate-50 transition text-left"
              >
                <ChevronRight size={13} className={`text-slate-400 shrink-0 transition-transform ${needAdvancedOpen ? "rotate-90" : ""}`} />
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">발주판정 고급설정</span>
                <span className="ml-1 text-[10px] text-slate-400 hidden sm:inline">
                  {orderNeedConfig.shortageBasis === "min" && "최소재고 기준"}
                  {orderNeedConfig.shortageBasis === "realStock" && "실재고 기준"}
                  {orderNeedConfig.shortageBasis === "optimal" && "추천적정재고 기준"}
                  {orderNeedConfig.minShortage > 1 && ` · 부족 ${orderNeedConfig.minShortage}개+`}
                  {!orderNeedConfig.includeMissingRealStock && " · 실재고 있는 것만"}
                  {orderNeedConfig.minMonthlySales > 0 && ` · 한달판매 ≥${orderNeedConfig.minMonthlySales}개`}
                </span>
              </button>

              {needAdvancedOpen && (
              <div className="px-4 pb-4 pt-3 flex flex-col gap-4 border-t border-slate-100 bg-slate-50/30">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* 1. 재고 부족 기준 */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">재고 부족 기준</span>
                    <div className="flex flex-col gap-1">
                      {([
                        { k: "optimal"   as OrderNeedShortageBasis, label: "현재고 < 추천적정재고", sub: "기본 · 권장" },
                        { k: "min"       as OrderNeedShortageBasis, label: "현재고 < 최소재고",     sub: "min_stock 컬럼 기준" },
                        { k: "realStock" as OrderNeedShortageBasis, label: "실재고 < 추천적정재고", sub: "실재고 없는 상품 제외" },
                      ]).map(opt => (
                        <label
                          key={opt.k}
                          className={[
                            "flex items-start gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition",
                            orderNeedConfig.shortageBasis === opt.k
                              ? "bg-indigo-50 border-indigo-300"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="shortageBasisInline"
                            className="mt-0.5 accent-indigo-600 cursor-pointer shrink-0"
                            checked={orderNeedConfig.shortageBasis === opt.k}
                            onChange={() => {
                              const next = { ...orderNeedConfig, shortageBasis: opt.k };
                              setOrderNeedConfig(next);
                              try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                            }}
                          />
                          <div className="flex flex-col leading-tight">
                            <span className="text-[12px] font-bold text-slate-800">{opt.label}</span>
                            <span className="text-[11px] text-slate-500">{opt.sub}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 2. 우측: 나머지 설정 */}
                  <div className="flex flex-col gap-3">

                    {/* 실재고 미입력 포함 */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">실재고 미입력 상품</span>
                      <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer bg-white">
                        <input
                          type="checkbox"
                          className="accent-indigo-600 cursor-pointer"
                          checked={orderNeedConfig.includeMissingRealStock}
                          onChange={e => {
                            const next = { ...orderNeedConfig, includeMissingRealStock: e.target.checked };
                            setOrderNeedConfig(next);
                            try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                          }}
                        />
                        <span className="text-[12px] font-bold text-slate-800">실재고 미입력도 포함</span>
                      </label>
                    </div>

                    {/* 최소 부족 개수 */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">최소 부족 개수</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={1} step={1}
                          value={orderNeedConfig.minShortage}
                          onChange={e => {
                            const v = Number(e.target.value);
                            const next = { ...orderNeedConfig, minShortage: Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1 };
                            setOrderNeedConfig(next);
                            try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                          }}
                          className="w-20 h-8 px-2 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-800 tabular-nums text-right
                                     focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                        />
                        <span className="text-[12px] text-slate-600">개 이상 부족</span>
                      </div>
                    </div>

                    {/* 최근 한달 판매량 최소 */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">한달 판매량 최소</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} step={1}
                          value={orderNeedConfig.minMonthlySales}
                          onChange={e => {
                            const v = Number(e.target.value);
                            const next = { ...orderNeedConfig, minMonthlySales: Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0 };
                            setOrderNeedConfig(next);
                            try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                          }}
                          className="w-20 h-8 px-2 border border-slate-200 rounded-lg text-[13px] font-bold text-slate-800 tabular-nums text-right
                                     focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 bg-white"
                        />
                        <span className="text-[12px] text-slate-600">개 이상 · 0=미적용</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 기본 정렬 */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">기본 정렬</span>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { k: "sale_month" as OrderNeedDefaultSortKey, label: "한달 판매량" },
                      { k: "short"      as OrderNeedDefaultSortKey, label: "부족량" },
                      { k: "current"    as OrderNeedDefaultSortKey, label: "ERP재고" },
                      { k: "optimal"    as OrderNeedDefaultSortKey, label: "추천적정" },
                      { k: "inv"        as OrderNeedDefaultSortKey, label: "실재고" },
                      { k: "name"       as OrderNeedDefaultSortKey, label: "상품명" },
                      { k: "supplier"   as OrderNeedDefaultSortKey, label: "공급사" },
                    ]).map(opt => (
                      <button
                        key={opt.k}
                        type="button"
                        onClick={() => {
                          const next = { ...orderNeedConfig, defaultSortKey: opt.k };
                          setOrderNeedConfig(next);
                          setNeedSortKey(opt.k as NeedSortKey);
                          try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                        }}
                        className={[
                          "px-2.5 h-7 rounded-md text-[12px] font-bold border transition cursor-pointer",
                          orderNeedConfig.defaultSortKey === opt.k
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600",
                        ].join(" ")}
                      >{opt.label}</button>
                    ))}
                    {([
                      { k: "desc" as const, label: "내림차순" },
                      { k: "asc"  as const, label: "오름차순" },
                    ]).map(opt => (
                      <button
                        key={opt.k}
                        type="button"
                        onClick={() => {
                          const next = { ...orderNeedConfig, defaultSortDir: opt.k };
                          setOrderNeedConfig(next);
                          setNeedSortDir(opt.k);
                          try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                        }}
                        className={[
                          "px-2.5 h-7 rounded-md text-[12px] font-bold border transition cursor-pointer",
                          orderNeedConfig.defaultSortDir === opt.k
                            ? "bg-slate-700 text-white border-slate-700 shadow-sm"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700",
                        ].join(" ")}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>

                {/* 카테고리 초기값 + 전체 초기화 */}
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">카테고리 초기값</span>
                    <div className="flex flex-wrap gap-1">
                      {(["all", ...dbVendorCategories] as string[]).map(cat => {
                        const label = cat === "all" ? "전체" : cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              const next = { ...orderNeedConfig, defaultCategory: cat };
                              setOrderNeedConfig(next);
                              setNeedCategoryFilter(cat);
                              try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(next)); } catch { /**/ }
                            }}
                            className={[
                              "px-2.5 h-7 rounded-md text-[12px] font-bold border transition cursor-pointer",
                              orderNeedConfig.defaultCategory === cat
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600",
                            ].join(" ")}
                          >{label}</button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setOrderNeedConfig(DEFAULT_ORDER_NEED_CONFIG);
                      setNeedCategoryFilter(DEFAULT_ORDER_NEED_CONFIG.defaultCategory);
                      setNeedSortKey(DEFAULT_ORDER_NEED_CONFIG.defaultSortKey as NeedSortKey);
                      setNeedSortDir(DEFAULT_ORDER_NEED_CONFIG.defaultSortDir);
                      try { localStorage.setItem(ORDER_NEED_CONFIG_KEY, JSON.stringify(DEFAULT_ORDER_NEED_CONFIG)); } catch { /**/ }
                    }}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-slate-300 bg-white
                               text-[11px] font-bold text-slate-600 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50
                               transition cursor-pointer shrink-0"
                    title="발주판정 설정 기본값으로 초기화"
                  >
                    <RotateCcw size={11} />기본값
                  </button>
                </div>

              </div>
              )}
            </div>
          </div>

          {/* ── 하단 split ── */}
          <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
            {/* 좌측: 발주필요 리스트 */}
            <div
              className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
              style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? needPanelWidth : undefined }}
            >
          <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
        {!lowStockCollapsed && (<>
        {productsLoading && lowStock.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mb-1 bg-sky-50 border border-sky-200 rounded-md shrink-0">
            <Loader2 size={11} className="animate-spin text-sky-600" /><span className="text-[10px] font-bold text-sky-700">조건 변경 · 새로 불러오는 중...</span>
          </div>
        )}
        {productsLoading && lowStock.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2"><Loader2 size={14} className="animate-spin" />로딩 중...</div>
        ) : lowStock.length === 0 ? (
          <div className="text-center text-[11px] text-slate-300 py-6">발주 필요 상품 없음</div>
        ) : (
          <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-block w-1 h-3.5 rounded-full bg-rose-500 shrink-0"></span>
            <span className="text-[11px] font-black text-rose-600">발주필요 리스트</span>
            <span className="text-[11px] text-slate-400 font-normal">{lowStockFiltered.length}건</span>
            {/* 2026-08-10 · 사용자 요청 · 일괄 발주요청 (체크박스 선택 · 복원) */}
            {selectedLowStock.size > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-white bg-rose-500 rounded-full px-2 py-0.5 tabular-nums">
                선택 {selectedLowStock.size}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={bulkRequestOrder}
                disabled={bulkRequesting || selectedLowStock.size === 0}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-black text-rose-800 bg-rose-100 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer shrink-0 whitespace-nowrap"
                title="선택한 상품 일괄 발주요청 리스트로 전송"
              >
                {bulkRequesting ? <Loader2 size={12} strokeWidth={2.5} className="animate-spin" /> : <Send size={12} strokeWidth={2.5} />}
                <span>{bulkRequesting ? "요청 중" : `일괄 발주요청${selectedLowStock.size > 0 ? ` (${selectedLowStock.size})` : ""}`}</span>
              </button>
              <button
                onClick={() => {
                  if (selectedLowStock.size === lowStockFiltered.length) {
                    clearLowStockSelection();
                  } else {
                    setSelectedLowStock(new Set(lowStockFiltered.map(p => getCode(p))));
                  }
                }}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer shrink-0"
              >
                {selectedLowStock.size === lowStockFiltered.length && lowStockFiltered.length > 0
                  ? <CheckSquare size={12} className="text-rose-500" />
                  : <Square size={12} />}
                전체선택
              </button>
            </div>
          </div>
          <div className={`max-h-[50vh] overflow-auto relative ${productsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            <table className="w-full text-xs sm:min-w-[540px]">
              <thead className="sticky top-0 bg-white z-10">
                {/* 그룹 카테고리 헤더 · 클릭으로 접기/펼치기 */}
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                  <th colSpan={isNeedCollapsed("info") ? 1 : 2}
                    className="text-center py-1.5 bg-sky-50 text-sky-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-sky-100 transition"
                    onClick={() => toggleNeedGroup("info")}
                    title={isNeedCollapsed("info") ? "상품 정보 펼치기" : "상품 정보 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isNeedCollapsed("info") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}상품 정보
                    </span>
                  </th>
                  <th colSpan={isNeedCollapsed("stock") ? 1 : 4}
                    className="text-center py-1.5 bg-amber-50 text-amber-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-amber-100 transition"
                    onClick={() => toggleNeedGroup("stock")}
                    title={isNeedCollapsed("stock") ? "재고 현황 펼치기" : "재고 현황 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isNeedCollapsed("stock") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}재고 현황
                    </span>
                  </th>
                  <th className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-l border-slate-100">발주 액션</th>
                </tr>
                <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wider">
                  {isNeedCollapsed("info") ? (
                    <th className="bg-sky-50/20 w-4"></th>
                  ) : (
                    <>
                      {/* 2026-08-10 · 사용자 요청 · 공급사·상품명 컬럼 · 글씨 길이만큼 auto · 너무 길면 줄바꿈 */}
                      <th onClick={() => handleNeedSort("supplier")} title="공급사 정렬" className="text-left px-1 py-1.5 w-auto whitespace-normal cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">공급사{needArrow("supplier")}</th>
                      <th onClick={() => handleNeedSort("name")} title="상품명 정렬" className="text-left px-1 py-1.5 w-auto whitespace-normal cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">상품명{needArrow("name")}</th>
                    </>
                  )}
                  {isNeedCollapsed("stock") ? (
                    <th className="bg-amber-50/20 w-4"></th>
                  ) : (
                    <>
                      {/* 2026-08-10 · 사용자 요청 · 매입주기 컬럼 제거 */}
                      <th onClick={() => handleNeedSort("current")} title="ERP재고 정렬" className="text-right px-0.5 py-1.5 w-14 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none"><div className="leading-tight">ERP<br/>재고{needArrow("current")}<br/><span className="text-[10px] text-slate-400 font-normal">(현재고)</span></div></th>
                      {/* 실재고 (합계) · 각 row 별 [상세] 버튼으로 창고1/2·매장1/2/3 확장 · #217 */}
                      <th onClick={() => handleNeedSort("inv")} title="실재고 합계 정렬 · 각 행의 [상세]로 창고1/2·매장1/2/3 확인" className="text-right px-0.5 py-1.5 w-20 bg-violet-50/40 text-violet-500 cursor-pointer hover:bg-violet-100 select-none">
                        <div className="leading-tight">실재고{needArrow("inv")}<br/><span className="text-[9px] text-slate-400 font-normal">(합계)</span></div>
                      </th>
                      {/* 적정재고 · 2026-08-04 · 사용자 요청 · 추천적정재고 → 적정재고 리네임 */}
                      <th onClick={() => handleNeedSort("optimal")} title="적정재고 정렬" className="text-right px-0.5 py-1.5 w-14 bg-indigo-50/40 text-indigo-600 cursor-pointer hover:bg-indigo-100 select-none"><div className="leading-tight">적정재고{needArrow("optimal")}</div></th>
                      {/* 부족 컬럼 · 2026-08-04 · 사용자 요청으로 제거 */}
                    </>
                  )}
                  <th className="text-center px-0.5 py-1.5 w-20 cursor-default bg-emerald-50/30 text-emerald-600">발주</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {/* 합계 요약 행 · 필터된 visible rows 기준 */}
                {(() => {
                  let sumCur = 0, sumInv = 0, sumOpt = 0, sumShort = 0;
                  let invCount = 0;
                  for (const p of lowStockFiltered) {
                    const c = Number(p.current_stock ?? 0);
                    const o = Number(p.optimal_stock ?? 0);
                    sumCur += c;
                    sumOpt += o;
                    sumShort += Math.max(0, o - c);
                    const codeK = getCode(p);
                    const invR = invStockMap.get(codeK);
                    if (invR && Number.isFinite(invR.total)) { sumInv += Number(invR.total); invCount++; }
                  }
                  return (
                    <tr className="bg-slate-100 border-b-2 border-slate-300 font-black text-slate-800 text-[12px]">
                      {isNeedCollapsed("info") ? (
                        <td className="bg-slate-100" />
                      ) : (
                        <>
                          <td className="text-left px-1 py-1.5 text-slate-500 font-bold">Σ</td>
                          <td className="text-left px-1 py-1.5 text-slate-800 font-black">합계 <span className="text-slate-500 font-bold">({lowStockFiltered.length}건)</span></td>
                        </>
                      )}
                      {isNeedCollapsed("stock") ? (
                        <td className="bg-slate-100" />
                      ) : (
                        <>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-black text-slate-800 bg-slate-100">{sumCur.toLocaleString()}</td>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-black text-violet-700 bg-violet-100/60" title={`실재고 입력된 상품 ${invCount}건 합계`}>{invCount > 0 ? sumInv.toLocaleString() : "-"}</td>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-black text-indigo-700 bg-indigo-100/60">{sumOpt.toLocaleString()}</td>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-black text-rose-700 bg-rose-100/60">-{sumShort.toLocaleString()}</td>
                        </>
                      )}
                      {/* 2026-08-10 · 매입주기 컬럼 제거 (사용자 요청) */}
                      <td className="bg-slate-100" />
                    </tr>
                  );
                })()}
                {[...lowStockFiltered].sort((a, b) => {
                  const dir = needSortDir === "asc" ? 1 : -1;
                  const aCode = getCode(a), bCode = getCode(b);
                  const aInv = invStockMap.get(aCode); const bInv = invStockMap.get(bCode);
                  const aVendor = a.supplier ? findVendor(a.supplier) : undefined;
                  const bVendor = b.supplier ? findVendor(b.supplier) : undefined;
                  const aContact = aVendor?.contact_name || (a as any).supplier_contact || "";
                  const bContact = bVendor?.contact_name || (b as any).supplier_contact || "";
                  // 2026-08-03 (#189) · sale_month · enrich map 참조 (null 은 최하위 정렬 값)
                  const aExtra = aCode ? needExtraMap.get(aCode) : undefined;
                  const bExtra = bCode ? needExtraMap.get(bCode) : undefined;
                  switch (needSortKey) {
                    case "supplier": return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
                    case "contact":  return dir * aContact.localeCompare(bContact, "ko");
                    case "name":     return dir * getName(a).localeCompare(getName(b), "ko");
                    case "current":  return dir * (Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0));
                    case "inv":      return dir * ((aInv?.total ?? -1) - (bInv?.total ?? -1));
                    case "optimal":  return dir * (Number(a.optimal_stock ?? 0) - Number(b.optimal_stock ?? 0));
                    case "short":    return dir * ((Number(a.optimal_stock ?? 0) - Number(a.current_stock ?? 0)) - (Number(b.optimal_stock ?? 0) - Number(b.current_stock ?? 0)));
                    case "sale_month": return dir * ((aExtra?.saleMonth ?? -1) - (bExtra?.saleMonth ?? -1));
                    default:         return 0;
                  }
                }).map(p => {
                  const cur = Number(p.current_stock), opt = Number(p.optimal_stock);
                  const code = getCode(p);
                  const name = getName(p);
                  const inv = invStockMap.get(code);
                  const vendor = p.supplier ? findVendor(p.supplier) : undefined;
                  const contactName = vendor?.contact_name || (p as any).supplier_contact || "-";
                  const alreadyRequested = requestedCodes.has(code);
                  const busy = requestingOrder.has(code);
                  const isChecked = selectedLowStock.has(code);
                  return (
                    <React.Fragment key={code}>
                    <tr className={`transition ${isChecked ? "bg-rose-50/40" : "hover:bg-orange-50/30"}`}>
                      {/* 상품정보 그룹 · 2026-08-10 · 사용자 요청 · 체크박스 복원 (일괄 발주요청) */}
                      {isNeedCollapsed("info") ? (
                        <td className="bg-sky-50/10 w-4"></td>
                      ) : (
                        <>
                          <td className="px-0.5 py-1.5 text-[12px] font-semibold align-top">
                            <div className="flex items-start gap-1.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleLowStockOne(code)}
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 w-3.5 h-3.5 shrink-0 cursor-pointer accent-rose-500"
                                title="선택 (일괄 발주요청)"
                              />
                              <div className="min-w-0 flex-1">
                                {p.supplier ? (() => {
                                  const cleanName = stripVendorAnnotation(p.supplier);
                                  return (
                                    <div className="flex flex-col leading-tight">
                                      <VendorCategoryBadge category={getVendorCategory(cleanName || p.supplier)} />
                                      <button type="button"
                                        onClick={(e) => { e.stopPropagation(); openSupplierInfo(cleanName || p.supplier); }}
                                        className="text-sky-700 hover:text-sky-900 hover:underline cursor-pointer text-left whitespace-nowrap"
                                        title="공급사 정보 조회·수정">{cleanName || p.supplier}</button>
                                    </div>
                                  );
                                })() : "-"}
                              </div>
                            </div>
                          </td>
                          <td className="px-0.5 py-1.5 align-top">
                            <button
                              onClick={() => setNeedPanelProduct({ code, name })}
                              className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                              title="상품 상세정보 조회"
                            >{name || "(상품명 없음)"}</button>
                          </td>
                        </>
                      )}
                      {/* 재고현황 그룹 · 4컬럼 (ERP재고 · 실재고합계 · 추천적정 · 부족) · #217 · 창고1/2·매장1/2/3 은 [상세] 버튼 확장 */}
                      {isNeedCollapsed("stock") ? (
                        <td className="bg-amber-50/10 w-4"></td>
                      ) : (
                        <>
                          {/* ERP재고 (현재고) */}
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] text-slate-700 bg-slate-50/40 align-top">{cur}</td>
                          {/* 2026-08-10 · 사용자 요청 · [상세] 버튼 제거 · 실재고 합계만 표시 · tooltip 유지 */}
                          <td
                            className={`text-right px-0.5 py-1.5 tabular-nums font-black text-[12px] bg-violet-50/40 align-top ${inv ? "text-violet-700" : "text-slate-300"}`}
                            title={inv ? `창고1 ${inv.w1 ?? "-"} · 창고2 ${inv.w2 ?? "-"} · 매장1 ${inv.s1 ?? "-"} · 매장2 ${inv.s2 ?? "-"} · 매장3 ${inv.s3 ?? "-"} = ${inv.total}` : "실재고 미입력"}
                          >
                            {inv ? inv.total : "—"}
                          </td>
                          {/* 추천적정 (indigo 톤) */}
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] text-indigo-700 bg-indigo-50/40 align-top">{opt}</td>
                          {/* 부족 (rose 톤) */}
                          <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-top">
                            <span className="tabular-nums font-black text-[12px] text-rose-600">-{opt - cur}</span>
                          </td>
                        </>
                      )}
                      {/* 2026-08-10 · 사용자 요청 · 발주 액션 버튼 단순화 · 컴팩트 · 아이콘 최소 */}
                      <td className="text-center px-1 py-1.5 align-middle whitespace-nowrap">
                        <button
                          onClick={() => handleRequestOrder(p)}
                          disabled={busy}
                          className={`h-7 px-2.5 rounded text-[12px] font-black transition cursor-pointer disabled:opacity-40 ${
                            alreadyRequested
                              ? "text-emerald-700 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100"
                              : "text-white bg-indigo-600 hover:bg-indigo-700"
                          }`}
                          title={alreadyRequested ? "발주요청 리스트에 추가됨 · 다시 요청" : "발주요청 리스트에 추가"}
                        >
                          {busy ? "..." : alreadyRequested ? "✓ 요청됨" : "요청"}
                        </button>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
                {lowStockFiltered.length === 0 && (
                  <tr><td colSpan={13} className="text-center text-[11px] text-slate-300 py-6">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
        </>)}
      </section>
        </div>{/* 좌측 패널 wrapper close */}

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onNeedResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-amber-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
        {needPanelLoading ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <LoadingState label="불러오는 중..." size="normal" />
            </div>
          </div>
        ) : needPanelError ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{needPanelError}</div>
            </div>
          </div>
        ) : (
          <ProductDetailRightPanel
            selected={needPanelFull ? ({
              code: (needPanelFull as any).product_code ?? (needPanelFull as any).code ?? (needPanelProduct?.code ?? ""),
              name: (needPanelFull as any).product_name ?? (needPanelFull as any).name ?? (needPanelProduct?.name ?? ""),
              spec: (needPanelFull as any).spec ?? "",
              ...needPanelFull,
              realMap: (needPanelFull as any).realMap ?? (needPanelFull as any).real_map ?? null,
            } as ProductInfoType) : null}
            onClose={() => setNeedPanelProduct(null)}
            onProductUpdate={(u) => setNeedPanelFull(prev => prev ? { ...prev, ...u } : prev)}
            onRealMapUpdate={(v) => setNeedPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
            showChart={true}
            context="order-manage"
            editable={true}
            emptySub="상세 정보가 표시됩니다"
            onSupplierInfoOpen={(nm) => openSupplierInfo(nm)}
          />
        )}
          </div>
        </div>
          </>)}
          {/* ── 품절임박 서브탭 · 2026-08-06 · ERP재고 기준 (사용자 요청) ── */}
          {purchaseOrderSubTab === "critical" && (
            <div className="flex flex-col gap-2">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <span className="text-[13px] font-black text-slate-800">품절임박</span>
                <span className="text-[11px] text-slate-500">ERP재고 3개 이하</span>
                {(() => {
                  const critical = products.filter(p => {
                    const cur = Number(p.current_stock ?? NaN);
                    if (!Number.isFinite(cur)) return false;
                    return cur <= 3;
                  });
                  return (
                    <span className="ml-auto text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 tabular-nums">
                      {critical.length}건
                    </span>
                  );
                })()}
              </div>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-[12px] tabular-nums">
                  <thead className="bg-slate-50/80 text-[11px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2 w-[110px]">공급사</th>
                      <th className="text-left px-3 py-2">상품명</th>
                      <th className="text-right px-3 py-2 w-[70px] bg-amber-50/40 text-amber-700">실재고</th>
                      <th className="text-right px-3 py-2 w-[70px] text-slate-500">ERP재고</th>
                      <th className="text-right px-3 py-2 w-[70px] text-indigo-600">적정재고</th>
                      <th className="text-center px-3 py-2 w-[80px]">발주</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const critical = products
                        .filter(p => {
                          const cur = Number(p.current_stock ?? NaN);
                          if (!Number.isFinite(cur)) return false;
                          return cur <= 3;
                        })
                        .sort((a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0));
                      if (critical.length === 0) {
                        return (
                          <tr><td colSpan={6} className="text-center text-[12px] text-slate-400 py-8">품절임박 상품 없음 (ERP재고 3개 이하)</td></tr>
                        );
                      }
                      return critical.map(p => {
                        const code = getCode(p);
                        const inv = invStockMap.get(code);
                        const name = String(p.product_name ?? "-");
                        const supplier = String(p.supplier ?? "-");
                        const alreadyRequested = orderReqs.some(r => r.product_code === code);
                        const curNum = Number(p.current_stock ?? 0);
                        return (
                          <tr key={code} className={`${curNum <= 0 ? "bg-rose-50/40 hover:bg-rose-50" : "hover:bg-slate-50"}`}>
                            <td className="px-3 py-1.5 text-[12px] text-slate-700 truncate max-w-[110px]" title={supplier}>{supplier}</td>
                            <td className="px-3 py-1.5 text-[13px] font-semibold text-slate-800 truncate">{name}</td>
                            <td className={`px-3 py-1.5 text-right ${inv?.total != null ? "text-amber-700" : "text-slate-300"}`}>{inv?.total ?? "-"}</td>
                            <td className={`px-3 py-1.5 text-right font-black ${curNum <= 0 ? "text-rose-700" : "text-slate-700"}`}>{p.current_stock ?? "-"}</td>
                            <td className="px-3 py-1.5 text-right text-indigo-700 font-bold">{p.optimal_stock ?? "-"}</td>
                            <td className="px-3 py-1.5 text-center">
                              <button
                                onClick={() => handleRequestOrder(p)}
                                disabled={alreadyRequested}
                                className={`h-7 px-3 rounded-md text-[12px] font-black cursor-pointer transition ${
                                  alreadyRequested
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-not-allowed"
                                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                                }`}
                              >{alreadyRequested ? "요청됨" : "요청"}</button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* 2026-08-10 · #16 · 발주이력 서브탭 · GET /api/order-history · order_number 그룹 · 마이그레이션 대기 시 empty */}
          {purchaseOrderSubTab === "history" && (
            <OrderHistoryTab />
          )}
        </div>
      )}

      {/* ══ 매입 탭 (purchase) ══ */}
      {topTab === "purchase" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<PurchaseKey>(
            purchaseSortable.tabs.map(t => ({
              k: t.key, label: t.label, icon: t.icon, color: t.color,
              badge: t.key === "return" ? returnNeedCount : undefined,
            })),
            purchaseSubTab,
            setPurchaseSubTab,
            { getTabProps: purchaseSortable.getTabProps, isDragging: purchaseSortable.isDragging },
          )}
          {/* ── 거래명세서(OCR) 서브탭 ── */}
          {purchaseSubTab === "receipt" && (
        <div className="flex-1 flex flex-col min-h-0 -mt-1">
          <OcrPage
            embedded
            authSession={ocrTabAuthSession ?? null}
            onBack={ocrTabOnBack ?? (() => {})}
            onNavigate={ocrTabOnNavigate}
            onLogout={ocrTabOnLogout}
          />
        </div>
          )}
          {/* ── 실재고(reconciliation · ERP vs 실재고 차이만 표시) 서브탭 ── */}
          {purchaseSubTab === "reconciliation" && (
            <div className="flex-1 flex flex-col min-h-0">
              <StockReconciliationTab />
            </div>
          )}
          {/* 입고내역 서브탭 · 2026-08-03 · 상품입고 페이지 내부 탭으로 이동 (ProductArrivalPage · arrivalTab: "history") */}

          {/* ── 실재고입력 서브탭 (2026-08-03 · ScanPage 임베드) ── */}
          {purchaseSubTab === "scan" && (
            <div className="flex-1 flex flex-col min-h-0 -mt-1">
              <ScanPage
                embedded
                onBack={ocrTabOnBack ?? (() => {})}
                authSession={ocrTabAuthSession ?? null}
                onNavigate={ocrTabOnNavigate}
                onLogout={ocrTabOnLogout}
              />
            </div>
          )}
          {/* ── 상품입고 서브탭 (2026-08-03 · ProductArrivalPage 임베드) ── */}
          {purchaseSubTab === "productarrival" && (
            <div className="flex-1 flex flex-col min-h-0 -mt-1">
              <ProductArrivalPage
                embedded
                onBack={ocrTabOnBack ?? (() => {})}
                authSession={ocrTabAuthSession ?? null}
                onNavigate={ocrTabOnNavigate}
                onLogout={ocrTabOnLogout}
              />
            </div>
          )}
          {/* ── 반품필요 서브탭 ── */}
          {purchaseSubTab === "return" && (
            <div className="flex-1 min-h-0">
              <ReturnListPanel onSupplierClick={openSupplierInfo} />
            </div>
          )}
          {/* ── 매입이력 서브탭 ── */}
          {purchaseSubTab === "purchase-history" && (
            <div className="flex-1 min-h-0">
              <PurchaseHistoryTab />
            </div>
          )}
          {/* 공급사별현황 · 2026-08-04 매입에서 통계로 재이동 (사용자 재요청) */}
        </div>
      )}

      {/* ══ 결제 탭 (payment) — 공급사관리 · 결제입력 서브탭 ══ */}
      {topTab === "payment" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<PaymentKey>(
            paymentSortable.tabs.map(t => ({ k: t.key, label: t.label, icon: t.icon, color: t.color })),
            paymentSubTab,
            setPaymentSubTab,
            { getTabProps: paymentSortable.getTabProps, isDragging: paymentSortable.isDragging },
          )}

          {/* ── 공급사관리 서브탭 ── */}
          {paymentSubTab === "vendor" && (
            <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
              {/* 좌측: 공급사 리스트 */}
              <div
                className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? vendorPanelWidth : undefined }}
              >
                <VendorListEditor
                  key={vendorReloadKey}
                  initialSelectedId={vendorPreselectId}
                  onEditRequest={handleVendorEditRequest}
                  compact
                />
              </div>
              {/* 리사이즈 핸들 */}
              <div onMouseDown={onVendorResizeStart}
                className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                title="드래그하여 폭 조절">
                <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
              </div>
              {/* 우측: 선택 공급사 상세 (VendorDetailTabs — 헤더 + 2탭) */}
              <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 overflow-y-auto lg:relative ${vendorSelected ? "fixed inset-0 z-50 bg-slate-50 p-3 lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-visible" : ""}`}>
                {vendorSelected && (
                  <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md -mx-3 px-3 py-2 mb-1 flex items-center gap-2">
                    <button type="button" onClick={() => setVendorSelected(null)}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0" title="닫기">
                      <span className="text-lg font-black">×</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-slate-800 leading-tight">{vendorSelected.company_name}</div>
                      <div className="text-[10px] text-slate-500">공급사 상세 · 결제잔고 · 매입이력</div>
                    </div>
                    <button type="button"
                      onClick={() => setVendorSelected(null)}
                      className="text-[11px] font-black text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-lg px-3 py-1 transition cursor-pointer shrink-0">
                      닫기
                    </button>
                  </div>
                )}
                {!vendorSelected ? (
                  <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
                    <EmptyState icon={Building2} title="리스트에서 공급사를 클릭하세요" hint="헤더 정보 + 결제잔고 + 매입이력이 표시됩니다" />
                  </div>
                ) : (
                  <VendorDetailTabs vendor={vendorSelected} />
                )}
              </div>
            </div>
          )}

          {/* ── 결제입력 서브탭 ── */}
          {paymentSubTab === "payment-input" && (
            <div className="flex-1 min-h-0">
              <PaymentInfoTab />
            </div>
          )}

          {/* ── 부가세 준비 서브탭 (#197) ── */}
          {paymentSubTab === "vat-prepare" && (
            <div className="flex-1 min-h-0">
              <VatPreparePage />
            </div>
          )}

        </div>
      )}

      {/* ══ 통계 탭 (statistics) ══ */}
      {topTab === "statistics" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<StatKey>(
            statSortable.tabs.map(t => ({ k: t.key, label: t.label, icon: t.icon, color: t.color })),
            statSubTab,
            setStatSubTab,
            { getTabProps: statSortable.getTabProps, isDragging: statSortable.isDragging },
          )}
          {statSubTab === "trending" && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TrendingTab />
            </div>
          )}
          {statSubTab === "category" && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <CategoryTab />
            </div>
          )}
          {statSubTab === "flow" && (
            <div className="flex-1 min-h-0">
              <FlowTab />
            </div>
          )}
          {/* 공급사별현황 · 2026-08-04 통계로 다시 이동 (사용자 재요청) */}
          {statSubTab === "supplier" && (
            <div className="flex-1 min-h-0">
              <SupplierTab />
            </div>
          )}
          {statSubTab === "diff" && (
            <div className="flex-1 min-h-0">
              <DiffTab />
            </div>
          )}
        </div>
      )}

      {/* ── 발주요청 서브탭 (purchase-order > order) ── */}
      {topTab === "purchase-order" && purchaseOrderSubTab === "order" && (
        <div className="flex flex-col gap-2">
          {/* 2026-08-10 · 사용자 요청 · PC 한 줄 · 모바일 wrap 2줄 (flex-wrap · lg+ 는 flex-nowrap 유도 · gap 자연 wrap) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* 제목 + 카운트 · 2026-08-10 · 폰트 +1 (15→17 · 13→15) */}
            <div className="flex items-center gap-2 shrink-0">
              <ShoppingCart size={17} className="text-rose-500 shrink-0" />
              <span className="text-[17px] font-semibold text-slate-800">발주 요청 목록</span>
              <span className="text-[15px] font-semibold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5 border border-rose-200 tabular-nums">{orderReqs.length}건</span>
              {selectedOrder.size > 0 && (
                <span className="text-[15px] font-semibold bg-rose-500 text-white rounded-full px-2 py-0.5 tabular-nums">선택 {selectedOrder.size}</span>
              )}
            </div>
            {/* 검색 */}
            <input
              type="text"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              placeholder="상품·코드·공급사"
              className="text-[15px] border border-slate-200 rounded-md pl-3 pr-3 h-9 flex-1 min-w-[140px] max-w-[240px] focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 transition"
            />
            {/* 2026-08-10 · 사용자 요청 · 일괄발주·전체선택 · 왼쪽 리스트 제목 옆으로 이동 · 툴바에는 분류 + 삭제만 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 2026-08-10 · 사용자 요청 · 필터 컴팩트 · 여백 최소 (h-7 px-1.5 · text-14) */}
              <div className="flex flex-wrap bg-slate-50 border border-slate-200 rounded p-px gap-px">
                {(["all", ...dbVendorCategories] as string[]).map(cat => {
                  const active = orderCategoryFilter === cat;
                  const label = cat === "all" ? "전체" : cat;
                  const activeCls =
                    cat === "all"    ? "bg-slate-700 text-white shadow-sm"
                    : cat === "위탁"   ? "bg-violet-500 text-white shadow-sm"
                    : cat === "선결제" ? "bg-rose-500 text-white shadow-sm"
                    : cat === "60회전" ? "bg-emerald-500 text-white shadow-sm"
                    : cat === "90회전" ? "bg-teal-500 text-white shadow-sm"
                    : "bg-slate-500 text-white shadow-sm";
                  return (
                    <button key={cat}
                      type="button"
                      onClick={() => setOrderCategoryFilter(cat)}
                      className={`h-7 px-1.5 text-[14px] font-semibold rounded transition cursor-pointer ${active ? activeCls : "text-slate-500 hover:text-slate-700"}`}
                    >{label}</button>
                  );
                })}
              </div>
              {/* 삭제 버튼만 · 일괄발주·전체선택은 리스트 제목 옆으로 이동 */}
              <div className="flex items-center gap-1.5 sm:ml-auto">
                {/* 2026-08-10 · 사용자 요청 · 삭제 아이콘 제거 · 선택삭제 버튼은 리스트 제목 옆 [전체선택] 옆으로 이동 */}
              </div>
            </div>
          </div>

          {/* ── 하단 split ── */}
          <div className="flex flex-col lg:flex-row gap-2 lg:min-h-[520px]">
            {/* 좌측: 발주요청 리스트 */}
            <div
              className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
              style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? orderPanelWidth : undefined }}
            >
          {/* 발주 요청 목록 */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
        {orderError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-bold">
            ⚠ {orderError}
            <button onClick={loadOrderReqs} className="ml-auto text-red-500 underline cursor-pointer">재시도</button>
          </div>
        )}
        {orderLoading && orderReqs.length > 0 && (
          <div className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mb-1 bg-sky-50 border border-sky-200 rounded-md shrink-0">
            <Loader2 size={11} className="animate-spin text-sky-600" /><span className="text-[10px] font-bold text-sky-700">조건 변경 · 새로 불러오는 중...</span>
          </div>
        )}
        {orderLoading && orderReqs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2"><Loader2 size={14} className="animate-spin" />로딩 중...</div>
        ) : orderReqs.length === 0 && !orderError ? (
          <div className="text-center text-[11px] text-slate-300 py-6">발주 요청 내역 없음</div>
        ) : (
          <>
          {/* 2026-08-10 · 사용자 요청 · 발주리스트 · 폰트 +2 · 일괄발주·전체선택 옆 배치 */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-block w-1 h-4 rounded-full bg-rose-400 shrink-0"></span>
            <span className="text-[15px] font-black text-slate-700">발주리스트</span>
            <span className="text-[15px] text-slate-400 font-normal">{orderReqsFiltered.length}건</span>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <button onClick={handleBulkOrder} disabled={sendingBulk || selectedOrder.size === 0}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[13px] font-black text-rose-800 bg-rose-100 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer shrink-0 whitespace-nowrap"
                title="선택한 발주요청을 공급사별로 그룹핑">
                {sendingBulk ? <Loader2 size={12} strokeWidth={2.5} className="animate-spin" /> : <Send size={12} strokeWidth={2.5} />}
                <span>{sendingBulk ? "발송 중" : `일괄 발주${selectedOrder.size > 0 ? ` (${selectedOrder.size})` : ""}`}</span>
              </button>
              <button onClick={toggleAll}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer shrink-0">
                {allChecked ? <CheckSquare size={12} className="text-rose-500" /> : <Square size={12} />}
                전체선택
              </button>
              {/* 2026-08-10 · 사용자 요청 · [선택삭제] 버튼 · 텍스트만 (아이콘 제거) */}
              <button onClick={async () => { if (selectedOrder.size > 0 && await confirm({ message: `${selectedOrder.size}건 삭제할까요?`, danger: true })) deleteOrder([...selectedOrder]); }}
                disabled={selectedOrder.size === 0}
                className="inline-flex items-center h-7 px-2 rounded-md text-[12px] font-medium text-slate-500 border border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                title="선택 항목 삭제">
                선택삭제{selectedOrder.size > 0 ? ` (${selectedOrder.size})` : ""}
              </button>
            </div>
          </div>
          {/* 2026-08-06 · 사용자 요청 · 손실 확인 유도 코멘트 */}
          <div className="mb-2 text-[11px] text-amber-700 bg-amber-50/60 border border-amber-200/60 rounded-md px-2 py-1 leading-snug">
            손실 확정이 되었는지 확인하세요 <span className="text-amber-500">(ERP재고 vs 실재고 차이 · 손실추적 탭 참조)</span>
          </div>
          {/* 2026-08-10 · 사용자 요청 · PC 높이 넓힘 (모바일 50vh · lg 이상 75vh · 오른쪽 상세와 밸런스) */}
          {/* 2026-08-10 · 사용자 요청 · 발주리스트 셀 폰트 +1 (order-req-list · [&_td]:text-[13px] · [&_th]:text-[12px]) */}
          <div className={`max-h-[50vh] lg:max-h-[75vh] overflow-auto relative ${orderLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            <table className="w-full text-[13px] sm:min-w-[540px] [&_tbody_td]:text-[13px] [&_thead_th]:text-[12px]">
              <thead className="sticky top-0 bg-white z-10">
                {/* 그룹 카테고리 헤더 · 클릭으로 접기/펼치기 */}
                {/* 2026-08-10 · 사용자 요청 · 상품정보 colSpan 2→1 (공급사 제거) · 발주 액션 컬럼 제거 */}
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                  <th className="bg-slate-50 w-6"></th>
                  <th colSpan={1}
                    className="text-center py-1.5 bg-sky-50 text-sky-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-sky-100 transition"
                    onClick={() => toggleOrderGroup("info")}
                    title={isOrderGroupCollapsed("info") ? "상품 정보 펼치기" : "상품 정보 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isOrderGroupCollapsed("info") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}상품 정보
                    </span>
                  </th>
                  <th colSpan={isOrderGroupCollapsed("stock") ? 1 : 3}
                    className="text-center py-1.5 bg-amber-50 text-amber-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-amber-100 transition"
                    onClick={() => toggleOrderGroup("stock")}
                    title={isOrderGroupCollapsed("stock") ? "재고 현황 펼치기" : "재고 현황 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isOrderGroupCollapsed("stock") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}재고 현황
                    </span>
                  </th>
                  {/* 2026-08-10 · #39 · 발주정보 그룹 · 주문수량·이전사입가·발주금액 */}
                  <th colSpan={3}
                    className="text-center py-1.5 bg-rose-50 text-rose-700 border-l border-slate-100">
                    <span className="inline-flex items-center gap-1">발주 정보</span>
                  </th>
                </tr>
                <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wider">
                  {/* 2026-08-06 · 사용자 요청 · 헤더 첫 컬럼 · 전체선택 체크박스 + 텍스트 */}
                  <th className="text-center px-0.5 py-1.5 w-6">
                    <button
                      onClick={toggleAll}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-500 hover:text-rose-600 transition cursor-pointer"
                      title={allChecked ? "전체 선택 해제" : "전체 선택"}
                    >
                      {allChecked ? <CheckSquare size={11} className="text-rose-500" /> : <Square size={11} />}
                      <span>전체</span>
                    </button>
                  </th>
                  {isOrderGroupCollapsed("info") ? (
                    <th className="bg-sky-50/20 w-4"></th>
                  ) : (
                    <>
                      {/* 2026-08-10 · 사용자 요청 · 공급사 컬럼 제거 · 그룹 헤더 (위) 로 통합 · 아래는 상품 정보만 */}
                      <th onClick={() => handleOrderSort("name")} title="상품명 정렬" className="text-left px-0.5 py-1.5 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">상품명{orderArrow("name")}</th>
                    </>
                  )}
                  {isOrderGroupCollapsed("stock") ? (
                    <th className="bg-amber-50/20 w-4"></th>
                  ) : (
                    <>
                      <th onClick={() => handleOrderSort("current")} title="ERP재고 정렬" className="text-right px-0.5 py-1.5 w-14 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none"><div className="leading-tight">ERP<br/>재고{orderArrow("current")}<br/><span className="text-[10px] text-slate-400 font-normal">(현재고)</span></div></th>
                      {/* 2026-08-06 · 실재고 헤더 주석처리 (사용자 요청 · 손실추적 참조 유도)
                      <th onClick={() => handleOrderSort("inv")} title="실재고 정렬" className="text-right px-0.5 py-1.5 w-16 bg-violet-50/40 text-violet-500 cursor-pointer hover:bg-violet-100 select-none">실재고{orderArrow("inv")}</th>
                      */}
                      <th onClick={() => handleOrderSort("optimal")} title="추천적정재고 정렬" className="text-right px-0.5 py-1.5 w-12 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none">추천적정{orderArrow("optimal")}</th>
                      <th onClick={() => handleOrderSort("short")} title="부족량 정렬" className="text-right px-0.5 py-1.5 w-12 bg-rose-50/40 text-rose-500 cursor-pointer hover:bg-rose-100 select-none">부족{orderArrow("short")}</th>
                    </>
                  )}
                  {/* 2026-08-10 · #39 · 발주정보 3컬럼 · 주문수량·이전사입가·발주금액 */}
                  <th className="text-right px-0.5 py-1.5 w-14 bg-rose-50/40 text-rose-600">주문<br/>수량</th>
                  <th className="text-right px-0.5 py-1.5 w-16 bg-rose-50/40 text-slate-500"><div className="leading-tight">이전<br/>사입가</div></th>
                  <th className="text-right px-0.5 py-1.5 w-20 bg-rose-50/40 text-emerald-700">발주금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {/* 2026-08-10 · #9·#17 · 공급사별 그룹 렌더 · 그룹 헤더에 [발주] 버튼 (해당 공급사 라인만 openOrderModal) */}
                {(() => {
                  const resolveSup = (r: OrderRequest): string => {
                    const cv = [r.product_code, r.product_code.replace(/^0+/, ""), r.product_code.padStart(8, "0")];
                    const p = cv.map(c => allProductsMap[c]).find(Boolean) as any;
                    return ((p?.supplier || r.supplier || "").trim()) || "(공급사 미지정)";
                  };
                  // 1) 공급사 우선 + 사용자 정렬 (secondary)
                  const sorted = [...orderReqsFiltered].sort((a, b) => {
                    const supA = resolveSup(a);
                    const supB = resolveSup(b);
                    const supCmp = supA.localeCompare(supB, "ko");
                    if (supCmp !== 0) return supCmp;
                    const dir = orderSortDir === "asc" ? 1 : -1;
                    const aCodeVars = [a.product_code, a.product_code.replace(/^0+/, ""), a.product_code.padStart(8, "0")];
                    const bCodeVars = [b.product_code, b.product_code.replace(/^0+/, ""), b.product_code.padStart(8, "0")];
                    const aProd = aCodeVars.map(c => allProductsMap[c]).find(Boolean);
                    const bProd = bCodeVars.map(c => allProductsMap[c]).find(Boolean);
                    const aVendor = findVendor((aProd as any)?.supplier) || findVendor(a.supplier) || undefined;
                    const bVendor = findVendor((bProd as any)?.supplier) || findVendor(b.supplier) || undefined;
                    const aContact = aVendor?.contact_name || a.supplier_contact || (aProd as any)?.supplier_contact || "";
                    const bContact = bVendor?.contact_name || b.supplier_contact || (bProd as any)?.supplier_contact || "";
                    const aInv = aCodeVars.map(c => invStockMap.get(c)).find(Boolean);
                    const bInv = bCodeVars.map(c => invStockMap.get(c)).find(Boolean);
                    const aCur = Number((aProd as any)?.current_stock ?? a.current_stock ?? 0);
                    const bCur = Number((bProd as any)?.current_stock ?? b.current_stock ?? 0);
                    const aOpt = Number((aProd as any)?.optimal_stock ?? a.optimal_stock ?? 0);
                    const bOpt = Number((bProd as any)?.optimal_stock ?? b.optimal_stock ?? 0);
                    switch (orderSortKey) {
                      case "supplier": return 0;  // 이미 위에서 처리
                      case "contact":  return dir * aContact.localeCompare(bContact, "ko");
                      case "name":     return dir * a.product_name.localeCompare(b.product_name, "ko");
                      case "current":  return dir * (aCur - bCur);
                      case "inv":      return dir * ((aInv?.total ?? -1) - (bInv?.total ?? -1));
                      case "optimal":  return dir * (aOpt - bOpt);
                      case "short":    return dir * ((aOpt - aCur) - (bOpt - bCur));
                      default:         return 0;
                    }
                  });
                  // 2) 공급사별 그룹 집계 (헤더에 카운트·그룹 발주 버튼용)
                  const bySup = new Map<string, OrderRequest[]>();
                  for (const rr of sorted) {
                    const s = resolveSup(rr);
                    if (!bySup.has(s)) bySup.set(s, []);
                    bySup.get(s)!.push(rr);
                  }
                  let prevSup = "";
                  return sorted.map(r => {
                    const currentSup = resolveSup(r);
                    const isNewGroup = currentSup !== prevSup;
                    prevSup = currentSup;
                    const groupRows = bySup.get(currentSup) ?? [];
                  // short 계산은 아래 displayShort 로 대체됨 (실시간 재고 반영)
                  const codeVariants = [
                    r.product_code,
                    r.product_code.replace(/^0+/, ""),
                    r.product_code.padStart(8, "0"),
                  ];
                  const inv = codeVariants.map(c => invStockMap.get(c)).find(Boolean);
                  const zone = codeVariants.map(c => zoneMap.get(c)).find(Boolean);
                  const zoneDisplay = zone?.real_map || zone?.spec || "-";
                  const zoneMismatch = zone?.real_map && zone?.spec && zone.real_map !== zone.spec;
                  const productData = codeVariants.map(c => allProductsMap[c]).find(Boolean);
                  // 공급사: products 테이블(원본) 우선 · OrderRequest 스냅샷 fallback
                  const supplierDisplay = (productData as any)?.supplier || r.supplier || "-";
                  // vendor lookup: products.supplier 로 먼저 시도 · 실패 시 OrderRequest.supplier
                  const vendor = findVendor((productData as any)?.supplier) || findVendor(r.supplier) || undefined;
                  // 담당자 fallback 순서: vendor DB → OrderRequest 스냅샷 → products.supplier_contact → "-"
                  const contactName = vendor?.contact_name
                    || r.supplier_contact
                    || (productData as any)?.supplier_contact
                    || (productData as any)?.contact_name
                    || "-";
                  // ERP재고: allProductsMap 에서 최신 값 우선 · 없으면 요청 저장 시 스냅샷 (실시간 조회 옵션 A)
                  const liveCurrentStock = (productData as any)?.current_stock;
                  const displayCurrentStock = liveCurrentStock ?? r.current_stock;
                  const stockChanged = liveCurrentStock != null && r.current_stock != null && Number(liveCurrentStock) !== Number(r.current_stock);
                  const liveOptimal = (productData as any)?.optimal_stock;
                  const displayOptimal = liveOptimal ?? r.optimal_stock;
                  const displayShort = (Number(displayOptimal ?? 0)) - (Number(displayCurrentStock ?? 0));
                  return (
                    <React.Fragment key={r.id}>
                    {isNewGroup && (
                      <tr className="bg-sky-50/70 border-t-2 border-sky-200 sticky top-[38px] z-[5]">
                        <td colSpan={99} className="px-3 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* 2026-08-10 · #39 · 공급사 이름 옆 분류 badge */}
                            <VendorCategoryBadge category={getVendorCategory(currentSup)} />
                            <span className="text-[15px] font-black text-sky-900">{displayVendorName(currentSup) || currentSup}</span>
                            <span className="text-[13px] font-semibold text-sky-500 tabular-nums">{groupRows.length}건</span>
                            {/* 2026-08-10 · 사용자 요청 · 버튼 컴팩트 · 여백 최소 */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openOrderModal(groupRows); }}
                              disabled={sendingBulk}
                              className="ml-auto inline-flex items-center gap-0.5 h-6 px-1.5 rounded text-[12px] font-black text-rose-800 bg-rose-100 border border-rose-300 hover:bg-rose-200 hover:border-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
                              title={`${currentSup} · ${groupRows.length}건 발주`}
                            >
                              <Send size={11}/>발주({groupRows.length})
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className={`transition ${selectedOrder.has(r.id) ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}>
                      <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleOne(r.id); }}>
                        {selectedOrder.has(r.id)
                          ? <CheckSquare size={13} className="text-rose-500 inline cursor-pointer" />
                          : <Square size={13} className="text-slate-300 hover:text-rose-500 inline cursor-pointer" />}
                      </td>
                      {/* 상품정보 그룹 · 2026-08-10 · 공급사 셀 제거 · 그룹 헤더로 통합 · 상품명만 · 헤더 padding 일치 */}
                      {isOrderGroupCollapsed("info") ? (
                        <td className="bg-sky-50/10 w-4"></td>
                      ) : (
                        <td className="px-0.5 py-1.5 align-top">
                          <button
                            onClick={() => setOrderPanelProduct({ code: r.product_code, name: r.product_name })}
                            className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words leading-snug cursor-pointer transition line-clamp-2"
                            title={r.product_name || "상품 상세정보 조회"}
                          >{r.product_name || "(상품명 없음)"}</button>
                        </td>
                      )}
                      {/* 재고현황 그룹 */}
                      {isOrderGroupCollapsed("stock") ? (
                        <td className="bg-amber-50/10 w-4"></td>
                      ) : (
                        <>
                          <td
                            className={`text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] bg-slate-50/40 align-middle whitespace-nowrap ${stockChanged ? "text-orange-600" : "text-slate-700"}`}
                            title={stockChanged ? `요청 당시 ${r.current_stock ?? "-"} → 현재 ${displayCurrentStock ?? "-"} (변동)` : "현재 ERP 재고 (실시간)"}
                          >
                            {displayCurrentStock ?? "-"}
                            {stockChanged && <span className="text-[10px] font-normal text-slate-400 ml-1">({r.current_stock})</span>}
                          </td>
                          {/* 2026-08-06 · 실재고 셀 주석처리 (사용자 요청 · 손실추적 참조 유도)
                          <td
                            className={`text-right px-0.5 py-1.5 tabular-nums font-black text-[12px] bg-violet-50/40 align-top ${inv ? "text-violet-700" : "text-slate-300"}`}
                            title={inv ? `창고1 ${inv.w1 ?? "-"} · 창고2 ${inv.w2 ?? "-"} · 매장1 ${inv.s1 ?? "-"} · 매장2 ${inv.s2 ?? "-"} · 매장3 ${inv.s3 ?? "-"} = ${inv.total}` : "실재고 미입력"}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>{inv ? inv.total : "—"}</span>
                              {inv && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInventoryEditModal({
                                      code: r.product_code,
                                      name: r.product_name ?? r.product_code,
                                      initialValues: { w1: inv.w1, w2: inv.w2, s1: inv.s1, s2: inv.s2, s3: inv.s3, s1z: inv.s1z, s2z: inv.s2z, s3z: inv.s3z },
                                    });
                                  }}
                                  className="w-4 h-4 inline-flex items-center justify-center rounded border bg-white border-violet-300 text-violet-500 hover:bg-violet-100 transition cursor-pointer"
                                  title="상세 재고현황 (창고1/2·매장1/2/3)"
                                >
                                  <Info size={9} strokeWidth={3} />
                                </button>
                              )}
                            </div>
                          </td>
                          */}
                          {/* 2026-08-10 · align-top → align-middle · 다른 셀과 정렬 통일 */}
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] text-slate-700 bg-slate-50/40 align-middle whitespace-nowrap">{displayOptimal ?? "-"}</td>
                          <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-middle whitespace-nowrap">
                            <span className="tabular-nums font-black text-[12px] text-rose-600">{displayShort > 0 ? `-${displayShort}` : "0"}</span>
                          </td>
                        </>
                      )}
                      {/* 2026-08-10 · #39 · 발주정보 3컬럼 · 주문수량 (편집 가능) · 이전사입가 · 발주금액 */}
                      {(() => {
                        const defaultQty = displayShort > 0 ? displayShort : 0;
                        const orderQty = orderQtyOverride.has(r.id) ? orderQtyOverride.get(r.id)! : defaultQty;
                        const prevPrice = prevPriceMap.get(r.product_code) ?? null;
                        const amount = prevPrice != null ? orderQty * prevPrice : null;
                        return (
                          <>
                            <td className="text-right px-0.5 py-1.5 bg-rose-50/30 align-middle">
                              <input
                                type="number"
                                min={0}
                                value={orderQty}
                                onChange={e => {
                                  const v = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0);
                                  setOrderQtyOverride(prev => { const n = new Map(prev); n.set(r.id, v); return n; });
                                }}
                                onClick={e => e.stopPropagation()}
                                className="w-14 h-6 px-1 rounded border border-rose-200 bg-white text-right tabular-nums font-black text-[13px] text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400"
                              />
                            </td>
                            <td className="text-right px-0.5 py-1.5 tabular-nums text-[12px] text-slate-500 bg-rose-50/20 align-middle whitespace-nowrap">{prevPrice != null ? prevPrice.toLocaleString() : "-"}</td>
                            <td className="text-right px-0.5 py-1.5 tabular-nums font-black text-[13px] text-emerald-700 bg-rose-50/20 align-middle whitespace-nowrap">{amount != null ? amount.toLocaleString() : "-"}</td>
                          </>
                        );
                      })()}
                    </tr>
                    </React.Fragment>
                  );
                  });
                })()}
                {orderReqsFiltered.length === 0 && (
                  <tr><td colSpan={12} className="text-center text-[11px] text-slate-300 py-6">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
            </div>{/* 좌측 패널 wrapper close */}

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div onMouseDown={onOrderResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절">
          <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
        {orderPanelLoading ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <LoadingState label="불러오는 중..." size="normal" />
            </div>
          </div>
        ) : orderPanelError ? (
          <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{orderPanelError}</div>
            </div>
          </div>
        ) : (
          <ProductDetailRightPanel
            selected={orderPanelFull ? ({
              code: (orderPanelFull as any).product_code ?? (orderPanelFull as any).code ?? (orderPanelProduct?.code ?? ""),
              name: (orderPanelFull as any).product_name ?? (orderPanelFull as any).name ?? (orderPanelProduct?.name ?? ""),
              spec: (orderPanelFull as any).spec ?? "",
              ...orderPanelFull,
              realMap: (orderPanelFull as any).realMap ?? (orderPanelFull as any).real_map ?? null,
            } as ProductInfoType) : null}
            onClose={() => setOrderPanelProduct(null)}
            onProductUpdate={(u) => setOrderPanelFull(prev => prev ? { ...prev, ...u } : prev)}
            onRealMapUpdate={(v) => setOrderPanelFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
            showChart={true}
            context="order-manage"
            editable={true}
            emptyMessage="리스트에서 상품을 클릭하세요"
            emptySub="상세 정보가 표시됩니다"
            onSupplierInfoOpen={(nm) => openSupplierInfo(nm)}
          />
        )}
          </div>
        </div>
      )}

      {/* 발주서 (Purchase Order) 모달 — 표준 발주 포맷 */}
      {orderModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !sendingBulk && setOrderModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-md shrink-0">
                  <ShoppingCart size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-900 flex items-center gap-1 flex-wrap">
                    발주서 {orderModal.suppliers.length > 1 && <span className="text-[11px] font-bold text-slate-500">· 공급사별 {orderModal.suppliers.length}건 개별 발주</span>}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{orderModal.suppliers.length > 1 ? "일괄 발송 · 각 공급사별 고유 번호" : `#${orderModal.suppliers[0]?.order_number ?? orderModal.orderNumber}`}</div>
                </div>
              </div>
              <button
                onClick={() => !sendingBulk && setOrderModal(null)}
                disabled={sendingBulk}
                className="text-slate-400 hover:text-slate-700 text-3xl font-black w-9 h-9 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center disabled:opacity-40 shrink-0"
              >×</button>
            </div>

            {/* 발주 기본 정보 */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <label className="text-slate-500 font-black block mb-1">발주일자</label>
                <input type="date" value={orderModal.orderDate} onChange={e => setOrderModal(p => p && ({ ...p, orderDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-red-400 font-mono"/>
              </div>
              <div>
                <label className="text-slate-500 font-black block mb-1">희망 입고일</label>
                <input type="date" value={orderModal.desiredArrival} onChange={e => setOrderModal(p => p && ({ ...p, desiredArrival: e.target.value }))}
                  className="w-full border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-red-400 font-mono"/>
              </div>
              <div className="col-span-2">
                <label className="text-slate-500 font-black block mb-1">수신처</label>
                <div className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-700 font-semibold">🏪 오산 메가타운 약국</div>
              </div>
            </div>

            {/* 공급사별 상품 리스트 */}
            <div className="flex-1 overflow-y-auto max-h-[45vh] px-6 py-4 space-y-4 bg-slate-50/30">
              {orderModal.suppliers.map((s, sIdx) => {
                const totalQty = s.items.reduce((n, it) => n + it.order_qty, 0);
                const totalAmount = s.items.reduce((n, it) => n + (it.order_qty * (it.unit_price ?? 0)), 0);
                return (
                  <div key={`${s.supplier}-${sIdx}`} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    {/* 2026-08-10 · 사용자 요청 · 공급사 옆 담당자·전화·이메일 나란히 · 한 그룹 */}
                    <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-indigo-50 border-b border-slate-200 flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                      <span className="text-[10px] font-black text-sky-600 bg-white border border-sky-200 rounded-full px-2 py-0.5 shrink-0">발주서</span>
                      <span className="text-[15px] font-black text-slate-900">{s.supplier}</span>
                      <span className="text-[10px] font-mono text-indigo-600 bg-white border border-indigo-200 rounded px-1.5 py-0.5 shrink-0">#{s.order_number}</span>
                      {s.supplier_contact && (
                        <span className="text-[13px] font-semibold text-slate-700">👤 {s.supplier_contact}</span>
                      )}
                      {s.supplier_phone && (
                        <a href={`tel:${String(s.supplier_phone).replace(/[^0-9+]/g, "")}`} className="text-[13px] font-semibold text-slate-700 tabular-nums hover:text-emerald-700 hover:underline inline-flex items-center gap-1">
                          <MessageSquare size={12}/>{s.supplier_phone}
                        </a>
                      )}
                      {s.supplier_email && (
                        <a href={`mailto:${s.supplier_email}`} className="text-[13px] font-semibold text-slate-700 hover:text-emerald-700 hover:underline inline-flex items-center gap-1">
                          <Mail size={12}/>{s.supplier_email}
                        </a>
                      )}
                    </div>

                    {/* 2026-08-10 · 사용자 요청 · 예상금액·OCR 잔고 카드 제거 · 표 하단 합계로 대체 */}

                    {/* OCR 거래명세서 리스트 */}
                    {s.ocr_statements && s.ocr_statements.length > 0 && (
                      <details className="border-b border-slate-200 group">
                        <summary className="px-4 py-2 bg-slate-50/40 cursor-pointer text-[11px] font-black text-slate-600 uppercase tracking-wide hover:bg-slate-100/60 transition list-none flex items-center justify-between">
                          <span className="flex items-center gap-1.5">📋 최근 거래명세서 ({s.ocr_statements.length}건)</span>
                          <span className="text-slate-400 text-[10px] group-open:rotate-180 transition">▼</span>
                        </summary>
                        <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white">
                          {s.ocr_statements.map((st) => (
                            <div key={st.id} className="px-4 py-1.5 flex items-center justify-between gap-3 text-[11px] hover:bg-slate-50/70 transition">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-slate-400 font-mono text-[10px] w-20 shrink-0">{String(st.saved_at).slice(0, 10)}</span>
                                <span className="text-slate-700 truncate">{st.supplier}</span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-[10px]">
                                {st.total_amount != null && (
                                  <span className="text-slate-600">거래액 <span className="font-mono font-bold">{st.total_amount.toLocaleString()}원</span></span>
                                )}
                                {st.balance != null && (
                                  <span className="text-amber-700">잔고 <span className="font-mono font-black">{st.balance.toLocaleString()}원</span></span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {/* 상품 테이블 · 2026-08-10 · 이전사입가 컬럼 추가 */}
                    {/* 2026-08-10 · #35·#36·#37 · 현재고·적정 컬럼 제거 · 단가 컬럼 제거 (이전사입가 사용) · 소계 앞 "총" + 글씨 +2 */}
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 font-black uppercase tracking-wide text-[11px] border-b border-slate-200">
                          {/* 2026-08-10 · 사용자 요청 · 상품명 폭 축소 · 비고 폭 확대 · '비고(메모)' */}
                          <th className="text-center p-2 w-8">#</th>
                          <th className="text-left p-2 w-24">상품코드</th>
                          <th className="text-left p-2 w-40">상품명</th>
                          <th className="text-right p-2 w-20">발주수량</th>
                          <th className="text-right p-2 w-24"><div className="leading-tight">이전<br/>사입가</div></th>
                          <th className="text-right p-2 w-28">금액</th>
                          <th className="text-left p-2">비고 (메모)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {s.items.map((it, iIdx) => (
                          <tr key={it.order_request_id} className="hover:bg-slate-50/70">
                            <td className="p-2 text-center text-slate-400 font-black">{iIdx + 1}</td>
                            <td className="p-2 font-mono text-[12px] text-slate-400">{it.product_code}</td>
                            <td className="p-2 font-bold text-slate-800 break-words whitespace-normal leading-tight">{it.product_name}</td>
                            <td className="p-2 text-right">
                              <input type="number" min={1} value={it.order_qty}
                                onChange={e => updateModalItem(sIdx, iIdx, { order_qty: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono font-black text-red-600 focus:outline-none focus:border-red-400"/>
                            </td>
                            <td className="p-2 text-right">
                              <input type="number" min={0} value={it.unit_price ?? ""}
                                onChange={e => updateModalItem(sIdx, iIdx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                                placeholder={it.prev_unit_price != null ? String(it.prev_unit_price) : "0"}
                                className="w-24 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono focus:outline-none focus:border-red-400"/>
                            </td>
                            <td className="p-2 text-right font-mono font-black text-emerald-700">
                              {it.unit_price ? (it.order_qty * it.unit_price).toLocaleString() + "원" : "-"}
                            </td>
                            <td className="p-2">
                              <input type="text" value={it.memo ?? ""}
                                onChange={e => updateModalItem(sIdx, iIdx, { memo: e.target.value })}
                                placeholder="(선택)"
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[12px] focus:outline-none focus:border-red-400"/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-300 font-black text-[13px]">
                          <td colSpan={3} className="p-2 text-right text-slate-500 uppercase">총 소계</td>
                          <td className="p-2 text-right text-red-600 font-mono">총 {totalQty}개</td>
                          <td></td>
                          <td className="p-2 text-right text-emerald-700 font-mono">총 {totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                    {/* 2026-08-10 · 사용자 요청 · 특이사항 memo 제거 · 비고 컬럼 대체 */}
                  </div>
                );
              })}
            </div>

            {/* 발송 채널 (전역) · 특이사항 memo 제거 (비고 컬럼 사용) */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
                <div className="text-[11px] text-slate-400">
                  각 상품 비고 컬럼에 개별 메모 입력 가능
                </div>
                {/* 2026-08-10 · 사용자 요청 · 발송 채널 가로 배치 · 앞에 [물류팀장에게 발송] 체크박스 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500 font-black block">발송 채널</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* 2026-08-10 · 물류팀장에게 PDF 카톡 발송 · 기본 체크 */}
                    <label className={`text-[11px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${notifyLogisticsLeader ? "bg-indigo-50 text-indigo-700 border-indigo-300" : "bg-white text-slate-400 border-slate-200"}`} title="체크 시 · 관리자(물류팀장)에게 발주서 PDF 카톡 전송">
                      <input type="checkbox" checked={notifyLogisticsLeader} onChange={e => setNotifyLogisticsLeader(e.target.checked)} className="w-3 h-3"/>
                      📋 물류팀장 발송 (PDF)
                    </label>
                    <label className={`text-[11px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${orderModal.channels.kakao ? "bg-yellow-50 text-yellow-700 border-yellow-300" : "bg-white text-slate-400 border-slate-200"}`} title="SolAPI 알림톡 (사업자 인증·템플릿·env 필요)">
                      <input type="checkbox" checked={orderModal.channels.kakao} onChange={e => setOrderModal(p => p && ({ ...p, channels: { ...p.channels, kakao: e.target.checked } }))} className="w-3 h-3"/>
                      💬 카카오톡
                    </label>
                    <label className={`text-[11px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${orderModal.channels.email ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-400 border-slate-200"}`}>
                      <input type="checkbox" checked={orderModal.channels.email} onChange={e => setOrderModal(p => p && ({ ...p, channels: { ...p.channels, email: e.target.checked } }))} className="w-3 h-3"/>
                      <Mail size={11}/> 이메일
                    </label>
                    <label className={`text-[11px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 ${orderModal.channels.sms ? "bg-sky-50 text-sky-700 border-sky-300" : "bg-white text-slate-400 border-slate-200"}`}>
                      <input type="checkbox" checked={orderModal.channels.sms} onChange={e => setOrderModal(p => p && ({ ...p, channels: { ...p.channels, sms: e.target.checked } }))} className="w-3 h-3"/>
                      <MessageSquare size={11}/> 문자
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* 2026-08-10 · 통합 발주 요약 + 담당자 지정 · 액션 버튼 */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex flex-col gap-3">
              {/* 통합 요약 · 총 공급사·상품·금액 */}
              {(() => {
                const totalSuppliers = orderModal.suppliers.length;
                const totalItems = orderModal.suppliers.reduce((n, s) => n + s.items.length, 0);
                const totalQty = orderModal.suppliers.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.order_qty || 0), 0), 0);
                const totalAmt = orderModal.suppliers.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.order_qty || 0) * (it.unit_price ?? 0), 0), 0);
                return (
                  <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap text-[13px]">
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-slate-400">총 공급사</span>
                      <span className="font-black text-slate-800 tabular-nums">{totalSuppliers}</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-slate-400">상품</span>
                      <span className="font-black text-slate-800 tabular-nums">{totalItems}</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-slate-400">수량</span>
                      <span className="font-black text-rose-700 tabular-nums">{totalQty}</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-slate-400">금액</span>
                      <span className="font-black text-emerald-700 tabular-nums">{totalAmt > 0 ? totalAmt.toLocaleString() + "원" : "-"}</span>
                    </span>
                  </div>
                );
              })()}
              {/* 2026-08-10 · 사용자 요청 · 발송담당자 dropdown 제거 · 물류팀장 발송 체크박스로 대체 */}
              <div className="flex items-center justify-end gap-2 flex-wrap">
                {/* 2026-08-10 · 컴팩트 버튼 · 여백 최소 */}
                <button
                  onClick={() => setOrderModal(null)}
                  disabled={sendingBulk}
                  className="h-8 px-3 rounded-md text-[13px] font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                >취소</button>
                <button
                  onClick={submitOrderModal}
                  disabled={sendingBulk}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-[13px] font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {sendingBulk && <Loader2 size={12} strokeWidth={2.5} className="animate-spin" />}
                  {sendingBulk ? "발송 중..." : "발주 발송"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상품 상세정보 모달 (상품명 클릭 시) */}
      {detailProduct && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setDetailProduct(null); reloadAllProductsMap(); loadInvMap(); loadOrderReqs(); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-md">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{detailProduct.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">#{detailProduct.code}</div>
                </div>
              </div>
              <button
                onClick={() => setDetailProduct(null)}
                className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
              >×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
              {detailLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
              ) : detailError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  <div className="font-bold mb-1">❌ 조회 실패</div>
                  <div className="text-[11px] font-mono">{detailError}</div>
                </div>
              ) : detailFull ? (
                <ProductInfoCard
                  product={{
                    // API response는 product_code/product_name 필드지만 ProductInfoCard는 code/name 필드 사용
                    code: (detailFull as any).product_code ?? detailFull.code ?? detailProduct.code,
                    name: (detailFull as any).product_name ?? detailFull.name ?? detailProduct.name,
                    spec: (detailFull as any).spec ?? "",
                    ...detailFull,
                    // realMap 별칭 정규화
                    realMap: (detailFull as any).realMap ?? (detailFull as any).real_map ?? null,
                  } as ProductInfoType}
                  context="order-manage"
                  editable
                  onRealMapUpdate={(newValue) => {
                    setDetailFull(prev => prev ? { ...prev, real_map: newValue, realMap: newValue } : prev);
                  }}
                  onProductUpdate={(updates) => {
                    setDetailFull(prev => prev ? { ...prev, ...updates } : prev);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 담당자 클릭 팝오버 (전화·이메일) */}
      {contactPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContactPopover(null)} />
          <div
            className="fixed z-50 bg-white border border-slate-300 rounded-xl shadow-2xl p-3 min-w-[220px]"
            style={{
              top: Math.min(window.innerHeight - 150, contactPopover.anchor.bottom + 4),
              left: Math.min(window.innerWidth - 240, contactPopover.anchor.left),
            }}
          >
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-sm">
                {contactPopover.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-800">{contactPopover.name}</div>
                <div className="text-[10px] text-slate-400">공급사 담당자</div>
              </div>
            </div>
            <div className="space-y-1.5">
              {contactPopover.phone ? (
                <a href={`tel:${contactPopover.phone}`} className="flex items-center gap-2 text-[12px] text-slate-700 hover:text-indigo-700 hover:bg-slate-50 rounded-lg px-2 py-1.5 cursor-pointer transition">
                  <span className="w-6 h-6 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600">📞</span>
                  <span className="font-mono font-bold flex-1">{contactPopover.phone}</span>
                </a>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1.5">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">📞</span>
                  전화번호 미등록
                </div>
              )}
              {contactPopover.email ? (
                <a href={`mailto:${contactPopover.email}`} className="flex items-center gap-2 text-[12px] text-slate-700 hover:text-indigo-700 hover:bg-slate-50 rounded-lg px-2 py-1.5 cursor-pointer transition">
                  <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">✉️</span>
                  <span className="font-semibold truncate flex-1">{contactPopover.email}</span>
                </a>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-slate-300 px-2 py-1.5">
                  <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">✉️</span>
                  이메일 미등록
                </div>
              )}
            </div>
            <button
              onClick={() => setContactPopover(null)}
              className="mt-2 w-full text-[10px] font-bold text-slate-400 hover:text-slate-700 py-1 border-t border-slate-100 cursor-pointer"
            >닫기</button>
          </div>
        </>
      )}

      {/* 2026-07-30 · 사용자 요청 · 공급사 정보 모달 (발주요청/발주필요 리스트 공급사 클릭 시) */}
      {supplierInfoModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierInfoModal(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <VendorDetailModal
              vendor={supplierInfoModal}
              onClose={() => setSupplierInfoModal(null)}
              onSaved={() => setSupplierInfoModal(null)}
            />
          </div>
        </div>
      )}

      {/* T-COMMON-InventoryEditModal · 발주요청 실재고 입력·편집 */}
      {inventoryEditModal && (
        <InventoryEditModal
          open={true}
          productCode={inventoryEditModal.code}
          productName={inventoryEditModal.name}
          initialValues={inventoryEditModal.initialValues}
          onSaved={() => { loadInvMap(); }}
          onClose={() => setInventoryEditModal(null)}
        />
      )}

      {/* 입고내역 상세 모달 · 2026-08-03 · ProductArrivalPage 내부 탭으로 이동 */}

    </main>
  );
};

export default OrderManagePage;

