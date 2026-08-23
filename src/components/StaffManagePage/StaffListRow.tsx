// 2026-08-22 · Framework Phase 4 · StaffManagePage 좌측 리스트 아이템 이관
// 원라인 표 형식 · 이름·직책·계약유형·근속·평가·이력서·통장사본·근로계약서·사직서·상태

import React from "react";
import { ExternalLink, Paperclip, PenSquare as NotePencilIcon } from "lucide-react";
import type { Employee } from "./types";
import { contractTypeMeta, calcTenure, positionColor, performanceRatingColor } from "./helpers";
import { getEmploymentStatus } from "../../lib/employmentStatus";
import { Avatar } from "./StaffManagePage.subcomponents";
import { StatusPill } from "../common/StatusPill";
import { Badge } from "../common/Badge";

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

export const StaffListRow: React.FC<StaffListRowProps> = ({
  emp, selectedId, contractCountByEmp,
  handleSelect, showError,
  uploadResumeForRow, uploadBankbookForRow, uploadResignationFileForRow,
  onWriteContract,
}) => {
  const isSelected = emp.id === selectedId;
  const ctMeta   = contractTypeMeta(emp.contract_type);
  const tenure   = calcTenure(emp.hire_date);
  const hasContractFile    = !!emp.contract_file_url;
  const hasResume          = !!emp.resume_url;
  const hasBankbook        = !!emp.bankbook_image_url;
  const hasResignationFile = !!emp.resignation_file_url;
  const rating   = emp.performance_rating ? emp.performance_rating.toUpperCase() : null;
  const empStatus = getEmploymentStatus((emp as any).retire_date ?? null);
  const isRetired = empStatus !== "active";
  const openContract = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.contract_file_url) {
      window.open(emp.contract_file_url, "_blank", "noopener,noreferrer");
    } else {
      showError(`${emp.name}님의 근로계약서가 등록되어 있지 않습니다.\n편집 모드에서 계약서 URL을 입력해 주세요.`);
    }
  };
  const openResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.resume_url) window.open(emp.resume_url, "_blank", "noopener,noreferrer");
  };
  const openBankbook = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.bankbook_image_url) window.open(emp.bankbook_image_url, "_blank", "noopener,noreferrer");
  };
  const openResignationFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emp.resignation_file_url) window.open(emp.resignation_file_url, "_blank", "noopener,noreferrer");
  };
  return (
    <tr
      onClick={() => handleSelect(emp)}
      className={`cursor-pointer transition-colors ${
        isSelected ? "bg-indigo-50/80" : "hover:bg-zinc-50/70"
      }`}
    >
      {/* 이름 */}
      <td className="px-2 py-2 text-[15px] font-bold text-zinc-800 truncate max-w-[120px]">
        <div className="flex items-center gap-1">
          {emp.photo_url && <Avatar name={emp.name} photoUrl={emp.photo_url} size="xs" />}
          <span className={isSelected ? "text-indigo-800" : ""}>{emp.name}</span>
        </div>
      </td>
      {/* 직책 */}
      <td className="px-1 py-2 text-center">
        {emp.position && (
          <Badge className={positionColor(emp.position)} size="sm">
            {emp.position}
          </Badge>
        )}
      </td>
      {/* 계약유형 · 계약직 → "계약N" (N=총 계약수) · 정/알 등은 short */}
      <td className="px-1 py-2 text-center">
        {(() => {
          const count = contractCountByEmp.get(emp.id) ?? 0;
          const isContract = emp.contract_type === "fixed_term";
          if (isContract && count > 0) {
            return (
              <Badge
                tone="amber"
                size="sm"
                title={`계약직 · 총 ${count}회 계약 (${count === 1 ? "첫 계약" : `재계약 ${count - 1}회`})`}
              >
                계약{count}
              </Badge>
            );
          }
          if (ctMeta) {
            return (
              <Badge className={ctMeta.color} size="sm">
                {ctMeta.short}
              </Badge>
            );
          }
          return <span className="text-[15px] text-zinc-300">-</span>;
        })()}
      </td>
      {/* 근속 */}
      <td className="px-1 py-2 text-center text-[14px] text-zinc-600 tabular-nums whitespace-nowrap">
        {tenure}
      </td>
      {/* 평가 */}
      <td className="px-1 py-2 text-center">
        {rating ? (
          <Badge className={performanceRatingColor(rating)} size="sm">
            {rating}
          </Badge>
        ) : (
          <span className="text-[15px] text-zinc-300">-</span>
        )}
      </td>
      {/* 이력서 · 파일 있음=보기 · 없음=업로드 */}
      <td className="px-1 py-2 text-center">
        {hasResume ? (
          <button
            type="button"
            onClick={openResume}
            className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-emerald-600 hover:text-emerald-800 hover:underline cursor-pointer whitespace-nowrap"
            title={`이력서 · Google Drive · 새 창으로 보기\n${emp.resume_url ?? ""}`}
          >
            <ExternalLink size={10} />보기
          </button>
        ) : (
          <label
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-zinc-500 hover:text-emerald-700 hover:bg-emerald-50 border border-line hover:border-emerald-200 rounded px-1 py-0.5 cursor-pointer whitespace-nowrap transition-colors"
            title="이력서 업로드 · Google Drive (PDF·DOC·이미지 · 10MB)"
          >
            <Paperclip size={10} />업로드
            <input
              type="file"
              accept=".pdf,.doc,.docx,.hwp,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadResumeForRow(emp, f);
              }}
            />
          </label>
        )}
      </td>
      {/* 통장사본 · 파일 있음=보기 · 없음=업로드 */}
      <td className="px-1 py-2 text-center">
        {hasBankbook ? (
          <button
            type="button"
            onClick={openBankbook}
            className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-sky-600 hover:text-sky-800 hover:underline cursor-pointer whitespace-nowrap"
            title="통장사본 · 새 창으로 보기"
          >
            <ExternalLink size={10} />보기
          </button>
        ) : (
          <label
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-zinc-500 hover:text-sky-700 hover:bg-sky-50 border border-line hover:border-sky-200 rounded px-1 py-0.5 cursor-pointer whitespace-nowrap transition-colors"
            title="통장사본 업로드 · 이미지 (jpg/png · 5MB)"
          >
            <Paperclip size={10} />업로드
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadBankbookForRow(emp, f);
              }}
            />
          </label>
        )}
      </td>
      {/* 근로계약서 · 보기 or 작성 */}
      <td className="px-1 py-2 text-center">
        {hasContractFile ? (
          <button
            type="button"
            onClick={openContract}
            className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer whitespace-nowrap"
            title="근로계약서 새 창으로 보기"
          >
            <Paperclip size={10} />보기
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              try {
                const prefill = {
                  employeeId: emp.id,
                  employeeName: emp.name ?? "",
                  employeePhone: emp.phone ?? "",
                  employeeAddress: (emp as any).address ?? "",
                  hireDate: emp.hire_date ?? "",
                  position: emp.position ?? "",
                  employmentType: (emp as any).employmentType ?? (emp as any).employment_type ?? "",
                  annualLeaveDays: (emp as any).annual_leave_days ?? null,
                };
                localStorage.setItem("contract-writer-prefill", JSON.stringify(prefill));
              } catch { /* localStorage 실패 무시 */ }
              if (onWriteContract) {
                onWriteContract(emp);
              } else {
                window.dispatchEvent(new CustomEvent("staff-write-contract", { detail: { employeeId: emp.id } }));
              }
            }}
            className="inline-flex items-center gap-0.5 text-[15px] font-bold text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 cursor-pointer whitespace-nowrap transition-colors"
            title="근로계약서 작성 · 기본정보 자동 채움"
          >
            <NotePencilIcon size={10} />작성
          </button>
        )}
      </td>
      {/* 사직서 · 퇴사자만 표시 · 파일 있음=보기 · 없음=업로드 */}
      <td className="px-1 py-2 text-center">
        {isRetired ? (
          hasResignationFile ? (
            <button
              type="button"
              onClick={openResignationFile}
              className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer whitespace-nowrap"
              title={`사직서 · 새 창으로 보기\n${emp.resignation_file_url ?? ""}`}
            >
              <ExternalLink size={10} />보기
            </button>
          ) : (
            <label
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[15px] font-semibold text-zinc-500 hover:text-rose-700 hover:bg-rose-50 border border-line hover:border-rose-200 rounded px-1 py-0.5 cursor-pointer whitespace-nowrap transition-colors"
              title="사직서 업로드 · PDF 또는 이미지 · 20MB"
            >
              <Paperclip size={10} />업로드
              <input
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) uploadResignationFileForRow(emp, f);
                }}
              />
            </label>
          )
        ) : (
          <span className="text-[15px] text-zinc-200">-</span>
        )}
      </td>
      {/* 상태 배지 · 재직/퇴사예정/퇴사 */}
      <td className="px-1 py-2 text-center" title={
        empStatus === "pending_resignation" ? `퇴사예정일 ${(emp as any).retire_date}`
        : empStatus === "retired" ? `퇴사일 ${(emp as any).retire_date}`
        : undefined
      }>
        {empStatus === "pending_resignation" && (
          <StatusPill tone="amber" size="xs" dot>퇴사예정</StatusPill>
        )}
        {empStatus === "retired" && (
          <StatusPill tone="rose" size="xs" dot>퇴사</StatusPill>
        )}
      </td>
    </tr>
  );
};
