// 2026-08-18 · <Modal> 프레임워크 통합 · 공급처 변경 확인 다이얼로그
import React from "react";
import { Building2 } from "lucide-react";
import type { RawPage } from "./types";
import { Modal } from "../../common/Modal";
import { IconTile } from "../../common/IconTile";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../../lib/apiClient";

export type SupplierConfirmState = {
  pageNum: number;
  newVal: string;
  rowCount: number;
  addSynonyms: boolean;
};

interface SupplierChangeDialogProps {
  supplierConfirm: SupplierConfirmState;
  setSupplierConfirm: React.Dispatch<React.SetStateAction<SupplierConfirmState | null>>;
  nameIdx: number;
  structuredPages: RawPage[];
  setRawSupplierByPage: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  handleSynonymBulkAdd: (pageNum: number, newSupplier: string) => Promise<void>;
  onReparsePage?: (pageNum: number, supplier: string, approach?: "default" | "rearrange" | "high-contrast" | "gemini") => Promise<any>;
  setReparseStatus: React.Dispatch<React.SetStateAction<Record<number, 'loading' | 'done' | 'error'>>>;
  setReparseSupplier: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}

export const SupplierChangeDialog: React.FC<SupplierChangeDialogProps> = ({
  supplierConfirm, setSupplierConfirm, nameIdx, structuredPages,
  setRawSupplierByPage, handleSynonymBulkAdd, onReparsePage,
  setReparseStatus, setReparseSupplier,
}) => {
  const apply = async () => {
    const { pageNum, newVal, addSynonyms } = supplierConfirm;
    // 이전 OCR 인식 공급사 → 보정 공급사를 DB에 저장 (자동보정)
    const oldOcrSupplier = structuredPages.find(p => p.page === pageNum)?.meta.supplier;
    if (oldOcrSupplier && oldOcrSupplier.trim() !== newVal.trim()) {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient · fire-and-forget
      api.post("/api/ocr-supplier-aliases", { alias: oldOcrSupplier.trim(), supplier_name: newVal.trim() })
        .catch(() => {});
    }
    setRawSupplierByPage(prev => ({ ...prev, [pageNum]: newVal }));
    setSupplierConfirm(null);
    if (addSynonyms) await handleSynonymBulkAdd(pageNum, newVal);
    if (onReparsePage) {
      setReparseStatus(prev => ({ ...prev, [pageNum]: 'loading' }));
      setReparseSupplier(prev => ({ ...prev, [pageNum]: newVal }));
      try {
        await onReparsePage(pageNum, newVal);
        setReparseStatus(prev => ({ ...prev, [pageNum]: 'done' }));
      } catch {
        setReparseStatus(prev => ({ ...prev, [pageNum]: 'error' }));
      }
    }
  };

  return (
    <Modal
      open={true}
      onClose={() => setSupplierConfirm(null)}
      size="sm"
      titleAccent
      icon={<IconTile icon={<Building2 size={14} />} tone="sky" size="md" />}
      title="공급처 변경"
      footer={
        <>
          <button
            type="button"
            onClick={() => setSupplierConfirm(null)}
            className="h-10 px-4 text-[14px] font-bold bg-white hover:bg-brand-tint border border-line hover:border-brand-deep rounded-lg text-ink transition cursor-pointer"
          >
            취소
          </button>
          <button
            type="button"
            onClick={apply}
            className="h-10 px-6 text-[15px] font-bold text-white bg-brand-deep hover:bg-brand-deep/90 rounded-lg
              shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_-1px_rgba(10,46,74,0.25)]
              transition cursor-pointer"
          >
            변경 적용
          </button>
        </>
      }
    >
      <p className="text-[13px] text-ink-soft leading-relaxed">
        <span className="font-bold text-sky-700">"{supplierConfirm.newVal}"</span>으로 변경합니다.{" "}
        해당 페이지의 <span className="font-bold text-ink">{supplierConfirm.rowCount}개</span> 항목과
        이후 모든 프로세스(보정 결과 · 확정 표)에 즉시 반영됩니다.
      </p>

      {/* 동의어 일괄 추가 옵션 */}
      {nameIdx >= 0 && (
        <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={supplierConfirm.addSynonyms}
            onChange={e => setSupplierConfirm(prev => prev ? { ...prev, addSynonyms: e.target.checked } : null)}
            className="mt-0.5 accent-brand-deep"
          />
          <span className="text-[13px] text-ink-soft leading-snug">
            <span className="font-bold text-brand-deep">동의어 일괄 추가</span> — 이 페이지 상품명을{" "}
            <span className="font-semibold text-sky-700">"{supplierConfirm.newVal}"</span> 공급사로 동의어 사전에 등록
            <span className="block text-[11px] text-ink-soft mt-0.5">(DB 매칭 후 상품코드 포함 자동 등록)</span>
          </span>
        </label>
      )}
    </Modal>
  );
};
