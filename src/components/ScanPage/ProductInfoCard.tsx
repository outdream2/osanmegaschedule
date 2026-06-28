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
  const [saveError, setSaveError] = useState<string | null>(null);

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

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        {/* 상품명 */}
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">상품 정보</p>
        <p className="text-2xl font-black text-gray-900 leading-tight mb-4">{product.name}</p>

        {/* ── 배정 구역: 전산 카드 | 실제 카드 나란히 ── */}
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

        {/* 불일치 경고 / 저장 오류 */}
        {(hasMismatch || saveError) && (
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
