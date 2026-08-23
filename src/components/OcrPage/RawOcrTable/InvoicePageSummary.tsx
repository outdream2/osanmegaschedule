import React from "react";
import { Wand2, Check } from "lucide-react";
import { Spinner } from "../../common/Spinner";
import { fmt, parseNumber } from "./utils";
import type { SummaryEdit, DiscountInfo } from "./RawInvoiceCard.types";
import type { RawPage } from "./types";

interface InvoicePageSummaryProps {
  pn: number;
  totalColSpan: number;
  rawSupplierByPage: Record<number, string>;
  structuredPages: RawPage[];
  effectivePageTotals: Map<number, number>;
  pageSubtotalChoices: Record<number, "stated" | "computed" | "custom">;
  pageSubtotalCustom: Record<number, number>;
  pageVatIncluded: Record<number, boolean>;
  pageDiscountApplied: Record<number, boolean>;
  pageSupplierBalances: Record<number, number>;
  pageBalanceOverride: Record<number, number>;
  pageBalanceModeManual: Set<number>;
  pageBalanceManualInput: Record<number, string>;
  editingSummary: SummaryEdit | null;
  hasMissingSupplier: boolean;
  confirmedPages: Set<number>;
  erpSubRowPages: Set<number>;
  matchingPage: Record<number, boolean>;
  matchItems: any[] | null;
  getPageDisplayTotal: (pn: number) => number;
  getPageDiscounts: (pn: number) => DiscountInfo[];
  openVendorEdit: (name: string) => void;
  setPageSubtotalChoices: React.Dispatch<React.SetStateAction<Record<number, "stated" | "computed" | "custom">>>;
  setPageSubtotalCustom: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setPageVatIncluded: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  setPageDiscountApplied: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  setPageDiscountOverride: React.Dispatch<React.SetStateAction<Record<number, { amount: number; label: string }>>>;
  setPageBalanceOverride: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setPageBalanceModeManual: React.Dispatch<React.SetStateAction<Set<number>>>;
  setEditingSummary: React.Dispatch<React.SetStateAction<SummaryEdit | null>>;
  saveSupplierBalance: (name: string, amount: number, date: string | null) => void;
  setErpSubRowPages: React.Dispatch<React.SetStateAction<Set<number>>>;
  setConfirmedPages: React.Dispatch<React.SetStateAction<Set<number>>>;
  setConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  handleMatchPage: (pn: number) => Promise<void>;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
}

export const InvoicePageSummary: React.FC<InvoicePageSummaryProps> = ({
  pn, totalColSpan,
  rawSupplierByPage, structuredPages,
  effectivePageTotals, pageSubtotalChoices, pageSubtotalCustom,
  pageVatIncluded, pageDiscountApplied,
  pageSupplierBalances, pageBalanceOverride, pageBalanceModeManual, pageBalanceManualInput,
  editingSummary,
  hasMissingSupplier, confirmedPages, erpSubRowPages, matchingPage, matchItems,
  getPageDisplayTotal, getPageDiscounts,
  openVendorEdit,
  setPageSubtotalChoices, setPageSubtotalCustom, setPageVatIncluded,
  setPageDiscountApplied, setPageDiscountOverride,
  setPageBalanceOverride, setPageBalanceModeManual, setEditingSummary,
  saveSupplierBalance,
  setErpSubRowPages, setConfirmedPages, setConfirmed,
  handleMatchPage, confirm,
}) => {
  const pageSupplier = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
  const rowSum = effectivePageTotals.get(pn) ?? 0;
  const displayTotal = getPageDisplayTotal(pn);
  const isCustom = pageSubtotalChoices[pn] === "custom";
  const shown = isCustom ? displayTotal : rowSum;
  const discs = getPageDiscounts(pn);
  const balForShow = pageSupplierBalances[pn] ?? pageBalanceOverride[pn];
  const manualBalForShow = pageBalanceModeManual.has(pn) ? parseNumber(pageBalanceManualInput[pn] ?? "") : 0;
  const displayBalForShow = balForShow ?? (manualBalForShow > 0 ? manualBalForShow : null);
  const isConfirmed = confirmedPages.has(pn);
  const hasErpSubRow = erpSubRowPages.has(pn);

  return (
    <tr className="border-t-2 border-amber-400">
      <td
        colSpan={totalColSpan}
        className="px-0 py-0"
        style={{ background: "linear-gradient(90deg, #fef3c7 0%, #ffedd5 55%, #fed7aa 100%)" }}
      >
        <div className="flex flex-col gap-0 px-3 py-2">
          <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-[12px] font-bold text-amber-700 whitespace-nowrap">{pn}번</span>
              {pageSupplier ? (
                <button type="button"
                  onClick={e => { e.stopPropagation(); openVendorEdit(pageSupplier); }}
                  className="text-[14px] font-bold text-amber-900 whitespace-nowrap hover:text-amber-600 cursor-pointer transition truncate max-w-[160px]"
                  title="클릭 · 공급사 정보 조회·수정"
                >{pageSupplier}</button>
              ) : (
                <span className="text-[13px] font-bold text-amber-400 italic">공급사 미지정</span>
              )}
              <span className="text-[12px] font-semibold text-amber-700">총</span>

              {/* ── 소계 입력 ── */}
              {isCustom ? (
                <>
                  <input type="text" inputMode="numeric"
                    value={(() => { const raw = String(pageSubtotalCustom[pn] ?? ""); const n = parseNumber(raw); return n > 0 ? fmt(n) : raw; })()}
                    onChange={e => { const raw = e.target.value.replace(/[^\d-]/g, ""); setPageSubtotalCustom(prev => ({ ...prev, [pn]: parseNumber(raw) })); }}
                    placeholder="금액"
                    className="w-[110px] text-[16px] font-bold text-amber-900 bg-white border-2 border-amber-400 rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep text-right"
                    autoFocus
                  />
                  <span className="text-[16px] font-bold text-amber-900">원</span>
                  <button type="button" onClick={() => setPageSubtotalChoices(prev => { const n = { ...prev }; delete n[pn]; return n; })}
                    className="text-[10px] font-bold text-zinc-500 hover:text-zinc-700 underline"
                  >취소</button>
                </>
              ) : (
                <>
                  {(() => {
                    const vatOn = !!pageVatIncluded[pn];
                    const finalShown = vatOn ? Math.round(shown * 1.1) : shown;
                    const vatAmount = vatOn ? Math.round(shown * 0.1) : 0;
                    return (
                      <>
                        <input type="text" inputMode="numeric"
                          value={(() => {
                            if (editingSummary?.pn === pn && editingSummary.kind === "subtotal") return editingSummary.value;
                            return fmt(finalShown);
                          })()}
                          placeholder={fmt(finalShown)}
                          onFocus={() => setEditingSummary({ pn, kind: "subtotal", value: "", dirty: false })}
                          onChange={e => setEditingSummary({ pn, kind: "subtotal", value: e.target.value, dirty: true })}
                          onBlur={() => {
                            if (!editingSummary || editingSummary.pn !== pn || (editingSummary.kind as string) !== "subtotal") { setEditingSummary(null); return; }
                            if (!editingSummary.dirty) { setEditingSummary(null); return; }
                            const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                            if (n > 0) {
                              setPageSubtotalChoices(prev => ({ ...prev, [pn]: "custom" }));
                              setPageSubtotalCustom(prev => ({ ...prev, [pn]: n }));
                            } else {
                              setPageSubtotalChoices(prev => { const c = { ...prev }; delete c[pn]; return c; });
                              setPageSubtotalCustom(prev => { const c = { ...prev }; delete c[pn]; return c; });
                            }
                            setEditingSummary(null);
                          }}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSummary(null); }}
                          className="w-[130px] text-[16px] font-bold text-amber-900 bg-amber-50 border border-amber-300 hover:border-amber-500 focus:bg-white rounded px-2 py-0.5 focus:outline-none focus:border-brand-deep text-right tracking-tight"
                          title={vatOn ? `공급가액 ${fmt(shown)} + VAT ${fmt(vatAmount)} · 클릭하여 수정` : "금액 컬럼 합 · 클릭하여 수정"}
                        />
                        <span className="text-[14px] font-bold text-amber-900">원</span>
                        {vatOn && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-100 border border-amber-300 rounded px-1 py-px whitespace-nowrap">
                            +VAT {fmt(vatAmount)}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  <label className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 cursor-pointer hover:text-amber-900 ml-1"
                    title="체크 시 · 소계에 VAT 10% 자동 합산 (매입총계 · 정산 반영)">
                    <input type="checkbox"
                      checked={!!pageVatIncluded[pn]}
                      onChange={e => setPageVatIncluded(prev => ({ ...prev, [pn]: e.target.checked }))}
                      className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
                    />
                    VAT 별도
                  </label>
                </>
              )}

              {/* ── 정산차액 ── */}
              <span className="text-[12px] font-semibold text-orange-700 ml-2"
                title={discs.length > 0 ? discs.map(d => `${d.label}: ${fmt(d.amount)}`).join(" · ") : "차액·에누리·할인 자동 감지"}>정산차액</span>
              {(() => {
                const totalDisc = discs.reduce((s, d) => s + d.amount, 0);
                return (
                  <input type="text" inputMode="numeric"
                    value={
                      editingSummary?.pn === pn && editingSummary.kind === "discount"
                        ? editingSummary.value
                        : (totalDisc > 0 ? String(totalDisc) : "")
                    }
                    placeholder={totalDisc > 0 ? String(totalDisc) : "0"}
                    onFocus={() => setEditingSummary({ pn, kind: "discount", value: "", dirty: false })}
                    onChange={e => setEditingSummary({ pn, kind: "discount", value: e.target.value, dirty: true })}
                    onBlur={() => {
                      if (!editingSummary || editingSummary.pn !== pn || editingSummary.kind !== "discount") { setEditingSummary(null); return; }
                      if (!editingSummary.dirty) { setEditingSummary(null); return; }
                      const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                      if (n > 0) setPageDiscountOverride(prev => ({ ...prev, [pn]: { amount: n, label: "수정" } }));
                      else setPageDiscountOverride(prev => { const c = { ...prev }; delete c[pn]; return c; });
                      setEditingSummary(null);
                    }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSummary(null); }}
                    className="w-[110px] text-[13px] font-bold text-orange-800 bg-orange-50 border border-orange-300 hover:border-orange-500 focus:bg-white rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep text-right"
                  />
                );
              })()}
              {(() => {
                const anyValid = discs.some(d => d.valid !== false);
                const anyInvalid = discs.some(d => d.valid === false);
                const explicit = pageDiscountApplied[pn];
                const isChecked = explicit !== undefined ? explicit : anyValid;
                return (
                  <label className={`inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer transition ${anyInvalid ? "text-zinc-400 hover:text-zinc-600" : "text-orange-700 hover:text-orange-900"}`}
                    title={anyInvalid
                      ? "수식 미매칭 (rowsSum - stated ≠ 정산차액) · 자동 미적용 · 체크로 강제 적용 가능"
                      : "체크 시 · 매입총계에서 정산차액 반영 · 해제 시 소계 그대로"}>
                    <input type="checkbox"
                      checked={isChecked}
                      onChange={e => setPageDiscountApplied(prev => ({ ...prev, [pn]: e.target.checked }))}
                      className={`w-3.5 h-3.5 cursor-pointer ${anyInvalid ? "accent-zinc-400" : "accent-orange-500"}`}
                    />{anyInvalid ? "적용(⚠수식×)" : "적용"}
                  </label>
                );
              })()}

              {/* ── 미수금 ── */}
              <span className="text-[12px] font-semibold text-rose-700 ml-2" title="잔고 = 미수금 (동의어)">미수금</span>
              <input type="text" inputMode="numeric"
                value={
                  editingSummary?.pn === pn && editingSummary.kind === "balance"
                    ? editingSummary.value
                    : (displayBalForShow != null && displayBalForShow > 0 ? String(displayBalForShow) : "")
                }
                placeholder={displayBalForShow != null && displayBalForShow > 0 ? String(displayBalForShow) : "0"}
                onFocus={() => setEditingSummary({ pn, kind: "balance", value: "", dirty: false })}
                onChange={e => setEditingSummary({ pn, kind: "balance", value: e.target.value, dirty: true })}
                onBlur={() => {
                  if (!editingSummary || editingSummary.pn !== pn || editingSummary.kind !== "balance") { setEditingSummary(null); return; }
                  if (!editingSummary.dirty) { setEditingSummary(null); return; }
                  const n = parseNumber(editingSummary.value.replace(/[^\d-]/g, ""));
                  if (n > 0) {
                    setPageBalanceOverride(prev => ({ ...prev, [pn]: n }));
                    setPageBalanceModeManual(prev => { const s = new Set(prev); s.delete(pn); return s; });
                    const supForSave = (rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "").trim();
                    const dateForSave = structuredPages.find(p => p.page === pn)?.meta.date ?? null;
                    if (supForSave) {
                      saveSupplierBalance(supForSave, n, dateForSave);
                      console.log(`[미수금 저장] "${supForSave}" ${dateForSave ?? "날짜없음"} → ${n}원`);
                    }
                  } else {
                    setPageBalanceOverride(prev => { const c = { ...prev }; delete c[pn]; return c; });
                  }
                  setEditingSummary(null);
                }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSummary(null); }}
                className="w-[110px] text-[13px] font-bold text-rose-800 bg-rose-50 border border-rose-300 hover:border-rose-500 focus:bg-white rounded px-1.5 py-0.5 focus:outline-none focus:border-brand-deep text-right"
              />

              {/* ── ERP 매칭 · 확정 버튼 ── */}
              {!hasMissingSupplier && (
                <div className="basis-full flex items-center gap-1 mt-1 flex-wrap">
                  <button type="button"
                    onClick={async () => {
                      setErpSubRowPages(prev => new Set([...prev, pn]));
                      await handleMatchPage(pn);
                    }}
                    disabled={!!matchingPage[pn]}
                    className={`text-[13px] font-bold text-white disabled:bg-zinc-300 disabled:cursor-not-allowed border-2 rounded-lg px-3 py-1 cursor-pointer whitespace-nowrap inline-flex items-center gap-1 shadow-md ring-1 transition shrink-0 ${
                      hasErpSubRow
                        ? "bg-violet-500 hover:bg-violet-600 border-violet-700 ring-violet-200"
                        : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border-indigo-700 ring-indigo-200"
                    }`}
                    title={hasErpSubRow ? `${pn}번 · ERP 재매칭` : `${pn}번 · ERP 매칭 실행 · 각 행 아래 ERP 정보 표시`}
                  >
                    {matchingPage[pn]
                      ? (<><Spinner size={12} /> 매칭중...</>)
                      : (<><Wand2 size={12} /> ERP 매칭</>)}
                  </button>
                  <button type="button"
                    onClick={async () => {
                      const supp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "미상";
                      if (!await confirm({ message: `${pn}번 명세서 · "${supp}" · 확정하시겠습니까?\n(3차 거래명세서 확정표에 추가됩니다)` })) return;
                      if (!matchItems || !hasErpSubRow) {
                        await handleMatchPage(pn);
                        setErpSubRowPages(prev => new Set([...prev, pn]));
                      }
                      setConfirmedPages(prev => new Set([...prev, pn]));
                      setConfirmed(true);
                    }}
                    disabled={!!matchingPage[pn]}
                    className={`text-[13px] font-bold text-white disabled:bg-zinc-300 disabled:cursor-not-allowed border-2 rounded-lg px-3 py-1 cursor-pointer whitespace-nowrap inline-flex items-center gap-1 shadow-md ring-1 transition shrink-0 ${
                      isConfirmed
                        ? "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border-emerald-800 ring-emerald-200"
                        : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] border-emerald-700 ring-emerald-200 animate-pulse"
                    }`}
                    title={isConfirmed ? `${pn}번 · 확정 완료 · 확정표 반영` : `${pn}번 · 확정 → 3차 거래명세서 확정표에 반영`}
                  >
                    {isConfirmed ? (<><Check size={12} /> 확정완료</>) : (<><Check size={12} /> 확정</>)}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
};
