// src/components/StaffManagePage/StaffConditionsSection.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리
//   §7 근로조건·임금 + §9 4대보험 + §10 약국자격 + §11 메모
import React from "react";
import {
  Award, Briefcase, Calendar, ClipboardList, ExternalLink,
} from "lucide-react";
import { SectionCard, InlineField } from "./StaffManagePage.subcomponents";
import type { Employee, EditDraft } from "./types";

interface LatestContract {
  id?: number;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  pdf_url?: string | null;
}

interface StaffConditionsSectionProps {
  displayEmp: Employee;
  editing: boolean;
  draft: EditDraft | null;
  latestContract: LatestContract | null;
  latestContractLoading: boolean;
  setField: <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => void;
}

export const StaffConditionsSection: React.FC<StaffConditionsSectionProps> = ({
  displayEmp, editing, draft,
  latestContract, latestContractLoading,
  setField,
}) => (
  <>
    {/* §7 근로조건 · 임금 (근로계약서 기반) */}
    <SectionCard title="근로조건 · 임금 (근로계약서 기반)" icon={<Calendar size={11} />} group="work" defaultOpen>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <InlineField
          label="주 소정근로시간"
          value={editing ? String(draft?.working_hours_per_week ?? "") : String(displayEmp.working_hours_per_week ?? "")}
          editing={editing} type="number" placeholder="40"
          onChange={(v) => setField("working_hours_per_week", v === "" ? null : Number(v))}
        />

        {/* 휴게시간 */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 leading-none">휴게시간 (차감)</span>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <label className="inline-flex items-center gap-1 text-[14px] text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={draft?.break_apply_paid ?? true}
                  onChange={(e) => setField("break_apply_paid", e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-600"
                />
                적용
              </label>
              <select
                value={String(draft?.break_time_minutes ?? 60)}
                onChange={(e) => setField("break_time_minutes", Number(e.target.value))}
                disabled={(draft?.break_apply_paid ?? true) === false}
                className="h-7 text-[14px] px-2 border border-zinc-300 rounded-md bg-white disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                <option value="30">30분</option>
                <option value="60">1시간</option>
              </select>
            </div>
          ) : (
            <span className="text-[15px] font-semibold leading-snug min-h-[20px] text-zinc-700">
              {(displayEmp.break_apply_paid ?? true) === false
                ? <span className="text-zinc-400 italic">미적용</span>
                : `${displayEmp.break_time_minutes ?? 60}분 차감`}
            </span>
          )}
        </div>

        <InlineField
          label="유급 주휴일"
          value={editing ? (draft?.weekly_holiday ?? "") : (displayEmp.weekly_holiday ?? "")}
          editing={editing} placeholder="일요일"
          onChange={(v) => setField("weekly_holiday", v)}
        />
        <InlineField
          label="근무 장소"
          value={editing ? (draft?.work_location ?? "") : (displayEmp.work_location ?? "")}
          editing={editing} placeholder="오산 메가타운 약국" wide
          onChange={(v) => setField("work_location", v)}
        />
        <InlineField
          label="종사 업무"
          value={editing ? (draft?.job_duties ?? "") : (displayEmp.job_duties ?? "")}
          editing={editing} placeholder="조제보조·POS·진열" wide
          onChange={(v) => setField("job_duties", v)}
        />

        {/* 임금 구분선 */}
        <div className="col-span-2 flex items-center gap-2 mt-1.5 pt-2 border-t border-zinc-100 flex-wrap">
          <Briefcase size={11} className="text-rose-400" />
          <span className="text-[14px] font-bold uppercase tracking-wider text-zinc-500">임금</span>
          {latestContract && (
            <>
              <span className="text-[14px] text-emerald-700 font-bold">
                근로계약서 연동 · {latestContract.start_date ?? "-"} ~ {latestContract.end_date ?? "무기한"}
                {latestContract.contract_type && <span className="text-zinc-500 ml-1">· {latestContract.contract_type}</span>}
              </span>
              {latestContract.pdf_url && (
                <button
                  type="button"
                  onClick={() => window.open(latestContract.pdf_url!, "_blank", "noopener,noreferrer")}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[15px] font-bold transition cursor-pointer"
                  title="근로계약서 PDF 열기"
                >
                  <ExternalLink size={10} /> 근로계약서 보기
                </button>
              )}
            </>
          )}
          {!latestContract && !latestContractLoading && (
            <span className="text-[14px] text-zinc-400 italic">근로계약서 없음 (계약서 작성 시 자동 연동)</span>
          )}
        </div>

        {/* 임금 유형 */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 leading-none">임금 유형</span>
          {editing ? (
            <select
              value={draft?.wage_calc_type ?? ""}
              onChange={(e) => setField("wage_calc_type", e.target.value || null)}
              className="border border-indigo-300 rounded-md px-2 text-[15px] focus:outline-none focus:border-brand-deep bg-indigo-50/40 h-7"
            >
              <option value="">선택 안 함</option>
              <option value="hourly">시급</option>
              <option value="daily">일급</option>
              <option value="monthly">월급</option>
              <option value="annual">연봉</option>
            </select>
          ) : (
            <span className="text-[15px] font-semibold leading-snug min-h-[20px] text-zinc-700">
              {({ hourly: "시급", daily: "일급", monthly: "월급", annual: "연봉" } as Record<string, string>)[displayEmp.wage_calc_type ?? ""]
                ?? <span className="text-zinc-300 italic">(미지정)</span>}
            </span>
          )}
        </div>

        <InlineField
          label="임금액 (원)"
          value={editing ? String(draft?.wage_amount ?? "") : String(displayEmp.wage_amount ?? "")}
          editing={editing} type="number" placeholder="10030" monospace
          onChange={(v) => setField("wage_amount", v === "" ? null : Number(v))}
        />
        <InlineField
          label="지급일"
          value={editing ? (draft?.wage_pay_day ?? "") : (displayEmp.wage_pay_day ?? "")}
          editing={editing} placeholder="매월 10일"
          onChange={(v) => setField("wage_pay_day", v)}
        />
        <InlineField
          label="지급 방법"
          value={editing ? (draft?.wage_pay_method ?? "") : (displayEmp.wage_pay_method ?? "")}
          editing={editing} placeholder="계좌이체"
          onChange={(v) => setField("wage_pay_method", v)}
        />
        <InlineField
          label="은행"
          value={editing ? (draft?.bank_name ?? "") : (displayEmp.bank_name ?? "")}
          editing={editing} placeholder="국민은행"
          onChange={(v) => setField("bank_name", v)}
        />
        <InlineField
          label="계좌번호"
          value={editing ? (draft?.bank_account_no ?? "") : (displayEmp.bank_account_no ?? "")}
          editing={editing} placeholder="123-45-6789012" monospace
          onChange={(v) => setField("bank_account_no", v)}
        />
      </div>
    </SectionCard>

    {/* §9 4대보험 */}
    <SectionCard title="4대보험" icon={<ClipboardList size={11} />} group="wage" defaultOpen={false}>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {(
          [
            { label: "국민연금", field: "insurance_nps_date"  as keyof EditDraft },
            { label: "건강보험", field: "insurance_nhis_date" as keyof EditDraft },
            { label: "고용보험", field: "insurance_ei_date"   as keyof EditDraft },
            { label: "산재보험", field: "insurance_wcia_date" as keyof EditDraft },
          ] as { label: string; field: keyof EditDraft }[]
        ).map(({ label, field }) => (
          <div key={field} className="flex flex-col gap-0.5 min-w-[110px] flex-1">
            <span className="text-[14px] font-semibold text-zinc-400 leading-none">{label}</span>
            {editing ? (
              <input
                type="date"
                value={(draft?.[field] as string | null | undefined) ?? ""}
                onChange={(e) => setField(field, e.target.value as any)}
                className="h-7 px-1.5 border border-indigo-300 rounded-md text-[14px] tabular-nums focus:outline-none focus:border-brand-deep bg-indigo-50/40"
              />
            ) : (
              <span className={`text-[14px] font-semibold leading-snug min-h-[20px] tabular-nums ${(displayEmp[field] as string | null | undefined) ? "text-zinc-700" : "text-zinc-300 italic"}`}>
                {(displayEmp[field] as string | null | undefined) || "미가입"}
              </span>
            )}
          </div>
        ))}
        {editing ? (
          <label className="flex items-center gap-1.5 text-[15px] font-semibold text-zinc-700 cursor-pointer shrink-0 h-7 self-end">
            <input
              type="checkbox"
              checked={!!draft?.insurance_excluded}
              onChange={(e) => setField("insurance_excluded", e.target.checked)}
              className="w-3.5 h-3.5 rounded"
            />
            제외 대상
          </label>
        ) : displayEmp.insurance_excluded ? (
          <span className="text-[14px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md self-end">제외 대상</span>
        ) : null}
      </div>
    </SectionCard>

    {/* §10 약국 특수 자격 */}
    <SectionCard title="약국 특수 자격" icon={<Award size={11} />} group="career" defaultOpen={false}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <InlineField
          label="약사 면허번호"
          value={editing ? (draft?.pharmacist_license_no ?? "") : (displayEmp.pharmacist_license_no ?? "")}
          editing={editing} placeholder="약사 면허번호" monospace
          onChange={(v) => setField("pharmacist_license_no", v)}
        />
        <InlineField
          label="보건증 만료일"
          value={editing ? (draft?.health_check_expiry ?? "") : (displayEmp.health_check_expiry ?? "")}
          editing={editing} icon={<Calendar size={9} />} type="date"
          onChange={(v) => setField("health_check_expiry", v)}
        />
      </div>
    </SectionCard>

    {/* §11 메모 */}
    <SectionCard title="메모" icon={<ClipboardList size={11} />} group="personal" defaultOpen={false}>
      {editing ? (
        <textarea
          value={draft?.memo ?? ""}
          onChange={(e) => setField("memo", e.target.value)}
          placeholder="근무 특이사항 · 알러지 · 기타 참고 사항"
          rows={3}
          className="w-full border border-indigo-300 rounded-md px-2.5 py-2 text-[14px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint bg-indigo-50/40 resize-none"
        />
      ) : (
        <p className={`text-[14px] whitespace-pre-wrap ${displayEmp.memo ? "text-zinc-700" : "text-zinc-300 italic"}`}>
          {displayEmp.memo || "(없음)"}
        </p>
      )}
    </SectionCard>
  </>
);
