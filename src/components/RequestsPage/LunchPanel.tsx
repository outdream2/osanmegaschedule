// src/components/RequestsPage/LunchPanel.tsx
// 2026-08-26 · Framework Phase 4 · large-file 분리 · 점심불참 탭
import React from "react";
import { RefreshCw, Utensils, UtensilsCrossed } from "lucide-react";
import { CARD_BASE } from "../../styles/tokens";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import type { LunchRequest } from "./types";

interface LunchPanelProps {
  lunchRequests: LunchRequest[];
  lunchLoading: boolean;
  onRefresh: () => void;
}

export const LunchPanel: React.FC<LunchPanelProps> = ({
  lunchRequests,
  lunchLoading,
  onRefresh,
}) => {
  const eatCount   = lunchRequests.filter(r => r.eating).length;
  const noEatCount = lunchRequests.filter(r => !r.eating).length;

  return (
    <div className="flex flex-col gap-3">
      {/* 요약 뱃지 */}
      <Card padding="none" className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Utensils size={14} className="text-emerald-500" />
          <span className="text-xs font-bold text-gray-700">오늘의 점심 불참 현황</span>
          <span className="text-[14px] text-gray-400">({lunchRequests.length}명 응답)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[15px] font-bold">
            <StatusPill tone="emerald" size="md">🍱 {eatCount}명</StatusPill>
            <StatusPill tone="zinc" size="md" icon={<UtensilsCrossed size={9} />}>{noEatCount}명</StatusPill>
          </div>
          <button onClick={onRefresh} className="p-1.5 text-gray-400 hover:text-gray-600 transition cursor-pointer">
            <RefreshCw size={12} className={lunchLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </Card>

      {lunchLoading && lunchRequests.length > 0 && (
        <div className="flex items-center justify-center py-1.5 mb-1 bg-zinc-100 border border-line rounded-md sticky top-0 z-10">
          <Spinner tone="zinc" size={11} label="새로 불러오는 중..." labelSize={14} />
        </div>
      )}
      {lunchLoading && lunchRequests.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Spinner tone="zinc" size={14} label="로딩 중..." labelSize={12} />
        </div>
      ) : !lunchLoading && lunchRequests.length === 0 ? (
        <div className="text-center text-[15px] text-zinc-300 py-6">데이터 없음</div>
      ) : (
        <div className={`${CARD_BASE} divide-y divide-zinc-50 ${lunchLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          {lunchRequests.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-0.5 py-1.5 hover:bg-zinc-50/60 transition-all duration-150">
              <span className={`w-2 h-2 rounded-full shrink-0 ${r.eating ? "bg-emerald-500" : "bg-gray-300"}`} />
              <span className="text-sm font-semibold text-gray-800 flex-1">{r.employee_name}</span>
              {r.memo && <span className="text-[14px] text-gray-400 flex-1 min-w-0 break-keep">{r.memo}</span>}
              <StatusPill tone={r.eating ? "emerald" : "zinc"} size="md">
                {r.eating ? "🍱 식사" : "불참"}
              </StatusPill>
              <span className="text-[14px] text-gray-300 shrink-0">
                {new Date(r.updated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
