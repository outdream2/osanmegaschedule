import React, { useState } from "react";
import { Pencil, Loader2, ArrowRight, AlertTriangle, ShoppingCart, CheckCircle2, Warehouse, Store, ClipboardCheck } from "lucide-react";
import { type ProductInfo } from "../../lib/productsCache";
import { RealMapSelector } from "./RealMapSelector";

interface ProductInfoCardProps {
  product: ProductInfo;
  onRealMapUpdate: (newValue: string) => void;
  checkedBy?: string;
}

export const ProductInfoCard: React.FC<ProductInfoCardProps> = ({ product, onRealMapUpdate, checkedBy }) => {
  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  type OrderStatus = "idle" | "loading" | "done" | "error";
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("idle");

  // 실재고 입력
  const [warehouseStock, setWarehouseStock] = useState<number | "">("");
  const [storeStock, setStoreStock] = useState<number | "">("");
  type InvStatus = "idle" | "loading" | "done" | "error";
  const [invStatus, setInvStatus] = useState<InvStatus>("idle");
  const [invError, setInvError] = useState<string | null>(null);

  const [invUpdated, setInvUpdated] = useState(false);

  const handleInventorySubmit = async () => {
    if (warehouseStock === "" && storeStock === "") return;
    setInvStatus("loading");
    setInvError(null);
    try {
      const res = await fetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code:    product.code,
          product_name:    product.name,
          warehouse_stock: warehouseStock !== "" ? Number(warehouseStock) : null,
          store_stock:     storeStock     !== "" ? Number(storeStock)     : null,
          system_stock:    product.current_stock != null ? Number(product.current_stock) : null,
          optimal_stock:   product.optimal_stock != null ? Number(product.optimal_stock) : null,
          checked_by:      checkedBy ?? "",
        }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        setInvUpdated(!!body.updated);
        setInvStatus("done");
      } else {
        const body = await res.json().catch(() => ({}));
        setInvError(body.error ?? `서버 오류 (${res.status})`);
        setInvStatus("error");
      }
    } catch (e: any) {
      setInvError(e?.message ?? "네트워크 오류");
      setInvStatus("error");
    }
  };

  const handleOrderRequest = async () => {
    setOrderStatus("loading");
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
      setOrderStatus(res.ok ? "done" : "error");
    } catch {
      setOrderStatus("error");
    }
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

        {/* ── 실재고 입력 (창고 / 매장) ── */}
        {(() => {
          const hasInput = warehouseStock !== "" || storeStock !== "";
          const totalActual = Number(warehouseStock || 0) + Number(storeStock || 0);
          const diff = hasInput && cur != null ? totalActual - cur : null;
          return (
            <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 mb-4">
              <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide mb-2.5">실재고 입력</p>
              <div className="flex items-end gap-2 mb-2">
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1"><Warehouse size={9} />창고</p>
                  <input
                    type="number" min="0"
                    value={warehouseStock}
                    onChange={e => { setWarehouseStock(e.target.value === "" ? "" : Number(e.target.value)); setInvStatus("idle"); }}
                    className="w-full text-2xl font-black text-center bg-white border border-purple-200 rounded-xl px-2 py-2 outline-none focus:border-purple-400 transition"
                    placeholder="—"
                  />
                </div>
                <span className="text-lg font-bold text-purple-300 pb-2">+</span>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1"><Store size={9} />매장</p>
                  <input
                    type="number" min="0"
                    value={storeStock}
                    onChange={e => { setStoreStock(e.target.value === "" ? "" : Number(e.target.value)); setInvStatus("idle"); }}
                    className="w-full text-2xl font-black text-center bg-white border border-purple-200 rounded-xl px-2 py-2 outline-none focus:border-purple-400 transition"
                    placeholder="—"
                  />
                </div>
              </div>
              {hasInput && (
                <div className="flex items-center justify-between text-[11px] font-bold mb-2.5 px-1">
                  <span className="text-purple-700">합계: {totalActual}개</span>
                  {diff != null && (
                    <span className={diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-gray-500"}>
                      현재고 대비 {diff > 0 ? "+" : ""}{diff}개
                    </span>
                  )}
                </div>
              )}
              {invStatus === "done" ? (
                <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  <CheckCircle2 size={13} />{invUpdated ? "기존 실재고 기록이 업데이트되었습니다" : "실재고 차이 목록에 등록되었습니다"}
                </div>
              ) : (
                <button
                  onClick={handleInventorySubmit}
                  disabled={invStatus === "loading" || (!hasInput)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-50 bg-purple-500 hover:bg-purple-600 text-white shadow-sm"
                >
                  {invStatus === "loading" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
                  {invStatus === "loading" ? "등록 중..." : invStatus === "error" ? "재시도" : "확인 제출"}
                </button>
              )}
              {invStatus === "error" && (
                <p className="text-[10px] text-red-500 text-center mt-1">{invError ?? "등록 실패 — 다시 시도해주세요"}</p>
              )}
            </div>
          );
        })()}

        {/* ── 발주요청 버튼 ── */}
        <div className="mb-4">
          {orderStatus === "done" ? (
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
              {orderStatus === "loading" ? "요청 중..." : orderStatus === "error" ? "재시도" : "발주 요청"}
            </button>
          )}
          {orderStatus === "error" && (
            <p className="text-[10px] text-red-500 text-center mt-1">요청 실패 — 다시 시도해주세요</p>
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
