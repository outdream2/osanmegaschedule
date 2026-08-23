// src/components/ContractWriterPage/useContractDraft.ts
// draft state · localStorage sync · writeMode · upload file state

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../hooks/useToast';
import type { ContractForm, WageComponents } from './types';
import { DRAFT_STORAGE_KEY, DRAFT_TIMESTAMP_KEY } from './constants';
import { emptyForm } from './emptyForm';

export function useContractDraft() {
  const { showError } = useToast();

  // ── draft 로드 · 마이그레이션 (신규 필드 default) ──
  const [form, setForm] = useState<ContractForm>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const base = emptyForm();
          const wageMerged: WageComponents = {
            ...base.wageComponents,
            ...(parsed.wageComponents ?? {}),
            // fixedAnnualLeave 신규 · 없으면 default
            fixedAnnualLeave: parsed.wageComponents?.fixedAnnualLeave ?? base.wageComponents.fixedAnnualLeave,
            // fixedHolidayOvertime (구 fixedHolidayNight 를 대체) · 없으면 default
            fixedHolidayOvertime: parsed.wageComponents?.fixedHolidayOvertime
              ?? parsed.wageComponents?.fixedHolidayNight
              ?? base.wageComponents.fixedHolidayOvertime,
          };
          const workDaysMerged = parsed.workDays ?? base.workDays;
          return {
            ...base,
            ...parsed,
            wageComponents: wageMerged,
            workDays: workDaysMerged,
            privacyConsent: { ...base.privacyConsent, ...(parsed.privacyConsent ?? {}) },
          } as ContractForm;
        }
      }
    } catch { /* silent */ }
    return emptyForm();
  });

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(() => {
    try { return localStorage.getItem(DRAFT_TIMESTAMP_KEY); } catch { return null; }
  });

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
      const ts = new Date().toISOString();
      localStorage.setItem(DRAFT_TIMESTAMP_KEY, ts);
      setDraftSavedAt(ts);
    } catch {
      showError("임시저장 실패 · 브라우저 저장공간 부족");
    }
  }, [form, showError]);

  // 30초마다 자동 저장
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
        const ts = new Date().toISOString();
        localStorage.setItem(DRAFT_TIMESTAMP_KEY, ts);
        setDraftSavedAt(ts);
      } catch { /* silent */ }
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [form]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
      setDraftSavedAt(null);
    } catch { /* silent */ }
  }, []);

  // T-R (2026-08-05) · 작성 방식 · [여기서 작성] vs [PDF 업로드]
  const [writeMode, setWriteMode] = useState<"form" | "upload">("form");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  return {
    form, setForm,
    draftSavedAt, saveDraft, clearDraft,
    writeMode, setWriteMode,
    uploadFile, setUploadFile, uploadBusy, setUploadBusy,
    uploadInputRef,
  };
}
