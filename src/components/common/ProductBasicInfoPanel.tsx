// src/components/common/ProductBasicInfoPanel.tsx
// 2026-08-28 · 사용자 지시 · 상품 조회·수정 정보 통일 프리미티브
//
// 13컬럼 통일 · 조회·수정 페이지 모든 곳에서 공유:
//   분류코드 · 상품명 · 공급사 · 진열위치* · 판매상태*
//   현재고 · 창고재고 · 매장재고
//   매입가 · 판매가 · 이익율 · 적정재고(*일) · 최근매입일
//
// * · 인라인 편집 지원 (진열위치·판매상태) · onSave 로 서버 PATCH
//
// 사용:
//   <ProductBasicInfoPanel
//     product={{ product_code, product_name, supplier, location, sale_status, ... }}
//     editable={true}
//     onLocationChange={(newLoc) => save({ location: newLoc })}
//     onSaleStatusChange={(newStatus) => save({ sale_status: newStatus })}
//   />
import React, { useState } from "react";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";
import { Package, Store, Warehouse, MapPin, Coins, Pencil, Check } from "lucide-react";

export interface ProductBasic {
  product_code: string;
  category_code?: string | null;
  category?: string | null;
  product_name?: string | null;
  supplier?: string | null;
  location?: string | null;
  display_location?: string | null;   // legacy fallback
  sale_status?: string | null;
  current_stock?: number | null;
  warehouse_stock?: number | null;    // inv 파생
  store_stock?: number | null;        // inv 파생
  purchase_price?: number | null;
  sale_price?: number | null;
  profit_rate?: number | null;
  optimal_stock?: number | null;      // "*일" 라벨은 optimalDays prop 으로
  last_purchase_date?: string | null;
}

export interface ProductBasicInfoPanelProps {
  product: ProductBasic;
  /** true 이면 진열위치·판매상태 인라인 편집 UI 노출 (기본 false) */
  editable?: boolean;
  /** 진열위치 저장 · 실 API 호출 · Promise · loading spinner 지원 */
  onLocationChange?: (newLocation: string | null) => Promise<void> | void;
  /** 판매상태 저장 · Promise */
  onSaleStatusChange?: (newStatus: string) => Promise<void> | void;
  /** 적정재고 우측 표시할 참조 일수 (예: 30 → "적정재고 (30일)") */
  optimalDays?: number;
  /** 컴팩트 · 카드 padding·라벨 크기 축소 (모바일·모달 안) */
  compact?: boolean;
  className?: string;
}

const SALE_STATUS_OPTIONS = ["판매중", "판매중지", "판매종료"] as const;

function num(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
function currency(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return "₩" + Number(n).toLocaleString();
}
function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${Number(n).toFixed(1)}%`;
}
function formatDate(s: string | null | undefined): string {
  if (!s) return "-";
  return String(s).slice(0, 10);
}

const saleStatusPill = (status: string | null | undefined): "emerald" | "amber" | "rose" | "zinc" => {
  const s = String(status ?? "").trim();
  if (s === "판매중") return "emerald";
  if (s === "판매중지") return "amber";
  if (s === "판매종료") return "rose";
  return "zinc";
};

export const ProductBasicInfoPanel: React.FC<ProductBasicInfoPanelProps> = ({
  product,
  editable = false,
  onLocationChange,
  onSaleStatusChange,
  optimalDays = 30,
  compact = false,
  className = "",
}) => {
  // 2026-08-28 · 사용자 지시 · [수정] 버튼 · 편집 모드 진입 · 진열위치·판매상태 함께 편집
  const [editMode, setEditMode] = useState(false);
  const [editingLoc, setEditingLoc] = useState(false);
  const [locDraft, setLocDraft] = useState(String(product.location ?? product.display_location ?? ""));
  const [savingLoc, setSavingLoc] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const location = product.location ?? product.display_location ?? null;
  const inEditMode = editable && editMode;

  const labelCls = compact ? "text-[11px] font-bold text-ink-soft uppercase tracking-wider" : "text-[12px] font-bold text-ink-soft uppercase tracking-wider";
  const valueCls = compact ? "text-[14px] font-bold text-ink" : "text-[15px] font-bold text-ink";
  const numCls = `${valueCls} tabular-nums`;

  const submitLocation = async () => {
    if (!onLocationChange) { setEditingLoc(false); return; }
    const v = locDraft.trim() || null;
    if (v === (location ?? null)) { setEditingLoc(false); return; }
    setSavingLoc(true);
    try { await onLocationChange(v); }
    finally { setSavingLoc(false); setEditingLoc(false); }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!onSaleStatusChange) return;
    setSavingStatus(true);
    try { await onSaleStatusChange(newStatus); }
    finally { setSavingStatus(false); }
  };

  const Field: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, icon, children, className: cls }) => (
    <div className={`flex flex-col gap-0.5 min-w-0 ${cls ?? ""}`}>
      <span className={labelCls + " flex items-center gap-1"}>
        {icon}
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );

  return (
    <Card padding={compact ? "sm" : "md"} rounded="lg" className={`bg-white ${className} relative`}>
      {/* 2026-08-28 · 사용자 지시 · [수정] 버튼 · 편집 모드 진입 · 우측 상단 (진열위치·판매상태) */}
      {editable && (
        <div className="absolute top-2 right-2 z-10">
          {inEditMode ? (
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold shadow-sm transition cursor-pointer"
              title="편집 완료"
            >
              <Check size={12} strokeWidth={2.5} />
              완료
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditMode(true)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-white hover:bg-brand-tint border border-line hover:border-brand-deep text-brand-deep text-[12px] font-bold shadow-sm transition cursor-pointer"
              title="진열위치·판매상태 편집"
            >
              <Pencil size={12} strokeWidth={2.5} />
              수정
            </button>
          )}
        </div>
      )}
      <div className={compact ? "grid grid-cols-2 sm:grid-cols-3 gap-2.5" : "grid grid-cols-2 md:grid-cols-4 gap-3"}>
        {/* Row 1 · 기본 (분류·상품명·공급사) */}
        <Field label="분류코드">
          <span className={valueCls + " tabular-nums truncate block"} title={product.category ?? undefined}>
            {product.category_code || "-"}
          </span>
          {product.category && (
            <span className="text-[11px] text-ink-soft truncate block" title={product.category}>{product.category}</span>
          )}
        </Field>
        <Field label="상품명" className="col-span-2">
          <span className={valueCls + " break-keep"} title={product.product_name ?? undefined}>
            {product.product_name || "-"}
          </span>
        </Field>
        <Field label="공급사">
          <span className={valueCls + " truncate block"} title={product.supplier ?? undefined}>
            {product.supplier || "-"}
          </span>
        </Field>

        {/* Row 2 · 진열위치 (편집) · 판매상태 (편집) · 현재고 · 창고재고 · 매장재고 */}
        <Field label="진열위치" icon={<MapPin size={11} />}>
          {inEditMode && editingLoc ? (
            <form onSubmit={(e) => { e.preventDefault(); void submitLocation(); }} className="flex items-center gap-1">
              <input
                type="text"
                value={locDraft}
                onChange={(e) => setLocDraft(e.target.value)}
                onBlur={submitLocation}
                autoFocus
                disabled={savingLoc}
                className="h-7 w-20 px-2 rounded border border-brand-deep text-[14px] font-bold tabular-nums outline-none focus:ring-2 focus:ring-brand-tint"
                placeholder="예: 8A"
                maxLength={20}
              />
            </form>
          ) : (
            <button
              type="button"
              disabled={!inEditMode}
              onClick={() => { if (inEditMode) { setLocDraft(String(location ?? "")); setEditingLoc(true); } }}
              className={`${valueCls} tabular-nums ${inEditMode ? "hover:bg-amber-50 hover:text-amber-800 rounded px-1 -mx-1 cursor-pointer transition border border-dashed border-amber-300" : "cursor-default"}`}
              title={inEditMode ? "클릭하여 편집" : undefined}
            >
              {location || <span className="text-zinc-300">-</span>}
            </button>
          )}
        </Field>
        <Field label="판매상태">
          {inEditMode && onSaleStatusChange ? (
            <select
              value={String(product.sale_status ?? "")}
              onChange={(e) => void handleStatusChange(e.target.value)}
              disabled={savingStatus}
              className="h-7 px-2 rounded border border-amber-300 border-dashed text-[13px] font-bold bg-white outline-none focus:ring-2 focus:ring-brand-tint cursor-pointer"
            >
              <option value="">-</option>
              {SALE_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <StatusPill tone={saleStatusPill(product.sale_status)} size="sm">
              {product.sale_status || "-"}
            </StatusPill>
          )}
        </Field>
        <Field label="현재고" icon={<Package size={11} />}>
          <span className={numCls}>{num(product.current_stock)}</span>
        </Field>
        <Field label="창고재고" icon={<Warehouse size={11} />}>
          <span className={numCls}>{num(product.warehouse_stock)}</span>
        </Field>
        <Field label="매장재고" icon={<Store size={11} />}>
          <span className={numCls}>{num(product.store_stock)}</span>
        </Field>

        {/* Row 3 · 가격·이익율·적정재고·최근매입일 */}
        <Field label="매입가" icon={<Coins size={11} />}>
          <span className={numCls}>{currency(product.purchase_price)}</span>
        </Field>
        <Field label="판매가">
          <span className={numCls + " text-brand-deep"}>{currency(product.sale_price)}</span>
        </Field>
        <Field label="이익율">
          <span className={numCls + " text-emerald-700"}>{pct(product.profit_rate)}</span>
        </Field>
        <Field label={`적정재고 (${optimalDays}일)`}>
          <span className={numCls}>{num(product.optimal_stock)}</span>
        </Field>
        <Field label="최근매입일" className="col-span-2">
          <span className={valueCls + " tabular-nums"}>{formatDate(product.last_purchase_date)}</span>
        </Field>
      </div>
    </Card>
  );
};

export default ProductBasicInfoPanel;
