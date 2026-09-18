// src/components/StaffManagePage/StaffListPanel.tsx
// 2026-09-18 · 직원 리스트 패널 완전 재설계 v3
//   · 테이블 구조 · sticky 정렬 헤더 · ProductInfoPage 패턴 통일
//   · 동그란 요소 완전 제거 · 말줄임표 금지
//   · Linear/Attio/Vercel 2026 톤 · border-l-[3px] accent

import React from "react";
import { User, UserPlus } from "lucide-react";
import { SortHeader } from "../common/SortHeader";
import { Spinner } from "../common/Spinner";
import { StaffListRow } from "./StaffListRow";
import type { Employee } from "./types";
import { SplitListPanel } from "../common/SplitListPanel";

type SortKey = "name" | "position" | "contract_type" | "tenure" | "performance_rating"
  | "resume_file" | "bankbook_file" | "contract_file" | "resignation_file" | "status";

interface StaffListPanelProps {
  // 데이터
  employees: Employee[];
  filtered: Employee[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  contractCountByEmp: Map<number, number>;
  // 정렬
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (k: SortKey) => void;
  // 컬럼 리사이즈 (props 유지 · 현재 렌더 비사용 · 회귀 방지)
  getWidth: (col: string) => number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resizerProps: (col: any) => React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>;
  // 핸들러
  handleSelect: (emp: Employee) => void;
  showError: (msg: string) => void;
  onCreateOpen: () => void;
  onRefresh: () => void;
  uploadResumeForRow: (emp: Employee, f: File) => void;
  uploadBankbookForRow: (emp: Employee, f: File) => void;
  uploadResignationFileForRow: (emp: Employee, f: File) => void;
  onWriteContract?: (emp: Employee) => void;
  filterStatus?: "active" | "pending_resignation" | "retired" | "all";
  // 대원칙 · SplitListPanel search prop 필수
  search?: string;
  onSearchChange?: (v: string) => void;
}

// 정렬 헤더 th 래퍼 컴포넌트 (th 구조 유지 · 내부 버튼은 공용 SortHeader)
const SortTh: React.FC<{
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: "asc" | "desc";
  onToggle: (k: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}> = ({ label, sortKey, activeKey, dir, onToggle, className = "", align = "left" }) => (
  <th
    className={`py-2 text-[12px] font-bold tracking-wide uppercase select-none ${align === "right" ? "text-right pr-2" : "text-left"} ${className}`}
  >
    <SortHeader
      label={label}
      columnKey={sortKey}
      activeKey={activeKey}
      activeDir={dir}
      onToggle={onToggle}
      arrowStyle="arrow"
      activeColor="brand"
      align={align}
    />
  </th>
);

export const StaffListPanel: React.FC<StaffListPanelProps> = ({
  employees, filtered, loading, error,
  selectedId, contractCountByEmp,
  sortKey, sortDir, toggleSort,
  handleSelect, showError, onCreateOpen, onRefresh,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract,
  search = "", onSearchChange,
}) => {

  const body = (
    <>
      {loading && filtered.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Spinner tone="zinc" size={13} label="로딩 중..." labelSize={15} />
        </div>
      ) : error ? (
        <div className="mx-3 my-2.5 p-3 text-[15px] text-red-600 font-semibold bg-red-50 rounded-lg border border-red-200">
          {error}
          <button onClick={onRefresh} className="ml-1.5 underline cursor-pointer text-red-700">재시도</button>
        </div>
      ) : !loading && filtered.length === 0 ? (
        <div className="text-center text-[15px] text-zinc-400 py-12">해당 조건의 직원이 없습니다</div>
      ) : (
        <div className={`${loading ? "opacity-40 pointer-events-none" : ""} transition-opacity`}>
          <table className="w-full text-[15px] border-collapse">
            {/* sticky 정렬 헤더 */}
            <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur-sm border-b-2 border-zinc-200">
              <tr>
                {/* border-l 공간 확보 */}
                <th className="pl-3 pr-0 py-2 w-0" aria-hidden />
                <SortTh
                  label="직원"
                  sortKey="name"
                  activeKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  className="pl-0"
                />
                <SortTh
                  label="상태"
                  sortKey="status"
                  activeKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  className="w-[72px]"
                />
                <SortTh
                  label="근속"
                  sortKey="tenure"
                  activeKey={sortKey}
                  dir={sortDir}
                  onToggle={toggleSort}
                  className="w-[58px]"
                  align="right"
                />
                <th className="py-2 pl-1.5 pr-2.5 w-[76px] text-[12px] font-bold text-zinc-400 uppercase tracking-wide text-right">
                  서류
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((emp) => (
                <StaffListRow
                  key={emp.id}
                  emp={emp}
                  selectedId={selectedId}
                  contractCountByEmp={contractCountByEmp}
                  handleSelect={handleSelect}
                  showError={showError}
                  uploadResumeForRow={uploadResumeForRow}
                  uploadBankbookForRow={uploadBankbookForRow}
                  uploadResignationFileForRow={uploadResignationFileForRow}
                  onWriteContract={onWriteContract}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  return (
    <SplitListPanel
      topAccent
      title={
        <span className="inline-flex items-center gap-1.5">
          <User size={13} className="text-indigo-400 shrink-0" />
          <span>직원 목록</span>
        </span>
      }
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="이름 · 직군 · 계약유형 검색"
      countDisplay={
        filtered.length !== employees.length ? (
          <span className="text-[13px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-px tabular-nums">
            {filtered.length}/{employees.length}
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-zinc-400 tabular-nums">
            {employees.length}명
          </span>
        )
      }
      footer={
        <div className="px-3 py-2">
          <button
            onClick={onCreateOpen}
            className="w-full h-8 text-[14px] font-semibold text-indigo-600 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          >
            <UserPlus size={12} /> 신규 직원 등록
          </button>
        </div>
      }
    >
      {body}
    </SplitListPanel>
  );
};
