// src/components/OrderManagePage/useOrderManageData.ts
// 2026-08-23 · Framework Phase 4 · 발주관리 데이터 로딩 훅 분리
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { useToast } from "../../hooks/useToast";
import type { OrderRequest, ProductInfo, GoodsReceipt } from "./OrderManagePage.types";

type InvSplit = {
  warehouse: number | null; store: number | null;
  w1: number | null; w2: number | null;
  s1: number | null; s2: number | null; s3: number | null;
  s1z: string | null; s2z: string | null; s3z: string | null;
};

export type InvStockEntry = {
  warehouse: number | null; store: number | null; total: number;
  w1: number | null; w2: number | null;
  s1: number | null; s2: number | null; s3: number | null;
  s1z: string | null; s2z: string | null; s3z: string | null;
};

export function useOrderManageData(getCode: (p: ProductInfo) => string) {
  const { showError, showSuccess } = useToast();

  // 발주요청
  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [prevPriceMap, setPrevPriceMap] = useState<Map<string, number>>(new Map());

  // 상품 목록
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // 전체 상품맵
  const [allProductsMap, setAllProductsMap] = useState<Record<string, any>>({});

  // 실재고맵
  const [invMap, setInvMap] = useState<Record<string, InvSplit>>({});

  // 거래명세서
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);

  const loadOrderReqs = useCallback(async () => {
    setOrderLoading(true); setOrderError(null);
    try {
      const { data: list } = await api.get<OrderRequest[]>("/api/order-requests");
      setOrderReqs(list);
      const codes = Array.from(new Set(list.map(r => r.product_code).filter(Boolean)));
      if (codes.length > 0) {
        try {
          const { data: j } = await api.get<any>(`/api/products/purchase-history?codes=${encodeURIComponent(codes.join(","))}&limit=1`);
          const hist = j?.history ?? {};
          const map = new Map<string, number>();
          for (const code of codes) {
            const p = hist[code]?.latest_unit_price;
            if (p != null && Number.isFinite(Number(p))) map.set(code, Number(p));
          }
          setPrevPriceMap(map);
        } catch { /* silent */ }
      }
    } catch (err: any) { setOrderError(err instanceof ApiError ? err.message : "네트워크 오류"); setOrderReqs([]); }
    finally { setOrderLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const { data } = await api.get<any>("/api/stock-manage/low-stock");
      setProducts(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    finally { setProductsLoading(false); }
  }, []);

  const reloadAllProductsMap = useCallback(async () => {
    try {
      const { data } = await api.get<any>("/api/products-map");
      setAllProductsMap(data);
    } catch { /* silent */ }
  }, []);

  const loadInvMap = useCallback(async () => {
    try {
      const { data: list } = await api.get<any>("/api/inventory-checks");
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
          warehouse: whSum, store: stSum, w1, w2, s1, s2, s3,
          s1z: strOrNull((r as any).store1_zone),
          s2z: strOrNull((r as any).store2_zone),
          s3z: strOrNull((r as any).store3_zone),
        };
      }
      setInvMap(m);
    } catch { /* silent */ }
  }, []);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    try {
      const { data } = await api.get<any>("/api/goods-receipts");
      setReceipts(Array.isArray(data) ? data : (data?.receipts ?? []));
    } catch { /* silent */ }
    finally { setReceiptsLoading(false); }
  }, []);

  // 초기 로드
  useEffect(() => { reloadAllProductsMap(); }, [reloadAllProductsMap]);
  useEffect(() => { loadInvMap(); }, [loadInvMap]);
  useEffect(() => { loadOrderReqs(); loadProducts(); }, [loadOrderReqs, loadProducts]);
  useEffect(() => {
    const handler = () => { loadInvMap(); loadProducts(); loadOrderReqs(); };
    window.addEventListener("inventory-checks-updated", handler);
    return () => window.removeEventListener("inventory-checks-updated", handler);
  }, [loadInvMap, loadProducts, loadOrderReqs]);

  // invStockMap 파생 (창고/매장 합산)
  const invStockMap = new Map<string, InvStockEntry>();
  for (const [code, iv] of Object.entries(invMap)) {
    const wh = iv.warehouse; const st = iv.store;
    if (wh != null || st != null) {
      const total = (Number(wh) || 0) + (Number(st) || 0);
      invStockMap.set(code, { warehouse: wh, store: st, total, w1: iv.w1, w2: iv.w2, s1: iv.s1, s2: iv.s2, s3: iv.s3, s1z: iv.s1z, s2z: iv.s2z, s3z: iv.s3z });
    }
  }
  for (const p of products) {
    const code = getCode(p);
    if (!code || invStockMap.has(code)) continue;
    const wh = (p as any).warehouse_stock; const st = (p as any).store_stock;
    if (wh != null || st != null) {
      const total = (Number(wh) || 0) + (Number(st) || 0);
      invStockMap.set(code, { warehouse: wh, store: st, total, w1: wh, w2: null, s1: st, s2: null, s3: null, s1z: null, s2z: null, s3z: null });
    }
  }

  // zoneMap 파생 (real_map, spec)
  const zoneMap = new Map<string, { real_map: string | null; spec: string | null }>();
  for (const [code, p] of Object.entries(allProductsMap)) {
    const realMap = (p as any).real_map ?? (p as any).realMap ?? null;
    const spec    = (p as any).spec ?? null;
    if (realMap || spec) zoneMap.set(code, { real_map: realMap, spec });
  }
  for (const p of products) {
    const code = getCode(p);
    if (!code || zoneMap.has(code)) continue;
    const realMap = (p as any).real_map ?? null; const spec = (p as any).spec ?? null;
    if (realMap || spec) zoneMap.set(code, { real_map: realMap, spec });
  }

  return {
    // 발주요청
    orderReqs, setOrderReqs, orderLoading, orderError, prevPriceMap, loadOrderReqs,
    // 상품
    products, productsLoading, loadProducts,
    // 전체 상품맵
    allProductsMap, reloadAllProductsMap,
    // 실재고
    invStockMap, zoneMap, loadInvMap,
    // 거래명세서
    receipts, receiptsLoading, loadReceipts,
  };
}
