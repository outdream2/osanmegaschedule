// 2026-08-22 · Framework Phase 4 · DayTimelineModal 헤더바 · 탭 · 배너 이관
// Header (딥네이비) + Position tabs + 임의배치 배너

import React from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { StatusPill } from "../common/StatusPill";

type TabKey = "전체" | "약사" | "사원" | "기타";

interface HeaderBarProps {
  title: string;
  workersCount: number;
  staffCount: number;
  pharmCount: number;
  otherCount: number;
  onClose: () => void;
  onDateChange?: (d: string) => void;
  offsetDate: (delta: number) => string;
  tabs: { key: TabKey; count: number }[];
  activeTab: TabKey;
  setActiveTab: (k: TabKey) => void;
  isConfirmed: boolean;
  handleConfirm: () => void;
  confirming: boolean;
  isAutoSuggested: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  title, workersCount, staffCount, pharmCount, otherCount,
  onClose, onDateChange, offsetDate,
  tabs, activeTab, setActiveTab,
  isConfirmed, handleConfirm, confirming, isAutoSuggested,
}) => {
  return (
    <>
      {/* Header · 2026-08-17 · 최신 트렌드 · 딥네이비 · 사이드바 통일 · 폰트 +2 */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-brand-deep text-white flex-shrink-0 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onDateChange && (
            <button onClick={() => onDateChange(offsetDate(-1))}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white cursor-pointer shrink-0">
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="text-[19px] font-extrabold tracking-tight shrink-0 break-keep">{title}</span>
          {onDateChange && (
            <button onClick={() => onDateChange(offsetDate(1))}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white cursor-pointer shrink-0">
              <ChevronRight size={16} />
            </button>
          )}
          <span className="bg-white/[0.12] text-white text-[15px] px-2.5 py-1 rounded-full font-semibold shrink-0 hidden sm:inline tabular-nums">
            근무 {workersCount}명 · 사원 {staffCount} · 약사 {pharmCount}
            {otherCount > 0 ? ` · 기타 ${otherCount}` : ""}
          </span>
          <span className="bg-white/[0.12] text-white text-[15px] px-2.5 py-1 rounded-full font-semibold shrink-0 sm:hidden tabular-nums">
            {workersCount}명
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* Position filter tabs · 2026-08-17 · 최신 트렌드 · segmented pill · 파스텔 지양 · 폰트 +2 */}
      <div className="flex items-center gap-1.5 px-4 sm:px-5 pt-3 pb-2 bg-white border-b border-line flex-shrink-0 min-w-0 overflow-x-auto scrollbar-none">
        {tabs.map(({ key, count }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-[15px] font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === key
                ? "bg-brand-deep text-white shadow-sm"
                : "text-ink-soft hover:bg-zinc-100 hover:text-ink"
            }`}>
            {key}
            <span className={`text-[13px] px-1.5 py-0.5 rounded-full tabular-nums ${activeTab === key ? "bg-white/20 text-white" : "bg-zinc-200 text-ink-soft"}`}>{count}</span>
          </button>
        ))}
        {/* 확정 버튼 · 딥네이비 accent · 최신 트렌드 */}
        <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
          {isConfirmed ? (
            <StatusPill tone="emerald" size="md" dot>
              <CheckCircle size={14} className="inline mr-1" />
              확정됨
            </StatusPill>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-1.5 text-[15px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] text-white cursor-pointer disabled:opacity-40 transition-colors shadow-sm">
              <CheckCircle size={14} />
              {confirming ? "저장중…" : "확정"}
            </button>
          )}
        </div>
      </div>

      {/* 임의배치 배너 · 2026-08-17 · 최신 트렌드 · flat · 이모지 지양 */}
      {isAutoSuggested && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <span className="text-[15px] font-semibold text-amber-800 tracking-tight">
            임의배치 · 확정하기 전에 배치를 조정하세요
          </span>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="text-[14px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-deep text-white hover:bg-[#0d3a5c] cursor-pointer disabled:opacity-40 transition-colors ml-3 shrink-0 shadow-sm">
            {confirming ? "저장중…" : "지금 확정"}
          </button>
        </div>
      )}
    </>
  );
};
