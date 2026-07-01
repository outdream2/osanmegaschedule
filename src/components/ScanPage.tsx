import React, { useEffect, useState } from "react";
import { ZONE_DEFS } from "../constants/displayZones";
import { BarcodeScanner } from "./BarcodeScanner";
import { loadZBar } from "./BarcodeScanner/zbar";
import {
  ScanLine,
  Bell,
  CheckCircle2,
  Package,
  Loader2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { getProductsMap, lookupProduct, isProductsLoaded, updateCachedProduct, type ProductInfo } from "../lib/productsCache";
import { ProductInfoCard } from "./ScanPage/ProductInfoCard";
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
  const [mapLoading, setMapLoading] = useState(false); // products map loading (first time only)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [productNotFound, setProductNotFound] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // ZBar WASM 미리 로드 — 스캔 버튼 누르기 전에 로딩 완료되도록
  useEffect(() => { loadZBar(); }, []);

  useEffect(() => {
    // If not yet loaded, trigger load and show spinner
    if (!isProductsLoaded()) {
      setMapLoading(true);
      getProductsMap().then(() => setMapLoading(false));
    }
    // Load zone assignments
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
      } catch {
        // fallback: empty
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 전산 배정구역: spec 파싱
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

  // 실제 배정구역: realMap 파싱
  const realMapZone: Zone | null = (() => {
    if (!product) return null;
    const rm: string | null = product.realMap ?? product.real_map ?? null;
    if (!rm) return null;
    const m = rm.match(/^(\d+)번/);
    if (!m) return null;
    return zones.find(z => z.num === parseInt(m[1])) ?? null;
  })();

  const matchedZones = specZones; // 하위 호환 (진열요청 로직에서 사용)

  const handleScan = async (result: string) => {
    setScanResult(result);
    setProduct(null);
    setProductNotFound(false);
    setRequestedIds(new Set());
    setScannerOpen(false);

    // If not yet loaded, wait (rare — prefetch starts on login)
    if (!isProductsLoaded()) {
      setMapLoading(true);
      await getProductsMap();
      setMapLoading(false);
    }
    const found = lookupProduct(result);
    if (found) setProduct(found);
    else setProductNotFound(true);
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
    setToast(`${zone.assignedStaffName}님께 요청 전송됨`);
    setTimeout(() => setToast(null), 3000);
  };

  const reset = () => {
    setScanResult(null);
    setProduct(null);
    setProductNotFound(false);
    setRequestedIds(new Set());
  };

  const handleRealMapUpdate = (newVal: string) => {
    setProduct((prev) => (prev ? { ...prev, realMap: newVal } : prev));
    if (scanResult) updateCachedProduct(scanResult, { realMap: newVal || null });
  };

  const staffIds = [...new Set(zones.map((z) => z.assignedStaffId).filter(Boolean))] as number[];
  const staffColorMap = new Map(staffIds.map((id, i) => [id, i]));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Shared App Nav Header */}
      <AppNavHeader
        activePage="scan"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          scanResult ? (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-100 border border-gray-200 hover:bg-gray-200 transition cursor-pointer"
            >
              <RotateCcw size={12} /> 초기화
            </button>
          ) : undefined
        }
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-4 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 max-w-xs">
          <Bell size={13} /> {toast}
        </div>
      )}

      {scannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
          title="상품 바코드 스캔"
        />
      )}

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm">구역 정보 불러오는 중...</span>
          </div>
        ) : !scanResult ? (
          /* ── 초기 화면 ── */
          <div className="flex flex-col items-center justify-center gap-6 py-20">
            <div className="w-24 h-24 rounded-3xl bg-teal-50 border-2 border-teal-200 flex items-center justify-center">
              <ScanLine size={44} className="text-teal-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-800 mb-1">상품 바코드를 스캔하세요</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                스캔 후 상품명·배정구역을 확인하고<br />담당자에게 진열 보충 요청을 전송합니다
              </p>
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl shadow-md transition cursor-pointer text-sm"
            >
              <ScanLine size={18} />
              스캔 시작
            </button>
          </div>
        ) : (
          <>
            {/* ── 스캔 결과 바 ── */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-teal-50 border border-teal-200 rounded-2xl">
              <div className="flex items-center gap-2 min-w-0">
                <ScanLine size={16} className="text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-teal-600 font-bold uppercase tracking-wide">스캔된 코드</p>
                  <p className="text-sm font-black text-gray-800 truncate font-mono">{scanResult}</p>
                </div>
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-teal-400 hover:text-teal-700 transition cursor-pointer"
              >
                <ScanLine size={11} /> 다시 스캔
              </button>
            </div>

            {/* ── 다른 상품 스캔 버튼 (발주요청 위, 항상 노출) ── */}
            <button
              onClick={() => setScannerOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl shadow-md transition cursor-pointer text-sm"
            >
              <ScanLine size={16} /> 다른 상품 스캔
            </button>

            {/* ── 상품 정보 카드 ── */}
            {mapLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">상품 정보 조회 중...</span>
              </div>
            ) : productNotFound ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                <AlertCircle size={18} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">등록되지 않은 상품 코드</p>
                  <p className="text-xs text-amber-600">상품 리스트에서 해당 코드를 찾을 수 없습니다</p>
                </div>
              </div>
            ) : product ? (
              <ProductInfoCard
                product={product}
                onRealMapUpdate={handleRealMapUpdate}
                checkedBy={authSession?.employeeName ?? ""}
              />
            ) : null}

            {/* ── 매칭 구역 ── */}
            {!mapLoading && (product || productNotFound) && (() => {
              const renderZoneCard = (zone: Zone) => {
                const colorIdx = zone.assignedStaffId !== null ? (staffColorMap.get(zone.assignedStaffId) ?? 0) : 0;
                const requested = requestedIds.has(zone.id);
                return (
                  <div key={zone.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border-2 ${
                      zone.status === "empty" ? "bg-red-100 border-red-300" :
                      zone.status === "low"   ? "bg-amber-100 border-amber-300" :
                                                "bg-teal-100 border-teal-300"
                    }`}>
                      <span className="text-xs font-black text-gray-700 leading-tight">{zone.num}번</span>
                      <span className={`text-[9px] font-bold ${
                        zone.status === "empty" ? "text-red-600" :
                        zone.status === "low"   ? "text-amber-600" :
                                                  "text-teal-600"
                      }`}>{STATUS_LABEL[zone.status]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{zone.label}</p>
                      <p className="text-[11px] text-gray-400 truncate">{zone.category}</p>
                      {zone.products && (
                        <p className="text-[11px] text-indigo-600 font-medium truncate mt-0.5">{zone.products}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {zone.assignedStaffId ? (
                        <>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STAFF_COLORS[colorIdx % STAFF_COLORS.length]}`}>
                            {zone.assignedStaffName}
                          </span>
                          {requested ? (
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                              <CheckCircle2 size={12} /> 요청됨
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRequest(zone)}
                              className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition cursor-pointer shadow-sm"
                            >
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

              if (specZones.length === 0 && !realMapZone) {
                return (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <Package size={28} className="text-gray-300" />
                    <p className="text-sm font-bold text-gray-500">
                      {productNotFound ? "구역을 찾을 수 없습니다" : `"${product?.spec}" 구역을 찾을 수 없습니다`}
                    </p>
                    <p className="text-xs text-gray-400">구역 번호가 매장 배치도와 다를 수 있습니다</p>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-4">
                  {realMapZone && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest px-1">실제 배정구역</p>
                      {renderZoneCard(realMapZone)}
                    </div>
                  )}
                  {specZones.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">전산 배정구역</p>
                      {specZones.map(renderZoneCard)}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
};
