// 실재고입력 (ScanPage) · 2026-07-29 좌우분할 재구성 (사용자 요청)
// 좌: 바코드 스캐너 + 최근 스캔 상품 정보 + 진열구역 매칭·요청
// 우: 스캔한 상품들 자동 등록 리스트 (실재고 카드) · 창고/매장 실재고 입력·저장
//
// 목적: 상품입고와 동일 UX 패턴 · 배치 실재고 입력 편의성

import React, { useEffect, useState, useCallback } from "react";
import { ZONE_DEFS } from "../constants/displayZones";
import { BarcodeScanner } from "./BarcodeScanner";
import { loadZBar } from "./BarcodeScanner/zbar";
import {
  ScanLine, Bell, CheckCircle2, Package, Loader2, RotateCcw, AlertCircle,
  Warehouse, Store, Trash2, X as XIcon,
} from "lucide-react";
import { getProductsMap, lookupProduct, isProductsLoaded, updateCachedProduct, type ProductInfo } from "../lib/productsCache";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../types";

interface ScanPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type ZoneStatus = "normal" | "low" | "empty";
const STATUS_LABEL: Record<ZoneStatus, string> = { normal: "정상", low: "부족", empty: "품절" };

interface Zone {
  id: string;
  num: number;
  label: string;
  category: string;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: ZoneStatus;
  products: string;
}

// 우측 리스트 아이템 (실재고 입력 카드)
interface StockCard {
  key: string;                 // barcode + timestamp
  code: string;
  product: ProductInfo;
  addedAt: number;
  warehouseStock: number | "";
  storeStock: number | "";
  whStatus: "idle" | "loading" | "done" | "error";
  stStatus: "idle" | "loading" | "done" | "error";
  whError: string | null;
  stError: string | null;
}

const STAFF_COLORS = [
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-sky-100 text-sky-800 border-sky-300",
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-teal-100 text-teal-800 border-teal-300",
  "bg-orange-100 text-orange-800 border-orange-300",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
];

// 규격에서 구역 번호 추출: "9B" → [9], "2A/24" → [2, 24], "21" → [21]
function extractZoneNums(spec: string): number[] {
  return [...new Set(
    spec.split("/").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0)
  )];
}

export const ScanPage: React.FC<ScanPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);      // zones loading
  const [mapLoading, setMapLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [productNotFound, setProductNotFound] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  // 2026-07-29 · 우측 리스트 · 스캔한 상품들 카드로 자동 등록
  const [stockCards, setStockCards] = useState<StockCard[]>([]);
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);

  useEffect(() => { loadZBar(); }, []);

  useEffect(() => {
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
    (async () => {
      try {
        const res = await fetch("/api/zones");
        if (!res.ok) throw new Error();
        const rows: Array<{ zone_id: string; employee_id: number | null; employee_name: string; status: string; products: string }> = await res.json();
        const mapped: Zone[] = ZONE_DEFS.map((def) => {
          const row = rows.find((r) => r.zone_id === String(def.num));
          return {
            id: String(def.num),
            num: def.num,
            label: def.label,
            category: def.category,
            assignedStaffId: row?.employee_id ?? null,
            assignedStaffName: row?.employee_name ?? "",
            status: (row?.status as ZoneStatus) ?? "normal",
            products: row?.products ?? "",
          };
        });
        setZones(mapped);
      } catch { /* fallback empty */ }
      finally { setLoading(false); }
    })();
  }, []);

  const showToast = (msg: string, ms = 2000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const specZones: Zone[] = (() => {
    if (!product) return [];
    const spec: string = product.spec ?? "";
    const nums = extractZoneNums(spec);
    if (nums.length > 0) return zones.filter(z => nums.includes(z.num));
    const q = spec.toLowerCase();
    if (!q) return [];
    return zones.filter(z =>
      z.products.toLowerCase().includes(q) || z.category.toLowerCase().includes(q)
    );
  })();

  const realMapZone: Zone | null = (() => {
    if (!product) return null;
    const rm: string | null = product.realMap ?? product.real_map ?? null;
    if (!rm) return null;
    const m = rm.match(/^(\d+)번/);
    if (!m) return null;
    return zones.find(z => z.num === parseInt(m[1])) ?? null;
  })();

  const handleScan = async (result: string) => {
    setScanResult(result);
    setProduct(null);
    setProductNotFound(false);
    setRequestedIds(new Set());
    setScannerOpen(false);

    if (!isProductsLoaded()) {
      setMapLoading(true);
      await getProductsMap();
      setMapLoading(false);
    }
    const found = lookupProduct(result);
    if (!found) {
      setProductNotFound(true);
      showToast("등록되지 않은 상품");
      return;
    }
    setProduct(found);
    // 2026-07-29 · 우측 카드 리스트에 등록 · 중복 방지
    let addedKey: string;
    const existingIdx = stockCards.findIndex(c => c.code === result);
    if (existingIdx >= 0) {
      addedKey = stockCards[existingIdx].key;
    } else {
      const newCard: StockCard = {
        key: `${result}-${Date.now()}`,
        code: result,
        product: found,
        addedAt: Date.now(),
        warehouseStock: "",
        storeStock: "",
        whStatus: "idle",
        stStatus: "idle",
        whError: null,
        stError: null,
      };
      addedKey = newCard.key;
      setStockCards(prev => [newCard, ...prev]);
      // 기존 실재고 자동 로드
      fetch(`/api/inventory-checks?product_code=${encodeURIComponent(result)}`)
        .then(r => r.ok ? r.json() : [])
        .then((list: any[]) => {
          const last = list[0];
          if (last) {
            setStockCards(prev => prev.map(c => c.key === newCard.key
              ? {
                  ...c,
                  warehouseStock: last.warehouse_stock != null ? Number(last.warehouse_stock) : "",
                  storeStock: last.store_stock != null ? Number(last.store_stock) : "",
                }
              : c));
          }
        }).catch(() => {});
    }
    setLastAddedKey(addedKey);
  };

  const handleRequest = async (zone: Zone) => {
    if (!zone.assignedStaffId) return;
    const productNote = product ? `${product.name} (${product.spec})` : "바코드 스캔 요청";
    fetch("/api/display-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zone_id: zone.id,
        zone_label: `${zone.num}번 ${zone.label}`,
        category: zone.category,
        requested_at: new Date().toISOString(),
        assigned_staff_id: zone.assignedStaffId,
        assigned_staff_name: zone.assignedStaffName,
        note: productNote,
      }),
    }).catch(() => {});
    fetch("/api/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: zone.assignedStaffId,
        title: "📦 진열 보충 요청",
        body: product
          ? `[${product.name}] ${zone.num}번 ${zone.label} 보충 필요`
          : `${zone.num}번 ${zone.label} (${zone.category}) 보충 필요`,
        url: "/",
      }),
    }).catch(() => {});
    setRequestedIds((prev) => new Set([...prev, zone.id]));
    showToast(`${zone.assignedStaffName}님께 요청 전송됨`);
  };

  const reset = () => {
    setScanResult(null);
    setProduct(null);
    setProductNotFound(false);
    setRequestedIds(new Set());
  };

  const resetAllCards = () => {
    if (stockCards.length === 0) return;
    if (!window.confirm(`등록된 ${stockCards.length}개 카드를 모두 초기화할까요?`)) return;
    setStockCards([]);
    setLastAddedKey(null);
  };

  const removeCard = (key: string) => {
    setStockCards(prev => prev.filter(c => c.key !== key));
  };

  const updateCardField = (key: string, patch: Partial<StockCard>) => {
    setStockCards(prev => prev.map(c => c.key === key ? { ...c, ...patch } : c));
  };

  // 창고 실재고 저장
  const saveWarehouseStock = useCallback(async (card: StockCard) => {
    const v = card.warehouseStock;
    if (v === "" || v == null) { updateCardField(card.key, { whError: "숫자 입력 필요", whStatus: "error" }); return; }
    updateCardField(card.key, { whStatus: "loading", whError: null });
    try {
      const res = await fetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: card.code,
          warehouse_stock: Number(v),
          checked_by: authSession?.employeeName ?? "익명",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        updateCardField(card.key, { whStatus: "error", whError: b.error ?? `저장 실패 (${res.status})` });
        return;
      }
      updateCardField(card.key, { whStatus: "done", whError: null });
    } catch (e: any) {
      updateCardField(card.key, { whStatus: "error", whError: e?.message ?? "네트워크 오류" });
    }
  }, [authSession]);

  // 매장 실재고 저장
  const saveStoreStock = useCallback(async (card: StockCard) => {
    const v = card.storeStock;
    if (v === "" || v == null) { updateCardField(card.key, { stError: "숫자 입력 필요", stStatus: "error" }); return; }
    updateCardField(card.key, { stStatus: "loading", stError: null });
    try {
      const res = await fetch("/api/inventory-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: card.code,
          store_stock: Number(v),
          checked_by: authSession?.employeeName ?? "익명",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        updateCardField(card.key, { stStatus: "error", stError: b.error ?? `저장 실패 (${res.status})` });
        return;
      }
      updateCardField(card.key, { stStatus: "done", stError: null });
    } catch (e: any) {
      updateCardField(card.key, { stStatus: "error", stError: e?.message ?? "네트워크 오류" });
    }
  }, [authSession]);

  const handleRealMapUpdate = (newVal: string) => {
    setProduct((prev) => (prev ? { ...prev, realMap: newVal } : prev));
    if (scanResult) updateCachedProduct(scanResult, { realMap: newVal || null });
  };

  const staffIds = [...new Set(zones.map((z) => z.assignedStaffId).filter(Boolean))] as number[];
  const staffColorMap = new Map(staffIds.map((id, i) => [id, i]));

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppNavHeader
        activePage="scan"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          (scanResult || stockCards.length > 0) ? (
            <div className="flex items-center gap-1.5">
              {scanResult && (
                <button onClick={reset}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-100 border border-gray-200 hover:bg-gray-200 transition cursor-pointer">
                  <RotateCcw size={12} /> 좌측 초기화
                </button>
              )}
              {stockCards.length > 0 && (
                <button onClick={resetAllCards}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:text-rose-800 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer">
                  <RotateCcw size={12} /> 리스트 초기화
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      {toast && (
        <div className="fixed top-5 right-4 z-50 bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {scannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
          title="상품 바코드 스캔"
        />
      )}

      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 py-3 sm:py-4 flex flex-col lg:flex-row gap-3 sm:gap-4">
        {/* ─── 좌측 · 스캐너 + 상품정보 + 진열구역 ─── */}
        <section className="lg:w-[380px] lg:shrink-0 flex flex-col gap-3 lg:sticky lg:top-3 lg:self-start">
          {/* 스캐너 카드 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col items-center gap-3">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center shrink-0">
              <ScanLine size={30} className="text-teal-500" />
            </div>
            <div className="text-center">
              <p className="text-base sm:text-lg font-black text-slate-800">실재고 입력</p>
              <p className="text-[12px] sm:text-[13px] text-slate-500 mt-1 leading-relaxed">
                상품 바코드를 스캔하면<br />오른쪽 카드로 자동 등록됩니다
              </p>
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              disabled={mapLoading || loading}
              className="w-full min-h-[52px] flex items-center justify-center gap-2 py-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-black rounded-2xl shadow-md transition cursor-pointer text-[15px]"
            >
              {mapLoading || loading ? <Loader2 size={18} className="animate-spin" /> : <ScanLine size={18} />}
              {mapLoading ? "상품 정보 로딩..." : loading ? "구역 정보 로딩..." : "바코드 스캔"}
            </button>
            {productNotFound && scanResult && (
              <div className="w-full flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[12px] leading-tight min-w-0">
                  <p className="font-black text-amber-800">미등록 상품 코드</p>
                  <p className="tabular-nums text-amber-700 break-all mt-0.5">{scanResult}</p>
                </div>
              </div>
            )}
          </div>

          {/* 최근 스캔 상품 정보 */}
          {product && (
            <div className="bg-white rounded-2xl border-2 border-teal-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
                <span className="text-[11px] font-black text-teal-700 uppercase tracking-wider">최근 스캔</span>
                {scanResult && (
                  <span className="text-[11px] tabular-nums text-teal-600 ml-auto">#{scanResult}</span>
                )}
              </div>
              <p className="text-[15px] font-black text-slate-800 break-words whitespace-normal leading-snug mb-1">
                {product.name}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                {product.spec && (
                  <span className="font-bold text-slate-600 break-words whitespace-normal">{product.spec}</span>
                )}
                {product.supplier && (
                  <span className="inline-flex items-center gap-1 font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-md px-2 py-0.5">
                    {product.supplier}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 진열구역 매칭 · 실제/전산 */}
          {!mapLoading && (product || productNotFound) && (() => {
            const renderZoneCard = (zone: Zone) => {
              const colorIdx = zone.assignedStaffId !== null ? (staffColorMap.get(zone.assignedStaffId) ?? 0) : 0;
              const requested = requestedIds.has(zone.id);
              return (
                <div key={zone.id} className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border-2 ${
                    zone.status === "empty" ? "bg-red-100 border-red-300" :
                    zone.status === "low"   ? "bg-amber-100 border-amber-300" :
                                              "bg-teal-100 border-teal-300"
                  }`}>
                    <span className="text-[11px] font-black text-gray-700 leading-tight">{zone.num}번</span>
                    <span className={`text-[9px] font-bold ${
                      zone.status === "empty" ? "text-red-600" :
                      zone.status === "low"   ? "text-amber-600" :
                                                "text-teal-600"
                    }`}>{STATUS_LABEL[zone.status]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-800 break-words leading-tight">{zone.label}</p>
                    <p className="text-[11px] text-gray-400 break-words">{zone.category}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {zone.assignedStaffId ? (
                      <>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STAFF_COLORS[colorIdx % STAFF_COLORS.length]}`}>
                          {zone.assignedStaffName}
                        </span>
                        {requested ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <CheckCircle2 size={11} /> 요청됨
                          </span>
                        ) : (
                          <button onClick={() => handleRequest(zone)}
                            className="flex items-center gap-1 text-[11px] font-black px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg transition cursor-pointer shadow-sm">
                            <Bell size={11} /> 진열요청
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-400 font-medium">담당자 미배정</span>
                    )}
                  </div>
                </div>
              );
            };

            if (specZones.length === 0 && !realMapZone) return null;
            return (
              <div className="flex flex-col gap-2">
                {realMapZone && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest px-1">실제배치구역</p>
                    {renderZoneCard(realMapZone)}
                  </div>
                )}
                {specZones.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">전산배치구역</p>
                    {specZones.map(renderZoneCard)}
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* ─── 우측 · 실재고 카드 리스트 ─── */}
        <section className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 bg-slate-50/60 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Package size={15} className="text-teal-600" />
                <span className="text-[14px] font-black text-slate-800">등록된 상품 · 실재고 입력</span>
                <span className="text-[12px] tabular-nums font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
                  {stockCards.length}건
                </span>
              </div>
            </div>

            {stockCards.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-14 sm:py-20 text-slate-400">
                <Package size={36} className="text-slate-300" />
                <p className="text-[13px] font-black">스캔한 상품이 여기에 카드로 등록됩니다</p>
                <p className="text-[12px] text-slate-400">각 카드에서 창고·매장 실재고 저장</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto max-h-[68vh] p-3 sm:p-4 flex flex-col gap-3">
                {stockCards.map(card => {
                  const isRecent = card.key === lastAddedKey;
                  const d = new Date(card.addedAt);
                  const arrivedAt = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                  return (
                    <div key={card.key}
                      className={`bg-white rounded-2xl border shadow-sm p-3.5 sm:p-4 transition ${isRecent ? "border-teal-400 ring-2 ring-teal-200 bg-teal-50/30" : "border-slate-200 hover:shadow-md"}`}>
                      {/* 1행 · 스캔 시각 · 공급사 · 삭제 */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[11px] tabular-nums font-bold text-slate-500">
                          {arrivedAt}
                        </span>
                        {card.product.supplier && (
                          <span className="text-[12px] font-bold text-sky-700">
                            공급사 {card.product.supplier}
                          </span>
                        )}
                        <button onClick={() => removeCard(card.key)}
                          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                          title="카드 삭제">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      {/* 2행 · 상품명 (크게) */}
                      <p className="text-[16px] sm:text-[17px] font-black text-slate-900 break-words whitespace-normal leading-snug mb-1">
                        {card.product.name}
                      </p>
                      {/* 규격·코드 */}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        {card.product.spec && (
                          <span className="text-[12px] text-slate-600 font-bold break-words whitespace-normal">{card.product.spec}</span>
                        )}
                        <span className="text-[12px] text-slate-400 tabular-nums">#{card.code}</span>
                      </div>

                      {/* 3행 · 창고 · 매장 실재고 입력 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* 창고 */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2">
                          <Warehouse size={16} className="text-orange-600 shrink-0" />
                          <span className="text-[12px] font-black text-slate-600 shrink-0">창고</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={card.warehouseStock}
                            onChange={e => updateCardField(card.key, { warehouseStock: e.target.value === "" ? "" : Number(e.target.value), whStatus: "idle" })}
                            placeholder="0"
                            className="flex-1 min-w-0 h-9 text-right px-2 bg-white border border-slate-200 rounded-lg text-[15px] font-black tabular-nums focus:outline-none focus:border-orange-400"
                          />
                          <button onClick={() => saveWarehouseStock(card)}
                            disabled={card.whStatus === "loading" || card.warehouseStock === ""}
                            className={`h-9 px-3 rounded-lg text-[12px] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              card.whStatus === "done" ? "bg-emerald-500 text-white" :
                              card.whStatus === "error" ? "bg-rose-500 text-white" :
                              "bg-orange-500 hover:bg-orange-600 text-white"
                            }`}>
                            {card.whStatus === "loading" ? <Loader2 size={13} className="animate-spin" /> :
                             card.whStatus === "done" ? "✓" : "저장"}
                          </button>
                        </div>
                        {/* 매장 */}
                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2">
                          <Store size={16} className="text-emerald-600 shrink-0" />
                          <span className="text-[12px] font-black text-slate-600 shrink-0">매장</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            value={card.storeStock}
                            onChange={e => updateCardField(card.key, { storeStock: e.target.value === "" ? "" : Number(e.target.value), stStatus: "idle" })}
                            placeholder="0"
                            className="flex-1 min-w-0 h-9 text-right px-2 bg-white border border-slate-200 rounded-lg text-[15px] font-black tabular-nums focus:outline-none focus:border-emerald-400"
                          />
                          <button onClick={() => saveStoreStock(card)}
                            disabled={card.stStatus === "loading" || card.storeStock === ""}
                            className={`h-9 px-3 rounded-lg text-[12px] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              card.stStatus === "done" ? "bg-emerald-500 text-white" :
                              card.stStatus === "error" ? "bg-rose-500 text-white" :
                              "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}>
                            {card.stStatus === "loading" ? <Loader2 size={13} className="animate-spin" /> :
                             card.stStatus === "done" ? "✓" : "저장"}
                          </button>
                        </div>
                      </div>
                      {/* 오류 표시 */}
                      {(card.whError || card.stError) && (
                        <div className="mt-1.5 text-[11px] text-rose-600 font-semibold">
                          {card.whError && <div>창고: {card.whError}</div>}
                          {card.stError && <div>매장: {card.stError}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
