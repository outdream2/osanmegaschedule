import React, { useEffect, useState } from "react";
import { ZONE_DEFS } from "../constants/displayZones";
import { BarcodeScanner } from "./BarcodeScanner";
import {
  ChevronLeft,
  ScanLine,
  Bell,
  CheckCircle2,
  Package,
  Loader2,
  RotateCcw,
} from "lucide-react";

interface ScanPageProps {
  onBack: () => void;
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

export const ScanPage: React.FC<ScanPageProps> = ({ onBack }) => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
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

  const matchedZones: Zone[] = scanResult
    ? zones.filter((z) => {
        const q = scanResult.toLowerCase();
        return (
          z.products.toLowerCase().includes(q) ||
          z.label.toLowerCase().includes(q) ||
          z.category.toLowerCase().includes(q)
        );
      })
    : [];

  const handleScan = (result: string) => {
    setScanResult(result);
    setRequestedIds(new Set());
    setScannerOpen(false);
  };

  const handleRequest = async (zone: Zone) => {
    if (!zone.assignedStaffId) return;
    const req = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      zoneId: zone.id,
      zoneLabel: `${zone.num}번 ${zone.label}`,
      category: zone.category,
      requestedAt: new Date().toISOString(),
      assignedStaffId: zone.assignedStaffId,
      assignedStaffName: zone.assignedStaffName,
      status: "pending",
      note: "바코드 스캔 요청",
    };
    // Persist to localStorage requests list (shared with DisplayPage)
    try {
      const existing = JSON.parse(localStorage.getItem("megatown_display_requests") ?? "[]");
      localStorage.setItem("megatown_display_requests", JSON.stringify([req, ...existing]));
    } catch {}
    // Push notification
    fetch("/api/push-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: zone.assignedStaffId,
        title: "📦 진열 보충 요청",
        body: `${zone.num}번 ${zone.label} (${zone.category}) 보충이 필요합니다.`,
        url: "/",
      }),
    }).catch(() => {});
    setRequestedIds((prev) => new Set([...prev, zone.id]));
    setToast(`${zone.assignedStaffName}님께 ${zone.num}번 ${zone.label} 보충 요청 전송됨`);
    setTimeout(() => setToast(null), 3000);
  };

  const reset = () => {
    setScanResult(null);
    setRequestedIds(new Set());
  };

  // Staff color index (consistent with DisplayPage)
  const staffIds = [...new Set(zones.map((z) => z.assignedStaffId).filter(Boolean))] as number[];
  const staffColorMap = new Map(staffIds.map((id, i) => [id, i]));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900 transition cursor-pointer text-xs font-semibold"
          >
            <ChevronLeft size={13} />
            <span className="hidden sm:inline">메인</span>
          </button>
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shadow-sm">
            <ScanLine size={14} className="text-white" />
          </div>
          <span className="font-black tracking-tight leading-none">
            <span className="text-red-500 text-xl">OSAN</span>
            <span className="hidden sm:inline text-gray-900 text-base"> MEGATOWN</span>
          </span>
          <span className="text-xs font-bold text-gray-500 hidden sm:inline">· 상품 스캔</span>
        </div>
        {scanResult && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-800 bg-gray-100 border border-gray-200 hover:bg-gray-200 transition cursor-pointer"
          >
            <RotateCcw size={12} /> 초기화
          </button>
        )}
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-4 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 max-w-xs">
          <Bell size={13} /> {toast}
        </div>
      )}

      {/* Scanner modal */}
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
            <div className="w-24 h-24 rounded-3xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
              <ScanLine size={44} className="text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-gray-800 mb-1">상품 바코드를 스캔하세요</p>
              <p className="text-sm text-gray-400 leading-relaxed">
                스캔 후 해당 상품 구역의 담당자에게<br />진열 보충 요청을 즉시 전송할 수 있습니다
              </p>
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              className="flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md transition cursor-pointer text-sm"
            >
              <ScanLine size={18} />
              스캔 시작
            </button>
          </div>
        ) : (
          /* ── 스캔 결과 화면 ── */
          <>
            {/* 스캔 결과 바 */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-center gap-2 min-w-0">
                <ScanLine size={16} className="text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">스캔 결과</p>
                  <p className="text-sm font-black text-gray-800 truncate">{scanResult}</p>
                </div>
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:border-emerald-400 hover:text-emerald-700 transition cursor-pointer"
              >
                <ScanLine size={11} /> 다시 스캔
              </button>
            </div>

            {/* 매칭 구역 */}
            {matchedZones.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <Package size={32} className="text-gray-300" />
                <div>
                  <p className="text-sm font-bold text-gray-600 mb-1">해당 상품을 찾을 수 없습니다</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    구역 상세편집에서 상품 메모에<br />바코드 번호를 미리 등록해 주세요
                  </p>
                </div>
                <button
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition cursor-pointer"
                >
                  <ScanLine size={14} /> 다시 스캔
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-500">{matchedZones.length}개 구역에서 검색됨</p>
                {matchedZones.map((zone) => {
                  const colorIdx = zone.assignedStaffId !== null ? (staffColorMap.get(zone.assignedStaffId) ?? 0) : 0;
                  const requested = requestedIds.has(zone.id);
                  return (
                    <div
                      key={zone.id}
                      className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-3"
                    >
                      {/* 구역 배지 */}
                      <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 border-2 ${
                        zone.status === "empty" ? "bg-red-100 border-red-300" :
                        zone.status === "low"   ? "bg-amber-100 border-amber-300" :
                                                  "bg-emerald-100 border-emerald-300"
                      }`}>
                        <span className="text-xs font-black text-gray-700 leading-tight">{zone.num}번</span>
                        <span className={`text-[9px] font-bold ${
                          zone.status === "empty" ? "text-red-600" :
                          zone.status === "low"   ? "text-amber-600" :
                                                    "text-emerald-600"
                        }`}>{STATUS_LABEL[zone.status]}</span>
                      </div>

                      {/* 구역 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{zone.label}</p>
                        <p className="text-[11px] text-gray-400 truncate">{zone.category}</p>
                        {zone.products && (
                          <p className="text-[11px] text-indigo-600 font-medium truncate mt-0.5">{zone.products}</p>
                        )}
                      </div>

                      {/* 담당자 + 요청 버튼 */}
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
                })}

                <button
                  onClick={() => setScannerOpen(true)}
                  className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-200 hover:border-emerald-400 text-gray-400 hover:text-emerald-600 text-sm font-bold rounded-2xl transition cursor-pointer mt-1"
                >
                  <ScanLine size={14} /> 다른 상품 스캔
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
