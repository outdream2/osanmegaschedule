/**
 * XlsxExportSection.tsx
 * 확정표 상단 우측 export 버튼 묶음 (서식파일 업로드·저장, ERP업로드, 서식별, CSV)
 * 2026-07-28 · RawOcrTable 2라운드 리팩터에서 분리
 */
import React from "react";
import { Download, Bookmark, FileSpreadsheet, Upload as UploadIcon } from "lucide-react";

export interface XlsxExportSectionProps {
  xlsInputRef: React.RefObject<HTMLInputElement | null>;
  handleTemplateUpload: (file: File) => void;
  xlsTemplateSaved: boolean;
  setXlsTemplateSaved: (v: boolean) => void;
  xlsTemplate: ArrayBuffer | null;
  xlsTemplateName: string | null;
  xlsTemplateHdrs: string[] | null;
  handleErpUploadExport: () => void;
  handleExcelExport: () => void;
  handleExport: (headers: string[], rows: (string | number | null)[][], suffix: string) => void;
  confHeaders: string[];
  confRows: (string | number | null)[][];
}

export const XlsxExportSection: React.FC<XlsxExportSectionProps> = ({
  xlsInputRef,
  handleTemplateUpload,
  xlsTemplateSaved,
  setXlsTemplateSaved,
  xlsTemplate,
  xlsTemplateName,
  xlsTemplateHdrs,
  handleErpUploadExport,
  handleExcelExport,
  handleExport,
  confHeaders,
  confRows,
}) => {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={xlsInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) {
            handleTemplateUpload(f);
            setXlsTemplateSaved(false);
            e.target.value = "";
          }
        }}
      />
      {/* 서식 파일 저장 버튼 */}
      {xlsTemplate && (
        <button
          onClick={() => {
            if (!xlsTemplate || !xlsTemplateName || !xlsTemplateHdrs) return;
            try {
              const bytes = new Uint8Array(xlsTemplate);
              const b64 = btoa(String.fromCharCode(...bytes));
              localStorage.setItem(
                "ocr_xls_template",
                JSON.stringify({ name: xlsTemplateName, hdrs: xlsTemplateHdrs, data: b64 })
              );
              setXlsTemplateSaved(true);
            } catch { /* silent */ }
          }}
          title="서식 파일을 브라우저에 저장 (다음 방문 시 자동 복원)"
          className={`flex items-center gap-1 text-[12px] font-bold px-2 py-1 rounded-lg transition cursor-pointer shrink-0 border ${
            xlsTemplateSaved
              ? "text-emerald-600 bg-emerald-50 border-emerald-200"
              : "text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
          }`}
        >
          <Bookmark size={11} />
          {xlsTemplateSaved ? "저장됨" : "저장"}
        </button>
      )}
      <button
        onClick={() => xlsInputRef.current?.click()}
        title={xlsTemplateName ?? "엑셀 서식 파일 업로드"}
        className={`flex items-center gap-1 text-[12px] font-bold px-2 py-1 rounded-lg transition cursor-pointer shrink-0 border ${
          xlsTemplateName
            ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
            : "text-gray-500 bg-white border-gray-200 hover:bg-gray-50"
        }`}
      >
        <UploadIcon size={11} />
        {xlsTemplateName ? (
          <span className="max-w-[80px] truncate">{xlsTemplateName}</span>
        ) : (
          "서식 파일"
        )}
      </button>
      {/* 2026-07-28 · ERP 업로드 전용 서식 · 고정 컬럼 순서 · 소비기한=유통기한 */}
      <button
        onClick={handleErpUploadExport}
        className="flex items-center gap-1 text-[12px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0"
        title="ERP 시스템 업로드용 엑셀 서식 (상품코드·상품명·규격·마스터매입단가·공급처·전표매입단가·매입수량·매입총계·판매단가·이익률·소비기한)"
      >
        <FileSpreadsheet size={11} />ERP업로드 엑셀
      </button>
      {/* 사용자 정의 서식 (엑셀 서식 파일 업로드된 경우만) */}
      {xlsTemplate && (
        <button
          onClick={handleExcelExport}
          className="flex items-center gap-1 text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0"
          title="사용자 서식 파일로 엑셀 다운로드"
        >
          <FileSpreadsheet size={11} />서식별 엑셀
        </button>
      )}
      {/* 2026-07-22 · CSV 다운로드 · 3차 확정표에 통합 (사용자 요청) */}
      <button
        onClick={() => handleExport(confHeaders, confRows, "확정")}
        className="flex items-center gap-1 text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition cursor-pointer shrink-0"
      >
        <Download size={11} />CSV
      </button>
    </div>
  );
};
