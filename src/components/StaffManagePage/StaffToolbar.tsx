// src/components/StaffManagePage/StaffToolbar.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리 · 상단 필터바
import React from "react";
import { CARD_BASE } from "../../styles/tokens";
import { RefreshCw, Search, UserPlus, Users } from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { InlineLabel } from "../common/InlineLabel";
import type { Employee } from "./types";
import { POSITIONS } from "./types";

type FilterStatus = "active" | "pending_resignation" | "retired" | "all";

interface StaffToolbarProps {
  employees: Employee[];
  loading: boolean;
  search: string;
  filterStatus: FilterStatus;
  filterPosition: string;
  onSearchChange: (v: string) => void;
  onFilterStatusChange: (v: FilterStatus) => void;
  onFilterPositionChange: (v: string) => void;
  onRefresh: () => void;
  onCreateOpen: () => void;
  onBackToSchedule?: () => void;
}

const STATUS_TABS: { key: FilterStatus; label: string }[] = [
  { key: "active",              label: "재직" },
  { key: "pending_resignation", label: "퇴사예정" },
  { key: "retired",             label: "퇴사" },
  { key: "all",                 label: "전체" },
];

export const StaffToolbar: React.FC<StaffToolbarProps> = ({
  employees, loading,
  search, filterStatus, filterPosition,
  onSearchChange, onFilterStatusChange, onFilterPositionChange,
  onRefresh, onCreateOpen, onBackToSchedule,
}) => (
  <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
    {/* 페이지 아이콘 + 타이틀 */}
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
        <Users size={13} className="text-white" />
      </div>
      <span className="text-[15px] font-bold text-zinc-800">직원관리</span>
      <StatusPill tone="indigo" size="md">{employees.length}명</StatusPill>
    </div>

    {/* 구분선 */}
    <div className="hidden sm:block w-px h-5 bg-zinc-200 shrink-0" />

    {/* 검색 */}
    <div className="relative min-w-[160px]">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="이름 · 직군 · 연락처"
        className="pl-8 pr-3 h-8 text-[14px] border border-line rounded-lg focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint bg-zinc-50 placeholder:text-zinc-400 w-full sm:w-48"
      />
    </div>

    {/* 재직 상태 필터 */}
    <div className="flex items-center gap-2 flex-wrap">
      <InlineLabel>상태</InlineLabel>
      <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
        {STATUS_TABS.map((s) => (
          <button
            key={s.key}
            onClick={() => onFilterStatusChange(s.key)}
            className={`h-7 px-2.5 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${
              filterStatus === s.key ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>

    {/* 직군 필터 */}
    <div className="flex items-center gap-2 flex-wrap">
      <InlineLabel>직군</InlineLabel>
      <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1 flex-wrap gap-0.5">
        <button
          onClick={() => onFilterPositionChange("")}
          className={`h-7 px-2.5 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${
            filterPosition === "" ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"
          }`}
        >
          전체
        </button>
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => onFilterPositionChange(filterPosition === p ? "" : p)}
            className={`h-7 px-2.5 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${
              filterPosition === p ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>

    {/* 우측 액션 버튼 */}
    <div className="ml-auto flex items-center gap-1.5">
      {onBackToSchedule && (
        <button
          onClick={onBackToSchedule}
          className="h-8 px-3 flex items-center gap-1.5 text-[15px] font-semibold text-zinc-700 bg-white border border-line hover:bg-zinc-50 rounded-lg cursor-pointer transition-colors"
          title="스케쥴 페이지로 돌아가기"
        >
          ← 스케쥴
        </button>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        title="새로고침"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 cursor-pointer disabled:opacity-40 transition-colors"
      >
        <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
      </button>
      <button
        onClick={onCreateOpen}
        className="h-8 px-3 flex items-center gap-1.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg cursor-pointer shadow-sm transition-colors"
      >
        <UserPlus size={12} />
        신규 등록
      </button>
    </div>
  </div>
);
