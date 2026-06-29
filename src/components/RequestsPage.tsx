import React, { useEffect, useState, useCallback } from "react";
import {
  ChevronLeft, Bell, Package, MapPin,
  CheckCircle2, XCircle, Clock, List, RefreshCw, ArrowRight, Trash2, ShoppingCart, CalendarDays,
} from "lucide-react";
import { getProductsMap, type ProductInfo } from "../lib/productsCache";
import type { AuthSession } from "../types";

interface RequestsPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
}

interface DisplayRequest {
  id: string;
  zone_id: string;
  zone_label: string;
  category: string;
  requested_at: string;
  assigned_staff_id: number | null;
  assigned_staff_name: string;
  status: string;
  note: string;
}

interface OrderRequest {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  note: string;
  requested_at: string;
}

interface ZoneMismatch {
  id: string;
  product_code: string;
  product_name: string;
  spec_zone: string;
  real_zone: string;
  registered_at: string;
}

interface LeaveRequest {
  id: string;
  employee_id: number;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const LEAVE_STATUS_LABEL: Record<string, string> = { pending: "대기", approved: "승인", rejected: "반려" };
const LEAVE_STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50 border-amber-200",
  approved: "text-emerald-600 bg-emerald-50 border-emerald-200",
  rejected: "text-rose-600 bg-rose-50 border-rose-200",
};

type Tab = "display" | "order" | "mismatch" | "leave";

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso; }
}

export const RequestsPage: React.FC<RequestsPageProps> = ({ onBack, authSession }) => {
  const [tab, setTab] = useState<Tab>("display");
  const isManager = authSession?.role === "manager" || authSession?.role === "admin" || authSession?.role === "superadmin";

  // 진열요청
  const [displayReqs, setDisplayReqs] = useState<DisplayRequest[]>([]);
  const [displayLoading, setDisplayLoading] = useState(false);
  const [deletingDisplay, setDeletingDisplay] = useState<Set<string>>(new Set());

  // 발주요청 (DB records)
  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState<Set<string>>(new Set());
  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());

  // 발주 필요 상품 (low-stock from cache)
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // 구역불일치
  const [mismatches, setMismatches] = useState<ZoneMismatch[]>([]);
  const [mismatchLoading, setMismatchLoading] = useState(false);
  const [deletingMismatch, setDeletingMismatch] = useState<Set<string>>(new Set());

  // 연차신청
  const [leaveReqs, setLeaveReqs] = useState<LeaveRequest[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [processingLeave, setProcessingLeave] = useState<string | null>(null);
  const [reviewingLeave, setReviewingLeave] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const loadDisplayReqs = useCallback(async () => {
    setDisplayLoading(true);
    try {
      const res = await fetch("/api/display-requests");
      setDisplayReqs(res.ok ? await res.json() : []);
    } catch { setDisplayReqs([]); }
    finally { setDisplayLoading(false); }
  }, []);

  const loadOrderReqs = useCallback(async () => {
    setOrderLoading(true);
    try {
      const res = await fetch("/api/order-requests");
      setOrderReqs(res.ok ? await res.json() : []);
    } catch { setOrderReqs([]); }
    finally { setOrderLoading(false); }
  }, []);

  const loadMismatches = useCallback(async () => {
    setMismatchLoading(true);
    try {
      const res = await fetch("/api/zone-mismatches");
      setMismatches(res.ok ? await res.json() : []);
    } catch { setMismatches([]); }
    finally { setMismatchLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    if (products.length > 0) return;
    setProductsLoading(true);
    try {
      const map = await getProductsMap();
      setProducts(Object.values(map));
    } finally { setProductsLoading(false); }
  }, [products.length]);

  const loadLeaveReqs = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const url = isManager
        ? "/api/leave-requests?all=true"
        : authSession?.employeeId
          ? `/api/leave-requests?employeeId=${authSession.employeeId}`
          : null;
      if (!url) { setLeaveReqs([]); return; }
      const res = await fetch(url);
      setLeaveReqs(res.ok ? await res.json() : []);
    } catch { setLeaveReqs([]); }
    finally { setLeaveLoading(false); }
  }, [isManager, authSession?.employeeId]);

  useEffect(() => { loadDisplayReqs(); }, []);

  useEffect(() => {
    if (tab === "order") { loadOrderReqs(); loadProducts(); }
    if (tab === "mismatch") { loadMismatches(); }
    if (tab === "leave") { loadLeaveReqs(); }
  }, [tab]);

  const handleDeleteDisplay = async (id: string) => {
    setDeletingDisplay(prev => new Set([...prev, id]));
    try {
      await fetch(`/api/display-requests/${id}`, { method: "DELETE" });
      setDisplayReqs(prev => prev.filter(r => r.id !== id));
    } finally {
      setDeletingDisplay(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleDeleteOrder = async (id: string) => {
    setDeletingOrder(prev => new Set([...prev, id]));
    try {
      await fetch(`/api/order-requests/${id}`, { method: "DELETE" });
      setOrderReqs(prev => prev.filter(r => r.id !== id));
    } finally {
      setDeletingOrder(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleRequestOrder = async (p: ProductInfo) => {
    setRequestingOrder(prev => new Set([...prev, p.code]));
    try {
      const res = await fetch("/api/order-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_code: p.code,
          product_name: p.name,
          current_stock: p.current_stock != null ? Number(p.current_stock) : null,
          optimal_stock: p.optimal_stock != null ? Number(p.optimal_stock) : null,
          note: "",
        }),
      });
      if (res.ok) await loadOrderReqs();
    } finally {
      setRequestingOrder(prev => { const s = new Set(prev); s.delete(p.code); return s; });
    }
  };

  const handleDeleteMismatch = async (id: string) => {
    setDeletingMismatch(prev => new Set([...prev, id]));
    try {
      await fetch(`/api/zone-mismatches/${id}`, { method: "DELETE" });
      setMismatches(prev => prev.filter(r => r.id !== id));
    } finally {
      setDeletingMismatch(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleLeaveReview = async (id: string, status: "approved" | "rejected") => {
    setProcessingLeave(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewer_note: reviewNote }),
      });
      if (res.ok) {
        setLeaveReqs(prev => prev.map(r =>
          r.id === id ? { ...r, status, reviewer_note: reviewNote, reviewed_at: new Date().toISOString() } : r
        ));
        setReviewingLeave(null);
        setReviewNote("");
      }
    } finally { setProcessingLeave(null); }
  };

  // 이미 발주요청된 product_code 집합
  const requestedCodes = new Set(orderReqs.map(r => r.product_code));

  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock  != null ? Number(p.optimal_stock)  : NaN;
    return !isNaN(cur) && !isNaN(opt) && opt > 0 && cur < opt;
  }).sort((a, b) =>
    (Number(b.optimal_stock) - Number(b.current_stock)) -
    (Number(a.optimal_stock) - Number(a.current_stock))
  );

  const pending = displayReqs.filter(r => r.status === "pending");
  const done    = displayReqs.filter(r => r.status === "done");

  const leavePending = leaveReqs.filter(r => r.status === "pending").length;

  const TABS: [Tab, string, number, string, string][] = [
    ["display",  "진열요청",   pending.length,   "text-blue-600",   "border-blue-500"],
    ["order",    "발주요청",   orderReqs.length,  "text-red-600",    "border-red-500"],
    ["mismatch", "구역불일치", mismatches.length, "text-orange-600", "border-orange-500"],
    ["leave",    "연차신청",   leaveReqs.length,  "text-green-600",  "border-green-500"],
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
              {count}건
            </span>
          </button>
        ))}
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">

        {/* ── 진열요청 ── */}
        {tab === "display" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                대기 <strong className="text-blue-600">{pending.length}</strong>건 ·
                완료 <strong className="text-gray-400">{done.length}</strong>건
              </p>
              <button
                onClick={loadDisplayReqs}
                disabled={displayLoading}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition"
              >
                <RefreshCw size={11} className={displayLoading ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>

            {displayReqs.length === 0 ? (
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
                            <p className="text-sm font-black text-gray-900">{r.zone_label}</p>
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
                          <span>담당: <strong className="text-gray-600">{r.assigned_staff_name || "미배정"}</strong></span>
                          <span>{fmtDate(r.requested_at)}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteDisplay(r.id)}
                          disabled={deletingDisplay.has(r.id)}
                          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={12} />
                          {deletingDisplay.has(r.id) ? "처리 중..." : "완료"}
                        </button>
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
                            <p className="text-sm font-bold text-gray-700">{r.zone_label}</p>
                            <p className="text-[11px] text-gray-400">{r.category}</p>
                          </div>
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full">
                            <CheckCircle2 size={9} /> 완료
                          </span>
                        </div>
                        {r.note && <p className="text-xs text-gray-500 mb-1">{r.note}</p>}
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>담당: {r.assigned_staff_name || "미배정"}</span>
                          <span>{fmtDate(r.requested_at)}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteDisplay(r.id)}
                          disabled={deletingDisplay.has(r.id)}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold bg-gray-50 border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 size={10} />
                          {deletingDisplay.has(r.id) ? "삭제 중..." : "삭제"}
                        </button>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 발주요청 ── */}
        {tab === "order" && (
          <div className="flex flex-col gap-4">

            {/* 발주 요청 목록 (DB) */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">발주 요청 목록</p>
                <button
                  onClick={loadOrderReqs}
                  disabled={orderLoading}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition"
                >
                  <RefreshCw size={11} className={orderLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {orderLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : orderReqs.length === 0 ? (
                <p className="text-xs text-gray-400 py-3 text-center">발주 요청 내역이 없습니다</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {orderReqs.map(r => {
                    const short = (r.optimal_stock ?? 0) - (r.current_stock ?? 0);
                    return (
                      <div key={r.id} className="bg-white border border-red-100 rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-gray-900 truncate">{r.product_name}</p>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{r.product_code}</p>
                          </div>
                          <span className="shrink-0 text-[11px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                            -{short}개 부족
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                          <span>현재고 <strong className="text-red-500">{r.current_stock ?? "-"}</strong></span>
                          <span>적정재고 <strong className="text-amber-600">{r.optimal_stock ?? "-"}</strong></span>
                          <span className="ml-auto text-gray-400">{fmtDate(r.requested_at)}</span>
                        </div>
                        {r.note && (
                          <p className="text-[10px] text-gray-500 mb-2 bg-gray-50 px-2 py-1 rounded">{r.note}</p>
                        )}
                        <button
                          onClick={() => handleDeleteOrder(r.id)}
                          disabled={deletingOrder.has(r.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 size={12} />
                          {deletingOrder.has(r.id) ? "처리 중..." : "완료 (발주 완료)"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 발주 필요 상품 (저재고 — 미요청) */}
            <section className="flex flex-col gap-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                발주 필요 상품 <span className="normal-case font-normal">(현재고 &lt; 적정재고)</span>
              </p>

              {productsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : lowStock.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                  <Package size={32} className="mb-2" />
                  <p className="text-sm font-bold text-gray-400">발주 필요 상품이 없습니다</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {lowStock.map(p => {
                    const cur = Number(p.current_stock);
                    const opt = Number(p.optimal_stock);
                    const short = opt - cur;
                    const alreadyRequested = requestedCodes.has(p.code);
                    return (
                      <div key={p.code} className={`bg-white border rounded-xl p-4 shadow-sm ${alreadyRequested ? "border-gray-200 opacity-60" : "border-red-100"}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-gray-900 truncate">{p.name}</p>
                            <p className="text-[10px] text-gray-400 font-mono mt-0.5">{p.code}</p>
                          </div>
                          <span className="shrink-0 text-[10px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                            -{short}개
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                          <span>현재고 <strong className="text-red-500">{cur}</strong></span>
                          <span>적정재고 <strong className="text-amber-600">{opt}</strong></span>
                          {p.spec && <span className="ml-auto text-gray-400">{p.spec}</span>}
                        </div>
                        {alreadyRequested ? (
                          <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-600">
                            <CheckCircle2 size={12} /> 발주요청됨
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRequestOrder(p)}
                            disabled={requestingOrder.has(p.code)}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ShoppingCart size={12} />
                            {requestingOrder.has(p.code) ? "요청 중..." : "발주 요청하기"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── 구역불일치 ── */}
        {tab === "mismatch" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                전산 ≠ 실제 배정구역 <strong className="text-orange-600">{mismatches.length}</strong>건
              </p>
              <button
                onClick={loadMismatches}
                disabled={mismatchLoading}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition"
              >
                <RefreshCw size={11} className={mismatchLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {mismatchLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mismatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <MapPin size={36} className="mb-3" />
                <p className="text-sm font-bold text-gray-400">불일치 상품이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1 text-center leading-relaxed">
                  상품 스캔 후 실제 배정구역이<br />전산과 다를 때 자동으로 등록됩니다
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {mismatches.map(m => (
                  <div key={m.id} className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
                    <p className="text-sm font-black text-gray-900 mb-3 truncate">{m.product_name}</p>
                    <div className="flex items-stretch gap-2 mb-3">
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                        <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">전산 배정구역</p>
                        <p className="text-xs font-bold text-gray-700">{m.spec_zone || "미지정"}</p>
                      </div>
                      <div className="flex items-center">
                        <ArrowRight size={14} className="text-orange-400" />
                      </div>
                      <div className="flex-1 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
                        <p className="text-[9px] font-bold text-orange-500 uppercase mb-1">실제 배정구역</p>
                        <p className="text-xs font-black text-red-600">{m.real_zone}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-3">
                      <span className="font-mono">{m.product_code}</span>
                      <span>{fmtDate(m.registered_at)}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteMismatch(m.id)}
                      disabled={deletingMismatch.has(m.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 size={12} />
                      {deletingMismatch.has(m.id) ? "처리 중..." : "완료 (구역 수정 완료)"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* ── 연차신청 ── */}
        {tab === "leave" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {isManager
                  ? <>전체 <strong className="text-green-600">{leaveReqs.length}</strong>건 · 대기 <strong className="text-amber-600">{leavePending}</strong>건</>
                  : <>내 신청 <strong className="text-green-600">{leaveReqs.length}</strong>건</>}
              </p>
              <button onClick={loadLeaveReqs} disabled={leaveLoading} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition">
                <RefreshCw size={11} className={leaveLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {leaveLoading ? (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : leaveReqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                <CalendarDays size={36} className="mb-3" />
                <p className="text-sm font-bold text-gray-400">신청 내역이 없습니다</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {leaveReqs.map(r => (
                  <div key={r.id} className={`bg-white border rounded-xl p-4 shadow-sm ${r.status === "pending" ? "border-amber-200" : r.status === "approved" ? "border-emerald-200" : "border-rose-200"}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        {isManager && <p className="text-xs font-black text-gray-700 mb-0.5">{r.employee_name}</p>}
                        <p className="text-sm font-bold text-gray-900">{r.leave_type}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.start_date} ~ {r.end_date}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${LEAVE_STATUS_COLOR[r.status]}`}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    {r.reason && <p className="text-xs text-gray-500 mb-2 bg-gray-50 px-2.5 py-1.5 rounded-lg">{r.reason}</p>}
                    {r.reviewer_note && (
                      <p className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg mb-2">
                        <span className="font-bold">메모:</span> {r.reviewer_note}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 mb-2">신청: {r.created_at ? new Date(r.created_at).toLocaleDateString("ko-KR") : ""}</p>

                    {/* 관리자 승인/반려 */}
                    {isManager && r.status === "pending" && (
                      reviewingLeave === r.id ? (
                        <div className="flex flex-col gap-2 mt-2">
                          <input
                            type="text"
                            value={reviewNote}
                            onChange={e => setReviewNote(e.target.value)}
                            placeholder="메모 (선택)"
                            className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-500 transition"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => handleLeaveReview(r.id, "approved")}
                              disabled={processingLeave === r.id}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 size={12} />
                              {processingLeave === r.id ? "처리 중..." : "승인"}
                            </button>
                            <button
                              onClick={() => handleLeaveReview(r.id, "rejected")}
                              disabled={processingLeave === r.id}
                              className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer disabled:opacity-50"
                            >
                              <XCircle size={12} />
                              {processingLeave === r.id ? "처리 중..." : "반려"}
                            </button>
                          </div>
                          <button onClick={() => { setReviewingLeave(null); setReviewNote(""); }} className="text-[11px] text-gray-400 hover:text-gray-600 text-center cursor-pointer">취소</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReviewingLeave(r.id); setReviewNote(""); }}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition cursor-pointer"
                        >
                          검토하기
                        </button>
                      )
                    )}
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
