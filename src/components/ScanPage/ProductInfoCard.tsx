// ProductInfoCard.tsx — layout shell
// 2026-08-29 · 서브컴포넌트 분리 · sections → 별도 파일
// 2026-08-17 · apiClient 마이그레이션

import React, { useState, useEffect } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { useConfirm } from "../../hooks/useConfirm";
import { Card } from "../common/Card";
import { type ProductInfo } from "../../lib/productsCache";
import { RealMapSelector } from "./RealMapSelector";
import { PurchaseHistorySection } from "./PurchaseHistorySection";
import { resolveWarehouseVisibility, assignZonesToSlots } from "../../lib/warehouseZoneMap";
import { ProductBasicInfoPanel } from "../common/ProductBasicInfoPanel";

import {
  SECTION_PRESETS,
  type InlineEditableKey,
  type ProductInfoCardProps,
} from "./ProductInfoCard.types";

// 서브컴포넌트
import { ProductInfoHeader } from "./ProductInfoCard.header";
import { ProductInfoZone } from "./ProductInfoCard.zone";
import { ProductInfoStock } from "./ProductInfoCard.stock";
import { ProductInfoFinancial } from "./ProductInfoCard.financial";
import { ProductInfoOrder } from "./ProductInfoCard.order";
import { ProductInfoMeta } from "./ProductInfoCard.meta";

export const ProductInfoCard: React.FC<ProductInfoCardProps> = ({
  product,
  onRealMapUpdate,
  checkedBy,
  context = "scan",
  sections,
  editable,
  onProductUpdate,
}) => {
  const confirm = useConfirm();

  const S = { ...SECTION_PRESETS[context], ...(sections ?? {}) };
  const inlineEditEnabled = editable ?? context === "stock-manage";

  // ── 인라인 편집 상태 ──
  const [editingKey, setEditingKey] = useState<InlineEditableKey | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [stockSectionCollapsed, setStockSectionCollapsed] = useState(false);

  const startEdit = (k: InlineEditableKey, v: any) => {
    if (!inlineEditEnabled) return;
    setEditingKey(k);
    setEditingValue(v == null ? "" : String(v));
    setEditError(null);
  };
  const cancelEdit = () => { setEditingKey(null); setEditingValue(""); setEditError(null); };
  const commitEdit = async () => {
    if (!editingKey) return;
    setEditSaving(true); setEditError(null);
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.code)}`, { [editingKey]: editingValue });
      const num = ["optimal_stock", "sale_price", "purchase_price"].includes(editingKey);
      onProductUpdate?.({ [editingKey]: num ? (editingValue === "" ? null : Number(editingValue)) : editingValue } as Partial<ProductInfo>);
      setEditingKey(null);
      setEditingValue("");
    } catch (e: any) {
      setEditError(e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류"));
    } finally { setEditSaving(false); }
  };

  // ── 구역 저장 상태 ──
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── 숨김 토글 상태 ──
  const [hideSaving, setHideSaving] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const isHidden = product.hidden === true;
  const toggleHidden = async () => {
    if (hideSaving) return;
    const next = !isHidden;
    const confirmMsg = next
      ? `"${product.name}" 상품을 숨김 처리할까요?\n\n검색·발주 리스트에서 노출되지 않으며, 나중에 [숨김 항목 관리]에서 다시 표시할 수 있습니다.`
      : `"${product.name}" 상품의 숨김을 해제하고 다시 표시할까요?`;
    if (!await confirm({ message: confirmMsg, danger: next })) return;
    setHideSaving(true); setHideError(null);
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.code)}`, { hidden: next });
      onProductUpdate?.({ hidden: next } as Partial<ProductInfo>);
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed", { detail: { code: product.code, hidden: next } })); } catch { /* ignore */ }
    } catch (e: any) {
      setHideError(e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류"));
    } finally { setHideSaving(false); }
  };

  // ── 발주요청 상태 ──
  type OrderStatus = "idle" | "loading" | "done" | "error";
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");
  const [existingOrder, setExistingOrder] = useState<{ current_stock: number | null; requested_at: string } | null>(null);
  const [orderConfirm, setOrderConfirm] = useState(false);

  // ── 실재고 입력 상태 (5슬롯) ──
  const [warehouse1Stock, setWarehouse1Stock] = useState<number | "">("");
  const [warehouse2Stock, setWarehouse2Stock] = useState<number | "">("");
  const [store1Stock, setStore1Stock] = useState<number | "">("");
  const [store2Stock, setStore2Stock] = useState<number | "">("");
  const [store3Stock, setStore3Stock] = useState<number | "">("");
  type InvStatus = "idle" | "loading" | "done" | "error";
  const [w1Status, setW1Status] = useState<InvStatus>("idle");
  const [w2Status, setW2Status] = useState<InvStatus>("idle");
  const [s1Status, setS1Status] = useState<InvStatus>("idle");
  const [s2Status, setS2Status] = useState<InvStatus>("idle");
  const [s3Status, setS3Status] = useState<InvStatus>("idle");
  const [w1Error, setW1Error] = useState<string | null>(null);
  const [w2Error, setW2Error] = useState<string | null>(null);
  const [s1Error, setS1Error] = useState<string | null>(null);
  const [s2Error, setS2Error] = useState<string | null>(null);
  const [s3Error, setS3Error] = useState<string | null>(null);

  // 바코드 스캔 시 기존 데이터 자동 로드
  useEffect(() => {
    setWarehouse1Stock(""); setWarehouse2Stock("");
    setStore1Stock(""); setStore2Stock(""); setStore3Stock("");
    setW1Status("idle"); setW2Status("idle");
    setS1Status("idle"); setS2Status("idle"); setS3Status("idle");
    setW1Error(null); setW2Error(null);
    setS1Error(null); setS2Error(null); setS3Error(null);
    setOrderStatus("idle"); setExistingOrder(null); setOrderConfirm(false);

    if (!product.code) return;
    api.get<any[]>(`/api/inventory-checks?product_code=${encodeURIComponent(product.code)}`)
      .then(({ data }) => {
        const last = (Array.isArray(data) ? data : [])[0];
        if (!last) return;
        if (last.warehouse1_stock != null) setWarehouse1Stock(Number(last.warehouse1_stock));
        else if (last.warehouse_stock != null) setWarehouse1Stock(Number(last.warehouse_stock));
        if (last.warehouse2_stock != null) setWarehouse2Stock(Number(last.warehouse2_stock));
        if (last.store_stock != null) setStore1Stock(Number(last.store_stock));
        if (last.store_stock_2 != null) setStore2Stock(Number(last.store_stock_2));
        if (last.store3_stock != null) setStore3Stock(Number(last.store3_stock));
      }).catch(() => {});
    api.get<any[]>(`/api/order-requests?product_code=${encodeURIComponent(product.code)}`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        if (list[0]) setExistingOrder({ current_stock: list[0].current_stock, requested_at: list[0].requested_at });
      }).catch(() => {});
  }, [product.code]);

  // 각 재고 슬롯 독립 저장
  type StockField = "warehouse1_stock" | "warehouse2_stock" | "store_stock" | "store_stock_2" | "store3_stock";
  const statusSetters: Record<StockField, React.Dispatch<React.SetStateAction<InvStatus>>> = {
    warehouse1_stock: setW1Status, warehouse2_stock: setW2Status,
    store_stock: setS1Status, store_stock_2: setS2Status, store3_stock: setS3Status,
  };
  const errorSetters: Record<StockField, React.Dispatch<React.SetStateAction<string | null>>> = {
    warehouse1_stock: setW1Error, warehouse2_stock: setW2Error,
    store_stock: setS1Error, store_stock_2: setS2Error, store3_stock: setS3Error,
  };
  const submitStockField = async (field: StockField, value: number | "") => {
    if (value === "") return;
    statusSetters[field]("loading"); errorSetters[field](null);
    try {
      await api.post("/api/inventory-checks", {
        product_code: product.code, product_name: product.name,
        [field]: Number(value),
        system_stock: product.current_stock != null ? Number(product.current_stock) : null,
        optimal_stock: product.optimal_stock != null ? Number(product.optimal_stock) : null,
        checked_by: checkedBy ?? "",
      });
      statusSetters[field]("done");
      window.dispatchEvent(new CustomEvent("inventory-checks-updated", {
        detail: { product_code: product.code, field, value: Number(value) },
      }));
    } catch (e: any) {
      errorSetters[field](e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류"));
      statusSetters[field]("error");
    }
  };

  const submitOrderRequest = async () => {
    setOrderStatus("loading"); setOrderConfirm(false);
    try {
      await api.post("/api/order-requests", {
        product_code: product.code, product_name: product.name,
        current_stock: product.current_stock != null ? Number(product.current_stock) : null,
        optimal_stock: product.optimal_stock != null ? Number(product.optimal_stock) : null,
        note: "",
      });
      dispatchApprovalChange("order");
      setOrderStatus("done");
      setExistingOrder({ current_stock: product.current_stock != null ? Number(product.current_stock) : null, requested_at: new Date().toISOString() });
    } catch {
      setOrderStatus("error");
    }
  };

  const handleRealMapSelect = async (zoneLabel: string) => {
    setSaving(true); setSaveError(null);
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.code)}/realmap`, { realMap: zoneLabel || null });
      onRealMapUpdate(zoneLabel);
      const locationZone = (product as any).location || (product as any).display_location || "미지정";
      const isMismatch = !!zoneLabel && zoneLabel !== locationZone;
      if (isMismatch) {
        api.post("/api/zone-mismatches", {
          product_code: product.code, product_name: product.name,
          spec_zone: locationZone, real_zone: zoneLabel,
        }).then(() => dispatchApprovalChange("mismatch")).catch(() => {});
      } else {
        api.del(`/api/zone-mismatches/by-code/${encodeURIComponent(product.code)}`)
          .then(() => dispatchApprovalChange("mismatch")).catch(() => {});
      }
    } catch (e: any) {
      const msg: string = e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류");
      const isColMissing = /column|does not exist|schema cache/i.test(msg);
      setSaveError(isColMissing
        ? "DB에 realMap 컬럼이 없습니다. Supabase SQL Editor에서 실행:\nALTER TABLE products ADD COLUMN IF NOT EXISTS \"realMap\" TEXT;"
        : msg === "네트워크 오류" ? "네트워크 오류 — 다시 시도해주세요" : msg
      );
    }
    setSaving(false);
  };

  // ── 파생 값 ──
  const realMap: string | null = product.realMap ?? null;
  const locationZone = (product as any).location || (product as any).display_location || "미지정";
  const hasMismatch = !!realMap && realMap !== locationZone;
  const productZoneSrc = String(realMap ?? (product as any).location ?? (product as any).real_map ?? "");
  const { showW1, showW2 } = resolveWarehouseVisibility(productZoneSrc);
  const cur = product.current_stock != null ? Number(product.current_stock) : null;
  const opt = product.optimal_stock != null ? Number(product.optimal_stock) : null;
  const isLow = cur != null && opt != null && cur < opt;

  const catCode = (product as any).category_code ?? null;
  const slotZones = assignZonesToSlots(String(product.real_map ?? ""), catCode);
  const storeZones = [slotZones.s1zone, slotZones.s2zone, slotZones.s3zone].filter(Boolean) as string[];

  // 인라인 편집 공통 props
  const editProps = {
    editingKey, editingValue, editSaving, editError, inlineEditEnabled,
    onEditStart: startEdit, onEditChange: setEditingValue, onCommit: commitEdit, onCancel: cancelEdit,
  };

  // BasicInfoPanel (scan · order-manage)
  const showBasicPanel = context !== "stock-manage";
  const handleBasicLocationChange = async (newLocation: string | null) => {
    await api.patch(`/api/products/${encodeURIComponent(product.code)}`, {
      location: newLocation, display_location: newLocation,
    });
    onProductUpdate?.({ location: newLocation, display_location: newLocation } as unknown as Partial<ProductInfo>);
    onRealMapUpdate(String(newLocation ?? ""));
  };
  const handleBasicSaleStatusChange = async (newStatus: string) => {
    await api.patch(`/api/products/${encodeURIComponent(product.code)}`, { sale_status: newStatus });
    onProductUpdate?.({ sale_status: newStatus } as unknown as Partial<ProductInfo>);
  };

  return (
    <>
      {showBasicPanel && (
        <div className="mb-3">
          <ProductBasicInfoPanel
            product={{
              product_code: product.code,
              category_code: (product as any).category_code,
              category: (product as any).category,
              product_name: product.name,
              supplier: product.supplier ?? null,
              location: (product as any).location ?? (product as any).display_location,
              display_location: (product as any).display_location,
              sale_status: (product as any).sale_status,
              current_stock: (product as any).current_stock,
              warehouse_stock: (product as any).warehouse_stock,
              store_stock: (product as any).store_stock,
              purchase_price: (product as any).purchase_price,
              sale_price: (product as any).sale_price,
              profit_rate: (product as any).profit_rate,
              optimal_stock: (product as any).optimal_stock,
              last_purchase_date: (product as any).last_purchase_date,
            }}
            editable={inlineEditEnabled}
            onLocationChange={handleBasicLocationChange}
            onSaleStatusChange={handleBasicSaleStatusChange}
            compact
          />
        </div>
      )}

      <Card padding="none" topAccent className="p-3.5">
        {S.header && (
          <ProductInfoHeader
            product={product}
            hideSaving={hideSaving}
            hideError={hideError}
            isHidden={isHidden}
            onToggleHidden={toggleHidden}
          />
        )}

        {S.zoneAssignment && (
          <ProductInfoZone
            locationZone={locationZone}
            realMap={realMap}
            hasMismatch={hasMismatch}
            saving={saving}
            saveError={saveError}
            onOpenSelector={() => setMapSelectorOpen(true)}
          />
        )}

        {(S.stockStatus || S.actualStockInput) && (
          <ProductInfoStock
            isLow={isLow} cur={cur} opt={opt}
            collapsed={stockSectionCollapsed}
            onToggleCollapse={() => setStockSectionCollapsed(c => !c)}
            showActualInput={!!S.actualStockInput}
            showW1={showW1} showW2={showW2}
            zoneW1={slotZones.w1zone ?? ""} zoneW2={slotZones.w2zone ?? ""}
            zoneS1={slotZones.s1zone ?? ""} zoneS2={slotZones.s2zone ?? ""} zoneS3={slotZones.s3zone ?? ""}
            storeZones={storeZones}
            warehouse1Stock={warehouse1Stock} warehouse2Stock={warehouse2Stock}
            store1Stock={store1Stock} store2Stock={store2Stock} store3Stock={store3Stock}
            w1Status={w1Status} w2Status={w2Status}
            s1Status={s1Status} s2Status={s2Status} s3Status={s3Status}
            w1Error={w1Error} w2Error={w2Error}
            s1Error={s1Error} s2Error={s2Error} s3Error={s3Error}
            onW1Change={v => { setWarehouse1Stock(v); setW1Status("idle"); }}
            onW2Change={v => { setWarehouse2Stock(v); setW2Status("idle"); }}
            onS1Change={v => { setStore1Stock(v); setS1Status("idle"); }}
            onS2Change={v => { setStore2Stock(v); setS2Status("idle"); }}
            onS3Change={v => { setStore3Stock(v); setS3Status("idle"); }}
            onW1Submit={() => submitStockField("warehouse1_stock", warehouse1Stock)}
            onW2Submit={() => submitStockField("warehouse2_stock", warehouse2Stock)}
            onS1Submit={() => submitStockField("store_stock", store1Stock)}
            onS2Submit={() => submitStockField("store_stock_2", store2Stock)}
            onS3Submit={() => submitStockField("store3_stock", store3Stock)}
            {...editProps}
          />
        )}

        {S.financial && (
          <ProductInfoFinancial
            salePrice={product.sale_price != null ? Number(product.sale_price) : null}
            purchasePrice={product.purchase_price != null ? Number(product.purchase_price) : null}
            currentStock={cur}
            {...editProps}
          />
        )}

        {S.orderRequest && (
          <ProductInfoOrder
            isLow={isLow}
            orderStatus={orderStatus}
            orderConfirm={orderConfirm}
            existingOrder={existingOrder}
            onOrderRequest={() => { if (existingOrder) { setOrderConfirm(true); return; } submitOrderRequest(); }}
            onSubmitOrder={submitOrderRequest}
            onCancelConfirm={() => setOrderConfirm(false)}
          />
        )}

        {(S.productMeta || S.extraInfo) && (
          <ProductInfoMeta
            product={product}
            showMeta={!!S.productMeta}
            showExtra={!!S.extraInfo}
            {...editProps}
          />
        )}
      </Card>

      {S.purchaseHistory && <PurchaseHistorySection productCode={product.code} productName={product.name} />}

      {mapSelectorOpen && (
        <RealMapSelector
          current={realMap}
          onSelect={handleRealMapSelect}
          onClose={() => setMapSelectorOpen(false)}
        />
      )}
    </>
  );
};

// 2026-08-21 · Framework Phase 4 · PurchaseHistorySection 재export
export { PurchaseHistorySection } from "./PurchaseHistorySection";
