// src/components/LandingPage/TodayStatusPanel.tsx
import React from "react";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";

interface TodayStatusPanelProps {
  authSession: AuthSession;
  leavePendingCount: number;
  requestsCounts: {
    display: number;
    order: number;
    mismatch: number;
    lunch: number;
    inventory: number;
    return: number;
    resignation: number;
  };
  statusDetailOpen: boolean;
  setStatusDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onNavigate: (page: Exclude<AppNavPage, "landing">, auth?: AuthSession) => void;
  // 2026-08-23 · #171 잔여 · 승인대기(모든 직원)·결제요청(admin only)
  paymentPendingCount?: number;
  isAdmin?: boolean;
}

export const TodayStatusPanel: React.FC<TodayStatusPanelProps> = ({
  authSession,
  leavePendingCount,
  requestsCounts,
  statusDetailOpen,
  setStatusDetailOpen,
  onNavigate,
  paymentPendingCount = 0,
  isAdmin = false,
}) => {
  // 2026-08-23 · #171 잔여 · 승인대기 = 연차 + 사직서 (관리자 승인 대상)
  const approvalPendingTotal = leavePendingCount + requestsCounts.resignation;
  return (
    <div className="w-full mb-6">
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <AccentBar />
        <div className="text-ink font-bold tracking-tight text-[18px]">오늘의 현황</div>
        {/* 전체 요청 N건 요약 · 클릭 → 상세 리스트 토글 · 2026-08-21 · #171 Phase 3 */}
        {(() => {
          const totalCount = leavePendingCount
            + requestsCounts.display + requestsCounts.order
            + requestsCounts.mismatch + requestsCounts.lunch
            + requestsCounts.inventory + requestsCounts.return
            + requestsCounts.resignation
            + (isAdmin ? paymentPendingCount : 0);
          return (
            <button
              type="button"
              onClick={() => setStatusDetailOpen(v => !v)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[15px] font-semibold text-brand-deep bg-brand-tint hover:brightness-95 border border-brand/15 cursor-pointer transition-colors"
              title={statusDetailOpen ? "상세 리스트 접기" : "상세 리스트 펼치기"}
              aria-expanded={statusDetailOpen}
            >
              전체 <b className="tabular-nums">{totalCount}</b>건
              <span aria-hidden className={`transition-transform ${statusDetailOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
          );
        })()}
        {/* 2026-08-23 · #171 잔여 · 승인대기 (모든 직원 노출 · 연차+사직서 합) · click → 승인대기 페이지 */}
        <button
          type="button"
          onClick={() => onNavigate("business-manage", authSession)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[15px] font-semibold text-teal-800 bg-teal-50 hover:brightness-95 border border-teal-200 cursor-pointer transition-colors"
          title="승인대기 · 경영관리 > 승인대기로 이동"
        >
          승인대기 <b className="tabular-nums">{approvalPendingTotal}</b>건
        </button>
        {/* 2026-08-23 · #171 잔여 · 결제요청 (admin only · 미결제·부분결제 매입건) · click → 매장>매입>결제 */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate("display", authSession)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[15px] font-semibold text-violet-800 bg-violet-50 hover:brightness-95 border border-violet-200 cursor-pointer transition-colors"
            title="결제요청 · 매장>매입 결제 페이지로 이동"
          >
            결제요청 <b className="tabular-nums">{paymentPendingCount}</b>건
          </button>
        )}
      </div>
      {/* 7항목 (연차·진열발주·불일치·점심·재고점검·반품·사직서) · 각 클릭 → 페이지 이동 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[19px] text-ink-soft pl-[13px]">
        <button
          type="button"
          onClick={() => onNavigate("leave", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-amber-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="연차 승인 페이지로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${leavePendingCount > 0 ? "bg-amber-500" : "bg-zinc-300"}`} />
          연차 승인 <b className={`font-bold tabular-nums ${leavePendingCount > 0 ? "text-amber-700" : "text-ink"}`}>{leavePendingCount}</b>건
        </button>
        {/* 2026-08-21 · #171 · 진열/발주 분리 · 사용자 요청 · 발주 별도 항목 (teal) */}
        <button
          type="button"
          onClick={() => onNavigate("requests", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-sky-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="진열 요청 · 요청 목록으로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.display > 0 ? "bg-sky-500" : "bg-zinc-300"}`} />
          진열 요청 <b className={`font-bold tabular-nums ${requestsCounts.display > 0 ? "text-sky-700" : "text-ink"}`}>{requestsCounts.display}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("display", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-teal-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="발주 요청 · 매장>발주로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.order > 0 ? "bg-teal-500" : "bg-zinc-300"}`} />
          발주 요청 <b className={`font-bold tabular-nums ${requestsCounts.order > 0 ? "text-teal-700" : "text-ink"}`}>{requestsCounts.order}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("requests", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-rose-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="배치구역 불일치 · 요청 목록으로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.mismatch > 0 ? "bg-rose-500" : "bg-zinc-300"}`} />
          배치구역 불일치 <b className={`font-bold tabular-nums ${requestsCounts.mismatch > 0 ? "text-rose-700" : "text-ink"}`}>{requestsCounts.mismatch}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("lunch", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-emerald-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="점심 신청 페이지로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.lunch > 0 ? "bg-emerald-500" : "bg-zinc-300"}`} />
          점심 신청 <b className={`font-bold tabular-nums ${requestsCounts.lunch > 0 ? "text-emerald-700" : "text-ink"}`}>{requestsCounts.lunch}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("stockcheck", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="재고 점검 페이지로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.inventory > 0 ? "bg-violet-500" : "bg-zinc-300"}`} />
          재고 점검 <b className={`font-bold tabular-nums ${requestsCounts.inventory > 0 ? "text-violet-700" : "text-ink"}`}>{requestsCounts.inventory}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("requests", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-orange-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="반품 요청 · 요청 목록으로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.return > 0 ? "bg-orange-500" : "bg-zinc-300"}`} />
          반품 요청 <b className={`font-bold tabular-nums ${requestsCounts.return > 0 ? "text-orange-700" : "text-ink"}`}>{requestsCounts.return}</b>건
        </button>
        <button
          type="button"
          onClick={() => onNavigate("business-manage", authSession)}
          className="inline-flex items-center gap-1.5 hover:text-red-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
          title="사직서 승인 · 경영관리로 이동"
        >
          <span className={`w-2 h-2 rounded-full ${requestsCounts.resignation > 0 ? "bg-red-500" : "bg-zinc-300"}`} />
          사직서 승인 <b className={`font-bold tabular-nums ${requestsCounts.resignation > 0 ? "text-red-700" : "text-ink"}`}>{requestsCounts.resignation}</b>건
        </button>
      </div>

      {/* 2026-08-21 · #171 Phase 3 · 상세 리스트 (전체 N건 클릭 시 토글) · 7항목 breakdown table */}
      {statusDetailOpen && (
        <Card variant="raw-sm" padding="none" className="mt-3 px-4 py-3">
          <div className="text-[15px] font-bold text-ink-soft mb-2 tracking-tight">요청 상세 · 카테고리별 대기 건수</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[16px]">
            {[
              { label: "연차 승인", count: leavePendingCount, dot: "bg-amber-500", text: "text-amber-700", nav: "leave" as Exclude<AppNavPage, "landing"> },
              { label: "진열 요청", count: requestsCounts.display, dot: "bg-sky-500", text: "text-sky-700", nav: "requests" as Exclude<AppNavPage, "landing"> },
              { label: "발주 요청", count: requestsCounts.order, dot: "bg-teal-500", text: "text-teal-700", nav: "display" as Exclude<AppNavPage, "landing"> },
              { label: "배치구역 불일치", count: requestsCounts.mismatch, dot: "bg-rose-500", text: "text-rose-700", nav: "requests" as Exclude<AppNavPage, "landing"> },
              { label: "점심 신청", count: requestsCounts.lunch, dot: "bg-emerald-500", text: "text-emerald-700", nav: "lunch" as Exclude<AppNavPage, "landing"> },
              { label: "재고 점검", count: requestsCounts.inventory, dot: "bg-violet-500", text: "text-violet-700", nav: "stockcheck" as Exclude<AppNavPage, "landing"> },
              { label: "반품 요청", count: requestsCounts.return, dot: "bg-orange-500", text: "text-orange-700", nav: "requests" as Exclude<AppNavPage, "landing"> },
              { label: "사직서 승인", count: requestsCounts.resignation, dot: "bg-red-500", text: "text-red-700", nav: "business-manage" as Exclude<AppNavPage, "landing"> },
              // 2026-08-23 · #171 잔여 · 결제요청 (admin only) · 미결제·부분결제 매입건 총합
              ...(isAdmin ? [{ label: "결제요청", count: paymentPendingCount, dot: "bg-violet-500", text: "text-violet-700", nav: "display" as Exclude<AppNavPage, "landing"> }] : []),
            ].map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => onNavigate(item.nav, authSession)}
                className="flex items-center gap-2 py-1 hover:bg-zinc-50 rounded-md px-1.5 cursor-pointer transition-colors text-left"
              >
                <span className={`w-2 h-2 rounded-full ${item.count > 0 ? item.dot : "bg-zinc-300"} shrink-0`} />
                <span className="flex-1 text-ink-soft">{item.label}</span>
                <span className={`font-bold tabular-nums ${item.count > 0 ? item.text : "text-zinc-400"}`}>{item.count}</span>
                <span className="text-zinc-400">건</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
