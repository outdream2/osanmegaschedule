// src/components/ContractWriterPage/ContractLeftForm.tsx
// 2026-08-23 · #framework-4 · 서브컴포넌트 분리 완료 · 조합 레이어

import React from "react";
import type { ContractForm, DayKey, CardKey } from "./types";
import { WriteModeToggle } from "./WriteModeToggle";
import { EmployeeCard } from "./EmployeeCard";
import { WorkConditionCard } from "./WorkConditionCard";
import { WageCard } from "./WageCard";
import type { Employee } from "../../types";
import type { ContractCategory } from "../../lib/contract";
import type { WithholdingRate } from "../../lib/payroll";

// ─────────────────────────────────────────────────────────────────────────────
// Props (기존 시그니처 100% 유지)
// ─────────────────────────────────────────────────────────────────────────────

export interface ContractLeftFormProps {
  form: ContractForm;
  upd: <K extends keyof ContractForm>(key: K, val: ContractForm[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<ContractForm>>;
  setNotice: (n: { tone: "ok" | "err"; text: string } | null) => void;

  // 작성 모드
  writeMode: "form" | "upload";
  setWriteMode: (m: "form" | "upload") => void;

  // PDF 업로드 모드
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  uploadBusy: boolean;
  uploadInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadContract: () => void;

  // 직원 검색
  employees: Employee[];
  empLoading: boolean;
  empError: string | null;
  empSearchOpen: boolean;
  setEmpSearchOpen: (v: boolean) => void;
  onSelectEmployee: (empIdRaw: string) => void;

  // 카드 접기
  toggleCard: (key: CardKey) => void;
  isCardCollapsed: (key: CardKey) => boolean;

  // 주소 검색 모달
  addrModalOpen: boolean;
  setAddrModalOpen: (v: boolean) => void;

  // 근무일/시간 파생값
  weeklyDays: number;
  weeklyWeekdayDays: number;
  weeklyWeekendDays: number;
  toggleDay: (d: DayKey) => void;
  monthlyCalc: { dailyMinutes: number; monthlyHoursInt: number; monthlyMinutesRem: number } | null;

  // 직군
  jobCategories: ContractCategory[];

  // 임금 계산 보조
  wageHourlyOverride: number | null;
  setWageHourlyOverride: (v: number | null) => void;
  dependentsCount: number;
  setDependentsCount: (v: number) => void;
  withholdingRate: WithholdingRate;
  setWithholdingRate: (v: WithholdingRate) => void;
  childrenCount: number;
  setChildrenCount: (v: number) => void;
  extraDeduction: number;
  setExtraDeduction: (v: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

const ContractLeftForm: React.FC<ContractLeftFormProps> = ({
  form, upd, setForm, setNotice,
  writeMode, setWriteMode,
  uploadFile, setUploadFile, uploadBusy, uploadInputRef, handleUploadContract,
  employees, empLoading, empError, empSearchOpen, setEmpSearchOpen, onSelectEmployee,
  toggleCard, isCardCollapsed,
  addrModalOpen, setAddrModalOpen,
  weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, toggleDay, monthlyCalc,
  jobCategories,
  wageHourlyOverride, setWageHourlyOverride,
  dependentsCount, setDependentsCount,
  withholdingRate, setWithholdingRate,
  childrenCount, setChildrenCount,
  extraDeduction, setExtraDeduction,
}) => (
  <section className="bg-zinc-50 flex flex-col gap-3 h-full overflow-y-auto p-0.5">

    {/* 작성 방식 토글 + PDF 업로드 모드 */}
    <WriteModeToggle
      form={form}
      upd={upd}
      writeMode={writeMode}
      setWriteMode={setWriteMode}
      uploadFile={uploadFile}
      setUploadFile={setUploadFile}
      uploadBusy={uploadBusy}
      uploadInputRef={uploadInputRef}
      handleUploadContract={handleUploadContract}
      employees={employees}
      empLoading={empLoading}
      empSearchOpen={empSearchOpen}
      setEmpSearchOpen={setEmpSearchOpen}
      onSelectEmployee={onSelectEmployee}
    />

    {/* 여기서 작성 모드 · 기존 폼 전체 */}
    {writeMode === "form" && (<>

      {/* 카드 1 · 근로자 정보 */}
      <EmployeeCard
        form={form}
        upd={upd}
        setNotice={setNotice}
        employees={employees}
        empLoading={empLoading}
        empError={empError}
        empSearchOpen={empSearchOpen}
        setEmpSearchOpen={setEmpSearchOpen}
        onSelectEmployee={onSelectEmployee}
        toggleCard={toggleCard}
        isCardCollapsed={isCardCollapsed}
        addrModalOpen={addrModalOpen}
        setAddrModalOpen={setAddrModalOpen}
      />

      {/* 카드 2 · 근무조건 */}
      <WorkConditionCard
        form={form}
        upd={upd}
        toggleCard={toggleCard}
        isCardCollapsed={isCardCollapsed}
        weeklyDays={weeklyDays}
        weeklyWeekdayDays={weeklyWeekdayDays}
        weeklyWeekendDays={weeklyWeekendDays}
        toggleDay={toggleDay}
        monthlyCalc={monthlyCalc}
        jobCategories={jobCategories}
      />

      {/* 카드 3 · 임금 계산 */}
      <WageCard
        form={form}
        setForm={setForm}
        toggleCard={toggleCard}
        isCardCollapsed={isCardCollapsed}
        weeklyWeekdayDays={weeklyWeekdayDays}
        weeklyWeekendDays={weeklyWeekendDays}
        monthlyCalc={monthlyCalc}
        wageHourlyOverride={wageHourlyOverride}
        setWageHourlyOverride={setWageHourlyOverride}
        dependentsCount={dependentsCount}
        setDependentsCount={setDependentsCount}
        withholdingRate={withholdingRate}
        setWithholdingRate={setWithholdingRate}
        childrenCount={childrenCount}
        setChildrenCount={setChildrenCount}
        extraDeduction={extraDeduction}
        setExtraDeduction={setExtraDeduction}
      />

    </>)}

  </section>
);

export default ContractLeftForm;
