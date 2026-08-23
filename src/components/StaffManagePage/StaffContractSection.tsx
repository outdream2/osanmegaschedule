// src/components/StaffManagePage/StaffContractSection.tsx
// 2026-08-23 · Framework Phase 4 · StaffManagePage 분리
//   §6 계약·서류 + §6-1 계약 이력
import React from "react";
import {
  Briefcase, Calendar, Clock, ExternalLink, FileText, Paperclip, Star, Trash2,
  PenSquare as NotePencilIcon,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { SectionCard, InlineField } from "./StaffManagePage.subcomponents";
import type { Employee, EditDraft } from "./types";
import { CONTRACT_TYPES, PERFORMANCE_RATINGS } from "./types";
import { contractTypeMeta, autoContractBadge, calcTenure, performanceRatingColor } from "./helpers";

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

interface StaffContractSectionProps {
  displayEmp: Employee;
  editing: boolean;
  draft: EditDraft | null;
  selectedEmp: Employee | null;
  latestContract: LatestContract | null;
  latestContractLoading: boolean;
  contractHistory: ContractHistoryItem[];
  contractHistoryLoading: boolean;
  contractHistoryError: string | null;
  contractCountByEmp: Map<number, number>;
  setField: <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => void;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
  uploadResume: (empId: number, file: File) => Promise<{ url: string }>;
  deleteResume: (empId: number) => Promise<void>;
}

export const StaffContractSection: React.FC<StaffContractSectionProps> = ({
  displayEmp, editing, draft, selectedEmp,
  latestContract, latestContractLoading,
  contractHistory, contractHistoryLoading, contractHistoryError,
  contractCountByEmp,
  setField, showError, showSuccess, confirm,
  uploadResume, deleteResume,
}) => (
  <>
    {/* §6 계약 · 서류 */}
    <SectionCard title="계약 · 서류" icon={<FileText size={11} />} group="work" defaultOpen>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {/* 계약유형 */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
            <Briefcase size={9} /> 계약유형
          </span>
          {editing ? (
            <select
              value={draft?.contract_type ?? ""}
              onChange={(e) => setField("contract_type", e.target.value || null)}
              className="border border-indigo-300 rounded-md px-2 text-[15px] bg-indigo-50/40 focus:outline-none focus:border-brand-deep h-7"
            >
              <option value="">선택 안 함</option>
              {CONTRACT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          ) : (() => {
            const badge = autoContractBadge(latestContract, displayEmp.contract_type);
            const manualMeta = contractTypeMeta(displayEmp.contract_type);
            const showAutoOnly = badge?.source === "auto";
            return (
              <div className="flex flex-wrap items-center gap-1 min-h-[20px]">
                {badge ? (
                  <span
                    className={`text-[15px] font-semibold px-2 py-0.5 rounded-md border ${badge.color}`}
                    title={showAutoOnly
                      ? `계약서 자동 산출 · ${latestContract?.start_date ?? "-"} ~ ${latestContract?.end_date ?? "-"}`
                      : "계약유형"}
                  >
                    {badge.label}
                    {showAutoOnly && <span className="ml-1 text-[15px] font-bold opacity-70">AUTO</span>}
                  </span>
                ) : (
                  <span className="text-[15px] font-semibold text-zinc-300 italic">(없음)</span>
                )}
                {showAutoOnly && manualMeta && (
                  <span className={`text-[14px] font-semibold px-1.5 py-0.5 rounded border ${manualMeta.color} opacity-70`} title="수동 지정 계약유형">
                    {manualMeta.short}
                  </span>
                )}
                {latestContractLoading && <span className="text-[14px] text-zinc-300">불러오는 중...</span>}
              </div>
            );
          })()}
        </div>

        {/* 근속기간 */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
            <Clock size={9} /> 근속기간
          </span>
          <span className={`text-[15px] font-semibold leading-snug min-h-[20px] ${displayEmp.hire_date ? "text-zinc-700" : "text-zinc-300 italic"}`}>
            {displayEmp.hire_date ? calcTenure(displayEmp.hire_date) : "(입사일 미등록)"}
            {displayEmp.hire_date && (
              <span className="text-[14px] font-normal text-zinc-400 ml-1">· {displayEmp.hire_date}</span>
            )}
          </span>
        </div>

        <InlineField
          label="계약 시작일" value={editing ? (draft?.contract_start ?? "") : (displayEmp.contract_start ?? "")}
          editing={editing} icon={<Calendar size={9} />} type="date"
          onChange={(v) => setField("contract_start", v)}
        />
        <InlineField
          label="계약 종료일" value={editing ? (draft?.contract_end ?? "") : (displayEmp.contract_end ?? "")}
          editing={editing} icon={<Calendar size={9} />} type="date"
          onChange={(v) => setField("contract_end", v)}
        />
        <InlineField
          label="급여" value={editing ? (draft?.salary ?? "") : (displayEmp.salary ?? "")}
          editing={editing} placeholder="예: 시급 10,030원"
          onChange={(v) => setField("salary", v)} wide
        />

        {/* 인사평가 */}
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
            <Star size={9} /> 인사평가
          </span>
          {editing ? (
            <select
              value={draft?.performance_rating ?? ""}
              onChange={(e) => setField("performance_rating", e.target.value || null)}
              className="border border-indigo-300 rounded-md px-2 text-[15px] bg-indigo-50/40 focus:outline-none focus:border-brand-deep max-w-[200px] h-7"
            >
              <option value="">평가 없음</option>
              {PERFORMANCE_RATINGS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          ) : displayEmp.performance_rating ? (
            <span className="inline-flex items-center gap-1.5 leading-snug min-h-[20px]">
              <span className={`text-[15px] font-bold px-2 py-0.5 rounded-md border ${performanceRatingColor(displayEmp.performance_rating)}`}>
                {String(displayEmp.performance_rating).toUpperCase()}
              </span>
              <span className="text-[15px] text-zinc-500">
                {PERFORMANCE_RATINGS.find((r) => r.value === String(displayEmp.performance_rating).toUpperCase())?.label ?? ""}
              </span>
            </span>
          ) : (
            <span className="text-[15px] font-semibold text-zinc-300 italic leading-snug min-h-[20px]">(미평가)</span>
          )}
        </div>

        {/* 인사 코멘트 */}
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
            <NotePencilIcon size={9} /> 인사 코멘트
          </span>
          {editing ? (
            <textarea
              value={String(draft?.memo ?? "")}
              onChange={(e) => setField("memo", e.target.value)}
              placeholder="근무 특이사항 · 평가 코멘트 · 알러지 등 (선택)"
              rows={2}
              className="border border-indigo-300 rounded-md px-2 py-1 text-[14px] bg-indigo-50/40 focus:outline-none focus:border-brand-deep resize-none"
            />
          ) : displayEmp.memo ? (
            <p className="text-[14px] text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50/70 border border-line rounded-md px-2 py-1 min-h-[24px]">
              {displayEmp.memo}
            </p>
          ) : (
            <span className="text-[15px] font-semibold text-zinc-300 italic leading-snug min-h-[20px]">(코멘트 없음)</span>
          )}
        </div>

        {/* 이력서 */}
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
            <Paperclip size={9} /> 이력서
          </span>
          <div className="flex items-center gap-2 py-1">
            {displayEmp.resume_url ? (
              <>
                <button
                  type="button"
                  onClick={() => window.open(displayEmp.resume_url as string, "_blank", "noopener,noreferrer")}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-md shadow-sm cursor-pointer transition-colors"
                >
                  <ExternalLink size={11} /> 이력서 보기
                </button>
                {editing && (
                  <>
                    <label className="inline-flex items-center gap-1 h-7 px-2 text-[15px] font-semibold text-zinc-600 bg-white border border-zinc-300 rounded-md hover:bg-zinc-50 cursor-pointer">
                      <Paperclip size={10} /> 교체
                      <input
                        type="file" accept=".pdf,.doc,.docx,.hwp,image/*" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedEmp) return;
                          try {
                            const { url } = await uploadResume(selectedEmp.id, file);
                            setField("resume_url", url);
                            showSuccess(`업로드 완료: ${file.name}`);
                          } catch (err: any) { showError(`업로드 실패: ${err.message}`); }
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedEmp) return;
                        if (!await confirm({ message: "이력서를 삭제하시겠습니까?", danger: true })) return;
                        try {
                          await deleteResume(selectedEmp.id);
                          setField("resume_url", "");
                        } catch (err: any) { showError(`삭제 실패: ${err.message}`); }
                      }}
                      className="inline-flex items-center gap-1 h-7 px-2 text-[15px] font-semibold text-rose-600 bg-white border border-rose-200 rounded-md hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
              </>
            ) : editing ? (
              <label className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[15px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer">
                <Paperclip size={11} /> 이력서 업로드 (PDF·DOC·이미지 · 10MB)
                <input
                  type="file" accept=".pdf,.doc,.docx,.hwp,image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !selectedEmp) return;
                    try {
                      const { url } = await uploadResume(selectedEmp.id, file);
                      setField("resume_url", url);
                      showSuccess(`업로드 완료: ${file.name}`);
                    } catch (err: any) { showError(`업로드 실패: ${err.message}`); }
                  }}
                />
              </label>
            ) : (
              <span className="text-[15px] font-semibold text-zinc-400 italic">이력서 없음</span>
            )}
          </div>
        </div>

        {/* 근로계약서 */}
        <div className="col-span-2 flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none">
            <FileText size={9} /> 근로계약서
          </span>
          {editing ? (
            <input
              type="url"
              value={draft?.contract_file_url ?? ""}
              onChange={(e) => setField("contract_file_url", e.target.value)}
              placeholder="계약서 URL 입력 (https://...)"
              className="border border-indigo-300 rounded-md px-2.5 py-1 text-[14px] focus:outline-none focus:border-brand-deep bg-indigo-50/40"
            />
          ) : (
            <div className="flex items-center gap-2 py-1">
              {displayEmp.contract_file_url ? (
                <>
                  <button
                    type="button"
                    onClick={() => window.open(displayEmp.contract_file_url as string, "_blank", "noopener,noreferrer")}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[15px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-md shadow-sm cursor-pointer transition-colors"
                  >
                    <ExternalLink size={11} /> 보기
                  </button>
                  <span className="text-[14px] text-zinc-400 truncate max-w-[280px]">
                    {displayEmp.contract_file_url}
                  </span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => showError("등록된 근로계약서가 없습니다.\n편집 모드에서 계약서 URL 을 입력해 주세요.")}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[15px] font-semibold text-zinc-400 bg-zinc-100 border border-line rounded-md cursor-pointer hover:bg-zinc-200/60 transition-colors"
                  >
                    <Paperclip size={11} /> 보기
                  </button>
                  <span className="text-[15px] font-semibold text-zinc-400 italic">없음</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionCard>

    {/* §6-1 계약 이력 */}
    <SectionCard title="계약 이력" icon={<FileText size={11} />} group="work" defaultOpen>
      {contractHistoryLoading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size={12} tone="zinc" label="불러오는 중..." labelSize={15} />
        </div>
      ) : contractHistoryError ? (
        <div className="text-[15px] text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded-md px-2 py-1.5">
          {contractHistoryError}
        </div>
      ) : contractHistory.length === 0 ? (
        <div className="text-center text-[15px] text-zinc-300 py-4 italic">
          등록된 계약 이력이 없습니다
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto overscroll-contain -mx-1 px-1">
          <ul className="divide-y divide-zinc-100">
            {contractHistory.map((h) => {
              const ctMeta = contractTypeMeta(h.contract_type);
              const period = h.start_date ? `${h.start_date} ~ ${h.end_date ?? "무기한"}` : "-";
              const created = h.created_at
                ? new Date(h.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
                : "";
              const isActive = h.is_active === true;
              return (
                <li key={h.id} className={`py-2 px-2 rounded-md ${isActive ? "bg-emerald-50/70 border border-emerald-200 my-1" : ""}`}>
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {isActive && (
                      <span className="text-[14px] font-bold px-1.5 py-0.5 rounded-md border bg-emerald-600 text-white border-emerald-700 leading-tight">
                        활성
                      </span>
                    )}
                    {!isActive && h.is_active === false && (
                      <span className="text-[14px] font-semibold px-1.5 py-0.5 rounded-md border bg-zinc-100 text-zinc-500 border-line leading-tight">
                        이전
                      </span>
                    )}
                    {ctMeta ? (
                      <span className={`text-[14px] font-semibold px-1.5 py-0.5 rounded-md border leading-tight ${ctMeta.color}`}>
                        {ctMeta.label}
                      </span>
                    ) : h.contract_type ? (
                      <span className="text-[14px] font-semibold px-1.5 py-0.5 rounded-md border bg-zinc-100 text-zinc-600 border-line leading-tight">
                        {h.contract_type}
                      </span>
                    ) : null}
                    <span className="text-[15px] font-semibold text-zinc-700 tabular-nums">{period}</span>
                    {h.pdf_url && (
                      <button
                        type="button"
                        onClick={() => window.open(h.pdf_url as string, "_blank", "noopener,noreferrer")}
                        className="ml-auto inline-flex items-center gap-0.5 h-6 px-2 text-[14px] font-semibold text-indigo-600 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 cursor-pointer transition-colors"
                        title="계약서 PDF · 새 창으로 보기"
                      >
                        <ExternalLink size={9} /> PDF
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[14px] text-zinc-400">
                    {created && <span>승인 {created}</span>}
                    {h.approved_by && <span>· {h.approved_by}</span>}
                    {h.storage && <span className="ml-auto italic opacity-70">{h.storage}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  </>
);
