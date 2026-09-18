// 2026-09-18 · 직원 리스트 행 · 완전 재설계 v3
//   · 테이블 tr 형식 · ProductInfoPage 스타일 통일
//   · 동그란 요소 완전 제거 (rounded-full X)
//   · 말줄임표 금지 · whitespace-normal break-keep
//   · Linear/Attio/Vercel 2026 텍스트 우선 밀도형

import React from "react";
import { ExternalLink, FileText, Paperclip, PenSquare as NotePencilIcon } from "lucide-react";
import type { Employee } from "./types";
import { contractTypeMeta } from "./helpers";
import { getEmploymentStatus, EMPLOYMENT_STATUS_LABEL } from "../../lib/employmentStatus";
import { setContractPrefill } from "../../lib/contractPrefill";

interface StaffListRowProps {
  emp: Employee;
  selectedId: number | null;
  contractCountByEmp: Map<number, number>;
  handleSelect: (emp: Employee) => void;
  showError: (msg: string) => void;
  uploadResumeForRow: (emp: Employee, f: File) => void;
  uploadBankbookForRow: (emp: Employee, f: File) => void;
  uploadResignationFileForRow: (emp: Employee, f: File) => void;
  onWriteContract?: (emp: Employee) => void;
}

// 사각형 서류 아이콘 버튼 · rounded-md · 원형 절대 금지
const DocBtn: React.FC<{
  hasFile: boolean;
  colorOn: string;
  colorOff: string;
  onClick?: (e: React.MouseEvent) => void;
  uploadHandler?: React.ChangeEventHandler<HTMLInputElement>;
  accept?: string;
  title: string;
  icon: React.ReactNode;
}> = ({ hasFile, colorOn, colorOff, onClick, uploadHandler, accept, title, icon }) => {
  const base = "w-[26px] h-[26px] flex items-center justify-center rounded-md transition-colors shrink-0";
  if (hasFile) {
    return (
      <button type="button" onClick={onClick} title={title}
        className={`${base} cursor-pointer ${colorOn}`}>
        {icon}
      </button>
    );
  }
  if (uploadHandler) {
    return (
      <label onClick={(e) => e.stopPropagation()} title={title}
        className={`${base} cursor-pointer ${colorOff}`}>
        {icon}
        <input type="file" accept={accept} className="hidden" onChange={uploadHandler} />
      </label>
    );
  }
  return (
    <div title={title} className={`${base} ${colorOff} cursor-default`}>
      {icon}
    </div>
  );
};

// 입사일 → 근속 포맷 (x년 x개월)
function tenureLabel(hireDateStr: string | null | undefined): string {
  if (!hireDateStr) return "";
  try {
    const hire = new Date(String(hireDateStr).slice(0, 10) + "T00:00:00");
    const now = new Date();
    let years = now.getFullYear() - hire.getFullYear();
    let months = now.getMonth() - hire.getMonth();
    if (months < 0) { years--; months += 12; }
    if (years < 0) return "";
    if (years === 0) return `${months}개월`;
    if (months === 0) return `${years}년`;
    return `${years}년 ${months}개월`;
  } catch { return ""; }
}

export const StaffListRow: React.FC<StaffListRowProps> = ({
  emp, selectedId, contractCountByEmp,
  handleSelect, showError,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract,
}) => {
  const isSelected = emp.id === selectedId;
  const ctMeta = contractTypeMeta(emp.contract_type);
  const hasContractFile    = !!emp.contract_file_url;
  const hasResume          = !!emp.resume_url;
  const hasBankbook        = !!emp.bankbook_image_url;
  const hasResignationFile = !!emp.resignation_file_url;

  const empStatus = getEmploymentStatus((emp as any).retire_date ?? null);
  const isRetired = empStatus === "retired";
  const isPending = empStatus === "pending_resignation";

  // 재직 상태 표시
  const { label: statusLabel, cls: statusCls } = (() => {
    if (isRetired) return { label: "퇴사", cls: "text-zinc-400" };
    if (isPending) return { label: "퇴사예정", cls: "text-amber-600" };
    return { label: "재직", cls: "text-emerald-600" };
  })();

  // 계약 만료 D-day
  const dDayLabel = (() => {
    if (isRetired || !emp.contract_end) return null;
    try {
      const d = new Date(String(emp.contract_end).slice(0, 10) + "T00:00:00");
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const days = Math.round((d.getTime() - now.getTime()) / 86400_000);
      if (days < 0) return { label: "만료", cls: "text-rose-600" };
      if (days === 0) return { label: "D-0", cls: "text-rose-600" };
      if (days <= 30) return { label: `D-${days}`, cls: "text-amber-600" };
      if (days <= 60) return { label: `D-${days}`, cls: "text-zinc-500" };
    } catch { /* noop */ }
    return null;
  })();

  // 계약유형
  const contractLabel = (() => {
    const count = contractCountByEmp.get(emp.id) ?? 0;
    if (emp.contract_type === "fixed_term" && count > 0) return `계약 ${count}건`;
    return ctMeta?.short ?? null;
  })();

  // 계약유형 텍스트 컬러
  const contractTextCls = (() => {
    switch (emp.contract_type) {
      case "regular":    return "text-blue-600";
      case "fixed_term": return "text-amber-700";
      case "part_time":  return "text-zinc-500";
      case "daily":      return "text-rose-600";
      case "intern":     return "text-lime-700";
      default:           return "text-zinc-400";
    }
  })();

  const openResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.resume_url) window.open(emp.resume_url, "_blank", "noopener,noreferrer");
  };
  const openBankbook = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.bankbook_image_url) window.open(emp.bankbook_image_url, "_blank", "noopener,noreferrer");
  };
  const openContract = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.contract_file_url) {
      window.open(emp.contract_file_url, "_blank", "noopener,noreferrer");
    } else {
      showError(`${emp.name}님의 근로계약서가 등록되어 있지 않습니다.`);
    }
  };
  const openResignationFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.resignation_file_url) window.open(emp.resignation_file_url, "_blank", "noopener,noreferrer");
  };
  const writeContract = (e: React.MouseEvent) => {
    e.stopPropagation();
    setContractPrefill({
      employeeId: emp.id,
      employeeName: emp.name ?? "",
      employeePhone: emp.phone ?? "",
      employeeAddress: (emp as any).address ?? "",
      hireDate: emp.hire_date ?? "",
      position: emp.position ?? "",
      employmentType: (emp as any).employmentType ?? (emp as any).employment_type ?? "",
      annualLeaveDays: (emp as any).annual_leave_days ?? null,
    });
    if (onWriteContract) {
      onWriteContract(emp);
    } else {
      window.dispatchEvent(new CustomEvent("staff-write-contract", { detail: { employeeId: emp.id } }));
    }
  };

  const tenure = tenureLabel(emp.hire_date);

  // accent bar + 행 배경
  const rowCls = isSelected
    ? "bg-brand-tint/60 border-l-[3px] border-l-brand-deep"
    : "hover:bg-zinc-50/70 border-l-[3px] border-l-transparent";

  // 퇴사자는 전체 텍스트 muted
  const dimCls = isRetired ? "opacity-50" : "";

  return (
    <tr
      onClick={() => handleSelect(emp)}
      className={`cursor-pointer transition-colors duration-100 ${rowCls} ${isSelected ? "" : "border-b border-zinc-100"}`}
    >
      {/* 이름 · 직군/직책 */}
      <td className={`pl-3 pr-2 py-2.5 align-top ${dimCls}`}>
        <div className={`text-[15px] font-bold leading-tight whitespace-normal break-keep ${isSelected ? "text-brand-deep" : "text-zinc-800"}`}>
          {emp.name || <span className="text-zinc-400 font-normal">(이름없음)</span>}
        </div>
        <div className={`mt-0.5 text-[13px] leading-snug whitespace-normal break-keep ${isSelected ? "text-brand-deep/60" : "text-zinc-500"}`}>
          {[emp.position, emp.rank].filter(Boolean).join(" · ") || <span className="text-zinc-300">직군 미지정</span>}
        </div>
      </td>

      {/* 재직 상태 · 계약유형 · D-day */}
      <td className={`px-2 py-2.5 align-top w-[72px] ${dimCls}`}>
        <div className={`text-[13px] font-semibold leading-tight ${statusCls}`}>
          {statusLabel}
        </div>
        {contractLabel && (
          <div className={`mt-0.5 text-[12px] leading-tight tabular-nums ${contractTextCls}`}>
            {contractLabel}
          </div>
        )}
        {dDayLabel && (
          <div className={`mt-0.5 text-[12px] font-bold tabular-nums leading-tight ${dDayLabel.cls}`}>
            {dDayLabel.label}
          </div>
        )}
      </td>

      {/* 근속 */}
      <td className={`px-2 py-2.5 align-top w-[58px] text-right ${dimCls}`}>
        {tenure ? (
          <span className="text-[12px] text-zinc-500 tabular-nums leading-tight">{tenure}</span>
        ) : (
          <span className="text-zinc-300 text-[12px]">-</span>
        )}
      </td>

      {/* 서류 버튼 그룹 */}
      <td className="pl-1.5 pr-2.5 py-2.5 align-middle w-[76px]">
        <div
          className="flex items-center gap-[3px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 이력서 */}
          <DocBtn
            hasFile={hasResume}
            colorOn="text-emerald-500 hover:bg-emerald-50"
            colorOff="text-zinc-300 hover:text-emerald-400 hover:bg-emerald-50"
            onClick={openResume}
            uploadHandler={(e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (f) uploadResumeForRow(emp, f);
            }}
            accept=".pdf,.doc,.docx,.hwp,image/*"
            title={hasResume ? "이력서 보기" : "이력서 업로드"}
            icon={<Paperclip size={12} />}
          />
          {/* 통장사본 */}
          <DocBtn
            hasFile={hasBankbook}
            colorOn="text-sky-500 hover:bg-sky-50"
            colorOff="text-zinc-300 hover:text-sky-400 hover:bg-sky-50"
            onClick={openBankbook}
            uploadHandler={(e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (f) uploadBankbookForRow(emp, f);
            }}
            accept="image/*"
            title={hasBankbook ? "통장사본 보기" : "통장사본 업로드"}
            icon={<Paperclip size={12} />}
          />
          {/* 근로계약서 · 있으면 보기 · 없으면 작성 */}
          {hasContractFile ? (
            <DocBtn
              hasFile
              colorOn="text-indigo-500 hover:bg-indigo-50"
              colorOff=""
              onClick={openContract}
              title="근로계약서 보기"
              icon={<FileText size={12} />}
            />
          ) : (
            <button
              type="button"
              onClick={writeContract}
              title="근로계약서 작성"
              className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-zinc-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer shrink-0"
            >
              <NotePencilIcon size={12} />
            </button>
          )}
          {/* 사직서 · 퇴사예정 or 퇴사자만 */}
          {(isRetired || isPending) && (
            <DocBtn
              hasFile={hasResignationFile}
              colorOn="text-rose-500 hover:bg-rose-50"
              colorOff="text-zinc-300 hover:text-rose-400 hover:bg-rose-50"
              onClick={openResignationFile}
              uploadHandler={(e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (f) uploadResignationFileForRow(emp, f);
              }}
              accept=".pdf,image/*"
              title={hasResignationFile ? "사직서 보기" : "사직서 업로드"}
              icon={<ExternalLink size={12} />}
            />
          )}
        </div>
      </td>
    </tr>
  );
};
