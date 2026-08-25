// 2026-08-23 · Framework Phase 4 · 대형 파일 완전 분리 (3089 → 800 미만)
// src/components/OrderManagePage/OrderManagePage.tsx
// 발주관리 페이지 — 발주/매입/결제/통계 4탭
import React, { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast, toastClass } from "../../hooks/useToast";
import { useVendors } from "../../hooks/useVendors";
import { Spinner } from "../common/Spinner";
import { matchHangul } from "../../lib/hangulSearch";
import { useSortableTabs, type TabHandlerProps } from "../../hooks/useSortableTabs";
import {
  Package, ShoppingCart, PackageCheck, AlertTriangle, Building2, ClipboardList,
  CheckCircle2, TrendingUp, ScanLine, PackagePlus, ArrowLeftRight, Boxes, Wallet,
  Calculator, BarChart2, PieChart, Info,
} from "lucide-react";

// React.lazy code-split · 무거운 서브탭 · 초기 번들 축소
const OcrPage = React.lazy(() => import("../OcrPage").then(m => ({ default: m.OcrPage })));
const ScanPage = React.lazy(() => import("../ScanPage/ScanPage").then(m => ({ default: m.ScanPage })));
const ProductArrivalPage = React.lazy(() => import("../ProductArrivalPage/ProductArrivalPage").then(m => ({ default: m.ProductArrivalPage })));
// 2026-08-23 · #177 · Phase A · ProductInfoPage 신설 (상품정보 서브탭)
const ProductInfoPage = React.lazy(() => import("../ProductInfoPage/ProductInfoPage").then(m => ({ default: m.ProductInfoPage })));

const SubTabFallback = () => (
  <div className="flex-1 flex items-center justify-center py-16">
    <Spinner size={14} tone="zinc" label="로딩 중..." labelSize={12} />
  </div>
);

import type { Vendor } from "../LandingPage/VendorListEditor";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
import { OrderHistoryTab } from "./OrderHistoryTab";
// 2026-08-25 · 사용자 지시 · 매입 · 실재고 서브탭 → 유통기한 임박 서브탭 (rename + 목록)
//   · 이전 StockReconciliationTab import 는 제거 (파일은 다른 페이지에서 참조 가능 · 보존)
import { ExpiryImminentTab } from "./ExpiryImminentTab";
import { TrendingTab } from "./TrendingTab";
import { FlowTab } from "../StockManagePage/FlowTab";
import { DiffTab } from "../StockManagePage/DiffTab";
import { SupplierTab } from "../StockManagePage/SupplierTab";
import { ReturnListPanel } from "./ReturnListPanel";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
import { PaymentInfoTab } from "./PaymentInfoTab";
import { VatPreparePage } from "../VatPreparePage/VatPreparePage";
import { CategoryTab } from "./CategoryTab";
import { TabBar, type TabDef as CommonTabDef } from "../common/TabBar";
import { Modal } from "../common/Modal";
import { InventoryEditModal } from "../common/features/InventoryEditModal";
import type { InventoryEditModalInitialValues } from "../common/features/InventoryEditModal";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useReferenceValues } from "../../hooks/useReferenceValues";
import { api, ApiError } from "../../lib/apiClient";
import { dispatchApprovalChange } from "../../lib/approvalEvents";

import type {
  OrderRequest, ProductInfo, OrderManagePageProps,
  NeedCategoryFilterKey, OrderNeedFilterConfig,
} from "./OrderManagePage.types";
import { loadOrderNeedConfig } from "./OrderManagePage.utils";
import { useOrderNeedFilter } from "./useOrderNeedFilter";
import { useOrderModal } from "./useOrderModal";
import { useOrderManageData } from "./useOrderManageData";

// 분리된 탭/모달 컴포넌트
import { CriticalTab } from "./CriticalTab";
import { OrderNeedTab } from "./OrderNeedTab";
import { OrderRequestTab } from "./OrderRequestTab";
import { OrderModal } from "./OrderModal";
import { ProductDetailModal } from "./ProductDetailModal";
import { ContactPopover } from "./ContactPopover";
import { VendorPaymentPanel } from "./VendorPaymentPanel";

const OrderManagePage: React.FC<OrderManagePageProps> = ({
  ocrTabAuthSession,
  ocrTabOnBack,
  ocrTabOnNavigate,
  ocrTabOnLogout,
  initialTopTab,
  hideTopTabs = false,
  initialPurchaseSubTab,
  hideSubTabs = false,
}) => {
  const { vendorCategories: dbVendorCategories } = useReferenceValues();
  const confirm = useConfirm();
  const { toast, showError, showSuccess } = useToast();

  // Level-1 탭
  const [topTab, setTopTab] = useState<"purchase-order" | "purchase" | "payment" | "statistics">(initialTopTab ?? "purchase-order");
  useEffect(() => {
    if (initialTopTab && initialTopTab !== topTab) setTopTab(initialTopTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopTab]);

  // Level-2 서브탭 상태
  const [purchaseOrderSubTab, setPurchaseOrderSubTab] = useState<"order" | "need" | "critical" | "history">("need");
  const [purchaseSubTab, setPurchaseSubTab] = useState<"receipt" | "reconciliation" | "scan" | "productarrival" | "productinfo" | "return" | "purchase-history">(initialPurchaseSubTab ?? "receipt");
  // 2026-08-25 · DisplayPage 반품 메뉴 진입 시 · 매입 서브탭 강제 (return)
  useEffect(() => {
    if (initialPurchaseSubTab && initialPurchaseSubTab !== purchaseSubTab) setPurchaseSubTab(initialPurchaseSubTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPurchaseSubTab]);

  // 2026-08-23 · #197 · 스캔 미분류 (page 모드) 진입 시 · sessionStorage pending code 감지 · productinfo 서브탭 자동 전환
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("megatown_scan_pending_product_code");
      if (pending) {
        setTopTab("purchase");
        setPurchaseSubTab("productinfo");
      }
    } catch { /* noop */ }
  }, []);
  const [paymentSubTab, setPaymentSubTab] = useState<"vendor" | "payment-input" | "vat-prepare">("payment-input");
  const [statSubTab, setStatSubTab] = useState<"trending" | "category" | "flow" | "diff" | "supplier">("trending");

  const isAdmin = (ocrTabAuthSession?.level ?? 0) >= 8;
  const [vendorPreselectId, setVendorPreselectId] = useState<number | null>(null);

  // 공급사 패널
  const { width: vendorPanelWidth, startResize: onVendorResizeStart } = useResizablePanel({ storageKey: "megatown_order_vendor_w", defaultWidth: 640, minWidth: 320, maxWidth: 1000 });
  const [vendorSelected, setVendorSelected] = useState<Vendor | null>(null);
  const [vendorReloadKey, setVendorReloadKey] = useState(0);
  const [supplierInfoModal, setSupplierInfoModal] = useState<Vendor | null>(null);

  // 접기 상태
  const [needCollapsed, setNeedCollapsed] = useState<Set<string>>(new Set());
  const toggleNeedGroup = (g: string) => setNeedCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isNeedCollapsed = (g: string) => needCollapsed.has(g);
  const [orderGroupCollapsed, setOrderGroupCollapsed] = useState<Set<string>>(new Set());
  const toggleOrderGroup = (g: string) => setOrderGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isOrderGroupCollapsed = (g: string) => orderGroupCollapsed.has(g);

  const [inventoryEditModal, setInventoryEditModal] = useState<{ code: string; name: string; initialValues: InventoryEditModalInitialValues } | null>(null);

  const { vendors, vendorCategoryMap, getVendorCategory, findVendorByName } = useVendors();

  const openSupplierInfo = (supplierName: string | null | undefined) => {
    if (!supplierName) return;
    const name = String(supplierName).trim();
    if (!name) return;
    const found = findVendorByName(name);
    if (found) { setSupplierInfoModal(found as unknown as Vendor); return; }
    showError(`공급사 정보 없음: ${supplierName}`);
  };
  const handleVendorEditRequest = useCallback((vendorId: number) => {
    const found = vendors.find(v => v.id === vendorId);
    if (found) setVendorSelected(found as unknown as Vendor);
  }, [vendors]);

  // 발주 상태
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  const [orderQtyOverride, setOrderQtyOverride] = useState<Map<string, number>>(new Map());
  const [selectedLowStock, setSelectedLowStock] = useState<Set<string>>(new Set());
  const [bulkRequesting, setBulkRequesting] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderCategoryFilter, setOrderCategoryFilter] = useState<NeedCategoryFilterKey>("all");

  // 발주필요 정렬
  type NeedSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short" | "sale_month";
  const [needSortKey, setNeedSortKey] = useState<NeedSortKey>(() => loadOrderNeedConfig().defaultSortKey as NeedSortKey);
  const [needSortDir, setNeedSortDir] = useState<"asc" | "desc">(() => loadOrderNeedConfig().defaultSortDir);
  const handleNeedSort = (k: NeedSortKey) => {
    if (needSortKey === k) setNeedSortDir(d => d === "asc" ? "desc" : "asc");
    else { setNeedSortKey(k); setNeedSortDir("asc"); }
  };
  const needArrow = (k: NeedSortKey) => needSortKey !== k ? " ⇅" : needSortDir === "asc" ? " ▲" : " ▼";

  // 발주요청 정렬
  type OrderSortKey = "supplier" | "contact" | "name" | "current" | "inv" | "optimal" | "short";
  const [orderSortKey, setOrderSortKey] = useState<OrderSortKey>("short");
  const [orderSortDir, setOrderSortDir] = useState<"asc" | "desc">("desc");
  const handleOrderSort = (k: OrderSortKey) => {
    if (orderSortKey === k) setOrderSortDir(d => d === "asc" ? "desc" : "asc");
    else { setOrderSortKey(k); setOrderSortDir("asc"); }
  };
  const orderArrow = (k: OrderSortKey) => orderSortKey !== k ? " ⇅" : orderSortDir === "asc" ? " ▲" : " ▼";

  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());
  const [lowStockSearch, setLowStockSearch] = useState("");
  const [lowStockCollapsed, setLowStockCollapsed] = useState(false);

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
  const findVendor = useCallback((supplierName: string | null | undefined) => {
    if (!supplierName) return undefined;
    const s = supplierName.trim();
    return vendorMap.get(s) ?? vendorMap.get(s.replace(/\s+/g, "")) ?? vendorMap.get(s.toLowerCase());
  }, [vendorMap]);

  // 담당자 팝오버 / 상품 상세 모달
  const [contactPopover, setContactPopover] = useState<null | { anchor: DOMRect; name: string; phone: string | null; email: string | null }>(null);
  const [detailProduct, setDetailProduct] = useState<{ code: string; name: string } | null>(null);
  const [detailFull, setDetailFull] = useState<Record<string, any> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  useEffect(() => {
    if (!detailProduct) { setDetailFull(null); setDetailError(null); return; }
    setDetailLoading(true); setDetailError(null);
    (async () => {
      try {
        const { data } = await api.get<any>(`/api/products/${encodeURIComponent(detailProduct.code)}`);
        setDetailFull(data);
      } catch (err: any) { setDetailError(err instanceof ApiError ? err.message : (err?.message ?? "네트워크 오류")); }
      finally { setDetailLoading(false); }
    })();
  }, [detailProduct]);

  // 패널 상태
  const { width: orderPanelWidth, startResize: onOrderResizeStart } = useResizablePanel({ storageKey: "megatown_ordermanage_order_w", defaultWidth: 640, minWidth: 320, maxWidth: 1000 });
  const [orderPanelProduct, setOrderPanelProduct] = useState<{ code: string; name: string } | null>(null);
  const [orderPanelFull, setOrderPanelFull] = useState<Record<string, any> | null>(null);
  const [orderPanelLoading, setOrderPanelLoading] = useState(false);
  const [orderPanelError, setOrderPanelError] = useState<string | null>(null);
  useEffect(() => {
    if (!orderPanelProduct) { setOrderPanelFull(null); setOrderPanelError(null); return; }
    setOrderPanelLoading(true); setOrderPanelError(null);
    (async () => {
      try {
        const { data } = await api.get<any>(`/api/products/${encodeURIComponent(orderPanelProduct.code)}`);
        setOrderPanelFull(data);
      } catch (err: any) { setOrderPanelError(err instanceof ApiError ? err.message : (err?.message ?? "네트워크 오류")); }
      finally { setOrderPanelLoading(false); }
    })();
  }, [orderPanelProduct]);

  const { width: needPanelWidth, startResize: onNeedResizeStart } = useResizablePanel({ storageKey: "megatown_ordermanage_need_w", defaultWidth: 600, minWidth: 320, maxWidth: 1000 });
  const [orderNeedConfig, setOrderNeedConfig] = useState<OrderNeedFilterConfig>(() => loadOrderNeedConfig());
  const [needAdvancedOpen, setNeedAdvancedOpen] = useState(false);
  const [needCategoryFilter, setNeedCategoryFilter] = useState<string>(orderNeedConfig.defaultCategory);
  useEffect(() => { setNeedCategoryFilter(orderNeedConfig.defaultCategory); }, [orderNeedConfig.defaultCategory]);
  useEffect(() => {
    setNeedSortKey(orderNeedConfig.defaultSortKey as NeedSortKey);
    setNeedSortDir(orderNeedConfig.defaultSortDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNeedConfig.defaultSortKey, orderNeedConfig.defaultSortDir]);

  const needFilter = useOrderNeedFilter();

  // 발주필요 패널
  const [needPanelProduct, setNeedPanelProduct] = useState<{ code: string; name: string } | null>(null);
  const [needPanelFull, setNeedPanelFull] = useState<Record<string, any> | null>(null);
  const [needPanelLoading, setNeedPanelLoading] = useState(false);
  const [needPanelError, setNeedPanelError] = useState<string | null>(null);
  useEffect(() => {
    if (!needPanelProduct) { setNeedPanelFull(null); setNeedPanelError(null); return; }
    setNeedPanelLoading(true); setNeedPanelError(null);
    (async () => {
      try {
        const { data } = await api.get<any>(`/api/products/${encodeURIComponent(needPanelProduct.code)}`);
        setNeedPanelFull(data);
      } catch (err: any) { setNeedPanelError(err instanceof ApiError ? err.message : (err?.message ?? "네트워크 오류")); }
      finally { setNeedPanelLoading(false); }
    })();
  }, [needPanelProduct]);

  const getCode = (p: ProductInfo) => p.code ?? p.product_code ?? "";
  const getName = (p: ProductInfo) => p.name ?? p.product_name ?? "";

  // 데이터 로딩 훅
  const {
    orderReqs, setOrderReqs, orderLoading, orderError, prevPriceMap, loadOrderReqs,
    products, productsLoading, loadProducts,
    allProductsMap, reloadAllProductsMap,
    invStockMap, zoneMap, loadInvMap,
    receipts, receiptsLoading, loadReceipts,
  } = useOrderManageData(getCode);

  // 거래명세서 · 탭 전환 시 로드
  useEffect(() => { if (topTab === "purchase" && purchaseSubTab === "receipt") loadReceipts(); }, [topTab, purchaseSubTab, loadReceipts]);

  const markReceived = async (receipt: any, receivedQtyMap?: Record<string, number>) => {
    const proceed = await confirm({
      message: receivedQtyMap
        ? `${receipt.supplier} · #${receipt.order_number} 입고 확정할까요?\n(부분입고: 수량 조정됨)`
        : `${receipt.supplier} · #${receipt.order_number} 완전 입고 확정할까요?`,
    });
    if (!proceed) return;
    try {
      await api.post(`/api/goods-receipts/${receipt.id}/confirm`, { received_at: new Date().toISOString(), received_qty_map: receivedQtyMap ?? null });
      showSuccess(`입고 확정 완료\n#${receipt.order_number}`);
      loadReceipts();
    } catch (err: any) {
      showError(`입고 확정 실패\n${err instanceof ApiError ? err.message : (err?.message ?? String(err))}\n※ 서버 API 미구성일 수 있습니다.`);
    }
  };

  const requestedCodes = new Set(orderReqs.map(r => r.product_code));

  // 발주필요 · 판매 enrich
  interface NeedExtra { saleMonth: number | null; saleQuarter: number | null; }
  const [needExtraMap, setNeedExtraMap] = useState<Map<string, NeedExtra>>(() => new Map());
  const [needExtraLoaded, setNeedExtraLoaded] = useState(false);
  const needExtraRequired = (
    orderNeedConfig.minMonthlySales > 0 || orderNeedConfig.defaultSortKey === "sale_month" ||
    needSortKey === "sale_month" || needFilter.deferredInlineSalesMonth > 0 || needFilter.deferredInlineSalesQuarter > 0
  );
  useEffect(() => {
    if (!needExtraRequired || needExtraLoaded) return;
    let alive = true;
    (async () => {
      try {
        const { data: body } = await api.get<any>("/api/stock-manage/top-sales?months=6&limit=5000&sort=sale&dir=desc");
        const rows: any[] = Array.isArray(body?.rows) ? body.rows : (Array.isArray(body) ? body : []);
        const m = new Map<string, NeedExtra>();
        for (const r of rows) {
          const code = String(r?.product_code ?? "").trim();
          if (!code) continue;
          const saleMonth = r?.sale_qty_month != null ? Number(r.sale_qty_month) : null;
          const saleQuarter = r?.sale_qty_90d != null ? Number(r.sale_qty_90d) : null;
          m.set(code, {
            saleMonth:   Number.isFinite(saleMonth)   ? saleMonth   : null,
            saleQuarter: Number.isFinite(saleQuarter) ? saleQuarter : null,
          });
        }
        if (alive) { setNeedExtraMap(m); setNeedExtraLoaded(true); }
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, [needExtraRequired, needExtraLoaded]);

  // 발주필요 필터링
  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock != null ? Number(p.optimal_stock) : NaN;
    const minS = (p as any).min_stock != null ? Number((p as any).min_stock) : NaN;
    const code = getCode(p);
    const invEntry = code ? invStockMap.get(code) : undefined;
    const realTotal = invEntry ? Number(invEntry.total) : NaN;
    if (!orderNeedConfig.includeMissingRealStock && !invEntry) return false;
    let shortage = 0;
    if (orderNeedConfig.shortageBasis === "min") {
      if (isNaN(cur) || isNaN(minS) || minS <= 0) return false;
      shortage = minS - cur;
    } else if (orderNeedConfig.shortageBasis === "realStock") {
      if (isNaN(opt) || opt <= 0) return false;
      if (isNaN(realTotal)) return false;
      shortage = opt - realTotal;
    } else {
      if (isNaN(cur) || isNaN(opt) || opt <= 0) return false;
      shortage = opt - cur;
    }
    if (shortage < Math.max(1, orderNeedConfig.minShortage)) return false;
    if (orderNeedConfig.minMonthlySales > 0) {
      const extra = code ? needExtraMap.get(code) : undefined;
      if (extra) {
        if (extra.saleMonth == null || extra.saleMonth < orderNeedConfig.minMonthlySales) return false;
      } else if (needExtraLoaded) { return false; }
    }
    if (needFilter.deferredCurrentEnabled && needFilter.deferredInlineCurrent > 0) {
      if (isNaN(cur) || cur > needFilter.deferredInlineCurrent) return false;
    }
    if ((needFilter.deferredSalesMonthEnabled && needFilter.deferredInlineSalesMonth > 0) ||
        (needFilter.deferredSalesQuarterEnabled && needFilter.deferredInlineSalesQuarter > 0)) {
      const extra = code ? needExtraMap.get(code) : undefined;
      if (extra) {
        if (needFilter.deferredSalesMonthEnabled && needFilter.deferredInlineSalesMonth > 0) {
          if ((extra.saleMonth ?? 0) > needFilter.deferredInlineSalesMonth) return false;
        }
        if (needFilter.deferredSalesQuarterEnabled && needFilter.deferredInlineSalesQuarter > 0) {
          if ((extra.saleQuarter ?? 0) > needFilter.deferredInlineSalesQuarter) return false;
        }
      }
    }
    return true;
  }).sort((a, b) => (Number(b.optimal_stock) - Number(b.current_stock)) - (Number(a.optimal_stock) - Number(a.current_stock)));

  const handleRequestOrder = async (p: ProductInfo) => {
    const code = getCode(p);
    setRequestingOrder(prev => { const n = new Set(prev); n.add(code); return n; });
    try {
      await api.post("/api/order-requests", {
        product_code: code, product_name: getName(p),
        current_stock: p.current_stock, optimal_stock: p.optimal_stock,
        supplier: p.supplier, requested_at: new Date().toISOString(),
      });
      await loadOrderReqs();
      dispatchApprovalChange("order");
    } catch { /* silent */ }
    finally { setRequestingOrder(prev => { const n = new Set(prev); n.delete(code); return n; }); }
  };

  const deleteOrder = async (ids: string[]) => {
    await Promise.all(ids.map(id => api.del(`/api/order-requests/${id}`).catch(() => {})));
    setSelectedOrder(new Set());
    loadOrderReqs();
    dispatchApprovalChange("order");
  };

  // 발주서 모달 훅
  const { orderModal, setOrderModal, sendingBulk, notifyLogisticsLeader, setNotifyLogisticsLeader,
    openOrderModal, updateModalItem, submitOrderModal } = useOrderModal({
    allProductsMap, orderQtyOverride, findVendorByName, openSupplierInfo,
    loadOrderReqs, setSelectedOrder,
  });

  const handleBulkOrder = () => {
    const selected = orderReqs.filter(r => selectedOrder.has(r.id));
    if (selected.length === 0) { showError("발주할 상품을 선택해주세요."); return; }
    openOrderModal(selected);
  };

  const toggleOne = (id: string) => setSelectedOrder(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelectedOrder(prev => prev.size === orderReqs.length ? new Set() : new Set(orderReqs.map(r => r.id)));
  const allChecked = selectedOrder.size === orderReqs.length && orderReqs.length > 0;

  const toggleLowStockOne = (code: string) => setSelectedLowStock(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const clearLowStockSelection = () => setSelectedLowStock(new Set());
  const bulkRequestOrder = async () => {
    if (selectedLowStock.size === 0) return;
    setBulkRequesting(true);
    try {
      const codes = Array.from(selectedLowStock);
      const prods = lowStock.filter(p => codes.includes(getCode(p)));
      for (const p of prods) { await handleRequestOrder(p); }
      clearLowStockSelection();
    } finally { setBulkRequesting(false); }
  };

  const orderReqsFiltered = orderReqs.filter(r => {
    if (orderSearch.trim()) {
      const q = orderSearch.trim().toLowerCase();
      if (!(r.product_name?.toLowerCase().includes(q) || r.product_code?.toLowerCase().includes(q) || r.supplier?.toLowerCase().includes(q))) return false;
    }
    if (orderCategoryFilter !== "all") {
      const supplierName = String(r.supplier ?? "").trim();
      const cat = supplierName ? getVendorCategory(supplierName) : null;
      if (orderCategoryFilter === "기타") {
        const validCats = ["위탁", "선결제", "60회전", "90회전", "기타"];
        if (cat && validCats.includes(cat) && cat !== "기타") return false;
      } else { if (cat !== orderCategoryFilter) return false; }
    }
    return true;
  });

  const deferredNeedSearch = useDeferredValue(lowStockSearch);
  const lowStockFiltered = useMemo(() => lowStock.filter(p => {
    const q = deferredNeedSearch.trim();
    if (q) {
      const name = getName(p), code = getCode(p), sup = p.supplier ?? "";
      if (!(matchHangul(name, q) || matchHangul(code, q) || matchHangul(sup, q))) return false;
    }
    if (needCategoryFilter !== "all") {
      const supplierName = String(p.supplier ?? "").trim();
      const cat = supplierName ? getVendorCategory(supplierName) : null;
      if (needCategoryFilter === "기타") {
        const validCats = ["위탁", "선결제", "60회전", "90회전", "기타"];
        if (cat && validCats.includes(cat) && cat !== "기타") return false;
      } else { if (cat !== needCategoryFilter) return false; }
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lowStock, deferredNeedSearch, needCategoryFilter, vendorCategoryMap]);

  // 서브탭 정의
  type PurchaseOrderKey = "order" | "need" | "critical" | "history";
  type PurchaseKey = "receipt" | "reconciliation" | "scan" | "productarrival" | "productinfo" | "return" | "purchase-history";
  type PaymentKey = "vendor" | "payment-input" | "vat-prepare";
  type StatKey = "trending" | "category" | "flow" | "diff" | "supplier";
  interface SubTabDef<K extends string> { key: K; label: string; icon: React.ElementType; color: string; }

  const purchaseOrderDefaultTabs: SubTabDef<PurchaseOrderKey>[] = useMemo(() => [
    { key: "order",    label: "발주요청", icon: ShoppingCart,  color: "sky"    },
    { key: "need",     label: "발주필요", icon: ClipboardList, color: "rose"   },
    { key: "critical", label: "품절임박", icon: AlertTriangle, color: "amber"  },
    { key: "history",  label: "발주이력", icon: Package,       color: "indigo" },
  ], []);
  const purchaseDefaultTabs: SubTabDef<PurchaseKey>[] = useMemo(() => [
    { key: "purchase-history", label: "매입이력",   icon: Building2,      color: "sky"     },
    { key: "return",           label: "반품필요",   icon: ArrowLeftRight, color: "rose"    },
    { key: "receipt",          label: "거래명세서", icon: PackageCheck,   color: "violet"  },
    { key: "scan",             label: "실재고입력", icon: ScanLine,       color: "teal"    },
    { key: "productarrival",   label: "상품입고",   icon: PackagePlus,    color: "blue"    },
    { key: "productinfo",      label: "상품정보",   icon: Info,           color: "indigo"  },
    // 2026-08-25 · 사용자 지시 · 실재고 → 유통기한 임박 (rename + 콘텐츠 교체)
    { key: "reconciliation",   label: "유통기한 임박", icon: AlertTriangle,  color: "amber"   },
  ], []);
  const paymentDefaultTabs: SubTabDef<PaymentKey>[] = useMemo(() => [
    { key: "payment-input", label: "결제입력",        icon: Wallet,     color: "amber" },
    { key: "vendor",        label: "공급사별결제내역", icon: Building2,  color: "teal"  },
    { key: "vat-prepare",   label: "부가세 준비",      icon: Calculator, color: "rose"  },
  ], []);
  const statDefaultTabs: SubTabDef<StatKey>[] = useMemo(() => [
    { key: "trending", label: "급상승",       icon: TrendingUp,    color: "indigo"  },
    { key: "category", label: "구역현황",     icon: PieChart,      color: "amber"   },
    { key: "flow",     label: "상품현황",     icon: Boxes,         color: "sky"     },
    { key: "supplier", label: "공급사별현황", icon: Building2,     color: "emerald" },
    { key: "diff",     label: "손실추적",     icon: AlertTriangle, color: "rose"    },
  ], []);

  const purchaseOrderSortable = useSortableTabs("tabOrder.purchase-order", purchaseOrderDefaultTabs, isAdmin);
  const purchaseSortable      = useSortableTabs("tabOrder.purchase",       purchaseDefaultTabs,      isAdmin);
  const paymentSortable       = useSortableTabs("tabOrder.payment",        paymentDefaultTabs,       isAdmin);
  const statSortable          = useSortableTabs("tabOrder.statistics",     statDefaultTabs,          isAdmin);

  const [returnNeedCount, setReturnNeedCount] = useState<number>(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.count === "number") setReturnNeedCount(detail.count);
    };
    window.addEventListener("return-need-count", handler);
    return () => window.removeEventListener("return-need-count", handler);
  }, []);

  useEffect(() => {
    const first0 = purchaseOrderSortable.tabs[0]?.key as "order" | "need" | undefined;
    const first1 = purchaseSortable.tabs[0]?.key as PurchaseKey | undefined;
    const first2 = paymentSortable.tabs[0]?.key as PaymentKey | undefined;
    const first3 = statSortable.tabs[0]?.key as StatKey | undefined;
    if (first0) setPurchaseOrderSubTab(first0);
    if (first1) setPurchaseSubTab(first1);
    if (first2) setPaymentSubTab(first2);
    if (first3) setStatSubTab(first3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderSubTabs = <K extends string>(
    tabs: { k: K; label: string; icon: React.ElementType; color: string; badge?: number }[],
    activeTab: K,
    setTab: (k: K) => void,
    sortable?: { getTabProps: (key: K) => TabHandlerProps; isDragging: boolean },
  ) => hideSubTabs ? null : (
    <TabBar<K>
      level={3}
      tabs={tabs.map((t): CommonTabDef<K> => ({
        key: t.k, label: t.label,
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
      {!hideTopTabs && (
        <TabBar<typeof topTab>
          level={2}
          tabs={[
            { key: "purchase-order", label: "발주",      icon: ShoppingCart, color: "sky"    },
            { key: "purchase",       label: "매입",      icon: PackageCheck, color: "violet" },
            { key: "payment",        label: "결제/세금", icon: BarChart2,    color: "teal"   },
            { key: "statistics",     label: "통계",      icon: PieChart,     color: "indigo" },
          ] as CommonTabDef<typeof topTab>[]}
          activeKey={topTab}
          onSelect={setTopTab}
        />
      )}

      {/* ══ 발주 탭 ══ */}
      {topTab === "purchase-order" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<PurchaseOrderKey>(
            purchaseOrderSortable.tabs.map(t => {
              let badge: number | undefined;
              if (t.key === "need") badge = lowStockFiltered.length;
              else if (t.key === "order") badge = orderReqsFiltered.length;
              else if (t.key === "critical") {
                badge = products.filter(p => { const cur = Number(p.current_stock ?? NaN); return Number.isFinite(cur) && cur <= 3; }).length;
              }
              return { k: t.key, label: t.label, icon: t.icon, color: t.color, badge: badge && badge > 0 ? badge : undefined };
            }),
            purchaseOrderSubTab, setPurchaseOrderSubTab,
            { getTabProps: purchaseOrderSortable.getTabProps, isDragging: purchaseOrderSortable.isDragging },
          )}
          {purchaseOrderSubTab === "need" && (
            <OrderNeedTab
              lowStockFiltered={lowStockFiltered} productsLoading={productsLoading}
              invStockMap={invStockMap} requestedCodes={requestedCodes} requestingOrder={requestingOrder}
              selectedLowStock={selectedLowStock} bulkRequesting={bulkRequesting} needExtraMap={needExtraMap}
              dbVendorCategories={dbVendorCategories} lowStockSearch={lowStockSearch}
              setLowStockSearch={setLowStockSearch} needCategoryFilter={needCategoryFilter}
              setNeedCategoryFilter={setNeedCategoryFilter} needSortKey={needSortKey} needSortDir={needSortDir}
              handleNeedSort={handleNeedSort} needArrow={needArrow} isNeedCollapsed={isNeedCollapsed}
              toggleNeedGroup={toggleNeedGroup} lowStockCollapsed={lowStockCollapsed}
              needSalesMonthEnabled={needFilter.needSalesMonthEnabled}
              setNeedSalesMonthEnabled={needFilter.setNeedSalesMonthEnabled}
              needSalesQuarterEnabled={needFilter.needSalesQuarterEnabled}
              setNeedSalesQuarterEnabled={needFilter.setNeedSalesQuarterEnabled}
              needInlineMaxSalesMonth={needFilter.needInlineMaxSalesMonth}
              needInlineMaxSalesQuarter={needFilter.needInlineMaxSalesQuarter}
              updateInline={needFilter.updateInline} inlineFiltering={needFilter.inlineFiltering}
              inlineActive={needFilter.inlineActive} deferredCurrentEnabled={needFilter.deferredCurrentEnabled}
              deferredInlineCurrent={needFilter.deferredInlineCurrent}
              deferredSalesMonthEnabled={needFilter.deferredSalesMonthEnabled}
              deferredInlineSalesMonth={needFilter.deferredInlineSalesMonth}
              deferredSalesQuarterEnabled={needFilter.deferredSalesQuarterEnabled}
              deferredInlineSalesQuarter={needFilter.deferredInlineSalesQuarter}
              resetInlineFilter={needFilter.resetInlineFilter} needAdvancedOpen={needAdvancedOpen}
              setNeedAdvancedOpen={setNeedAdvancedOpen} orderNeedConfig={orderNeedConfig}
              setOrderNeedConfig={setOrderNeedConfig} setNeedSortKey={setNeedSortKey} setNeedSortDir={setNeedSortDir}
              needPanelWidth={needPanelWidth} onNeedResizeStart={onNeedResizeStart}
              needPanelProduct={needPanelProduct} needPanelFull={needPanelFull}
              needPanelLoading={needPanelLoading} needPanelError={needPanelError}
              setNeedPanelProduct={setNeedPanelProduct} setNeedPanelFull={setNeedPanelFull}
              openSupplierInfo={openSupplierInfo} getVendorCategory={getVendorCategory}
              findVendor={findVendor} getCode={getCode} getName={getName}
              toggleLowStockOne={toggleLowStockOne} clearLowStockSelection={clearLowStockSelection}
              setSelectedLowStock={setSelectedLowStock} bulkRequestOrder={bulkRequestOrder}
              handleRequestOrder={handleRequestOrder}
            />
          )}
          {purchaseOrderSubTab === "critical" && (
            <CriticalTab products={products} invStockMap={invStockMap} orderReqCodes={requestedCodes} getCode={getCode} onRequestOrder={handleRequestOrder} />
          )}
          {purchaseOrderSubTab === "history" && <OrderHistoryTab />}
        </div>
      )}

      {/* 발주요청 탭 */}
      {topTab === "purchase-order" && purchaseOrderSubTab === "order" && (
        <OrderRequestTab
          orderReqs={orderReqs} orderReqsFiltered={orderReqsFiltered} orderLoading={orderLoading}
          orderError={orderError} allProductsMap={allProductsMap} invStockMap={invStockMap}
          zoneMap={zoneMap} prevPriceMap={prevPriceMap} orderQtyOverride={orderQtyOverride}
          selectedOrder={selectedOrder} sendingBulk={sendingBulk} dbVendorCategories={dbVendorCategories}
          orderSearch={orderSearch} setOrderSearch={setOrderSearch}
          orderCategoryFilter={orderCategoryFilter} setOrderCategoryFilter={setOrderCategoryFilter}
          orderSortKey={orderSortKey} orderSortDir={orderSortDir} handleOrderSort={handleOrderSort}
          orderArrow={orderArrow} isOrderGroupCollapsed={isOrderGroupCollapsed} toggleOrderGroup={toggleOrderGroup}
          orderPanelWidth={orderPanelWidth} onOrderResizeStart={onOrderResizeStart}
          orderPanelProduct={orderPanelProduct} orderPanelFull={orderPanelFull}
          orderPanelLoading={orderPanelLoading} orderPanelError={orderPanelError}
          setOrderPanelProduct={setOrderPanelProduct} setOrderPanelFull={setOrderPanelFull}
          openSupplierInfo={openSupplierInfo} getVendorCategory={getVendorCategory} findVendor={findVendor}
          toggleOne={toggleOne} toggleAll={toggleAll} allChecked={allChecked}
          handleBulkOrder={handleBulkOrder}
          onDeleteSelected={async () => {
            if (selectedOrder.size > 0 && await confirm({ message: `${selectedOrder.size}건 삭제할까요?`, danger: true })) deleteOrder([...selectedOrder]);
          }}
          openOrderModal={openOrderModal} loadOrderReqs={loadOrderReqs}
          setOrderQtyOverride={setOrderQtyOverride} confirm={confirm}
        />
      )}

      {/* ══ 매입 탭 ══ */}
      {topTab === "purchase" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<PurchaseKey>(
            purchaseSortable.tabs.map(t => ({ k: t.key, label: t.label, icon: t.icon, color: t.color, badge: t.key === "return" ? returnNeedCount : undefined })),
            purchaseSubTab, setPurchaseSubTab,
            { getTabProps: purchaseSortable.getTabProps, isDragging: purchaseSortable.isDragging },
          )}
          {purchaseSubTab === "receipt" && (
            <div className="flex-1 flex flex-col min-h-0 -mt-1"><Suspense fallback={<SubTabFallback />}>
              <OcrPage embedded authSession={ocrTabAuthSession ?? null} onBack={ocrTabOnBack ?? (() => {})} onNavigate={ocrTabOnNavigate} onLogout={ocrTabOnLogout} />
            </Suspense></div>
          )}
          {/* 2026-08-25 · 사용자 지시 · reconciliation 키 유지 (URL/사이드바 호환) · 콘텐츠는 유통기한 임박 리스트 */}
          {purchaseSubTab === "reconciliation" && <div className="flex-1 flex flex-col min-h-0"><ExpiryImminentTab /></div>}
          {purchaseSubTab === "scan" && (
            <div className="flex-1 flex flex-col min-h-0 -mt-1"><Suspense fallback={<SubTabFallback />}>
              <ScanPage embedded onBack={ocrTabOnBack ?? (() => {})} authSession={ocrTabAuthSession ?? null} onNavigate={ocrTabOnNavigate} onLogout={ocrTabOnLogout} />
            </Suspense></div>
          )}
          {purchaseSubTab === "productarrival" && (
            <div className="flex-1 flex flex-col min-h-0 -mt-1"><Suspense fallback={<SubTabFallback />}>
              <ProductArrivalPage embedded onBack={ocrTabOnBack ?? (() => {})} authSession={ocrTabAuthSession ?? null} onNavigate={ocrTabOnNavigate} onLogout={ocrTabOnLogout} />
            </Suspense></div>
          )}
          {purchaseSubTab === "productinfo" && (
            <div className="flex-1 flex flex-col min-h-0 -mt-1"><Suspense fallback={<SubTabFallback />}>
              <ProductInfoPage authSession={ocrTabAuthSession ?? null} />
            </Suspense></div>
          )}
          {purchaseSubTab === "return" && <div className="flex-1 min-h-0"><ReturnListPanel onSupplierClick={openSupplierInfo} /></div>}
          {purchaseSubTab === "purchase-history" && <div className="flex-1 min-h-0"><PurchaseHistoryTab /></div>}
        </div>
      )}

      {/* ══ 결제 탭 ══ */}
      {topTab === "payment" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<PaymentKey>(
            paymentSortable.tabs.map(t => ({ k: t.key, label: t.label, icon: t.icon, color: t.color })),
            paymentSubTab, setPaymentSubTab,
            { getTabProps: paymentSortable.getTabProps, isDragging: paymentSortable.isDragging },
          )}
          {paymentSubTab === "vendor" && (
            <VendorPaymentPanel vendorPanelWidth={vendorPanelWidth} onVendorResizeStart={onVendorResizeStart}
              vendorReloadKey={vendorReloadKey} vendorPreselectId={vendorPreselectId}
              vendorSelected={vendorSelected} onEditRequest={handleVendorEditRequest} onSelectVendor={setVendorSelected} />
          )}
          {paymentSubTab === "payment-input" && <div className="flex-1 min-h-0"><PaymentInfoTab /></div>}
          {paymentSubTab === "vat-prepare" && <div className="flex-1 min-h-0"><VatPreparePage /></div>}
        </div>
      )}

      {/* ══ 통계 탭 ══ */}
      {topTab === "statistics" && (
        <div className="flex flex-col gap-3">
          {renderSubTabs<StatKey>(
            statSortable.tabs.map(t => ({ k: t.key, label: t.label, icon: t.icon, color: t.color })),
            statSubTab, setStatSubTab,
            { getTabProps: statSortable.getTabProps, isDragging: statSortable.isDragging },
          )}
          {statSubTab === "trending" && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TrendingTab
                onProductClick={(p) => setDetailProduct({
                  code: String(p?.product_code ?? ""),
                  name: String(p?.product_name ?? ""),
                })}
              />
            </div>
          )}
          {statSubTab === "category" && <div className="flex-1 min-h-0 overflow-y-auto"><CategoryTab /></div>}
          {statSubTab === "flow"     && <div className="flex-1 min-h-0"><FlowTab /></div>}
          {statSubTab === "supplier" && <div className="flex-1 min-h-0"><SupplierTab /></div>}
          {statSubTab === "diff"     && <div className="flex-1 min-h-0"><DiffTab /></div>}
        </div>
      )}

      {/* 발주서 모달 */}
      {orderModal && (
        <OrderModal
          orderModal={orderModal} sendingBulk={sendingBulk}
          notifyLogisticsLeader={notifyLogisticsLeader} setNotifyLogisticsLeader={setNotifyLogisticsLeader}
          onClose={() => !sendingBulk && setOrderModal(null)} onSubmit={submitOrderModal}
          onUpdateModalItem={updateModalItem}
          onDateChange={(field, value) => setOrderModal(p => p && ({ ...p, [field]: value }))}
          onChannelChange={(ch, value) => setOrderModal(p => p && ({ ...p, channels: { ...p.channels, [ch]: value } }))}
        />
      )}

      {/* 상품 상세정보 모달 */}
      <ProductDetailModal
        detailProduct={detailProduct} detailFull={detailFull} detailLoading={detailLoading} detailError={detailError}
        onClose={() => { setDetailProduct(null); reloadAllProductsMap(); loadInvMap(); loadOrderReqs(); }}
        onRealMapUpdate={(v) => setDetailFull(prev => prev ? { ...prev, real_map: v, realMap: v } : prev)}
        onProductUpdate={(updates) => setDetailFull(prev => prev ? { ...prev, ...updates } : prev)}
      />

      {/* 담당자 팝오버 */}
      {contactPopover && (
        <ContactPopover anchor={contactPopover.anchor} name={contactPopover.name}
          phone={contactPopover.phone} email={contactPopover.email} onClose={() => setContactPopover(null)} />
      )}

      {/* 공급사 정보 모달 · 2026-08-24 · 즉시 닫힘 버그 fix · closeOnBackdrop=false */}
      <Modal
        open={!!supplierInfoModal}
        onClose={() => setSupplierInfoModal(null)}
        size="xl"
        showClose={false}
        closeOnEsc={false}
        closeOnBackdrop={false}
        bodyPadding="none"
        className="h-[95vh] md:min-h-[85vh] md:max-h-[92vh]"
      >
        {supplierInfoModal && (
          <VendorDetailModal vendor={supplierInfoModal} onClose={() => setSupplierInfoModal(null)} onSaved={() => setSupplierInfoModal(null)} panel />
        )}
      </Modal>

      {inventoryEditModal && (
        <InventoryEditModal open={true} productCode={inventoryEditModal.code} productName={inventoryEditModal.name}
          initialValues={inventoryEditModal.initialValues} onSaved={() => { loadInvMap(); }} onClose={() => setInventoryEditModal(null)} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </main>
  );
};

export default OrderManagePage;
