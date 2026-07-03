import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, BellOff, Package, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { AuthSession } from "../types";

interface StockArrivalPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
}

interface StockArrival {
  id: number;
  title: string;
  body: string | null;
  created_at: string;
  created_by_id: number | null;
}

export const StockArrivalPage: React.FC<StockArrivalPageProps> = ({ authSession, onBack }) => {
  const [arrivals, setArrivals] = useState<StockArrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  const userLevel  = authSession?.userLevel ?? 0;
  const canWrite   = userLevel >= 3;
  const employeeId = authSession?.employeeId;

  const fetchArrivals = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/stock-arrivals");
      const data = await res.json();
      setArrivals(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchArrivals(); }, [fetchArrivals]);

  // Push subscription state
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => setPushSubscribed(!!sub))
    ).catch(() => {});
  }, []);

  const handleSubscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        await sub?.unsubscribe();
        setPushSubscribed(false);
        return;
      }
      const vapidKeyRes = await fetch("/api/vapid-public-key").catch(() => null);
      if (!vapidKeyRes?.ok) return;
      const { publicKey } = await vapidKeyRes.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      await fetch("/api/anon-push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub }),
      });
      setPushSubscribed(true);
    } catch { /* 권한 거부 등 */ } finally {
      setPushLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newTitle.trim() || !employeeId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-arrivals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() || null, employeeId }),
      });
      if (res.ok) {
        setNewTitle(""); setNewBody("");
        await fetchArrivals();
        titleRef.current?.focus();
      }
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("이 입고 알림을 삭제하시겠습니까?")) return;
    await fetch(`/api/stock-arrivals/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    setArrivals(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0369a1, #0ea5e9)" }}>
              <Package size={12} className="text-white" />
            </div>
            <h1 className="text-base font-bold text-gray-900">입고 알림 관리</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleSubscribe}
              disabled={pushLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer disabled:cursor-default"
              style={pushSubscribed
                ? { background: "#f0fdf4", borderColor: "#86efac", color: "#166534" }
                : { background: "#eff6ff", borderColor: "#93c5fd", color: "#1e40af" }
              }
            >
              {pushLoading
                ? <div className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin" />
                : pushSubscribed ? <BellOff size={10} /> : <Bell size={10} />}
              {pushSubscribed ? "알림 설정됨" : "알림 받기"}
            </button>
            <button onClick={fetchArrivals} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
              <RefreshCw size={14} className={`text-gray-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Create form (level 3+) */}
        {canWrite && (
          <div className="bg-white border border-sky-100 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-sky-700 flex items-center gap-1.5">
              <Plus size={12} /> 입고 알림 작성
            </p>
            <input
              ref={titleRef}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400"
              placeholder="입고 품목 또는 공급사 (필수)"
              maxLength={80}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSubmit()}
            />
            <textarea
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 resize-none"
              placeholder="상세 내용 (선택)"
              maxLength={200}
              rows={2}
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">{newTitle.length}/80</span>
              <button
                onClick={handleSubmit}
                disabled={!newTitle.trim() || submitting}
                className="px-4 py-1.5 text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition disabled:opacity-40 cursor-pointer"
              >
                {submitting ? "전송 중..." : "등록 및 알림 발송"}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex flex-col gap-2">
          {loading && arrivals.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-8 text-center text-gray-400 text-sm">
              불러오는 중...
            </div>
          )}
          {!loading && arrivals.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-8 text-center text-gray-400 text-sm">
              등록된 입고 알림 없음
            </div>
          )}
          {arrivals.map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #e0f2fe, #bae6fd)", border: "1px solid #7dd3fc" }}>
                <Package size={14} className="text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 leading-snug">{a.title}</p>
                {a.body && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{a.body}</p>}
                <p className="text-[11px] text-gray-400 mt-1">
                  {new Date(a.created_at).toLocaleString("ko-KR", {
                    month: "2-digit", day: "2-digit",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
              {canWrite && (
                <button
                  onClick={() => handleDelete(a.id)}
                  className="shrink-0 p-1.5 text-gray-300 hover:text-rose-500 cursor-pointer transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
