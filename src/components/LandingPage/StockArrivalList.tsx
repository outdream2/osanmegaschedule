// src/components/LandingPage/StockArrivalList.tsx
// 2026-08-25 · Framework Phase 4 · large-file 분리 · LandingPage.tsx 에서 이관
//   · 입고 알림 리스트 · self-contained (state + fetch + push 구독 + 상세 모달 · 모두 내부)
//   · props · isVendor (렌더 조건만 · vendor 로그인 시 숨김)
//   · dead code 5개 (showCreateArrival · newArrivalTitle · newArrivalBody · createLoading · handleCreateArrival) 삭제

import React, { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Package } from "@phosphor-icons/react";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";
import { SectionLabel } from "../common/SectionLabel";
import { Spinner } from "../common/Spinner";

interface StockArrival {
  id: number;
  title: string;
  body?: string | null;
  created_at: string;
}

interface StockArrivalListProps {
  isVendor: boolean;
}

export const StockArrivalList: React.FC<StockArrivalListProps> = ({ isVendor }) => {
  const { toast, showError } = useToast();
  const [stockArrivals, setStockArrivals] = useState<StockArrival[]>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(true);
  const [arrivalDetail, setArrivalDetail] = useState<StockArrival | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    api.get<StockArrival[]>("/api/stock-arrivals")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setStockArrivals([...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      })
      .catch(() => { })
      .finally(() => setArrivalsLoading(false));
    setPushSubscribed(localStorage.getItem("anon_push_subscribed") === "1");
  }, []);

  const handleAnonSubscribe = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      showError("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      showError("서버 설정 오류: VAPID 공개키가 없습니다. 관리자에게 문의하세요.");
      return;
    }
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showError("알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해 주세요.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });
      await api.post("/api/anon-push-subscribe", { subscription: sub.toJSON() });
      localStorage.setItem("anon_push_subscribed", "1");
      setPushSubscribed(true);
    } catch (err: unknown) {
      console.error("Push subscribe error:", err);
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? String(err);
      showError("알림 구독 실패: " + msg);
    } finally {
      setPushLoading(false);
    }
  };

  if (isVendor) return null;

  return (
    <>
      <div className="w-full mb-6 mt-2">
        {/* 2026-08-17 · SectionLabel + right slot (알림 받기 / 구독 중) · 최신 트렌드 · 딥네이비 톤 */}
        <SectionLabel tone="sky" right={
          !pushSubscribed ? (
            <button
              onClick={handleAnonSubscribe}
              disabled={pushLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[16px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Bell size={13} fill="currentColor" />알림 받기
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[16px] text-brand-deep font-semibold bg-brand-tint border border-brand/15 rounded-full px-3 py-1.5">
              <Bell size={13} fill="currentColor" /> 구독 중
            </span>
          )
        }>입고 알림</SectionLabel>
        {arrivalsLoading && stockArrivals.length > 0 && (
          <div className="flex items-center justify-center py-1.5 mb-1 bg-brand-tint border border-brand/15 rounded-lg sticky top-0 z-10"><Spinner tone="brand" size={13} label="새로 불러오는 중..." labelSize={13} /></div>
        )}
        {arrivalsLoading && stockArrivals.length === 0 ? (
          <div className="flex items-center justify-center py-10"><Spinner tone="zinc" size={16} label="로딩 중..." labelSize={14} /></div>
        ) : !arrivalsLoading && stockArrivals.length === 0 ? (
          <Card variant="flat" padding="none" className="text-center text-[16px] text-ink-soft py-8">데이터 없음</Card>
        ) : (
          /* 2026-08-24 · 최신 트렌드 · UI 대원칙 · Linear/Vercel/Attio 2026 */
          <Card clip padding="none" className={`relative divide-y divide-line/70 ${arrivalsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
            <span className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90" aria-hidden />
            {stockArrivals.slice(0, 5).map(a => {
              const createdMs = new Date(a.created_at).getTime();
              const diffMin = Math.floor((Date.now() - createdMs) / 60000);
              const isNew = diffMin < 60;
              const timeLabel = diffMin < 1 ? "방금"
                : diffMin < 60 ? `${diffMin}분 전`
                : diffMin < 60 * 24 ? `${Math.floor(diffMin / 60)}시간 전`
                : new Date(a.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setArrivalDetail(a)}
                  className="group relative w-full text-left flex items-center gap-2.5 px-4 py-3.5 hover:bg-brand-tint/30 focus:outline-none focus-visible:bg-brand-tint/40 transition-all duration-200 cursor-pointer"
                >
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-brand-deep opacity-0 group-hover:opacity-100 transition-opacity duration-200" aria-hidden />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-deep shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0 flex items-baseline gap-2 min-w-0">
                    <span className="text-[19px] font-semibold text-ink truncate tracking-tight group-hover:text-brand-deep transition-colors duration-200 shrink-0 max-w-[60%]">{a.title}</span>
                    {a.body && (
                      <span className="text-[15px] font-normal text-ink-soft/70 truncate min-w-0" title={a.body}>· {a.body}</span>
                    )}
                    {isNew && (
                      <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-md text-[12px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 ring-1 ring-emerald-500/25">
                        NEW
                      </span>
                    )}
                  </div>
                  <span className="text-[17px] font-medium text-ink-soft shrink-0 whitespace-nowrap tabular-nums group-hover:text-brand-deep/70 transition-colors duration-200" title={new Date(a.created_at).toLocaleString("ko-KR")}>
                    {timeLabel}
                  </span>
                </button>
              );
            })}
          </Card>
        )}
      </div>

      {/* 2026-08-24 · 입고 알림 상세 모달 · Modal 프리미티브 */}
      <Modal
        open={!!arrivalDetail}
        onClose={() => setArrivalDetail(null)}
        size="md"
        titleAccent
        icon={<Package size={18} className="text-white" weight="fill" />}
        title={
          arrivalDetail ? (
            <div className="min-w-0">
              <div className="text-[19px] font-bold text-ink tracking-tight truncate">{arrivalDetail.title}</div>
              <div className="text-[13px] text-ink-soft mt-0.5 tabular-nums">
                {new Date(arrivalDetail.created_at).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="px-5 py-5 bg-white">
          {arrivalDetail?.body ? (
            <div className="text-[17px] text-ink leading-relaxed whitespace-pre-wrap break-words">{arrivalDetail.body}</div>
          ) : (
            <div className="text-[15px] text-ink-soft italic">추가 내용 없음</div>
          )}
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 right-4 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </>
  );
};

export default StockArrivalList;
