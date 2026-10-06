// src/components/LandingPage/TodayStatusPanel.tsx
import React from "react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { AccentBar } from "../common/AccentBar";
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context · subTab 지정 이동
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
  // 2026-10-06 · breakdown 토글 제거 (뱃지 2개 체계로 전환) · prop 호환 유지
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
    const leaf = (perms as any)?.[key];
    if (leaf?.hidden === true) return true;
    for (const k of Object.keys(perms ?? {})) {
      if (k.endsWith(`:${key}`) && (perms as any)[k]?.hidden === true) return true;
    }
    return false;
  };
  const lunchMenuVisible    = isVisible("lunch", currentViewport)          && !isPermsHidden("lunch");
  const leaveMenuVisible    = isVisible("leave", currentViewport)          && !isPermsHidden("leave");
  const displayMenuVisible  = isVisible("display", currentViewport)        && !isPermsHidden("display");
  const requestsMenuVisible = isVisible("requests", currentViewport)       && !isPermsHidden("requests");
  const businessMenuVisible = isVisible("business-manage", currentViewport) && !isPermsHidden("business-manage");

  // 2026-10-06 · 사용자 지시 · 연차 + 사직서 → 서류 승인 통합
  const docMenuVisible = leaveMenuVisible || businessMenuVisible || requestsMenuVisible;
  const docCount =
    (leaveMenuVisible ? leavePendingCount : 0)
    + ((businessMenuVisible || requestsMenuVisible) ? requestsCounts.resignation : 0);

  // 2026-10-06 · 사용자 지시 · "요청" 뱃지 = 진열 + 발주 + 점심 + 거래처
  const requestBadgeCount =
    (requestsMenuVisible ? requestsCounts.display : 0)
    + (displayMenuVisible ? requestsCounts.order : 0)
    + (lunchMenuVisible ? requestsCounts.lunch : 0)
    + (isAdmin && requestsMenuVisible ? requestsCounts.vendor : 0);

  return (
    <div className="w-full mb-6">
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <AccentBar />
        {/* 2026-10-06 · 사용자 지시 · 반응형에서 크기 -1 */}
        <div className="text-ink font-bold tracking-tight text-[17px] md:text-[18px]">오늘의 승인 요청</div>
        {/* 2026-10-06 · 사용자 지시 · 뱃지 2개 (승인대기 · 요청) · 전체 토글 제거 */}
        <button
          type="button"
          onClick={() => onNavigate("business-manage", authSession)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[14px] md:text-[15px] font-semibold text-teal-800 bg-teal-50 hover:brightness-95 border border-teal-200 cursor-pointer transition-colors"
          title="승인대기 · 경영관리 > 승인대기로 이동"
        >
          승인대기 <b className="tabular-nums">{docCount}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("requests", authSession)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[14px] md:text-[15px] font-semibold text-brand-deep bg-brand-tint hover:brightness-95 border border-brand/15 cursor-pointer transition-colors"
          title="요청 목록 페이지로 이동"
        >
          요청 <b className="tabular-nums">{requestBadgeCount}</b>건
        </button>
      </div>
      {/* 2026-10-06 · 사용자 지시 · 반응형에서 크기 -1 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[18px] md:text-[19px] text-ink-soft pl-[13px]">
        {/* 2026-10-06 · 사용자 지시 · 연차 + 사직서 → 서류 승인 통합 */}
        {docMenuVisible && (
          <button
            type="button"
            onClick={() => onNavigate("business-manage", authSession)}
            className="inline-flex items-center gap-1.5 hover:text-amber-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
            title="서류 승인 · 경영관리 > 승인대기로 이동"
          >
            <span className={`w-2 h-2 rounded-full ${docCount > 0 ? "bg-amber-500" : "bg-zinc-300"}`} />
            서류 승인 <b className={`font-bold tabular-nums ${docCount > 0 ? "text-amber-700" : "text-ink"}`}>{docCount}</b>건
          </button>
        )}
        {requestsMenuVisible && (
          <button
            type="button"
            onClick={() => onNavigate("requests", authSession)}
            className="inline-flex items-center gap-1.5 hover:text-sky-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
            title="진열 요청 · 요청 목록으로 이동"
          >
            <span className={`w-2 h-2 rounded-full ${requestsCounts.display > 0 ? "bg-sky-500" : "bg-zinc-300"}`} />
            진열 요청 <b className={`font-bold tabular-nums ${requestsCounts.display > 0 ? "text-sky-700" : "text-ink"}`}>{requestsCounts.display}</b>건
          </button>
        )}
        {displayMenuVisible && (
          <button
            type="button"
            onClick={() => onNavigate("display", authSession)}
            className="inline-flex items-center gap-1.5 hover:text-teal-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
            title="발주 요청 · 매장>발주로 이동"
          >
            <span className={`w-2 h-2 rounded-full ${requestsCounts.order > 0 ? "bg-teal-500" : "bg-zinc-300"}`} />
            발주 요청 <b className={`font-bold tabular-nums ${requestsCounts.order > 0 ? "text-teal-700" : "text-ink"}`}>{requestsCounts.order}</b>건
          </button>
        )}
        {lunchMenuVisible && (
          <button
            type="button"
            onClick={() => onNavigate("lunch", authSession)}
            className="inline-flex items-center gap-1.5 hover:text-emerald-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
            title="점심 신청 페이지로 이동"
          >
            <span className={`w-2 h-2 rounded-full ${requestsCounts.lunch > 0 ? "bg-emerald-500" : "bg-zinc-300"}`} />
            점심 신청 <b className={`font-bold tabular-nums ${requestsCounts.lunch > 0 ? "text-emerald-700" : "text-ink"}`}>{requestsCounts.lunch}</b>건
          </button>
        )}
        {isAdmin && requestsMenuVisible && (
          <button
            type="button"
            onClick={() => {
              setActiveByPage("requests", "vendor");
              onNavigate("requests", authSession);
            }}
            className="inline-flex items-center gap-1.5 hover:text-blue-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
            title="거래처 승인 · 요청목록>거래처승인 탭으로 이동"
          >
            <span className={`w-2 h-2 rounded-full ${requestsCounts.vendor > 0 ? "bg-blue-500" : "bg-zinc-300"}`} />
            거래처 승인 <b className={`font-bold tabular-nums ${requestsCounts.vendor > 0 ? "text-blue-700" : "text-ink"}`}>{requestsCounts.vendor}</b>건
          </button>
        )}
      </div>
    </div>
  );
};
