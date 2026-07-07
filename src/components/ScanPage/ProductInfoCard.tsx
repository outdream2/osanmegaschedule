import React, { useState, useEffect } from "react";
import { Pencil, Loader2, ArrowRight, AlertTriangle, ShoppingCart, CheckCircle2, Warehouse, Store, ClipboardCheck, ScanLine, Check, X, DollarSign, Package, Info, EyeOff, Eye } from "lucide-react";
import { type ProductInfo } from "../../lib/productsCache";
import { RealMapSelector } from "./RealMapSelector";
import { StockCounterModal } from "../StockCounterModal";

// 인라인 편집 가능 필드 종류
type InlineEditableKey = "optimal_stock" | "sale_price" | "purchase_price" | "cost_price" | "brand" | "manufacturer" | "barcode" | "expiry_date" | "memo";

// 섹션 표시 여부 (context별로 다르게)
interface ProductInfoSections {
  header?: boolean;         // 상품명 헤더
  zoneAssignment?: boolean; // 전산/실제 배정구역 카드
  stockStatus?: boolean;    // 현재고/적정재고 (인라인 편집 지원)
  actualStockInput?: boolean; // 창고/매장 실재고 입력
  orderRequest?: boolean;   // 발주요청 버튼
  financial?: boolean;      // 매입가/판매가/마진 (신규)
  productMeta?: boolean;    // 상품코드/공급처/판매상태/최근매입일
  extraInfo?: boolean;      // 브랜드·제조사·바코드·유효기간·메모 (신규 · 인라인 편집)
}

interface ProductInfoCardProps {
  product: ProductInfo;
  onRealMapUpdate: (newValue: string) => void;
  checkedBy?: string;
  /** 사용 컨텍스트 · 섹션 default 프리셋 자동 선택 */
  context?: "scan" | "stock-manage" | "order-manage";
  /** 섹션별 세밀 조정 (context default를 override) */
  sections?: ProductInfoSections;
  /** 인라인 편집 활성화 여부 (기본: stock-manage에서만 활성) */
  editable?: boolean;
  /** 상품 필드 업데이트 후 콜백 (부모 state 동기화용) */
  onProductUpdate?: (updates: Partial<ProductInfo>) => void;
}

// 컨텍스트별 default 섹션
const SECTION_PRESETS: Record<NonNullable<ProductInfoCardProps["context"]>, ProductInfoSections> = {
  scan: {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: true, productMeta: true, financial: false, extraInfo: false,
  },
  "stock-manage": {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: true, productMeta: true, financial: true, extraInfo: true,
  },
  "order-manage": {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: false, productMeta: true, financial: true, extraInfo: true,
  },
};

export const ProductInfoCard: React.FC<ProductInfoCardProps> = ({
  product,
  onRealMapUpdate,
  checkedBy,
  context = "scan",
  sections,
  editable,
  onProductUpdate,
}) => {
  // 섹션 병합 (context default + override)
  const S = { ...SECTION_PRESETS[context], ...(sections ?? {}) };
  const inlineEditEnabled = editable ?? context === "stock-manage";

  // 인라인 편집 상태
  const [editingKey, setEditingKey] = useState<InlineEditableKey | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
      const res = await fetch(`/api/products/${encodeURIComponent(product.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [editingKey]: editingValue }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setEditError(b.error ?? `서버 오류 (${res.status})`);
        setEditSaving(false);
        return;
      }
      // 부모 state 동기화
      const num = ["optimal_stock", "sale_price", "purchase_price", "cost_price"].includes(editingKey);
      onProductUpdate?.({ [editingKey]: num ? (editingValue === "" ? null : Number(editingValue)) : editingValue } as Partial<ProductInfo>);
      setEditingKey(null);
      setEditingValue("");
    } catch (e: any) {
      setEditError(e?.message ?? "네트워크 오류");
    } finally { setEditSaving(false); }
  };
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [stockCounterOpen, setStockCounterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 상품 숨김 토글 (검색·발주 리스트 노출 X)
  const [hideSaving, setHideSaving] = useState(false);
  const [hideError, setHideError] = useState<string | null>(null);
  const isHidden = product.hidden === true;
  const toggleHidden = async () => {
    if (hideSaving) return;
    const next = !isHidden;
    const confirmMsg = next
      ? `"${product.name}" 상품을 숨김 처리할까요?\n\n검색·발주 리스트에서 노출되지 않으며, 나중에 [숨김 항목 관리]에서 다시 표시할 수 있습니다.`
      : `"${product.name}" 상품의 숨김을 해제하고 다시 표시할까요?`;
    if (!window.confirm(confirmMsg)) return;
    setHideSaving(true); setHideError(null);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: next }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setHideError(b.error ?? `서버 오류 (${res.status})`);
        return;
      }
      onProductUpdate?.({ hidden: next } as Partial<ProductInfo>);
      // 하위 리스트들(적정재고 이하 · 재고흐름 · ERP 차이 등)이 refetch 하도록 이벤트 발행
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed", { detail: { code: product.code, hidden: next } })); } catch { /* ignore */ }
    } catch (e: any) {
      setHideError(e?.message ?? "네트워크 오류");
    } finally { setHideSaving(false); }
  };

  type OrderStatus = "idle" | "loading" | "done" | "error";
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");
  const [existingOrder, setExistingOrder] = useState<{ current_stock: number | null; requested_at: string } | null>(null);
  const [orderConfirm, setOrderConfirm] = useState(false);

  // 실재고 입력 (창고/매장 독립 저장)
  const [warehouseStock, setWarehouseStock] = useState<number | "">("");
  const [storeStock, setStoreStock] = useState<number | "">("");
  type InvStatus = "idle" | "loading" | "done" | "error";
  const [whStatus, setWhStatus] = useState<InvStatus>("idle");
  const [stStatus, setStStatus] = useState<InvStatus>("idle");
  const [whError, setWhError] = useState<string | null>(null);
  const [stError, setStError] = useState<string | null>(null);

  // 바코드 스캔 시 기존 실재고·발주요청 데이터 자동 로드
  useEffect(() => {
    setWarehouseStock("");
    setStoreStock("");
    setWhStatus("idle");
    setStStatus("idle");
    setWhError(null);
    setStError(null);
    setOrderStatus("idle");
    setExistingOrder(null);
    setOrderConfirm(false);

    if (!product.code) return;
    // 기존 실재고 데이터 로드
    fetch(`/api/inventory-checks?product_code=${encodeURIComponent(product.code)}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        const last = list[0];
        if (last) {
          if (last.warehouse_stock != null) setWarehouseStock(Number(last.warehouse_stock));
          if (last.store_stock != null) setStoreStock(Number(last.store_stock));
        }
      }).catch(() => {});
    // 기존 발주요청 로드
    fetch(`/api/order-requests?product_code=${encodeURIComponent(product.code)}`)
      .then(r => r.ok ? r.json() : [])
      .then((list: any[]) => {
        if (list[0]) setExistingOrder({ current_stock: list[0].current_stock, requested_at: list[0].requested_at });
      }).catch(() => {});
  }, [product.code]);

  // 창고/매장 각각 독립 저장: 다른 필드는 서버에서 기존값 유지
  const submitStockField = async (field: "warehouse_stock" | "store_stock", value: number | "") => {
    if (value === "") return;
    const setStatus = field === "warehouse_stock" ? setWhStatus : setStStatus;
    const setError  = field === "warehouse_stock" ? setWhError  : setStError;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code:    product.code,
          product_name:    product.name,
          [field]:         Number(value),
          system_stock:    product.current_stock != null ? Number(product.current_stock) : null,
          optimal_stock:   product.optimal_stock != null ? Number(product.optimal_stock) : null,
          checked_by:      checkedBy ?? "",
        }),
      });
      if (res.ok) {
        setStatus("done");
        // 재고 관련 리스트가 자동 갱신되도록 이벤트 발행
        window.dispatchEvent(new CustomEvent("inventory-checks-updated", {
          detail: { product_code: product.code, field, value: Number(value) },
        }));
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `서버 오류 (${res.status})`);
        setStatus("error");
      }
    } catch (e: any) {
      setError(e?.message ?? "네트워크 오류");
      setStatus("error");
    }
  };
  const handleWarehouseSubmit = () => submitStockField("warehouse_stock", warehouseStock);
  const handleStoreSubmit     = () => submitStockField("store_stock",     storeStock);

  const submitOrderRequest = async () => {
    setOrderStatus("loading");
    setOrderConfirm(false);
    try {
      const res = await fetch("/api/order-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: product.code,
          product_name: product.name,
          current_stock: product.current_stock != null ? Number(product.current_stock) : null,
          optimal_stock: product.optimal_stock != null ? Number(product.optimal_stock) : null,
          note: "",
        }),
      });
      if (res.ok) {
        setOrderStatus("done");
        setExistingOrder({ current_stock: product.current_stock != null ? Number(product.current_stock) : null, requested_at: new Date().toISOString() });
      } else {
        setOrderStatus("error");
      }
    } catch {
      setOrderStatus("error");
    }
  };

  const handleOrderRequest = () => {
    if (existingOrder) { setOrderConfirm(true); return; }
    submitOrderRequest();
  };

  const handleRealMapSelect = async (zoneLabel: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.code)}/realmap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ realMap: zoneLabel || null }),
      });
      if (res.ok) {
        onRealMapUpdate(zoneLabel);
        const specZone = product.spec || "미지정";
        const isMismatch = !!zoneLabel && zoneLabel !== specZone;
        if (isMismatch) {
          fetch("/api/zone-mismatches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              product_code: product.code,
              product_name: product.name,
              spec_zone: specZone,
              real_zone: zoneLabel,
            }),
          }).catch(() => {});
        } else {
          fetch(`/api/zone-mismatches/by-code/${encodeURIComponent(product.code)}`, {
            method: "DELETE",
          }).catch(() => {});
        }
      } else {
        const body = await res.json().catch(() => ({}));
        const msg: string = body?.error ?? `서버 오류 (${res.status})`;
        const isColMissing = /column|does not exist|schema cache/i.test(msg);
        setSaveError(isColMissing
          ? "DB에 realMap 컬럼이 없습니다. Supabase SQL Editor에서 실행:\nALTER TABLE products ADD COLUMN IF NOT EXISTS \"realMap\" TEXT;"
          : msg
        );
      }
    } catch {
      setSaveError("네트워크 오류 — 다시 시도해주세요");
    }
    setSaving(false);
  };

  const realMap: string | null = product.realMap ?? null;
  const specZone = product.spec || "미지정";
  const hasMismatch = !!realMap && realMap !== specZone;

  const cur = product.current_stock != null ? Number(product.current_stock) : null;
  const opt = product.optimal_stock != null ? Number(product.optimal_stock) : null;
  const isLow = cur != null && opt != null && cur < opt;

  // 인라인 편집 필드 렌더 헬퍼
  const InlineField = ({
    label,
    fieldKey,
    value,
    type = "text",
    format,
    accent = "slate",
  }: {
    label: string;
    fieldKey: InlineEditableKey;
    value: any;
    type?: "text" | "number" | "date";
    format?: (v: any) => string;
    accent?: "slate" | "emerald" | "indigo" | "amber";
  }) => {
    const isEditing = editingKey === fieldKey;
    const displayValue = value == null || value === "" ? "-" : format ? format(value) : String(value);
    const accentClass = {
      slate: "text-slate-800",
      emerald: "text-emerald-700",
      indigo: "text-indigo-700",
      amber: "text-amber-700",
    }[accent];

    return (
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-gray-400 mb-0.5">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type={type}
              value={editingValue}
              onChange={e => setEditingValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
              disabled={editSaving}
              autoFocus
              className="flex-1 min-w-0 text-sm font-semibold border-2 border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button onClick={commitEdit} disabled={editSaving} className="shrink-0 w-6 h-6 rounded bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
              {editSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button onClick={cancelEdit} disabled={editSaving} className="shrink-0 w-6 h-6 rounded bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 disabled:opacity-40 cursor-pointer">
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <p className={`text-sm font-semibold ${accentClass} truncate flex-1`}>{displayValue}</p>
            {inlineEditEnabled && (
              <button
                onClick={() => startEdit(fieldKey, value)}
                className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
                title={`${label} 편집`}
              >
                <Pencil size={10} />
              </button>
            )}
          </div>
        )}
        {isEditing && editError && (
          <p className="text-[10px] text-red-500 mt-0.5">{editError}</p>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        {/* 상품명 */}
        {S.header && (<>
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">상품 정보</p>
            <button
              type="button"
              onClick={toggleHidden}
              disabled={hideSaving}
              title={isHidden ? "숨김 해제 · 검색·발주 리스트에 다시 표시" : "이 상품 숨김 · 검색·발주 리스트에서 제외"}
              className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg border transition cursor-pointer ${
                isHidden
                  ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-700"
              } ${hideSaving ? "opacity-60 cursor-wait" : ""}`}
            >
              {hideSaving ? <Loader2 size={11} className="animate-spin" /> : (isHidden ? <Eye size={11} /> : <EyeOff size={11} />)}
              {isHidden ? "숨김 해제" : "숨기기"}
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-lg font-black text-gray-900 leading-tight">{product.name}</p>
            {isHidden && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 whitespace-nowrap">
                숨김
              </span>
            )}
          </div>
          {hideError && <p className="text-[10px] text-rose-600 mb-2 -mt-2">{hideError}</p>}
        </>)}

        {/* ── 배정 구역: 전산 카드 | 실제 카드 나란히 ── */}
        {S.zoneAssignment && (<>
        <div className="flex gap-2 mb-3">
          {/* 전산 배정구역 카드 */}
          <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">전산 배정구역</p>
            <p className="text-sm font-black text-gray-800 leading-tight">{specZone}</p>
          </div>

          {/* 화살표 */}
          <div className="flex items-center shrink-0">
            <ArrowRight size={16} className={hasMismatch ? "text-orange-400" : "text-gray-300"} />
          </div>

          {/* 실제 배정구역 카드 */}
          <div className={`flex-1 rounded-xl border px-3 py-3 ${
            hasMismatch
              ? "bg-orange-50 border-orange-300"
              : realMap
              ? "bg-teal-50 border-teal-300"
              : "bg-white border-dashed border-gray-300"
          }`}>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className={`text-[9px] font-bold uppercase tracking-wide mb-1.5 ${
                  hasMismatch ? "text-orange-500" : realMap ? "text-teal-600" : "text-gray-400"
                }`}>실제 배정구역</p>
                {realMap ? (
                  <p className={`text-sm font-black leading-tight ${hasMismatch ? "text-red-500" : "text-teal-700"}`}>
                    {realMap}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">미등록</p>
                )}
              </div>
              <button
                onClick={() => setMapSelectorOpen(true)}
                disabled={saving}
                className={`shrink-0 flex items-center gap-0.5 px-2 py-1 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                  realMap
                    ? "bg-white border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600"
                    : "bg-teal-500 border-teal-600 text-white hover:bg-teal-600"
                }`}
              >
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Pencil size={10} />}
                {saving ? "" : realMap ? "변경" : "등록"}
              </button>
            </div>
          </div>
        </div>

        </>)}
        {/* 불일치 경고 / 저장 오류 */}
        {S.zoneAssignment && (hasMismatch || saveError) && (
          <div className="flex flex-col gap-1 mb-3">
            {hasMismatch && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
                <AlertTriangle size={11} className="text-orange-500 shrink-0" />
                <p className="text-[10px] font-bold text-orange-600">전산 배정구역과 실제 위치가 다릅니다</p>
              </div>
            )}
            {saveError && (
              <div className="flex items-start gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-red-600 whitespace-pre-wrap">{saveError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── 재고 현황 섹션 (적정재고 인라인 편집 가능) ── */}
        {S.stockStatus && (
        <div className={`rounded-xl border px-4 py-3 mb-4 ${
          isLow ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
        }`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">재고 현황</p>
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[10px] font-bold text-gray-500 mb-0.5">현재고 (ERP)</p>
              <p className={`text-xl font-black leading-none ${isLow ? "text-red-500" : "text-gray-800"}`}>
                {cur ?? "-"}
              </p>
            </div>
            <div className={`h-10 w-px ${isLow ? "bg-red-200" : "bg-amber-200"}`} />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-amber-600 mb-0.5 flex items-center gap-1">
                적정재고 {inlineEditEnabled && <span className="text-[8px] text-amber-400">(클릭 편집)</span>}
              </p>
              {editingKey === "optimal_stock" ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0}
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    disabled={editSaving}
                    autoFocus
                    className="w-20 text-2xl font-black border-2 border-amber-500 rounded px-1.5 py-0.5 focus:outline-none"
                  />
                  <button onClick={commitEdit} disabled={editSaving} className="shrink-0 w-7 h-7 rounded bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
                    {editSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button onClick={cancelEdit} disabled={editSaving} className="shrink-0 w-7 h-7 rounded bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 disabled:opacity-40 cursor-pointer">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => inlineEditEnabled && startEdit("optimal_stock", opt)}
                  disabled={!inlineEditEnabled}
                  className={`text-xl font-black leading-none text-amber-700 ${inlineEditEnabled ? "hover:bg-amber-100 rounded px-1 -mx-1 cursor-pointer transition" : "cursor-default"}`}
                >
                  {opt ?? "-"}
                </button>
              )}
              {editingKey === "optimal_stock" && editError && (
                <p className="text-[10px] text-red-500 mt-0.5">{editError}</p>
              )}
            </div>
          </div>
          {isLow && (
            <div className="flex items-center gap-1 mt-2">
              <AlertTriangle size={11} className="text-red-500 shrink-0" />
              <p className="text-[10px] font-bold text-red-600">재고 부족 — 보충이 필요합니다</p>
            </div>
          )}
        </div>
        )}

        {/* ── 실재고 입력 (창고 / 매장 — 각각 독립 저장) ── */}
        {S.actualStockInput && (() => {
          const hasInput = warehouseStock !== "" || storeStock !== "";
          const totalActual = Number(warehouseStock || 0) + Number(storeStock || 0);
          const diff = hasInput && cur != null ? totalActual - cur : null;
          return (
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">실재고 입력 <span className="text-purple-400">(창고·매장 독립 저장)</span></p>
                <button
                  onClick={() => setStockCounterOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white text-[10px] font-bold rounded-lg transition cursor-pointer shadow-sm"
                >
                  <ScanLine size={11} />
                  재고 세기
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                {/* 창고 */}
                <div className="bg-white rounded-xl border border-cyan-200 p-2.5">
                  <p className="text-[10px] font-bold text-cyan-600 mb-1 flex items-center gap-1"><Warehouse size={10} />창고</p>
                  <input
                    type="number" min="0"
                    value={warehouseStock}
                    onChange={e => { setWarehouseStock(e.target.value === "" ? "" : Number(e.target.value)); setWhStatus("idle"); }}
                    className="w-full text-base font-black text-center bg-cyan-50/50 border border-cyan-200 rounded-lg px-2 py-1 outline-none focus:border-cyan-400 transition"
                    placeholder="—"
                  />
                  {whStatus === "done" ? (
                    <div className="mt-1.5 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                      <CheckCircle2 size={11} /> 창고 저장됨
                    </div>
                  ) : (
                    <button
                      onClick={handleWarehouseSubmit}
                      disabled={whStatus === "loading" || warehouseStock === ""}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer disabled:opacity-40 shadow-sm bg-cyan-500 hover:bg-cyan-600 text-white"
                    >
                      {whStatus === "loading" ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                      {whStatus === "loading" ? "저장 중..." : whStatus === "error" ? "재시도" : "창고 저장"}
                    </button>
                  )}
                  {whStatus === "error" && whError && (
                    <p className="text-[10px] text-red-500 text-center mt-0.5">{whError}</p>
                  )}
                </div>

                {/* 매장 */}
                <div className="bg-white rounded-xl border border-violet-200 p-2.5">
                  <p className="text-[10px] font-bold text-violet-600 mb-1 flex items-center gap-1"><Store size={10} />매장</p>
                  <input
                    type="number" min="0"
                    value={storeStock}
                    onChange={e => { setStoreStock(e.target.value === "" ? "" : Number(e.target.value)); setStStatus("idle"); }}
                    className="w-full text-base font-black text-center bg-violet-50/50 border border-violet-200 rounded-lg px-2 py-1 outline-none focus:border-violet-400 transition"
                    placeholder="—"
                  />
                  {stStatus === "done" ? (
                    <div className="mt-1.5 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                      <CheckCircle2 size={11} /> 매장 저장됨
                    </div>
                  ) : (
                    <button
                      onClick={handleStoreSubmit}
                      disabled={stStatus === "loading" || storeStock === ""}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer disabled:opacity-40 shadow-sm bg-violet-500 hover:bg-violet-600 text-white"
                    >
                      {stStatus === "loading" ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                      {stStatus === "loading" ? "저장 중..." : stStatus === "error" ? "재시도" : "매장 저장"}
                    </button>
                  )}
                  {stStatus === "error" && stError && (
                    <p className="text-[10px] text-red-500 text-center mt-0.5">{stError}</p>
                  )}
                </div>
              </div>

              {hasInput && (
                <div className="flex items-center justify-between text-[11px] font-bold px-1">
                  <span className="text-purple-700">합계: {totalActual}개</span>
                  {diff != null && (
                    <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-gray-500"}>
                      현재고 대비 {diff > 0 ? "+" : ""}{diff}개
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── 매입가/판매가/마진 (신규) ── */}
        {S.financial && (() => {
          const sp = product.sale_price != null ? Number(product.sale_price) : null;
          const pp = product.purchase_price != null ? Number(product.purchase_price) : null;
          const margin = sp != null && pp != null && sp > 0 ? ((sp - pp) / sp * 100).toFixed(1) : null;
          const stockAsset = pp != null && cur != null ? (pp * cur).toLocaleString() + "원" : null;
          return (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 py-3 mb-4">
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <DollarSign size={11}/>매입 · 판매가
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <InlineField label="매입가" fieldKey="purchase_price" value={pp} type="number" accent="emerald" format={v => Number(v).toLocaleString() + "원"} />
                <InlineField label="판매가" fieldKey="sale_price" value={sp} type="number" accent="indigo" format={v => Number(v).toLocaleString() + "원"} />
                {margin != null && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">마진율</p>
                    <p className="text-sm font-semibold text-emerald-700">{margin}%</p>
                  </div>
                )}
                {stockAsset && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 mb-0.5">재고 자산</p>
                    <p className="text-sm font-semibold text-slate-800">{stockAsset}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── 발주요청 버튼 ── */}
        {S.orderRequest && (
        <div className="mb-4">
          {existingOrder && orderStatus !== "done" && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-orange-50 border border-orange-200 rounded-xl text-[11px] text-orange-700 font-bold">
              <ShoppingCart size={11} className="shrink-0" />
              <span>기존 발주요청 있음 — 현재고 {existingOrder.current_stock ?? "—"} ({new Date(existingOrder.requested_at).toLocaleDateString("ko-KR")} 요청)</span>
            </div>
          )}
          {orderConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-600 font-bold flex-1">기존 요청을 덮어쓸까요?</span>
              <button onClick={submitOrderRequest} className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition cursor-pointer">덮어쓰기</button>
              <button onClick={() => setOrderConfirm(false)} className="text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition cursor-pointer">취소</button>
            </div>
          ) : orderStatus === "done" ? (
            <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold">
              <CheckCircle2 size={15} />
              발주 요청이 등록되었습니다
            </div>
          ) : (
            <button
              onClick={handleOrderRequest}
              disabled={orderStatus === "loading"}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-60 ${
                isLow
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-200"
                  : "bg-white border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 text-gray-600"
              }`}
            >
              {orderStatus === "loading"
                ? <Loader2 size={15} className="animate-spin" />
                : <ShoppingCart size={15} />}
              {orderStatus === "loading" ? "요청 중..." : orderStatus === "error" ? "재시도" : existingOrder ? "발주요청 리스트 업데이트" : "발주요청 리스트에 추가"}
            </button>
          )}
          {orderStatus === "error" && (
            <p className="text-[10px] text-red-500 text-center mt-1">요청 실패 — 다시 시도해주세요</p>
          )}
        </div>
        )}

        {/* ── 기타 정보 그리드 (상품코드·공급처·판매상태·최근매입일) ── */}
        {S.productMeta && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
          {([
            ["상품코드", product.code, "font-mono text-xs"],
            ["공급처", product.supplier ?? "-", ""],
            ["판매상태", product.sale_status ?? "-", ""],
            ["최근매입일", product.last_purchase_date ?? "-", ""],
          ] as [string, string, string][]).map(([label, value, extra]) => (
            <div key={label}>
              <p className="text-[10px] font-bold text-gray-400 mb-0.5">{label}</p>
              <p className={`text-sm font-semibold text-gray-800 truncate ${extra}`}>{value}</p>
            </div>
          ))}
        </div>
        )}

        {/* ── 추가 상품 정보 (신규 · 브랜드·제조사·바코드·유효기간·메모 · 인라인 편집) ── */}
        {S.extraInfo && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/40 px-4 py-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Info size={11}/>추가 상품 정보
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <InlineField label="브랜드" fieldKey="brand" value={(product as any).brand} />
            <InlineField label="제조사" fieldKey="manufacturer" value={(product as any).manufacturer} />
            <InlineField label="바코드" fieldKey="barcode" value={(product as any).barcode} />
            <InlineField label="유효기간" fieldKey="expiry_date" value={(product as any).expiry_date} type="date" />
          </div>
          <div className="mt-3">
            <p className="text-[10px] font-bold text-gray-400 mb-0.5">메모</p>
            {editingKey === "memo" ? (
              <div className="flex flex-col gap-1">
                <textarea
                  value={editingValue}
                  onChange={e => setEditingValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }}
                  disabled={editSaving}
                  autoFocus
                  rows={2}
                  className="w-full text-sm border-2 border-indigo-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                />
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={commitEdit} disabled={editSaving} className="text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                    {editSaving ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>}저장
                  </button>
                  <button onClick={cancelEdit} disabled={editSaving} className="text-[11px] font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                    <X size={11}/>취소
                  </button>
                </div>
                {editError && <p className="text-[10px] text-red-500">{editError}</p>}
              </div>
            ) : (
              <div className="flex items-start gap-1 group">
                <p className={`text-sm text-slate-700 flex-1 whitespace-pre-wrap ${!(product as any).memo ? "text-slate-300 italic" : ""}`}>
                  {(product as any).memo || "(메모 없음)"}
                </p>
                {inlineEditEnabled && (
                  <button
                    onClick={() => startEdit("memo", (product as any).memo)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
                    title="메모 편집"
                  >
                    <Pencil size={10}/>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>

      {mapSelectorOpen && (
        <RealMapSelector
          current={realMap}
          onSelect={handleRealMapSelect}
          onClose={() => setMapSelectorOpen(false)}
        />
      )}
      {stockCounterOpen && (
        <StockCounterModal
          onApplyWarehouse={count => { setWarehouseStock(count); setWhStatus("idle"); setStockCounterOpen(false); }}
          onApplyStore={count => { setStoreStock(count); setStStatus("idle"); setStockCounterOpen(false); }}
          onClose={() => setStockCounterOpen(false)}
        />
      )}
    </>
  );
};
