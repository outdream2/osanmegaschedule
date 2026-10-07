// src/components/schedule-v2/views/employee/EmployeeInfoPanel.tsx
// 2026-10-07 · 스케줄 V2 · 직원별 기본정보 Quick View (Phase V2-D)
//   · 마스터 수정 X · V2 안에서 employee master edit 복제 금지
//   · [직원관리에서 수정] 버튼 · 외부 Employee Management 로 이동
//   · 민감정보 (주민번호 · 급여 등) 노출 금지 · 간단 기본 정보만
import React from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { Employee } from "../../../../types";
import { Card } from "../../../common/Card";

interface Props {
  employee: Employee;
  onOpenManagement?: (employeeId: number) => void;
}

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start gap-3 py-2 border-b border-line last:border-0">
    <span className="w-24 shrink-0 text-[12px] font-semibold text-ink-soft">{label}</span>
    <span className="text-[13px] text-ink">{value ?? <span className="text-ink-soft">-</span>}</span>
  </div>
);

export const EmployeeInfoPanel: React.FC<Props> = ({ employee, onOpenManagement }) => {
  return (
    <Card variant="sm" padding="md" rounded="xl" className="flex-1 min-h-0 overflow-auto max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[16px] font-bold text-ink">기본 정보</h3>
        {onOpenManagement && (
          <button
            type="button"
            onClick={() => onOpenManagement(employee.id)}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-white border border-brand-deep/30 text-brand-deep text-[12px] font-semibold hover:bg-brand-tint/40 cursor-pointer"
            title="직원관리 페이지에서 상세 정보 수정"
          >
            <ArrowSquareOut size={12} weight="bold" /> 직원관리에서 수정
          </button>
        )}
      </div>
      <div className="flex flex-col">
        <Row label="이름" value={employee.name} />
        <Row label="직군" value={employee.position} />
        <Row label="직급" value={employee.rank ?? "-"} />
        <Row label="고용형태" value={employee.employmentType ?? "-"} />
        <Row label="근무지" value={employee.workplace ?? "-"} />
        <Row label="입사일" value={employee.hireDate ?? "-"} />
        <Row
          label="재직 상태"
          value={
            employee.retireDate
              ? <span className="text-rose-700 font-semibold">퇴사 ({employee.retireDate})</span>
              : <span className="text-emerald-700 font-semibold">재직 중</span>
          }
        />
        <Row label="연차 (연간)" value={employee.annual_leave_days != null ? `${employee.annual_leave_days}일` : "-"} />
      </div>
    </Card>
  );
};

export default EmployeeInfoPanel;
