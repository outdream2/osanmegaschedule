import React, { useEffect, useState } from "react";
import {
  ChevronLeft, Bell, Package, MapPin, AlertTriangle,
  CheckCircle2, Clock, List, RefreshCw, ArrowRight,
} from "lucide-react";
import { getProductsMap, type ProductInfo } from "../lib/productsCache";

interface RequestsPageProps {
  onBack: () => void;
}

interface DisplayRequest {
  id: string;
  zoneId: string;
  zoneLabel: string;
  category: string;
  requestedAt: string;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: "pending" | "done";
  note: string;
}

type Tab = "display" | "order" | "mismatch";

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso; }
}

export const RequestsPage: React.FC<RequestsPageProps> = ({ onBack }) => {
  const [tab, setTab] = useState<Tab>("display");
  const [requests, setRequests] = useState<DisplayRequest[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const loadRequests = () => {
    try {
      const raw = localStorage.getItem("megatown_display_requests");
      setRequests(raw ? JSON.parse(raw) : []);
    } catch { setRequests([]); }
  };

  useEffect(() => { loadRequests(); }, []);

  useEffect(() => {
    if ((tab === "order" || tab === "mismatch") && products.length === 0) {
      setProductsLoading(true);
      getProductsMap()
        .then(map => setProducts(Object.values(map)))
        .finally(() => setProductsLoading(false));
    }
  }, [tab]);

  const pending = requests.filter(r => r.status === "pending");
  const done    = requests.filter(r => r.status === "done");

  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock  != null ? Number(p.optimal_stock)  : NaN;
    return !isNaN(cur) && !isNaN(opt) && opt > 0 && cur < opt;
  }).sort((a, b) =>
    (Number(b.optimal_stock) - Number(b.current_stock)) -
    (Number(a.optimal_stock) - Number(a.current_stock))
  );

  const mismatch = products.filter(p =>
    p.real_map && p.real_map !== (p.spec || "미지정")
  );

  const TABS: [Tab, string, number, string, string][] = [
    ["display",  "진열요청",   pending.length,   "text-blue-600",   "border-blue-500"],
    ["order",    "발주요청",   lowStock.length,  "text-red-600",    "border-red-500"],
    ["mismatch", "구역불일치", mismatch.length,  "text-orange-600", "border-orange-500"],
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4 shadow-sm sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 text-xs font-semibold cursor-pointer"
        >
          <ChevronLeft size={13} />
          <span className="hidden sm:inline">메인</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <List size={14} className="text-white" />
          </div>
          <span className="font-black text-gray-900 text-base tracking-tight">요청목록 조회</span>
        </div>
      </header>

      {/* 탭 바 */}
      <div className="bg-white border-b border-gray-200 flex sticky top-14 z-20">
        {TABS.map(([key, label, count, color, border]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 border-b-2 transition cursor-pointer ${
              tab === key ? `${color} ${border}` : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            <span className="text-[11px] font-black">{label}</span>
            <span className={`text-[10px] font-bold ${tab === key ? color : "text-gray-400"}`}>
              {productsLoading && key !== "display" ? "…" : `${count}건`}
            </span>
          </button>
        ))}
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">

        {/* ── 진열요청 리스트 ── */}
        {tab === "display" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                대기 <strong className="text-blue-600">{pending.length}</strong>건 ·
                완료 <strong className="text-gray-400">{done.length}</strong>건
              </p>
              <button
                onClick={loadRequests}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition"
              >
                <RefreshCw size={11} /> 새로고침
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <Bell size={36} className="mb-3" />
                <p className="text-sm font-bold text-gray-400">진열요청이 없습니다</p>
              </div>
            ) : (
              <>
                {pending.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">대기 중</p>
                    {pending.map(r => (
                      <div key={r.id} className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900">{r.zoneLabel}</p>
                            <p className="text-[11px] text-gray-400">{r.category}</p>
                          </div>
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full">
                            <Clock size={9} /> 대기
                          </span>
                        </div>
                        {r.note && (
                          <p className="text-xs text-indigo-700 font-medium mb-2 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                            {r.note}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>담당: <strong className="text-gray-600">{r.assignedStaffName || "미배정"}</strong></span>
                          <span>{fmtDate(r.requestedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {done.length > 0 && (
                  <section className="flex flex-col gap-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">완료</p>
                    {done.map(r => (
                      <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm opacity-55">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-700">{r.zoneLabel}</p>
                            <p className="text-[11px] text-gray-400">{r.category}</p>
                          </div>
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full">
                            <CheckCircle2 size={9} /> 완료
                          </span>
                        </div>
                        {r.note && <p className="text-xs text-gray-500 mb-1">{r.note}</p>}
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>담당: {r.assignedStaffName || "미배정"}</span>
                          <span>{fmtDate(r.requestedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 발주요청 리스트 ── */}
        {tab === "order" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              현재고 &lt; 적정재고 상품 <strong className="text-red-600">{lowStock.length}</strong>건
              <span className="ml-1 text-gray-400">(부족량 내림차순)</span>
            </p>

            {productsLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : lowStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <Package size={36} className="mb-3" />
                <p className="text-sm font-bold text-gray-400">발주 필요 상품이 없습니다</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {lowStock.map(p => {
                  const cur = Number(p.current_stock);
                  const opt = Number(p.optimal_stock);
                  const short = opt - cur;
                  return (
                    <div key={p.code} className="bg-white border border-red-100 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-gray-900 leading-tight truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{p.code}</p>
                        </div>
                        <span className="shrink-0 text-[11px] font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                          -{short}개 부족
                        </span>
                      </div>
                      <div className="flex items-end gap-4">
                        <div>
                          <p className="text-[9px] font-bold text-gray-400 mb-0.5">현재고</p>
                          <p className="text-xl font-black text-red-500 leading-none">{cur}</p>
                        </div>
                        <div className="pb-0.5 text-gray-300 text-lg">/</div>
                        <div>
                          <p className="text-[9px] font-bold text-amber-600 mb-0.5">적정재고</p>
                          <p className="text-xl font-black text-amber-700 leading-none">{opt}</p>
                        </div>
                        {p.spec && (
                          <div className="ml-auto text-right">
                            <p className="text-[9px] font-bold text-gray-400 mb-0.5">배정구역</p>
                            <p className="text-xs font-bold text-gray-600">{p.spec}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 배정구역 불일치 ── */}
        {tab === "mismatch" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              전산 ≠ 실제 배정구역 <strong className="text-orange-600">{mismatch.length}</strong>건
            </p>

            {productsLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mismatch.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <MapPin size={36} className="mb-3" />
                <p className="text-sm font-bold text-gray-400">불일치 상품이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1 text-center leading-relaxed">
                  상품 스캔 후 실제 배정구역을<br />등록하면 여기서 확인할 수 있습니다
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {mismatch.map(p => (
                  <div key={p.code} className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
                    <p className="text-sm font-black text-gray-900 mb-3 truncate">{p.name}</p>
                    <div className="flex items-stretch gap-2">
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">전산 배정구역</p>
                        <p className="text-xs font-bold text-gray-700">{p.spec || "미지정"}</p>
                      </div>
                      <div className="flex items-center">
                        <ArrowRight size={14} className="text-orange-400" />
                      </div>
                      <div className="flex-1 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
                        <p className="text-[9px] font-bold text-orange-500 uppercase mb-1">실제 배정구역</p>
                        <p className="text-xs font-black text-red-600">{p.real_map}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-2">{p.code}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
