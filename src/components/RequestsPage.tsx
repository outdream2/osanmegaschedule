import React, { useEffect, useState, useCallback } from "react";
import {
  Bell, Package, MapPin,
  CheckCircle2, XCircle, Clock, RefreshCw, ArrowRight, Trash2, ShoppingCart, CalendarDays, Square, CheckSquare,
} from "lucide-react";
import { getProductsMap, type ProductInfo } from "../lib/productsCache";
import type { AuthSession } from "../types";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";

interface RequestsPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface DisplayRequest {
  id: string; zone_id: string; zone_label: string; category: string;
  requested_at: string; assigned_staff_id: number | null;
  assigned_staff_name: string; status: string; note: string;
}
interface OrderRequest {
  id: string; product_code: string; product_name: string;
  current_stock: number | null; optimal_stock: number | null;
  note: string; requested_at: string;
}
interface ZoneMismatch {
  id: string; product_code: string; product_name: string;
  spec_zone: string; real_zone: string; registered_at: string;
}
interface LeaveRequest {
  id: string; employee_id: number; employee_name: string;
  leave_type: string; start_date: string; end_date: string;
  reason: string; status: "pending" | "approved" | "rejected";
  reviewer_note: string | null; created_at: string; reviewed_at: string | null;
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

/* ── 공통 툴바 ── */
function ListToolbar({
  total, selected, allChecked, onToggleAll, onDeleteSelected, onDeleteAll, onRefresh, loading, accentColor,
}: {
  total: number; selected: number; allChecked: boolean;
  onToggleAll: () => void; onDeleteSelected: () => void;
  onDeleteAll: () => void; onRefresh: () => void;
  loading: boolean; accentColor: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
      <button onClick={onToggleAll} className="shrink-0 cursor-pointer text-gray-400 hover:text-gray-600 transition">
        {allChecked && total > 0
          ? <CheckSquare size={16} className={accentColor} />
          : <Square size={16} />}
      </button>
      <span className="text-xs text-gray-500 flex-1 select-none">
        {selected > 0 ? <><strong className={accentColor}>{selected}개</strong> 선택됨</> : `전체 ${total}건`}
      </span>
      {selected > 0 && (
        <button
          onClick={onDeleteSelected}
          className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg hover:bg-rose-100 transition cursor-pointer"
        >
          선택삭제
        </button>
      )}
      <button
        onClick={onDeleteAll}
        disabled={total === 0}
        className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer disabled:opacity-40"
      >
        전체삭제
      </button>
      <button onClick={onRefresh} className="p-1 text-gray-400 hover:text-gray-600 transition cursor-pointer">
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

export const RequestsPage: React.FC<RequestsPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const [tab, setTab] = useState<Tab>("display");
  const isManager = authSession?.role === "manager" || authSession?.role === "admin" || authSession?.role === "superadmin";

  // 진열요청
  const [displayReqs, setDisplayReqs] = useState<DisplayRequest[]>([]);
  const [displayLoading, setDisplayLoading] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<Set<string>>(new Set());

  // 발주요청
  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());

  // 발주 필요 상품
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // 구역불일치
  const [mismatches, setMismatches] = useState<ZoneMismatch[]>([]);
  const [mismatchLoading, setMismatchLoading] = useState(false);
  const [selectedMismatch, setSelectedMismatch] = useState<Set<string>>(new Set());

  // 연차신청
  const [leaveReqs, setLeaveReqs] = useState<LeaveRequest[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<Set<string>>(new Set());
  const [processingLeave, setProcessingLeave] = useState<string | null>(null);
  const [reviewingLeave, setReviewingLeave] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  // 로드
  const loadDisplayReqs = useCallback(async () => {
    setDisplayLoading(true);
    try { const res = await fetch("/api/display-requests"); setDisplayReqs(res.ok ? await res.json() : []); }
    catch { setDisplayReqs([]); } finally { setDisplayLoading(false); }
  }, []);

  const loadOrderReqs = useCallback(async () => {
    setOrderLoading(true);
    try { const res = await fetch("/api/order-requests"); setOrderReqs(res.ok ? await res.json() : []); }
    catch { setOrderReqs([]); } finally { setOrderLoading(false); }
  }, []);

  const loadMismatches = useCallback(async () => {
    setMismatchLoading(true);
    try { const res = await fetch("/api/zone-mismatches"); setMismatches(res.ok ? await res.json() : []); }
    catch { setMismatches([]); } finally { setMismatchLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    if (products.length > 0) return;
    setProductsLoading(true);
    try { const map = await getProductsMap(); setProducts(Object.values(map)); }
    finally { setProductsLoading(false); }
  }, [products.length]);

  const loadLeaveReqs = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const url = isManager ? "/api/leave-requests?all=true"
        : authSession?.employeeId ? `/api/leave-requests?employeeId=${authSession.employeeId}` : null;
      if (!url) { setLeaveReqs([]); return; }
      const res = await fetch(url);
      setLeaveReqs(res.ok ? await res.json() : []);
    } catch { setLeaveReqs([]); } finally { setLeaveLoading(false); }
  }, [isManager, authSession?.employeeId]);

  useEffect(() => { loadDisplayReqs(); }, []);
  useEffect(() => {
    if (tab === "order") { loadOrderReqs(); loadProducts(); }
    if (tab === "mismatch") { loadMismatches(); }
    if (tab === "leave") { loadLeaveReqs(); }
  }, [tab]);

  // ── 단건 삭제 헬퍼 ──
  async function deleteOne(url: string) { await fetch(url, { method: "DELETE" }); }

  // ── 진열 삭제 ──
  const deleteDisplay = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/display-requests/${id}`)));
    setDisplayReqs(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedDisplay(new Set());
  };

  // ── 발주 삭제 ──
  const deleteOrder = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/order-requests/${id}`)));
    setOrderReqs(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedOrder(new Set());
  };

  // ── 불일치 삭제 ──
  const deleteMismatch = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/zone-mismatches/${id}`)));
    setMismatches(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedMismatch(new Set());
  };

  // ── 연차 삭제 ──
  const deleteLeave = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/leave-requests/${id}`)));
    setLeaveReqs(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedLeave(new Set());
  };

  const handleRequestOrder = async (p: ProductInfo) => {
    setRequestingOrder(prev => new Set([...prev, p.code]));
    try {
      const res = await fetch("/api/order-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_code: p.code, product_name: p.name,
          current_stock: p.current_stock != null ? Number(p.current_stock) : null,
          optimal_stock: p.optimal_stock != null ? Number(p.optimal_stock) : null, note: "" }),
      });
      if (res.ok) await loadOrderReqs();
    } finally { setRequestingOrder(prev => { const s = new Set(prev); s.delete(p.code); return s; }); }
  };

  const handleLeaveReview = async (id: string, status: "approved" | "rejected") => {
    setProcessingLeave(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewer_note: reviewNote }),
      });
      if (res.ok) {
        setLeaveReqs(prev => prev.map(r => r.id === id ? { ...r, status, reviewer_note: reviewNote, reviewed_at: new Date().toISOString() } : r));
        setReviewingLeave(null); setReviewNote("");
      }
    } finally { setProcessingLeave(null); }
  };

  // 선택 토글 헬퍼
  function toggleOne(set: Set<string>, id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAll<T extends { id: string }>(items: T[], selected: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>) {
    setter(selected.size === items.length && items.length > 0 ? new Set() : new Set(items.map(r => r.id)));
  }

  const requestedCodes = new Set(orderReqs.map(r => r.product_code));
  const lowStock = products.filter(p => {
    const cur = p.current_stock != null ? Number(p.current_stock) : NaN;
    const opt = p.optimal_stock != null ? Number(p.optimal_stock) : NaN;
    return !isNaN(cur) && !isNaN(opt) && opt > 0 && cur < opt;
  }).sort((a, b) => (Number(b.optimal_stock) - Number(b.current_stock)) - (Number(a.optimal_stock) - Number(a.current_stock)));

  const pending = displayReqs.filter(r => r.status === "pending");
  const leavePending = leaveReqs.filter(r => r.status === "pending").length;

  const TABS: [Tab, string, number, string, string][] = [
    ["display",  "진열요청",   pending.length,    "text-blue-600",   "border-blue-500"],
    ["order",    "발주요청",   orderReqs.length,  "text-red-600",    "border-red-500"],
    ["mismatch", "구역불일치", mismatches.length, "text-orange-600", "border-orange-500"],
    ["leave",    "연차신청",   leaveReqs.length,  "text-green-600",  "border-green-500"],
  ];

  // 공통 체크박스
  const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button onClick={onChange} className="shrink-0 cursor-pointer text-gray-300 hover:text-gray-500 transition">
      {checked ? <CheckSquare size={16} className="text-rose-500" /> : <Square size={16} />}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Shared App Nav Header */}
      <AppNavHeader
        activePage="requests"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* 탭 바 */}
      <div className="bg-white border-b border-gray-200 flex sticky top-14 z-20">
        {TABS.map(([key, label, count, color, border]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 border-b-2 transition cursor-pointer ${tab === key ? `${color} ${border}` : "text-gray-400 border-transparent hover:text-gray-600"}`}>
            <span className="text-[11px] font-black">{label}</span>
            <span className={`text-[10px] font-bold ${tab === key ? color : "text-gray-400"}`}>{count}건</span>
          </button>
        ))}
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4">

        {/* ── 진열요청 ── */}
        {tab === "display" && (
          <div className="flex flex-col gap-2">
            <ListToolbar
              total={displayReqs.length} selected={selectedDisplay.size}
              allChecked={selectedDisplay.size === displayReqs.length && displayReqs.length > 0}
              onToggleAll={() => toggleAll(displayReqs, selectedDisplay, setSelectedDisplay)}
              onDeleteSelected={() => deleteDisplay([...selectedDisplay])}
              onDeleteAll={() => { if (confirm(`진열요청 전체 ${displayReqs.length}건을 삭제할까요?`)) deleteDisplay(displayReqs.map(r => r.id)); }}
              onRefresh={loadDisplayReqs} loading={displayLoading} accentColor="text-blue-600"
            />

            {displayLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : displayReqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <Bell size={32} className="mb-2" /><p className="text-sm font-bold text-gray-400">진열요청이 없습니다</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                {displayReqs.map(r => (
                  <div key={r.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${selectedDisplay.has(r.id) ? "bg-rose-50/40" : ""}`}>
                    <Checkbox checked={selectedDisplay.has(r.id)} onChange={() => toggleOne(selectedDisplay, r.id, setSelectedDisplay)} />
                    <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${r.status === "pending" ? "text-blue-600 bg-blue-50 border-blue-200" : "text-emerald-600 bg-emerald-50 border-emerald-200"}`}>
                      {r.status === "pending" ? <Clock size={8} /> : <CheckCircle2 size={8} />}
                      {r.status === "pending" ? "대기" : "완료"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{r.zone_label}</p>
                      {r.note && <p className="text-[11px] text-indigo-600 truncate">{r.note}</p>}
                      <p className="text-[10px] text-gray-400">{r.category} {r.assigned_staff_name && `· ${r.assigned_staff_name}`}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(r.requested_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 발주요청 ── */}
        {tab === "order" && (
          <div className="flex flex-col gap-4">
            {/* 발주 요청 목록 */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-black text-red-500 uppercase tracking-widest px-1">발주 요청 목록</p>
              <ListToolbar
                total={orderReqs.length} selected={selectedOrder.size}
                allChecked={selectedOrder.size === orderReqs.length && orderReqs.length > 0}
                onToggleAll={() => toggleAll(orderReqs, selectedOrder, setSelectedOrder)}
                onDeleteSelected={() => deleteOrder([...selectedOrder])}
                onDeleteAll={() => { if (confirm(`발주요청 전체 ${orderReqs.length}건을 삭제할까요?`)) deleteOrder(orderReqs.map(r => r.id)); }}
                onRefresh={loadOrderReqs} loading={orderLoading} accentColor="text-red-600"
              />
              {orderLoading ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : orderReqs.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">발주 요청 내역이 없습니다</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                  {orderReqs.map(r => {
                    const short = (r.optimal_stock ?? 0) - (r.current_stock ?? 0);
                    return (
                      <div key={r.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${selectedOrder.has(r.id) ? "bg-rose-50/40" : ""}`}>
                        <Checkbox checked={selectedOrder.has(r.id)} onChange={() => toggleOne(selectedOrder, r.id, setSelectedOrder)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{r.product_name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{r.product_code} · 현재 {r.current_stock ?? "-"} / 적정 {r.optimal_stock ?? "-"}</p>
                        </div>
                        <span className="text-[11px] font-black text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg shrink-0">-{short}개</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(r.requested_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 발주 필요 상품 */}
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
                발주 필요 상품 <span className="normal-case font-normal">(현재고 &lt; 적정재고)</span>
              </p>
              {productsLoading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
              ) : lowStock.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                  <Package size={28} className="mb-2" /><p className="text-sm font-bold text-gray-400">발주 필요 상품이 없습니다</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                  {lowStock.map(p => {
                    const cur = Number(p.current_stock), opt = Number(p.optimal_stock);
                    const alreadyRequested = requestedCodes.has(p.code);
                    return (
                      <div key={p.code} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${alreadyRequested ? "opacity-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{p.code} · {cur}/{opt}</p>
                        </div>
                        <span className="text-[11px] font-black text-red-600 shrink-0">-{opt - cur}개</span>
                        {alreadyRequested ? (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg shrink-0">요청됨</span>
                        ) : (
                          <button onClick={() => handleRequestOrder(p)} disabled={requestingOrder.has(p.code)}
                            className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1">
                            <ShoppingCart size={11} />{requestingOrder.has(p.code) ? "..." : "발주"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 구역불일치 ── */}
        {tab === "mismatch" && (
          <div className="flex flex-col gap-2">
            <ListToolbar
              total={mismatches.length} selected={selectedMismatch.size}
              allChecked={selectedMismatch.size === mismatches.length && mismatches.length > 0}
              onToggleAll={() => toggleAll(mismatches, selectedMismatch, setSelectedMismatch)}
              onDeleteSelected={() => deleteMismatch([...selectedMismatch])}
              onDeleteAll={() => { if (confirm(`구역불일치 전체 ${mismatches.length}건을 삭제할까요?`)) deleteMismatch(mismatches.map(r => r.id)); }}
              onRefresh={loadMismatches} loading={mismatchLoading} accentColor="text-orange-600"
            />
            {mismatchLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : mismatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <MapPin size={32} className="mb-2" /><p className="text-sm font-bold text-gray-400">불일치 상품이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1 text-center leading-relaxed">스캔 후 실제 배정구역이 전산과 다를 때 자동 등록됩니다</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                {mismatches.map(m => (
                  <div key={m.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${selectedMismatch.has(m.id) ? "bg-rose-50/40" : ""}`}>
                    <Checkbox checked={selectedMismatch.has(m.id)} onChange={() => toggleOne(selectedMismatch, m.id, setSelectedMismatch)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{m.product_name}</p>
                      <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
                        <span className="text-gray-400">{m.spec_zone || "미지정"}</span>
                        <ArrowRight size={10} className="text-orange-400 shrink-0" />
                        <span className="text-red-600 font-bold">{m.real_zone}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">{m.product_code}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(m.registered_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 연차신청 ── */}
        {tab === "leave" && (
          <div className="flex flex-col gap-2">
            <ListToolbar
              total={leaveReqs.length} selected={selectedLeave.size}
              allChecked={selectedLeave.size === leaveReqs.length && leaveReqs.length > 0}
              onToggleAll={() => toggleAll(leaveReqs, selectedLeave, setSelectedLeave)}
              onDeleteSelected={() => deleteLeave([...selectedLeave])}
              onDeleteAll={() => { if (confirm(`연차신청 전체 ${leaveReqs.length}건을 삭제할까요?`)) deleteLeave(leaveReqs.map(r => r.id)); }}
              onRefresh={loadLeaveReqs} loading={leaveLoading} accentColor="text-green-600"
            />
            {leaveLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : leaveReqs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <CalendarDays size={32} className="mb-2" /><p className="text-sm font-bold text-gray-400">신청 내역이 없습니다</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                {leaveReqs.map(r => (
                  <div key={r.id} className={`hover:bg-gray-50 transition ${selectedLeave.has(r.id) ? "bg-rose-50/40" : ""}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Checkbox checked={selectedLeave.has(r.id)} onChange={() => toggleOne(selectedLeave, r.id, setSelectedLeave)} />
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${LEAVE_STATUS_COLOR[r.status]}`}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </span>
                      <div className="flex-1 min-w-0">
                        {isManager && <p className="text-[11px] font-black text-gray-600">{r.employee_name}</p>}
                        <p className="text-sm font-bold text-gray-900">{r.leave_type} · {r.start_date} ~ {r.end_date}</p>
                        {r.reason && <p className="text-[11px] text-gray-400 truncate">{r.reason}</p>}
                        {r.reviewer_note && <p className="text-[11px] text-indigo-600 truncate">메모: {r.reviewer_note}</p>}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{r.created_at ? new Date(r.created_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : ""}</span>
                    </div>
                    {/* 관리자 승인/반려 */}
                    {isManager && r.status === "pending" && (
                      <div className="px-4 pb-3 pl-11">
                        {reviewingLeave === r.id ? (
                          <div className="flex flex-col gap-2">
                            <input type="text" value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                              placeholder="메모 (선택)" className="w-full bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-green-500 transition" />
                            <div className="flex gap-2">
                              <button onClick={() => handleLeaveReview(r.id, "approved")} disabled={processingLeave === r.id}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-50">
                                <CheckCircle2 size={11} />{processingLeave === r.id ? "처리 중..." : "승인"}
                              </button>
                              <button onClick={() => handleLeaveReview(r.id, "rejected")} disabled={processingLeave === r.id}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer disabled:opacity-50">
                                <XCircle size={11} />{processingLeave === r.id ? "처리 중..." : "반려"}
                              </button>
                              <button onClick={() => { setReviewingLeave(null); setReviewNote(""); }}
                                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:bg-gray-100 transition cursor-pointer">취소</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setReviewingLeave(r.id); setReviewNote(""); }}
                            className="text-[11px] font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 transition cursor-pointer">
                            검토하기
                          </button>
                        )}
                      </div>
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
