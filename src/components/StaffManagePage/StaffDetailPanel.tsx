// src/components/StaffManagePage/StaffDetailPanel.tsx
// 2026-08-29 · Phase 2 · Tab 재조립 · SectionCard 스크롤 → Tabs 5개 (Overview/Personal/Job & Wage/Documents/Time Off)
//   헤더·KPI바 유지 · 편집 상태 탭 전환 시 draft state 보존 · 기능·API·훅 시그니처 변경 없음
import React, { useRef, useState } from "react";
import {
  Award, CalendarDays, Camera, Clock, Edit2, ExternalLink,
  FileText, Paperclip, Save, Star, Trash2, User, X,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Badge } from "../common/Badge";
import { TabBar } from "../common/TabBar";
import { EmployeeInfoForm } from "../common/EmployeeInfoForm";
import { Avatar, SectionCard, EmptyDetail } from "./StaffManagePage.subcomponents";
import { StaffContractSection } from "./StaffContractSection";
import { StaffLeaveSection } from "./StaffLeaveSection";
import { StaffConditionsSection } from "./StaffConditionsSection";
import type { Employee, EditDraft } from "./types";
import { CONTRACT_TYPES, POSITIONS } from "./types";
// 2026-08-29 · #177 · 직급(rank) 편집 · settings.ranks 소스
import { useSettings } from "../../hooks/useSettings";
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

type DetailTab = "overview" | "personal" | "job" | "documents" | "timeoff";

const DETAIL_TABS = [
  { key: "overview"   as const, label: "Overview",    color: "indigo"  as const },
  { key: "personal"   as const, label: "Personal",    color: "sky"     as const },
  { key: "job"        as const, label: "Job & Wage",  color: "amber"   as const },
  { key: "documents"  as const, label: "Documents",   color: "teal"    as const },
  { key: "timeoff"    as const, label: "Time Off",    color: "emerald" as const },
];

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
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  // 2026-08-29 · #177 · settings.ranks 소스
  const { settings } = useSettings();
  const ranks = settings.ranks ?? [];

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
      {/* ── 프로필 헤더 · v9 · 상단 gradient accent · glass style ── */}
      <div className="relative bg-white border-b border-line px-5 py-3 shrink-0">
        <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10" />
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
              {/* 직군 */}
              {editing ? (
                <select
                  value={draft?.position ?? ""}
                  onChange={(e) => setField("position", e.target.value)}
                  className="text-[15px] border border-zinc-300 rounded-md px-2 h-6 bg-white focus:outline-none focus:border-brand-deep"
                >
                  <option value="">직군 없음</option>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <Badge className={positionColor(displayEmp.position)} size="sm">
                  {(displayEmp.position === "창고" || displayEmp.position === "매장")
                    ? `물류 · ${displayEmp.position}`
                    : (displayEmp.position || "직군 없음")}
                </Badge>
              )}
              {/* 2026-08-29 · #177 · 직급(rank) 편집/표시 · settings.ranks 소스 */}
              {editing ? (
                <select
                  value={draft?.rank ?? ""}
                  onChange={(e) => setField("rank", e.target.value)}
                  className="text-[15px] border border-zinc-300 rounded-md px-2 h-6 bg-white focus:outline-none focus:border-brand-deep"
                  title="직급 (시스템설정 · 직급 탭에서 편집)"
                >
                  <option value="">직급 없음</option>
                  {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : displayEmp.rank ? (
                <Badge tone="zinc" size="sm" title="직급">{displayEmp.rank}</Badge>
              ) : null}
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

      {/* ── 근속·연차·평가 · v9 · 3 mini stats ── */}
      <div className="grid grid-cols-3 gap-4 px-5 py-3 border-b border-line bg-white shrink-0">
        {/* 근속 */}
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-sm bg-brand-deep" />
            <Clock size={10} className="text-brand-deep" />근속
          </span>
          <span className="text-[16px] font-bold text-brand-deep tabular-nums leading-tight">
            {tenure === "-" ? <span className="text-zinc-300 italic font-normal text-[14px]">미등록</span> : tenure}
            {displayEmp.hire_date && (
              <span className="text-[12px] text-zinc-400 font-semibold ml-1">· {displayEmp.hire_date}</span>
            )}
          </span>
        </div>
        {/* 연차 */}
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-sm bg-sky-500" />
            <CalendarDays size={10} className="text-sky-500" />연차
          </span>
          <span className="text-[16px] font-bold text-sky-700 tabular-nums leading-tight">
            {fmtD(remainDays)}<span className="text-[12px] font-semibold text-zinc-400 ml-0.5">/ {fmtD(totalDays)}일</span>
            {editing && (
              <input
                type="number" min={0} max={30} step={1}
                value={draft?.annual_leave_days ?? ""}
                onChange={(e) => setField("annual_leave_days", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="15"
                className="w-12 h-5 px-1 ml-2 rounded border border-sky-300 bg-sky-50/40 text-[12px] font-bold text-sky-700 text-right tabular-nums focus:outline-none focus:border-sky-500"
                aria-label="총 연차 편집"
              />
            )}
          </span>
          <div className="h-1 bg-zinc-100 rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 shadow-[0_0_8px_rgba(2,132,199,.4)] transition-all"
              style={{ width: totalDays > 0 ? `${Math.min(100, (usedDays / totalDays) * 100)}%` : "0%" }}
            />
          </div>
        </div>
        {/* 평가 */}
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500" />
            <Star size={10} className="text-emerald-500" />평가
          </span>
          <span className="inline-flex items-center gap-1.5 leading-tight flex-wrap">
            {rating ? (
              <Badge
                className={performanceRatingColor(rating)}
                size="sm"
                title={isSeveranceEligible(displayEmp) ? "퇴직금 지급 대상 (근속 1년 이상)" : undefined}
              >
                {rating}
              </Badge>
            ) : (
              <span
                className="text-zinc-300 italic text-[14px]"
                title={isSeveranceEligible(displayEmp) ? "퇴직금 지급 대상 (근속 1년 이상)" : undefined}
              >
                미평가
              </span>
            )}
          </span>
        </div>
      </div>

      {/* ── 탭 바 · L2 Attio segmented pill ── */}
      <TabBar
        level={2}
        tabs={DETAIL_TABS}
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k as DetailTab)}
        maxWidth="100%"
        className="shrink-0"
      />

      {/* ── 탭 콘텐츠 · 세로 스크롤 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2 bg-zinc-50/30">

        {/* Overview 탭 · 근로조건 요약 + 연차 + 문서 링크 */}
        {activeTab === "overview" && (
          <>
            {/* 근로조건 요약 카드 */}
            <SectionCard title="근로조건 요약" icon={<CalendarDays size={11} />} group="work" defaultOpen>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-zinc-400 leading-none">주 소정근로시간</span>
                  <span className="text-[15px] font-semibold text-zinc-700 leading-snug">
                    {displayEmp.working_hours_per_week != null
                      ? `${displayEmp.working_hours_per_week}시간`
                      : <span className="text-zinc-300 italic">미등록</span>}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-zinc-400 leading-none">임금</span>
                  <span className="text-[15px] font-semibold text-zinc-700 leading-snug">
                    {displayEmp.wage_calc_type && displayEmp.wage_amount
                      ? `${({ hourly: "시급", daily: "일급", monthly: "월급", annual: "연봉" } as Record<string, string>)[displayEmp.wage_calc_type] ?? displayEmp.wage_calc_type} ${Number(displayEmp.wage_amount).toLocaleString()}원`
                      : <span className="text-zinc-300 italic">미등록</span>}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-zinc-400 leading-none">계약기간</span>
                  <span className="text-[15px] font-semibold text-zinc-700 leading-snug">
                    {latestContract?.start_date
                      ? `${latestContract.start_date} ~ ${latestContract.end_date ?? "무기한"}`
                      : displayEmp.contract_start
                        ? `${displayEmp.contract_start} ~ ${displayEmp.contract_end ?? "무기한"}`
                        : <span className="text-zinc-300 italic">미등록</span>}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-zinc-400 leading-none">유급 주휴일</span>
                  <span className="text-[15px] font-semibold text-zinc-700 leading-snug">
                    {displayEmp.weekly_holiday || <span className="text-zinc-300 italic">미등록</span>}
                  </span>
                </div>
              </div>
            </SectionCard>

            {/* 연차 progress 요약 */}
            <SectionCard title="연차 현황" icon={<CalendarDays size={11} />} group="work" defaultOpen>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-[22px] font-bold text-sky-700 tabular-nums">{fmtD(remainDays)}</span>
                  <span className="text-[14px] text-zinc-400 font-semibold">일 잔여</span>
                </div>
                <div className="text-[14px] text-zinc-400">/ 총 {fmtD(totalDays)}일 · 사용 {fmtD(usedDays)}일</div>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all"
                  style={{ width: totalDays > 0 ? `${Math.min(100, (usedDays / totalDays) * 100)}%` : "0%" }}
                />
              </div>
              <p className="text-[13px] text-zinc-400 mt-1.5">
                상세 이력은 <button type="button" onClick={() => setActiveTab("timeoff")} className="text-sky-600 underline cursor-pointer">Time Off 탭</button>에서 확인하세요
              </p>
            </SectionCard>

            {/* 문서 링크 */}
            <SectionCard title="첨부 서류" icon={<FileText size={11} />} group="work" defaultOpen>
              <div className="flex flex-wrap gap-2">
                {latestContract?.pdf_url && (
                  <button
                    type="button"
                    onClick={() => window.open(latestContract.pdf_url!, "_blank", "noopener,noreferrer")}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] rounded-md shadow-sm cursor-pointer transition-colors"
                  >
                    <FileText size={11} /> 근로계약서
                  </button>
                )}
                {displayEmp.resume_url && (
                  <button
                    type="button"
                    onClick={() => window.open(displayEmp.resume_url as string, "_blank", "noopener,noreferrer")}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-[15px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-md cursor-pointer transition-colors"
                  >
                    <Paperclip size={11} /> 이력서
                  </button>
                )}
                {displayEmp.contract_file_url && (
                  <button
                    type="button"
                    onClick={() => window.open(displayEmp.contract_file_url as string, "_blank", "noopener,noreferrer")}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-[15px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md cursor-pointer transition-colors"
                  >
                    <ExternalLink size={11} /> 계약서 URL
                  </button>
                )}
                {!latestContract?.pdf_url && !displayEmp.resume_url && !displayEmp.contract_file_url && (
                  <span className="text-[15px] text-zinc-300 italic">등록된 서류 없음 · Documents 탭에서 업로드</span>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {/* Personal 탭 · §1 인적사항 */}
        {activeTab === "personal" && (
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
        )}

        {/* Job & Wage 탭 · §7 근로조건·임금 + §9 4대보험 + §10 약국자격 + §11 메모 */}
        {activeTab === "job" && (
          <StaffConditionsSection
            displayEmp={displayEmp}
            editing={editing}
            draft={draft}
            latestContract={latestContract}
            latestContractLoading={latestContractLoading}
            setField={setField}
          />
        )}

        {/* Documents 탭 · §6 계약·서류 + §6-1 계약이력 */}
        {activeTab === "documents" && (
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
        )}

        {/* Time Off 탭 · §7-2 연차·유급휴가 */}
        {activeTab === "timeoff" && (
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
        )}

        <div className="h-2" />
      </div>
    </>
  );
};
