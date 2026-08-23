import React from "react";
import { CheckCircle, AlertTriangle, Save } from "lucide-react";
import { Spinner } from "../../common/Spinner";
import { Badge } from "../../common/Badge";
import { Card } from "../../common/Card";
import { api } from "../../../lib/apiClient";
import { XlsxExportSection } from "./XlsxExportSection";
import type { MatchedItem, CandidateInfo } from "./types";
import { fmt } from "./utils";

const CONF_NUM = new Set([
  "마스터 매입단가", "전표 매입단가", "매입수량", "매입총계", "판매단가", "이익률",
]);

interface ConfirmedTableSectionProps {
  // Guard conditions
  structuredPages: any[];
  nameIdx: number;
  matchItems: MatchedItem[] | null;
  confirmed: boolean;

  // Image
  pageImages?: string[];
  confImageCollapsed: boolean;
  setConfImageCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  effectiveInvColWidth: number;
  rotation: number;
  confImageZoom: Record<number, number>;
  setConfImageZoom: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  confImagePan: Record<number, { x: number; y: number }>;
  setConfImagePan: React.Dispatch<React.SetStateAction<Record<number, { x: number; y: number }>>>;
  confImageDragRef: React.MutableRefObject<{ pn: number; startX: number; startY: number; baseX: number; baseY: number } | null>;
  openPageModal: (pn: number) => void;

  // Export
  xlsInputRef: React.RefObject<HTMLInputElement | null>;
  handleTemplateUpload: (file: File) => void;
  xlsTemplateSaved: boolean;
  setXlsTemplateSaved: React.Dispatch<React.SetStateAction<boolean>>;
  xlsTemplate: ArrayBuffer | null;
  xlsTemplateName: string | null;
  xlsTemplateHdrs: string[] | null;
  handleErpUploadExport: () => void;
  handleExcelExport: () => void;
  handleExport: (headers: string[], rows: (string | number | null)[][], suffix: string) => void;

  // Table data
  CONF_HEADERS: string[];
  confRows: (string | number | null | undefined)[][];
  collapsedConfCols: Set<string>;
  setCollapsedConfCols: React.Dispatch<React.SetStateAction<Set<string>>>;
  confPageTotals: Map<number, number>;

  // Row state
  permanentlyDeletedRawRows: Set<number>;
  isRowDbDeleted: (ri: number) => boolean;
  hiddenRawRows: Set<number>;
  pageNums: number[];
  cancelledRows: Set<number>;
  selectedCands: Record<number, CandidateInfo>;
  cancelledAutoSyn: Set<number>;
  setCancelledAutoSyn: React.Dispatch<React.SetStateAction<Set<number>>>;

  // Per-page state
  rawSupplierByPage: Record<number, string>;
  pageVatIncluded: Record<number, boolean>;
  pageDateOverride: Record<number, string>;
  setPageDateOverride: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  editingConfDate: number | null;
  setEditingConfDate: (v: number | null) => void;
  editingConfDateVal: string;
  setEditingConfDateVal: (v: string) => void;

  // Row data
  effectiveDispRows: (string | number | null | undefined)[][];

  // Save
  onSaveConfirmed?: ((...args: any[]) => any) | null;
  savingConfirmed: boolean;
  hasMissingSupplier: boolean;
  missingSupplierPages: number[];
  handleSaveConfirmed: (pn?: number) => Promise<void>;
  showError: (msg: string) => void;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
}

export const ConfirmedTableSection: React.FC<ConfirmedTableSectionProps> = ({
  structuredPages, nameIdx, matchItems, confirmed,
  pageImages, confImageCollapsed, setConfImageCollapsed, effectiveInvColWidth, rotation,
  confImageZoom, setConfImageZoom, confImagePan, setConfImagePan, confImageDragRef, openPageModal,
  xlsInputRef, handleTemplateUpload, xlsTemplateSaved, setXlsTemplateSaved,
  xlsTemplate, xlsTemplateName, xlsTemplateHdrs, handleErpUploadExport, handleExcelExport, handleExport,
  CONF_HEADERS, confRows, collapsedConfCols, setCollapsedConfCols, confPageTotals,
  permanentlyDeletedRawRows, isRowDbDeleted, hiddenRawRows, pageNums,
  cancelledRows, selectedCands, cancelledAutoSyn, setCancelledAutoSyn,
  rawSupplierByPage, pageVatIncluded, pageDateOverride, setPageDateOverride,
  editingConfDate, setEditingConfDate, editingConfDateVal, setEditingConfDateVal,
  effectiveDispRows,
  onSaveConfirmed, savingConfirmed, hasMissingSupplier, missingSupplierPages,
  handleSaveConfirmed, showError, confirm,
}) => {
  if (!structuredPages.length || nameIdx < 0 || !matchItems || !confirmed) return null;

  // ── 확정표 페이지별 첫/마지막 렌더 ri 계산 ──
  const _confFirstByPage = new Map<number, number>();
  const _confLastByPage = new Map<number, number>();
  confRows.forEach((r, i) => {
    if (!r || r.length === 0) return;
    if (permanentlyDeletedRawRows.has(i)) return;
    if (isRowDbDeleted(i)) return;
    if (hiddenRawRows.has(i)) return;
    const pn = pageNums[i];
    if (!_confFirstByPage.has(pn)) _confFirstByPage.set(pn, i);
    _confLastByPage.set(pn, i);
  });

  const CONF_COL_WIDTHS: Record<string, number> = {
    "거래일": 82, "확정일": 82, "상품코드": 90, "상품명": 0,
    "공급처": 90, "공급사": 90, "규격": 60, "유통기한": 95,
    "마스터 매입단가": 95,
    "거래일·공급사": 110, "상품코드·상품명": 0,
    "OCR수량": 55, "OCR단가": 78, "OCR금액": 92,
    "매입수량": 55, "매입단가": 78, "매입금액": 92, "매입총계": 92,
    "전표 매입단가": 78, "마스터단가": 78, "판매가": 78, "이익률": 60,
    "잔고": 82, "메모": 60,
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto pl-3 pr-8 box-border">
      <Card variant="raw-sm" padding="none" rounded="2xl" borderColor="border-emerald-200" clip className="w-full">
        {/* 헤더 */}
        <div className="px-4 py-2.5 border-b border-emerald-100 bg-emerald-50 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <CheckCircle size={13} className="text-emerald-600" />
            <span className="text-xs font-bold text-emerald-800">거래명세서 확정표</span>
            {pageImages?.length ? (
              <button type="button"
                onClick={() => setConfImageCollapsed(v => !v)}
                className="ml-1 flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 rounded-lg px-2 py-1 cursor-pointer whitespace-nowrap"
                title={confImageCollapsed ? "명세서 이미지 컬럼 펼치기" : "명세서 이미지 컬럼 접기"}>
                {confImageCollapsed ? "▶ 이미지 펼치기" : "◀ 이미지 접기"}
              </button>
            ) : null}
          </div>
          <XlsxExportSection
            xlsInputRef={xlsInputRef}
            handleTemplateUpload={handleTemplateUpload}
            xlsTemplateSaved={xlsTemplateSaved}
            setXlsTemplateSaved={setXlsTemplateSaved}
            xlsTemplate={xlsTemplate}
            xlsTemplateName={xlsTemplateName}
            xlsTemplateHdrs={xlsTemplateHdrs}
            handleErpUploadExport={handleErpUploadExport}
            handleExcelExport={handleExcelExport}
            handleExport={handleExport}
            confHeaders={CONF_HEADERS}
            confRows={confRows}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse table-fixed">
            <thead>
              <tr className="bg-emerald-50/60 border-b-2 border-emerald-200">
                {pageImages?.length ? (
                  <th
                    className="p-0 text-center bg-gray-50 border-r border-line text-[10px] font-bold text-gray-500 whitespace-nowrap select-none"
                    style={{
                      width: confImageCollapsed ? 24 : effectiveInvColWidth,
                      minWidth: confImageCollapsed ? 24 : effectiveInvColWidth,
                      maxWidth: confImageCollapsed ? 24 : effectiveInvColWidth,
                    }}
                  >
                    <div style={{ padding: "8px 2px", textAlign: "center" }}>
                      {confImageCollapsed ? "▶" : <span>거래명세서</span>}
                    </div>
                  </th>
                ) : null}
                {CONF_HEADERS.map((h, origIdx) => {
                  const collapsed = collapsedConfCols.has(h);
                  const cw = CONF_COL_WIDTHS[h];
                  const cellWidth = collapsed ? undefined : (cw && cw > 0 ? cw : undefined);
                  const isNameCol = h === "상품명";
                  return (
                    <th key={origIdx}
                      onClick={() => setCollapsedConfCols(prev => { const s = new Set(prev); s.has(h) ? s.delete(h) : s.add(h); return s; })}
                      title={collapsed ? `${h} (클릭해서 펼치기)` : "클릭해서 접기"}
                      style={{
                        cursor: "pointer",
                        width: cellWidth,
                        minWidth: collapsed ? 16 : (isNameCol ? 160 : (cellWidth ?? 40)),
                      }}
                      className={`py-2 font-bold select-none transition-colors hover:bg-emerald-100/60 ${
                        collapsed ? "px-1 text-center text-emerald-300 w-4 max-w-[16px]" :
                        CONF_NUM.has(h) ? "px-3 text-right text-emerald-900 whitespace-nowrap" :
                        isNameCol ? "px-3 text-left text-emerald-900 break-words" :
                        "px-3 text-left text-emerald-900 whitespace-nowrap"
                      }`}>
                      {collapsed ? "·" : h}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {confRows.map((row, ri) => {
                if (permanentlyDeletedRawRows.has(ri)) return null;
                if (isRowDbDeleted(ri)) return null;
                if (hiddenRawRows.has(ri)) return null;
                if (!row || row.length === 0) return null;

                const m        = cancelledRows.has(ri) ? null : (selectedCands[ri] ?? matchItems![ri]?.matched ?? null);
                const score    = m?.score ?? 0;
                const masterP  = m?.masterPrice ?? null;
                const invoiceP = row[CONF_HEADERS.indexOf("전표 매입단가")];
                const priceDiff = masterP != null && typeof invoiceP === "number" && invoiceP !== masterP
                  ? (invoiceP > masterP ? "high" : "low") : null;
                const pn = pageNums[ri];
                const isFirstInPage = ri === _confFirstByPage.get(pn);
                const isLastInPage = ri === _confLastByPage.get(pn);
                const isPageCollapsedConf = false;
                const pageRowCountConf = isFirstInPage
                  ? confRows.filter((r, i) => r.length > 0 && pageNums[i] === pn
                      && !permanentlyDeletedRawRows.has(i) && !isRowDbDeleted(i) && !hiddenRawRows.has(i)).length
                  : 0;
                const pageSupplierHeadConf = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";

                const MIN_PAGE_HEIGHT = 240;
                const naturalHeightConf = 44 + 34 + pageRowCountConf * 36;
                const shortfallConf = Math.max(0, MIN_PAGE_HEIGHT - naturalHeightConf);
                const imgCellHeightConf = naturalHeightConf + shortfallConf + 24;
                const imgRowSpanConf = isFirstInPage ? 3 + pageRowCountConf : 0;

                return (
                  <React.Fragment key={ri}>
                    {isFirstInPage && (
                      <tr className="bg-emerald-100/70 border-t-2 border-emerald-300 select-none">
                        {pageImages?.length ? (
                          <td
                            rowSpan={imgRowSpanConf}
                            className="align-top bg-gray-50 border-r border-line"
                            style={{
                              width: confImageCollapsed ? 24 : effectiveInvColWidth,
                              minWidth: confImageCollapsed ? 24 : effectiveInvColWidth,
                              maxWidth: confImageCollapsed ? 24 : effectiveInvColWidth,
                              height: imgCellHeightConf,
                              verticalAlign: "top",
                              padding: 0,
                              overflow: "hidden",
                            }}
                          >
                            {confImageCollapsed ? (
                              <button type="button" onClick={() => setConfImageCollapsed(false)}
                                className="w-full h-full flex items-center justify-center text-emerald-500 text-[11px] font-bold hover:bg-emerald-50 cursor-pointer"
                                title="이미지 펼치기">▶</button>
                            ) : (() => {
                              const imgSrc = pageImages[pn - 1];
                              if (!imgSrc) return (
                                <div className="flex items-center justify-center h-full p-3 text-[11px] text-gray-400">이미지 없음</div>
                              );
                              const isPortraitRotated = rotation === 90 || rotation === -90 || rotation === 270;
                              const zoom = confImageZoom[pn] ?? 1;
                              const pan = confImagePan[pn] ?? { x: 0, y: 0 };
                              const canDrag = zoom > 1;
                              return (
                                <div className="relative w-full h-full overflow-hidden bg-gray-50">
                                  <div className="absolute top-1 right-1 z-10 flex flex-col gap-0.5 bg-white/95 border border-zinc-300 rounded shadow-sm">
                                    <button type="button"
                                      onClick={e => { e.stopPropagation(); setConfImageZoom(prev => ({ ...prev, [pn]: Math.min(4, (prev[pn] ?? 1) + 0.25) })); }}
                                      className="text-[11px] font-bold px-1.5 py-0.5 hover:bg-emerald-50 cursor-pointer" title="확대">+</button>
                                    <button type="button"
                                      onClick={e => { e.stopPropagation(); setConfImageZoom(prev => ({ ...prev, [pn]: Math.max(0.5, (prev[pn] ?? 1) - 0.25) })); }}
                                      className="text-[11px] font-bold px-1.5 py-0.5 hover:bg-emerald-50 cursor-pointer border-t border-line" title="축소">−</button>
                                    <button type="button"
                                      onClick={e => { e.stopPropagation(); setConfImageZoom(prev => { const n = { ...prev }; delete n[pn]; return n; }); setConfImagePan(prev => { const n = { ...prev }; delete n[pn]; return n; }); }}
                                      className="text-[9px] font-bold px-1.5 py-0.5 hover:bg-zinc-100 cursor-pointer border-t border-line" title="원본 크기">⛶</button>
                                  </div>
                                  <div
                                    onMouseDown={canDrag ? e => {
                                      e.preventDefault();
                                      confImageDragRef.current = { pn, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y };
                                    } : undefined}
                                    onClick={e => { if (!canDrag) { e.stopPropagation(); openPageModal(pn); } }}
                                    className="w-full h-full flex items-start justify-center p-1.5 overflow-hidden"
                                    style={{ cursor: canDrag ? (confImageDragRef.current?.pn === pn ? "grabbing" : "grab") : "zoom-in" }}
                                    title={canDrag ? "드래그로 이동 · +/- 로 확대·축소" : `${pn}번 명세서 이미지 · 클릭 확대`}
                                  >
                                    <img
                                      src={imgSrc}
                                      alt={`${pn}번 거래명세서`}
                                      draggable={false}
                                      style={{
                                        display: "block", margin: "0 auto",
                                        transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                                        transformOrigin: "top center",
                                        transition: confImageDragRef.current?.pn === pn ? "none" : "transform 0.15s ease-out",
                                        maxWidth: isPortraitRotated ? "60%" : "100%",
                                        width: "auto", height: "auto", objectFit: "contain",
                                        userSelect: "none",
                                        pointerEvents: canDrag ? "none" : "auto",
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        ) : null}
                        <td colSpan={CONF_HEADERS.length} className="px-4 text-center overflow-hidden" style={{ height: 44, minHeight: 44, maxHeight: 44, lineHeight: "1.2" }}>
                          <span className="inline-flex items-center gap-4 text-[14px] font-bold text-emerald-800 flex-wrap justify-center">
                            <span className="bg-white border border-emerald-300 rounded px-2 py-0.5 text-emerald-700 text-[14px]">{pn}번 명세서</span>
                            {pageSupplierHeadConf && <span className="text-emerald-700 font-bold text-[15px]">{pageSupplierHeadConf}</span>}
                            <Badge tone={pageVatIncluded[pn] ? "amber" : "zinc"} size="xs">
                              {pageVatIncluded[pn] ? "VAT 별도" : "VAT 포함"}
                            </Badge>
                            {(confPageTotals.get(pn) ?? 0) > 0 && (
                              <>
                                <button type="button"
                                  onClick={async e => {
                                    e.stopPropagation();
                                    if (!onSaveConfirmed) return;
                                    const invDate = pageDateOverride[pn] ?? structuredPages.find(p => p.page === pn)?.meta?.date ?? "";
                                    const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta?.supplier ?? "";
                                    if (!supp) { showError(`${pn}번 명세서 · 공급사 없음 · 저장 불가`); return; }
                                    if (!await confirm({ message: `${pn}번 · "${supp}" · ${invDate || "날짜미상"}\n· DB 저장하시겠습니까?` })) return;
                                    try {
                                      const q = new URLSearchParams();
                                      if (invDate) q.set("invoice_date", invDate);
                                      q.set("supplier", supp);
                                      const chk = await api.get<{ items?: any[] }>(`/api/ocr-confirmed-items?${q}`)
                                        .then(({ data }) => data)
                                        .catch(() => ({ items: [] } as { items?: any[] }));
                                      const existing = Array.isArray(chk?.items) ? chk.items : [];
                                      if (existing.length > 0) {
                                        if (!await confirm({ message: `이미 ${existing.length}건 저장됨 · 덮어쓰시겠습니까?`, danger: true })) return;
                                        for (const it of existing) if (it.id) await api.del(`/api/ocr-confirmed-items/${it.id}`).catch(() => {});
                                      }
                                    } catch { /* skip check */ }
                                    await handleSaveConfirmed(pn);
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white tracking-tight bg-rose-600 hover:bg-rose-500 border border-rose-800 rounded-md px-3.5 py-1.5 cursor-pointer whitespace-nowrap transition-all duration-150 ease-out shadow-sm hover:shadow-md hover:-translate-y-[1px] active:translate-y-0 active:shadow-inner active:bg-rose-700"
                                  title={`${pn}번 명세서 · 확정표 DB 저장`}
                                >💾 거래명세서 DB저장</button>
                                <span className="text-[14px] font-bold text-emerald-900">총 소계 <span className="text-emerald-700">{fmt(confPageTotals.get(pn) ?? 0)}</span>원</span>
                              </>
                            )}
                          </span>
                        </td>
                      </tr>
                    )}
                    {isFirstInPage && (
                      <tr className="bg-emerald-50/60 border-b border-emerald-200 select-none" style={{ height: 34, minHeight: 34, maxHeight: 34 }}>
                        {CONF_HEADERS.map((h, oi) => {
                          const collapsed = collapsedConfCols.has(h);
                          const twoLine =
                            h === "마스터 매입단가" ? ["마스터", "매입단가"] :
                            h === "전표 매입단가" ? ["전표", "매입단가"] :
                            h === "거래일·공급사" ? ["거래일", "공급사"] :
                            h === "상품코드·상품명" ? ["상품코드", "상품명"] :
                            null;
                          return (
                            <th key={oi}
                              className={`py-1 font-bold text-[11px] text-emerald-800 leading-tight ${
                                collapsed ? "px-0 text-center w-4" : "px-3 text-center whitespace-nowrap"
                              }`}>
                              {collapsed ? "·" : twoLine ? (
                                <span className="flex flex-col items-center">
                                  <span>{twoLine[0]}</span>
                                  <span>{twoLine[1]}</span>
                                </span>
                              ) : h}
                            </th>
                          );
                        })}
                      </tr>
                    )}
                    {!isPageCollapsedConf && (
                      <tr
                        className={`border-t border-gray-100 transition-colors hover:bg-indigo-50/40 align-middle ${ri % 2 !== 0 ? "bg-gray-50/30" : ""}`}
                        style={{ height: 36, maxHeight: 36, overflow: "hidden" }}
                      >
                        {CONF_HEADERS.map((h, origIdx) => {
                          const ci = origIdx;
                          if (collapsedConfCols.has(h)) return <td key={origIdx} className="px-0 py-2 w-1 max-w-[4px] bg-emerald-50/30" />;
                          const cell        = row[ci];
                          const isNum       = typeof cell === "number";
                          const isName      = h === "상품코드·상품명";
                          const isDateSupp  = h === "거래일·공급사";
                          const isMasterP   = h === "마스터 매입단가";
                          const isInvoiceP  = h === "전표 매입단가";
                          const isProfitR   = h === "이익률";
                          const isBalance   = h === "공급사잔고";
                          const isSpec      = h === "규격";

                          if ((isDateSupp || isName) && cell != null) {
                            const [line1, line2] = String(cell).split("\n");
                            const cellCls = isName
                              ? "px-3 py-1 align-middle min-w-[260px] max-w-[360px] whitespace-normal break-words text-center overflow-hidden"
                              : "px-3 py-1 align-middle whitespace-nowrap text-center overflow-hidden";
                            return (
                              <td key={ci} className={cellCls}>
                                <div className="flex flex-col leading-tight gap-0.5 items-center justify-center">
                                  <span className={isName ? "text-gray-400 text-[11px] font-mono" : "text-gray-500 text-[11px] font-mono"}>{line1 || "—"}</span>
                                  {line2 && (
                                    <span className={isName
                                      ? `font-semibold text-[13px] leading-snug break-words text-center ${m ? (score >= 80 ? "text-emerald-700" : score >= 50 ? "text-amber-700" : "text-rose-600") : "text-rose-500 italic"}`
                                      : "font-bold text-emerald-700 text-[12px] whitespace-nowrap"}>{line2}</span>
                                  )}
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td key={ci}
                              className={`px-3 py-1.5 align-middle text-center ${isSpec || isName ? "whitespace-normal max-w-[240px]" : "whitespace-nowrap"} ${
                                h === "매입총계"              ? "font-bold text-emerald-700" :
                                isMasterP                    ? `font-bold ${priceDiff ? "text-blue-600" : "text-blue-400"}` :
                                isInvoiceP && priceDiff === "high" ? "font-bold text-rose-600" :
                                isInvoiceP && priceDiff === "low"  ? "font-bold text-blue-600" :
                                isInvoiceP                   ? "text-gray-700" :
                                isProfitR                    ? "text-emerald-700 font-semibold" :
                                isBalance                    ? "text-indigo-600 font-bold" :
                                isNum                        ? "text-gray-700" :
                                h === "상품코드"             ? "text-gray-400 text-[11px] font-mono" :
                                h === "유통기한"             ? "text-gray-500 text-[11px]" :
                                isSpec                       ? "text-gray-400 text-[11px]" :
                                h === "거래일"               ? "text-gray-500 text-[11px]" :
                                isName ? `font-semibold ${m ? (score >= 80 ? "text-emerald-700" : score >= 50 ? "text-amber-700" : "text-rose-600") : "text-rose-500 italic"}` :
                                         "text-gray-600"
                              }`}>
                              {h === "거래일" ? (
                                editingConfDate === pn ? (
                                  <input type="text" inputMode="text" autoFocus
                                    value={editingConfDateVal}
                                    placeholder="YYYY-MM-DD"
                                    onChange={e => setEditingConfDateVal(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                      if (e.key === "Escape") { setEditingConfDate(null); setEditingConfDateVal(""); }
                                    }}
                                    onBlur={() => {
                                      const v = editingConfDateVal.trim();
                                      if (v) setPageDateOverride(prev => ({ ...prev, [pn]: v }));
                                      else setPageDateOverride(prev => { const n = { ...prev }; delete n[pn]; return n; });
                                      setEditingConfDate(null); setEditingConfDateVal("");
                                    }}
                                    className="w-[100px] text-[11px] bg-white border border-emerald-400 rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep"
                                  />
                                ) : (
                                  <button type="button"
                                    onClick={() => { setEditingConfDate(pn); setEditingConfDateVal(cell != null ? String(cell) : ""); }}
                                    className={`cursor-pointer hover:underline ${cell == null ? "text-gray-400 italic" : ""}`}
                                    title="클릭하여 거래일 편집"
                                  >
                                    {cell != null ? String(cell) : "날짜 입력..."}
                                  </button>
                                )
                              ) : cell == null
                                ? isMasterP
                                  ? <span className="text-rose-500 font-bold text-xs">✕</span>
                                  : <span className="text-gray-300">—</span>
                                : isProfitR && isNum ? `${cell}%`
                                : isNum ? fmt(cell)
                                : isName ? (() => {
                                    const origOcr = effectiveDispRows[ri]?.[CONF_HEADERS.indexOf("상품명")] != null
                                      ? String(effectiveDispRows[ri][CONF_HEADERS.indexOf("상품명")] ?? "").trim()
                                      : null;
                                    const hasCorrected = origOcr && String(cell) !== origOcr;
                                    const isCancelled = cancelledAutoSyn.has(ri);
                                    return (
                                      <div className="flex items-start gap-1">
                                        <span className="block break-words line-clamp-2 flex-1">{String(cell)}</span>
                                        {hasCorrected && !isCancelled && (
                                          <button
                                            onClick={e => { e.stopPropagation(); setCancelledAutoSyn(prev => new Set([...prev, ri])); }}
                                            title={`취소 → 원본: ${origOcr}`}
                                            className="text-[10px] px-1 py-px rounded bg-rose-100 text-rose-600 hover:bg-rose-200 cursor-pointer shrink-0 mt-0.5">✕</button>
                                        )}
                                        {hasCorrected && isCancelled && (
                                          <button
                                            onClick={e => { e.stopPropagation(); setCancelledAutoSyn(prev => { const n = new Set(prev); n.delete(ri); return n; }); }}
                                            title="보정 복원"
                                            className="text-[10px] px-1 py-px rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer shrink-0 mt-0.5">↩</button>
                                        )}
                                      </div>
                                    );
                                  })()
                                : isSpec ? <span className="block break-words line-clamp-2">{String(cell)}</span>
                                : String(cell)}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {isLastInPage && (
                      <tr aria-hidden="true" style={{ height: shortfallConf + 24 }}>
                        <td colSpan={CONF_HEADERS.length} className="bg-zinc-50 border-b-2 border-line" style={{ padding: 0 }} />
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {onSaveConfirmed && (
          <div className="px-4 py-3 flex justify-end items-center gap-3 border-t border-emerald-100 bg-white">
            {hasMissingSupplier && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-300 rounded px-2 py-0.5">
                <AlertTriangle size={10} className="shrink-0" />
                공급사 미입력 ({missingSupplierPages.join(", ")}번) — 저장 차단
              </span>
            )}
            <button
              type="button"
              onClick={() => handleSaveConfirmed()}
              disabled={savingConfirmed || hasMissingSupplier}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0 shadow-sm"
              title={hasMissingSupplier ? `공급사 미입력 페이지 (${missingSupplierPages.join(", ")}번) 를 먼저 채워주세요` : "현재 표시된 항목들을 확정표(DB)에 저장합니다"}
            >
              {savingConfirmed
                ? <><Spinner size={12} />저장 중</>
                : <><Save size={12} />확정표 저장</>}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
