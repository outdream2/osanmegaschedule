// src/components/BusinessManagePage/common/StaffListTable.tsx
// 2026-10-12 · 공용 직원 리스트 테이블 · BusinessManagePage.Dashboard + StaffDashboard 공유
//   · sticky thead · overflow-auto · whitespace-nowrap · 선택 row violet-50 highlight
//   · showColumns prop 으로 각 호출처가 필요 열만 선택
//   · POSITION_TONE / contract label helper 내장 (두 호출처 중복 제거)

import React from "react";
import type { Employee } from "../../../types";

// ─── HR 확장 필드 ──────────────────────────────────────────────
export type EmployeeExt = Employee & {
  contract_type?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  birth_date?: string | null;
  resume_url?: string | null;
  // 2026-10-12 · 사용자 지시 "퇴직탭 선택되면 사직서 · 퇴사일"
  resignation_file_url?: string | null;
  // 2026-10-12 · 사용자 지시 "퇴직금 지급대상 확인 컬럼"
  working_hours_per_week?: number | null;
};

// ─── 퇴직금 지급 대상 판정 (근기법 §34) ────────────────────────
//   · 1년 이상 근속 · 주 15시간 이상 (working_hours_per_week null 이면 통과)
export function isSeveranceEligible(hireYmd: string | null | undefined, retireYmd: string | null | undefined, hoursPerWeek: number | null | undefined): boolean {
  if (!hireYmd) return false;
  const hire = new Date(String(hireYmd));
  if (isNaN(hire.getTime())) return false;
  const end = retireYmd ? new Date(String(retireYmd)) : new Date();
  const years = (end.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return false;
  const h = Number(hoursPerWeek);
  if (Number.isFinite(h) && h > 0 && h < 15) return false;
  return true;
}

// ─── POSITION_TONE (공통 · 중복 제거) ─────────────────────────
export const POSITION_TONE: Record<string, string> = {
  "약사":  "bg-sky-50 text-sky-700 border-sky-200",
  "매장":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "창고":  "bg-amber-50 text-amber-700 border-amber-200",
  "캐셔":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "진열":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "물류":  "bg-amber-50 text-amber-700 border-amber-200",
  "알바":  "bg-slate-50 text-slate-700 border-slate-200",
  "기타":  "bg-slate-50 text-slate-700 border-slate-200",
};

// ─── contract label / class helper ────────────────────────────
export function contractTypeInfo(raw: string | null | undefined): { label: string; cls: string } {
  const t = String(raw ?? "").trim();
  // DB enum values (from CONTRACT_TYPES in StaffManagePage/types.ts)
  if (t === "regular"    || t.includes("정규") || t.includes("정직원"))
    return { label: "정규", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (t === "fixed_term" || t.includes("계약") || t.includes("수습"))
    return { label: "계약", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (t === "part_time"  || t.includes("알바"))
    return { label: "알바", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  if (t === "daily"      || t.includes("일용"))
    return { label: "일용", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  if (t === "intern"     || t.includes("인턴"))
    return { label: "인턴", cls: "bg-violet-50 text-violet-700 border-violet-200" };
  return { label: "미지정", cls: "bg-slate-50 text-slate-400 border-slate-200" };
}

// ─── tenure helper ─────────────────────────────────────────────
function monthsBetween(fromYmd: string, toYmd: string): number {
  if (!fromYmd) return 0;
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  if (!fy || !ty) return 0;
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Column keys ───────────────────────────────────────────────
export type ColumnKey =
  | "name"
  | "position"
  | "contract_type"
  | "contract_start"
  | "hire_date"
  | "tenure"
  | "birth"
  | "resume"
  | "contract_doc"
  // 2026-10-12 · 사용자 지시 "퇴직탭에 사직서 · 퇴사일"
  | "retire_date"
  | "resignation"
  // 2026-10-12 · 사용자 지시 "퇴직금 지급대상 확인"
  | "severance";

const COLUMN_META: Record<ColumnKey, { label: string; width: string; align: "left" | "center" }> = {
  name:          { label: "이름",      width: "w-[110px]",  align: "left"   },
  position:      { label: "직군",      width: "w-[80px]",   align: "left"   },
  contract_type: { label: "계약유형",  width: "w-[80px]",   align: "left"   },
  contract_start:{ label: "계약시작일",width: "w-[108px]",  align: "left"   },
  hire_date:     { label: "입사일",    width: "w-[108px]",  align: "left"   },
  tenure:        { label: "근속",      width: "w-[72px]",   align: "left"   },
  birth:         { label: "생년월일",  width: "w-[108px]",  align: "left"   },
  resume:        { label: "이력서",    width: "w-[72px]",   align: "center" },
  contract_doc:  { label: "근로계약서",width: "w-[88px]",   align: "center" },
  retire_date:   { label: "퇴사일",    width: "w-[108px]",  align: "left"   },
  resignation:   { label: "사직서",    width: "w-[72px]",   align: "center" },
  severance:     { label: "퇴직금",    width: "w-[88px]",   align: "center" },
};

const DEFAULT_COLUMNS: ColumnKey[] = [
  "name", "position", "contract_type", "contract_start", "hire_date",
  "tenure", "birth", "resume", "contract_doc", "retire_date", "resignation", "severance",
];

// ─── Props ─────────────────────────────────────────────────────
export interface StaffListTableProps {
  employees: EmployeeExt[];
  onRowClick: (id: number) => void;
  selectedId?: number | null;
  maxHeight?: string;
  showColumns?: ColumnKey[];
}

// ─── Component ─────────────────────────────────────────────────
export const StaffListTable: React.FC<StaffListTableProps> = ({
  employees,
  onRowClick,
  selectedId,
  maxHeight = "max-h-[480px]",
  showColumns = DEFAULT_COLUMNS,
}) => {
  const today = todayYmd();
  const cols = showColumns.filter(c => DEFAULT_COLUMNS.includes(c));
  const colCount = cols.length;

  return (
    <div className={`overflow-auto ${maxHeight}`}>
      <table className="w-full min-w-[760px] text-[14px]">
        <thead className="sticky top-0 z-[1] bg-slate-50">
          <tr className="border-b border-slate-200 bg-slate-50/95 backdrop-blur">
            {cols.map(col => {
              const m = COLUMN_META[col];
              return (
                <th
                  key={col}
                  className={`px-3 py-2 text-[13px] font-semibold text-slate-500 whitespace-nowrap ${m.width} ${m.align === "center" ? "text-center" : "text-left"} first:pl-2`}
                >
                  {m.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-10 text-center text-[13px] text-slate-400">
                직원 없음
              </td>
            </tr>
          ) : employees.map(e => {
            const isSelected = selectedId === e.id;
            const { label: typeLabel, cls: typeCls } = contractTypeInfo(e.contract_type);
            const posTone = POSITION_TONE[e.position || "기타"] ?? "bg-slate-50 text-slate-700 border-slate-200";
            const hasResume = !!(e.resume_url && String(e.resume_url).trim());
            const hasContract = !!(e.contract_type || e.contract_start);
            const hasResignation = !!(e.resignation_file_url && String(e.resignation_file_url).trim());
            const tenureMonths = monthsBetween(e.hireDate ?? "", today);
            const tenureYears = Math.floor(tenureMonths / 12);
            // 2026-10-12 · 퇴직금 지급대상 · 1년+ 근속 + 주 15시간+ (근기법 §34)
            const severanceOk = isSeveranceEligible(e.hireDate, e.retireDate, e.working_hours_per_week);

            return (
              <tr
                key={e.id}
                onClick={() => onRowClick(e.id)}
                className={`border-b border-slate-100 cursor-pointer transition-colors ${
                  isSelected ? "bg-violet-50/50" : "hover:bg-slate-50/60"
                }`}
                title="클릭 · 직원 상세 slide drawer"
              >
                {cols.map(col => {
                  switch (col) {
                    case "name":
                      return (
                        <td key={col} className="pl-2 pr-3 py-2 text-[14px] font-medium text-ink whitespace-nowrap">
                          {e.name}
                        </td>
                      );
                    case "position":
                      return (
                        <td key={col} className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${posTone}`}>
                            {e.position || "기타"}
                          </span>
                        </td>
                      );
                    case "contract_type":
                      return (
                        <td key={col} className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${typeCls}`}>
                            {typeLabel}
                          </span>
                        </td>
                      );
                    case "contract_start":
                      return (
                        <td key={col} className="px-3 py-2 text-[13px] tabular-nums text-slate-500 whitespace-nowrap">
                          {e.contract_start ? e.contract_start.slice(0, 10) : "—"}
                        </td>
                      );
                    case "hire_date":
                      return (
                        <td key={col} className="px-3 py-2 text-[13px] tabular-nums text-slate-500 whitespace-nowrap">
                          {e.hireDate ? e.hireDate.slice(0, 10) : "—"}
                        </td>
                      );
                    case "tenure":
                      return (
                        <td key={col} className="px-3 py-2 text-[13px] tabular-nums text-slate-500 whitespace-nowrap">
                          {tenureYears}년
                        </td>
                      );
                    case "birth":
                      return (
                        <td key={col} className="px-3 py-2 text-[13px] tabular-nums text-slate-500 whitespace-nowrap">
                          {e.birth_date ? e.birth_date.slice(0, 10) : "—"}
                        </td>
                      );
                    case "resume":
                      return (
                        <td key={col} className="px-3 py-2 text-center">
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                              hasResume
                                ? "bg-sky-50 text-sky-700 border-sky-200"
                                : "bg-slate-50 text-slate-400 border-slate-200"
                            }`}
                            title={hasResume ? "이력서 있음" : "이력서 없음"}
                          >
                            {hasResume ? "✓" : "✗"}
                          </span>
                        </td>
                      );
                    case "contract_doc":
                      return (
                        <td key={col} className="px-3 py-2 text-center">
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                              hasContract
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-slate-50 text-slate-400 border-slate-200"
                            }`}
                            title={hasContract ? "근로계약서 작성됨" : "근로계약서 미작성"}
                          >
                            {hasContract ? "✓" : "✗"}
                          </span>
                        </td>
                      );
                    case "retire_date":
                      return (
                        <td key={col} className="px-3 py-2 text-[13px] tabular-nums text-slate-500 whitespace-nowrap">
                          {e.retireDate ? String(e.retireDate).slice(0, 10) : "—"}
                        </td>
                      );
                    case "resignation":
                      return (
                        <td key={col} className="px-3 py-2 text-center">
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                              hasResignation
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-slate-50 text-slate-400 border-slate-200"
                            }`}
                            title={hasResignation ? "사직서 작성됨" : "사직서 미작성"}
                          >
                            {hasResignation ? "✓" : "✗"}
                          </span>
                        </td>
                      );
                    case "severance":
                      return (
                        <td key={col} className="px-3 py-2 text-center">
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded border ${
                              severanceOk
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-50 text-slate-400 border-slate-200"
                            }`}
                            title={severanceOk ? "퇴직금 지급 대상 (1년+ 근속 · 주 15시간+)" : "퇴직금 미대상"}
                          >
                            {severanceOk ? "대상" : "미대상"}
                          </span>
                        </td>
                      );
                    default:
                      return null;
                  }
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default StaffListTable;
