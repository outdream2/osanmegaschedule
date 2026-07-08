// src/components/NotificationBell.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Bell, BellOff, CheckCheck, X, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import type { AuthSession } from "../types";

interface Notification {
  id: number;
  employee_id: number;
  title: string;
  body: string | null;
  type: "info" | "success" | "warning" | "alert";
  read: boolean;
  created_at: string;
}

interface NotificationBellProps {
  authSession: AuthSession | null;
}

const TYPE_STYLES = {
  info:    { icon: Info,          bg: "bg-blue-50",   border: "border-blue-200",   dot: "bg-blue-500",   text: "text-blue-700"   },
  success: { icon: CheckCircle,   bg: "bg-emerald-50",border: "border-emerald-200",dot: "bg-emerald-500",text: "text-emerald-700" },
  warning: { icon: AlertTriangle, bg: "bg-amber-50",  border: "border-amber-200",  dot: "bg-amber-500",  text: "text-amber-700"  },
  alert:   { icon: AlertCircle,   bg: "bg-rose-50",   border: "border-rose-200",   dot: "bg-rose-500",   text: "text-rose-700"   },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ authSession }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [justArrived, setJustArrived] = useState(false); // 신규 알림 애니메이션 트리거
  const panelRef = useRef<HTMLDivElement>(null);
  const prevMaxIdRef = useRef<number>(0);
  const employeeId = authSession?.employeeId;

  const unreadCount = notifications.filter((n) => !n.read).length;

  // 짧은 알림 소리 재생 (Web Audio · 외부 파일 없이 tone 합성)
  const playChime = useCallback(() => {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const now = ctx.currentTime;
      const play = (freq: number, start: number, dur: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine"; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, now + start);
        g.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + start); o.stop(now + start + dur);
      };
      // 도-미 짧은 2음
      play(880, 0,    0.22);
      play(1320, 0.14, 0.24);
      setTimeout(() => ctx.close?.(), 900);
    } catch { /* silent */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?employeeId=${employeeId}&limit=30`);
      if (res.ok) {
        const list = (await res.json()) as Notification[];
        // 신규 알림 감지 (이전 최대 id 보다 큰 알림이 있으면 신호)
        const maxId = list.reduce((m, n) => Math.max(m, n.id), 0);
        if (prevMaxIdRef.current > 0 && maxId > prevMaxIdRef.current) {
          setJustArrived(true);
          playChime();
          setTimeout(() => setJustArrived(false), 3500);
        }
        prevMaxIdRef.current = Math.max(prevMaxIdRef.current, maxId);
        setNotifications(list);
      }
    } finally {
      setLoading(false);
    }
  }, [employeeId, playChime]);

  // Initial fetch + poll every 20 seconds (기존 60→20 으로 반응성 강화)
  useEffect(() => {
    if (!employeeId) return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, 20_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const markRead = async (id: number) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  };

  const markAllRead = async () => {
    if (!employeeId || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
  };

  if (!employeeId) return null;

  const hasUnread = unreadCount > 0;
  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button — 미확인 알림 있으면 강조 · 신규 도착 시 흔들림 */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) fetchNotifications(); }}
        className={`relative flex items-center justify-center w-10 h-10 rounded-xl border transition cursor-pointer shadow-sm ${
          hasUnread
            ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 ring-1 ring-rose-200/60"
            : "bg-white hover:bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700"
        } ${justArrived ? "notif-bell-shake" : ""}`}
        title={hasUnread ? `미확인 알림 ${unreadCount}건` : "알림"}
      >
        <Bell size={18} strokeWidth={hasUnread ? 2.4 : 2} className={hasUnread ? "animate-pulse" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center leading-none shadow-md ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {/* Shake keyframes — inline style tag · 컴포넌트 유일 */}
      <style>{`
        @keyframes notif-bell-shake {
          0%, 100% { transform: rotate(0deg); }
          10%, 30%, 50%, 70% { transform: rotate(-14deg); }
          20%, 40%, 60%, 80% { transform: rotate(14deg); }
          90% { transform: rotate(-6deg); }
        }
        .notif-bell-shake { animation: notif-bell-shake 0.8s ease-in-out 2; transform-origin: 50% 20%; }
      `}</style>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.06)" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-slate-500" />
              <span className="text-sm font-bold text-slate-800">알림</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-black">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                >
                  <CheckCheck size={11} /> 모두 읽음
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
                <div className="w-3 h-3 border-2 border-slate-300 border-t-indigo-400 rounded-full animate-spin" />
                불러오는 중...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <BellOff size={24} className="text-slate-300" />
                <span className="text-slate-400 text-xs">알림이 없습니다</span>
              </div>
            ) : (
              notifications.map((n) => {
                const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
                const Icon = style.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 transition cursor-pointer ${n.read ? "bg-white hover:bg-slate-50" : "bg-indigo-50/40 hover:bg-indigo-50"}`}
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${style.bg} ${style.border} border`}>
                      <Icon size={13} className={style.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold truncate ${n.read ? "text-slate-600" : "text-slate-900"}`}>{n.title}</p>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 text-center">
              <span className="text-[10px] text-slate-400">최근 30개 알림</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
