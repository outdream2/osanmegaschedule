// src/components/SchedulePage/UpcomingLeaveBanner.tsx
// #311 · 다가오는 연차 알림 배너 · 관리자용 (level >= 2)
//   · 오늘부터 14일 이내 · 월차/오전반차/오후반차
//   · Linear/Notion 톤 · amber 소프트 경고 · 접기/펼치기 localStorage 유지

import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { UpcomingLeaveBannerRow } from "../../hooks/useUpcomingLeaves";

const SK_LEAVE_BANNER_OPEN = "upcoming-leave-banner-open";

function readBannerOpen(): boolean {
  try {
    const v = localStorage.getItem(SK_LEAVE_BANNER_OPEN);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

// 2026-09-20 · 사용자 지시 · 배지 대신 · 깔끔한 텍스트
interface TypeTextProps {
  type: string;
}

const TYPE_COLOR: Record<string, string> = {
  월차:    "text-amber-700",
  오전반차: "text-sky-700",
  오후반차: "text-indigo-700",
};

const TypeText: React.FC<TypeTextProps> = ({ type }) => {
  const cls = TYPE_COLOR[type] ?? "text-zinc-600";
  return <span className={`text-[14px] font-semibold ${cls}`}>{type}</span>;
};

interface UpcomingLeaveBannerProps {
  rows: UpcomingLeaveBannerRow[];
}

export const UpcomingLeaveBanner: React.FC<UpcomingLeaveBannerProps> = ({ rows }) => {
  const [open, setOpen] = useState(readBannerOpen);

  if (rows.length === 0) return null;

  const uniqueCount = new Set(rows.map(r => r.employeeId)).size;

  const toggle = () => {
    setOpen(v => {
      try { localStorage.setItem(SK_LEAVE_BANNER_OPEN, String(!v)); } catch { /* silent */ }
      return !v;
    });
  };

  return (
    <div className="mx-2 sm:mx-3 md:mx-4 mt-2 rounded-xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
      {/* 헤더 행 */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer hover:bg-amber-100/60 transition-colors"
      >
        <AlertTriangle
          size={16}
          className="text-amber-500 shrink-0"
          strokeWidth={2.5}
        />
        <span className="flex-1 text-[15px] font-bold text-amber-900 leading-snug">
          다가오는 연차 &middot; {uniqueCount}명{rows.length > uniqueCount ? ` (${rows.length}건)` : ""} &middot; 대체 인력 확인 필요
        </span>
        {open ? (
          <ChevronUp size={15} className="text-amber-500 shrink-0" />
        ) : (
          <ChevronDown size={15} className="text-amber-500 shrink-0" />
        )}
      </button>

      {/* 상세 리스트 */}
      {open && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {rows.map((row, i) => (
            <div
              key={`${row.employeeId}-${row.startDate}-${i}`}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              {/* 직원명 */}
              <span className="text-[15px] font-bold text-zinc-900 min-w-[4rem]">
                {row.employeeName}
              </span>
              {/* 날짜 */}
              <span className="text-[14px] font-semibold text-zinc-600 tabular-nums">
                {row.dateLabel}
              </span>
              {/* 유형 · 텍스트 (배지 X · 사용자 지시) */}
              <TypeText type={row.type} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UpcomingLeaveBanner;
