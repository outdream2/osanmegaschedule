// src/components/schedule-v2/views/employee/EmployeeInfoPanel.tsx
// 2026-10-12 · 사용자 지시 · 최신 HR SaaS 트렌드 · Flat Sections + Hover-reveal Inline Edit
//   · Rippling/Linear/Attio 패턴 · field hover 시 pencil icon · click → input 전환
//   · Enter 저장 · Esc 취소 · dirty tracking · footer sticky 저장/취소
//   · 섹션: Header → Quick Facts → 기본정보 → 연락처 → 계약 → 메모
//   · 수정 가능 (슬라이딩 윈도우에서 inline edit 지원)
//   · 2026-10-12 · 직군(position) · 계약유형(contract_type) → <select> 드롭다운 (settings 연동)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOut, PencilSimple, FloppyDisk, X as XIcon, Check } from "@phosphor-icons/react";
import type { Employee } from "../../../../types";
import { updateEmployee, type EmployeeUpdatePayload } from "../../../../lib/employeeApi";
import { useToast, toastClass } from "../../../../hooks/useToast";
import { useSettings } from "../../../../hooks/useSettings";
import { CONTRACT_TYPES } from "../../../StaffManagePage/types";

// HR 확장 필드 (Employee type 에 없는 nullable 확장)
type EmployeeExt = Employee & {
  contract_type?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  birth_date?: string | null;
};

interface Props {
  employee: Employee;
  onOpenManagement?: (employeeId: number) => void;
  /** 저장 완료 후 부모 리스트 갱신용 */
  onSaved?: (updated: Employee) => void;
}

type FieldKey =
  | "employee_number" | "position" | "rank" | "employmentType" | "workplace"
  | "phone" | "email" | "address"
  | "contract_type" | "contract_start" | "contract_end" | "birth_date" | "annual_leave_days"
  | "description";

type FormValue = string;
type Form = Record<FieldKey, FormValue>;

const toForm = (e: EmployeeExt): Form => ({
  employee_number: e.employee_number ?? "",
  position: e.position ?? "",
  rank: e.rank ?? "",
  employmentType: e.employmentType ?? "",
  workplace: e.workplace ?? "",
  phone: e.phone ?? "",
  email: e.email ?? "",
  address: e.address ?? "",
  contract_type: e.contract_type ?? "",
  contract_start: e.contract_start ?? "",
  contract_end: e.contract_end ?? "",
  birth_date: e.birth_date ?? "",
  annual_leave_days: e.annual_leave_days != null ? String(e.annual_leave_days) : "",
  description: e.description ?? "",
});

const monthsBetween = (fromYmd: string, toYmd: string): number => {
  if (!fromYmd) return 0;
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  if (!fy || !ty) return 0;
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
};
const daysBetween = (ymdA: string, ymdB: string): number => {
  const a = new Date(ymdA + "T00:00:00").getTime();
  const b = new Date(ymdB + "T00:00:00").getTime();
  return Math.round((a - b) / 86400000);
};
const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const EmployeeInfoPanel: React.FC<Props> = ({ employee, onOpenManagement, onSaved }) => {
  const emp = employee as EmployeeExt;
  const { toast, showSuccess, showError } = useToast();
  const { settings } = useSettings();
  // 직군 목록 · settings 에서 가져옴 (없으면 기본 목록)
  const positionOptions = useMemo(
    () => settings?.positions?.length ? settings.positions : ["약사", "매장", "창고", "캐셔", "물류", "알바", "기타"],
    [settings],
  );
  // 계약유형 목록 · CONTRACT_TYPES 상수 (StaffManagePage/types.ts)
  const contractTypeOptions = useMemo(
    () => CONTRACT_TYPES.map(c => ({ value: c.value, label: c.label })),
    [],
  );
  const initialRef = useRef<Form>(toForm(emp));
  const [form, setForm] = useState<Form>(initialRef.current);
  const [editingField, setEditingField] = useState<FieldKey | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // 다른 직원 선택되면 reset
  useEffect(() => {
    const fresh = toForm(emp);
    initialRef.current = fresh;
    setForm(fresh);
    setEditingField(null);
    setDraft("");
  }, [emp.id]);

  const dirty = useMemo(() => {
    const init = initialRef.current;
    return (Object.keys(form) as FieldKey[]).some(k => form[k] !== init[k]);
  }, [form]);

  const openEdit = useCallback((k: FieldKey) => {
    setEditingField(k);
    setDraft(form[k]);
  }, [form]);

  // 2026-10-12 · fix · select onChange → draft 비동기 setState → onCommit 시 stale closure 로
  //   draft 가 빈 값인 상태에서 commit → form 미반영 (사용자 "직원상세 수정안돼")
  //   → valueOverride 받아 즉시 반영 (select 는 override · input blur 는 draft 그대로)
  const commitDraft = useCallback((valueOverride?: string) => {
    if (!editingField) return;
    const next = valueOverride !== undefined ? valueOverride : draft;
    setForm(prev => ({ ...prev, [editingField]: next }));
    setEditingField(null);
    setDraft("");
  }, [editingField, draft]);

  const cancelDraft = useCallback(() => {
    setEditingField(null);
    setDraft("");
  }, []);

  const handleKeyDown = useCallback((ev: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (ev.key === "Enter" && !(ev.target instanceof HTMLTextAreaElement && ev.shiftKey)) {
      ev.preventDefault();
      commitDraft();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      cancelDraft();
    }
  }, [commitDraft, cancelDraft]);

  const handleSave = async () => {
    const annual = form.annual_leave_days.trim();
    const annualNum = annual === "" ? null : Number(annual);
    if (annualNum != null && !Number.isFinite(annualNum)) {
      showError("연차 일수가 올바른 숫자가 아닙니다.");
      return;
    }
    const patch: EmployeeUpdatePayload = {
      position: form.position.trim(),
      rank: form.rank.trim() === "" ? null : form.rank.trim(),
      employmentType: form.employmentType.trim(),
      workplace: form.workplace.trim(),
      employee_number: form.employee_number.trim() === "" ? null : form.employee_number.trim(),
      phone: form.phone.trim() === "" ? null : form.phone.trim(),
      email: form.email.trim() === "" ? null : form.email.trim(),
      address: form.address.trim() === "" ? null : form.address.trim(),
      contract_type: form.contract_type.trim() === "" ? null : form.contract_type.trim(),
      contract_start: form.contract_start.trim() === "" ? null : form.contract_start.trim(),
      contract_end: form.contract_end.trim() === "" ? null : form.contract_end.trim(),
      birth_date: form.birth_date.trim() === "" ? null : form.birth_date.trim(),
      annual_leave_days: annualNum,
      description: form.description,
    };
    setSaving(true);
    try {
      const updated = await updateEmployee(emp as Employee, patch);
      showSuccess("저장되었습니다.");
      initialRef.current = toForm(updated as EmployeeExt);
      onSaved?.(updated);
    } catch (err) {
      console.error("[EmployeeInfoPanel] save failed", err);
      showError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(initialRef.current);
    setEditingField(null);
    setDraft("");
  };

  // Quick facts 계산
  const today = todayYmd();
  const tenureMonths = monthsBetween(form.contract_start || emp.hireDate || "", today);
  const tenureFull = monthsBetween(emp.hireDate || "", today);
  const tenureLabel = `${Math.floor(tenureFull / 12)}년 ${tenureFull % 12}개월`;
  const isContract = form.employmentType.includes("계약");
  const contractEnd = form.contract_end;
  const contractDday = isContract && contractEnd ? daysBetween(contractEnd, today) : null;

  const statusTone = emp.retireDate
    ? "bg-rose-50 text-rose-600 border-rose-100"
    : "bg-emerald-50 text-emerald-700 border-emerald-100";
  const statusLabel = emp.retireDate ? `퇴사 (${emp.retireDate})` : "재직";

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* ── Sticky Header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h2 className="text-[18px] md:text-[20px] font-bold text-ink tracking-tight truncate">{emp.name}</h2>
          <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[11px] font-semibold shrink-0 ${statusTone}`}>{statusLabel}</span>
          {form.position && (
            <span className="inline-flex items-center h-5 px-1.5 rounded border bg-slate-50 text-slate-700 border-slate-200 text-[11px] font-medium shrink-0">
              {form.position}
            </span>
          )}
          {form.rank && (
            <span className="text-[12.5px] text-slate-500 font-medium shrink-0">· {form.rank}</span>
          )}
        </div>
        {onOpenManagement && (
          <button
            type="button"
            onClick={() => onOpenManagement(emp.id)}
            className="inline-flex items-center gap-1 h-7 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[12px] font-medium text-slate-600 shrink-0"
            title="직원관리 페이지에서 전체 정보 수정"
          >
            <ArrowSquareOut size={11} weight="bold" /> 전체
          </button>
        )}
      </header>

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Quick facts bar · 근속 · 입사일 · 계약 D-day */}
        <div className="grid grid-cols-3 gap-0 border-b border-slate-100 bg-slate-50/50">
          <QuickFact label="근속" value={tenureLabel} />
          <QuickFact label="입사일" value={emp.hireDate ?? "—"} />
          <QuickFact
            label={isContract ? "계약 만료" : "고용형태"}
            value={
              isContract && contractDday != null
                ? (contractDday < 0 ? `${-contractDday}일 경과` : contractDday === 0 ? "오늘" : `D-${contractDday}`)
                : (form.employmentType || "—")
            }
            tone={isContract && contractDday != null ? (contractDday <= 30 ? "rose" : contractDday <= 90 ? "amber" : "emerald") : "neutral"}
          />
        </div>

        {/* 섹션 · 기본 정보 */}
        <Section title="기본 정보">
          <InlineRow label="사번" fieldKey="employee_number" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            placeholder="예: EMP-001" />
          <InlineRow label="직군" fieldKey="position" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            options={positionOptions.map(p => ({ value: p, label: p }))} placeholder="직군 선택" />
          <InlineRow label="직급" fieldKey="rank" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            placeholder="예: 과장" />
          <InlineRow label="고용형태" fieldKey="employmentType" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            placeholder="정규직·계약직·알바" />
          <InlineRow label="근무지" fieldKey="workplace" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            placeholder="매장·창고" />
          <InlineRow label="생년월일" fieldKey="birth_date" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            type="date" />
        </Section>

        {/* 섹션 · 연락처 */}
        <Section title="연락처">
          <InlineRow label="전화번호" fieldKey="phone" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            placeholder="010-0000-0000" inputMode="tel" />
          <InlineRow label="이메일" fieldKey="email" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            placeholder="name@example.com" inputMode="email" />
          <InlineRow label="주소" fieldKey="address" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown} />
        </Section>

        {/* 섹션 · 계약 */}
        <Section title="계약">
          <InlineRow label="계약 유형" fieldKey="contract_type" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            options={contractTypeOptions} placeholder="계약유형 선택" />
          <InlineRow label="계약 시작" fieldKey="contract_start" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            type="date" />
          <InlineRow label="계약 종료" fieldKey="contract_end" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            type="date" />
          <InlineRow label="휴가 일수" fieldKey="annual_leave_days" form={form} editingField={editingField} draft={draft}
            onEdit={openEdit} onDraftChange={setDraft} onCommit={commitDraft} onCancel={cancelDraft} onKeyDown={handleKeyDown}
            inputMode="numeric" suffix="일" />
        </Section>

        {/* 섹션 · 메모 */}
        <Section title="메모">
          <TextareaRow
            value={form.description}
            editing={editingField === "description"}
            draft={draft}
            onEdit={() => openEdit("description")}
            onDraftChange={setDraft}
            onCommit={commitDraft}
            onCancel={cancelDraft}
            onKeyDown={handleKeyDown}
          />
        </Section>
      </div>

      {/* ── Sticky Footer · 저장/취소 (dirty 시 활성) ───────────── */}
      <footer className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-[12.5px] font-medium ${dirty ? "text-amber-700" : "text-slate-400"}`}>
            {dirty ? "저장되지 않은 변경사항" : "변경 없음"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={!dirty || saving}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[13px] md:text-[14px] font-medium text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[13px] md:text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <FloppyDisk size={14} weight="bold" />
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </footer>
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Section · 섹션 그룹 (title + divider)
// ─────────────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="px-5 py-3 border-b border-slate-100 last:border-b-0">
    <div className="flex items-center gap-1.5 mb-2">
      <span className="w-[3px] h-[12px] bg-slate-300 rounded-full shrink-0" aria-hidden />
      <h3 className="text-[12.5px] md:text-[13px] font-semibold text-slate-500 tracking-tight uppercase">{title}</h3>
    </div>
    <div className="flex flex-col">{children}</div>
  </section>
);

// ─────────────────────────────────────────────────────────────────
// QuickFact · 상단 3-mini KPI
// ─────────────────────────────────────────────────────────────────
const QuickFact: React.FC<{ label: string; value: string; tone?: "rose" | "amber" | "emerald" | "neutral" }> = ({ label, value, tone = "neutral" }) => {
  const toneCls =
    tone === "rose" ? "text-rose-600" :
    tone === "amber" ? "text-amber-700" :
    tone === "emerald" ? "text-emerald-700" :
    "text-ink";
  return (
    <div className="px-4 py-3 flex flex-col gap-0.5 border-r border-slate-100 last:border-r-0">
      <span className="text-[11px] text-slate-500 font-medium">{label}</span>
      <span className={`text-[14px] md:text-[15px] font-bold tabular-nums tracking-tight ${toneCls}`}>{value}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// InlineRow · field hover reveal pencil · click → input · Enter/Esc
// ─────────────────────────────────────────────────────────────────
interface SelectOption { value: string; label: string }

interface InlineRowProps {
  label: string;
  fieldKey: FieldKey;
  form: Form;
  editingField: FieldKey | null;
  draft: string;
  onEdit: (k: FieldKey) => void;
  onDraftChange: (v: string) => void;
  onCommit: (valueOverride?: string) => void;
  onCancel: () => void;
  onKeyDown: (ev: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  type?: "text" | "date";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  suffix?: string;
  /** 선택지가 있으면 <select> 드롭다운으로 전환 */
  options?: SelectOption[];
}

const InlineRow: React.FC<InlineRowProps> = ({
  label, fieldKey, form, editingField, draft,
  onEdit, onDraftChange, onCommit, onCancel, onKeyDown,
  type = "text", inputMode, placeholder, suffix, options,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const isEditing = editingField === fieldKey;
  const value = form[fieldKey];

  useEffect(() => {
    if (!isEditing) return;
    if (options) selectRef.current?.focus();
    else inputRef.current?.focus();
  }, [isEditing, options]);

  // display label: if options, resolve value → label
  const displayValue = options
    ? (options.find(o => o.value === value)?.label ?? value)
    : value;

  return (
    <div className="group flex items-center justify-between gap-3 py-1.5 min-h-[32px]">
      <span className="text-[12.5px] md:text-[13px] text-slate-500 font-medium shrink-0 w-[90px]">{label}</span>
      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 justify-end">
          {options ? (
            <select
              ref={selectRef}
              value={draft}
              onChange={e => { const v = e.target.value; onDraftChange(v); onCommit(v); }}
              onKeyDown={onKeyDown}
              onBlur={() => onCommit()}
              className="w-full max-w-[260px] h-7 px-2 text-[13px] md:text-[14px] text-ink border border-brand-deep rounded-md focus:outline-none focus:ring-2 focus:ring-brand-tint bg-white"
            >
              <option value="">{placeholder ?? "선택"}</option>
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef}
              type={type}
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => onCommit()}
              inputMode={inputMode}
              placeholder={placeholder}
              className="w-full max-w-[260px] h-7 px-2 text-[13px] md:text-[14px] text-ink border border-brand-deep rounded-md focus:outline-none focus:ring-2 focus:ring-brand-tint tabular-nums"
            />
          )}
          {suffix && <span className="text-[12.5px] text-slate-500 shrink-0">{suffix}</span>}
          {!options && (
            <>
              <button type="button" onMouseDown={e => { e.preventDefault(); onCommit(); }} className="h-6 w-6 rounded hover:bg-emerald-50 text-emerald-600 flex items-center justify-center" aria-label="저장"><Check size={13} weight="bold" /></button>
              <button type="button" onMouseDown={e => { e.preventDefault(); onCancel(); }} className="h-6 w-6 rounded hover:bg-rose-50 text-slate-400 flex items-center justify-center" aria-label="취소"><XIcon size={12} weight="bold" /></button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onEdit(fieldKey)}
          className="group/btn flex items-center gap-1.5 flex-1 justify-end px-1.5 py-0.5 rounded hover:bg-slate-50 transition-colors cursor-pointer"
          title="클릭하여 수정"
        >
          <span className={`text-[13px] md:text-[14px] tabular-nums text-right ${displayValue ? "text-ink" : "text-slate-400 italic"}`}>
            {displayValue ? (suffix ? `${displayValue}${suffix}` : displayValue) : (placeholder || "—")}
          </span>
          <PencilSimple size={11} weight="bold" className="text-slate-400 opacity-60 group-hover/btn:opacity-100 shrink-0 transition-opacity" />
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// TextareaRow · 메모 전용 (multi-line)
// ─────────────────────────────────────────────────────────────────
interface TextareaRowProps {
  value: string;
  editing: boolean;
  draft: string;
  onEdit: () => void;
  onDraftChange: (v: string) => void;
  onCommit: (valueOverride?: string) => void;
  onCancel: () => void;
  onKeyDown: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const TextareaRow: React.FC<TextareaRowProps> = ({ value, editing, draft, onEdit, onDraftChange, onCommit, onCancel, onKeyDown }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  return editing ? (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        value={draft}
        onChange={e => onDraftChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={4}
        className="w-full px-2.5 py-2 text-[13px] md:text-[14px] text-ink border border-brand-deep rounded-md focus:outline-none focus:ring-2 focus:ring-brand-tint resize-none"
        placeholder="메모 입력 (Shift+Enter 줄바꿈)"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-7 px-2.5 rounded text-[12.5px] text-slate-500 hover:bg-slate-50">취소</button>
        <button type="button" onClick={() => onCommit()} className="h-7 px-3 rounded text-[12.5px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"><Check size={12} weight="bold" />확인</button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={onEdit}
      className="group/btn text-left px-2 py-1.5 rounded hover:bg-slate-50 transition-colors cursor-pointer min-h-[48px]"
      title="클릭하여 수정"
    >
      <div className="flex items-start gap-1.5">
        <p className={`flex-1 text-[13px] md:text-[14px] whitespace-pre-wrap break-words ${value ? "text-ink" : "text-slate-400 italic"}`}>
          {value || "메모 입력..."}
        </p>
        <PencilSimple size={11} weight="bold" className="text-slate-400 opacity-60 group-hover/btn:opacity-100 shrink-0 mt-0.5 transition-opacity" />
      </div>
    </button>
  );
};

export default EmployeeInfoPanel;
