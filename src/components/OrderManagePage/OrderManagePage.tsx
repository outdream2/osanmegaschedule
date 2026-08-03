// src/components/OrderManagePage/OrderManagePage.tsx
// 발주관리 페이지 — 매장관리 · 재고관리 · 입고알림관리 옆의 서브탭으로 노출
// 기존 요청목록의 '발주요청' 탭 컨텐츠를 독립 페이지로 분리
// 사입(OCR거래명세서 등록) 탭에서는 거래명세서 OCR(OcrPage) 노출
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVendors } from "../../hooks/useVendors";
import { Loader2, Package, ShoppingCart, RefreshCw, Trash2, CheckSquare, Square, Send, Mail, MessageSquare, PackageCheck, AlertTriangle, Building2, ClipboardList, CheckCircle2, ChevronRight, ChevronDown, TrendingUp, ScanLine, PackagePlus } from "lucide-react";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
import { OcrPage } from "../OcrPage";
// 2026-08-03 · 매입 서브탭 임베드용 · ScanPage · ProductArrivalPage
import { ScanPage } from "../ScanPage";
import { ProductArrivalPage } from "../ProductArrivalPage";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../AppNavHeader";
// VendorListEditor · VendorDetailModal · Vendor — split 패널 구성 (static import · panel 모드 지원)
import { VendorListEditor, VendorDetailModal } from "../LandingPage/VendorListEditor";
import type { Vendor } from "../LandingPage/VendorListEditor";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { StockReconciliationTab } from "../StockManagePage/StockReconciliationTab";
import { TrendingTab } from "../StockManagePage/StockManagePage";
import { FlowTab } from "../StockManagePage/FlowTab";
import { DiffTab } from "../StockManagePage/DiffTab";
import { SupplierTab } from "../StockManagePage/SupplierTab";
import { LowStockPanel } from "../StockManagePage/LowStockPanel";
import { ReturnListPanel } from "./ReturnListPanel";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
import { PaymentInfoTab } from "./PaymentInfoTab";
import { CategoryTab } from "../SalesTrendPage/SalesTrendPage";
import { BarChart2, PieChart, ArrowLeftRight, Boxes } from "lucide-react";

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

const OrderManagePage: React.FC<OrderManagePageProps> = ({
  ocrTabAuthSession,
  ocrTabOnBack,
  ocrTabOnNavigate,
  ocrTabOnLogout,
  initialTopTab,
  hideTopTabs = false,
}) => {
  // Level-1 탭 (발주 / 매입 / 결제 / 통계) — 2026-08-03 재구성
  // initialTopTab 이 있으면 해당 탭으로 초기화 · props 변경 시 useEffect 로 감지 (재mount 없이)
  const [topTab, setTopTab] = useState<"purchase-order" | "purchase" | "payment" | "statistics">(initialTopTab ?? "purchase-order");
  // 2026-08-03 · props 변경 시 topTab state 동기화 · DisplayPage 서브탭 전환 · 재mount 대신 state 업데이트 · 각 컴포넌트 mount 유지 · 재fetch 없음
  useEffect(() => {
    if (initialTopTab && initialTopTab !== topTab) setTopTab(initialTopTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopTab]);
  // Level-2 서브탭 상태
  const [purchaseOrderSubTab, setPurchaseOrderSubTab] = useState<"order" | "need" | "low">("need");
  const [purchaseSubTab, setPurchaseSubTab] = useState<"receipt" | "reconciliation" | "arrival_history" | "scan" | "productarrival" | "return" | "purchase-history">("receipt");
  const [paymentSubTab, setPaymentSubTab] = useState<"vendor" | "payment" | "payment-info">("vendor");
  const [statSubTab, setStatSubTab] = useState<"trending" | "category" | "flow" | "diff">("trending");

  // 2026-07-30 · 사용자 요청 · 입고내역 탭 · product_arrivals 이력 조회
  interface ArrivalHistoryRow {
    id: number;
    arrival_date: string;
    checked_by: string | null;
    total_items: number;
    total_qty: number;
    match_count: number;
    mismatch_count: number;
    expiring_count: number;
    final_decision: string | null;
    supplier_summary: string | null;
    note: string | null;
  }
  interface ArrivalHistoryDetail extends ArrivalHistoryRow {
    items: Array<{ id: number; product_code: string | null; product_name: string | null; supplier: string | null; qty: number; status: string }>;
  }
  const [arrivals, setArrivals] = useState<ArrivalHistoryRow[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(false);
  const [arrivalDays, setArrivalDays] = useState<7 | 30 | 90>(30);
  const [selectedArrivalId, setSelectedArrivalId] = useState<number | null>(null);
  const [arrivalDetail, setArrivalDetail] = useState<ArrivalHistoryDetail | null>(null);
  const [arrivalDetailLoading, setArrivalDetailLoading] = useState(false);
  const loadArrivals = useCallback(async () => {
    setArrivalsLoading(true);
    try {
      const res = await fetch(`/api/product-arrivals?limit=100&days=${arrivalDays}`);
      if (res.ok) {
        const j = await res.json();
        setArrivals(Array.isArray(j?.rows) ? j.rows : []);
      } else {
        setArrivals([]);
      }
    } catch {
      setArrivals([]);
    } finally {
      setArrivalsLoading(false);
    }
  }, [arrivalDays]);
  useEffect(() => { if (topTab === "purchase" && purchaseSubTab === "arrival_history") loadArrivals(); }, [topTab, purchaseSubTab, loadArrivals]);
  useEffect(() => {
    if (selectedArrivalId == null) { setArrivalDetail(null); return; }
    setArrivalDetailLoading(true);
    fetch(`/api/product-arrivals/${selectedArrivalId}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => setArrivalDetail(j ?? null))
      .catch(() => setArrivalDetail(null))
      .finally(() => setArrivalDetailLoading(false));
  }, [selectedArrivalId]);
  const deleteArrival = async (id: number) => {
    if (!window.confirm("이 입고내역을 삭제하시겠습니까? (관련 아이템 모두 삭제)")) return;
    try {
      const res = await fetch(`/api/product-arrivals/${id}`, { method: "DELETE" });
      if (res.ok) {
        setArrivals(prev => prev.filter(a => a.id !== id));
        if (selectedArrivalId === id) setSelectedArrivalId(null);
      } else {
        alert(`삭제 실패 (${res.status})`);
      }
    } catch (e: any) {
      alert(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  };

  // 공급사관리 서브 pill (재고관리 스타일 · 대시보드/원본데이터)
  // (removed 2026-07-16) vendorPageTab — VendorListEditor 를 한 줄 리스트 + 모달 방식으로 통일
  // 원본데이터 → 대시보드 전환 시 자동 선택될 공급사 id
  const [vendorPreselectId, setVendorPreselectId] = useState<number | null>(null);

  // ── 공급사관리(vendor) 탭 · 좌우 분할 레이아웃 state ──
  const [vendorPanelWidth, setVendorPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_order_vendor_w")); return Number.isFinite(v) && v > 0 ? v : 640; } catch { return 640; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_order_vendor_w", String(vendorPanelWidth)); } catch {} }, [vendorPanelWidth]);
  const vendorPanelWidthRef = useRef(vendorPanelWidth);
  useEffect(() => { vendorPanelWidthRef.current = vendorPanelWidth; }, [vendorPanelWidth]);
  const vendorResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onVendorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    vendorResizeRef.current = { startX: e.clientX, startW: vendorPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = vendorResizeRef.current; if (!r) return; setVendorPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { vendorResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  // 우측 패널용 선택된 공급사 (vendor 탭)
  const [vendorSelected, setVendorSelected] = useState<Vendor | null>(null);
  const [vendorReloadKey, setVendorReloadKey] = useState(0);
  // 2026-07-30 · 사용자 요청 · 발주요청/발주필요 리스트에서 공급사 클릭 시 모달로 공급사 정보 조회/수정
  const [supplierInfoModal, setSupplierInfoModal] = useState<Vendor | null>(null);
  // ── 그룹 헤더 클릭 접기 · 발주필요 탭 (needCollapsed) ──
  const [needCollapsed, setNeedCollapsed] = useState<Set<string>>(new Set());
  const toggleNeedGroup = (g: string) => setNeedCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isNeedCollapsed = (g: string) => needCollapsed.has(g);
  // ── 그룹 헤더 클릭 접기 · 발주요청 탭 (orderCollapsed) ──
  const [orderGroupCollapsed, setOrderGroupCollapsed] = useState<Set<string>>(new Set());
  const toggleOrderGroup = (g: string) => setOrderGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isOrderGroupCollapsed = (g: string) => orderGroupCollapsed.has(g);
  // 2026-07-30 · 사용자 요청 · 공급사 관리 페이지와 동일 방식으로 공급사 정보 조회
  //   findVendor (로컬 캐시) 우선 · 실패 시 API 재조회 (이름 부분 매칭 fallback)
  // findVendor 는 아래에서 정의 (line 481) · closure 캡처 OK
  const openSupplierInfo = async (supplierName: string | null | undefined) => {
    if (!supplierName) return;
    const name = String(supplierName).trim();
    if (!name) return;
    // 1차 · 로컬 vendors 배열에서 전체 Vendor 객체 탐색 (findVendor 는 contact 전용 partial 반환 · 사용 불가)
    const cachedVendor = vendors.find(v =>
      v.company_name.trim() === name ||
      v.company_name.replace(/\s+/g, "") === name.replace(/\s+/g, "") ||
      v.company_name.trim().toLowerCase() === name.toLowerCase()
    );
    if (cachedVendor) {
      // vendors 배열 타입이 Vendor 부분집합 · Vendor 전체 필드가 있는 객체로 캐스팅
      setSupplierInfoModal(cachedVendor as Vendor);
      return;
    }
    // 2차 · API 조회 · 정확 매칭 후 부분 매칭 fallback
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (res.ok) {
        const list: Vendor[] = await res.json();
        const exact = list.find(v => v.company_name?.trim() === name);
        if (exact) { setSupplierInfoModal(exact); return; }
        // 괄호 안 부가정보 벗기고 재시도 (예: "(주)대웅제약 (vat미포함)")
        const stripped = name.replace(/\s*\(.*?\)\s*/g, "").trim();
        const strippedMatch = stripped ? list.find(v => v.company_name?.trim() === stripped || v.company_name?.trim().includes(stripped)) : undefined;
        if (strippedMatch) { setSupplierInfoModal(strippedMatch); return; }
        // 부분 매칭 (양방향 includes)
        const partial = list.find(v => {
          const vn = v.company_name?.trim() ?? "";
          return vn && (vn.includes(name) || name.includes(vn));
        });
        if (partial) { setSupplierInfoModal(partial); return; }
      }
    } catch { /* silent */ }
    alert(`공급사 정보 없음: ${supplierName}`);
  };
  // 공급사 클릭 → API 로 전체 목록 fetch 후 해당 id 의 vendor 우측 패널 표시
  const handleVendorEditRequest = useCallback(async (vendorId: number) => {
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (res.ok) {
        const list: Vendor[] = await res.json();
        const found = list.find(v => v.id === vendorId);
        if (found) setVendorSelected(found);
      }
    } catch { /* silent */ }
  }, []);

  // 사입(OCR거래명세서 등록) 상태
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptFilter, setReceiptFilter] = useState<"all" | "pending" | "partial" | "complete">("all");

  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  const [orderSearch, setOrderSearch] = useState("");

  // ── 발주필요(need) 탭 정렬 ──
  type NeedSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short";
  const [needSortKey, setNeedSortKey] = useState<NeedSortKey>("short");
  const [needSortDir, setNeedSortDir] = useState<"asc" | "desc">("desc");
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
  // 공급사 마스터 · 공용 훅 (모듈 레벨 캐시 · 5분 TTL · vendors-changed 이벤트 구독)
  const { vendors, vendorCategoryMap } = useVendors();

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
  const [orderPanelWidth, setOrderPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_ordermanage_order_w")); return Number.isFinite(v) && v > 0 ? v : 640; } catch { return 640; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_ordermanage_order_w", String(orderPanelWidth)); } catch { /**/ } }, [orderPanelWidth]);
  const orderPanelWidthRef = useRef(orderPanelWidth);
  useEffect(() => { orderPanelWidthRef.current = orderPanelWidth; }, [orderPanelWidth]);
  const orderResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onOrderResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    orderResizeRef.current = { startX: e.clientX, startW: orderPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = orderResizeRef.current; if (!r) return; setOrderPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { orderResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
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
  const [needPanelWidth, setNeedPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_ordermanage_need_w")); return Number.isFinite(v) && v > 0 ? v : 600; } catch { return 600; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_ordermanage_need_w", String(needPanelWidth)); } catch { /**/ } }, [needPanelWidth]);
  const needPanelWidthRef = useRef(needPanelWidth);
  useEffect(() => { needPanelWidthRef.current = needPanelWidth; }, [needPanelWidth]);
  const needResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onNeedResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    needResizeRef.current = { startX: e.clientX, startW: needPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = needResizeRef.current; if (!r) return; setNeedPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { needResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
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
      if (res.ok) setOrderReqs(await res.json());
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
  // 전체 inventory_checks (창고·매장 재고) 매핑 — 자동 재조회 지원
  const [invMap, setInvMap] = useState<Record<string, { warehouse: number | null; store: number | null }>>({});
  const loadInvMap = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory-checks");
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list)) return;
      const m: Record<string, { warehouse: number | null; store: number | null }> = {};
      for (const r of list) {
        const code = String((r as any).product_code ?? "").trim();
        if (!code || m[code]) continue;
        m[code] = {
          warehouse: (r as any).warehouse_stock != null ? Number((r as any).warehouse_stock) : null,
          store:     (r as any).store_stock     != null ? Number((r as any).store_stock)     : null,
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

  // 사입(OCR거래명세서 등록) 목록 로드 (order_dispatches → goods_receipts 통합 조회)
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
    const proceed = window.confirm(
      receivedQtyMap
        ? `${receipt.supplier} · #${receipt.order_number} 입고 확정할까요?\n(부분입고: 수량 조정됨)`
        : `${receipt.supplier} · #${receipt.order_number} 완전 입고 확정할까요?`
    );
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

  // 실재고 (창고 + 매장) 맵 — 1) inventory_checks 전체 · 2) low-stock 응답 fallback
  const invStockMap = new Map<string, { warehouse: number | null; store: number | null; total: number }>();
  for (const [code, iv] of Object.entries(invMap)) {
    const wh = (iv as { warehouse: number | null; store: number | null }).warehouse;
    const st = (iv as { warehouse: number | null; store: number | null }).store;
    if (wh != null || st != null) {
      const total = (Number(wh) || 0) + (Number(st) || 0);
      invStockMap.set(code, { warehouse: wh, store: st, total });
    }
  }
  // low-stock에서 병합 (invMap에 없는 경우 fallback)
  for (const p of products) {
    const code = getCode(p);
    if (!code || invStockMap.has(code)) continue;
    const wh = (p as any).warehouse_stock;
    const st = (p as any).store_stock;
    if (wh != null || st != null) {
      const total = (Number(wh) || 0) + (Number(st) || 0);
      invStockMap.set(code, { warehouse: wh, store: st, total });
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
  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock != null ? Number(p.optimal_stock) : NaN;
    return !isNaN(cur) && !isNaN(opt) && opt > 0 && cur < opt;
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
  const [bulkChannels, setBulkChannels] = useState<{ email: boolean; sms: boolean }>({ email: true, sms: false });

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
    memo?: string;
  }
  interface OrderModalSupplier {
    supplier: string;
    order_number: string;  // 공급사별 고유 발주번호 (각각 별도 발주서)
    supplier_contact?: string | null;
    supplier_email?: string | null;
    supplier_phone?: string | null;
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
    channels: { email: boolean; sms: boolean };
    suppliers: OrderModalSupplier[];
  }>(null);

  // 발주 모달 열기
  const openOrderModal = (rows: OrderRequest[]) => {
    if (rows.length === 0) return;
    // 공급사별 그룹핑 (각 공급사마다 고유 발주번호)
    const today = new Date();
    const ymdNow = today.toISOString().slice(0, 10);
    const genOrderNumber = () => `PO-${ymdNow.replace(/-/g, "")}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const bySupplier = new Map<string, OrderModalSupplier>();
    for (const r of rows) {
      const sup = r.supplier || "(공급사 미지정)";
      if (!bySupplier.has(sup)) {
        bySupplier.set(sup, {
          supplier: sup,
          order_number: genOrderNumber(),
          supplier_contact: r.supplier_contact ?? null,
          supplier_email: r.supplier_email ?? null,
          supplier_phone: r.supplier_phone ?? null,
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
    if (!orderModal.channels.email && !orderModal.channels.sms) { alert("이메일 또는 문자 중 하나 이상 선택해주세요."); return; }
    const totalItems = orderModal.suppliers.reduce((n, s) => n + s.items.length, 0);
    const proceed = window.confirm(
      `${orderModal.suppliers.length}개 공급사 · ${totalItems}개 상품에 발주서 ${orderModal.suppliers.length}건을 각각 발송합니다.\n\n계속하시겠습니까?`
    );
    if (!proceed) return;
    setSendingBulk(true);
    try {
      // 공급사별로 별도 발주서 (각각 고유 order_number) — 병렬 발송
      const submissions = orderModal.suppliers.map(async (s) => {
        const res = await fetch("/api/order-requests/bulk-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_number: s.order_number,     // ⭐ 공급사별 고유 발주번호
            order_date: orderModal.orderDate,
            desired_arrival: orderModal.desiredArrival,
            memo: orderModal.memo,
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
        return { supplier: s.supplier, order_number: s.order_number, ok: res.ok };
      });
      const results = await Promise.all(submissions);
      const succeeded = results.filter(r => r.ok).length;
      const failed = results.filter(r => !r.ok);
      const summaryLines = [
        `✅ 성공: ${succeeded}건 / 실패: ${failed.length}건`,
        ...results.filter(r => r.ok).map(r => `  · ${r.supplier} → #${r.order_number}`),
        ...(failed.length > 0 ? [`\n❌ 실패 공급사:`, ...failed.map(r => `  · ${r.supplier} (#${r.order_number})`)] : []),
      ].join("\n");
      alert(`발주서 ${orderModal.suppliers.length}건 발송 완료\n\n${summaryLines}`);
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

  // 검색 필터링
  const orderReqsFiltered = orderReqs.filter(r => {
    if (!orderSearch.trim()) return true;
    const q = orderSearch.trim().toLowerCase();
    return (r.product_name?.toLowerCase().includes(q) ||
            r.product_code?.toLowerCase().includes(q) ||
            r.supplier?.toLowerCase().includes(q));
  });
  const lowStockFiltered = lowStock.filter(p => {
    if (!lowStockSearch.trim()) return true;
    const q = lowStockSearch.trim().toLowerCase();
    return (getName(p).toLowerCase().includes(q) ||
            getCode(p).toLowerCase().includes(q) ||
            (p.supplier ?? "").toLowerCase().includes(q));
  });

  // ── 서브탭 렌더 헬퍼 ──
  const renderSubTabs = <K extends string>(
    tabs: { k: K; label: string; icon: React.ElementType; color: string; badge?: number }[],
    activeTab: K,
    setTab: (k: K) => void,
  ) => (
    <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-0.5 border-b border-slate-200 sm:overflow-x-auto sm:scrollbar-none bg-slate-50/50 px-2 pt-1">
      {tabs.map(t => {
        const Icon = t.icon;
        const active = activeTab === t.k;
        const colorMap: Record<string, { text: string; bar: string; badge: string }> = {
          sky:    { text: "text-sky-700",    bar: "bg-sky-500",    badge: "bg-sky-100 text-sky-700" },
          amber:  { text: "text-amber-700",  bar: "bg-amber-500",  badge: "bg-amber-100 text-amber-700" },
          violet: { text: "text-violet-700", bar: "bg-violet-500", badge: "bg-violet-100 text-violet-700" },
          teal:   { text: "text-teal-700",   bar: "bg-teal-500",   badge: "bg-teal-100 text-teal-700" },
          indigo: { text: "text-indigo-700", bar: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-700" },
          rose:   { text: "text-rose-700",   bar: "bg-rose-500",   badge: "bg-rose-100 text-rose-700" },
          emerald:{ text: "text-emerald-700",bar: "bg-emerald-500",badge: "bg-emerald-100 text-emerald-700" },
        };
        const c = colorMap[t.color] ?? colorMap["sky"];
        return (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`relative basis-1/2 sm:basis-auto flex-grow-0 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-[14px] sm:text-[16px] font-bold leading-tight transition-colors duration-150 rounded-t-md ${
              active ? `${c.text} bg-white shadow-sm` : "text-slate-400 hover:text-slate-600 hover:bg-white/60"
            }`}>
            <Icon size={15} strokeWidth={active ? 2.4 : 1.8} className="hidden sm:inline-block shrink-0" />
            <span>{t.label}</span>
            {t.badge != null && t.badge > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[16px] px-1 h-[18px] rounded-full text-[10px] font-black ${active ? c.badge : "bg-slate-100 text-slate-500"}`}>
                {t.badge}
              </span>
            )}
            {active && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${c.bar} rounded-t-sm`} />}
          </button>
        );
      })}
    </div>
  );

  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 py-4 flex flex-col gap-4">
      {/* ── Level-1 탭 (발주 / 매입 / 결제 / 통계) — 2026-08-03 재구성 ── */}
      {/* hideTopTabs=true 이면 DisplayPage 서브탭 모드 · Level-1 탭 UI 숨김 */}
      {!hideTopTabs && <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-1 border-b border-slate-200 sm:overflow-x-auto sm:scrollbar-none">
        {([
          { k: "purchase-order" as const, label: "발주", icon: ShoppingCart, color: "sky" },
          { k: "purchase"       as const, label: "매입", icon: PackageCheck,  color: "violet" },
          { k: "payment"        as const, label: "결제", icon: BarChart2,     color: "teal" },
          { k: "statistics"     as const, label: "통계", icon: PieChart,      color: "indigo" },
        ] as { k: typeof topTab; label: string; icon: React.ElementType; color: string }[]).map(t => {
          const Icon = t.icon;
          const active = topTab === t.k;
          const textMap: Record<string, string> = { sky: "text-sky-700", violet: "text-violet-700", teal: "text-teal-700", indigo: "text-indigo-700" };
          const barMap:  Record<string, string> = { sky: "bg-sky-500",   violet: "bg-violet-500",   teal: "bg-teal-500",   indigo: "bg-indigo-500" };
          return (
            <button key={t.k} onClick={() => setTopTab(t.k)}
              className={`relative basis-1/4 sm:basis-auto flex-grow-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-3 sm:px-5 py-2.5 text-[14px] sm:text-[16px] font-bold leading-tight transition-colors duration-150 ${
                active ? textMap[t.color] : "text-slate-400 hover:text-slate-700"
              }`}>
              <Icon size={14} strokeWidth={active ? 2.4 : 1.8} className="hidden sm:inline-block shrink-0" />
              <span>{t.label}</span>
              {active && <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${barMap[t.color]} rounded-t-sm`} />}
            </button>
          );
        })}
      </div>}

      {/* ══ 발주 탭 (purchase-order) ══ */}
      {topTab === "purchase-order" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs([
            { k: "need"  as const, label: "발주필요",     icon: ClipboardList, color: "amber", badge: lowStock.length },
            { k: "order" as const, label: "발주요청",     icon: ShoppingCart,  color: "sky" },
            { k: "low"   as const, label: "적정재고이하", icon: AlertTriangle, color: "rose" },
          ], purchaseOrderSubTab, setPurchaseOrderSubTab)}
          {/* ── 발주필요 서브탭 ── */}
          {purchaseOrderSubTab === "need" && (
        <div className="flex flex-col gap-2">
          {/* ── 상단 필터바 ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-amber-500 shrink-0" />
              <span className="text-[13px] font-semibold text-slate-800">발주 필요 상품</span>
              <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 border border-amber-200 tabular-nums">{lowStock.length}개</span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">(현재고 &lt; 추천적정재고)</span>
            </div>
            <input
              type="text"
              value={lowStockSearch}
              onChange={e => setLowStockSearch(e.target.value)}
              placeholder="상품·코드·공급사"
              className="text-[11px] border border-slate-200 rounded-md pl-3 pr-3 h-7 w-40 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 transition"
            />
            <button
              onClick={loadProducts}
              disabled={productsLoading}
              className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-amber-50 hover:border-amber-300 text-slate-400 hover:text-amber-500 transition disabled:opacity-40 cursor-pointer"
              title="새로고침"
            >
              <RefreshCw size={13} className={productsLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* ── 하단 split ── */}
          <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
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
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-1 h-3.5 rounded-full bg-amber-400 shrink-0"></span>
            <span className="text-[11px] font-semibold text-slate-500">발주필요 리스트</span>
            <span className="text-[11px] text-slate-400 font-normal">{lowStockFiltered.length}건</span>
          </div>
          <div className={`max-h-[50vh] overflow-auto relative ${productsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            <table className="w-full text-xs sm:min-w-[540px]">
              <thead className="sticky top-0 bg-white z-10">
                {/* 그룹 카테고리 헤더 · 클릭으로 접기/펼치기 */}
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                  <th colSpan={isNeedCollapsed("info") ? 1 : 3}
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
                      <th onClick={() => handleNeedSort("supplier")} title="공급사 정렬" className="text-left px-0.5 py-1.5 w-24 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">공급사{needArrow("supplier")}</th>
                      <th onClick={() => handleNeedSort("contact")} title="담당자 정렬" className="text-left px-0.5 py-1.5 w-20 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">담당자{needArrow("contact")}</th>
                      <th onClick={() => handleNeedSort("name")} title="상품명 정렬" className="text-left px-0.5 py-1.5 min-w-[120px] cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">상품명{needArrow("name")}</th>
                    </>
                  )}
                  {isNeedCollapsed("stock") ? (
                    <th className="bg-amber-50/20 w-4"></th>
                  ) : (
                    <>
                      <th onClick={() => handleNeedSort("current")} title="ERP재고 정렬" className="text-right px-0.5 py-1.5 w-14 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none"><div className="leading-tight">ERP<br/>재고{needArrow("current")}<br/><span className="text-[10px] text-slate-400 font-normal">(현재고)</span></div></th>
                      <th onClick={() => handleNeedSort("inv")} title="실재고 정렬" className="text-right px-0.5 py-1.5 w-16 bg-violet-50/40 text-violet-500 cursor-pointer hover:bg-violet-100 select-none">실재고{needArrow("inv")}</th>
                      <th onClick={() => handleNeedSort("optimal")} title="추천적정재고 정렬" className="text-right px-0.5 py-1.5 w-12 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none">추천적정{needArrow("optimal")}</th>
                      <th onClick={() => handleNeedSort("short")} title="부족량 정렬" className="text-right px-0.5 py-1.5 w-12 bg-rose-50/40 text-rose-500 cursor-pointer hover:bg-rose-100 select-none">부족{needArrow("short")}</th>
                    </>
                  )}
                  <th className="text-center px-0.5 py-1.5 w-20 cursor-default bg-emerald-50/30 text-emerald-600">발주</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...lowStockFiltered].sort((a, b) => {
                  const dir = needSortDir === "asc" ? 1 : -1;
                  const aCode = getCode(a), bCode = getCode(b);
                  const aInv = invStockMap.get(aCode); const bInv = invStockMap.get(bCode);
                  const aVendor = a.supplier ? findVendor(a.supplier) : undefined;
                  const bVendor = b.supplier ? findVendor(b.supplier) : undefined;
                  const aContact = aVendor?.contact_name || (a as any).supplier_contact || "";
                  const bContact = bVendor?.contact_name || (b as any).supplier_contact || "";
                  switch (needSortKey) {
                    case "supplier": return dir * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
                    case "contact":  return dir * aContact.localeCompare(bContact, "ko");
                    case "name":     return dir * getName(a).localeCompare(getName(b), "ko");
                    case "current":  return dir * (Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0));
                    case "inv":      return dir * ((aInv?.total ?? -1) - (bInv?.total ?? -1));
                    case "optimal":  return dir * (Number(a.optimal_stock ?? 0) - Number(b.optimal_stock ?? 0));
                    case "short":    return dir * ((Number(a.optimal_stock ?? 0) - Number(a.current_stock ?? 0)) - (Number(b.optimal_stock ?? 0) - Number(b.current_stock ?? 0)));
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
                  return (
                    <tr key={code} className="hover:bg-orange-50/30 transition">
                      {/* 상품정보 그룹 */}
                      {isNeedCollapsed("info") ? (
                        <td className="bg-sky-50/10 w-4"></td>
                      ) : (
                        <>
                          <td className="px-0.5 py-1.5 text-[12px] font-semibold break-words whitespace-normal align-top">
                            {p.supplier ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                <VendorCategoryBadge category={vendorCategoryMap[String(p.supplier).trim()] ?? null} />
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); openSupplierInfo(p.supplier); }}
                                  className="text-sky-600 hover:text-sky-800 hover:underline cursor-pointer text-left"
                                  title="공급사 정보 조회·수정">{p.supplier}</button>
                              </div>
                            ) : "-"}
                          </td>
                          <td className="px-0.5 py-1.5 text-[12px] text-slate-600 break-words whitespace-normal align-top">
                            {vendor ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                                  setContactPopover({ anchor: rect, name: contactName, phone: vendor.phone, email: vendor.email });
                                }}
                                className="hover:text-indigo-700 hover:underline cursor-pointer text-left w-full"
                                title="클릭 시 전화·이메일 표시"
                              >{contactName}</button>
                            ) : (
                              <span>{contactName}</span>
                            )}
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
                      {/* 재고현황 그룹 */}
                      {isNeedCollapsed("stock") ? (
                        <td className="bg-amber-50/10 w-4"></td>
                      ) : (
                        <>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] text-slate-700 bg-slate-50/40 align-top">{cur}</td>
                          <td
                            className={`text-right px-0.5 py-1.5 tabular-nums font-black text-[12px] bg-violet-50/40 align-top ${inv ? "text-violet-700" : "text-slate-300"}`}
                            title={inv ? `창고 ${inv.warehouse ?? "-"} + 매장 ${inv.store ?? "-"} = ${inv.total}` : "실재고 미입력"}
                          >
                            {inv ? inv.total : "—"}
                            {inv && (
                              <span className="block text-[10px] font-normal text-slate-400 leading-none mt-0.5">
                                창{inv.warehouse ?? "-"}·매{inv.store ?? "-"}
                              </span>
                            )}
                          </td>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] text-slate-700 bg-slate-50/40 align-top">{opt}</td>
                          <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-top">
                            <span className="tabular-nums font-black text-[12px] text-rose-600">-{opt - cur}</span>
                          </td>
                        </>
                      )}
                      <td className="text-center px-1 py-1.5 align-top">
                        {alreadyRequested ? (
                          <button
                            onClick={() => handleRequestOrder(p)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 size={11} strokeWidth={2} /> 요청됨
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRequestOrder(p)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] font-semibold text-white bg-amber-500 hover:bg-amber-600 border border-amber-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                          >
                            <ShoppingCart size={11} strokeWidth={2} />{busy ? "..." : "추가"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lowStockFiltered.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-[11px] text-slate-300 py-6">검색 결과 없음</td></tr>
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
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Loader2 size={32} className="animate-spin mb-3 opacity-50" />
              <div className="text-sm font-bold">불러오는 중...</div>
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
          )}
        </div>
      )}

      {/* ══ 매입 탭 (purchase) ══ */}
      {topTab === "purchase" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs([
            { k: "purchase-history" as const, label: "매입이력",    icon: Building2,       color: "sky" },
            { k: "return"           as const, label: "반품필요",    icon: ArrowLeftRight,  color: "rose" },
            { k: "receipt"          as const, label: "거래명세서",  icon: PackageCheck,    color: "violet" },
            { k: "scan"             as const, label: "실재고입력",  icon: ScanLine,        color: "amber" },
            { k: "productarrival"   as const, label: "상품입고",    icon: PackagePlus,     color: "teal" },
            { k: "arrival_history"  as const, label: "입고내역",    icon: Package,         color: "indigo" },
            { k: "reconciliation"   as const, label: "실재고",      icon: CheckCircle2,    color: "emerald" },
          ], purchaseSubTab, setPurchaseSubTab)}
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
          {/* ── 입고내역 서브탭 ── */}
          {purchaseSubTab === "arrival_history" && (
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          {/* 헤더 카드 */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 h-12 flex items-center gap-2">
            <Package size={14} className="text-indigo-500 shrink-0" />
            <span className="text-[13px] font-semibold text-slate-700">입고내역</span>
            <span className="text-[11px] font-black text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 tabular-nums">{arrivals.length}건</span>
            <span className="text-[11px] font-medium text-slate-400 ml-2 hidden sm:inline">최근 {arrivalDays}일</span>
            <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-md p-0.5 ml-auto">
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setArrivalDays(d as any)}
                  className={`text-[11px] font-semibold px-2 py-1 rounded transition whitespace-nowrap cursor-pointer ${arrivalDays === d ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {d}일
                </button>
              ))}
            </div>
            <button onClick={loadArrivals} disabled={arrivalsLoading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              title="새로고침">
              <RefreshCw size={13} className={arrivalsLoading ? "animate-spin" : ""} />
            </button>
          </div>

          {/* 리스트 카드 */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {arrivalsLoading && arrivals.length === 0 ? (
              <div className="py-12 flex items-center justify-center gap-2 text-slate-400 text-[13px] font-semibold">
                <Loader2 size={16} className="animate-spin" /> 불러오는 중...
              </div>
            ) : arrivals.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-[13px] font-semibold">최근 {arrivalDays}일 입고내역 없음</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-indigo-50/50 border-b border-indigo-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 w-10">#</th>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 w-32">등록일시</th>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 w-24">담당</th>
                      <th className="px-2 py-2 text-left font-bold text-indigo-800 min-w-[200px]">공급사 요약</th>
                      <th className="px-2 py-2 text-right font-bold text-indigo-800 w-14">품목</th>
                      <th className="px-2 py-2 text-right font-bold text-indigo-800 w-14">수량</th>
                      <th className="px-2 py-2 text-center font-bold text-emerald-700 w-14">일치</th>
                      <th className="px-2 py-2 text-center font-bold text-rose-700 w-14">불일치</th>
                      <th className="px-2 py-2 text-center font-bold text-amber-700 w-14">기한임박</th>
                      <th className="px-2 py-2 text-center font-bold text-indigo-800 w-24">최종판정</th>
                      <th className="px-2 py-2 text-center font-bold text-slate-500 w-24">액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {arrivals.map((a, i) => {
                      const d = new Date(a.arrival_date);
                      const dateStr = isNaN(d.getTime()) ? "-" : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                      const isSelected = selectedArrivalId === a.id;
                      return (
                        <tr key={a.id} className={`transition ${isSelected ? "bg-indigo-50/60" : "hover:bg-slate-50/60"}`}>
                          <td className="px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                          <td className="px-2 py-1.5 text-slate-700 tabular-nums font-semibold">{dateStr}</td>
                          <td className="px-2 py-1.5 text-slate-600">{a.checked_by ?? "-"}</td>
                          <td className="px-2 py-1.5 text-slate-600 truncate max-w-[240px]" title={a.supplier_summary ?? ""}>{a.supplier_summary ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right text-slate-800 font-bold tabular-nums">{a.total_items}</td>
                          <td className="px-2 py-1.5 text-right text-slate-800 font-bold tabular-nums">{a.total_qty.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-center text-emerald-700 font-bold tabular-nums">{a.match_count}</td>
                          <td className="px-2 py-1.5 text-center text-rose-700 font-bold tabular-nums">{a.mismatch_count}</td>
                          <td className="px-2 py-1.5 text-center text-amber-700 font-bold tabular-nums">{a.expiring_count}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-black border ${
                              a.final_decision === "all_match" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                : a.final_decision === "has_mismatch" ? "bg-rose-50 text-rose-700 border-rose-300"
                                : "bg-slate-50 text-slate-500 border-slate-300"
                            }`}>
                              {a.final_decision === "all_match" ? "완전일치" : a.final_decision === "has_mismatch" ? "불일치 있음" : "-"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button type="button" onClick={() => setSelectedArrivalId(a.id)}
                                className="h-7 px-2 rounded-md text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer transition">
                                상세
                              </button>
                              <button type="button" onClick={() => deleteArrival(a.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 cursor-pointer transition"
                                title="삭제">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

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
              <ReturnListPanel />
            </div>
          )}
          {/* ── 매입이력 서브탭 ── */}
          {purchaseSubTab === "purchase-history" && (
            <div className="flex-1 min-h-0">
              <PurchaseHistoryTab />
            </div>
          )}
        </div>
      )}

      {/* ══ 결제 탭 (payment) — 공급사관리 · 결제원장 서브탭 ══ */}
      {topTab === "payment" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs([
            { k: "vendor"       as const, label: "공급사관리", icon: Building2,  color: "teal" },
            { k: "payment"      as const, label: "결제원장",   icon: BarChart2,  color: "amber" },
            { k: "payment-info" as const, label: "결제정보",   icon: ClipboardList, color: "sky" },
          ], paymentSubTab, setPaymentSubTab)}

          {/* ── 공급사관리 서브탭 ── */}
          {paymentSubTab === "vendor" && (
            <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
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
              {/* 우측: 선택 공급사 상세 · 모바일 fullscreen 모달 */}
              <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative ${vendorSelected ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}>
                {vendorSelected && (
                  <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => setVendorSelected(null)}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0" title="닫기">
                        <span className="text-lg font-black">×</span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-black text-slate-800 truncate leading-tight">{vendorSelected.company_name}</div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">공급사 상세 · 편집</div>
                      </div>
                    </div>
                  </div>
                )}
                {!vendorSelected ? (
                  <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
                    <Building2 size={40} className="mb-3 opacity-30" />
                    <div className="text-sm font-bold">리스트에서 공급사를 클릭하세요</div>
                    <div className="text-[11px] mt-1">상세 정보 · 편집 · 매입이력이 표시됩니다</div>
                  </div>
                ) : (
                  <VendorDetailModal
                    vendor={vendorSelected}
                    panel
                    onClose={() => setVendorSelected(null)}
                    onSaved={() => {
                      setVendorReloadKey(k => k + 1);
                      handleVendorEditRequest(vendorSelected.id);
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── 결제원장 서브탭 (공급사 결제·잔고 원장) ── */}
          {paymentSubTab === "payment" && (
            <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
              {/* 좌측: 공급사 리스트 */}
              <div
                className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? vendorPanelWidth : undefined }}
              >
                <VendorListEditor
                  key={`payment-${vendorReloadKey}`}
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
              {/* 우측: 선택 공급사 결제·잔고 모달 (panel 모드) */}
              <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative ${vendorSelected ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}>
                {vendorSelected && (
                  <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => setVendorSelected(null)}
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0" title="닫기">
                        <span className="text-lg font-black">×</span>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-black text-slate-800 truncate leading-tight">{vendorSelected.company_name}</div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">결제 · 잔고 원장</div>
                      </div>
                    </div>
                  </div>
                )}
                {!vendorSelected ? (
                  <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
                    <Building2 size={40} className="mb-3 opacity-30" />
                    <div className="text-sm font-bold">리스트에서 공급사를 클릭하세요</div>
                    <div className="text-[11px] mt-1">결제 원장 · 잔고가 표시됩니다</div>
                  </div>
                ) : (
                  <VendorDetailModal
                    vendor={vendorSelected}
                    panel
                    onClose={() => setVendorSelected(null)}
                    onSaved={() => {
                      setVendorReloadKey(k => k + 1);
                      handleVendorEditRequest(vendorSelected.id);
                    }}
                  />
                )}
              </div>
            </div>
          )}
          {/* ── 결제정보 서브탭 ── */}
          {paymentSubTab === "payment-info" && (
            <div className="flex-1 min-h-0">
              <PaymentInfoTab />
            </div>
          )}
        </div>
      )}

      {/* ══ 통계 탭 (statistics) ══ */}
      {topTab === "statistics" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs([
            { k: "trending"  as const, label: "급상승",       icon: TrendingUp,    color: "indigo" },
            { k: "category"  as const, label: "카테고리별현황", icon: PieChart,      color: "amber" },
            { k: "flow"      as const, label: "상품현황",      icon: Boxes,         color: "sky" },
            { k: "diff"      as const, label: "손실추적",      icon: AlertTriangle, color: "rose" },
          ], statSubTab, setStatSubTab)}
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
          {/* ── 상단 필터바 ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* 제목 + 카운트 + 선택 */}
            <div className="flex items-center gap-2">
              <ShoppingCart size={14} className="text-rose-500 shrink-0" />
              <span className="text-[13px] font-semibold text-slate-800">발주 요청 목록</span>
              <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 rounded-full px-2 py-0.5 border border-rose-200 tabular-nums">{orderReqs.length}건</span>
              {selectedOrder.size > 0 && (
                <span className="text-[11px] font-semibold bg-rose-500 text-white rounded-full px-2 py-0.5 tabular-nums">선택 {selectedOrder.size}</span>
              )}
            </div>
            {/* 검색 */}
            <input
              type="text"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              placeholder="상품·코드·공급사"
              className="text-[11px] border border-slate-200 rounded-md pl-3 pr-3 h-7 w-36 min-w-0 focus:outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400 transition"
            />
            {/* 발송 채널 토글 */}
            <div className="flex items-center gap-1.5">
              <label className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium cursor-pointer transition-colors select-none ${bulkChannels.email ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`}>
                <input type="checkbox" checked={bulkChannels.email} onChange={e => setBulkChannels(p => ({ ...p, email: e.target.checked }))} className="sr-only" />
                <Mail size={11} /> 이메일
              </label>
              <label className={`inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] font-medium cursor-pointer transition-colors select-none ${bulkChannels.sms ? "bg-sky-50 text-sky-700 border-sky-300" : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"}`}>
                <input type="checkbox" checked={bulkChannels.sms} onChange={e => setBulkChannels(p => ({ ...p, sms: e.target.checked }))} className="sr-only" />
                <MessageSquare size={11} /> 문자
              </label>
            </div>
            {/* 액션 버튼 */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={handleBulkOrder} disabled={sendingBulk || selectedOrder.size === 0}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold text-white bg-rose-500 hover:bg-rose-600 border border-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                title="선택한 발주요청을 공급사별로 그룹핑 후 이메일/문자 발송">
                {sendingBulk ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                일괄 발주{selectedOrder.size > 0 && ` (${selectedOrder.size})`}
              </button>
              <button onClick={toggleAll}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer shrink-0">
                {allChecked ? <CheckSquare size={12} className="text-rose-500" /> : <Square size={12} />}
                전체선택
              </button>
              <button onClick={() => selectedOrder.size > 0 && confirm(`${selectedOrder.size}건 삭제할까요?`) && deleteOrder([...selectedOrder])}
                disabled={selectedOrder.size === 0}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium text-slate-500 border border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0">
                <Trash2 size={12} />
              </button>
              <button onClick={loadOrderReqs} disabled={orderLoading}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition disabled:opacity-40 cursor-pointer"
                title="새로고침">
                <RefreshCw size={12} className={orderLoading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* ── 하단 split ── */}
          <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
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
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-1 h-3.5 rounded-full bg-rose-400 shrink-0"></span>
            <span className="text-[11px] font-semibold text-slate-500">발주요청 리스트</span>
            <span className="text-[11px] text-slate-400 font-normal">{orderReqsFiltered.length}건</span>
          </div>
          <div className={`max-h-[50vh] overflow-auto relative ${orderLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            <table className="w-full text-xs sm:min-w-[540px]">
              <thead className="sticky top-0 bg-white z-10">
                {/* 그룹 카테고리 헤더 · 클릭으로 접기/펼치기 */}
                <tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wider">
                  <th className="bg-slate-50 w-6"></th>
                  <th colSpan={isOrderGroupCollapsed("info") ? 1 : 3}
                    className="text-center py-1.5 bg-sky-50 text-sky-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-sky-100 transition"
                    onClick={() => toggleOrderGroup("info")}
                    title={isOrderGroupCollapsed("info") ? "상품 정보 펼치기" : "상품 정보 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isOrderGroupCollapsed("info") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}상품 정보
                    </span>
                  </th>
                  <th colSpan={isOrderGroupCollapsed("stock") ? 1 : 4}
                    className="text-center py-1.5 bg-amber-50 text-amber-700 border-l border-r border-slate-100 cursor-pointer select-none hover:bg-amber-100 transition"
                    onClick={() => toggleOrderGroup("stock")}
                    title={isOrderGroupCollapsed("stock") ? "재고 현황 펼치기" : "재고 현황 접기"}>
                    <span className="inline-flex items-center gap-1">
                      {isOrderGroupCollapsed("stock") ? <ChevronRight size={12} /> : <ChevronDown size={12} />}재고 현황
                    </span>
                  </th>
                  <th className="text-center py-1.5 bg-emerald-50 text-emerald-700 border-l border-slate-100">발주 액션</th>
                </tr>
                <tr className="border-b border-slate-100 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="text-center px-0.5 py-1.5 w-6"></th>
                  {isOrderGroupCollapsed("info") ? (
                    <th className="bg-sky-50/20 w-4"></th>
                  ) : (
                    <>
                      <th onClick={() => handleOrderSort("supplier")} title="공급사 정렬" className="text-left px-0.5 py-1.5 w-24 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">공급사{orderArrow("supplier")}</th>
                      <th onClick={() => handleOrderSort("contact")} title="담당자 정렬" className="text-left px-0.5 py-1.5 w-20 cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">담당자{orderArrow("contact")}</th>
                      <th onClick={() => handleOrderSort("name")} title="상품명 정렬" className="text-left px-0.5 py-1.5 min-w-[120px] cursor-pointer hover:bg-sky-50 select-none bg-sky-50/30">상품명{orderArrow("name")}</th>
                    </>
                  )}
                  {isOrderGroupCollapsed("stock") ? (
                    <th className="bg-amber-50/20 w-4"></th>
                  ) : (
                    <>
                      <th onClick={() => handleOrderSort("current")} title="ERP재고 정렬" className="text-right px-0.5 py-1.5 w-14 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none"><div className="leading-tight">ERP<br/>재고{orderArrow("current")}<br/><span className="text-[10px] text-slate-400 font-normal">(현재고)</span></div></th>
                      <th onClick={() => handleOrderSort("inv")} title="실재고 정렬" className="text-right px-0.5 py-1.5 w-16 bg-violet-50/40 text-violet-500 cursor-pointer hover:bg-violet-100 select-none">실재고{orderArrow("inv")}</th>
                      <th onClick={() => handleOrderSort("optimal")} title="추천적정재고 정렬" className="text-right px-0.5 py-1.5 w-12 bg-amber-50/40 text-slate-500 cursor-pointer hover:bg-amber-100 select-none">추천적정{orderArrow("optimal")}</th>
                      <th onClick={() => handleOrderSort("short")} title="부족량 정렬" className="text-right px-0.5 py-1.5 w-12 bg-rose-50/40 text-rose-500 cursor-pointer hover:bg-rose-100 select-none">부족{orderArrow("short")}</th>
                    </>
                  )}
                  <th className="text-center px-0.5 py-1.5 w-14 cursor-default bg-emerald-50/30 text-emerald-600">발주</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[...orderReqsFiltered].sort((a, b) => {
                  const dir = orderSortDir === "asc" ? 1 : -1;
                  const aCodeVars = [a.product_code, a.product_code.replace(/^0+/, ""), a.product_code.padStart(8, "0")];
                  const bCodeVars = [b.product_code, b.product_code.replace(/^0+/, ""), b.product_code.padStart(8, "0")];
                  const aProd = aCodeVars.map(c => allProductsMap[c]).find(Boolean);
                  const bProd = bCodeVars.map(c => allProductsMap[c]).find(Boolean);
                  const aSupplier = (aProd as any)?.supplier || a.supplier || "";
                  const bSupplier = (bProd as any)?.supplier || b.supplier || "";
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
                    case "supplier": return dir * aSupplier.localeCompare(bSupplier, "ko");
                    case "contact":  return dir * aContact.localeCompare(bContact, "ko");
                    case "name":     return dir * a.product_name.localeCompare(b.product_name, "ko");
                    case "current":  return dir * (aCur - bCur);
                    case "inv":      return dir * ((aInv?.total ?? -1) - (bInv?.total ?? -1));
                    case "optimal":  return dir * (aOpt - bOpt);
                    case "short":    return dir * ((aOpt - aCur) - (bOpt - bCur));
                    default:         return 0;
                  }
                }).map(r => {
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
                    <tr key={r.id} className={`transition ${selectedOrder.has(r.id) ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}>
                      <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleOne(r.id); }}>
                        {selectedOrder.has(r.id)
                          ? <CheckSquare size={13} className="text-rose-500 inline cursor-pointer" />
                          : <Square size={13} className="text-slate-300 hover:text-rose-500 inline cursor-pointer" />}
                      </td>
                      {/* 상품정보 그룹 */}
                      {isOrderGroupCollapsed("info") ? (
                        <td className="bg-sky-50/10 w-4"></td>
                      ) : (
                        <>
                          <td className="px-0.5 py-1.5 align-top">
                            {(() => {
                              const raw = String(supplierDisplay ?? "");
                              const m = raw.match(/^(.+?)\s*(\(.+?\))\s*$/);
                              const mainName = m ? m[1].trim() : raw;
                              const suffix = m ? m[2].trim() : "";
                              const extraFromProduct = (productData as any)?.supplier_note || (productData as any)?.tax_note || "";
                              const secondLine = suffix || extraFromProduct || "";
                              return (
                                <>
                                  {mainName ? (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <VendorCategoryBadge category={vendorCategoryMap[mainName] ?? null} />
                                      <button type="button"
                                        onClick={(e) => { e.stopPropagation(); openSupplierInfo(mainName); }}
                                        className="text-[12px] text-sky-600 hover:text-sky-800 hover:underline font-semibold break-words whitespace-normal leading-tight text-left cursor-pointer"
                                        title="공급사 정보 조회·수정">{mainName}</button>
                                    </div>
                                  ) : (
                                    <div className="text-[12px] text-slate-400 font-semibold">-</div>
                                  )}
                                  {secondLine && (
                                    <div className="text-[10px] text-slate-400 font-normal break-words whitespace-normal leading-tight mt-0.5">{secondLine}</div>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td className="px-0.5 py-1.5 text-[12px] text-slate-600 break-words whitespace-normal align-top">
                            {vendor ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = (e.target as HTMLElement).getBoundingClientRect();
                                  setContactPopover({ anchor: rect, name: contactName, phone: vendor.phone, email: vendor.email });
                                }}
                                className="hover:text-indigo-700 hover:underline cursor-pointer text-left w-full"
                                title="클릭 시 전화·이메일 표시"
                              >{contactName}</button>
                            ) : (
                              <span>{contactName}</span>
                            )}
                          </td>
                          <td className="px-0.5 py-1.5 align-top">
                            <button
                              onClick={() => setOrderPanelProduct({ code: r.product_code, name: r.product_name })}
                              className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                              title="상품 상세정보 조회"
                            >{r.product_name || "(상품명 없음)"}</button>
                          </td>
                        </>
                      )}
                      {/* 재고현황 그룹 */}
                      {isOrderGroupCollapsed("stock") ? (
                        <td className="bg-amber-50/10 w-4"></td>
                      ) : (
                        <>
                          <td
                            className={`text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] bg-slate-50/40 align-top ${stockChanged ? "text-orange-600" : "text-slate-700"}`}
                            title={stockChanged ? `요청 당시 ${r.current_stock ?? "-"} → 현재 ${displayCurrentStock ?? "-"} (변동)` : "현재 ERP 재고 (실시간)"}
                          >
                            {displayCurrentStock ?? "-"}
                            {stockChanged && <span className="block text-[10px] font-normal text-slate-400 leading-none mt-0.5">전 {r.current_stock}</span>}
                          </td>
                          <td
                            className={`text-right px-0.5 py-1.5 tabular-nums font-black text-[12px] bg-violet-50/40 align-top ${inv ? "text-violet-700" : "text-slate-300"}`}
                            title={inv ? `창고 ${inv.warehouse ?? "-"} + 매장 ${inv.store ?? "-"} = ${inv.total}` : "실재고 미입력"}
                          >
                            {inv ? inv.total : "—"}
                            {inv && (
                              <span className="block text-[10px] font-normal text-slate-400 leading-none mt-0.5">
                                창{inv.warehouse ?? "-"}·매{inv.store ?? "-"}
                              </span>
                            )}
                          </td>
                          <td className="text-right px-0.5 py-1.5 tabular-nums font-bold text-[12px] text-slate-700 bg-slate-50/40 align-top">{displayOptimal ?? "-"}</td>
                          <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-top">
                            <span className="tabular-nums font-black text-[12px] text-rose-600">{displayShort > 0 ? `-${displayShort}` : "0"}</span>
                          </td>
                        </>
                      )}
                      <td className="text-center px-1 py-1.5 align-top">
                        <button
                          onClick={() => handleSingleOrder(r)}
                          disabled={sendingBulk}
                          className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold text-white bg-rose-500 hover:bg-rose-600 border border-rose-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title="이 상품만 개별 발주"
                        >
                          <Send size={10} />발주
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Loader2 size={32} className="animate-spin mb-3 opacity-50" />
              <div className="text-sm font-bold">불러오는 중...</div>
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

      {/* ── 적정재고이하(low) 서브탭 (purchase-order > low) ── */}
      {topTab === "purchase-order" && purchaseOrderSubTab === "low" && (
        <div className="flex-1 min-h-0">
          <LowStockPanel />
        </div>
      )}

      {/* 발주서 (Purchase Order) 모달 — 표준 발주 포맷 */}
      {orderModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
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
                    {/* 공급사 정보 헤더 (각 공급사별 고유 발주번호) */}
                    <div className="px-4 py-3 bg-gradient-to-r from-sky-50 to-indigo-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-black text-sky-600 bg-white border border-sky-200 rounded-full px-2 py-0.5 shrink-0">발주서</span>
                        <span className="text-sm font-black text-slate-900 truncate">{s.supplier}</span>
                        <span className="text-[10px] font-mono text-indigo-600 bg-white border border-indigo-200 rounded px-1.5 py-0.5 shrink-0">#{s.order_number}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 flex-wrap">
                        {s.supplier_contact && <span>👤 {s.supplier_contact}</span>}
                        {s.supplier_email && <span className="flex items-center gap-1"><Mail size={10}/>{s.supplier_email}</span>}
                        {s.supplier_phone && <span className="flex items-center gap-1"><MessageSquare size={10}/>{s.supplier_phone}</span>}
                      </div>
                    </div>

                    {/* 잔고 요약 카드 (계산 잔고 vs OCR 최근 잔고) */}
                    <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(() => {
                        // 계산 잔고: 이 발주서에서 발생할 금액 합계
                        const calcAmount = s.items.reduce((n, it) => n + (it.order_qty * (it.unit_price ?? 0)), 0);
                        return (
                          <div className="bg-white rounded-lg border border-emerald-200 p-2.5">
                            <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">💡 이번 발주 예상 금액 (계산)</div>
                            <div className="text-lg font-black text-emerald-700 font-mono">{calcAmount > 0 ? calcAmount.toLocaleString() + "원" : "-"}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">단가 입력 시 자동 계산</div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const latest = s.ocr_statements?.[0];
                        return (
                          <div className="bg-white rounded-lg border border-amber-200 p-2.5">
                            <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">📄 최근 거래명세서 잔고 (OCR)</div>
                            {s.ocr_loading ? (
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 py-1"><Loader2 size={11} className="animate-spin"/>불러오는 중...</div>
                            ) : latest && latest.balance != null ? (
                              <>
                                <div className="text-lg font-black text-amber-700 font-mono">{latest.balance.toLocaleString()}원</div>
                                <div className="text-[9px] text-slate-500 mt-0.5">기준일 {String(latest.saved_at).slice(0, 10)}</div>
                              </>
                            ) : (
                              <div className="text-[11px] text-slate-400 py-1">OCR 잔고 이력 없음</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

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
                    {/* 상품 테이블 */}
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 font-black uppercase tracking-wide text-[9px] border-b border-slate-200">
                          <th className="text-center p-2 w-8">#</th>
                          <th className="text-left p-2 w-24">상품코드</th>
                          <th className="text-left p-2">상품명</th>
                          <th className="text-right p-2 w-14">현재고</th>
                          <th className="text-right p-2 w-14">적정</th>
                          <th className="text-right p-2 w-20">발주수량</th>
                          <th className="text-right p-2 w-20">단가</th>
                          <th className="text-right p-2 w-24">금액</th>
                          <th className="text-left p-2 w-24">비고</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {s.items.map((it, iIdx) => (
                          <tr key={it.order_request_id} className="hover:bg-slate-50/70">
                            <td className="p-2 text-center text-slate-400 font-black">{iIdx + 1}</td>
                            <td className="p-2 font-mono text-[10px] text-slate-400">{it.product_code}</td>
                            <td className="p-2 font-bold text-slate-800 truncate max-w-[220px]">{it.product_name}</td>
                            <td className="p-2 text-right font-mono text-slate-600">{it.current_stock ?? "-"}</td>
                            <td className="p-2 text-right font-mono text-slate-600">{it.optimal_stock ?? "-"}</td>
                            <td className="p-2 text-right">
                              <input type="number" min={1} value={it.order_qty}
                                onChange={e => updateModalItem(sIdx, iIdx, { order_qty: Math.max(0, Number(e.target.value) || 0) })}
                                className="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono font-black text-red-600 focus:outline-none focus:border-red-400"/>
                            </td>
                            <td className="p-2 text-right">
                              <input type="number" min={0} value={it.unit_price ?? ""}
                                onChange={e => updateModalItem(sIdx, iIdx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                                placeholder="0"
                                className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-right font-mono focus:outline-none focus:border-red-400"/>
                            </td>
                            <td className="p-2 text-right font-mono font-black text-emerald-700">
                              {it.unit_price ? (it.order_qty * it.unit_price).toLocaleString() + "원" : "-"}
                            </td>
                            <td className="p-2">
                              <input type="text" value={it.memo ?? ""}
                                onChange={e => updateModalItem(sIdx, iIdx, { memo: e.target.value })}
                                placeholder="(선택)"
                                className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-red-400"/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t-2 border-slate-300 font-black text-[10px]">
                          <td colSpan={5} className="p-2 text-right text-slate-500 uppercase">소계</td>
                          <td className="p-2 text-right text-red-600 font-mono">{totalQty}개</td>
                          <td colSpan={1}></td>
                          <td className="p-2 text-right text-emerald-700 font-mono">{totalAmount > 0 ? totalAmount.toLocaleString() + "원" : "-"}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* 특이사항 · 발송 채널 */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-center">
                <div>
                  <label className="text-[11px] text-slate-500 font-black block mb-1">특이사항 · 요청 메모</label>
                  <textarea value={orderModal.memo} onChange={e => setOrderModal(p => p && ({ ...p, memo: e.target.value }))}
                    placeholder="배송 시간, 결제 조건, 특별 요청 등..."
                    rows={2}
                    className="w-full border border-slate-200 rounded px-2 py-1.5 text-[11px] focus:outline-none focus:border-red-400 resize-none"/>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-slate-500 font-black block">발송 채널</label>
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

            {/* 액션 버튼 */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11px] text-slate-500">
                총 <span className="font-black text-slate-800">{orderModal.suppliers.length}개 공급사</span> · <span className="font-black text-slate-800">{orderModal.suppliers.reduce((n, s) => n + s.items.length, 0)}개 상품</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOrderModal(null)}
                  disabled={sendingBulk}
                  className="text-[12px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg px-4 py-2 cursor-pointer disabled:opacity-40"
                >취소</button>
                <button
                  onClick={submitOrderModal}
                  disabled={sendingBulk}
                  className="text-[12px] font-black text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 border border-red-700 shadow-md rounded-lg px-5 py-2 cursor-pointer disabled:opacity-40 flex items-center gap-2"
                >
                  {sendingBulk ? <Loader2 size={13} className="animate-spin"/> : <Send size={13}/>}
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
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
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
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierInfoModal(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <VendorDetailModal
              vendor={supplierInfoModal}
              onClose={() => setSupplierInfoModal(null)}
              onSaved={() => setSupplierInfoModal(null)}
            />
          </div>
        </div>
      )}

      {/* 2026-07-30 · 사용자 요청 · 입고내역 상세 모달 */}
      {selectedArrivalId != null && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSelectedArrivalId(null)}>
          <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-white shrink-0">
              <Package size={18} className="text-indigo-600" />
              <h3 className="text-[16px] font-black text-slate-800">입고내역 상세</h3>
              <span className="text-[12px] font-semibold text-slate-500 tabular-nums">ID {selectedArrivalId}</span>
              <button type="button" onClick={() => setSelectedArrivalId(null)}
                className="ml-auto w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer" title="닫기">
                ✕
              </button>
            </div>
            {/* 본문 */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              {arrivalDetailLoading || !arrivalDetail ? (
                <div className="py-12 flex items-center justify-center gap-2 text-slate-400 text-[13px] font-semibold">
                  <Loader2 size={16} className="animate-spin" /> 상세 로딩 중...
                </div>
              ) : (
                <>
                  {/* 헤더 요약 카드 */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">등록일시</div>
                      <div className="text-[13px] font-black text-slate-800 tabular-nums mt-0.5">
                        {(() => { const d = new Date(arrivalDetail.arrival_date); return isNaN(d.getTime()) ? "-" : d.toLocaleString("ko-KR"); })()}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">담당자</div>
                      <div className="text-[13px] font-black text-slate-800 mt-0.5">{arrivalDetail.checked_by ?? "-"}</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">품목·수량</div>
                      <div className="text-[13px] font-black text-emerald-700 tabular-nums mt-0.5">{arrivalDetail.total_items}개 · {arrivalDetail.total_qty.toLocaleString()}수량</div>
                    </div>
                    <div className={`border rounded-lg p-3 ${arrivalDetail.final_decision === "all_match" ? "bg-emerald-50 border-emerald-200" : arrivalDetail.final_decision === "has_mismatch" ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">최종 판정</div>
                      <div className={`text-[13px] font-black mt-0.5 ${arrivalDetail.final_decision === "all_match" ? "text-emerald-700" : arrivalDetail.final_decision === "has_mismatch" ? "text-rose-700" : "text-slate-500"}`}>
                        {arrivalDetail.final_decision === "all_match" ? "완전일치" : arrivalDetail.final_decision === "has_mismatch" ? "불일치 있음" : "-"}
                      </div>
                    </div>
                  </div>
                  {/* 상태 카운트 */}
                  <div className="flex items-center gap-3 flex-wrap text-[12px] font-semibold">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300">
                      수량일치 <span className="font-black tabular-nums">{arrivalDetail.match_count}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-300">
                      수량불일치 <span className="font-black tabular-nums">{arrivalDetail.mismatch_count}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
                      유통기한 임박 <span className="font-black tabular-nums">{arrivalDetail.expiring_count}</span>
                    </span>
                  </div>
                  {/* 공급사 요약 · 메모 */}
                  {arrivalDetail.supplier_summary && (
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider mb-1">공급사 요약</div>
                      <div className="text-[13px] font-medium text-slate-700 break-words">{arrivalDetail.supplier_summary}</div>
                    </div>
                  )}
                  {arrivalDetail.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider mb-1">메모</div>
                      <div className="text-[13px] font-medium text-slate-700 whitespace-pre-wrap">{arrivalDetail.note}</div>
                    </div>
                  )}
                  {/* 아이템 리스트 */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                      <span className="text-[12px] font-black text-slate-700">입고 아이템</span>
                      <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{arrivalDetail.items?.length ?? 0}개</span>
                    </div>
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-[12px]">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="px-2 py-1.5 text-left w-10">#</th>
                            <th className="px-2 py-1.5 text-left w-24">코드</th>
                            <th className="px-2 py-1.5 text-left min-w-[180px]">상품명</th>
                            <th className="px-2 py-1.5 text-left w-28">공급사</th>
                            <th className="px-2 py-1.5 text-right w-14">수량</th>
                            <th className="px-2 py-1.5 text-center w-20">상태</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(arrivalDetail.items ?? []).map((it, i) => (
                            <tr key={it.id} className="hover:bg-slate-50/60">
                              <td className="px-2 py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                              <td className="px-2 py-1.5 text-slate-500 tabular-nums text-[11px]">{it.product_code ?? "-"}</td>
                              <td className="px-2 py-1.5 text-slate-800 font-semibold break-words">{it.product_name ?? "-"}</td>
                              <td className="px-2 py-1.5 text-slate-600">{it.supplier ?? "-"}</td>
                              <td className="px-2 py-1.5 text-right font-black tabular-nums text-slate-800">{it.qty.toLocaleString()}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                  it.status === "match" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : it.status === "mismatch" ? "bg-rose-50 text-rose-700 border-rose-300"
                                    : it.status === "expiring" ? "bg-amber-50 text-amber-700 border-amber-300"
                                    : "bg-slate-50 text-slate-500 border-slate-300"
                                }`}>
                                  {it.status === "match" ? "일치" : it.status === "mismatch" ? "불일치" : it.status === "expiring" ? "기한임박" : "미확인"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
};

export default OrderManagePage;

