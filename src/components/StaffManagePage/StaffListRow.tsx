// 2026-09-18 · 직원 리스트 아이템 전수 재설계 · 사용자 지시
// 테이블 행 → 카드 리스트 행 (flex) · 겹침 제거 · 최신 트렌드
//   · 이름/직군(좌) + 계약유형(중) + 서류 도트(우)
//   · Linear/Notion/Vercel 2026 톤 · truncate 절대 금지

import React from "react";
import { ExternalLink, FileText, Paperclip, PenSquare as NotePencilIcon } from "lucide-react";
import type { Employee } from "./types";
import { contractTypeMeta } from "./helpers";
import { getEmploymentStatus } from "../../lib/employmentStatus";
import { Avatar } from "./StaffManagePage.subcomponents";
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

// 아이콘 도트 버튼 · 있음=컬러 / 없음=회색 · 클릭 가능
const DocIcon: React.FC<{
  hasFile: boolean;
  label: string;
  color: string;       // 파일 있을 때 컬러 (Tailwind class)
  grayColor: string;   // 없을 때 컬러
  onClick?: (e: React.MouseEvent) => void;
  uploadHandler?: React.ChangeEventHandler<HTMLInputElement>;
  accept?: string;
  title: string;
  icon: React.ReactNode;
}> = ({ hasFile, color, grayColor, onClick, uploadHandler, accept, title, icon }) => {
  if (hasFile) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${color}`}
      >
        {icon}
      </button>
    );
  }
  if (uploadHandler) {
    return (
      <label
        onClick={(e) => e.stopPropagation()}
        title={title}
        className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors cursor-pointer ${grayColor}`}
      >
        {icon}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={uploadHandler}
        />
      </label>
    );
  }
  return (
    <div
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md ${grayColor}`}
    >
      {icon}
    </div>
  );
};

export const StaffListRow: React.FC<StaffListRowProps> = ({
  emp, selectedId, contractCountByEmp,
  handleSelect, showError,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract,
}) => {
  const isSelected = emp.id === selectedId;
  const ctMeta     = contractTypeMeta(emp.contract_type);
  const hasContractFile    = !!emp.contract_file_url;
  const hasResume          = !!emp.resume_url;
  const hasBankbook        = !!emp.bankbook_image_url;
  const hasResignationFile = !!emp.resignation_file_url;
  const empStatus  = getEmploymentStatus((emp as any).retire_date ?? null);
  const isRetired  = empStatus !== "active";

  // 계약 만료 D-day
  const dDayLabel = (() => {
    if (isRetired || !emp.contract_end) return null;
    try {
      const d = new Date(String(emp.contract_end).slice(0, 10) + "T00:00:00");
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const days = Math.round((d.getTime() - now.getTime()) / 86400_000);
      if (days < 0) return { label: "만료", cls: "text-rose-600 bg-rose-50 border-rose-200" };
      if (days === 0) return { label: "오늘", cls: "text-rose-600 bg-rose-50 border-rose-200" };
      if (days <= 30) return { label: `D-${days}`, cls: "text-amber-700 bg-amber-50 border-amber-200" };
    } catch { /* noop */ }
    return null;
  })();

  // 계약유형 라벨 (배지 아님 · 텍스트)
  const contractLabel = (() => {
    const count = contractCountByEmp.get(emp.id) ?? 0;
    if (emp.contract_type === "fixed_term" && count > 0) return `계약${count}`;
    return ctMeta?.short ?? null;
  })();

  // 계약유형 텍스트 컬러
  const contractTextCls = (() => {
    if (!emp.contract_type) return "text-zinc-300";
    switch (emp.contract_type) {
      case "regular":    return "text-blue-600";
      case "fixed_term": return "text-amber-700";
      case "part_time":  return "text-zinc-500";
      case "daily":      return "text-rose-600";
      case "intern":     return "text-lime-700";
      default:           return "text-zinc-500";
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

  return (
    <div
      onClick={() => handleSelect(emp)}
      className={`
        group flex items-center gap-2.5 px-3 py-2.5 cursor-pointer
        border-b border-zinc-100 last:border-b-0
        transition-colors duration-100
        ${isSelected
          ? "bg-indigo-50 border-l-[3px] border-l-indigo-400 pl-[9px]"
          : "hover:bg-zinc-50 border-l-[3px] border-l-transparent pl-[9px]"}
      `}
    >
      {/* 아바타 */}
      <div className="shrink-0">
        <Avatar name={emp.name} photoUrl={emp.photo_url} size="xs" />
      </div>

      {/* 이름 + 직군 · 좌측 · flex-1 */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-[16px] font-bold leading-tight break-keep whitespace-normal ${isSelected ? "text-indigo-800" : "text-zinc-800"}`}>
          {emp.name}
        </span>
        {emp.position && (
          <span className={`text-[13px] font-semibold leading-none ${isSelected ? "text-indigo-500" : "text-zinc-400"}`}>
            {emp.position}{emp.rank ? ` · ${emp.rank}` : ""}
          </span>
        )}
      </div>

      {/* 계약유형 + D-day · 중앙 · shrink-0 · w-14 */}
      <div className="shrink-0 w-14 flex flex-col items-end gap-0.5">
        {contractLabel && (
          <span className={`text-[13px] font-bold tabular-nums leading-none ${contractTextCls}`}>
            {contractLabel}
          </span>
        )}
        {dDayLabel && (
          <span className={`text-[11px] font-bold px-1 py-px rounded border leading-none tabular-nums ${dDayLabel.cls}`}>
            {dDayLabel.label}
          </span>
        )}
      </div>

      {/* 서류 아이콘 그룹 · 우측 · shrink-0 · flex row */}
      <div
        className="shrink-0 flex items-center gap-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 이력서 */}
        <DocIcon
          hasFile={hasResume}
          label="이력서"
          color="text-emerald-500 hover:bg-emerald-50"
          grayColor="text-zinc-300 hover:text-emerald-400 hover:bg-emerald-50"
          onClick={openResume}
          uploadHandler={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) uploadResumeForRow(emp, f);
          }}
          accept=".pdf,.doc,.docx,.hwp,image/*"
          title={hasResume ? "이력서 보기" : "이력서 업로드"}
          icon={<Paperclip size={13} />}
        />
        {/* 통장사본 */}
        <DocIcon
          hasFile={hasBankbook}
          label="통장"
          color="text-sky-500 hover:bg-sky-50"
          grayColor="text-zinc-300 hover:text-sky-400 hover:bg-sky-50"
          onClick={openBankbook}
          uploadHandler={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) uploadBankbookForRow(emp, f);
          }}
          accept="image/*"
          title={hasBankbook ? "통장사본 보기" : "통장사본 업로드"}
          icon={<Paperclip size={13} />}
        />
        {/* 근로계약서 */}
        {hasContractFile ? (
          <DocIcon
            hasFile
            label="계약서"
            color="text-indigo-500 hover:bg-indigo-50"
            grayColor=""
            onClick={openContract}
            title="근로계약서 보기"
            icon={<FileText size={13} />}
          />
        ) : (
          <button
            type="button"
            onClick={writeContract}
            title="근로계약서 작성"
            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            <NotePencilIcon size={13} />
          </button>
        )}
        {/* 사직서 · 퇴사자만 */}
        {isRetired && (
          <DocIcon
            hasFile={hasResignationFile}
            label="사직서"
            color="text-rose-500 hover:bg-rose-50"
            grayColor="text-zinc-300 hover:text-rose-400 hover:bg-rose-50"
            onClick={openResignationFile}
            uploadHandler={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) uploadResignationFileForRow(emp, f);
            }}
            accept=".pdf,image/*"
            title={hasResignationFile ? "사직서 보기" : "사직서 업로드"}
            icon={<ExternalLink size={13} />}
          />
        )}
      </div>
    </div>
  );
};
