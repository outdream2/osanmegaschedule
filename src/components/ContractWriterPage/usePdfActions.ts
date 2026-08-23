// src/components/ContractWriterPage/usePdfActions.ts
// PDF 빌드 · handleComplete · handleApproveAndSave · handleUploadContract

import { useRef, useState, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import { useConfirm } from '../../hooks/useConfirm';
import { api, ApiError } from '../../lib/apiClient';
import { SIGN_KEYS, SIGN_LABEL, REQUIRED_SIGN_COUNT, type SignKey } from '../../hooks/useContractSignatures';
import { shortContractLabel } from '../../utils/contractUtils';
import { todayIso } from './wageCalc';
import type { ContractForm, ExistingContract } from './types';
import type { AuthSession } from '../../types';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

interface UsePdfActionsProps {
  form: ContractForm;
  authSession: AuthSession | null;
  signUrls: Record<SignKey, string | null>;
  setExistingContract: Dispatch<SetStateAction<ExistingContract | null>>;
  clearDraft: () => void;
  setNotice: Dispatch<SetStateAction<{ tone: "ok" | "err"; text: string } | null>>;
  uploadFile: File | null;
  setUploadFile: Dispatch<SetStateAction<File | null>>;
  setUploadBusy: Dispatch<SetStateAction<boolean>>;
  uploadInputRef: MutableRefObject<HTMLInputElement | null>;
}

export function usePdfActions({
  form,
  authSession,
  signUrls,
  setExistingContract,
  clearDraft,
  setNotice,
  uploadFile,
  setUploadFile,
  setUploadBusy,
  uploadInputRef,
}: UsePdfActionsProps) {
  const confirm = useConfirm();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [generating, setGenerating] = useState(false);

  // PDF 빌드 (T-Y · A4 정확히 2페이지)
  const buildPdfFromPreview = async (): Promise<{ pdf: jsPDF; filename: string }> => {
    const node = previewRef.current;
    if (!node) throw new Error("계약서 프리뷰를 찾을 수 없습니다.");

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgW, imgH, undefined, "FAST");
        remaining -= pdfH;
        yOffset += pdfH;
        if (remaining > 0) pdf.addPage();
      }
    }

    const safeName = (form.employeeName || "근로자").replace(/[\\/:*?"<>|]/g, "_");
    const safeDate = (form.startDate || todayIso()).replace(/-/g, "");
    const filename = `근로계약서_${safeName}_${safeDate}.pdf`;
    return { pdf, filename };
  };

  // 검증
  const validateBeforeAction = async (opts: { requireAllSignatures: boolean }): Promise<boolean> => {
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요." });
      return false;
    }
    if (!form.startDate) {
      setNotice({ tone: "err", text: "계약 시작일을 입력하세요." });
      return false;
    }
    if (!form.indefinite && !form.endDate) {
      setNotice({ tone: "err", text: "계약 종료일을 입력하거나 '무기한'을 선택하세요." });
      return false;
    }
    const missing = SIGN_KEYS.filter(k => !signUrls[k]);
    if (missing.length > 0) {
      const names = missing.map(k => SIGN_LABEL[k]);
      if (opts.requireAllSignatures) {
        setNotice({ tone: "err", text: `서명 누락 (${missing.length}/${SIGN_KEYS.length}): ${names.join(" · ")}` });
        return false;
      } else {
        if (!await confirm({ message: `서명이 ${missing.length}/${SIGN_KEYS.length} 비어있습니다:\n${names.join(" · ")}\n\n서명 없이 PDF를 생성하시겠습니까?` })) return false;
      }
    }
    return true;
  };

  // 계약 완료 → PDF 로컬 저장
  const handleComplete = async () => {
    setNotice(null);
    if (!signUrls.employer || !signUrls.employee) {
      setNotice({ tone: "err", text: "서명 후 저장 가능합니다. 사업주(갑)와 근로자(을) 서명이 필요합니다." });
      return;
    }
    if (!await validateBeforeAction({ requireAllSignatures: false })) return;
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const { pdf, filename } = await buildPdfFromPreview();
      pdf.save(filename);
      setNotice({ tone: "ok", text: "PDF 다운로드가 시작되었습니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "PDF 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // 계약완료 승인 · DB 저장
  const handleApproveAndSave = async () => {
    setNotice(null);
    if (!await validateBeforeAction({ requireAllSignatures: true })) return;
    setGenerating(true);
    await new Promise(r => setTimeout(r, 60));
    try {
      const { pdf, filename } = await buildPdfFromPreview();
      const pdfDataUrl = pdf.output("datauristring");
      const contractTypeShort = shortContractLabel(form.contractType, form.contractMonths);
      const body = {
        employee_id: form.employeeId,
        employee_name: form.employeeName,
        employee_number: form.employeeNumber?.trim() || null,
        contract_type: contractTypeShort || null,
        start_date: form.startDate || null,
        end_date: form.indefinite ? null : (form.endDate || null),
        pdf_data_url: pdfDataUrl,
        approved_by: authSession?.employeeName ?? null,
        approved_by_id: authSession?.employeeId ?? null,
        working_hours: (form.startTime && form.endTime) ? `${form.startTime}-${form.endTime}` : null,
        annual_leave_days: form.annualLeaveDays ? Number(form.annualLeaveDays) || null : null,
      };
      let saved: any = {};
      try {
        const { data } = await api.post<any>("/api/employee-contracts", body);
        saved = data ?? {};
      } catch (err: any) {
        const msg = err instanceof ApiError ? err.message : (err?.message ?? `저장 실패`);
        pdf.save(filename);
        setNotice({ tone: "err", text: `${msg} · 로컬 다운로드만 진행되었습니다.` });
        return;
      }
      pdf.save(filename);
      const pdfUrl: string | undefined = saved?.pdf_url;
      setNotice({
        tone: "ok",
        text: pdfUrl ? `계약이 승인되어 저장되었습니다. 다운로드 링크: ${pdfUrl}` : "계약이 승인되어 저장되었습니다.",
      });
      clearDraft();
      if (saved && (saved.start_date || saved.end_date)) {
        setExistingContract({
          id: saved.id,
          contract_type: saved.contract_type,
          start_date: saved.start_date,
          end_date: saved.end_date,
          created_at: saved.created_at,
          pdf_url: saved.pdf_url,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err instanceof ApiError ? err.message : (err?.message ?? "계약 승인·저장에 실패했습니다.") });
    } finally {
      setGenerating(false);
    }
  };

  // PDF 업로드 방식 (T-R)
  const handleUploadContract = async () => {
    setNotice(null);
    if (!uploadFile) {
      setNotice({ tone: "err", text: "업로드할 PDF 파일을 선택하세요." });
      return;
    }
    if (!form.employeeName.trim()) {
      setNotice({ tone: "err", text: "근로자 성명을 입력하세요 (왼쪽 폼)." });
      return;
    }
    if (!/pdf$/i.test(uploadFile.name) && uploadFile.type !== "application/pdf") {
      setNotice({ tone: "err", text: "PDF 파일만 업로드 가능합니다." });
      return;
    }
    if (uploadFile.size > 20 * 1024 * 1024) {
      setNotice({ tone: "err", text: `파일 크기 초과 (${(uploadFile.size / 1024 / 1024).toFixed(1)}MB > 20MB)` });
      return;
    }

    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("contract", uploadFile);
      if (form.employeeId != null) fd.append("employee_id", String(form.employeeId));
      fd.append("employee_name", form.employeeName);
      const contractTypeShortU = shortContractLabel(form.contractType, form.contractMonths);
      if (contractTypeShortU) fd.append("contract_type", contractTypeShortU);
      if (form.startDate) fd.append("start_date", form.startDate);
      if (!form.indefinite && form.endDate) fd.append("end_date", form.endDate);
      if (authSession?.employeeName) fd.append("approved_by", authSession.employeeName);
      if (authSession?.employeeId != null) fd.append("approved_by_id", String(authSession.employeeId));

      const { data: saved } = await api.post<any>("/api/employee-contracts/upload", fd);
      setNotice({
        tone: "ok",
        text: saved?.pdf_url
          ? `Google Drive 업로드 완료 · 링크: ${saved.pdf_url}`
          : "Google Drive 업로드 완료",
      });
      clearDraft();
      setUploadFile(null);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      if (saved && (saved.start_date || saved.end_date)) {
        setExistingContract({
          id: saved.id,
          contract_type: saved.contract_type,
          start_date: saved.start_date,
          end_date: saved.end_date,
          created_at: saved.created_at,
          pdf_url: saved.pdf_url,
        });
      }
    } catch (err: any) {
      setNotice({ tone: "err", text: err instanceof ApiError ? err.message : (err?.message ?? "업로드 실패") });
    } finally {
      setUploadBusy(false);
    }
  };

  return {
    previewRef, generating,
    handleComplete, handleApproveAndSave, handleUploadContract,
    validateBeforeAction,
  };
}
