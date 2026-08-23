// src/components/ContractWriterPage/useContractWriterState.ts
// 2026-08-23 · #framework-4 · 서브훅 조합 · ContractWriterPage 상태/훅/핸들러

import { useCallback, useMemo, useState } from 'react';
import { useToast } from '../../hooks/useToast';
import type { AuthSession } from '../../types';
import type { DayKey } from './types';
import { useStampsMap } from '../../hooks/useStampsMap';
import sungstampUrl from '../../images/sungstamp.png';
import kyustampUrl from '../../images/kyustamp.png';
import { useContractSignatures } from '../../hooks/useContractSignatures';
import { useContractDraft } from './useContractDraft';
import { useContractLoad } from './useContractLoad';
import { useWageAuto } from './useWageAuto';
import { usePdfActions } from './usePdfActions';
import { useContractActions } from './useContractActions';

export function useContractWriterState(authSession: AuthSession | null) {
  const { toast } = useToast();

  // ── draft · form state · localStorage sync ──
  const draft = useContractDraft();
  const { form, setForm, draftSavedAt, saveDraft, clearDraft, writeMode, setWriteMode,
          uploadFile, setUploadFile, uploadBusy, setUploadBusy, uploadInputRef } = draft;

  // ── notice state ──
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // ── 서명 상태 ──
  const { signUrls, setSignUrls, signModal, openSign, closeSign, submitSign, clearSign } = useContractSignatures();

  // ── 초기 데이터 로드 · prefill · 회사정보 · 계약이력 ──
  const load = useContractLoad({ form, setForm });
  const { settings, paymentDayText, employees, empLoading, empError, empSearchOpen, setEmpSearchOpen,
          existingContract, setExistingContract, existingLoading, hireDateReference,
          jobCategories, wageAutoLoadedRef, lastAutoWageRef } = load;

  // ── 임금 자동계산 ──
  const wage = useWageAuto({ form, setForm, settings, wageAutoLoadedRef, lastAutoWageRef });
  const { wageHourlyOverride, setWageHourlyOverride,
          dependentsCount, setDependentsCount,
          withholdingRate, setWithholdingRate,
          childrenCount, setChildrenCount,
          extraDeduction, setExtraDeduction,
          weeklyDays, weeklyWeekdayDays, weeklyWeekendDays, workDaysSummary,
          monthlyCalc } = wage;

  // ── PDF 생성/저장/업로드 ──
  const pdf = usePdfActions({
    form, authSession, signUrls,
    setExistingContract, clearDraft, setNotice,
    uploadFile, setUploadFile, setUploadBusy, uploadInputRef,
  });
  const { previewRef, generating, handleComplete, handleApproveAndSave, handleUploadContract } = pdf;

  // ── 액션 (직원선택 · 연장 · 리셋) ──
  const actions = useContractActions({
    form, setForm, employees, settings,
    signUrls, setSignUrls,
    existingContract, hireDateReference,
    clearDraft, setNotice,
    wageAutoLoadedRef, lastAutoWageRef,
  });
  const { cardCollapsed, toggleCard, isCardCollapsed,
          addrModalOpen, setAddrModalOpen,
          extendModalOpen, setExtendModalOpen,
          extendMonths, setExtendMonths,
          clearAllSignatures, signatureStatus, canApprove,
          onSelectEmployee, handleExtendConfirm, handleReset } = actions;

  // ── 도장 자동 (stamps_map 서버 매핑 우선 · 없으면 hardcoded fallback) ──
  const { findStamp } = useStampsMap();
  const resolveStampUrl = useCallback((name: string | undefined | null): string | null => {
    const n = (name ?? "").trim();
    if (!n) return null;
    const mapped = findStamp(n);
    if (mapped) {
      if (mapped.imageUrl && mapped.imageUrl.trim()) return mapped.imageUrl;
      if (mapped.bundledFallback === "sungstamp") return sungstampUrl;
      if (mapped.bundledFallback === "kyustamp") return kyustampUrl;
    }
    if (n === "강남성") return sungstampUrl;
    if (n === "강남규") return kyustampUrl;
    return null;
  }, [findStamp]);

  const employerStampUrl = useMemo(() => resolveStampUrl(form.employerName), [form.employerName, resolveStampUrl]);
  const employeeStampUrl = useMemo(() => resolveStampUrl(form.employeeName), [form.employeeName, resolveStampUrl]);

  // ── 폼 편집 헬퍼 ──
  const upd = useCallback(<K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, [setForm]);

  const toggleDay = (d: DayKey) => {
    setForm(prev => ({ ...prev, workDays: { ...prev.workDays, [d]: !prev.workDays[d] } }));
  };

  // applyMonthlyHoursToBasic (monthlyCalc + setNotice 의존 · 메인에서 wrap)
  const applyMonthlyHoursToBasic = useCallback(() => {
    if (!monthlyCalc) {
      setNotice({ tone: "err", text: "근무시간을 먼저 입력하세요." });
      return;
    }
    setForm(prev => ({
      ...prev,
      useWageComponents: true,
      wageComponents: {
        ...prev.wageComponents,
        basicSalary: {
          ...prev.wageComponents.basicSalary,
          hours: monthlyCalc.monthlyHoursInt,
          minutes: monthlyCalc.monthlyMinutesRem,
        },
      },
    }));
    setNotice({
      tone: "ok",
      text: `월 근로시간 ${monthlyCalc.monthlyHoursInt}시간 ${monthlyCalc.monthlyMinutesRem}분 을 기본급 항목에 반영했습니다.`,
    });
  }, [monthlyCalc, setForm]);

  return {
    toast,
    paymentDayText,
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
  };
}
