// src/components/BusinessManagePage/common/EmployeeDrawer.tsx
// 2026-10-12 · 공용 직원 상세 slide drawer · BusinessManagePage.Overview + StaffDashboard 공유
//   · fixed inset-0 backdrop · w-full sm:w-[560px] · slideInRight animation · ESC 닫기
//   · EmployeeInfoPanel (lazy) 내부 렌더링
//   · onSaved 콜백 → 호출처 리스트 갱신

import React, { Suspense, useEffect } from "react";
import type { Employee } from "../../../types";
import { Spinner } from "../../common/Spinner";

const EmployeeInfoPanel = React.lazy(() =>
  import("../../schedule-v2/views/employee/EmployeeInfoPanel").then(m => ({ default: m.EmployeeInfoPanel })),
);

const FallbackSpinner: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex-1 flex items-center justify-center py-16">
    <Spinner label={label} size={16} tone="brand" />
  </div>
);

export interface EmployeeDrawerProps {
  /** null / undefined: drawer 닫힘 */
  employeeId: number | null | undefined;
  /** 부모가 관리하는 employees 배열 (id lookup 용) */
  employees: Employee[];
  onClose: () => void;
  /** 저장 완료 후 부모 리스트 갱신 */
  onSaved?: (updated: Employee) => void;
  /** 직원관리 전체 편집 열기 (옵션 · EmployeeInfoPanel 상단 "전체" 버튼) */
  onOpenManagement?: (employeeId: number) => void;
}

export const EmployeeDrawer: React.FC<EmployeeDrawerProps> = ({
  employeeId,
  employees,
  onClose,
  onSaved,
  onOpenManagement,
}) => {
  // ESC 닫기
  useEffect(() => {
    if (employeeId == null) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [employeeId, onClose]);

  if (employeeId == null) return null;

  const emp = employees.find(e => e.id === employeeId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex justify-end animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:w-[720px] md:w-[880px] bg-white h-full shadow-2xl flex flex-col relative"
        onClick={e => e.stopPropagation()}
        style={{ animation: "employeeDrawerSlideIn 180ms ease-out" }}
      >
        {/* 닫기 버튼 · 항상 우상단 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 cursor-pointer text-slate-500 text-[16px]"
          aria-label="닫기"
          title="닫기 (Esc)"
        >
          ✕
        </button>

        {emp ? (
          <Suspense fallback={<FallbackSpinner label="직원 상세 로딩 중..." />}>
            <EmployeeInfoPanel
              employee={emp}
              onSaved={onSaved}
              onOpenManagement={onOpenManagement}
            />
          </Suspense>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <FallbackSpinner label="직원 정보 로딩 중..." />
          </div>
        )}
      </div>

      {/* animation keyframe · scoped */}
      <style>{`
        @keyframes employeeDrawerSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default EmployeeDrawer;
