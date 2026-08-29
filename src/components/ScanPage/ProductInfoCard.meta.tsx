// ProductInfoCard.meta.tsx
// 2026-08-29 · 분리 · 상품정보 + 추가정보 그리드 섹션

import React from "react";
import { Info, Pencil, Check, X } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { InlineField } from "./ProductInfoCard.inline";
import type { ProductInfo } from "../../lib/productsCache";
import type { InlineEditableKey } from "./ProductInfoCard.types";

interface ProductInfoMetaProps {
  product: ProductInfo;
  showMeta: boolean;
  showExtra: boolean;
  editingKey: InlineEditableKey | null;
  editingValue: string;
  editSaving: boolean;
  editError: string | null;
  inlineEditEnabled: boolean;
  onEditStart: (k: InlineEditableKey, v: any) => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export const ProductInfoMeta: React.FC<ProductInfoMetaProps> = ({
  product, showMeta, showExtra,
  editingKey, editingValue, editSaving, editError,
  inlineEditEnabled, onEditStart, onEditChange, onCommit, onCancel,
}) => {
  const fieldProps = { editingKey, editingValue, editSaving, editError, inlineEditEnabled, onEditStart, onEditChange, onCommit, onCancel };

  return (
    <div className="rounded-xl border border-line bg-zinc-50/30 px-3 py-2 mb-2.5">
      {showMeta && (
        <>
          <p className="text-[13px] font-bold text-zinc-800 mb-2 flex items-center gap-1.5">
            <Info size={14} className="text-zinc-500" />상품 정보
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
      {showMeta && showExtra && <div className="border-t border-zinc-100 mb-2" />}
      {showExtra && (
        <>
          <p className="text-[13px] font-bold text-zinc-800 mb-2 flex items-center gap-1.5">
            <Info size={14} className="text-zinc-500" />추가 정보
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <InlineField label="브랜드" fieldKey="brand" value={(product as any).brand} {...fieldProps} />
            <InlineField label="제조사" fieldKey="manufacturer" value={(product as any).manufacturer} {...fieldProps} />
            <InlineField label="바코드" fieldKey="barcode" value={(product as any).barcode} {...fieldProps} />
            <InlineField label="유효기간" fieldKey="expiry_date" value={(product as any).expiry_date} type="date" {...fieldProps} />
          </div>
          <div className="mt-2">
            <p className="text-[13px] font-semibold text-zinc-500 mb-0.5">메모</p>
            {editingKey === "memo" ? (
              <div className="flex flex-col gap-1">
                <textarea
                  value={editingValue}
                  onChange={e => onEditChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
                  disabled={editSaving}
                  autoFocus
                  rows={2}
                  className="w-full text-[13px] font-bold border-2 border-indigo-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-tint resize-none"
                />
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={onCommit} disabled={editSaving} className="text-[13px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                    {editSaving ? <Spinner size={11} /> : <Check size={11} />}저장
                  </button>
                  <button onClick={onCancel} disabled={editSaving} className="text-[13px] font-bold text-zinc-600 bg-zinc-200 hover:bg-zinc-300 rounded px-2 py-1 flex items-center gap-1 disabled:opacity-40 cursor-pointer">
                    <X size={11} />취소
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
                    onClick={() => onEditStart("memo", (product as any).memo)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-indigo-600 flex items-center justify-center transition cursor-pointer"
                    title="메모 편집"
                  >
                    <Pencil size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
