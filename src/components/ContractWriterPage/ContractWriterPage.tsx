// src/components/ContractWriterPage/ContractWriterPage.tsx
// 2026-08-23 · #framework-4 · 전체 분리 완료 · 타입/상수/계산/서브컴포넌트 모두 이관

import React, { useMemo } from "react";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { toastClass } from "../../hooks/useToast";
import {
  NotePencil, CalendarBlank, Eraser, DownloadSimple, Warning, Check,
  Signature, ClockCounterClockwise, X as XIcon,
} from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import SplitPanel from "../common/SplitPanel";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import { Modal } from "../common/Modal";
import { calcWageBase } from "../../lib/wageCalc";
import { grossUp as payrollGrossUp } from "../../lib/payroll";
import { SIGN_LABEL } from "../../hooks/useContractSignatures";
import { contractPeriodMonthsClient } from "./wageCalc";
import ContractPreview from "./ContractPreview";
import SignatureModal from "./SignatureModal";
import ContractLeftForm from "./ContractLeftForm";
import { useContractWriterState } from "./useContractWriterState";

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

interface ContractWriterPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEV 자체 검증 (T-X · T-Y)
// ─────────────────────────────────────────────────────────────────────────────

// T-X (2026-08-05) · dev-only 자체 검증 · 정본 5 케이스 (주5일 주중)
//   개발 모드 · 콘솔에서 확인 가능 · 프로덕션 build 에는 영향 없음
if (typeof window !== "undefined" && (import.meta as any)?.env?.DEV) {
  const cases: Array<{ dh: number; expBasic: number; expOtGained: number }> = [
    { dh: 7.5,  expBasic: 195.5, expOtGained: 0 },
    { dh: 8.0,  expBasic: 209,   expOtGained: 0 },
    { dh: 8.5,  expBasic: 209,   expOtGained: 16.29 },
    { dh: 9.0,  expBasic: 209,   expOtGained: 32.59 },
    { dh: 10.0, expBasic: 209,   expOtGained: 65.18 },
  ];
  const eps = 0.5; // 소수 반올림 허용
  const results = cases.map(({ dh, expBasic, expOtGained }) => {
    const b = calcWageBase(dh, 5, 0);
    const pass = Math.abs(b.monthlyBasicH - expBasic) < eps
              && Math.abs(b.monthlyOvertimeGainedH - expOtGained) < eps;
    return { dh, basic: b.monthlyBasicH.toFixed(2), ot: b.monthlyOvertimeGainedH.toFixed(2), pass };
  });
  const anyFail = results.some(r => !r.pass);
  if (anyFail) {
    // eslint-disable-next-line no-console
    console.warn("[ContractWriter] calcWageBase 검증 실패:", results);
  } else {
    // eslint-disable-next-line no-console
    console.log("[ContractWriter] calcWageBase 5 케이스 통과", results);
  }

  // T-Y (2026-08-05) · payroll grossUp 4 케이스 검증 (부양 1인·식대 20만)
  //   기대: 300만·500만·700만·1000만 → diff < 100원 · docs/PAYROLL_ALGORITHM.md 준수
  const netCases = [3_000_000, 5_000_000, 7_000_000, 10_000_000];
  const grossUpResults = netCases.map(net => {
    const r = payrollGrossUp(net, 200_000, 1);
    const finalNet = r.gross - r.taxes.total;
    const diff = net - finalNet;
    return { net, gross: r.gross, finalNet, diff, iter: r.iterations, pass: Math.abs(diff) < 100 };
  });
  const anyGrossUpFail = grossUpResults.some(r => !r.pass);
  if (anyGrossUpFail) {
    // eslint-disable-next-line no-console
    console.warn("[ContractWriter] payroll.grossUp 검증 실패:", grossUpResults);
  } else {
    // eslint-disable-next-line no-console
    console.log("[ContractWriter] payroll.grossUp 4 케이스 통과", grossUpResults);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 연장 모달 (기존 유지)
// ─────────────────────────────────────────────────────────────────────────────

const ExtendContractModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  months: string;
  setMonths: (v: string) => void;
  existingEnd: string | null | undefined;
  hireDateReference: string | null;
}> = ({ open, onClose, onConfirm, months, setMonths, existingEnd, hireDateReference }) => {
  const preview = useMemo(() => {
    if (!existingEnd) return null;
    const baseEnd = new Date(existingEnd);
    if (Number.isNaN(baseEnd.getTime())) return null;
    const n = Number(months);
    if (!Number.isFinite(n) || n <= 0) return null;
    const newStart = new Date(baseEnd);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setMonth(newEnd.getMonth() + n);
    newEnd.setDate(newEnd.getDate() - 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: iso(newStart), end: iso(newEnd) };
  }, [existingEnd, months]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      backdropIntensity="brand"
      showClose={false}
      bodyPadding="none"
      closeOnBackdrop={true}
      closeOnEsc={true}
    >
      {/* 커스텀 헤더 · indigo 톤 · 원본 완전 재현 */}
      <div className="px-4 py-3 border-b border-line bg-indigo-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-deep flex items-center justify-center shadow-sm">
            <ClockCounterClockwise size={13} weight="fill" className="text-white" />
          </div>
          <span className="text-sm font-bold text-zinc-800">근로계약 연장</span>
        </div>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 w-7 h-7 rounded-md hover:bg-white/70 cursor-pointer flex items-center justify-center" title="닫기">
          <XIcon size={13} weight="bold" />
        </button>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="text-[14px] text-zinc-700 leading-relaxed">
          현재 계약 종료일 <b className="text-zinc-900">{existingEnd ?? "-"}</b> 다음 날부터 지정한 개월수만큼 자동으로 신규 계약서를 작성합니다.
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[14px] font-bold text-zinc-600 flex items-center gap-1">연장 개월수 <span className="text-rose-500">*</span></label>
          <div className="flex flex-wrap gap-1.5">
            {["1", "3", "6", "12", "24"].map(m => {
              const active = months === m;
              return (
                <button key={m} type="button" onClick={() => setMonths(m)}
                  className={`px-3 py-1.5 rounded-lg border text-[15px] font-bold transition-colors cursor-pointer ${
                    active ? "bg-brand-deep text-white border-indigo-600 shadow-sm" : "bg-white text-zinc-600 border-line hover:bg-zinc-50"
                  }`}
                >
                  {m}개월
                </button>
              );
            })}
            <div className="flex items-center gap-1 ml-1">
              <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-16 bg-white border border-line rounded-lg px-2 py-1.5 text-[15px] text-zinc-800 font-bold text-right focus:outline-none focus:border-brand-deep focus:shadow-sm transition" placeholder="직접" />
              <span className="text-[15px] font-semibold text-zinc-500">개월</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-[14px] flex flex-col gap-1">
          <div className="font-bold text-indigo-800 flex items-center gap-1">
            <CalendarBlank size={12} weight="fill" />신규 계약 기간
          </div>
          {preview ? (
            <div className="text-zinc-800">
              <b className="font-bold">{preview.start}</b><span className="mx-1 text-zinc-400">~</span><b className="font-bold">{preview.end}</b>
            </div>
          ) : <div className="text-rose-600 font-semibold">개월수를 입력하면 신규 기간이 계산됩니다.</div>}
          {hireDateReference && <div className="text-[15px] text-zinc-500 mt-0.5">· 입사일 <b className="text-zinc-700">{hireDateReference}</b> 은 변경되지 않고 유지됩니다 (근속 산정용).</div>}
        </div>
        <div className="text-[15px] text-amber-700 bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1.5">
          확정 시 현재 폼에 신규 계약 기간이 반영되고 · 서명 상태가 초기화됩니다. 서명 후 [계약완료 승인] 을 눌러 저장하세요.
        </div>
      </div>
      <div className="px-4 py-3 border-t border-line bg-zinc-50/70 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="text-[14px] font-bold text-zinc-600 bg-white border border-zinc-300 rounded-md h-8 px-3 hover:bg-zinc-50 cursor-pointer">취소</button>
        <button type="button" onClick={onConfirm} disabled={!preview}
          className="text-[14px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] rounded-md h-8 px-4 cursor-pointer disabled:bg-zinc-300 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm">
          <Check size={12} weight="bold" />연장 확정
        </button>
      </div>
    </Modal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────────────────────


const ContractWriterPage: React.FC<ContractWriterPageProps> = ({ authSession, onBack, onNavigate, onLogout, embedded = false }) => {
  const {
    toast, paymentDayText,
    form, setForm, upd,
    draftSavedAt, saveDraft, clearDraft,
    notice, setNotice,
    writeMode, setWriteMode,
    uploadFile, setUploadFile, uploadBusy, uploadInputRef, handleUploadContract,
    employees, empLoading, empError, empSearchOpen, setEmpSearchOpen,
    signUrls, setSignUrls, signModal, openSign, closeSign, submitSign, clearSign,
    clearAllSignatures,
    signatureStatus, canApprove,
    employerStampUrl, employeeStampUrl,
    previewRef, generating,
    existingContract, existingLoading,
    extendModalOpen, setExtendModalOpen,
    extendMonths, setExtendMonths,
    hireDateReference,
    cardCollapsed, toggleCard, isCardCollapsed,
    wageHourlyOverride, setWageHourlyOverride,
    dependentsCount, setDependentsCount,
    withholdingRate, setWithholdingRate,
    childrenCount, setChildrenCount,
    extraDeduction, setExtraDeduction,
    addrModalOpen, setAddrModalOpen,
    weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, workDaysSummary,
    toggleDay, monthlyCalc,
    applyMonthlyHoursToBasic,
    jobCategories,
    onSelectEmployee,
    handleExtendConfirm, handleReset, handleComplete, handleApproveAndSave,
  } = useContractWriterState(authSession);
  const leftFormNode = (
    <ContractLeftForm
      form={form}
      upd={upd}
      setForm={setForm}
      setNotice={setNotice}
      writeMode={writeMode}
      setWriteMode={setWriteMode}
      uploadFile={uploadFile}
      setUploadFile={setUploadFile}
      uploadBusy={uploadBusy}
      uploadInputRef={uploadInputRef}
      handleUploadContract={handleUploadContract}
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
      weeklyDays={weeklyDays}
      weeklyWeekdayDays={weeklyWeekdayDays}
      weeklyWeekendDays={weeklyWeekendDays}
      toggleDay={toggleDay}
      monthlyCalc={monthlyCalc}
      jobCategories={jobCategories}
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
  );
  // ────────────────────────────────────────────────────────────────
  // 우측 · 프리뷰 (인라인 서명 spot 포함)
  // ────────────────────────────────────────────────────────────────

  const rightPreviewNode = writeMode === "upload" ? (
    <section className="flex flex-col gap-3 h-full overflow-y-auto p-3 bg-zinc-100 rounded-xl">
      <div className="flex items-center gap-1.5 pb-1">
        <DownloadSimple size={16} weight="fill" className="text-indigo-600 rotate-180" />
        <h2 className="text-sm font-bold text-zinc-800">PDF 업로드 안내</h2>
      </div>
      <Card variant="flat" className="flex flex-col gap-2 text-[14px] text-zinc-700 leading-relaxed">
        <div className="text-[15px] font-bold text-zinc-800">Google Drive · contract 폴더 저장</div>
        <ol className="list-decimal pl-5 space-y-1">
          <li>왼쪽 폼에서 근로자 성명 · 계약 유형 · 기간을 입력합니다.</li>
          <li>PDF 파일 선택 후 [Google Drive 업로드] 클릭.</li>
          <li>저장 후 · employees.contract_file_url 갱신 · 직원관리 [보기] 활성화.</li>
          <li>이력은 employee_contracts 테이블에 저장 (storage="drive").</li>
        </ol>
        <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-[15px] font-semibold text-indigo-700">
          팁 · [여기서 작성] 으로 전환하면 폼 입력 → 미리보기 → PDF 자동생성 방식으로 계약서를 만듭니다.
        </div>
      </Card>
    </section>
  ) : (
    <section className="flex flex-col gap-2 h-full overflow-y-auto p-2 bg-zinc-100 rounded-xl">
      <div className="flex items-center gap-1.5 pb-1">
        <NotePencil size={16} weight="fill" className="text-emerald-600" />
        <h2 className="text-sm font-bold text-zinc-800">계약서 미리보기</h2>
        <span className="text-[10.5px] text-zinc-400 font-semibold ml-1">(클릭하여 서명 · PDF 그대로 저장)</span>
      </div>

      {/* 서명 진행률 (프리뷰 상단 유지) */}
      <div className={`rounded-lg border px-3 py-1.5 flex items-center gap-2 ${
        canApprove ? "bg-emerald-50 border-emerald-200" : "bg-white border-line"
      }`}>
        <div className="flex items-center gap-1.5 shrink-0">
          {canApprove ? <Check size={13} weight="bold" className="text-emerald-600" /> : <Signature size={13} weight="fill" className="text-zinc-500" />}
          <span className={`text-[11.5px] font-bold ${canApprove ? "text-emerald-700" : "text-zinc-700"}`}>
            서명 {signatureStatus.filled} / {signatureStatus.total}
          </span>
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
          <div className={`h-full transition-all ${canApprove ? "bg-emerald-500" : "bg-indigo-400"}`}
            style={{ width: `${Math.round((signatureStatus.filled / signatureStatus.total) * 100)}%` }}
          />
        </div>
        <button type="button" onClick={clearAllSignatures}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 hover:bg-rose-100 text-zinc-500 hover:text-rose-700 text-[10.5px] font-bold transition-colors cursor-pointer"
          title="모든 서명 지우기"
        >
          <Eraser size={11} /> 전체
        </button>
      </div>

      <Card variant="flat" padding="none" className="p-2 sm:p-3">
        <ContractPreview
          ref={previewRef}
          form={form}
          signUrls={signUrls}
          employerStampUrl={employerStampUrl}
          employeeStampUrl={employeeStampUrl}
          onOpenSign={openSign}
          onClearSign={clearSign}
          paymentDayText={paymentDayText}
        />
      </Card>

      {/* 완료 버튼 (하단 유지 · 서명 pad 섹션 제거) */}
      <Card padding="sm" className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <button type="button" onClick={handleApproveAndSave} disabled={generating || !canApprove}
            className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-white text-[14px] font-bold shadow-md transition-all cursor-pointer disabled:cursor-not-allowed
              ${canApprove && !generating
                ? "bg-rose-500 hover:brightness-110 hover:shadow-lg"
                : "bg-zinc-300 text-zinc-500"}`}
            title={canApprove ? "계약 승인 · DB 저장 + PDF 다운" : `${signatureStatus.total} 지점 서명을 모두 채워야 활성화됩니다`}
          >
            <Check size={15} weight="bold" />
            <span>{generating ? "저장 중..." : "계약완료 승인 (DB 저장)"}</span>
          </button>
          {!canApprove && (
            <span className="text-[10.5px] text-zinc-500 font-semibold text-center sm:text-left">
              프리뷰 안의 서명 spot 을 클릭하여 {signatureStatus.total} 지점 서명 후 승인 활성화
            </span>
          )}
        </div>
        <button type="button" onClick={saveDraft}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 text-[11.5px] font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          title="현재 작성 내용을 브라우저에 저장"
        >
          임시저장
          {draftSavedAt && (
            <span className="text-[14px] font-normal text-emerald-600 ml-1">
              · {new Date(draftSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </button>
        {/* T-PDF-SignatureRequired: 사업주·근로자 서명 필수 · disabled */}
        {(() => {
          const hasBothSigns = !!signUrls.employer && !!signUrls.employee;
          return (
            <button type="button" onClick={handleComplete} disabled={generating || !hasBothSigns}
              className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[14px] font-bold shadow-sm transition-colors whitespace-nowrap
                ${hasBothSigns && !generating
                  ? "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white cursor-pointer"
                  : "bg-zinc-300 text-zinc-500 cursor-not-allowed opacity-60"}`}
              title={hasBothSigns ? "PDF 로컬 다운로드" : "서명 후 저장 가능합니다 (사업주·근로자 서명 필요)"}
            >
              <DownloadSimple size={13} weight="bold" />
              <span>{generating ? "생성 중..." : "PDF"}</span>
            </button>
          );
        })()}
      </Card>
    </section>
  );

  // ────────────────────────────────────────────────────────────────
  // 렌더 · SplitPanel 감싸기 (E)
  // ────────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-zinc-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"business-manage" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className={`flex-1 ${PAGE_CONTAINER_CLS} px-3 sm:px-5 py-4 flex flex-col gap-3 min-h-0`}>
        {/* 페이지 헤더 · T-CTR-11 · 컴팩트 축소 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {/* 2026-08-18 · IconTile 확산 */}
            <IconTile icon={<NotePencil size={16} weight="fill" />} tone="emerald" size="md" />

            <div>
              <h1 className="text-sm sm:text-base font-bold text-zinc-800 leading-none">근로계약서 작성</h1>
              <p className="text-[14px] text-zinc-500 mt-0.5">좌측 폼 · 우측 이미지 재현 · 프리뷰 내 서명 spot 클릭하여 서명 입력</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {existingContract && existingContract.end_date && (
              <button type="button"
                onClick={() => {
                  const prevMonths = contractPeriodMonthsClient(existingContract.start_date, existingContract.end_date);
                  setExtendMonths(prevMonths != null && prevMonths > 0 ? String(prevMonths) : "3");
                  setExtendModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm font-bold transition-colors cursor-pointer shadow-sm"
                title={`기존 계약 (${existingContract.start_date ?? "-"} ~ ${existingContract.end_date}) 연장`}
              >
                <ClockCounterClockwise size={14} weight="fill" />
                <span>연장</span>
              </button>
            )}
            {/* T-CTR-Collapse+Reset (2026-08-06) · 초기화 버튼 · 컴팩트 축소 · 눈에 덜 띄게 */}
            <button type="button" onClick={handleReset}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-line bg-white text-zinc-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 text-[15px] font-medium transition-colors cursor-pointer"
              title="입력 내용·서명·임시저장 · 전체 초기화"
            >
              <Eraser size={12} weight="regular" />
              <span className="hidden sm:inline">초기화</span>
            </button>
          </div>
        </div>

        {existingContract && form.employeeId != null && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-[14px] text-indigo-800 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 font-bold">
              <ClockCounterClockwise size={13} weight="fill" />
              기존 계약서
            </span>
            <span>
              기간 <b className="font-bold">{existingContract.start_date ?? "-"}</b> ~ <b className="font-bold">{existingContract.end_date ?? "-"}</b>
            </span>
            {existingContract.contract_type && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/70 border border-indigo-200 px-1.5 py-0.5 text-[15px] font-bold">
                {existingContract.contract_type}
              </span>
            )}
            {hireDateReference && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white/70 border border-indigo-200 px-1.5 py-0.5 text-[15px] font-bold">
                입사일 {hireDateReference} · 유지
              </span>
            )}
            {existingContract.pdf_url && (
              <a href={existingContract.pdf_url} target="_blank" rel="noopener noreferrer"
                className="ml-auto underline text-[15px] font-bold text-indigo-700 hover:text-indigo-900"
              >
                기존 계약서 PDF 보기
              </a>
            )}
          </div>
        )}
        {existingLoading && form.employeeId != null && !existingContract && (
          <div className="text-[15px] text-zinc-400">기존 계약 이력 조회 중...</div>
        )}

        {notice && (
          <div className={`rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2 ${
            notice.tone === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {notice.tone === "ok" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* ─── E. SplitPanel · 좌우 폭 조정 ─── */}
        <SplitPanel
          storageKey="contract-writer.leftWidth"
          defaultWidth={460}
          minWidth={340}
          maxWidth={760}
          dividerColor="emerald"
          mobileRightAsModal={false}
          wrapLeft={false}
          wrapRight={false}
          style={{ minHeight: "70vh" }}
          left={leftFormNode}
          right={rightPreviewNode}
        />
      </main>

      <ExtendContractModal
        open={extendModalOpen}
        onClose={() => setExtendModalOpen(false)}
        onConfirm={handleExtendConfirm}
        months={extendMonths}
        setMonths={setExtendMonths}
        existingEnd={existingContract?.end_date ?? null}
        hireDateReference={hireDateReference}
      />

      {/* 서명 모달 (G · 인라인 클릭 시 팝업) */}
      <SignatureModal
        open={signModal.open}
        title={signModal.key ? SIGN_LABEL[signModal.key] : ""}
        onClose={closeSign}
        onSubmit={submitSign}
      />
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

export default ContractWriterPage;
