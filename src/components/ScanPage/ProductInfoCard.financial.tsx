// ProductInfoCard.financial.tsx
// 2026-08-29 · 분리 · 매입·판매가 섹션

import React from "react";
import { DollarSign } from "lucide-react";
import { InlineField } from "./ProductInfoCard.inline";
import type { InlineEditableKey } from "./ProductInfoCard.types";

interface ProductInfoFinancialProps {
  salePrice: number | null;
  purchasePrice: number | null;
  currentStock: number | null;
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

export const ProductInfoFinancial: React.FC<ProductInfoFinancialProps> = ({
  salePrice, purchasePrice, currentStock,
  editingKey, editingValue, editSaving, editError,
  inlineEditEnabled, onEditStart, onEditChange, onCommit, onCancel,
}) => {
  const margin = salePrice != null && purchasePrice != null && salePrice > 0
    ? ((salePrice - purchasePrice) / salePrice * 100).toFixed(1)
    : null;
  const stockAsset = purchasePrice != null && currentStock != null
    ? (purchasePrice * currentStock).toLocaleString() + "원"
    : null;

  const fieldProps = { editingKey, editingValue, editSaving, editError, inlineEditEnabled, onEditStart, onEditChange, onCommit, onCancel };

  // 2026-10-11 · 사용자 지시 · 홈 랜딩 톤 · rounded-[12px] + border-slate-200 + subtle shadow · pastel bg 제거
  return (
    <div className="rounded-[12px] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] px-3 py-2.5 mb-2.5">
      <p className="text-[15px] font-semibold text-ink mb-2 flex items-center gap-1.5">
        <span className="w-[3px] h-[14px] bg-indigo-500 rounded-full" aria-hidden />
        <DollarSign size={13} className="text-indigo-600" />매입 · 판매가
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
        <InlineField label="매입가" fieldKey="purchase_price" value={purchasePrice} type="number" accent="emerald"
          format={v => Number(v).toLocaleString() + "원"} {...fieldProps} />
        <InlineField label="판매가" fieldKey="sale_price" value={salePrice} type="number" accent="indigo"
          format={v => Number(v).toLocaleString() + "원"} {...fieldProps} />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-zinc-500 mb-0.5">마진율</p>
          <p className="text-[15px] font-bold text-emerald-700">{margin != null ? `${margin}%` : "-"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-zinc-500 mb-0.5">재고 자산</p>
          <p className="text-[15px] font-bold text-zinc-800 break-words leading-tight" title={stockAsset ?? undefined}>{stockAsset ?? "-"}</p>
        </div>
      </div>
    </div>
  );
};
