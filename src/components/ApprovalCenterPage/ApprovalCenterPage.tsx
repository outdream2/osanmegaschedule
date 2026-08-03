// src/components/ApprovalCenterPage/ApprovalCenterPage.tsx
// 승인대기 통합 wrapper · 2026-08-03 · #180
// - 내부 2탭: 연차승인 (LeavePage embed) · 사직서승인 (ResignationApprovalPage)
// - 각 탭 라벨 옆 · pending 갯수 rose 배지
// - approval-count-updated CustomEvent 로 실시간 갱신
//   · 60초 폴링 fallback (동일 세션 · 다른 탭 처리 반영)
//
// DocumentWriterPage 의 내부 2탭 스타일 벤치마크 · 색상만 다름 (teal/rose)
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { CalendarDots, SignOut } from "@phosphor-icons/react";
import { LeavePage } from "../LeavePage/LeavePage";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../AppNavHeader";

const ResignationApprovalPage = React.lazy(() => import("../ResignationApprovalPage/ResignationApprovalPage"));

interface ApprovalCenterPageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
  /** 부모(BusinessManagePage) 서브탭 라벨 배지에 반영하기 위한 콜백 */
  onCountsChange?: (counts: { leave: number; resignation: number }) => void;
}

type ACTab = "leave" | "resignation";

const ApprovalCenterPage: React.FC<ApprovalCenterPageProps> = (props) => {
  const [tab, setTab] = useState<ACTab>("leave");
  const [leaveCount, setLeaveCount] = useState<number>(0);
  const [resignCount, setResignCount] = useState<number>(0);

  const loadCounts = useCallback(async () => {
    try {
      const [lRes, rRes] = await Promise.all([
        fetch("/api/leave-requests/pending-count").catch(() => null),
        fetch("/api/resignations/pending-count").catch(() => null),
      ]);
      const lJson = lRes && lRes.ok ? await lRes.json().catch(() => null) : null;
      const rJson = rRes && rRes.ok ? await rRes.json().catch(() => null) : null;
      const lc = Number(lJson?.count ?? 0);
      const rc = Number(rJson?.count ?? 0);
      setLeaveCount(lc);
      setResignCount(rc);
      props.onCountsChange?.({ leave: lc, resignation: rc });
    } catch {
      // no-op
    }
  }, [props]);

  // 초기 로드 · 60초 폴링 · CustomEvent 실시간
  useEffect(() => {
    loadCounts();
    const iv = setInterval(loadCounts, 60_000);
    const handler = () => loadCounts();
    window.addEventListener("approval-count-updated", handler);
    return () => {
      clearInterval(iv);
      window.removeEventListener("approval-count-updated", handler);
    };
  }, [loadCounts]);

  const TABS: { key: ACTab; label: string; count: number; icon: typeof CalendarDots }[] = [
    { key: "leave",       label: "연차승인",   count: leaveCount,  icon: CalendarDots },
    { key: "resignation", label: "사직서승인", count: resignCount, icon: SignOut      },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 내부 2탭 바 ── */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-5 flex items-stretch gap-0">
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon = t.icon;
            const activeText = t.key === "leave" ? "text-teal-700" : "text-rose-700";
            const activeIcon = t.key === "leave" ? "text-teal-600" : "text-rose-600";
            const activeBar  = t.key === "leave" ? "bg-teal-500"   : "bg-rose-500";
            const hoverText  = t.key === "leave" ? "hover:text-teal-700" : "hover:text-rose-700";
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`
                  relative flex items-center gap-2 px-5 sm:px-6 py-3.5 sm:py-4
                  text-[16px] sm:text-[18px] font-black leading-none whitespace-nowrap
                  transition-colors cursor-pointer
                  ${active ? activeText : `text-slate-500 ${hoverText}`}
                `}
              >
                <Icon size={19} weight="fill" className={active ? activeIcon : "text-slate-400"} />
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span
                    className="ml-0.5 min-w-[20px] h-[20px] inline-flex items-center justify-center px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black tabular-nums leading-none"
                    title={`대기 ${t.count}건`}
                  >
                    {t.count}
                  </span>
                )}
                {active && (
                  <span className={`absolute left-0 right-0 -bottom-px h-[2.5px] ${activeBar} rounded-t-sm`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 내부 탭 컨텐츠 ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === "leave" && (
          <LeavePage
            onBack={props.onBack}
            authSession={props.authSession}
            onNavigate={props.onNavigate}
            onLogout={props.onLogout}
            embedded
          />
        )}
        {tab === "resignation" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">사직서 승인 로딩 중...</div>}>
            <ResignationApprovalPage authSession={props.authSession} />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default ApprovalCenterPage;
