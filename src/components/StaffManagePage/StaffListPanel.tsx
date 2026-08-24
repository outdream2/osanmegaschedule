// src/components/StaffManagePage/StaffListPanel.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리 · 좌측 직원 리스트 카드
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
  isDesktop: boolean;
  listWidth: number;
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
  // 리사이즈 드래그
  startResize: (e: React.MouseEvent) => void;
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
  isDesktop, listWidth,
  sortKey, sortDir, toggleSort,
  getWidth: sw, resizerProps: sr,
  handleSelect, showError, onCreateOpen, onRefresh,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract,
  startResize,
}) => {
  const sortIcon = (k: SortKey) => <SortIcon k={k} sortKey={sortKey} sortDir={sortDir} />;

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
          <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur">
            <tr className="border-b border-line text-[15px] font-bold text-zinc-500 uppercase tracking-wider">
              {(
                [
                  { key: "name",               label: "이름",    col: "name"         },
                  { key: "position",            label: "직책",    col: "position"     },
                  { key: "contract_type",       label: "계약유형", col: "contract_type"},
                  { key: "tenure",              label: "근속",    col: "tenure"       },
                  { key: "performance_rating",  label: "평가",    col: "rating"       },
                  { key: "resume_file",         label: "이력서",  col: "resume"       },
                  { key: "bankbook_file",       label: "통장",    col: "bankbook"     },
                  { key: "contract_file",       label: "계약서",  col: "contract"     },
                  { key: "resignation_file",    label: "사직서",  col: "resignation"  },
                  { key: "status",              label: "상태",    col: "status"       },
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

  return (
    <>
      <aside
        className="split-left"
        style={isDesktop ? { width: `${listWidth}px` } : undefined}
      >
        <SplitListPanel
          topAccent
          title={
            <span className="inline-flex items-center gap-1.5">
              <User size={13} className="text-indigo-400 shrink-0" />
              <span>직원 목록</span>
            </span>
          }
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
      </aside>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="split-divider group"
        title="드래그하여 좌측 리스트 폭 조절"
      >
        <span className="text-[14px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
      </div>
    </>
  );
};
