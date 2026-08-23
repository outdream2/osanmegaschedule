import React from "react";
import { CheckCircle, BookOpen, X, BookmarkCheck, AlertTriangle, XCircle } from "lucide-react";
import { Spinner } from "../../common/Spinner";
import type { RawPage } from "./types";

interface InvoiceCardHeaderProps {
  rawRows: (string | number | null)[][];
  permanentlyDeletedRawRows: Set<number>;
  hiddenRawRows: Set<number>;
  structuredPages: RawPage[];
  meta: { date?: string; supplier?: string; [k: string]: any };
  autoSynonymLoading: boolean;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  synonymAddStatus: { pageNum: number; status: "loading" | "done" | "error"; count: number } | null;
  hasMissingSupplier: boolean;
  missingSupplierPages: number[];
  reparseStatus: Record<number, "loading" | "done" | "error" | "saved">;
  reparseSupplier: Record<number, string>;
  commitRawRowsDeletion: () => void;
  saveTemplate: (pn: number, supplier: string) => void;
  setReparseStatus: React.Dispatch<React.SetStateAction<Record<number, "loading" | "done" | "error" | "saved">>>;
}

export const InvoiceCardHeader: React.FC<InvoiceCardHeaderProps> = ({
  rawRows, permanentlyDeletedRawRows, hiddenRawRows, structuredPages, meta,
  autoSynonymLoading, autoSynonymMatches, synonymAddStatus,
  hasMissingSupplier, missingSupplierPages,
  reparseStatus, reparseSupplier,
  commitRawRowsDeletion, saveTemplate, setReparseStatus,
}) => {
  const autoSynonymCount = Object.keys(autoSynonymMatches).length;

  return (
    <>
      {/* ── 카드 상단 헤더 배지 ── */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-white bg-sky-500 px-1.5 py-0.5 rounded shrink-0">1차보정</span>
          <span className="text-xs font-bold text-gray-800">거래명세서 품목</span>
          <span className="text-[11px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">
            {rawRows.length - permanentlyDeletedRawRows.size - hiddenRawRows.size}행 · {structuredPages.length}페이지
            {(permanentlyDeletedRawRows.size + hiddenRawRows.size) > 0 && (
              <span className="ml-1 text-rose-500">
                ({permanentlyDeletedRawRows.size + hiddenRawRows.size}행 제외)
              </span>
            )}
          </span>
          {hiddenRawRows.size > 0 && (
            <button
              type="button"
              onClick={commitRawRowsDeletion}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700 px-2 py-0.5 rounded shadow-sm transition cursor-pointer whitespace-nowrap"
              title={`선택된 ${hiddenRawRows.size}행 완전 삭제 + DB 서명 저장 (다음 스캔에도 자동 필터)`}
            >
              🗑 {hiddenRawRows.size}행 삭제
            </button>
          )}
          {meta.date     && <span className="text-[11px] text-gray-400">{meta.date}</span>}
          {meta.supplier && <span className="text-[11px] text-gray-400">공급: {meta.supplier}</span>}
          {autoSynonymLoading && (
            <span className="text-[11px] text-indigo-500 font-bold flex items-center gap-1">
              <Spinner size={10} />동의어 검색 중...
            </span>
          )}
          {!autoSynonymLoading && autoSynonymCount > 0 && (
            <span className="text-[11px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
              <BookOpen size={9} />{autoSynonymCount}건 동의어 보정
            </span>
          )}
          {synonymAddStatus?.status === 'loading' && (
            <span className="text-[11px] text-sky-500 font-bold flex items-center gap-1">
              <Spinner size={10} />동의어 추가 중...
            </span>
          )}
          {synonymAddStatus?.status === 'done' && (
            <span className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
              <CheckCircle size={9} />{synonymAddStatus.count}건 동의어 추가 완료
            </span>
          )}
          {synonymAddStatus?.status === 'error' && (
            <span className="text-[11px] bg-rose-50 border border-rose-200 text-rose-600 px-1.5 py-0.5 rounded font-bold">
              동의어 추가 실패
            </span>
          )}
        </div>
      </div>

      {/* ── 공급사 미입력 페이지 경고 배너 ── */}
      {hasMissingSupplier && (
        <div className="mx-3 my-2 px-3 py-2 rounded-lg bg-rose-50 border-2 border-rose-300 flex items-start gap-2 text-[12px] font-semibold text-rose-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <div className="font-bold text-rose-900 mb-0.5">
              공급사 미입력 페이지 {missingSupplierPages.length}개 — 입력이 필요합니다
            </div>
            <div className="font-normal text-rose-700">
              <span className="font-bold">{missingSupplierPages.join(", ")}번 명세서</span>의 공급사가 지정되지 않았습니다.
              아래 표 <span className="font-bold text-sky-700">"공급처"</span> 셀(rose 배경)을 클릭하여 공급사명을 입력해주세요.
              공급사 정보 없이는 <span className="font-bold">상품명 자동보정 · 확정표 저장</span>이 차단됩니다.
            </div>
          </div>
        </div>
      )}

      {/* ── 공급처 변경 재파싱 상태 ── */}
      {Object.entries(reparseStatus).map(([pnStr, status]) => {
        const pn = Number(pnStr);
        const supplier = reparseSupplier[pn] ?? "";
        if (!supplier) return null;
        if (status === 'loading') return (
          <div key={pn} className="px-4 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2 text-[12px] font-semibold text-indigo-700">
            <Spinner size={12} className="shrink-0" />
            {pn}번 명세서 "{supplier}" 공급처 템플릿으로 재파싱 중...
          </div>
        );
        if (status === 'error') return (
          <div key={pn} className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2 text-[12px] font-semibold text-amber-700">
            <XCircle size={12} className="shrink-0" />{pn}번 명세서 재파싱 실패 — 원본 결과를 유지합니다
          </div>
        );
        if (status === 'done') return (
          <div key={pn} className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 flex-wrap text-[12px] font-semibold text-emerald-700">
            <CheckCircle size={12} className="shrink-0" />
            <span>{pn}번 명세서 재파싱 완료</span>
            <span className="text-gray-500 font-normal">이 결과를 <span className="font-bold text-sky-700">"{supplier}"</span> 공급처 템플릿으로 저장하면 다음부터 자동 적용됩니다.</span>
            <button onClick={() => saveTemplate(pn, supplier)}
              className="ml-auto text-[11px] font-bold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] px-2 py-0.5 rounded transition cursor-pointer shrink-0">
              템플릿 저장
            </button>
            <button onClick={() => setReparseStatus(prev => { const s = { ...prev }; delete s[pn]; return s; })}
              className="text-gray-400 hover:text-gray-600 cursor-pointer shrink-0">
              <X size={10} />
            </button>
          </div>
        );
        if (status === 'saved') return (
          <div key={pn} className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 text-[12px] font-semibold text-emerald-700">
            <BookmarkCheck size={12} className="shrink-0" /><span className="font-bold text-sky-700">"{supplier}"</span> 공급처 템플릿 저장 완료 — 다음 스캔부터 자동 적용됩니다
          </div>
        );
        return null;
      })}
    </>
  );
};
