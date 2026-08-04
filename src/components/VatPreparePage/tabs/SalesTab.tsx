// src/components/VatPreparePage/tabs/SalesTab.tsx
// 2026-08-04 · #253 · 월별 매출·매입·경비·부가세 통합 표
//   · 이전 · localStorage 매출 수동 입력 (useSalesLocal) · 삭제
//   · 현재 · useMonthlyVat 로 DB 매출(stock_history) + 매입(purchase_details) 자동 조회
//   · 경비 · localStorage `megatown_vat_expenses_v1` · 월별 사용자 입력
//   · 예상 부가세 = 매출세액 - 매입세액공제 - 경비세액 · 실시간 재계산
//   · 컬럼 · 월 | 매출총액 | 매출세액 | 매입총액 | 매입세액(공제) | 경비 | 경비세액 | 예상 부가세

import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar, AlertCircle, Info, Loader2, RefreshCw,
  TrendingUp, PackageCheck, Wallet, Calculator,
} from "lucide-react";
import { useMonthlyVat, type MonthlyVatRow } from "../hooks/useMonthlyVat";

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

interface SalesTabProps {
  /** 조회 기간 시작 · YYYY-MM-DD (부가세 신고기간) */
  fromDate: string;
  /** 조회 기간 종료 · YYYY-MM-DD */
  toDate: string;
  /** 상단 KPI 갱신용 콜백 (매출 총액 · 매출세액 등) */
  onAggregateChange?: (agg: {
    taxableSales: number;   // 매출 공급가액 합 (참고용)
    exemptSales: number;    // 면세 매출 · 현재 데이터 없음 · 0
    outputVat: number;      // 매출세액 합
    salesRowCount: number;  // 매출 데이터 건수 (일 단위 row 합)
  }) => void;
}

const SalesTab: React.FC<SalesTabProps> = ({ fromDate, toDate, onAggregateChange }) => {
  const monthly = useMonthlyVat({ from: fromDate, to: toDate });

  // 상위 KPI 갱신 (매출 관련만 · 매입은 별도 API 로 계산됨)
  useEffect(() => {
    onAggregateChange?.({
      taxableSales: monthly.totals.salesSupply,
      exemptSales: 0,
      outputVat: monthly.totals.salesVat,
      salesRowCount: monthly.rows.reduce((s, r) => s + r.salesRowCount, 0),
    });
  }, [
    monthly.totals.salesSupply,
    monthly.totals.salesVat,
    monthly.rows,
    onAggregateChange,
  ]);

  return (
    <div className="flex flex-col gap-3 min-h-0">

      {/* 조회 기간 · 리로드 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
        <Calendar size={14} className="text-rose-500 shrink-0" />
        <div className="text-[12px] font-black text-slate-800">
          월별 부가세 요약
          <span className="ml-2 text-[11px] font-bold text-slate-500 tabular-nums">
            {fromDate} ~ {toDate}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 hidden md:inline">
          매출·매입 DB 자동 조회 · 경비만 수동 입력
        </div>
        <button
          type="button"
          onClick={monthly.reload}
          disabled={monthly.loading}
          className="ml-auto h-8 px-2 rounded-lg text-[11px] font-bold bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer disabled:opacity-50 flex items-center gap-1"
          title="새로고침"
        >
          <RefreshCw size={12} className={monthly.loading ? "animate-spin" : ""} />
          <span className="hidden sm:inline">새로고침</span>
        </button>
      </div>

      {/* 에러 · 경고 */}
      {monthly.error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-2 text-[12px] text-rose-700">
          <AlertCircle size={14} /><span>{monthly.error}</span>
        </div>
      )}
      {monthly.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-[11px] text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{monthly.warning}</span>
        </div>
      )}

      {/* 계산 방식 안내 */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2 text-[11px] text-slate-600">
        <Info size={13} className="mt-0.5 text-slate-500 shrink-0" />
        <div className="leading-relaxed">
          <b className="text-slate-700">계산 방식</b>
          <span className="mx-1 text-slate-400">·</span>
          매출 · <b>stock_history</b> 판매액 합계 · VAT 포함 총액 가정 (총액/11 = 매출세액)
          <span className="mx-1 text-slate-400">·</span>
          매입 · <b>purchase_details</b> + 공급사 <b>vat_included</b> flag · 면세 공급사는 공제 제외
          <span className="mx-1 text-slate-400">·</span>
          경비 · 사용자 입력 (VAT 포함 가정 · 입력값/11 = 경비세액)
          <br />
          <b className="text-slate-700">예상 부가세 = 매출세액 − 매입세액 공제 − 경비세액</b>
          <span className="ml-2 text-slate-500">
            · 본 계산은 참고용이며, 실제 신고는 반드시 세무사 검토 후 진행하세요.
          </span>
        </div>
      </div>

      {/* 월별 통합 표 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp size={14} className="text-rose-500" />
          <div className="text-[13px] font-black text-slate-800">월별 매출 · 매입 · 경비 · 예상 부가세</div>
          <div className="text-[10px] font-bold text-slate-500 ml-auto">
            {monthly.rows.length}개월
          </div>
        </div>

        <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
          {monthly.loading && monthly.rows.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-[12px]">
              <Loader2 size={14} className="animate-spin" />불러오는 중...
            </div>
          ) : monthly.rows.length === 0 ? (
            <div className="py-10 text-center text-[11px] text-slate-300">해당 기간 데이터 없음</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">월</th>
                  <th className="text-right px-2 py-2 font-bold">매출 총액</th>
                  <th className="text-right px-2 py-2 font-bold text-rose-700">매출세액</th>
                  <th className="text-right px-2 py-2 font-bold">매입 총액</th>
                  <th className="text-right px-2 py-2 font-bold text-emerald-700">매입세액 공제</th>
                  <th className="text-right px-2 py-2 font-bold w-[130px]">경비 (입력)</th>
                  <th className="text-right px-2 py-2 font-bold text-slate-700">경비세액</th>
                  <th className="text-right px-2 py-2 font-bold">예상 부가세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthly.rows.map(row => (
                  <MonthlyRow
                    key={row.month}
                    row={row}
                    onExpenseChange={monthly.setExpense}
                  />
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gradient-to-t from-slate-100 to-slate-50 shadow-inner">
                <tr className="text-slate-800 font-black">
                  <td className="px-3 py-3 text-[11px]">합계</td>
                  <td className="px-2 py-3 text-right tabular-nums text-[12px]">
                    {fmt(monthly.totals.salesTotal)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-rose-700 text-[13px]">
                    {fmt(monthly.totals.salesVat)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-[12px]">
                    {fmt(monthly.totals.purchaseGross)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-emerald-700 text-[13px]">
                    {fmt(monthly.totals.purchaseDeductibleVat)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-[12px]">
                    {fmt(monthly.totals.expense)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-[12px]">
                    {fmt(monthly.totals.expenseVat)}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <div className={`tabular-nums text-[15px] font-black leading-tight ${
                      monthly.totals.expectedVat >= 0 ? "text-rose-700" : "text-emerald-700"
                    }`}>
                      {monthly.totals.expectedVat >= 0 ? "" : "−"}{fmt(Math.abs(monthly.totals.expectedVat))}
                    </div>
                    <div className={`text-[9px] font-bold ${
                      monthly.totals.expectedVat >= 0 ? "text-rose-500/70" : "text-emerald-500/70"
                    }`}>
                      {monthly.totals.expectedVat >= 0 ? "납부 예상" : "환급 예상"}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* 요약 카드 (하단) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard
          label="매출세액"
          value={monthly.totals.salesVat}
          icon={<TrendingUp size={14} />}
          color="rose"
          hint="매출 총액 × 10/110"
        />
        <SummaryCard
          label="매입세액 공제"
          value={monthly.totals.purchaseDeductibleVat}
          icon={<PackageCheck size={14} />}
          color="emerald"
          hint="면세 공급사 제외"
        />
        <SummaryCard
          label="경비세액"
          value={monthly.totals.expenseVat}
          icon={<Wallet size={14} />}
          color="slate"
          hint="경비 × 10/110"
        />
        <SummaryCard
          label={monthly.totals.expectedVat >= 0 ? "예상 부가세 (납부)" : "예상 부가세 (환급)"}
          value={Math.abs(monthly.totals.expectedVat)}
          icon={<Calculator size={14} />}
          color={monthly.totals.expectedVat >= 0 ? "rose" : "emerald"}
          hint="매출세액 − 매입공제 − 경비세액"
          highlight
        />
      </div>
    </div>
  );
};

// ─── 월별 row (경비 입력 · 디바운스) ─────────────────────────
interface MonthlyRowProps {
  row: MonthlyVatRow;
  onExpenseChange: (month: string, value: number) => void;
}

const MonthlyRow: React.FC<MonthlyRowProps> = ({ row, onExpenseChange }) => {
  // 로컬 입력값 (편집 중 유지 · blur 또는 debounce 시 저장)
  const [text, setText] = useState<string>(row.expense > 0 ? String(row.expense) : "");

  // row.expense 가 외부에서 변경 (다른 탭 storage 이벤트 등) 시 반영
  useEffect(() => {
    setText(row.expense > 0 ? String(row.expense) : "");
  }, [row.expense]);

  const handleChange = (v: string) => {
    // 숫자·빈문자만 허용
    const cleaned = v.replace(/[^0-9]/g, "");
    setText(cleaned);
  };

  const handleCommit = () => {
    const n = text === "" ? 0 : Number(text);
    if (Number.isFinite(n) && n >= 0 && n !== row.expense) {
      onExpenseChange(row.month, n);
    }
  };

  const expectedColor = row.expectedVat >= 0 ? "text-rose-700" : "text-emerald-700";

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-3 py-2 font-bold text-slate-800 tabular-nums">{row.month}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(row.salesTotal)}</td>
      <td className="px-2 py-2 text-right tabular-nums font-black text-rose-700">{fmt(row.salesVat)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(row.purchaseGross)}</td>
      <td className="px-2 py-2 text-right tabular-nums font-black text-emerald-700">{fmt(row.purchaseDeductibleVat)}</td>
      <td className="px-2 py-2 text-right">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={e => handleChange(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
          placeholder="0"
          className="w-full h-8 px-2 text-[11px] text-right tabular-nums border border-slate-300 rounded outline-none focus:ring-1 focus:ring-rose-400 focus:border-rose-400"
        />
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(row.expenseVat)}</td>
      <td className={`px-2 py-2 text-right tabular-nums font-black ${expectedColor}`}>
        {row.expectedVat >= 0 ? "" : "−"}{fmt(Math.abs(row.expectedVat))}
      </td>
    </tr>
  );
};

// ─── 요약 카드 ────────────────────────────────────────────────
interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "rose" | "emerald" | "slate" | "sky";
  hint?: string;
  highlight?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, color, hint, highlight }) => {
  const colors: Record<string, { bg: string; ring: string; text: string; icon: string }> = {
    rose:    { bg: "bg-rose-50",    ring: "ring-rose-200",    text: "text-rose-700",    icon: "bg-rose-500 text-white"    },
    emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", icon: "bg-emerald-500 text-white" },
    slate:   { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-700",   icon: "bg-slate-600 text-white"   },
    sky:     { bg: "bg-sky-50",     ring: "ring-sky-200",     text: "text-sky-700",     icon: "bg-sky-500 text-white"     },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} rounded-xl border border-slate-200 shadow-sm p-3.5 ${highlight ? "ring-2 " + c.ring : ""}`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg ${c.icon} flex items-center justify-center shrink-0`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-tight">{label}</div>
          <div className={`text-[18px] font-black ${c.text} tabular-nums leading-tight mt-0.5`}>
            {fmt(value)}<span className="text-[12px] ml-1">원</span>
          </div>
          {hint && <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{hint}</div>}
        </div>
      </div>
    </div>
  );
};

export default SalesTab;
export { SalesTab };
