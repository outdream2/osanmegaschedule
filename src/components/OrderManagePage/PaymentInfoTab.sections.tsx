// 2026-08-22 · Framework Phase 4 · PaymentInfoTab.tsx large-file 분리
// 우측 패널의 3개 독립 섹션 (pure-display · props-driven · 상태 없음)
//   · MonthlyBreakdownSection · 7행 요약표 (공급사 3행 + 판매 3행)
//   · RecentPaymentsSection · 최근 결제 내역 리스트
//   · ProductSummarySection · 상품별 매입 요약 (정렬·컬럼리사이즈)

import React from "react";
import {
  Wallet, RefreshCw, Layers,
  ReceiptText, ArrowRight, Package2, Coins,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { PeriodSelector, PERIOD_MONTHS_PRESET } from "../common/PeriodSelector";
import { IconTile } from "../common/IconTile";
import { Spinner } from "../common/Spinner";
import { RESIZER_CLS } from "../../hooks/useColumnResize";
import type {
  PaymentRow, SalesStockBreakdown, ProductPurchaseSummary, ProdSortKey,
} from "./PaymentInfoTab.types";
import { fmtMonthShort, fmtWonShort, methodLabel, methodTone, recentMonthKeys } from "./PaymentInfoTab.utils";

// ═══════════════════════════════════════════════════════════════════════════
// 1) MonthlyBreakdownSection · 7행 요약표
// ═══════════════════════════════════════════════════════════════════════════

interface MonthlyBreakdownSectionProps {
  salesStockBreakdown: SalesStockBreakdown | null;
  breakdownMonths: number;
  setBreakdownMonths: (v: number) => void;
  salesStockLoading: boolean;
  balanceLoading: boolean;
}

export const MonthlyBreakdownSection: React.FC<MonthlyBreakdownSectionProps> = ({
  salesStockBreakdown, breakdownMonths, setBreakdownMonths, salesStockLoading, balanceLoading,
}) => {
  const months = salesStockBreakdown?.months ?? recentMonthKeys(breakdownMonths);
  const purMap = salesStockBreakdown?.purchases ?? {};
  const payMap = salesStockBreakdown?.payments ?? {};
  const salesMap = salesStockBreakdown?.sales ?? {};
  // 월별 잔고 = 월별 매입 - 월별 결제
  const balMap: Record<string, number> = {};
  for (const k of months) balMap[k] = (purMap[k] ?? 0) - (payMap[k] ?? 0);
  const totals = salesStockBreakdown?.totals ?? { purchases: 0, payments: 0, balance: 0, sales: 0, stockValue: 0 };
  const fmt = (n: number) => n === 0 ? "-" : fmtWonShort(n);
  const showLoading = salesStockLoading || balanceLoading;

  return (
    <div className="overflow-hidden rounded-lg border border-line shadow-xs">
      {/* 상단 · 제목 + PeriodSelector */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50/80 border-b border-line">
        <span className="text-[15px] font-bold text-zinc-700">월별 요약</span>
        <PeriodSelector
          options={PERIOD_MONTHS_PRESET}
          value={breakdownMonths}
          onChange={(v) => setBreakdownMonths(v as number)}
          accent="teal"
          size="sm"
          className="ml-auto"
          ariaLabel="월별 요약 기간 선택"
        />
        {showLoading && <Spinner size={11} tone="zinc" />}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[14px] tabular-nums">
        <thead className="bg-zinc-50/80 text-[15px] font-bold uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="text-center px-2 py-1.5 w-[56px] border-r border-line">카테고리</th>
            <th className="text-left px-2 py-1.5 w-[64px]">항목</th>
            {months.map(k => (
              <th key={k} className="text-right px-2 py-1.5 whitespace-nowrap">
                <span className="inline-flex flex-col items-end leading-tight">
                  <span className="text-zinc-400 text-[15px]">{k.slice(0, 4)}</span>
                  <span>{fmtMonthShort(k)}</span>
                </span>
              </th>
            ))}
            <th className="text-right px-2 py-1.5 whitespace-nowrap text-zinc-700 border-l border-line bg-zinc-50/40">
              <span className="inline-flex items-center gap-1 justify-end"><Layers size={11} />합계</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {/* ── 공급사 카테고리 · 매입/결제/실잔고 (원복 · 사용자 요청) ── */}
          <tr className="bg-white">
            <td rowSpan={3} className="text-center px-2 py-1.5 font-bold text-zinc-600 bg-emerald-50/40 border-r border-line align-middle">
              공급사
            </td>
            <td className="px-2 py-1.5 font-bold text-emerald-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><ReceiptText size={11} />매입</span>
            </td>
            {months.map(k => (
              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(purMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-emerald-800"}`}>
                {fmt(purMap[k] ?? 0)}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-bold text-emerald-800 border-l border-line bg-zinc-50/40">{fmt(totals.purchases)}</td>
          </tr>
          <tr className="bg-zinc-50/40">
            <td className="px-2 py-1.5 font-bold text-sky-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><Wallet size={11} />결제</span>
            </td>
            {months.map(k => (
              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(payMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-sky-800"}`}>
                {fmt(payMap[k] ?? 0)}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-bold text-sky-800 border-l border-line bg-zinc-50/40">{fmt(totals.payments)}</td>
          </tr>
          <tr className="bg-white">
            <td className="px-2 py-1.5 font-bold text-amber-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><Coins size={11} />실잔고</span>
            </td>
            {months.map(k => {
              const v = balMap[k] ?? 0;
              return (
                <td key={k} className={`px-2 py-1.5 text-right font-bold ${
                  v === 0 ? "text-zinc-300" : v > 0 ? "text-amber-700" : "text-rose-700"
                }`}>
                  {v === 0 ? "-" : (v > 0 ? "" : "-") + fmtWonShort(Math.abs(v))}
                </td>
              );
            })}
            <td className={`px-2 py-1.5 text-right font-bold border-l border-line bg-amber-50/60 ${
              totals.balance > 0 ? "text-amber-700" : totals.balance < 0 ? "text-rose-700" : "text-zinc-500"
            }`}>
              {totals.balance === 0 ? "0" : (totals.balance > 0 ? "" : "-") + fmtWonShort(Math.abs(totals.balance))}
            </td>
          </tr>
          {/* ── 판매 카테고리 · 매입/판매액/실재고액 · 구분선 (border-t 강조) ── */}
          <tr className="bg-white border-t-2 border-zinc-300">
            <td rowSpan={3} className="text-center px-2 py-1.5 font-bold text-zinc-600 bg-indigo-50/40 border-r border-line align-middle">
              판매
            </td>
            <td className="px-2 py-1.5 font-bold text-emerald-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><ReceiptText size={11} />매입</span>
            </td>
            {months.map(k => (
              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(purMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-emerald-800"}`}>
                {fmt(purMap[k] ?? 0)}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-bold text-emerald-800 border-l border-line bg-zinc-50/40">{fmt(totals.purchases)}</td>
          </tr>
          <tr className="bg-zinc-50/40">
            <td className="px-2 py-1.5 font-bold text-indigo-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><Package2 size={11} />판매액</span>
            </td>
            {months.map(k => (
              <td key={k} className={`px-2 py-1.5 text-right font-bold ${(salesMap[k] ?? 0) === 0 ? "text-zinc-300" : "text-indigo-800"}`}>
                {fmt(salesMap[k] ?? 0)}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-bold text-indigo-800 border-l border-line bg-zinc-50/40">{fmt(totals.sales)}</td>
          </tr>
          <tr className="bg-white">
            <td className="px-2 py-1.5 font-bold text-rose-700 whitespace-nowrap">
              <span className="inline-flex items-center gap-1"><Layers size={11} />실재고액</span>
            </td>
            {/* 2026-08-09 · 사용자 지시 · 실재고액 = 실재고 × 매입단가 합계 (현재값 · 붉은색 톤)
                월별 스냅샷 아님 · 각 월 컬럼 dash · 합계 컬럼에 현재값 표시 */}
            {months.map(k => (
              <td key={k} className="px-2 py-1.5 text-right text-zinc-300">-</td>
            ))}
            <td className={`px-2 py-1.5 text-right font-bold border-l border-line bg-rose-50/60 ${
              totals.stockValue > 0 ? "text-rose-700" : "text-zinc-400"
            }`}>
              {totals.stockValue === 0 ? "-" : fmtWonShort(totals.stockValue)}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) RecentPaymentsSection · 최근 결제 내역 리스트
// ═══════════════════════════════════════════════════════════════════════════

interface RecentPaymentsSectionProps {
  recentPayments: PaymentRow[];
  recentLoading: boolean;
  supplierName: string | null;
  onReload: (supplierName: string) => void;
}

export const RecentPaymentsSection: React.FC<RecentPaymentsSectionProps> = ({
  recentPayments, recentLoading, supplierName, onReload,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-line shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 pb-1 border-b border-zinc-100">
        {/* 2026-08-18 · IconTile 확산 */}
        <IconTile icon={<ReceiptText size={13} strokeWidth={2.5} />} tone="sky" size="sm" />

        <div className="text-[15px] font-bold text-zinc-800">최근 결제 내역</div>
        <span className="ml-auto text-[15px] text-zinc-400 tabular-nums">
          {recentLoading ? "로딩..." : `${recentPayments.length}건 (최근)`}
        </span>
        <button
          type="button"
          onClick={() => supplierName && onReload(supplierName)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-line hover:bg-zinc-50 text-zinc-500 transition"
          title="새로고침"
        >
          <RefreshCw size={12} className={recentLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {recentLoading ? (
        <div className="flex items-center justify-center py-8"><Spinner tone="zinc" size={13} label="불러오는 중..." labelSize={14} /></div>
      ) : recentPayments.length === 0 ? (
        <div className="py-8 text-center text-[15px] text-zinc-300">결제 이력 없음</div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {recentPayments.map(p => {
            const tone = methodTone(p.method);
            const meta = p.meta ?? {};
            const subLabel =
              meta.card_issuer ? meta.card_issuer :
              meta.bank_name   ? meta.bank_name :
              null;
            return (
              <div key={p.id} className="py-2 flex items-center gap-3 hover:bg-zinc-50/60 -mx-2 px-2 rounded transition">
                <span className={`inline-flex items-center justify-center w-14 h-8 rounded-lg text-[14px] font-bold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
                  {methodLabel(p.method)}
                </span>
                <div className="flex-1 min-w-0 flex flex-col leading-tight gap-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[15px] font-bold text-zinc-700 tabular-nums shrink-0">
                      {p.payment_date}
                    </span>
                    {subLabel && (
                      <span className="text-[14px] font-semibold text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-50 border border-line truncate">
                        {subLabel}
                      </span>
                    )}
                    {meta.tax_invoice_issued && (
                      <span className="text-[15px] font-bold text-teal-700 px-1 py-0.5 rounded bg-teal-50 border border-teal-200 shrink-0">
                        세금계산서
                      </span>
                    )}
                  </div>
                  {(p.memo || meta.reference_no) && (
                    <div className="text-[14px] text-zinc-500 truncate flex items-center gap-1">
                      {meta.reference_no && (
                        <span className="inline-flex items-center gap-0.5 text-zinc-400 tabular-nums">
                          <ArrowRight size={9} />{meta.reference_no}
                        </span>
                      )}
                      {p.memo && <span className="truncate">{p.memo}</span>}
                    </div>
                  )}
                </div>
                <span className="text-[15px] font-bold text-emerald-700 tabular-nums shrink-0">
                  -{p.amount.toLocaleString()}
                </span>
                {/* 결제 후 잔고 · Task #104 (2026-08-04)
                    · ledger running_balance · 양수=미결(amber) · 0=완납(slate) · 음수=초과(rose)
                    · feedback_ui_principles B-2-2 · 12px · tabular-nums */}
                {p.running_balance != null && (
                  <span
                    className={`text-[14px] font-bold tabular-nums shrink-0 min-w-[64px] text-right ${
                      p.running_balance > 0
                        ? "text-amber-700"
                        : p.running_balance < 0
                        ? "text-rose-700"
                        : "text-zinc-400"
                    }`}
                    title={`결제 후 잔고 · ${p.running_balance.toLocaleString()}원`}
                  >
                    {p.running_balance === 0
                      ? "완납"
                      : (p.running_balance > 0 ? "" : "-") + fmtWonShort(Math.abs(p.running_balance))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) ProductSummarySection · 상품별 매입 요약 (정렬·컬럼리사이즈)
// ═══════════════════════════════════════════════════════════════════════════

interface ProductSummarySectionProps {
  productSummary: ProductPurchaseSummary[];
  sortedProductSummary: ProductPurchaseSummary[];
  showProductGroup: boolean;
  setShowProductGroup: React.Dispatch<React.SetStateAction<boolean>>;
  prodSortKey: ProdSortKey;
  prodSortDir: "asc" | "desc";
  toggleProdSort: (key: ProdSortKey) => void;
  pw: (id: string) => number;
  pr: (id: string) => { onMouseDown: (e: React.MouseEvent) => void; onTouchStart: (e: React.TouchEvent) => void };
}

export const ProductSummarySection: React.FC<ProductSummarySectionProps> = ({
  productSummary, sortedProductSummary, showProductGroup, setShowProductGroup,
  prodSortKey, prodSortDir, toggleProdSort, pw, pr,
}) => {
  if (productSummary.length === 0) return null;
  const sortIcon = (key: ProdSortKey) => prodSortKey === key
    ? (prodSortDir === "asc"
        ? <ChevronUp size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />
        : <ChevronDown size={9} strokeWidth={3} className="inline-block align-middle ml-0.5 text-emerald-600" />)
    : <ChevronsUpDown size={9} strokeWidth={2.25} className="inline-block align-middle ml-0.5 text-zinc-300" />;

  return (
    <div className="bg-white rounded-2xl border border-line shadow-sm">
      <button
        type="button"
        onClick={() => setShowProductGroup(v => !v)}
        className="w-full flex items-center gap-2 p-4 pb-2 border-b border-zinc-100 hover:bg-zinc-50/50 transition cursor-pointer"
      >
        {/* 2026-08-18 · IconTile 확산 */}
        <IconTile icon={<Layers size={13} strokeWidth={2.5} />} tone="emerald" size="sm" />

        <div className="text-[15px] font-bold text-zinc-800">상품별 매입 요약</div>
        <span className="text-[15px] font-semibold text-zinc-400 tabular-nums">
          · {productSummary.length}개 상품 · 최근 1년
        </span>
        <span className="ml-auto text-[14px] font-bold text-zinc-400">{showProductGroup ? "접기 ▲" : "펼치기 ▼"}</span>
      </button>
      {showProductGroup && (
        <div className="p-2 overflow-x-auto">
          <table className="w-full text-[14px] tabular-nums" style={{ tableLayout: "fixed" }}>
            <thead className="bg-zinc-50 text-[14px] font-bold uppercase tracking-wider text-zinc-500">
              <tr>
                <th
                  onClick={() => toggleProdSort("product_name")}
                  title="상품명 정렬"
                  className="relative text-left px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                  style={{ width: pw("name"), minWidth: pw("name") }}
                >
                  상품명
                  {sortIcon("product_name")}
                  <span {...pr("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                <th
                  onClick={() => toggleProdSort("product_code")}
                  title="코드 정렬"
                  className="relative text-left px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                  style={{ width: pw("code"), minWidth: pw("code") }}
                >
                  코드
                  {sortIcon("product_code")}
                  <span {...pr("code")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                <th
                  onClick={() => toggleProdSort("totalQty")}
                  title="총 수량 정렬"
                  className="relative text-right px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                  style={{ width: pw("qty"), minWidth: pw("qty") }}
                >
                  총 수량
                  {sortIcon("totalQty")}
                  <span {...pr("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                <th
                  onClick={() => toggleProdSort("totalAmount")}
                  title="총 매입액 정렬"
                  className="relative text-right px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                  style={{ width: pw("amount"), minWidth: pw("amount") }}
                >
                  총 매입액
                  {sortIcon("totalAmount")}
                  <span {...pr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                <th
                  onClick={() => toggleProdSort("invoiceCount")}
                  title="건수 정렬"
                  className="relative text-center px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                  style={{ width: pw("count"), minWidth: pw("count") }}
                >
                  건수
                  {sortIcon("invoiceCount")}
                  <span {...pr("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
                <th
                  onClick={() => toggleProdSort("latestDate")}
                  title="최근 매입일 정렬"
                  className="relative text-right px-2 py-1.5 cursor-pointer select-none hover:bg-emerald-50/60 transition"
                  style={{ width: pw("last_date"), minWidth: pw("last_date") }}
                >
                  최근 매입일
                  {sortIcon("latestDate")}
                  <span {...pr("last_date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedProductSummary.slice(0, 100).map((p) => (
                <tr key={p.product_code || p.product_name} className="hover:bg-emerald-50/40">
                  {/* 2026-08-29 · UI 감사 U1 · truncate 제거 · 상품명 잘림 방지 (대원칙) */}
                  <td className="px-2 py-1.5 font-semibold text-zinc-700 break-words whitespace-normal leading-tight" style={{ minWidth: 180 }} title={p.product_name}>{p.product_name}</td>
                  <td className="px-2 py-1.5 text-zinc-400 tabular-nums text-[15px]">{p.product_code || "-"}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-zinc-700">{p.totalQty.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{fmtWonShort(p.totalAmount)}</td>
                  <td className="px-2 py-1.5 text-center text-zinc-500">{p.invoiceCount}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-500 whitespace-nowrap">{p.latestDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {productSummary.length > 100 && (
            <div className="text-[14px] text-zinc-400 text-center py-1.5">
              상위 100개 표시 (전체 {productSummary.length}개)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

