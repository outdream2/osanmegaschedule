import React from "react";
import type { RawPage } from "./types";

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
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => setSupplierConfirm(null)}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 max-w-sm w-full flex flex-col gap-4"
        onClick={e => e.stopPropagation()}>
        <div>
          <p className="text-sm font-bold text-gray-800 mb-1">공급처 변경</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-bold text-sky-700">"{supplierConfirm.newVal}"</span>으로 변경합니다.{" "}
            해당 페이지의 <span className="font-bold text-gray-700">{supplierConfirm.rowCount}개</span> 항목과
            이후 모든 프로세스(보정 결과, 확정 표)에 즉시 반영됩니다.
          </p>
        </div>
        {/* 동의어 일괄 추가 옵션 */}
        {nameIdx >= 0 && (
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={supplierConfirm.addSynonyms}
              onChange={e => setSupplierConfirm(prev => prev ? { ...prev, addSynonyms: e.target.checked } : null)}
              className="mt-0.5 accent-indigo-500"
            />
            <span className="text-xs text-gray-600 leading-snug">
              <span className="font-bold text-indigo-700">동의어 일괄 추가</span> — 이 페이지 상품명을{" "}
              <span className="font-semibold text-sky-700">"{supplierConfirm.newVal}"</span> 공급사로 동의어 사전에 등록
              <span className="block text-[11px] text-gray-400 mt-0.5">(DB 매칭 후 상품코드 포함 자동 등록)</span>
            </span>
          </label>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setSupplierConfirm(null)}
            className="flex-1 py-2 text-xs font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={async () => {
              const { pageNum, newVal, addSynonyms } = supplierConfirm;
              // 이전 OCR 인식 공급사 → 보정 공급사를 DB에 저장 (자동보정)
              const oldOcrSupplier = structuredPages.find(p => p.page === pageNum)?.meta.supplier;
              if (oldOcrSupplier && oldOcrSupplier.trim() !== newVal.trim()) {
                fetch("/api/ocr-supplier-aliases", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ alias: oldOcrSupplier.trim(), supplier_name: newVal.trim() }),
                }).catch(() => {});
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
            }}
            className="flex-1 py-2 text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-xl transition cursor-pointer"
          >
            변경 적용
          </button>
        </div>
      </div>
    </div>
  );
};
