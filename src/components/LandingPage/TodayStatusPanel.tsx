// src/components/LandingPage/TodayStatusPanel.tsx
// 2026-10-07 · 사용자 지시 · "오늘의 승인요청" 구조를 "오늘의 판매현황"(TodayRevenueKpiPanel) 과 동일하게 통일
//   · SectionLabel + 클릭 가능한 흰색 카드 + 상단 brand accent glow 띠 + flex divide-x cell layout + 모바일 하단바
//   · 데이터·동작·권한 gate 유지 (UI only · 2026-08-25 사용자 지시 "페이지 숨김 시 승인 요청에서도 숨김" 등 모든 기존 규칙 유지)
import React from "react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { SectionLabel } from "../common/SectionLabel";
import { useActiveNav } from "../../contexts/ActiveNavContext";
// 2026-08-25 · 사용자 지시 · 페이지 숨김 시 오늘의 승인 요청에서도 관련 건수 숨김
import { usePageVisibility } from "../../hooks/usePageVisibility";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { useIsMobile } from "../../hooks/use-mobile";

interface TodayStatusPanelProps {
  authSession: AuthSession;
  leavePendingCount: number;
  requestsCounts: {
    display: number;
    order: number;
    lunch: number;
    inventory: number;
    return: number;
    resignation: number;
    vendor: number;
  };
  // 2026-10-06 · breakdown 토글 제거 · prop 호환만 유지
  statusDetailOpen?: boolean;
  setStatusDetailOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  onNavigate: (page: Exclude<AppNavPage, "landing">, auth?: AuthSession) => void;
  paymentPendingCount?: number;
  isAdmin?: boolean;
}

export const TodayStatusPanel: React.FC<TodayStatusPanelProps> = ({
  authSession,
  leavePendingCount,
  requestsCounts,
  onNavigate,
  isAdmin = false,
}) => {
  // 2026-10-06 · 사용자 지시 · 뱃지 2개 체계 (승인대기 · 요청)
  //   · 승인대기 = 연차 승인 + 사직서 승인 (서류 승인 성격)
  //   · 요청 = 진열 + 발주 + 점심 + 거래처
  const { setActiveByPage } = useActiveNav();
  const { isVisible } = usePageVisibility();
  const { perms } = usePagePermissions();
  const isMobile = useIsMobile();
  const currentViewport = isMobile ? "mobile" : "pc";
  const isPermsHidden = (key: string): boolean => {
    const leaf = (perms as Record<string, { hidden?: boolean } | undefined>)?.[key];
    if (leaf?.hidden === true) return true;
    for (const k of Object.keys(perms ?? {})) {
      if (k.endsWith(`:${key}`) && (perms as Record<string, { hidden?: boolean } | undefined>)[k]?.hidden === true) return true;
    }
    return false;
  };
  const lunchMenuVisible    = isVisible("lunch", currentViewport)          && !isPermsHidden("lunch");
  const leaveMenuVisible    = isVisible("leave", currentViewport)          && !isPermsHidden("leave");
  const displayMenuVisible  = isVisible("display", currentViewport)        && !isPermsHidden("display");
  const requestsMenuVisible = isVisible("requests", currentViewport)       && !isPermsHidden("requests");
  const businessMenuVisible = isVisible("business-manage", currentViewport) && !isPermsHidden("business-manage");

  // 2026-10-06 · 사용자 지시 · 연차 + 사직서 → 서류 승인 통합
  const docCount =
    (leaveMenuVisible ? leavePendingCount : 0)
    + ((businessMenuVisible || requestsMenuVisible) ? requestsCounts.resignation : 0);

  const displayCount = requestsMenuVisible ? requestsCounts.display : 0;
  const orderCount   = displayMenuVisible  ? requestsCounts.order   : 0;
  const lunchCount   = lunchMenuVisible    ? requestsCounts.lunch   : 0;
  const vendorCount  = (isAdmin && requestsMenuVisible) ? requestsCounts.vendor : 0;

  // 2026-10-07 · 사용자 지시 · 승인요청 링크 전부 "승인업무" 페이지 (requests > leave subTab)
  const openApprovalWork = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveByPage("requests", "leave");
    onNavigate("requests", authSession);
  };
  // 각 cell click 시 propagation 중단 (카드 클릭과 중복 방지)
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div className="w-full mb-7">
      {/* 2026-10-07 · 사용자 지시 · 판매현황(teal)과 색상 분리 · 승인요청=amber (주의/처리 필요) */}
      <SectionLabel tone="amber">오늘의 승인 요청</SectionLabel>
      <div
        className="w-full bg-white border border-zinc-200 rounded-2xl shadow-[0_1px_3px_rgba(10,46,74,0.06),0_8px_28px_-16px_rgba(10,46,74,0.18)] hover:shadow-[0_2px_8px_rgba(10,46,74,0.10),0_12px_36px_-16px_rgba(10,46,74,0.25)] hover:border-brand-amber/40 cursor-pointer transition-all overflow-hidden relative group"
        onClick={openApprovalWork}
        role="button"
        title="승인업무로 이동"
      >
        {/* 2026-10-07 · 사용자 지시 · 승인요청 카드 내부 accent 전부 amber (제목 tone 과 매칭) */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand-amber/50 to-transparent pointer-events-none" aria-hidden />
        <div className="flex items-stretch divide-x divide-zinc-100">
          {/* 승인대기 (메인) · 좌측 amber gradient bar · amber tint background */}
          <div
            className="flex-[2] px-4 sm:px-6 py-3 sm:py-4 min-w-0 relative bg-gradient-to-br from-brand-amber/[0.06] via-brand-amber-tint/40 to-transparent cursor-pointer"
            onClick={stop(() => { setActiveByPage("requests", "leave"); onNavigate("requests", authSession); })}
            title="서류 승인 · 승인업무로 이동"
          >
            <span className="absolute left-0 top-3 bottom-3 w-[3px] bg-gradient-to-b from-brand-amber-ink via-brand-amber to-brand-amber/70 rounded-r-full shadow-[0_0_10px_rgba(232,138,61,0.25)]" aria-hidden />
            <div className="pl-2">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="relative flex w-2 h-2 shrink-0" aria-hidden title={docCount > 0 ? "대기" : "없음"}>
                  <span className={`absolute inset-0 rounded-full ${docCount > 0 ? "bg-amber-400 animate-ping opacity-60" : ""}`} />
                  <span className={`relative w-2 h-2 rounded-full ${docCount > 0 ? "bg-amber-500" : "bg-zinc-300"}`} />
                </span>
                <span className="text-[14px] sm:text-[15px] text-zinc-600 font-semibold tracking-tight">승인대기</span>
              </div>
              {/* 2026-10-06 · 사용자 지시 반응형 폰트 clamp · 숫자 whitespace-nowrap */}
              <div
                className="font-bold tabular-nums leading-tight text-brand-amber-ink whitespace-nowrap"
                style={{ fontSize: "clamp(17px, 3.2vw, 26px)" }}
                title={`${docCount}건`}
              >
                {docCount.toLocaleString("ko-KR")}건
              </div>
            </div>
          </div>
          {/* 진열 요청 */}
          <div
            className="flex-1 px-3 sm:px-4 py-3 sm:py-4 min-w-0 group-hover:bg-zinc-50/60 transition cursor-pointer"
            onClick={stop(() => onNavigate("requests", authSession))}
            title="진열 요청 · 요청 목록으로 이동"
          >
            <div className="flex items-center gap-1.5 mb-1 whitespace-nowrap">
              <span className={`w-2 h-2 rounded-full ${displayCount > 0 ? "bg-sky-500" : "bg-zinc-300"}`} aria-hidden />
              <span className="text-[14px] sm:text-[15px] text-zinc-500 font-semibold tracking-tight">진열 요청</span>
            </div>
            <div
              className="font-bold tabular-nums text-ink leading-tight whitespace-nowrap"
              style={{ fontSize: "clamp(15px, 2.4vw, 22px)" }}
              title={`${displayCount}건`}
            >
              {displayCount.toLocaleString("ko-KR")}건
            </div>
          </div>
          {/* 발주 요청 */}
          <div
            className="flex-1 px-3 sm:px-4 py-3 sm:py-4 min-w-0 group-hover:bg-zinc-50/60 transition cursor-pointer"
            onClick={stop(() => onNavigate("display", authSession))}
            title="발주 요청 · 매장 > 발주로 이동"
          >
            <div className="flex items-center gap-1.5 mb-1 whitespace-nowrap">
              <span className={`w-2 h-2 rounded-full ${orderCount > 0 ? "bg-teal-500" : "bg-zinc-300"}`} aria-hidden />
              <span className="text-[14px] sm:text-[15px] text-zinc-500 font-semibold tracking-tight">발주 요청</span>
            </div>
            <div
              className="font-bold tabular-nums text-ink leading-tight whitespace-nowrap"
              style={{ fontSize: "clamp(15px, 2.4vw, 22px)" }}
              title={`${orderCount}건`}
            >
              {orderCount.toLocaleString("ko-KR")}건
            </div>
          </div>
          {/* 승인 상세 → (PC) · amber tint + arrow hover */}
          <div className="hidden sm:flex items-center px-4 bg-gradient-to-br from-brand-amber/[0.08] to-brand-amber-tint/60 group-hover:from-brand-amber/[0.14] group-hover:to-brand-amber-tint transition">
            <div className="text-[15px] text-brand-amber-ink font-bold whitespace-nowrap tracking-tight flex items-center gap-1.5">
              승인 상세
              <span className="transition-transform group-hover:translate-x-0.5">›</span>
            </div>
          </div>
        </div>
        {/* 모바일 하단 바 · 점심/거래처 세부 + 상세 arrow · amber tone */}
        <div className="sm:hidden flex items-center justify-between px-3 py-2 bg-gradient-to-r from-brand-amber/[0.06] via-brand-amber-tint/60 to-brand-amber/[0.06] text-[14px] border-t border-zinc-100 flex-wrap gap-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            {lunchMenuVisible && (
              <button
                type="button"
                onClick={stop(() => onNavigate("lunch", authSession))}
                className="inline-flex items-center gap-1 cursor-pointer"
                title="점심 신청 페이지로 이동"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${lunchCount > 0 ? "bg-emerald-500" : "bg-zinc-300"}`} aria-hidden />
                <span className="text-zinc-600">점심</span>
                <b className={`tabular-nums ${lunchCount > 0 ? "text-emerald-700" : "text-ink"}`}>{lunchCount}</b>건
              </button>
            )}
            {isAdmin && requestsMenuVisible && (
              <button
                type="button"
                onClick={stop(() => { setActiveByPage("requests", "vendor"); onNavigate("requests", authSession); })}
                className="inline-flex items-center gap-1 cursor-pointer"
                title="거래처 승인 · 요청목록 > 거래처승인 탭으로 이동"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${vendorCount > 0 ? "bg-blue-500" : "bg-zinc-300"}`} aria-hidden />
                <span className="text-zinc-600">거래처</span>
                <b className={`tabular-nums ${vendorCount > 0 ? "text-blue-700" : "text-ink"}`}>{vendorCount}</b>건
              </button>
            )}
          </div>
          <span className="text-brand-amber-ink font-bold flex items-center gap-1">
            승인 상세 <span>›</span>
          </span>
        </div>
      </div>
    </div>
  );
};
