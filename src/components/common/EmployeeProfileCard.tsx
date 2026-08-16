// 2026-08-10 · 사용자 요청 · 스케쥴표 직원정보 톤으로 통합
// 사용처:
//   · EmployeeCalendarModal (info 탭) · 스케쥴에서 성명 클릭
//   · StaffManagePage · 왼쪽 리스트에서 직원 선택 시 오른쪽 상세 (뷰 모드)
//
// 구성:
//   1. 이름 헤더 (18px) + subtitle (직군·직급·고용) + [수정] 버튼 (있으면)
//   2. 정보 grid · 성별·입사일·근무지·연차 (한줄) · 전화 (전체 폭)
//   3. 첨부 파일 (이력서·근계·통장사본) · 미등록 시 클릭 업로드
//   4. 비고 (있을 때만)
//   5. 근로계약서 뷰어 모달 (자체 관리)

import React, { useEffect, useRef, useState } from "react";
import { FileText, Edit2, Upload, X } from "lucide-react";
import type { Employee } from "../../types";
import { uploadResume, uploadContract, uploadBankbook } from "../../lib/employeeApi";

interface Props {
  employee: Employee;
  /** 파일 업로드 등으로 로컬 employee 가 바뀌면 부모에 알림 (optional · 없으면 내부 state 만 갱신) */
  onEmployeeChange?: (updated: Employee) => void;
  /** [수정하기] 버튼 · onClick · 없으면 버튼 미노출 */
  onEdit?: () => void;
}

interface LatestContract {
  id: number;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  working_hours?: string | null;
  annual_leave_days?: number | null;
  probation_end_date?: string | null;
  base_wage_type?: string | null;
  base_wage_amount?: number | null;
}

export const EmployeeProfileCard: React.FC<Props> = ({ employee, onEmployeeChange, onEdit }) => {
  const [localEmployee, setLocalEmployee] = useState<Employee>(employee);
  useEffect(() => { setLocalEmployee(employee); }, [employee]);

  // 2026-08-10 · B Step 4 · 사번(우선) or employeeId 로 최신 계약서 근로정보 fetch
  const [latestContract, setLatestContract] = useState<LatestContract | null>(null);
  useEffect(() => {
    let alive = true;
    const number = localEmployee.employee_number;
    const id = localEmployee.id;
    if (!number && !id) return;
    const qs = number
      ? `employee_number=${encodeURIComponent(number)}`
      : `employeeId=${id}`;
    fetch(`/api/employees/latest-contract?${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (alive) setLatestContract(data ?? null); })
      .catch(() => { if (alive) setLatestContract(null); });
    return () => { alive = false; };
  }, [localEmployee.id, localEmployee.employee_number]);

  const applyLocal = (updater: (prev: Employee) => Employee) => {
    setLocalEmployee(prev => {
      const next = updater(prev);
      onEmployeeChange?.(next);
      return next;
    });
  };

  // 파일 업로드
  const resumeFileRef = useRef<HTMLInputElement | null>(null);
  const contractFileRef = useRef<HTMLInputElement | null>(null);
  const bankbookFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"resume" | "contract" | "bankbook" | null>(null);
  const [contractModalOpen, setContractModalOpen] = useState(false);

  const handleResumeUpload = async (file: File) => {
    setUploadingKind("resume");
    try {
      const { url } = await uploadResume(localEmployee.id, file);
      applyLocal(prev => ({ ...prev, resume_url: url }));
    } catch (err: any) {
      alert(`이력서 업로드 실패 · ${err?.message ?? err}`);
    } finally { setUploadingKind(null); }
  };
  const handleContractUpload = async (file: File) => {
    setUploadingKind("contract");
    try {
      const { url } = await uploadContract(localEmployee.id, file);
      if (url) applyLocal(prev => ({ ...prev, contract_file_url: url }));
    } catch (err: any) {
      alert(`근로계약서 업로드 실패 · ${err?.message ?? err}`);
    } finally { setUploadingKind(null); }
  };
  const handleBankbookUpload = async (file: File) => {
    setUploadingKind("bankbook");
    try {
      const { dataUrl } = await uploadBankbook(localEmployee, file);
      applyLocal(prev => ({ ...prev, bankbook_image_url: dataUrl }));
    } catch (err: any) {
      alert(`통장사본 업로드 실패 · ${err?.message ?? err}`);
    } finally { setUploadingKind(null); }
  };

  const hasResume = !!localEmployee.resume_url;
  const hasContract = !!localEmployee.contract_file_url;
  const bankbookUrl = localEmployee.bankbook_image_url;
  const hasBankbook = !!bankbookUrl;

  const emptyCls = "px-2 py-1.5 text-[12px] font-semibold bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 rounded-lg inline-flex items-center justify-center gap-1 border border-dashed border-zinc-300 cursor-pointer transition disabled:opacity-60 disabled:cursor-wait";

  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 space-y-3 shadow-sm">
      {/* 이름 헤더 + [수정] 버튼 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[18px] font-black text-zinc-900 leading-tight">{localEmployee.name}</span>
            {localEmployee.employee_number && (
              <span className="text-[11px] font-bold text-zinc-400 tabular-nums">사번 {localEmployee.employee_number}</span>
            )}
          </div>
          {/* 2026-08-17 · 사용자 지시 · #141 · 이름 아래 정보 폰트 +4 (12→16) */}
          <div className="text-[16px] text-zinc-500 font-semibold mt-0.5">
            {[localEmployee.position, localEmployee.rank, localEmployee.employmentType].filter(Boolean).join(" · ")}
          </div>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1.5 text-[13px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg inline-flex items-center gap-1 shadow-sm transition cursor-pointer shrink-0"
          >
            <Edit2 size={14} /> 수정
          </button>
        )}
      </div>

      {/* 근로 조건 · 최신 계약서 · 2026-08-17 · #144 · 계약 없으면 "작성전입니다" 메시지 */}
      {!latestContract && (
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 text-[14px]">
          <span className="text-[11px] font-black text-amber-600 uppercase tracking-wide">근로 조건</span>
          <span className="text-zinc-500 font-semibold">근로계약서 작성전입니다</span>
        </div>
      )}
      {latestContract && (
        <div className="flex items-baseline gap-3 pt-2 border-t border-zinc-100 flex-wrap text-[16px]">
          <span className="text-[14px] font-black text-emerald-600 uppercase tracking-wide">근로 조건</span>
          {latestContract.working_hours && (
            <span className="text-zinc-700"><span className="text-zinc-400 font-semibold">근무</span> <span className="font-bold tabular-nums">{latestContract.working_hours}</span></span>
          )}
          {latestContract.annual_leave_days != null && (
            <span className="text-zinc-700"><span className="text-zinc-400 font-semibold">연차</span> <span className="font-bold tabular-nums">{latestContract.annual_leave_days}일</span></span>
          )}
          {latestContract.probation_end_date && (
            <span className="text-zinc-700"><span className="text-zinc-400 font-semibold">수습</span> <span className="font-bold tabular-nums">~{latestContract.probation_end_date}</span></span>
          )}
          {latestContract.base_wage_type && latestContract.base_wage_amount != null && (
            <span className="text-zinc-700"><span className="text-zinc-400 font-semibold">{latestContract.base_wage_type}</span> <span className="font-bold tabular-nums">{latestContract.base_wage_amount.toLocaleString()}원</span></span>
          )}
          {(latestContract.start_date || latestContract.end_date) && (
            <span className="text-zinc-700"><span className="text-zinc-400 font-semibold">계약</span> <span className="font-bold tabular-nums">{latestContract.start_date ?? "?"} ~ {latestContract.end_date ?? "무기한"}</span></span>
          )}
        </div>
      )}

      {/* 정보 grid · 성별·입사일·근무지·연차 (한줄) · 전화 (전체 폭) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-2 border-t border-zinc-100">
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-zinc-400">성별</span>
          <span className="text-[17px] font-bold text-zinc-700">{localEmployee.gender ?? "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-zinc-400">입사일</span>
          <span className="text-[17px] font-bold text-zinc-700 tabular-nums">{localEmployee.hireDate || "—"}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-zinc-400">근무지</span>
          <span className="text-[17px] font-bold text-zinc-700">{localEmployee.workplace}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold text-zinc-400">연차</span>
          <span className="text-[17px] font-bold text-zinc-700">
            {localEmployee.annual_leave_days != null ? `${localEmployee.annual_leave_days}일` : "—"}
          </span>
        </div>
        <div className="col-span-2 sm:col-span-4 flex flex-col">
          <span className="text-[15px] font-semibold text-blue-400">전화 (로그인 ID)</span>
          <span className="text-[18px] font-black text-blue-700 tabular-nums">
            {localEmployee.phone
              ? localEmployee.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3")
              : <span className="text-zinc-300 font-normal">미등록</span>}
          </span>
        </div>
      </div>

      {/* 첨부 파일 · 이력서·근계·통장사본 · 3슬롯 · 미등록 시 클릭 업로드 */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-100">
        <input ref={resumeFileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); e.target.value = ""; }} />
        <input ref={contractFileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleContractUpload(f); e.target.value = ""; }} />
        <input ref={bankbookFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBankbookUpload(f); e.target.value = ""; }} />

        {hasResume ? (
          <a
            href={localEmployee.resume_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 text-[12px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg inline-flex items-center justify-center gap-1 shadow-sm transition"
            title="이력서 · 새 탭에서 열기"
          >
            <FileText size={13} /> 이력서
          </a>
        ) : (
          <button
            type="button"
            disabled={uploadingKind === "resume"}
            onClick={() => resumeFileRef.current?.click()}
            className={emptyCls}
            title="이력서 업로드 (PDF · 이미지)"
          >
            <Upload size={12} /> {uploadingKind === "resume" ? "업로드 중..." : "이력서 · 없음"}
          </button>
        )}
        {hasContract ? (
          <button
            type="button"
            onClick={() => setContractModalOpen(true)}
            className="px-2 py-1.5 text-[12px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
            title="근로계약서 · 미리보기"
          >
            <FileText size={13} /> 근로계약서
          </button>
        ) : (
          <button
            type="button"
            disabled={uploadingKind === "contract"}
            onClick={() => contractFileRef.current?.click()}
            className={emptyCls}
            title="근로계약서 업로드 (PDF · 이미지)"
          >
            <Upload size={12} /> {uploadingKind === "contract" ? "업로드 중..." : "근계 · 없음"}
          </button>
        )}
        {hasBankbook ? (
          <a
            href={bankbookUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1.5 text-[12px] font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg inline-flex items-center justify-center gap-1 shadow-sm transition"
            title="통장사본 · 새 탭에서 열기"
          >
            <FileText size={13} /> 통장사본
          </a>
        ) : (
          <button
            type="button"
            disabled={uploadingKind === "bankbook"}
            onClick={() => bankbookFileRef.current?.click()}
            className={emptyCls}
            title="통장사본 업로드 (이미지 · 5MB 이하)"
          >
            <Upload size={12} /> {uploadingKind === "bankbook" ? "업로드 중..." : "통장사본 · 없음"}
          </button>
        )}
      </div>

      {/* 비고 (있을 때만) */}
      {localEmployee.description && (
        <div className="flex items-start gap-2 pt-2 border-t border-zinc-100">
          <span className="text-[11px] font-semibold text-zinc-400 shrink-0 mt-0.5">비고</span>
          <span className="text-[13px] text-zinc-700 leading-snug">{localEmployee.description}</span>
        </div>
      )}

      {/* 근로계약서 뷰어 모달 · 자체 관리 */}
      {contractModalOpen && localEmployee.contract_file_url && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/75 p-4">
          <div className="relative w-full max-w-3xl bg-white rounded-2xl overflow-hidden flex flex-col shadow-2xl" style={{ height: "85vh" }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 shrink-0">
              <span className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <FileText size={15} className="text-emerald-600" /> 근로계약서 — {localEmployee.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={localEmployee.contract_file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg transition"
                >
                  새 탭에서 열기
                </a>
                <button
                  type="button"
                  onClick={() => setContractModalOpen(false)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-zinc-100">
              {/\.(pdf)$/i.test(localEmployee.contract_file_url) ? (
                <iframe
                  src={localEmployee.contract_file_url}
                  className="w-full h-full border-0"
                  title="근로계약서"
                />
              ) : (
                <img
                  src={localEmployee.contract_file_url}
                  alt="근로계약서"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeProfileCard;
