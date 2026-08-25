// 2026-08-17 · apiClient 마이그레이션
import React, { useState, useEffect } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { useConfirm } from "../../hooks/useConfirm";
import { Pencil, ArrowRight, AlertTriangle, ShoppingCart, CheckCircle2, ScanLine, Check, X, DollarSign, Package, Info, EyeOff, Eye, TrendingUp, ChevronRight, ChevronDown } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { type ProductInfo } from "../../lib/productsCache";
import { RealMapSelector } from "./RealMapSelector";
// 2026-08-05 · 재고세기(YOLO) 기능 제거 · StockCounterModal import 삭제
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { fmtWonCompact } from "../../lib/format";
// 2026-08-21 · Framework Phase 4 · large-file 분리
import { PurchaseHistorySection } from "./PurchaseHistorySection";
// 2026-08-22 · Framework Phase 4 · 5-slot 반복 → StockSlotCard 프리미티브
import { StockSlotCard } from "./StockSlotCard";

// 인라인 편집 가능 필드 종류
type InlineEditableKey = "optimal_stock" | "sale_price" | "purchase_price" | "cost_price" | "brand" | "manufacturer" | "barcode" | "expiry_date" | "memo";

// 섹션 표시 여부 (context별로 다르게)
interface ProductInfoSections {
  header?: boolean;         // 상품명 헤더
  zoneAssignment?: boolean; // 전산/실제배치구역 카드
  stockStatus?: boolean;    // 현재고/적정재고 (인라인 편집 지원)
  actualStockInput?: boolean; // 창고/매장 실재고 입력
  orderRequest?: boolean;   // 발주요청 버튼
  financial?: boolean;      // 매입가/판매가/마진 (신규)
  productMeta?: boolean;    // 상품코드/공급처/판매상태/최근매입일
  extraInfo?: boolean;      // 브랜드·제조사·바코드·유효기간·메모 (신규 · 인라인 편집)
  purchaseHistory?: boolean; // 매입 이력 (접기/펼치기) · 2026-07-16 · 위치 조정용 flag
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
    purchaseHistory: true,
  },
  "stock-manage": {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: true, productMeta: true, financial: true, extraInfo: true,
    purchaseHistory: true,
  },
  "order-manage": {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: false, productMeta: true, financial: true, extraInfo: true,
    purchaseHistory: true,
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
  const confirm = useConfirm();

  // 섹션 병합 (context default + override)
  const S = { ...SECTION_PRESETS[context], ...(sections ?? {}) };
  const inlineEditEnabled = editable ?? context === "stock-manage";

  // 인라인 편집 상태
  const [editingKey, setEditingKey] = useState<InlineEditableKey | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // 2026-07-16 · 재고 현황 섹션 접기/펼치기 (사용자 요청)
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
      // 부모 state 동기화
      const num = ["optimal_stock", "sale_price", "purchase_price", "cost_price"].includes(editingKey);
      onProductUpdate?.({ [editingKey]: num ? (editingValue === "" ? null : Number(editingValue)) : editingValue } as Partial<ProductInfo>);
      setEditingKey(null);
      setEditingValue("");
    } catch (e: any) {
      setEditError(e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류"));
    } finally { setEditSaving(false); }
  };
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  // 2026-08-05 · 재고세기 기능 제거 · stockCounterOpen state 삭제
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
    if (!await confirm({ message: confirmMsg, danger: next })) return;
    setHideSaving(true); setHideError(null);
    try {
      await api.patch(`/api/products/${encodeURIComponent(product.code)}`, { hidden: next });
      onProductUpdate?.({ hidden: next } as Partial<ProductInfo>);
      // 하위 리스트들(적정재고 이하 · 재고흐름 · ERP 차이 등)이 refetch 하도록 이벤트 발행
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed", { detail: { code: product.code, hidden: next } })); } catch { /* ignore */ }
    } catch (e: any) {
      setHideError(e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류"));
    } finally { setHideSaving(false); }
  };

  type OrderStatus = "idle" | "loading" | "done" | "error";
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");
  const [existingOrder, setExistingOrder] = useState<{ current_stock: number | null; requested_at: string } | null>(null);
  const [orderConfirm, setOrderConfirm] = useState(false);

  // 실재고 입력 · 2026-08-03 · 5분리 (창고1·창고2·매장1·매장2·매장3)
  //   신규 서버 컬럼: warehouse1_stock · warehouse2_stock · store_stock (=매장1 레거시) · store_stock_2 (=매장2) · store3_stock
  //   레거시 하위 호환: 서버 응답에 warehouse_stock 만 있고 warehouse1_stock 없으면 창고1로 로드
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

  // 바코드 스캔 시 기존 실재고·발주요청 데이터 자동 로드
  useEffect(() => {
    setWarehouse1Stock("");
    setWarehouse2Stock("");
    setStore1Stock("");
    setStore2Stock("");
    setStore3Stock("");
    setW1Status("idle"); setW2Status("idle");
    setS1Status("idle"); setS2Status("idle"); setS3Status("idle");
    setW1Error(null); setW2Error(null);
    setS1Error(null); setS2Error(null); setS3Error(null);
    setOrderStatus("idle");
    setExistingOrder(null);
    setOrderConfirm(false);

    if (!product.code) return;
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    // 기존 실재고 데이터 로드 · 하위호환 · warehouse1_stock 없으면 warehouse_stock 값을 창고1로 채움
    api.get<any[]>(`/api/inventory-checks?product_code=${encodeURIComponent(product.code)}`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        const last = list[0];
        if (!last) return;
        // 창고1 · 신규 컬럼 우선 · 없으면 레거시 warehouse_stock
        if (last.warehouse1_stock != null) setWarehouse1Stock(Number(last.warehouse1_stock));
        else if (last.warehouse_stock != null) setWarehouse1Stock(Number(last.warehouse_stock));
        // 창고2
        if (last.warehouse2_stock != null) setWarehouse2Stock(Number(last.warehouse2_stock));
        // 매장1 · store_stock (레거시=매장1)
        if (last.store_stock != null) setStore1Stock(Number(last.store_stock));
        // 매장2 · store_stock_2
        if (last.store_stock_2 != null) setStore2Stock(Number(last.store_stock_2));
        // 매장3 · store3_stock
        if (last.store3_stock != null) setStore3Stock(Number(last.store3_stock));
      }).catch(() => {});
    // 기존 발주요청 로드
    api.get<any[]>(`/api/order-requests?product_code=${encodeURIComponent(product.code)}`)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        if (list[0]) setExistingOrder({ current_stock: list[0].current_stock, requested_at: list[0].requested_at });
      }).catch(() => {});
  }, [product.code]);

  // 각 필드 독립 저장 · 서버가 이미 신규+레거시 mirror 처리하므로 신규 컬럼명만 보냄
  type StockField = "warehouse1_stock" | "warehouse2_stock" | "store_stock" | "store_stock_2" | "store3_stock";
  const statusSetters: Record<StockField, React.Dispatch<React.SetStateAction<InvStatus>>> = {
    warehouse1_stock: setW1Status,
    warehouse2_stock: setW2Status,
    store_stock:      setS1Status,
    store_stock_2:    setS2Status,
    store3_stock:     setS3Status,
  };
  const errorSetters: Record<StockField, React.Dispatch<React.SetStateAction<string | null>>> = {
    warehouse1_stock: setW1Error,
    warehouse2_stock: setW2Error,
    store_stock:      setS1Error,
    store_stock_2:    setS2Error,
    store3_stock:     setS3Error,
  };
  const submitStockField = async (field: StockField, value: number | "") => {
    if (value === "") return;
    const setStatus = statusSetters[field];
    const setError  = errorSetters[field];
    setStatus("loading");
    setError(null);
    try {
      await api.post("/api/inventory-checks", {
        product_code:    product.code,
        product_name:    product.name,
        [field]:         Number(value),
        system_stock:    product.current_stock != null ? Number(product.current_stock) : null,
        optimal_stock:   product.optimal_stock != null ? Number(product.optimal_stock) : null,
        checked_by:      checkedBy ?? "",
      });
      setStatus("done");
      // 재고 관련 리스트가 자동 갱신되도록 이벤트 발행
      window.dispatchEvent(new CustomEvent("inventory-checks-updated", {
        detail: { product_code: product.code, field, value: Number(value) },
      }));
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류"));
      setStatus("error");
    }
  };
  const handleW1Submit = () => submitStockField("warehouse1_stock", warehouse1Stock);
  const handleW2Submit = () => submitStockField("warehouse2_stock", warehouse2Stock);
  const handleS1Submit = () => submitStockField("store_stock",      store1Stock);
  const handleS2Submit = () => submitStockField("store_stock_2",    store2Stock);
  const handleS3Submit = () => submitStockField("store3_stock",     store3Stock);

  const submitOrderRequest = async () => {
    setOrderStatus("loading");
    setOrderConfirm(false);
    try {
      await api.post("/api/order-requests", {
        product_code: product.code,
        product_name: product.name,
        current_stock: product.current_stock != null ? Number(product.current_stock) : null,
        optimal_stock: product.optimal_stock != null ? Number(product.optimal_stock) : null,
        note: "",
      });
      // 2026-08-18 · 발주 요청 배지 즉시 갱신
      dispatchApprovalChange("order");
      setOrderStatus("done");
      setExistingOrder({ current_stock: product.current_stock != null ? Number(product.current_stock) : null, requested_at: new Date().toISOString() });
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
      await api.patch(`/api/products/${encodeURIComponent(product.code)}/realmap`, { realMap: zoneLabel || null });
      onRealMapUpdate(zoneLabel);
      const specZone = product.spec || "미지정";
      const isMismatch = !!zoneLabel && zoneLabel !== specZone;
      if (isMismatch) {
        api.post("/api/zone-mismatches", {
          product_code: product.code,
          product_name: product.name,
          spec_zone: specZone,
          real_zone: zoneLabel,
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
      slate: "text-zinc-800",
      emerald: "text-emerald-700",
      indigo: "text-indigo-700",
      amber: "text-amber-700",
    }[accent];

    return (
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">{label}</p>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type={type}
              value={editingValue}
              onChange={e => setEditingValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
              disabled={editSaving}
              autoFocus
              className="flex-1 min-w-0 text-[13px] font-bold border-2 border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-tint"
            />
            <button onClick={commitEdit} disabled={editSaving} className="shrink-0 w-6 h-6 rounded bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
              {editSaving ? <Spinner size={11} /> : <Check size={12} />}
            </button>
            <button onClick={cancelEdit} disabled={editSaving} className="shrink-0 w-6 h-6 rounded bg-zinc-200 text-zinc-600 flex items-center justify-center hover:bg-zinc-300 disabled:opacity-40 cursor-pointer">
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <p className={`text-[13px] font-bold ${accentClass} break-words leading-tight flex-1`}>{displayValue}</p>
            {inlineEditEnabled && (
              <button
                onClick={() => startEdit(fieldKey, value)}
                className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
                title={`${label} 편집`}
              >
                <Pencil size={10} />
              </button>
            )}
          </div>
        )}
        {isEditing && editError && (
          <p className="text-[13px] text-red-500 mt-0.5">{editError}</p>
        )}
      </div>
    );
  };

  return (
    <>
      <Card padding="none" topAccent className="p-3.5">
        {/* 상품명 */}
        {S.header && (<>
          {/* 상품명 + 숨기기 버튼 · 좁은 화면에서 버튼이 아래로 내려가도록 flex-wrap */}
          <div className="flex items-start gap-2 mb-1 flex-wrap">
            <p className="text-[15px] font-bold text-zinc-800 whitespace-normal leading-snug flex-1 min-w-0 break-keep">
              {product.name}
            </p>
            <button
              type="button"
              onClick={toggleHidden}
              disabled={hideSaving}
              title={isHidden ? "숨김 해제 · 검색·발주 리스트에 다시 표시" : "이 상품 숨김 · 검색·발주 리스트에서 제외"}
              className={`shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                isHidden
                  ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                  : "bg-white border-line text-zinc-400 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-600"
              } ${hideSaving ? "opacity-60 cursor-wait" : ""}`}
            >
              {hideSaving ? <Spinner size={11} /> : (isHidden ? <Eye size={11} /> : <EyeOff size={11} />)}
              {isHidden ? "숨김 해제" : "숨기기"}
            </button>
          </div>
          {isHidden && (
            <span className="mb-1.5 inline-flex">
              <StatusPill tone="amber" size="xs" dot>숨김 처리됨</StatusPill>
            </span>
          )}
          {hideError && <p className="text-[13px] text-rose-600 mb-1.5">{hideError}</p>}
        </>)}

        {/* ── 배정 구역: 전산/실제 인라인 ── */}
        {S.zoneAssignment && (<>
        <div className="flex items-stretch gap-2 mb-2 px-2.5 py-2 rounded-xl border border-line bg-zinc-50/60">
          {/* 전산배치구역 */}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-zinc-400 leading-none mb-1 uppercase tracking-wide">전산</p>
            <p className="text-[13px] font-bold text-zinc-700 leading-snug break-keep whitespace-normal">{specZone}</p>
          </div>

          {/* 화살표 */}
          <div className="flex items-center">
            <ArrowRight size={14} className={`shrink-0 ${hasMismatch ? "text-orange-400" : "text-zinc-300"}`} />
          </div>

          {/* 실제배치구역 */}
          <div className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 ${
            hasMismatch ? "bg-orange-50 border border-orange-200" : realMap ? "bg-teal-50 border border-teal-200" : "bg-white border border-dashed border-line"
          }`}>
            <p className={`text-[14px] font-semibold leading-none mb-1 uppercase tracking-wide ${
              hasMismatch ? "text-orange-500" : realMap ? "text-teal-600" : "text-zinc-400"
            }`}>실제</p>
            {realMap ? (
              <p className={`text-[13px] font-bold leading-snug break-keep whitespace-normal ${hasMismatch ? "text-orange-700" : "text-teal-700"}`}>{realMap}</p>
            ) : (
              <p className="text-[14px] font-semibold text-zinc-400">미등록</p>
            )}
          </div>

          {/* 변경/등록 버튼 */}
          <div className="flex items-center">
            <button
              onClick={() => setMapSelectorOpen(true)}
              disabled={saving}
              className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border text-[13px] font-bold transition cursor-pointer min-h-[44px] ${
                realMap
                  ? "bg-white border-line text-zinc-500 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50"
                  : "bg-teal-500 border-teal-600 text-white hover:bg-teal-600"
              }`}
            >
              {saving ? <Spinner size={11} /> : <Pencil size={11} />}
              {saving ? "" : realMap ? "변경" : "등록"}
            </button>
          </div>
        </div>

        </>)}
        {/* 불일치 경고 / 저장 오류 */}
        {S.zoneAssignment && (hasMismatch || saveError) && (
          <div className="flex flex-col gap-1 mb-2">
            {hasMismatch && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-lg">
                <AlertTriangle size={10} className="text-orange-500 shrink-0" />
                <p className="text-[13px] font-semibold text-orange-600">전산배치구역과 실제배치구역이 다릅니다</p>
              </div>
            )}
            {saveError && (
              <div className="flex items-start gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle size={10} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[13px] font-semibold text-red-600 whitespace-pre-wrap">{saveError}</p>
              </div>
            )}
          </div>
        )}

        {/* ── 재고 통합 · 2026-08-03 · 5분리 (창고1·창고2·매장1·매장2·매장3) ── */}
        {(S.stockStatus || S.actualStockInput) && (() => {
          const hasInput =
            warehouse1Stock !== "" || warehouse2Stock !== "" ||
            store1Stock !== "" || store2Stock !== "" || store3Stock !== "";
          const totalActual =
            Number(warehouse1Stock || 0) + Number(warehouse2Stock || 0) +
            Number(store1Stock || 0) + Number(store2Stock || 0) + Number(store3Stock || 0);
          const diff = hasInput && cur != null ? totalActual - cur : null;
          // #224 · real_map 슬래시(/) 분할 · 매장1/2/3 진열위치 라벨
          //   예: "8A/냉" → 매장1="8A" · 매장2="냉"
          const storeZones = String(product.real_map ?? "")
            .split(/[/,]/)
            .map(s => s.trim())
            .filter(Boolean);
          const zoneS1 = storeZones[0] ?? "";
          const zoneS2 = storeZones[1] ?? "";
          const zoneS3 = storeZones[2] ?? "";
          // 2026-08-25 · 재고위치 톤 통일 · 상단 v9 gradient accent · 폰트 +2 (사용자 지시)
          return (
            <div className={`relative overflow-hidden rounded-xl border px-3 py-2.5 mb-2.5 ${isLow ? "bg-red-50 border-red-200" : "bg-zinc-50 border-line"}`}>
              <span aria-hidden className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${isLow ? "from-rose-500 via-red-500 to-rose-500" : "from-brand-deep via-sky-500 to-brand-deep"} opacity-90 z-10 pointer-events-none`} />
              {/* 2026-07-16 · 헤더 · 재고현황 라벨(클릭 시 접기/펼치기) + 재고세기 버튼 + 부족 표시 */}
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStockSectionCollapsed(c => !c)}
                  className="flex items-center gap-1.5 hover:bg-white/40 -mx-1 px-1 py-0.5 rounded transition cursor-pointer flex-1 min-w-0"
                  title={stockSectionCollapsed ? "펼치기" : "접기"}
                >
                  {stockSectionCollapsed
                    ? <ChevronRight size={15} className="text-zinc-400 shrink-0" />
                    : <ChevronDown size={15} className="text-zinc-500 shrink-0" />}
                  <Package size={13} className={`shrink-0 ${isLow ? "text-red-500" : "text-brand-deep"}`} />
                  <p className={`text-[15px] font-bold ${isLow ? "text-red-600" : "text-zinc-800"}`}>재고현황</p>
                  {isLow && (
                    <span className="text-[13px] font-bold text-red-500 flex items-center gap-0.5 shrink-0">
                      <AlertTriangle size={12} /> 부족
                    </span>
                  )}
                  {stockSectionCollapsed && (
                    <span className="text-[13px] tabular-nums font-semibold text-zinc-500 ml-1 truncate">현재고 {cur ?? "-"} · 적정 {opt ?? "-"}</span>
                  )}
                </button>
                {/* 2026-08-05 · 재고세기(YOLO) 기능 제거 · [재고 세기] 버튼 삭제 */}
              </div>

              {/* 2026-08-03 · 상단 2열 · 현재고 · 추천적정재고 · 접힌 상태에서는 숨김 */}
              {!stockSectionCollapsed && <div className="grid grid-cols-2 gap-2">
                {/* 현재고 · 폰트 +2 */}
                <div className="text-center bg-white rounded-lg border border-line py-2 px-1">
                  <p className="text-[13px] font-semibold text-zinc-500 mb-1">현재고</p>
                  <p className={`text-[18px] font-bold leading-none tabular-nums ${isLow ? "text-red-600" : "text-zinc-800"}`}>{cur ?? "-"}</p>
                </div>
                {/* 적정재고 (인라인 편집) · 폰트 +2 */}
                <div className="text-center bg-white rounded-lg border border-amber-200 py-2 px-1">
                  <p className="text-[13px] font-semibold text-amber-600 mb-1">추천적정재고</p>
                  {editingKey === "optimal_stock" ? (
                    <div className="flex items-center gap-0.5 justify-center">
                      <input
                        type="number" min={0}
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                        disabled={editSaving}
                        autoFocus
                        className="w-10 text-[14px] font-bold text-center border border-amber-500 rounded px-0.5 py-0 focus:outline-none"
                      />
                      <button onClick={commitEdit} disabled={editSaving} className="w-4 h-4 rounded bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">
                        {editSaving ? <Spinner size={8} /> : <Check size={9} />}
                      </button>
                      <button onClick={cancelEdit} disabled={editSaving} className="w-4 h-4 rounded bg-zinc-200 text-zinc-600 flex items-center justify-center hover:bg-zinc-300 disabled:opacity-40 cursor-pointer">
                        <X size={9} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => inlineEditEnabled && startEdit("optimal_stock", opt)}
                      disabled={!inlineEditEnabled}
                      className={`text-[18px] font-bold leading-none tabular-nums text-amber-700 ${inlineEditEnabled ? "hover:bg-amber-100 rounded px-1 -mx-1 cursor-pointer transition" : "cursor-default"}`}
                      title={inlineEditEnabled ? "클릭 → 편집" : undefined}
                    >{opt ?? "-"}</button>
                  )}
                </div>
              </div>}

              {/* 2026-08-03 · 하단 5열 · 창고1 · 창고2 · 매장1 · 매장2 · 매장3
                    - 좁은 화면(360px 미만) · 5열이 wrap 될 수 있도록 grid-cols-2 fallback
                    - 창고: cyan 계열 (창고1 · 창고2 진하게)
                    - 매장1/2/3: violet 계열 */}
              {S.actualStockInput && !stockSectionCollapsed && (
                <div className="grid grid-cols-2 min-[360px]:grid-cols-3 min-[520px]:grid-cols-5 gap-1.5 mt-1.5">
                  {/* 2026-08-22 · Framework Phase 4 · StockSlotCard 프리미티브 재사용 */}
                  <StockSlotCard kind="warehouse" label="창고1" value={warehouse1Stock}
                    onChange={v => { setWarehouse1Stock(v); setW1Status("idle"); }}
                    status={w1Status} onSubmit={handleW1Submit} toneKey="wh1" />
                  <StockSlotCard kind="warehouse" label="창고2" value={warehouse2Stock}
                    onChange={v => { setWarehouse2Stock(v); setW2Status("idle"); }}
                    status={w2Status} onSubmit={handleW2Submit} toneKey="wh2" />
                  {(storeZones.length === 0 || storeZones.length >= 1) && (
                    <StockSlotCard kind="store" label="매장1" zone={zoneS1} value={store1Stock}
                      onChange={v => { setStore1Stock(v); setS1Status("idle"); }}
                      status={s1Status} onSubmit={handleS1Submit} toneKey="s1" />
                  )}
                  {storeZones.length >= 2 && (
                    <StockSlotCard kind="store" label="매장2" zone={zoneS2} value={store2Stock}
                      onChange={v => { setStore2Stock(v); setS2Status("idle"); }}
                      status={s2Status} onSubmit={handleS2Submit} toneKey="s2" />
                  )}
                  {storeZones.length >= 3 && (
                    <StockSlotCard kind="store" label="매장3" zone={zoneS3} value={store3Stock}
                      onChange={v => { setStore3Stock(v); setS3Status("idle"); }}
                      status={s3Status} onSubmit={handleS3Submit} toneKey="s3" />
                  )}
                </div>
              )}

              {/* 하단 · 합계 + 차이 (실재고 입력 시만, 접히면 숨김) */}
              {S.actualStockInput && !stockSectionCollapsed && hasInput && (
                <div className="flex items-center justify-between text-[14px] font-semibold px-0.5 mt-1.5 flex-wrap gap-1">
                  <span className="text-zinc-600">실재고 합계: <span className="tabular-nums font-bold text-violet-700">{totalActual}개</span></span>
                  {diff != null && (
                    <span className={`tabular-nums font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-zinc-400"}`}>
                      현재고 대비 {diff > 0 ? "+" : ""}{diff}개
                    </span>
                  )}
                </div>
              )}
              {/* 편집 에러 표시 */}
              {!stockSectionCollapsed && editingKey === "optimal_stock" && editError && (
                <p className="text-[13px] text-red-500 mt-1">{editError}</p>
              )}
              {/* 창고/매장 저장 에러 · 2026-08-03 · 5분리 */}
              {S.actualStockInput && !stockSectionCollapsed && (w1Status === "error" && w1Error) && (
                <p className="text-[13px] text-red-500 text-center mt-1">창고1: {w1Error}</p>
              )}
              {S.actualStockInput && !stockSectionCollapsed && (w2Status === "error" && w2Error) && (
                <p className="text-[13px] text-red-500 text-center mt-1">창고2: {w2Error}</p>
              )}
              {S.actualStockInput && !stockSectionCollapsed && (s1Status === "error" && s1Error) && (
                <p className="text-[13px] text-red-500 text-center mt-1">매장1: {s1Error}</p>
              )}
              {S.actualStockInput && !stockSectionCollapsed && (s2Status === "error" && s2Error) && (
                <p className="text-[13px] text-red-500 text-center mt-1">매장2: {s2Error}</p>
              )}
              {S.actualStockInput && !stockSectionCollapsed && (s3Status === "error" && s3Error) && (
                <p className="text-[13px] text-red-500 text-center mt-1">매장3: {s3Error}</p>
              )}
            </div>
          );
        })()}

        {/* ── 매입 · 판매가 (2026-07-16 · 한 줄 grid-cols-4 컴팩트) ── */}
        {S.financial && (() => {
          const sp = product.sale_price != null ? Number(product.sale_price) : null;
          const pp = product.purchase_price != null ? Number(product.purchase_price) : null;
          const margin = sp != null && pp != null && sp > 0 ? ((sp - pp) / sp * 100).toFixed(1) : null;
          const stockAsset = pp != null && cur != null ? (pp * cur).toLocaleString() + "원" : null;
          return (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2 mb-2.5">
              <p className="text-[13px] font-bold text-zinc-800 mb-2 flex items-center gap-1.5">
                <DollarSign size={14} className="text-indigo-500"/>매입 · 판매가
              </p>
              {/* 매입·판매가 그리드 · 모바일 2열 · sm+ 4열 · 값은 break-words */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                <InlineField label="매입가" fieldKey="purchase_price" value={pp} type="number" accent="emerald" format={v => Number(v).toLocaleString() + "원"} />
                <InlineField label="판매가" fieldKey="sale_price" value={sp} type="number" accent="indigo" format={v => Number(v).toLocaleString() + "원"} />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">마진율</p>
                  <p className="text-[13px] font-bold text-emerald-700">{margin != null ? `${margin}%` : "-"}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">재고 자산</p>
                  <p className="text-[13px] font-bold text-zinc-800 break-words leading-tight" title={stockAsset ?? undefined}>{stockAsset ?? "-"}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── 발주요청 버튼 ── */}
        {S.orderRequest && (
        <div className="mb-2.5">
          {existingOrder && orderStatus !== "done" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-1.5 bg-orange-50 border border-orange-200 rounded-xl text-[14px] text-orange-700 font-bold">
              <ShoppingCart size={11} className="shrink-0" />
              <span>기존 발주요청 있음 — 현재고 {existingOrder.current_stock ?? "—"} ({new Date(existingOrder.requested_at).toLocaleDateString("ko-KR")} 요청)</span>
            </div>
          )}
          {orderConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-zinc-700 font-bold flex-1">기존 요청을 덮어쓸까요?</span>
              <button onClick={submitOrderRequest} className="text-[14px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 min-h-9 rounded-lg transition cursor-pointer">덮어쓰기</button>
              <button onClick={() => setOrderConfirm(false)} className="text-[14px] font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-3 py-1.5 min-h-9 rounded-lg transition cursor-pointer">취소</button>
            </div>
          ) : orderStatus === "done" ? (
            <Card variant="flat" bg="bg-emerald-50" borderColor="border-emerald-200" padding="none" className="flex items-center justify-center gap-2 py-2 text-emerald-700 text-[14px] font-bold">
              <CheckCircle2 size={14} />
              발주 요청이 등록되었습니다
            </Card>
          ) : (
            <button
              onClick={handleOrderRequest}
              disabled={orderStatus === "loading"}
              className={`w-full flex items-center justify-center gap-2 min-h-9 py-2 rounded-xl text-[14px] font-bold transition cursor-pointer disabled:opacity-60 ${
                isLow
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-200"
                  : "bg-white border border-zinc-300 hover:border-indigo-400 hover:text-indigo-600 text-zinc-600"
              }`}
            >
              {orderStatus === "loading"
                ? <Spinner size={14} />
                : <ShoppingCart size={14} />}
              {orderStatus === "loading" ? "요청 중..." : orderStatus === "error" ? "재시도" : existingOrder ? "발주요청 리스트 업데이트" : "발주요청 리스트에 추가"}
            </button>
          )}
          {orderStatus === "error" && (
            <p className="text-[14px] text-red-500 text-center mt-1">요청 실패 — 다시 시도해주세요</p>
          )}
        </div>
        )}

        {/* ── 기타 정보 그리드 (상품코드·공급처·판매상태·최근매입일) + 추가 정보 통합 ── */}
        {(S.productMeta || S.extraInfo) && (
        <div className="rounded-xl border border-line bg-zinc-50/30 px-3 py-2 mb-2.5">
          {S.productMeta && (
            <>
              <p className="text-[13px] font-bold text-zinc-800 mb-2 flex items-center gap-1.5">
                <Info size={14} className="text-zinc-500"/>상품 정보
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-2">
                {([
                  ["상품코드", product.code],
                  ["공급처", product.supplier ?? "-"],
                  ["판매상태", product.sale_status ?? "-"],
                  ["최근매입일", product.last_purchase_date ?? "-"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">{label}</p>
                    <p className="text-[13px] font-bold text-zinc-800 break-words leading-tight tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </>
          )}
          {S.productMeta && S.extraInfo && <div className="border-t border-zinc-100 mb-2" />}
          {S.extraInfo && (<>
            <p className="text-[13px] font-bold text-zinc-800 mb-2 flex items-center gap-1.5">
              <Info size={14} className="text-zinc-500"/>추가 정보
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <InlineField label="브랜드" fieldKey="brand" value={(product as any).brand} />
              <InlineField label="제조사" fieldKey="manufacturer" value={(product as any).manufacturer} />
              <InlineField label="바코드" fieldKey="barcode" value={(product as any).barcode} />
              <InlineField label="유효기간" fieldKey="expiry_date" value={(product as any).expiry_date} type="date" />
            </div>
            <div className="mt-2">
              <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">메모</p>
              {editingKey === "memo" ? (
                <div className="flex flex-col gap-1">
                  <textarea
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Escape") cancelEdit(); }}
                    disabled={editSaving}
                    autoFocus
                    rows={2}
                    className="w-full text-[13px] font-bold border-2 border-indigo-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-tint resize-none"
                  />
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={commitEdit} disabled={editSaving} className="text-[13px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                      {editSaving ? <Spinner size={11} /> : <Check size={11}/>}저장
                    </button>
                    <button onClick={cancelEdit} disabled={editSaving} className="text-[13px] font-bold text-zinc-600 bg-zinc-200 hover:bg-zinc-300 rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                      <X size={11}/>취소
                    </button>
                  </div>
                  {editError && <p className="text-[13px] text-red-500">{editError}</p>}
                </div>
              ) : (
                <div className="flex items-start gap-1 group">
                  <p className={`text-[13px] font-bold text-zinc-800 flex-1 whitespace-pre-wrap leading-tight ${!(product as any).memo ? "text-zinc-300 font-bold italic" : ""}`}>
                    {(product as any).memo || "(메모 없음)"}
                  </p>
                  {inlineEditEnabled && (
                    <button
                      onClick={() => startEdit("memo", (product as any).memo)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
                      title="메모 편집"
                    >
                      <Pencil size={10}/>
                    </button>
                  )}
                </div>
              )}
            </div>
          </>)}
        </div>
        )}
      </Card>

      {/* ─── 매입 이력 (2026-07-15) · purchase_details 조회 · 이 상품의 최근 매입 20건 · 2026-07-16 section flag ─── */}
      {S.purchaseHistory && <PurchaseHistorySection productCode={product.code} productName={product.name} />}

      {mapSelectorOpen && (
        <RealMapSelector
          current={realMap}
          onSelect={handleRealMapSelect}
          onClose={() => setMapSelectorOpen(false)}
        />
      )}
      {/* 2026-08-05 · 재고세기(YOLO) 기능 완전 제거 · StockCounterModal 삭제됨 */}
    </>
  );
};

// 2026-08-21 · Framework Phase 4 · PurchaseHistorySection 은 별도 파일로 분리 (./PurchaseHistorySection)
export { PurchaseHistorySection } from "./PurchaseHistorySection";
