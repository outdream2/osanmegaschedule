import React, { useState } from "react";
import { MapPin, Pencil, Loader2 } from "lucide-react";
import { type ProductInfo } from "../../lib/productsCache";
import { RealMapSelector } from "./RealMapSelector";

interface ProductInfoCardProps {
  product: ProductInfo;
  onRealMapUpdate: (newValue: string) => void;
}

export const ProductInfoCard: React.FC<ProductInfoCardProps> = ({ product, onRealMapUpdate }) => {
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRealMapSelect = async (zoneLabel: string) => {
    setSaving(true);
    try {
      await fetch(`/api/products/${encodeURIComponent(product.code)}/realmap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ real_map: zoneLabel || null }),
      });
      onRealMapUpdate(zoneLabel);
    } catch {}
    setSaving(false);
  };

  const realMap: string | null = product.real_map ?? null;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">상품 정보</p>
        <p className="text-3xl font-black text-gray-900 leading-tight mb-5">{product.name}</p>

        {/* Real map — full width highlight row */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin size={15} className="text-teal-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide">실제 배정 위치</p>
              <p className={`text-base font-black truncate ${realMap ? "text-teal-700" : "text-gray-400"}`}>
                {saving ? "저장 중..." : realMap || "미지정"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMapSelectorOpen(true)}
            disabled={saving}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-teal-300 text-teal-600 hover:bg-teal-100 transition cursor-pointer text-xs font-bold"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
            {saving ? "" : "변경"}
          </button>
        </div>

        {/* Fields grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {(
            [
              ["상품코드", product.code, "font-mono text-gray-700"],
              ["배정구역", product.spec || "미지정", "text-gray-700 font-bold"],
              ["현재고", String(product.current_stock ?? "-"), ""],
              ["공급", product.supplier ?? "-", ""],
              ["판매상태", product.sale_status ?? "-", ""],
              ["최근매입일", product.last_purchase_date ?? "-", ""],
            ] as [string, string, string][]
          ).map(([label, value, extra]) => (
            <div key={label}>
              <p className="text-xs font-bold text-gray-400 mb-0.5">{label}</p>
              <p className={`text-base font-semibold text-gray-800 truncate ${extra}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

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
