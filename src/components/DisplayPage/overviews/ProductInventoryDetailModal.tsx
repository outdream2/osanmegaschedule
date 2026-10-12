// src/components/DisplayPage/overviews/ProductInventoryDetailModal.tsx
// 2026-10-09 · GLOBAL UI · 재고·진열 domain-specific detail Modal
//   · OperationsDetailModalShell wrap · 상품/재고/유통기한/진열위치 통합 조회
//   · Shelf SSOT (ShelfPositionsBadge · formatCompactDisplayLocation) 보호 유지
//   · 재고 3분법 보호 · current_stock (ERP) · inventory_checks (WEB) 분리 표시

import React from "react";
import { Package, Barcode, Storefront, Clock, X } from "@phosphor-icons/react";
import { OperationsDetailModalShell } from "./OperationsDetailModalShell";
import { ShelfPositionsBadge } from "../../common/ShelfPositionsBadge";
import { StoreStatusBadge } from "./StoreOverviewPrimitives";

export interface ProductInventoryDetailRow {
  id?: number | string;
  product_code?: string | null;
  product_name?: string | null;
  barcode?: string | null;
  category?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  expiry_date?: string | null;
  expiry?: string | null;
  shelf_positions?: any;
  display_location?: string | null;
  checked_at?: string | null;
  created_at?: string | null;
  qty?: number | null;
  quantity?: number | null;
  note?: string | null;
}

export interface ProductInventoryDetailModalProps {
  open: boolean;
  onClose: () => void;
  row: ProductInventoryDetailRow | null;
}

const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? "-" : Number(n).toLocaleString();

const expiryTone = (dateStr: string | null | undefined): { tone: "neutral" | "emerald" | "amber" | "rose"; label: string } => {
  if (!dateStr) return { tone: "neutral", label: "미등록" };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { tone: "neutral", label: "미등록" };
  const now = Date.now();
  const diffDays = Math.round((d.getTime() - now) / 86400000);
  if (diffDays < 0) return { tone: "rose", label: `${Math.abs(diffDays)}일 경과` };
  if (diffDays <= 7) return { tone: "rose", label: `${diffDays}일 남음` };
  if (diffDays <= 30) return { tone: "amber", label: `${diffDays}일 남음` };
  return { tone: "emerald", label: `${diffDays}일 남음` };
};

export const ProductInventoryDetailModal: React.FC<ProductInventoryDetailModalProps> = ({ open, onClose, row }) => {
  if (!row) {
    return <OperationsDetailModalShell open={false} onClose={onClose} title="">{null}</OperationsDetailModalShell>;
  }

  const name = row.product_name ?? row.product_code ?? "-";
  const code = row.product_code ?? "-";
  const barcode = row.barcode ?? "-";
  const category = row.category ?? "-";
  const expDate = row.expiry_date ?? row.expiry ?? null;
  const exp = expiryTone(expDate);
  const stock = row.current_stock;
  const optimal = row.optimal_stock;
  const checkedAt = String(row.checked_at ?? row.created_at ?? "").slice(0, 16).replace("T", " ");
  const checkedQty = row.qty ?? row.quantity;

  const stockTone = (() => {
    if (stock == null || optimal == null) return "text-ink";
    if (Number(stock) <= 0) return "text-rose-600 font-semibold";
    if (Number(stock) < Number(optimal)) return "text-amber-600 font-semibold";
    return "text-emerald-600 font-semibold";
  })();

  return (
    <OperationsDetailModalShell
      open={open}
      onClose={onClose}
      title="상품·재고 상세"
      icon={<Package size={18} />}
      size="lg"
      summary={
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-[14px]">
          <div className="lg:col-span-2">
            <div className="text-[12px] text-ink-soft font-medium">상품명</div>
            <div className="font-bold text-ink mt-0.5 break-all">{name}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">상품코드</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5">{code}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium flex items-center gap-1"><Barcode size={12} /> 바코드</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5 break-all">{barcode}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">카테고리</div>
            <div className="font-semibold text-ink mt-0.5">{category}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">현재고 (ERP)</div>
            <div className={`tabular-nums mt-0.5 text-[16px] ${stockTone}`}>{fmtNum(stock)}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium">적정재고</div>
            <div className="font-semibold text-ink tabular-nums mt-0.5">{fmtNum(optimal)}</div>
          </div>
          <div>
            <div className="text-[12px] text-ink-soft font-medium flex items-center gap-1"><Clock size={12} /> 유통기한</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="font-semibold text-ink tabular-nums">{expDate ?? "-"}</span>
              {expDate && <StoreStatusBadge status={exp.label} tone={exp.tone} />}
            </div>
          </div>
        </section>
      }
      footerLeft={
        <button type="button" onClick={onClose}
          className="inline-flex items-center gap-1 h-10 px-3 rounded-lg text-[14px] font-medium text-ink-soft hover:bg-slate-50 transition-colors cursor-pointer">
          <X size={14} /> 닫기
        </button>
      }
    >
      <section className="border border-slate-200 rounded-xl p-4">
        <h3 className="text-[15px] font-semibold text-ink mb-3 flex items-center gap-2">
          <Storefront size={16} className="text-brand-deep" />
          진열 위치 (Shelf SSOT)
        </h3>
        {row.shelf_positions ? (
          <ShelfPositionsBadge positions={row.shelf_positions} size="md" variant="badge" />
        ) : row.display_location ? (
          <span className="text-[14px] font-medium text-ink">{row.display_location}</span>
        ) : (
          <span className="text-[13px] text-ink-soft italic">진열위치 미등록</span>
        )}
      </section>

      {(checkedAt || checkedQty != null) && (
        <section className="mt-4 border border-slate-200 rounded-xl p-4">
          <h3 className="text-[15px] font-semibold text-ink mb-3">실재고 체크 기록 (WEB)</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
            {checkedAt && (
              <div>
                <span className="text-ink-soft">체크 일시</span>
                <span className="font-semibold text-ink tabular-nums ml-2">{checkedAt}</span>
              </div>
            )}
            {checkedQty != null && (
              <div>
                <span className="text-ink-soft">실재고 수량</span>
                <span className="font-semibold text-ink tabular-nums ml-2">{fmtNum(Number(checkedQty))}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {row.note && (
        <section className="mt-4 border border-slate-200 rounded-xl p-4 text-[14px]">
          <div className="text-[12px] font-semibold text-ink-soft mb-1">비고</div>
          <div className="text-ink whitespace-pre-wrap">{row.note}</div>
        </section>
      )}
    </OperationsDetailModalShell>
  );
};

export default ProductInventoryDetailModal;
