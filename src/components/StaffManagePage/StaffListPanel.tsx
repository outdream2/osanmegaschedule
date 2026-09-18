// src/components/StaffManagePage/StaffListPanel.tsx
// 2026-09-18 · 직원 리스트 패널 전수 재설계 · 사용자 지시
//   · 테이블 구조 → flex 카드 리스트 · 겹침 완전 제거
//   · Linear/Notion/Vercel 2026 톤 · 최신 트렌드 반영
//   · 컬럼 리사이저 props 유지 (부모 전달) · 렌더 비사용 (회귀 방지)

import React from "react";
import { User, UserPlus } from "lucide-react";
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
  // 정렬 (SortKey · useSortableTable · 유지 · 향후 활용)
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  toggleSort: (k: SortKey) => void;
  // 컬럼 리사이즈 (props 유지 · 렌더 비사용 · 회귀 방지)
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
  // 2026-08-31 · 사직서 컬럼 · 재직 필터 시 숨김
  filterStatus?: "active" | "pending_resignation" | "retired" | "all";
  // 2026-08-31 · 대원칙 · SplitListPanel search prop 필수
  search?: string;
  onSearchChange?: (v: string) => void;
}

export const StaffListPanel: React.FC<StaffListPanelProps> = ({
  employees, filtered, loading, error,
  selectedId, contractCountByEmp,
  // sortKey/sortDir/toggleSort: 유지 · 현재 렌더 비사용 (카드 리스트로 전환 · 향후 정렬 버튼 추가 가능)
  handleSelect, showError, onCreateOpen, onRefresh,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract,
  search = "", onSearchChange,
}) => {
  // 서류 컬럼 헤더 설명 (접근성용 · 렌더는 아이콘 도트)
  const body = (
    <>
      {loading && filtered.length === 0 ? (
        <div className="flex items-center justify-center py-10">
          <Spinner tone="zinc" size={13} label="로딩 중..." labelSize={15} />
        </div>
      ) : error ? (
        <div className="mx-3 my-2.5 p-2.5 text-[15px] text-red-600 font-semibold bg-red-50 rounded-lg border border-red-200">
          {error}
          <button onClick={onRefresh} className="ml-1.5 underline cursor-pointer">재시도</button>
        </div>
      ) : !loading && filtered.length === 0 ? (
        <div className="text-center text-[15px] text-zinc-300 py-10">해당 조건의 직원이 없습니다</div>
      ) : (
        <div className={`${loading ? "opacity-40 pointer-events-none" : ""} transition-opacity`}>
          {/* 컬럼 힌트 헤더 */}
          <div className="flex items-center gap-2 pl-[12px] pr-2.5 py-1.5 border-b border-zinc-100 bg-zinc-50/90">
            {/* 이름/직군 */}
            <div className="flex-1 min-w-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              직원
            </div>
            {/* 재직/계약 */}
            <div className="shrink-0 w-[52px] text-right text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              계약
            </div>
            {/* 서류 */}
            <div className="shrink-0 text-[11px] font-bold text-zinc-400 uppercase tracking-wider pr-0.5">
              서류
            </div>
          </div>
          {/* 직원 행 목록 */}
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
