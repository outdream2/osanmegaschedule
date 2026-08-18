// src/components/NotificationBell.tsx
// 2026-08-17 · apiClient 마이그레이션
import React, { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/apiClient";
import { TIMING } from "../constants/timing";
import { Bell, BellOff, CheckCheck, X, Info, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import type { AuthSession } from "../types";
import { StatusPill } from "./common/StatusPill";

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
  /** 알림 클릭 시 페이지 이동 · 없으면 이동 안 함 (2026-08-05 · 사용자 요청) */
  onNavigate?: (page: string) => void;
}

/**
 * 알림 title/body 패턴 기반 라우팅 (2026-08-05)
 *  · 신규 URL 컬럼 없이 (파생컬럼 X · feedback_no_derived_columns) · 기존 데이터로 매칭
 */
function pickRouteForNotification(n: { title: string; body: string | null; type: string }): string | null {
  const t = `${n.title ?? ""} ${n.body ?? ""}`;
  // 진열요청·창고준비·진열완료 → 매장관리 (진열요청 서브탭이 나오면 그쪽)
  if (/진열|보충 요청|창고 준비|픽업/i.test(t)) return "display";
  // 발주요청·재고 → 매입관리
  if (/발주|재고 부족|재고관리/i.test(t)) return "order-manage";
  // 연차·휴가 → 승인 센터
  if (/연차|휴가|승인/i.test(t)) return "approval";
  // 스케줄 → 스케줄 페이지
  if (/스케줄|근무|배정/i.test(t)) return "schedule";
  // 이슈공유 · 게시판
  if (/이슈|게시|댓글|@언급|멘션/i.test(t)) return "board";
  // OCR · 거래명세서
  if (/OCR|명세서|거래명세/i.test(t)) return "order-manage";
  return null;
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

export const NotificationBell: React.FC<NotificationBellProps> = ({ authSession, onNavigate }) => {
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
      const AC = (window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
      const { data: list } = await api.get<Notification[]>(`/api/notifications?employeeId=${employeeId}&limit=30`);
      const arr = Array.isArray(list) ? list : [];
      const maxId = arr.reduce((m, n) => Math.max(m, n.id), 0);
      if (prevMaxIdRef.current > 0 && maxId > prevMaxIdRef.current) {
        setJustArrived(true);
        playChime();
        setTimeout(() => setJustArrived(false), TIMING.TOAST_LONG);
      }
      prevMaxIdRef.current = Math.max(prevMaxIdRef.current, maxId);
      setNotifications(arr);
    } catch { /* silent · polling 실패 무시 */ }
    finally { setLoading(false); }
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
    try { await api.patch(`/api/notifications/${id}/read`); } catch { /* silent · optimistic UI 유지 */ }
  };

  const markAllRead = async () => {
    if (!employeeId || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try { await api.post("/api/notifications/read-all", { employeeId }); } catch { /* silent */ }
  };

  if (!employeeId) return null;

  const hasUnread = unreadCount > 0;
  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button — 미확인 알림 있으면 강조 · 신규 도착 시 흔들림 */}
      {/* 2026-08-17 · 최신 트렌드 · 딥네이비 배경 대응 · 반투명 흰 · 접근성 h-9 · 폰트 +2 */}
      <button
        onClick={() => { setOpen((v) => !v); if (!open) fetchNotifications(); }}
        className={`relative flex items-center justify-center w-9 h-9 rounded-lg border transition-colors cursor-pointer shadow-sm ${
          hasUnread
            ? "bg-rose-500/95 hover:bg-rose-600 border-rose-400 text-white"
            : "bg-white/[0.10] hover:bg-white/[0.18] border-white/15 hover:border-white/30 text-white"
        } ${justArrived ? "notif-bell-shake" : ""}`}
        title={hasUnread ? `미확인 알림 ${unreadCount}건` : "알림"}
      >
        <Bell size={16} strokeWidth={hasUnread ? 2.4 : 2.2} className={hasUnread ? "animate-pulse" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center leading-none shadow-sm ring-2 ring-white tabular-nums">
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

      {/* Dropdown panel · 반응형 · 모바일은 fixed 로 화면 폭에 맞춤 (2026-08-05 · 왼쪽 치우침 fix) */}
      {open && (
        <div
          // 2026-08-18 · shadow-brand-modal · Attio 3-layer 통일
          className="fixed inset-x-2 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 mx-auto sm:mx-0 max-w-[420px] bg-white border border-line rounded-2xl shadow-brand-modal z-50 overflow-hidden">
          {/* Header · 2026-08-17 · 최신 트렌드 · accent bar + 폰트 +2 · 딥네이비 통일 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-zinc-50/60">
            <div className="flex items-center gap-2.5">
              <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
              <Bell size={15} className="text-brand-deep" />
              <span className="text-[16px] font-bold text-ink tracking-tight">알림</span>
              {unreadCount > 0 && (
                <StatusPill tone="rose" size="sm" dot pulse>{unreadCount}</StatusPill>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-semibold text-ink-soft hover:text-brand-deep hover:bg-brand-tint rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCheck size={13} /> 모두 읽음
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-ink-soft hover:text-ink hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                aria-label="닫기"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-50">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-zinc-400 text-xs gap-2">
                <div className="w-3 h-3 border-2 border-zinc-300 border-t-indigo-400 rounded-full animate-spin" />
                불러오는 중...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <BellOff size={24} className="text-zinc-300" />
                <span className="text-zinc-400 text-xs">알림이 없습니다</span>
              </div>
            ) : (
              notifications.map((n) => {
                const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
                const Icon = style.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      const route = pickRouteForNotification(n);
                      if (route && onNavigate) {
                        setOpen(false);
                        onNavigate(route);
                      }
                    }}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 transition cursor-pointer ${n.read ? "bg-white hover:bg-zinc-50" : "bg-indigo-50/40 hover:bg-indigo-50"}`}
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${style.bg} ${style.border} border`}>
                      <Icon size={13} className={style.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold truncate ${n.read ? "text-zinc-600" : "text-zinc-900"}`}>{n.title}</p>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-deep shrink-0" />}
                      </div>
                      {n.body && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[10px] text-zinc-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-zinc-100 text-center">
              <span className="text-[10px] text-zinc-400">최근 30개 알림</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
