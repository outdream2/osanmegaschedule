// src/components/OrderManagePage/OrderManagePage.tsx
// 발주관리 페이지 — 매장관리 · 재고관리 · 입고알림관리 옆의 서브탭으로 노출
// 기존 요청목록의 '발주요청' 탭 컨텐츠를 독립 페이지로 분리
// 사입(OCR거래명세서 등록) 탭에서는 거래명세서 OCR(OcrPage) 노출
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";
import { Loader2, Package, ShoppingCart, RefreshCw, Trash2, CheckSquare, Square, Send, Mail, MessageSquare, PackageCheck, Truck, AlertTriangle, Upload, Building2, ClipboardList } from "lucide-react";
import * as XLSX from "xlsx";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import type { ProductInfo as ProductInfoType } from "../../lib/productsCache";
import { OcrPage } from "../OcrPage";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../AppNavHeader";
// 공급사관리(마스터-디테일) 은 무겁고 조건부라 lazy 로드
const VendorListEditor = lazy(() => import("../LandingPage/VendorListEditor").then(m => ({ default: m.VendorListEditor })));

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
}

const OrderManagePage: React.FC<OrderManagePageProps> = ({
  ocrTabAuthSession,
  ocrTabOnBack,
  ocrTabOnNavigate,
  ocrTabOnLogout,
}) => {
  // 상단 탭 (발주요청 / 발주필요 / 사입(OCR거래명세서 등록) / 공급사관리) · Vercel Ink underline 스타일
  const [topTab, setTopTab] = useState<"order" | "need" | "receipt" | "vendor">("order");
  // 공급사관리 서브 pill (재고관리 스타일 · 대시보드/원본데이터)
  const [vendorPageTab, setVendorPageTab] = useState<"dashboard" | "raw">("dashboard");
  // 원본데이터 → 대시보드 전환 시 자동 선택될 공급사 id
  const [vendorPreselectId, setVendorPreselectId] = useState<number | null>(null);

  // 사입(OCR거래명세서 등록) 상태
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptFilter, setReceiptFilter] = useState<"all" | "pending" | "partial" | "complete">("all");

  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  const [orderSearch, setOrderSearch] = useState("");

  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());
  const [lowStockSearch, setLowStockSearch] = useState("");
  const [orderReqCollapsed, setOrderReqCollapsed] = useState(false);
  const [lowStockCollapsed, setLowStockCollapsed] = useState(false);
  // 공급사 마스터 (vendors 테이블) — 담당자·이메일·전화 매핑
  const [vendors, setVendors] = useState<Array<{ id: number; company_name: string; contact_name: string | null; phone: string | null; email: string | null }>>([]);
  const loadVendors = useCallback(async () => {
    try {
      const res = await fetch("/api/vendors");
      if (res.ok) setVendors(await res.json());
    } catch { /* silent */ }
  }, []);
  useEffect(() => { loadVendors(); }, [loadVendors]);

  // 공급사 임포트 로직은 LandingPage 데이터 업로드 > 공급사관리 로 이동됨 (여기서 제거 · 2026-07-15)
  const vendorMap = useMemo(() => {
    const m = new Map<string, { contact_name: string | null; phone: string | null; email: string | null }>();
    for (const v of vendors) {
      const info = { contact_name: v.contact_name, phone: v.phone, email: v.email };
      // 원본, 공백 정규화, 소문자 세 가지 형태로 저장 (매칭률 극대화)
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
  useEffect(() => { if (topTab === "receipt") loadReceipts(); }, [topTab, loadReceipts]);

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

  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 py-4 flex flex-col gap-4">
      {/* 상단 탭 (2026-07-15) · Vercel Ink underline 스타일 · 재고관리/판매추이와 통일 */}
      <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-1 border-b border-slate-200 sm:overflow-x-auto sm:scrollbar-none">
        {[
          { k: "order"   as const, label: "발주요청", icon: ShoppingCart, color: "sky" },
          { k: "need"    as const, label: "발주필요", icon: ClipboardList, color: "amber", badge: lowStock.length },
          { k: "receipt" as const, label: "사입(OCR거래명세서 등록)", icon: PackageCheck, color: "violet" },
          { k: "vendor"  as const, label: "공급사관리", icon: Building2, color: "teal" },
        ].map(t => {
          const Icon = t.icon;
          const active = topTab === t.k;
          const activeText = {
            sky:    "text-sky-700",
            amber:  "text-amber-700",
            violet: "text-violet-700",
            teal:   "text-teal-700",
          }[t.color]!;
          const activeBar = {
            sky:    "bg-sky-500",
            amber:  "bg-amber-500",
            violet: "bg-violet-500",
            teal:   "bg-teal-500",
          }[t.color]!;
          return (
            <button key={t.k} onClick={() => setTopTab(t.k)}
              className={`relative basis-1/2 sm:basis-auto flex-grow-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-[13px] font-bold leading-tight transition-colors duration-150 ${
                active ? activeText : "text-slate-400 hover:text-slate-700"
              }`}>
              <Icon size={13} strokeWidth={active ? 2.4 : 1.8} className="hidden sm:inline-block shrink-0" />
              <span>{t.label}</span>
              {"badge" in t && t.badge != null && t.badge > 0 && (
                <span className={`inline-flex items-center justify-center min-w-[14px] sm:min-w-[18px] px-1 h-4 rounded-full text-[9px] font-black ${active ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  {t.badge}
                </span>
              )}
              {active && (
                <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${activeBar} rounded-t-sm`} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── 발주필요 탭 · 적정재고 미달 상품 리스트 (order 탭에서 이동) ── */}
      {topTab === "need" && (
      <section className="flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={() => setLowStockCollapsed(!lowStockCollapsed)} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg -mx-1 px-1 py-0.5 transition" title={lowStockCollapsed ? "펼치기" : "접기"}>
            <span className={`text-slate-400 text-xs transition-transform ${lowStockCollapsed ? "" : "rotate-90"}`}>▶</span>
            <Package size={16} className="text-amber-500" />
            <h2 className="text-sm font-black text-slate-800">발주 필요 상품</h2>
            <span className="text-[10px] text-slate-500 font-normal">(현재고 &lt; 적정재고)</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">{lowStock.length}개</span>
          </button>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={lowStockSearch}
              onChange={e => setLowStockSearch(e.target.value)}
              placeholder="상품·코드·공급사 검색"
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 w-40 focus:outline-none focus:border-amber-400"
            />
            <button onClick={loadProducts} disabled={productsLoading} className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 cursor-pointer flex items-center gap-1">
              <RefreshCw size={12} className={productsLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {!lowStockCollapsed && (<>
        {productsLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-amber-400" /></div>
        ) : lowStock.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-300 border-t border-b border-slate-200 bg-white">
            <Package size={28} className="mb-2" /><p className="text-sm font-bold text-gray-400">발주 필요 상품이 없습니다</p>
          </div>
        ) : (
          <>
          <div className="px-3 pt-1.5 pb-0.5 flex items-center gap-2 border-t border-slate-100 bg-white">
            <span className="text-[11px] font-black text-slate-600">발주필요 리스트</span>
            <span className="text-[10px] font-mono text-slate-400">({lowStockFiltered.length}건)</span>
          </div>
          <div className="border-t border-b border-slate-200 overflow-auto max-h-[280px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-1 py-1.5 w-24">공급사</th>
                  <th className="text-left px-1 py-1.5 w-20">담당자</th>
                  <th className="text-left px-1 py-1.5 min-w-[120px]">상품명</th>
                  <th className="text-right px-0.5 py-1.5 w-14 bg-slate-50/60"><div className="leading-tight">ERP<br/>재고<br/><span className="text-[9px] text-slate-400 font-normal">(현재고)</span></div></th>
                  <th className="text-right px-0.5 py-1.5 w-16 bg-violet-50/60 text-violet-500">실재고</th>
                  <th className="text-right px-0.5 py-1.5 w-12 bg-slate-50/60">적정</th>
                  <th className="text-right px-0.5 py-1.5 w-12 bg-rose-50/60 text-rose-500">부족</th>
                  <th className="text-center px-0.5 py-1.5 w-14">발주</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lowStockFiltered.map(p => {
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
                      <td className="px-1 py-1.5 text-[11px] text-sky-600 font-semibold break-words whitespace-normal align-top">{p.supplier || "-"}</td>
                      <td className="px-1 py-1.5 text-[11px] text-slate-600 break-words whitespace-normal align-top">
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
                      <td className="px-1 py-1.5 align-top">
                        <button
                          onClick={() => setDetailProduct({ code, name })}
                          className="text-left text-[12px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                          title="상품 상세정보 조회"
                        >{name || "(상품명 없음)"}</button>
                      </td>
                      <td className="text-right px-0.5 py-1.5 font-mono font-bold text-[11px] text-slate-700 bg-slate-50/40 align-top">{cur}</td>
                      <td
                        className={`text-right px-0.5 py-1.5 font-mono font-black text-[11px] bg-violet-50/40 align-top ${inv ? "text-violet-700" : "text-slate-300"}`}
                        title={inv ? `창고 ${inv.warehouse ?? "-"} + 매장 ${inv.store ?? "-"} = ${inv.total}` : "실재고 미입력"}
                      >
                        {inv ? inv.total : "—"}
                        {inv && (
                          <span className="block text-[9px] font-normal text-slate-400 leading-none mt-0.5">
                            창{inv.warehouse ?? "-"}·매{inv.store ?? "-"}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-0.5 py-1.5 font-mono font-bold text-[11px] text-slate-700 bg-slate-50/40 align-top">{opt}</td>
                      <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-top">
                        <span className="font-mono font-black text-[11px] text-rose-600">-{opt - cur}</span>
                      </td>
                      <td className="text-center px-0.5 py-1.5 align-top">
                        {alreadyRequested ? (
                          <button onClick={() => handleRequestOrder(p)} className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg cursor-pointer hover:bg-emerald-100 transition">요청됨</button>
                        ) : (
                          <button onClick={() => handleRequestOrder(p)} disabled={busy}
                            className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1 mx-auto">
                            <ShoppingCart size={10} />{busy ? "..." : "리스트에 추가"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lowStockFiltered.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-300">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
        </>)}
      </section>
      )}
      {/* ── 사입(OCR거래명세서 등록) 탭 · 거래명세서 OCR 컨텐츠만 임베드 (헤더 X) ── */}
      {topTab === "receipt" && (
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
      {/* ── 공급사관리 탭 · VendorListEditor + 대시보드/원본데이터 pill (재고관리 스타일) ── */}
      {topTab === "vendor" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Building2 size={18} className="text-teal-600 shrink-0" />
            <h2 className="text-lg font-black text-slate-800">공급사관리</h2>
            <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">사업자등록번호 · 담당자 정보 관리</span>
            <div className="inline-flex bg-slate-100/70 border border-slate-200/60 rounded-2xl p-1 gap-0.5 ml-1">
              <button onClick={() => setVendorPageTab("dashboard")}
                className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${
                  vendorPageTab === "dashboard"
                    ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}>대시보드</button>
              <button onClick={() => setVendorPageTab("raw")}
                className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${
                  vendorPageTab === "raw"
                    ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}>원본 데이터</button>
            </div>
          </div>
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">공급사관리 로딩 중...</div>}>
            <VendorListEditor
              mode={vendorPageTab}
              initialSelectedId={vendorPreselectId}
              onEditRequest={(id) => { setVendorPreselectId(id); setVendorPageTab("dashboard"); }}
            />
          </Suspense>
        </div>
      )}
      {/* ── (기존 입고 목록 UI · 참조용 · 표시 안 함) ── */}
      {false && (
        <section className="flex flex-col gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Truck size={18} className="text-emerald-500" />
              <h2 className="text-sm font-black text-slate-800">사입(OCR거래명세서 등록) 목록</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">{receipts.length}건</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "pending", "partial", "complete"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setReceiptFilter(f)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                    receiptFilter === f
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f === "all" ? "전체" : f === "pending" ? "미입고" : f === "partial" ? "부분입고" : "완전입고"}
                </button>
              ))}
              <button onClick={loadReceipts} disabled={receiptsLoading} className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 cursor-pointer flex items-center gap-1">
                <RefreshCw size={12} className={receiptsLoading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
          {receiptsLoading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-emerald-400" /></div>
          ) : receipts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-300">
              <PackageCheck size={32} className="mb-2" />
              <p className="text-sm font-bold">입고 대기 중인 발주가 없습니다</p>
              <p className="text-[11px] text-slate-400 mt-1">발주 발송 후 이 목록에 자동 표시됩니다 · OCR 거래명세서 등록 시 자동 매칭</p>
              <div className="mt-3 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 max-w-md">
                <b>서버 API 구성 필요:</b> <code>/api/goods-receipts</code>, <code>/api/goods-receipts/:id/confirm</code><br/>
                DB: <code>goods_receipts</code>, <code>goods_receipt_items</code> 테이블
              </div>
            </div>
          ) : (
            <div className="border-t border-b border-slate-200 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase tracking-wide text-[10px]">
                    <th className="text-left p-2 w-32">발주번호</th>
                    <th className="text-left p-2 w-28">공급사</th>
                    <th className="text-left p-2 w-24">담당자</th>
                    <th className="text-right p-2 w-16">품목수</th>
                    <th className="text-center p-2 w-24">상태</th>
                    <th className="text-right p-2 w-24">발주일</th>
                    <th className="text-right p-2 w-24">입고일</th>
                    <th className="text-center p-2 w-32">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipts
                    .filter(r => receiptFilter === "all" || r.status === receiptFilter)
                    .map(r => {
                      const statusColor = r.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-300"
                                       : r.status === "partial"  ? "bg-blue-50 text-blue-700 border-blue-300"
                                       : r.status === "complete" ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                       : r.status === "over"     ? "bg-purple-50 text-purple-700 border-purple-300"
                                       : "bg-rose-50 text-rose-700 border-rose-300";
                      const statusLabel = r.status === "pending" ? "미입고" : r.status === "partial" ? "부분입고" : r.status === "complete" ? "완전입고" : r.status === "over" ? "초과입고" : "반품";
                      const overdue = r.status === "pending" && (Date.now() - new Date(r.dispatched_at).getTime()) > 7 * 86400000;
                      return (
                        <tr key={r.id} className={`hover:bg-slate-50/70 transition ${overdue ? "bg-rose-50/30" : ""}`}>
                          <td className="p-2 font-mono text-[10px] text-slate-500">{r.order_number}</td>
                          <td className="p-2 text-sky-600 font-semibold truncate">{r.supplier}</td>
                          <td className="p-2 text-slate-600 truncate">{r.supplier_contact || "-"}</td>
                          <td className="p-2 text-right font-bold text-slate-700 font-mono">{r.item_count}</td>
                          <td className="p-2 text-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded border ${statusColor}`}>
                              {statusLabel}
                              {overdue && <AlertTriangle size={9} className="text-rose-500" />}
                            </span>
                          </td>
                          <td className="p-2 text-right text-slate-500 text-[10px]">{fmtDate(r.dispatched_at)}</td>
                          <td className="p-2 text-right text-slate-500 text-[10px]">{r.received_at ? fmtDate(r.received_at) : "-"}</td>
                          <td className="p-2 text-center">
                            {r.status === "pending" || r.status === "partial" ? (
                              <button
                                onClick={() => markReceived(r)}
                                className="text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1 cursor-pointer flex items-center gap-1 mx-auto"
                              >
                                <PackageCheck size={10} /> 입고확정
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── 발주요청 탭 (기존 내용) ── */}
      {topTab === "order" && (<>
      {/* 발주 요청 목록 (일괄 발주 가능) */}
      <section className="flex flex-col gap-2 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <button onClick={() => setOrderReqCollapsed(!orderReqCollapsed)} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg -mx-1 px-1 py-0.5 transition" title={orderReqCollapsed ? "펼치기" : "접기"}>
            <span className={`text-slate-400 text-xs transition-transform ${orderReqCollapsed ? "" : "rotate-90"}`}>▶</span>
            <ShoppingCart size={16} className="text-red-500" />
            <h2 className="text-sm font-black text-slate-800">발주 요청 목록</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">{orderReqs.length}건</span>
            {selectedOrder.size > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300">선택 {selectedOrder.size}건</span>
            )}
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                placeholder="상품·코드·공급사 검색"
                className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 w-36 min-w-0 focus:outline-none focus:border-rose-400"
              />
              {/* 발송 채널 선택 */}
              <label className={`text-[11px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 shrink-0 ${bulkChannels.email ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-400 border-slate-200"}`}>
                <input type="checkbox" checked={bulkChannels.email} onChange={e => setBulkChannels(p => ({ ...p, email: e.target.checked }))} className="w-3 h-3" />
                <Mail size={11} /> 이메일
              </label>
              <label className={`text-[11px] font-bold border rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 shrink-0 ${bulkChannels.sms ? "bg-sky-50 text-sky-700 border-sky-300" : "bg-white text-slate-400 border-slate-200"}`}>
                <input type="checkbox" checked={bulkChannels.sms} onChange={e => setBulkChannels(p => ({ ...p, sms: e.target.checked }))} className="w-3 h-3" />
                <MessageSquare size={11} /> 문자
              </label>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleBulkOrder}
                disabled={sendingBulk || selectedOrder.size === 0}
                className="text-[11px] font-black text-white bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 border border-red-700 rounded-lg px-3 py-1 cursor-pointer disabled:opacity-40 flex items-center gap-1 shadow-sm shrink-0"
                title="선택한 발주요청을 공급사별로 그룹핑 후 이메일/문자 발송"
              >
                {sendingBulk ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                일괄 발주 {selectedOrder.size > 0 && `(${selectedOrder.size})`}
              </button>
              <button onClick={toggleAll} className="text-[11px] font-bold text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2 py-1 cursor-pointer flex items-center gap-1 shrink-0">
                {allChecked ? <CheckSquare size={12} className="text-rose-500" /> : <Square size={12} />}
                전체선택
              </button>
              <button
                onClick={() => selectedOrder.size > 0 && confirm(`${selectedOrder.size}건 삭제할까요?`) && deleteOrder([...selectedOrder])}
                disabled={selectedOrder.size === 0}
                className="text-[11px] font-bold text-red-600 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Trash2 size={12} /> 삭제
              </button>
              <button onClick={loadOrderReqs} disabled={orderLoading} className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2 py-1 hover:bg-slate-50 cursor-pointer flex items-center gap-1 shrink-0">
                <RefreshCw size={12} className={orderLoading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>
        {!orderReqCollapsed && (<>
        {orderError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-bold">
            ⚠ {orderError}
            <button onClick={loadOrderReqs} className="ml-auto text-red-500 underline cursor-pointer">재시도</button>
          </div>
        )}
        {orderLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-red-400" /></div>
        ) : orderReqs.length === 0 && !orderError ? (
          <p className="text-xs text-gray-400 py-6 text-center border-t border-b border-slate-200 bg-white">발주 요청 내역이 없습니다</p>
        ) : (
          <>
          {/* 발주요청 리스트 · 판매리스트와 동일 디자인 */}
          <div className="px-3 pt-1.5 pb-0.5 flex items-center gap-2 border-t border-slate-100 bg-white">
            <span className="text-[11px] font-black text-slate-600">발주요청 리스트</span>
            <span className="text-[10px] font-mono text-slate-400">({orderReqsFiltered.length}건)</span>
          </div>
          <div className="border-t border-b border-slate-200 overflow-auto max-h-[280px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                  <th className="text-center px-0.5 py-1.5 w-6"></th>
                  <th className="text-left px-1 py-1.5 w-24">공급사</th>
                  <th className="text-left px-1 py-1.5 w-20">담당자</th>
                  <th className="text-left px-1 py-1.5 min-w-[120px]">상품명</th>
                  <th className="text-right px-0.5 py-1.5 w-14 bg-slate-50/60"><div className="leading-tight">ERP<br/>재고<br/><span className="text-[9px] text-slate-400 font-normal">(현재고)</span></div></th>
                  <th className="text-right px-0.5 py-1.5 w-16 bg-violet-50/60 text-violet-500">실재고</th>
                  <th className="text-right px-0.5 py-1.5 w-12 bg-slate-50/60">적정</th>
                  <th className="text-right px-0.5 py-1.5 w-12 bg-rose-50/60 text-rose-500">부족</th>
                  <th className="text-center px-0.5 py-1.5 w-14">발주</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {orderReqsFiltered.map(r => {
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
                      <td className="px-1 py-1.5 align-top">
                        {(() => {
                          // 공급사 문자열에서 부가 정보(괄호/vat 등)를 다음 줄로 분리
                          const raw = String(supplierDisplay ?? "");
                          const m = raw.match(/^(.+?)\s*(\(.+?\))\s*$/);
                          const mainName = m ? m[1].trim() : raw;
                          const suffix = m ? m[2].trim() : "";
                          // products 테이블에서 부가 정보(예: 세금 구분) fallback
                          const extraFromProduct = (productData as any)?.supplier_note || (productData as any)?.tax_note || "";
                          const secondLine = suffix || extraFromProduct || "";
                          return (
                            <>
                              <div className="text-[11px] text-sky-600 font-semibold break-words whitespace-normal leading-tight">{mainName || "-"}</div>
                              {secondLine && (
                                <div className="text-[9px] text-slate-400 font-normal break-words whitespace-normal leading-tight mt-0.5">{secondLine}</div>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-1 py-1.5 text-[11px] text-slate-600 break-words whitespace-normal align-top">
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
                      <td className="px-1 py-1.5 align-top">
                        <button
                          onClick={() => setDetailProduct({ code: r.product_code, name: r.product_name })}
                          className="text-left text-[12px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                          title="상품 상세정보 조회"
                        >{r.product_name || "(상품명 없음)"}</button>
                      </td>
                      <td
                        className={`text-right px-0.5 py-1.5 font-mono font-bold text-[11px] bg-slate-50/40 align-top ${stockChanged ? "text-orange-600" : "text-slate-700"}`}
                        title={stockChanged ? `요청 당시 ${r.current_stock ?? "-"} → 현재 ${displayCurrentStock ?? "-"} (변동)` : "현재 ERP 재고 (실시간)"}
                      >
                        {displayCurrentStock ?? "-"}
                        {stockChanged && <span className="block text-[8px] font-normal text-slate-400 leading-none mt-0.5">전 {r.current_stock}</span>}
                      </td>
                      <td
                        className={`text-right px-0.5 py-1.5 font-mono font-black text-[11px] bg-violet-50/40 align-top ${inv ? "text-violet-700" : "text-slate-300"}`}
                        title={inv ? `창고 ${inv.warehouse ?? "-"} + 매장 ${inv.store ?? "-"} = ${inv.total}` : "실재고 미입력"}
                      >
                        {inv ? inv.total : "—"}
                        {inv && (
                          <span className="block text-[9px] font-normal text-slate-400 leading-none mt-0.5">
                            창{inv.warehouse ?? "-"}·매{inv.store ?? "-"}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-0.5 py-1.5 font-mono font-bold text-[11px] text-slate-700 bg-slate-50/40 align-top">{displayOptimal ?? "-"}</td>
                      <td className="text-right px-0.5 py-1.5 bg-rose-50/40 align-top">
                        <span className="font-mono font-black text-[11px] text-rose-600">{displayShort > 0 ? `-${displayShort}` : "0"}</span>
                      </td>
                      <td className="text-center px-0.5 py-1.5 align-top">
                        <button
                          onClick={() => handleSingleOrder(r)}
                          disabled={sendingBulk}
                          className="text-[10px] font-black text-white bg-rose-500 hover:bg-rose-600 border border-rose-600 rounded px-1.5 py-0.5 cursor-pointer disabled:opacity-40 inline-flex items-center gap-0.5"
                          title="이 상품만 개별 발주"
                        >
                          <Send size={9} />발주
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {orderReqsFiltered.length === 0 && (
                  <tr><td colSpan={12} className="p-6 text-center text-slate-300">검색 결과 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
        </>)}
      </section>

      </>)}

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
    </main>
  );
};

export default OrderManagePage;
