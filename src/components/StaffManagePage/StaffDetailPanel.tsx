// src/components/StaffManagePage/StaffDetailPanel.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리 · 우측 상세 패널
//   프로필 헤더 + KPI 바 + §1 인적사항 + §6 계약·서류 + §7-2 연차 + §7 근로조건 + 각 섹션
import React, { useRef } from "react";
import {
  Award, CalendarDays, Camera, Clock, Edit2, Save, Star, Trash2, User, X,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Badge } from "../common/Badge";
import { EmployeeInfoForm } from "../common/EmployeeInfoForm";
import { Avatar, SectionCard, EmptyDetail } from "./StaffManagePage.subcomponents";
import { StaffContractSection } from "./StaffContractSection";
import { StaffLeaveSection } from "./StaffLeaveSection";
import { StaffConditionsSection } from "./StaffConditionsSection";
import type { Employee, EditDraft } from "./types";
import { CONTRACT_TYPES, POSITIONS } from "./types";
import {
  autoContractBadge, contractTypeMeta, calcTenure,
  isSeveranceEligible, performanceRatingColor, positionColor,
} from "./helpers";

interface LatestContract {
  id?: number;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  pdf_url?: string | null;
}

interface ContractHistoryItem {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  pdf_url?: string | null;
  pdf_size?: number | null;
  storage?: string | null;
  approved_by?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

interface UsedLeave {
  date: string;
  type: string;
  memo?: string;
  weight: number;
}

interface StaffDetailPanelProps {
  displayEmp: Employee | null;
  selectedEmp: Employee | null;
  editing: boolean;
  draft: EditDraft | null;
  saving: boolean;
  // 계약
  latestContract: LatestContract | null;
  latestContractLoading: boolean;
  contractHistory: ContractHistoryItem[];
  contractHistoryLoading: boolean;
  contractHistoryError: string | null;
  contractCountByEmp: Map<number, number>;
  // 연차
  leaveYear: number;
  currentYearNow: number;
  usedLeaves: UsedLeave[];
  leaveLoading: boolean;
  leaveError: string | null;
  deletingLeaveDate: string | null;
  // 핸들러
  setField: <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => void;
  startEdit: (emp: Employee) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  deleteEmployee: (emp: Employee) => void;
  setLeaveYear: React.Dispatch<React.SetStateAction<number>>;
  loadUsedLeaves: (empId: number, year: number) => void;
  deleteUsedLeave: (empId: number, date: string) => void;
  setAddrModalOpen: (v: boolean) => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
  uploadResume: (empId: number, file: File) => Promise<{ url: string }>;
  deleteResume: (empId: number) => Promise<void>;
}

export const StaffDetailPanel: React.FC<StaffDetailPanelProps> = ({
  displayEmp, selectedEmp, editing, draft, saving,
  latestContract, latestContractLoading,
  contractHistory, contractHistoryLoading, contractHistoryError,
  contractCountByEmp,
  leaveYear, currentYearNow, usedLeaves, leaveLoading, leaveError, deletingLeaveDate,
  setField, startEdit, cancelEdit, saveEdit, deleteEmployee,
  setLeaveYear, loadUsedLeaves, deleteUsedLeave,
  setAddrModalOpen, showError, showSuccess, confirm,
  uploadResume, deleteResume,
}) => {
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!displayEmp) return <EmptyDetail />;

  const tenure = calcTenure(displayEmp.hire_date);
  const totalDaysRaw = editing ? draft?.annual_leave_days : displayEmp.annual_leave_days;
  const totalDays = Number.isFinite(Number(totalDaysRaw)) ? Number(totalDaysRaw) : 15;
  const usedDays = usedLeaves.reduce((sum, l) => sum + l.weight, 0);
  const remainDays = Math.max(0, totalDays - usedDays);
  const fmtD = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const rating = displayEmp.performance_rating ? String(displayEmp.performance_rating).toUpperCase() : null;

  return (
    <>
      {/* ── 프로필 헤더 배너 ── */}
      <div className="bg-indigo-50/90 border-b border-indigo-100/80 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          {/* 사진 */}
          {(displayEmp.photo_url || editing) && (
            <div className="relative group shrink-0">
              {displayEmp.photo_url ? (
                <Avatar name={displayEmp.name} photoUrl={displayEmp.photo_url} size="sm" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-zinc-100 border border-dashed border-zinc-300 flex items-center justify-center text-zinc-400">
                  <Camera size={14} />
                </div>
              )}
              {editing && (
                <button
                  onClick={() => photoInputRef.current?.click()}
                  title="사진 변경"
                  className="absolute inset-0 rounded-full bg-zinc-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera size={11} className="text-white" />
                </button>
              )}
              <input
                ref={photoInputRef}
                type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setField("photo_url", URL.createObjectURL(file));
                }}
              />
            </div>
          )}

          {/* 이름 · 배지 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              {editing ? (
                <input
                  value={draft?.name ?? ""}
                  onChange={(e) => setField("name", e.target.value)}
                  className="text-base font-bold text-zinc-800 border-b-2 border-indigo-400 bg-transparent focus:outline-none leading-tight"
                />
              ) : (
                <h3 className="text-base font-bold text-zinc-800 leading-tight">{displayEmp.name}</h3>
              )}
              <span className="text-[14px] text-zinc-300">#{displayEmp.id}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 직책 */}
              {editing ? (
                <select
                  value={draft?.position ?? ""}
                  onChange={(e) => setField("position", e.target.value)}
                  className="text-[15px] border border-zinc-300 rounded-md px-2 h-6 bg-white focus:outline-none focus:border-brand-deep"
                >
                  <option value="">직책 없음</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <Badge className={positionColor(displayEmp.position)} size="sm">
                  {(displayEmp.position === "창고" || displayEmp.position === "매장")
                    ? `물류 · ${displayEmp.position}`
                    : (displayEmp.position || "직책 없음")}
                </Badge>
              )}
              {/* 계약유형 · 자동 배지 (#219) */}
              {(() => {
                const badge = autoContractBadge(latestContract, displayEmp.contract_type);
                if (!badge) return null;
                const tip = badge.source === "auto"
                  ? `계약서 자동 산출 · 시작 ${latestContract?.start_date ?? "-"} · 종료 ${latestContract?.end_date ?? "-"}`
                  : "계약유형";
                return (
                  <Badge className={badge.color} size="sm" title={tip}>
                    {badge.label}
                  </Badge>
                );
              })()}
              {/* 계약유형 편집 or 수동 배지 */}
              {editing ? (
                <select
                  value={draft?.contract_type ?? ""}
                  onChange={(e) => setField("contract_type", e.target.value)}
                  className="text-[15px] border border-zinc-300 rounded-md px-2 h-6 bg-white focus:outline-none focus:border-brand-deep"
                >
                  <option value="">계약유형 없음</option>
                  {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              ) : (() => {
                const ctMeta = contractTypeMeta(displayEmp.contract_type);
                if (!ctMeta) return null;
                const count = contractCountByEmp.get(displayEmp.id) ?? 0;
                const badgeLabel = displayEmp.contract_type === "fixed_term" && count > 0
                  ? `계약${count}` : ctMeta.short;
                return (
                  <Badge className={ctMeta.color} size="xs" title={ctMeta.label}>
                    {badgeLabel}
                  </Badge>
                );
              })()}
              {/* 레벨 */}
              {displayEmp.level != null && (
                <span className="text-[14px] font-semibold text-zinc-400 flex items-center gap-0.5">
                  <Award size={9} /> Lv.{editing ? draft?.level : displayEmp.level}
                </span>
              )}
            </div>
          </div>

          {/* 편집 / 저장 / 삭제 버튼 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {editing ? (
              <>
                <button
                  onClick={cancelEdit} disabled={saving}
                  className="h-7 px-2.5 text-[15px] font-semibold text-zinc-600 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 cursor-pointer flex items-center gap-1 disabled:opacity-40 transition-colors"
                >
                  <X size={12} /> 취소
                </button>
                <button
                  onClick={saveEdit} disabled={saving}
                  className="h-7 px-2.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-lg cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition-colors"
                >
                  {saving ? <Spinner size={12} tone="white" /> : <Save size={12} />}
                  {saving ? "저장 중..." : "저장"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => selectedEmp && startEdit(selectedEmp)}
                  className="h-7 px-2.5 text-[15px] font-semibold text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <Edit2 size={12} /> 편집
                </button>
                <button
                  onClick={() => selectedEmp && deleteEmployee(selectedEmp)}
                  className="h-7 px-2.5 text-[15px] font-semibold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={12} /> 삭제
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 근속·연차·평가 KPI 바 ── */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-4 py-2.5 border-b border-line bg-white shrink-0 text-[15px]">
        {/* 근속 */}
        <span className="inline-flex items-baseline gap-1.5">
          <span className="inline-flex items-center gap-1 text-[14px] text-zinc-400 font-semibold">
            <Clock size={11} className="text-indigo-400" />근속
          </span>
          <span className="font-bold text-zinc-800 tabular-nums">
            {tenure === "-" ? <span className="text-zinc-300 italic font-normal">미등록</span> : tenure}
          </span>
          {displayEmp.hire_date && (
            <span className="text-[15px] text-zinc-400 tabular-nums">({displayEmp.hire_date})</span>
          )}
        </span>
        <span className="text-zinc-200">·</span>
        {/* 연차 잔여 */}
        <span className="inline-flex items-baseline gap-1.5">
          <span className="inline-flex items-center gap-1 text-[14px] text-emerald-500 font-semibold">
            <CalendarDays size={11} />연차 잔여
          </span>
          <span className="font-bold text-emerald-700 tabular-nums">
            {fmtD(remainDays)}<span className="text-[15px] font-semibold ml-0.5">일</span>
          </span>
          {editing ? (
            <span className="inline-flex items-baseline gap-1 text-[15px] text-zinc-400">
              <span>/ 총</span>
              <input
                type="number" min={0} max={30} step={1}
                value={draft?.annual_leave_days ?? ""}
                onChange={(e) => setField("annual_leave_days", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="15"
                className="w-12 h-6 px-1 rounded border border-indigo-300 bg-indigo-50/40 text-[14px] font-bold text-zinc-700 text-right tabular-nums focus:outline-none focus:border-brand-deep"
              />
              <span>· 사용 {fmtD(usedDays)}</span>
            </span>
          ) : (
            <span className="text-[15px] text-zinc-400 tabular-nums">/ 총 {fmtD(totalDays)}일 · 사용 {fmtD(usedDays)}</span>
          )}
        </span>
        <span className="text-zinc-200">·</span>
        {/* 인사평가 */}
        <span className="inline-flex items-baseline gap-1.5">
          <span className="inline-flex items-center gap-1 text-[14px] text-amber-500 font-semibold">
            <Star size={11} />평가
          </span>
          {rating ? (
            <Badge className={performanceRatingColor(rating)} size="sm">{rating}</Badge>
          ) : (
            <span className="text-zinc-300 italic">미평가</span>
          )}
          {isSeveranceEligible(displayEmp) && (
            <Badge tone="rose" size="sm" className="ml-1">퇴직금대상</Badge>
          )}
        </span>
      </div>

      {/* ── 인사카드 섹션들 · 세로 스크롤 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2 bg-zinc-50/30">
        {/* §1 인적사항 */}
        <SectionCard title="인적사항" icon={<User size={11} />} group="personal" defaultOpen>
          <EmployeeInfoForm
            layout="grid"
            editing={editing}
            fields={["phone", "email", "birthDate", "gender", "address"]}
            values={{
              phone:     editing ? (draft?.phone     ?? "") : (displayEmp.phone     ?? ""),
              email:     editing ? (draft?.email     ?? "") : (displayEmp.email     ?? ""),
              birthDate: editing ? (draft?.birth_date ?? "") : (displayEmp.birth_date ?? ""),
              gender:    editing ? (draft?.gender    ?? "") : (displayEmp.gender    ?? ""),
              address:   editing ? (draft?.address   ?? "") : (displayEmp.address   ?? ""),
            }}
            onChange={(v) => {
              if (v.phone     !== undefined) setField("phone",      v.phone);
              if (v.email     !== undefined) setField("email",      v.email);
              if (v.birthDate !== undefined) setField("birth_date", v.birthDate);
              if (v.gender    !== undefined) setField("gender",     v.gender);
              if (v.address   !== undefined) setField("address",    v.address);
            }}
            onAddressSearch={editing ? () => setAddrModalOpen(true) : undefined}
          />
        </SectionCard>

        {/* §6 계약·서류 + §6-1 계약이력 */}
        <StaffContractSection
          displayEmp={displayEmp}
          editing={editing}
          draft={draft}
          selectedEmp={selectedEmp}
          latestContract={latestContract}
          latestContractLoading={latestContractLoading}
          contractHistory={contractHistory}
          contractHistoryLoading={contractHistoryLoading}
          contractHistoryError={contractHistoryError}
          contractCountByEmp={contractCountByEmp}
          setField={setField}
          showError={showError}
          showSuccess={showSuccess}
          confirm={confirm}
          uploadResume={uploadResume}
          deleteResume={deleteResume}
        />

        {/* §7 근로조건·임금 + §9 4대보험 + §10 약국자격 + §11 메모 */}
        <StaffConditionsSection
          displayEmp={displayEmp}
          editing={editing}
          draft={draft}
          latestContract={latestContract}
          latestContractLoading={latestContractLoading}
          setField={setField}
        />

        {/* §7-2 연차·유급휴가 */}
        <StaffLeaveSection
          displayEmp={displayEmp}
          editing={editing}
          draft={draft}
          selectedEmp={selectedEmp}
          leaveYear={leaveYear}
          currentYearNow={currentYearNow}
          usedLeaves={usedLeaves}
          leaveLoading={leaveLoading}
          leaveError={leaveError}
          deletingLeaveDate={deletingLeaveDate}
          setLeaveYear={setLeaveYear}
          loadUsedLeaves={loadUsedLeaves}
          deleteUsedLeave={deleteUsedLeave}
          setField={setField}
        />

        <div className="h-2" />
      </div>
    </>
  );
};
