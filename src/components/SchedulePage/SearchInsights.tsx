// src/components/SchedulePage/SearchInsights.tsx
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 성명 검색 결과 인사이트 패널
import React from "react";
import { Award } from "lucide-react";
import { Employee } from "../../types";

interface SearchInsightsProps {
  employees: Employee[];
  searchQuery: string;
  currentYear: number;
  currentMonth: number;
  onClearSearch: () => void;
}

export const SearchInsights: React.FC<SearchInsightsProps> = ({
  employees, searchQuery, currentYear, currentMonth, onClearSearch,
}) => {
  const matched = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="bg-blue-50/50 border-b border-[#e2e8f0] px-3 sm:px-6 py-3 sm:py-4 flex flex-col gap-2 sm:gap-3 animate-in fade-in slide-in-from-top-2 duration-250 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.01)]">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold text-[#1e40af] uppercase tracking-wider flex items-center gap-1.5">
          <Award size={14} className="text-blue-600 font-bold" />
          <span>'{searchQuery}' 성명 검색 결과 및 {currentMonth}월 스케줄 분석 요약</span>
        </h3>
        <button onClick={onClearSearch} className="text-xs text-blue-600 hover:text-[#1e40af] font-bold underline cursor-pointer">
          전체 보기로 돌아가기
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {matched.map(emp => {
          const monthStr = String(currentMonth).padStart(2, "0");
          let workDaysCount = 0, offDaysCount = 0;
          const shiftBreakdown: Record<string, number> = { "오픈": 0, "미들": 0, "마감": 0, "오전반차": 0, "오후반차": 0 };

          emp.schedules.forEach(s => {
            if (s.date.startsWith(`${currentYear}-${monthStr}-`)) {
              if (["휴무", "월차", "결근"].includes(s.type)) offDaysCount++;
              else if (s.type.trim() !== "") {
                workDaysCount++;
                if (s.type in shiftBreakdown) shiftBreakdown[s.type]++;
              }
            }
          });

          return (
            <div key={`search-result-${emp.id}`} className="bg-white border border-blue-100 rounded-xl p-3 shadow-sm flex flex-col justify-between hover:border-blue-300 transition">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-zinc-800 text-sm">{emp.name}</span>
                  <span className="text-[10px] font-semibold bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">{emp.position}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${(emp.workplace || "매장") === "매장" ? "bg-emerald-50 text-emerald-800 border border-emerald-100" : "bg-indigo-50 text-indigo-800 border border-indigo-100"}`}>
                    {emp.workplace || "매장"}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">입사일: {emp.hireDate ? emp.hireDate.split("-").slice(1).join("/") : "-"}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
                  <span>{currentMonth}월 스케줄 개요:</span>
                  <span className="text-zinc-900 font-bold">
                    근무 <span className="text-blue-600">{workDaysCount}일</span> / 휴무 <span className="text-rose-600">{offDaysCount}일</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {shiftBreakdown["오픈"] > 0 && <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-lg font-extrabold">오픈: {shiftBreakdown["오픈"]}회</span>}
                  {shiftBreakdown["미들"] > 0 && <span className="text-[10px] bg-sky-50 text-sky-800 border border-sky-100 px-2 py-0.5 rounded-lg font-extrabold">미들: {shiftBreakdown["미들"]}회</span>}
                  {shiftBreakdown["마감"] > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-lg font-extrabold">마감: {shiftBreakdown["마감"]}회</span>}
                  {shiftBreakdown["오전반차"] > 0 && <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-lg font-extrabold">오전반차: {shiftBreakdown["오전반차"]}회</span>}
                  {shiftBreakdown["오후반차"] > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-lg font-extrabold">오후반차: {shiftBreakdown["오후반차"]}회</span>}
                </div>
              </div>
            </div>
          );
        })}
        {matched.length === 0 && (
          <div className="col-span-full py-4 text-center text-xs font-semibold text-zinc-500">
            입력하신 이름 '{searchQuery}'에 부합하는 사원이 없습니다. 철자를 확인해 주세요.
          </div>
        )}
      </div>
    </div>
  );
};
