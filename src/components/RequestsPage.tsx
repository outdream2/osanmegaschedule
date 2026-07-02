import React, { useEffect, useState, useCallback } from "react";
import {
  Bell, Package, MapPin,
  CheckCircle2, Clock, RefreshCw, ShoppingCart, Square, CheckSquare,
  Send, Loader2, Utensils, UtensilsCrossed, ChevronDown, ChevronUp, ScrollText,
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
interface LunchRequest {
  id: number; employee_id: number; employee_name: string;
  date: string; eating: boolean; memo: string | null; updated_at: string;
}
interface InventoryCheck {
  id: string; product_code: string; product_name: string;
  warehouse_stock: number | null; store_stock: number | null;
  system_stock: number | null; optimal_stock: number | null;
  checked_by: string; note: string; status: string;
  checked_at: string;
}
type Tab = "display" | "order" | "mismatch" | "lunch" | "inventory";

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso; }
}

/* ── 공통 툴바 ── */
function ListToolbar({
  total, selected, allChecked, onToggleAll, onDeleteSelected, onDeleteAll, onRefresh, loading, accentColor, extraActions, hideDeleteAll,
}: {
  total: number; selected: number; allChecked: boolean;
  onToggleAll: () => void; onDeleteSelected: () => void;
  onDeleteAll: () => void; onRefresh: () => void;
  loading: boolean; accentColor: string;
  extraActions?: React.ReactNode;
  hideDeleteAll?: boolean;
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
      {extraActions}
      {!hideDeleteAll && (
        <button
          onClick={onDeleteAll}
          disabled={total === 0}
          className="text-[11px] font-bold text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer disabled:opacity-40"
        >
          전체삭제
        </button>
      )}
      <button onClick={onRefresh} className="p-1 text-gray-400 hover:text-gray-600 transition cursor-pointer">
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}

export const RequestsPage: React.FC<RequestsPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const [tab, setTab] = useState<Tab>("display");
  const isManager = (authSession?.level ?? 0) >= 2;

  // 진열요청
  const [displayReqs, setDisplayReqs] = useState<DisplayRequest[]>([]);
  const [displayLoading, setDisplayLoading] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<Set<string>>(new Set());

  // 발주요청
  const [orderReqs, setOrderReqs] = useState<OrderRequest[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Set<string>>(new Set());
  const [requestingOrder, setRequestingOrder] = useState<Set<string>>(new Set());
  const [orderRequestError, setOrderRequestError] = useState<string | null>(null);

  // 발주 필요 상품
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // 구역불일치
  const [mismatches, setMismatches] = useState<ZoneMismatch[]>([]);
  const [mismatchLoading, setMismatchLoading] = useState(false);
  const [mismatchError, setMismatchError] = useState<string | null>(null);
  const [selectedMismatch, setSelectedMismatch] = useState<Set<string>>(new Set());

  // 점심신청
  const [lunchRequests, setLunchRequests] = useState<LunchRequest[]>([]);
  const [lunchLoading, setLunchLoading] = useState(false);

  // 실재고 점검
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<Set<string>>(new Set());
  const [invLogOpen, setInvLogOpen] = useState(false);

  // 빠른 탭 갯수 (pending-counts 엔드포인트)
  const [tabCounts, setTabCounts] = useState<{display:number; order:number; mismatch:number; lunch:number; inventory:number} | null>(null);

  // 발주요청 중복 확인 모달
  const [dupOrderModal, setDupOrderModal] = useState<{existing: OrderRequest; product: ProductInfo; editStock: number | ""} | null>(null);


  // 진열요청 완료 확인
  const [displayConfirmDelete, setDisplayConfirmDelete] = useState(false);

  // 진열요청 알림 전송
  const [notifying, setNotifying] = useState(false);
  const [notifyToast, setNotifyToast] = useState<string | null>(null);

  const handleNotifyAll = useCallback(async () => {
    const pending = displayReqs.filter(r => r.status === "pending" && r.assigned_staff_id);
    if (pending.length === 0) {
      setNotifyToast("전송할 대기 중인 진열요청이 없습니다");
      setTimeout(() => setNotifyToast(null), 3000);
      return;
    }
    setNotifying(true);
    // 담당자별로 그룹화
    const byStaff = new Map<number, { name: string; zones: string[] }>();
    for (const r of pending) {
      if (!r.assigned_staff_id) continue;
      const entry = byStaff.get(r.assigned_staff_id) ?? { name: r.assigned_staff_name, zones: [] };
      entry.zones.push(r.zone_label);
      byStaff.set(r.assigned_staff_id, entry);
    }
    try {
      await Promise.all(
        [...byStaff.entries()].map(([staffId, { name, zones }]) =>
          fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employee_id: staffId,
              title: "📦 진열 보충 요청",
              body: zones.length === 1
                ? `${zones[0]} 진열 보충이 필요합니다`
                : `${zones[0]} 외 ${zones.length - 1}개 구역 보충이 필요합니다`,
              type: "alert",
            }),
          })
        )
      );
      setNotifyToast(`${byStaff.size}명 담당자에게 알림을 전송했습니다`);
    } catch {
      setNotifyToast("알림 전송 중 오류가 발생했습니다");
    } finally {
      setNotifying(false);
      setTimeout(() => setNotifyToast(null), 3500);
    }
  }, [displayReqs]);

  // 로드
  const loadDisplayReqs = useCallback(async () => {
    setDisplayLoading(true);
    try { const res = await fetch("/api/display-requests"); setDisplayReqs(res.ok ? await res.json() : []); }
    catch { setDisplayReqs([]); } finally { setDisplayLoading(false); }
  }, []);

  const loadOrderReqs = useCallback(async () => {
    setOrderLoading(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/order-requests");
      if (res.ok) {
        setOrderReqs(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setOrderError(body.error ?? `서버 오류 (${res.status})`);
        setOrderReqs([]);
      }
    } catch { setOrderError("네트워크 오류"); setOrderReqs([]); }
    finally { setOrderLoading(false); }
  }, []);

  const loadMismatches = useCallback(async () => {
    setMismatchLoading(true);
    setMismatchError(null);
    try {
      const res = await fetch("/api/zone-mismatches");
      if (res.ok) {
        setMismatches(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setMismatchError(body.error ?? `서버 오류 (${res.status})`);
        setMismatches([]);
      }
    } catch { setMismatchError("네트워크 오류"); setMismatches([]); }
    finally { setMismatchLoading(false); }
  }, []);

  const loadProducts = useCallback(async () => {
    if (products.length > 0) return;
    setProductsLoading(true);
    try { const map = await getProductsMap(); setProducts(Object.values(map)); }
    finally { setProductsLoading(false); }
  }, [products.length]);

  const loadLunch = useCallback(async () => {
    setLunchLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/lunch-requests?date=${today}`);
      const data = res.ok ? await res.json() : {};
      setLunchRequests(data.requests ?? []);
    } catch { setLunchRequests([]); }
    finally { setLunchLoading(false); }
  }, []);

  const loadInventoryChecks = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const res = await fetch("/api/inventory-checks");
      setInventoryChecks(res.ok ? await res.json() : []);
    } catch { setInventoryChecks([]); }
    finally { setInventoryLoading(false); }
  }, []);

  const loadTabCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/requests/pending-counts");
      if (res.ok) setTabCounts(await res.json());
    } catch {}
  }, []);

  useEffect(() => { loadTabCounts(); loadDisplayReqs(); loadOrderReqs(); loadMismatches(); loadLunch(); loadInventoryChecks(); }, []);
  useEffect(() => {
    if (tab === "order") { loadOrderReqs(); loadProducts(); }
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

  // ── 실재고 삭제 ──
  const deleteInventory = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteOne(`/api/inventory-checks/${id}`)));
    setInventoryChecks(prev => prev.filter(r => !ids.includes(r.id)));
    setSelectedInventory(new Set());
  };

  const doSubmitOrderRequest = async (p: ProductInfo, stockOverride?: number | null) => {
    setRequestingOrder(prev => new Set([...prev, p.code]));
    setOrderRequestError(null);
    const currentStock = stockOverride !== undefined ? stockOverride : (p.current_stock != null ? Number(p.current_stock) : null);
    try {
      const res = await fetch("/api/order-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_code: p.code, product_name: p.name,
          current_stock: currentStock,
          optimal_stock: p.optimal_stock != null ? Number(p.optimal_stock) : null, note: "" }),
      });
      if (res.ok) {
        await loadOrderReqs();
      } else {
        const body = await res.json().catch(() => ({}));
        setOrderRequestError(body.error ?? `발주 요청 실패 (${res.status})`);
      }
    } catch { setOrderRequestError("네트워크 오류 — 다시 시도해주세요"); }
    finally { setRequestingOrder(prev => { const s = new Set(prev); s.delete(p.code); return s; }); }
  };

  const handleRequestOrder = (p: ProductInfo) => {
    const existing = orderReqs.find(r => r.product_code === p.code);
    if (existing) {
      setDupOrderModal({ existing, product: p, editStock: p.current_stock != null ? Number(p.current_stock) : "" });
      return;
    }
    doSubmitOrderRequest(p);
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

  // 탭 갯수: 로딩 중이면 pending-counts 값을, 로딩 완료 후엔 실제 데이터 값을 사용
  const displayTabCount   = displayLoading   ? (tabCounts?.display   ?? 0) : pending.length;
  const orderTabCount     = orderLoading     ? (tabCounts?.order     ?? 0) : orderReqs.length;
  const mismatchTabCount  = mismatchLoading  ? (tabCounts?.mismatch  ?? 0) : mismatches.length;
  const inventoryTabCount = inventoryLoading ? (tabCounts?.inventory ?? 0) : inventoryChecks.length;
  const lunchTabCount     = lunchLoading     ? (tabCounts?.lunch     ?? 0) : lunchRequests.filter(r => !r.eating).length;

  const eatCount = lunchRequests.filter(r => r.eating).length;
  const noEatCount = lunchRequests.filter(r => !r.eating).length;

  const TABS: [Tab, string, number, string, string][] = [
    ["display",   "진열요청",   displayTabCount,   "text-blue-600",   "border-blue-500"],
    ["order",     "발주요청",   orderTabCount,     "text-red-600",    "border-red-500"],
    ["mismatch",  "구역불일치", mismatchTabCount,  "text-orange-600", "border-orange-500"],
    ["inventory", "실재고차이", inventoryTabCount, "text-purple-600", "border-purple-500"],
    ["lunch",     "점심신청",   lunchTabCount,     "text-emerald-600","border-emerald-500"],
  ];

  // 공통 체크박스
  const Checkbox = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button onClick={onChange} className="shrink-0 cursor-pointer text-gray-300 hover:text-gray-500 transition">
      {checked ? <CheckSquare size={16} className="text-rose-500" /> : <Square size={16} />}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #f8faff 0%, #f1f5ff 40%, #f0fdf4 100%)" }}>
      {/* Shared App Nav Header */}
      <AppNavHeader
        activePage="requests"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* 탭 바 */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/70 flex sticky top-14 z-20" style={{ boxShadow: "0 1px 0 0 rgba(99,102,241,0.06)" }}>
        {TABS.map(([key, label, count, color, border]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 border-b-2 transition cursor-pointer ${tab === key ? `${color} ${border}` : "text-slate-400 border-transparent hover:text-slate-600"}`}>
            <span className="text-[11px] font-black tracking-tight">{label}</span>
            {count > 0
              ? <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === key ? color.replace("text-", "bg-").replace("-600", "-100") + " " + color : "bg-slate-100 text-slate-400"}`}>{count}</span>
              : <span className="text-[10px] text-slate-300">0</span>
            }
          </button>
        ))}
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4">

        {/* ── 진열요청 ── */}
        {tab === "display" && (
          <div className="flex flex-col gap-2">
            {notifyToast && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 whitespace-nowrap">
                <Bell size={13} />{notifyToast}
              </div>
            )}
            <ListToolbar
              total={displayReqs.length} selected={selectedDisplay.size}
              allChecked={selectedDisplay.size === displayReqs.length && displayReqs.length > 0}
              onToggleAll={() => toggleAll(displayReqs, selectedDisplay, setSelectedDisplay)}
              onDeleteSelected={() => deleteDisplay([...selectedDisplay])}
              onDeleteAll={() => {}}
              onRefresh={loadDisplayReqs} loading={displayLoading} accentColor="text-blue-600"
              hideDeleteAll
              extraActions={
                <>
                  <button
                    onClick={handleNotifyAll}
                    disabled={notifying || displayReqs.filter(r => r.status === "pending").length === 0}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-blue-500 hover:bg-blue-600 border border-blue-400 px-2.5 py-1.5 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {notifying ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                    진열요청
                  </button>
                  {displayConfirmDelete ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-gray-500 font-bold whitespace-nowrap">삭제할까요?</span>
                      <button
                        onClick={() => { setDisplayConfirmDelete(false); deleteDisplay(displayReqs.map(r => r.id)); }}
                        className="text-[11px] font-bold text-white bg-rose-500 hover:bg-rose-600 border border-rose-400 px-2 py-1.5 rounded-lg transition cursor-pointer"
                      >예</button>
                      <button
                        onClick={() => setDisplayConfirmDelete(false)}
                        className="text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-300 px-2 py-1.5 rounded-lg transition cursor-pointer"
                      >아니오</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDisplayConfirmDelete(true)}
                      disabled={displayReqs.length === 0}
                      className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      완료
                    </button>
                  )}
                </>
              }
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
                    <div className="flex-1 min-w-0">
                      {/* 담당자 · 구역 · 카테고리 */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.assigned_staff_name ? (
                          <span className="text-[12px] font-black text-indigo-700">{r.assigned_staff_name}</span>
                        ) : (
                          <span className="text-[11px] text-gray-300">미지정</span>
                        )}
                        {r.zone_label && (
                          <><span className="text-gray-300 text-[10px]">·</span>
                          <span className="text-[12px] font-bold text-gray-800 truncate">{r.zone_label}</span></>
                        )}
                        {r.category && (
                          <><span className="text-gray-300 text-[10px]">·</span>
                          <span className="text-[11px] text-gray-500 truncate">{r.category}</span></>
                        )}
                        {r.note && (
                          <><span className="text-gray-300 text-[10px]">·</span>
                          <span className="text-[11px] text-indigo-500 truncate">{r.note}</span></>
                        )}
                      </div>
                    </div>
                    {/* 상태 + 날짜 한 줄 */}
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${r.status === "pending" ? "text-blue-600 bg-blue-50 border-blue-200" : "text-emerald-600 bg-emerald-50 border-emerald-200"}`}>
                        {r.status === "pending" ? <Clock size={8} /> : <CheckCircle2 size={8} />}
                        {r.status === "pending" ? "대기" : "완료"}
                      </span>
                      <span className="text-[10px] text-gray-400">{fmtDate(r.requested_at)}</span>
                    </div>
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
              {orderError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-bold">
                  <span>⚠ {orderError}</span>
                  <button onClick={loadOrderReqs} className="ml-auto text-red-500 underline cursor-pointer">재시도</button>
                </div>
              )}
              {orderLoading ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : orderReqs.length === 0 && !orderError ? (
                <p className="text-xs text-gray-400 py-6 text-center">발주 요청 내역이 없습니다</p>
              ) : !orderLoading && (
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
              {orderRequestError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-600 font-bold">
                  ⚠ {orderRequestError}
                </div>
              )}
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
                      <div key={p.code} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{p.code} · {cur}/{opt}</p>
                        </div>
                        <span className="text-[11px] font-black text-red-600 shrink-0">-{opt - cur}개</span>
                        {alreadyRequested ? (
                          <button onClick={() => handleRequestOrder(p)} className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg shrink-0 cursor-pointer hover:bg-emerald-100 transition">요청됨</button>
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
            ) : mismatchError ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <p className="text-sm font-bold text-red-500">불러오기 오류</p>
                <p className="text-xs text-red-400 font-mono text-center px-4">{mismatchError}</p>
                <button onClick={loadMismatches} className="mt-2 text-xs text-orange-600 underline cursor-pointer">다시 시도</button>
              </div>
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
                      <p className="text-[11px] text-gray-500 mt-0.5">배정위치: <span className="font-semibold">{m.spec_zone || "미지정"}</span></p>
                      <p className="text-[11px] text-red-600 font-bold">실제위치: {m.real_zone}</p>
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">{m.product_code}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(m.registered_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 실재고 차이 ── */}
        {tab === "inventory" && (
          <div className="flex flex-col gap-2">
            <ListToolbar
              total={inventoryChecks.length} selected={selectedInventory.size}
              allChecked={selectedInventory.size === inventoryChecks.length && inventoryChecks.length > 0}
              onToggleAll={() => toggleAll(inventoryChecks, selectedInventory, setSelectedInventory)}
              onDeleteSelected={() => deleteInventory([...selectedInventory])}
              onDeleteAll={() => { if (confirm(`실재고 점검 내역 전체 ${inventoryChecks.length}건을 삭제할까요?`)) deleteInventory(inventoryChecks.map(r => r.id)); }}
              onRefresh={loadInventoryChecks} loading={inventoryLoading} accentColor="text-purple-600"
            />
            {inventoryLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : inventoryChecks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <Package size={32} className="mb-2" />
                <p className="text-sm font-bold text-gray-400">실재고 점검 내역이 없습니다</p>
                <p className="text-xs text-gray-400 mt-1 text-center">바코드 스캔 후 창고·매장 실재고를 입력하면 자동 등록됩니다</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                {inventoryChecks.map(r => {
                  const totalActual = (r.warehouse_stock ?? 0) + (r.store_stock ?? 0);
                  const diff = r.system_stock != null ? totalActual - r.system_stock : null;
                  const isShort = diff != null && diff < 0;
                  const isOver  = diff != null && diff > 0;
                  return (
                    <div key={r.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition ${selectedInventory.has(r.id) ? "bg-purple-50/40" : ""}`}>
                      <Checkbox checked={selectedInventory.has(r.id)} onChange={() => toggleOne(selectedInventory, r.id, setSelectedInventory)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{r.product_name}</p>
                        <p className="text-[10px] text-gray-400 font-mono mb-1">{r.product_code}</p>
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                          <span className="flex items-center gap-1 text-gray-600 font-semibold">
                            창고 <span className="font-black text-gray-800">{r.warehouse_stock ?? "—"}</span>
                          </span>
                          <span className="text-gray-300">+</span>
                          <span className="flex items-center gap-1 text-gray-600 font-semibold">
                            매장 <span className="font-black text-gray-800">{r.store_stock ?? "—"}</span>
                          </span>
                          <span className="text-gray-300">=</span>
                          <span className="font-black text-purple-700">{totalActual}개</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-500">현재고 {r.system_stock ?? "—"}</span>
                          {diff != null && (
                            <span className={`font-black px-1.5 py-0.5 rounded-lg ${isShort ? "bg-red-50 text-red-600 border border-red-200" : isOver ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-gray-100 text-gray-500"}`}>
                              {diff > 0 ? "+" : ""}{diff}
                            </span>
                          )}
                        </div>
                        {r.checked_by && <p className="text-[10px] text-gray-400 mt-0.5">점검자: {r.checked_by}</p>}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(r.checked_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── 점검 이력 로그 ── */}
            {inventoryChecks.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setInvLogOpen(p => !p)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[11px] font-bold text-gray-500 hover:bg-gray-100 transition cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <ScrollText size={12} className="text-purple-400" />
                    점검 이력 로그 ({inventoryChecks.length}건)
                  </span>
                  {invLogOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {invLogOpen && (() => {
                  // 날짜별 그룹핑
                  const groups = new Map<string, InventoryCheck[]>();
                  for (const r of inventoryChecks) {
                    const d = new Date(r.checked_at);
                    const key = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} (${["일","월","화","수","목","금","토"][d.getDay()]})`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(r);
                  }
                  return (
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm mt-1">
                      {[...groups.entries()].map(([date, rows]) => (
                        <div key={date}>
                          <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">{date}</span>
                          </div>
                          {rows.map(r => {
                            const totalActual = (r.warehouse_stock ?? 0) + (r.store_stock ?? 0);
                            const diff = r.system_stock != null ? totalActual - r.system_stock : null;
                            const d = new Date(r.checked_at);
                            const time = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                            return (
                              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-purple-50/30 transition">
                                <span className="text-[10px] text-gray-400 font-mono shrink-0 w-10">{time}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[12px] font-bold text-gray-800 truncate block">{r.product_name}</span>
                                  <span className="text-[10px] text-gray-400">
                                    창고 {r.warehouse_stock ?? "—"} + 매장 {r.store_stock ?? "—"} = <strong className="text-purple-700">{totalActual}</strong>
                                    {r.system_stock != null && <> · 현재고 {r.system_stock}</>}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {diff != null && (
                                    <span className={`text-[11px] font-black px-1.5 py-0.5 rounded ${diff < 0 ? "bg-red-50 text-red-600" : diff > 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                                      {diff > 0 ? "+" : ""}{diff}
                                    </span>
                                  )}
                                  {r.checked_by && (
                                    <span className="text-[10px] text-gray-400 max-w-[48px] truncate">{r.checked_by}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── 점심신청 ── */}
        {tab === "lunch" && (
          <div className="flex flex-col gap-3">
            {/* 요약 뱃지 */}
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Utensils size={14} className="text-emerald-500" />
                <span className="text-xs font-bold text-gray-700">오늘의 점심 신청 현황</span>
                <span className="text-[10px] text-gray-400">({lunchRequests.length}명 응답)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-[11px] font-bold">
                  <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">🍱 {eatCount}명</span>
                  <span className="bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-0.5"><UtensilsCrossed size={9} />{noEatCount}명</span>
                </div>
                <button onClick={loadLunch} className="p-1.5 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                  <RefreshCw size={12} className={lunchLoading ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {lunchLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : lunchRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <Utensils size={32} className="mb-2" />
                <p className="text-sm font-bold text-gray-400">아직 신청자가 없습니다</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
                {lunchRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${r.eating ? "bg-emerald-500" : "bg-gray-300"}`} />
                    <span className="text-sm font-semibold text-gray-800 flex-1">{r.employee_name}</span>
                    {r.memo && <span className="text-[10px] text-gray-400 max-w-[120px] truncate">{r.memo}</span>}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${r.eating ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
                      {r.eating ? "🍱 식사" : "불참"}
                    </span>
                    <span className="text-[10px] text-gray-300 shrink-0">
                      {new Date(r.updated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* 발주요청 중복 확인 모달 */}
      {dupOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 max-w-sm w-full flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <ShoppingCart size={18} className="text-orange-600" />
              </div>
              <div>
                <p className="font-black text-gray-900 text-sm">이미 발주요청이 있습니다</p>
                <p className="text-[11px] text-gray-500 mt-0.5">실재고를 확인 후 업데이트하세요.</p>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-black text-orange-600 uppercase tracking-wide">기존 발주요청</p>
              <p className="text-sm font-bold text-gray-900">{dupOrderModal.existing.product_name}</p>
              <p className="text-[11px] text-gray-500 font-mono">{dupOrderModal.existing.product_code}</p>
              <div className="flex gap-3 mt-0.5">
                <span className="text-[11px] text-gray-500">기록 현재고: <strong className="text-gray-800">{dupOrderModal.existing.current_stock ?? "—"}</strong></span>
                <span className="text-[11px] text-gray-500">적정재고: <strong className="text-gray-800">{dupOrderModal.existing.optimal_stock ?? "—"}</strong></span>
              </div>
              <p className="text-[10px] text-gray-400">{fmtDate(dupOrderModal.existing.requested_at)} 요청됨</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wide">실재고 (현재)</label>
              <input
                type="number" min="0"
                value={dupOrderModal.editStock}
                onChange={e => setDupOrderModal(prev => prev ? { ...prev, editStock: e.target.value === "" ? "" : Number(e.target.value) } : null)}
                className="w-full text-xl font-black text-center bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 outline-none focus:border-orange-400 transition"
                placeholder="실재고 입력"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setDupOrderModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 transition cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const p = dupOrderModal.product;
                  const stock = dupOrderModal.editStock === "" ? null : dupOrderModal.editStock;
                  setDupOrderModal(null);
                  doSubmitOrderRequest(p, stock);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-orange-500 hover:bg-orange-600 transition cursor-pointer"
              >
                업데이트
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
