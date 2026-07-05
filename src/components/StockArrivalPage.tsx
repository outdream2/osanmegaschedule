import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell, BellOff, Calendar, Check, Clock,
  Package, Pencil, RefreshCw, Send, Trash2, X,
} from "lucide-react";
import type { AuthSession } from "../types";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";

interface StockArrivalPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface StockArrival {
  id: number;
  title: string;
  body: string | null;
  created_at: string;
  created_by_id: number | null;
  scheduled_at: string | null;
  broadcast_sent: boolean;
}

function toLocalDT(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function defaultSchedule() {
  const d = new Date(); d.setHours(d.getHours() + 1); d.setMinutes(0, 0, 0);
  return toLocalDT(d);
}

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export const StockArrivalPage: React.FC<StockArrivalPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [arrivals, setArrivals] = useState<StockArrival[]>([]);
  const [loading, setLoading] = useState(false);

  // 작성 폼
  const [newTitle, setNewTitle] = useState("");
  const [newBody,  setNewBody ] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 인라인 수정
  const [editId,    setEditId   ] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody,  setEditBody ] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // 예약발송 picker (항목별, -1 = 새 항목용)
  const [schedPickerId, setSchedPickerId] = useState<number | "new" | null>(null);
  const [schedDT, setSchedDT] = useState("");

  // push
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);
  const userLevel  = (authSession as any)?.userLevel ?? (authSession as any)?.level ?? 0;
  const canWrite   = userLevel >= 3;
  const employeeId = authSession?.employeeId;

  const fetchArrivals = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/stock-arrivals");
      const data = await res.json();
      setArrivals(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchArrivals(); }, [fetchArrivals]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription().then(sub => setPushSubscribed(!!sub)))
      .catch(() => {});
  }, []);

  const handleSubscribe = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushSubscribed) {
        const sub = await reg.pushManager.getSubscription();
        await sub?.unsubscribe(); setPushSubscribed(false); return;
      }
      const vk = await fetch("/api/vapid-public-key").catch(() => null);
      if (!vk?.ok) return;
      const { publicKey } = await vk.json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
      await fetch("/api/anon-push-subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub }),
      });
      setPushSubscribed(true);
    } catch { /* 권한 거부 */ } finally { setPushLoading(false); }
  };

  // ── 저장 (알림 없이 DB만) ─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!newTitle.trim() || !employeeId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-arrivals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() || null, employeeId, send_now: false }),
      });
      if (res.ok) { setNewTitle(""); setNewBody(""); await fetchArrivals(); titleRef.current?.focus(); }
    } finally { setSubmitting(false); }
  };

  // ── 발송 (즉시) ───────────────────────────────────────────────────────────
  const handleSendNow = async () => {
    if (!newTitle.trim() || !employeeId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-arrivals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() || null, employeeId, send_now: true }),
      });
      if (res.ok) { setNewTitle(""); setNewBody(""); await fetchArrivals(); titleRef.current?.focus(); }
    } finally { setSubmitting(false); }
  };

  // ── 예약발송 (새 항목 or 기존 항목) ─────────────────────────────────────
  const openSchedPicker = (id: number | "new") => {
    setSchedPickerId(id);
    setSchedDT(defaultSchedule());
  };

  const handleScheduleSend = async () => {
    if (!schedDT || !employeeId) return;
    const isoTime = new Date(schedDT).toISOString();
    setSubmitting(true);
    try {
      if (schedPickerId === "new") {
        if (!newTitle.trim()) return;
        const res = await fetch("/api/stock-arrivals", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim(), body: newBody.trim() || null, employeeId, scheduled_at: isoTime }),
        });
        if (res.ok) { setNewTitle(""); setNewBody(""); }
      } else {
        const res = await fetch(`/api/stock-arrivals/${schedPickerId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, scheduled_at: isoTime }),
        });
        if (res.ok) {
          const updated = await res.json();
          setArrivals(prev => prev.map(a => a.id === schedPickerId ? updated : a));
        }
      }
      setSchedPickerId(null);
      if (schedPickerId === "new") await fetchArrivals();
    } finally { setSubmitting(false); }
  };

  // ── 기존 항목 즉시 발송 ───────────────────────────────────────────────────
  const handleBroadcast = async (id: number) => {
    if (!employeeId) return;
    const res = await fetch(`/api/stock-arrivals/${id}/broadcast`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setArrivals(prev => prev.map(a => a.id === id ? updated : a));
    }
  };

  // ── 인라인 수정 ───────────────────────────────────────────────────────────
  const startEdit = (a: StockArrival) => {
    setEditId(a.id); setEditTitle(a.title); setEditBody(a.body ?? "");
    setSchedPickerId(null);
  };

  const saveEdit = async (id: number) => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/stock-arrivals/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() || null, employeeId }),
      });
      if (res.ok) {
        const updated = await res.json();
        setArrivals(prev => prev.map(a => a.id === id ? updated : a));
        setEditId(null);
      }
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("이 입고 알림을 삭제하시겠습니까?")) return;
    await fetch(`/api/stock-arrivals/${id}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    setArrivals(prev => prev.filter(a => a.id !== id));
  };

  const isPending = (a: StockArrival) =>
    !!a.scheduled_at && !a.broadcast_sent && new Date(a.scheduled_at) > new Date();

  const minDT = toLocalDT(new Date());

  // ── 버튼 공통 스타일 ─────────────────────────────────────────────────────
  const actionBtn = (color: string) =>
    `flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer shrink-0 ${color}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNavHeader
        activePage="stockarrivals"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubscribe} disabled={pushLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer disabled:cursor-default"
              style={pushSubscribed
                ? { background:"#f0fdf4", borderColor:"#86efac", color:"#166534" }
                : { background:"#eff6ff", borderColor:"#93c5fd", color:"#1e40af" }}
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
        }
      />

      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3">

        {/* ── 작성 폼 ─────────────────────────────────────────────────────── */}
        {canWrite && (
          <div className="bg-white border border-sky-100 rounded-2xl p-4 flex flex-col gap-3">
            <input
              ref={titleRef}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400"
              placeholder="제목 (필수)"
              maxLength={80}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <textarea
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 resize-none"
              placeholder="내용 (선택)"
              maxLength={200}
              rows={2}
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
            />

            {/* 예약발송 picker — 새 항목 */}
            {schedPickerId === "new" && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <Clock size={12} className="text-amber-600 shrink-0" />
                <input
                  type="datetime-local"
                  className="flex-1 bg-transparent text-xs outline-none text-amber-800 font-semibold"
                  value={schedDT}
                  min={minDT}
                  onChange={e => setSchedDT(e.target.value)}
                />
                <button onClick={() => setSchedPickerId(null)} className="text-gray-300 hover:text-rose-400 cursor-pointer">
                  <X size={13} />
                </button>
              </div>
            )}

            {/* 버튼 3개 */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={handleSave}
                disabled={!newTitle.trim() || submitting}
                className={actionBtn("bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40")}
              >
                저장
              </button>
              <button
                onClick={handleSendNow}
                disabled={!newTitle.trim() || submitting}
                className={actionBtn("bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 disabled:opacity-40")}
              >
                <Send size={11} /> 발송
              </button>
              {schedPickerId === "new" ? (
                <button
                  onClick={handleScheduleSend}
                  disabled={!newTitle.trim() || !schedDT || submitting}
                  className={actionBtn("bg-amber-500 border-amber-500 text-white hover:bg-amber-600 disabled:opacity-40")}
                >
                  <Check size={11} /> 예약 확정
                </button>
              ) : (
                <button
                  onClick={() => openSchedPicker("new")}
                  disabled={!newTitle.trim() || submitting}
                  className={actionBtn("bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 disabled:opacity-40")}
                >
                  <Calendar size={11} /> 예약발송
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 리스트 ──────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {loading && arrivals.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">불러오는 중...</div>
          )}
          {!loading && arrivals.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">등록된 입고 알림 없음</div>
          )}

          {arrivals.map((a, idx) => {
            const isEditing = editId === a.id;
            const pending   = isPending(a);
            const schedOpen = schedPickerId === a.id;

            return (
              <div key={a.id} className={idx > 0 ? "border-t border-gray-100" : ""}>

                {/* ── 인라인 수정 모드 ── */}
                {isEditing ? (
                  <div className="px-3 py-2.5 bg-sky-50/40 flex flex-col gap-2">
                    <input
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 w-full"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      placeholder="제목"
                      autoFocus
                    />
                    <input
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 w-full"
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      placeholder="내용 (선택)"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => setEditId(null)}
                        className={actionBtn("bg-white border-gray-200 text-gray-500 hover:bg-gray-50")}>
                        취소
                      </button>
                      <button onClick={() => saveEdit(a.id)} disabled={!editTitle.trim() || editSaving}
                        className={actionBtn("bg-sky-500 border-sky-500 text-white hover:bg-sky-600 disabled:opacity-40")}>
                        <Check size={11} /> 저장
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── 일반 행 ── */
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    {/* 내용 */}
                    <Package size={13} className="text-sky-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-gray-800 truncate">{a.title}</span>
                        {pending && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 shrink-0">
                            <Clock size={9} /> 예약
                          </span>
                        )}
                        {!a.scheduled_at && !a.broadcast_sent && (
                          <span className="text-[10px] text-gray-300 font-semibold shrink-0">미발송</span>
                        )}
                        {a.broadcast_sent && (
                          <span className="text-[10px] text-emerald-600 font-semibold shrink-0">발송됨</span>
                        )}
                      </div>
                      {a.body && <p className="text-[11px] text-gray-400 truncate leading-snug">{a.body}</p>}
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {fmtDT(a.created_at)}
                        {pending && a.scheduled_at && (
                          <span className="ml-1.5 text-amber-500">→ {fmtDT(a.scheduled_at)}</span>
                        )}
                      </p>
                    </div>

                    {/* 액션 버튼 */}
                    {canWrite && (
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        <button onClick={() => startEdit(a)}
                          className={actionBtn("bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100")}>
                          <Pencil size={10} /> 수정
                        </button>
                        <button onClick={() => handleBroadcast(a.id)}
                          title="즉시 푸시 발송"
                          className={actionBtn("bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100")}>
                          <Send size={10} /> 발송
                        </button>
                        <button
                          onClick={() => {
                            if (schedOpen) { setSchedPickerId(null); }
                            else { openSchedPicker(a.id); }
                          }}
                          className={actionBtn(
                            schedOpen
                              ? "bg-amber-500 border-amber-500 text-white"
                              : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                          )}>
                          <Calendar size={10} /> 예약
                        </button>
                        <button onClick={() => handleDelete(a.id)}
                          className={actionBtn("bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100")}>
                          <Trash2 size={10} /> 삭제
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 예약발송 picker — 기존 항목 */}
                {schedOpen && (
                  <div className="mx-3 mb-2.5 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <Clock size={12} className="text-amber-600 shrink-0" />
                    <input
                      type="datetime-local"
                      className="flex-1 bg-transparent text-xs outline-none text-amber-800 font-semibold"
                      value={schedDT}
                      min={minDT}
                      onChange={e => setSchedDT(e.target.value)}
                    />
                    <button
                      onClick={handleScheduleSend}
                      disabled={!schedDT || submitting}
                      className={actionBtn("bg-amber-500 border-amber-500 text-white hover:bg-amber-600 disabled:opacity-40")}
                    >
                      <Check size={11} /> 확정
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
