import React, { useState } from "react";
import { Pencil, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { type ProductInfo } from "../../lib/productsCache";
import { RealMapSelector } from "./RealMapSelector";

interface ProductInfoCardProps {
  product: ProductInfo;
  onRealMapUpdate: (newValue: string) => void;
}

export const ProductInfoCard: React.FC<ProductInfoCardProps> = ({ product, onRealMapUpdate }) => {
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const handleRealMapSelect = async (zoneLabel: string) => {
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.code)}/realmap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ real_map: zoneLabel || null }),
      });
      if (res.ok) {
        onRealMapUpdate(zoneLabel);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    }
    setSaving(false);
  };

  const realMap: string | null = product.real_map ?? null;
  const specZone = product.spec || "미지정";
  const hasMismatch = !!realMap && realMap !== specZone;

  const cur = product.current_stock != null ? Number(product.current_stock) : null;
  const opt = product.optimal_stock != null ? Number(product.optimal_stock) : null;
  const isLow = cur != null && opt != null && cur < opt;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        {/* 상품명 */}
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">상품 정보</p>
        <p className="text-2xl font-black text-gray-900 leading-tight mb-4">{product.name}</p>

        {/* ── 배정 구역 섹션 ── */}
        <div className={`rounded-xl border px-4 py-3 mb-3 ${
          hasMismatch ? "bg-orange-50 border-orange-300" : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">배정 구역</p>
              <div className="flex items-center gap-2 flex-wrap">
                {/* 전산 배정구역 */}
                <div>
                  <p className="text-[9px] font-bold text-gray-400 mb-0.5">전산</p>
                  <p className="text-sm font-bold text-gray-700">{specZone}</p>
                </div>

                {/* 실제 배정구역 */}
                {realMap ? (
                  <>
                    <ArrowRight size={13} className={`shrink-0 ${hasMismatch ? "text-orange-400" : "text-gray-300"}`} />
                    <div>
                      <p className={`text-[9px] font-bold mb-0.5 ${hasMismatch ? "text-red-500" : "text-teal-600"}`}>실제</p>
                      <p className={`text-sm font-black ${hasMismatch ? "text-red-500" : "text-teal-700"}`}>{realMap}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic ml-1">실제 위치 미입력</p>
                )}
              </div>

              {hasMismatch && (
                <div className="flex items-center gap-1 mt-2">
                  <AlertTriangle size={11} className="text-orange-500 shrink-0" />
                  <p className="text-[10px] font-bold text-orange-600">전산과 실제 위치가 다릅니다</p>
                </div>
              )}

              {saveError && (
                <p className="text-[10px] font-bold text-red-500 mt-1">저장 실패 — 다시 시도해주세요</p>
              )}
            </div>

            {/* 등록/변경 버튼 */}
            <button
              onClick={() => setMapSelectorOpen(true)}
              disabled={saving}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-600 hover:border-teal-400 hover:text-teal-600 transition cursor-pointer text-xs font-bold"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
              {saving ? "" : (realMap ? "변경" : "등록")}
            </button>
          </div>
        </div>

        {/* ── 재고 현황 섹션 ── */}
        <div className={`rounded-xl border px-4 py-3 mb-4 ${
          isLow ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
        }`}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">재고 현황</p>
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[10px] font-bold text-gray-500 mb-0.5">현재고</p>
              <p className={`text-3xl font-black leading-none ${isLow ? "text-red-500" : "text-gray-800"}`}>
                {cur ?? "-"}
              </p>
            </div>
            <div className={`h-10 w-px ${isLow ? "bg-red-200" : "bg-amber-200"}`} />
            <div>
              <p className="text-[10px] font-bold text-amber-600 mb-0.5">적정재고</p>
              <p className="text-3xl font-black leading-none text-amber-700">
                {opt ?? "-"}
              </p>
            </div>
          </div>
          {isLow && (
            <div className="flex items-center gap-1 mt-2">
              <AlertTriangle size={11} className="text-red-500 shrink-0" />
              <p className="text-[10px] font-bold text-red-600">재고 부족 — 보충이 필요합니다</p>
            </div>
          )}
        </div>

        {/* ── 기타 정보 그리드 ── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
