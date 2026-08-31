// src/components/StaffManagePage/StaffListPanel.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리 · 좌측 직원 리스트 카드
// 2026-08-24 · SplitPanel 마이그레이션 · aside/divider 외부 랩 제거 (SplitPanel 이 처리)
import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, User, UserPlus } from "lucide-react";
import { RESIZER_CLS } from "../../hooks/useColumnResize";
import { Spinner } from "../common/Spinner";
import { StaffListRow } from "./StaffListRow";
import type { Employee } from "./types";
// 2026-08-23 · #198 Phase 3B · SplitListPanel v2 · countDisplay + footer 활용
//   · UI 목업 대원칙 준수 · Linear/Vercel 톤 · 딥네이비 통일
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
  // 컬럼 리사이즈
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
  // 2026-08-31 · 사용자 지시 · 사직서 컬럼 · 재직 필터 시 숨김
  filterStatus?: "active" | "pending_resignation" | "retired" | "all";
  // 2026-08-31 · 대원칙 · SplitListPanel search prop 필수 (부모에서 관리 · 필터링은 upstream)
  search?: string;
  onSearchChange?: (v: string) => void;
}

const SortIcon: React.FC<{ k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc" }> = ({ k, sortKey, sortDir }) =>
  sortKey === k
    ? (sortDir === "asc"
        ? <ArrowUp size={10} className="text-indigo-500 inline ml-0.5" />
        : <ArrowDown size={10} className="text-indigo-500 inline ml-0.5" />)
    : <ArrowUpDown size={10} className="text-zinc-300 inline ml-0.5" />;

export const StaffListPanel: React.FC<StaffListPanelProps> = ({
  employees, filtered, loading, error,
  selectedId, contractCountByEmp,
  sortKey, sortDir, toggleSort,
  getWidth: sw, resizerProps: sr,
  handleSelect, showError, onCreateOpen, onRefresh,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract, filterStatus = "all",
  search = "", onSearchChange,
}) => {
  const sortIcon = (k: SortKey) => <SortIcon k={k} sortKey={sortKey} sortDir={sortDir} />;
  // 2026-08-31 · 사용자 지시 · 사직서 컬럼 · 퇴사예정·퇴사 필터일 때만 표시
  const showResignationCol = filterStatus === "pending_resignation" || filterStatus === "retired" || filterStatus === "all";

  // 2026-08-23 · #198 Phase 3B · SplitListPanel v2 이관
  //   · 좌측 aside(split-left)+width style · SplitListPanel wrapper 로 대체
  //   · 헤더 · title(직원 목록) + countDisplay(filtered/employees) · 통일
  //   · footer · 신규 등록 버튼 (indigo dashed · 기존 스타일 완전 유지)
  //   · loading/error/empty · 기존 커스텀 유지 (SplitListPanel prop 은 미사용 · UI 100% 유지)
  const body = (
    <>
      {loading && filtered.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Spinner tone="zinc" size={13} label="로딩 중..." labelSize={15} />
        </div>
      ) : error ? (
        <div className="m-2.5 p-2.5 text-[15px] text-red-600 font-semibold bg-red-50 rounded-lg border border-red-200">
          {error}
          <button onClick={onRefresh} className="ml-1.5 underline cursor-pointer">재시도</button>
        </div>
      ) : !loading && filtered.length === 0 ? (
        <div className="text-center text-[15px] text-zinc-300 py-8">해당 조건의 직원이 없습니다</div>
      ) : (
        <table
          className={`w-full border-collapse ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}
          style={{ tableLayout: "fixed" }}
        >
          {/* 2026-08-24 · v3 확산 · thead · bg zinc-100/70 · text 13/14px · Attio 톤 */}
          <thead className="sticky top-0 z-10 bg-zinc-100/70 backdrop-blur">
            <tr className="border-b border-line text-[15px] sm:text-[16px] font-bold text-zinc-500 uppercase tracking-wider">
              {/* 2026-08-24 · 사용자 지시 · 근속·평가 컬럼 제거 · 상세정보 KPI 바 에서만 표시 */}
              {(
                [
                  { key: "name",               label: "이름",    col: "name"         },
                  { key: "position",            label: "직군",    col: "position"     },
                  { key: "contract_type",       label: "계약유형", col: "contract_type"},
                  { key: "resume_file",         label: "이력서",  col: "resume"       },
                  { key: "bankbook_file",       label: "통장",    col: "bankbook"     },
                  { key: "contract_file",       label: "계약서",  col: "contract"     },
                  // 2026-08-31 · 사직서 · 재직 필터 시 숨김 (퇴사예정·퇴사·전체 만 표시)
                  ...(showResignationCol ? [{ key: "resignation_file" as SortKey, label: "사직서", col: "resignation" }] : []),
                  // 2026-08-31 · 사용자 지시 · 상태 컬럼 제거 (필터 자체로 대체 · 무의미)
                ] as { key: SortKey; label: string; col: string }[]
              ).map(({ key, label, col }) => (
                <th
                  key={key}
                  className={`relative px-${col === "name" ? "2" : "1"} py-1.5 text-${col === "name" ? "left" : "center"} cursor-pointer hover:text-indigo-600 select-none`}
                  onClick={() => toggleSort(key)}
                  style={{ width: sw(col), minWidth: sw(col) }}
                >
                  {label}{sortIcon(key)}
                  <span
                    {...sr(col)}
                    className={RESIZER_CLS}
                    style={{ touchAction: "none" }}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  />
                </th>
              ))}
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
      )}
    </>
  );

  // 2026-08-24 · SplitPanel 프리미티브 사용 · aside/divider 는 SplitPanel 이 자동 처리
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
          <span className="text-[14px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-px tabular-nums">
            {filtered.length}/{employees.length}
          </span>
        ) : undefined
      }
      footer={
        <div className="px-3 py-2">
          <button
            onClick={onCreateOpen}
            className="w-full h-7 text-[15px] font-semibold text-indigo-600 border border-dashed border-indigo-200 rounded-lg hover:bg-indigo-50 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
          >
            <UserPlus size={11} /> 신규 직원 등록
          </button>
        </div>
      }
    >
      {body}
    </SplitListPanel>
  );
};
