// src/components/OrderManagePage/VendorInfoHeader.tsx
// 공급사 상세 패널 — 최상단 헤더 카드 + 월별 데이터 표
// 재사용: VendorDetailTabs, PaymentInfoTab 공용
// 2026-08-04 · Task #97 · KPI 카드/드롭다운 제거 → 월별 데이터 표 (12개월 · 누적행 포함)
// Props: vendor + ledger KPI + activeProductCount

import React, { useMemo } from "react";
import {
  Building2, Phone, User2, Mail, Calendar, Wallet,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { fmtWonFull, fmtDateSlice } from "../../lib/format";

// ─── Types ────────────────────────────────────────────────────────────────

export interface VendorBasic {
  id: number;
  company_name: string;
  category: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_number?: string | null;
  note?: string | null;
  created_at?: string | null;
  payment_terms?: string | null;
  active?: boolean | null;
  vat_included?: boolean | null;  // 2026-08-03 · #193
}

export interface VendorKpi {
  totalPurchase: number;   // 기간 내 총 매입액
  totalPayment: number;    // 기간 내 총 결제액
  balance: number;         // 현재 잔고 (매입 - 결제)
  avgCycleDays: number | null; // 평균 매입주기 (일)
  momPct?: number | null;  // 이번달 MoM %
  rowCount?: number;       // 원장 건수 (매입 건수)
  activeProductCount?: number; // 1년간 취급 상품수
}

/** supplier-ledger rows 의 최소 형태 (월별 집계용) */
export interface LedgerRowMinimal {
  type: "purchase" | "payment";
  date: string | null;
  amount: number;
  running_balance: number;
}

interface VendorInfoHeaderProps {
  vendor: VendorBasic;
  kpi: VendorKpi;
  loading?: boolean;
  /** supplier-ledger rows · 월별 표 표시용 */
  ledgerRows?: LedgerRowMinimal[];
}

// ─── Types (월별 집계) ─────────────────────────────────────────────────

interface MonthlyAgg {
  ym: string;          // "2026-08"
  purchase: number;
  payment: number;
  purchaseCount: number; // 매입 건수 (해당 월)
  /** 해당 월 마지막 running_balance 값 */
  endBalance: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtBizNum(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length !== 10) return String(n);
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

function fmtPhone(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return String(n);
}

const fmtDate = fmtDateSlice;

/** "YYYY-MM" 라벨 → 짧은 라벨 "26/08" */
function fmtYmShort(ym: string): string {
  return ym.slice(2).replace("-", "/");
}

/** ledger rows → 월별 집계 (내림차순 · 최근 월부터 · 최근 12개월 제한) */
function buildMonthlyAgg(rows: LedgerRowMinimal[], limit = 12): MonthlyAgg[] {
  if (!rows.length) return [];

  const map = new Map<string, MonthlyAgg>();
  for (const r of rows) {
    if (!r.date) continue;
    const ym = String(r.date).slice(0, 7);
    let agg = map.get(ym);
    if (!agg) {
      agg = { ym, purchase: 0, payment: 0, purchaseCount: 0, endBalance: 0 };
      map.set(ym, agg);
    }
    if (r.type === "purchase") {
      agg.purchase += r.amount;
      agg.purchaseCount += 1;
    } else {
      agg.payment += r.amount;
    }
    // running_balance 는 시간순 정렬 · 해당 월의 마지막 값 (rows 가 시간순 오름차순 가정)
    agg.endBalance = r.running_balance;
  }

  return Array.from(map.values())
    .sort((a, b) => b.ym.localeCompare(a.ym))
    .slice(0, limit);
}

// ─── VendorInfoHeader ─────────────────────────────────────────────────────

export const VendorInfoHeader: React.FC<VendorInfoHeaderProps> = ({
  vendor, kpi, loading = false, ledgerRows,
}) => {
  const copyBizNum = () => {
    if (!vendor.business_number) return;
    const raw = vendor.business_number.replace(/\D/g, "");
    navigator.clipboard?.writeText(raw).catch(() => {});
  };

  // 월별 집계 (최근 12개월)
  const monthlyAgg = useMemo(
    () => (ledgerRows && ledgerRows.length > 0 ? buildMonthlyAgg(ledgerRows, 12) : []),
    [ledgerRows],
  );

  // 표 하단 누적 (표시 중인 월 기준)
  const totals = useMemo(() => {
    let purchase = 0, payment = 0, count = 0;
    for (const m of monthlyAgg) {
      purchase += m.purchase;
      payment += m.payment;
      count += m.purchaseCount;
    }
    const avgUnit = count > 0 ? Math.round(purchase / count) : 0;
    // 잔고 · 가장 최근 월의 endBalance (즉 monthlyAgg[0])
    const latestBalance = monthlyAgg[0]?.endBalance ?? kpi.balance;
    return { purchase, payment, count, avgUnit, latestBalance };
  }, [monthlyAgg, kpi.balance]);

  const hasMonthly = monthlyAgg.length > 0;

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">

      {/* 헤더 · 공급사명 + 배지 + 활성 pill */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 ring-1 ring-sky-200">
          <Building2 size={18} className="text-sky-600" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-black text-slate-800 leading-tight break-words">
              {vendor.company_name}
            </h2>
            <VendorCategoryBadge category={vendor.category} />
            {/* VAT 배지 */}
            {vendor.vat_included === true && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200"
                title="거래명세서 총액에 VAT 포함 · 부가세 신고 시 amount÷11 로 세액 산정"
              >
                VAT 포함
              </span>
            )}
            {vendor.vat_included === false && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200"
                title="거래명세서 총액은 공급가액 · 부가세 10% 별도 · 세액 = amount×0.1"
              >
                VAT 별도
              </span>
            )}
            {vendor.active === false && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 border border-slate-200">
                비활성
              </span>
            )}
          </div>

          {vendor.business_number && (
            <button
              type="button"
              onClick={copyBizNum}
              title="클릭하여 복사"
              className="self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 hover:bg-sky-50 hover:border-sky-300 transition text-[11px] font-semibold text-slate-600 tabular-nums cursor-pointer"
            >
              <span className="text-slate-400 text-[9px] font-black uppercase tracking-wider">사업자</span>
              {fmtBizNum(vendor.business_number)}
            </button>
          )}
        </div>
      </div>

      {/* 연락처 서브라인 */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 pl-1">
        {vendor.contact_name && (
          <span className="inline-flex items-center gap-1">
            <User2 size={11} className="text-slate-400 shrink-0" />
            {vendor.contact_name}
          </span>
        )}
        {vendor.phone && (
          <a
            href={`tel:${vendor.phone.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-1 tabular-nums hover:text-sky-600 transition"
          >
            <Phone size={11} className="text-slate-400 shrink-0" />
            {fmtPhone(vendor.phone)}
          </a>
        )}
        {vendor.email && (
          <a
            href={`mailto:${vendor.email}`}
            className="inline-flex items-center gap-1 hover:text-sky-600 transition max-w-[200px]"
            title={vendor.email}
          >
            <Mail size={11} className="text-slate-400 shrink-0" />
            <span className="truncate">{vendor.email}</span>
          </a>
        )}
        {vendor.payment_terms && (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Wallet size={11} className="shrink-0" />
            {vendor.payment_terms}
          </span>
        )}
        {vendor.created_at && (
          <span className="inline-flex items-center gap-1 tabular-nums text-slate-400 ml-auto">
            <Calendar size={11} className="shrink-0" />
            등록 {fmtDate(vendor.created_at)}
          </span>
        )}
      </div>

      {/* 구분선 */}
      <div className="border-t border-slate-100" />

      {/* 월별 데이터 표 (2026-08-04 · Task #97 · KPI 카드 → 표 형식 전환) */}
      {loading ? (
        <div className="text-[12px] text-slate-400 pl-1 py-4">로딩 중...</div>
      ) : !hasMonthly ? (
        <div className="text-[12px] text-slate-400 pl-1 py-4">
          월별 데이터가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 표 · 가로 스크롤 (모바일 대응) */}
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[480px] border-collapse text-[12px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left px-2 py-1.5 font-black text-slate-600 text-[11px] uppercase tracking-wider">
                    월
                  </th>
                  <th className="text-right px-2 py-1.5 font-black text-emerald-700 text-[11px] uppercase tracking-wider">
                    매입액
                  </th>
                  <th className="text-right px-2 py-1.5 font-black text-slate-500 text-[11px] uppercase tracking-wider">
                    건수
                  </th>
                  <th className="text-right px-2 py-1.5 font-black text-sky-700 text-[11px] uppercase tracking-wider">
                    결제액
                  </th>
                  <th className="text-right px-2 py-1.5 font-black text-amber-700 text-[11px] uppercase tracking-wider">
                    잔고
                  </th>
                  <th className="text-right px-2 py-1.5 font-black text-slate-600 text-[11px] uppercase tracking-wider">
                    평균단가
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyAgg.map((m, idx) => {
                  const avgUnit = m.purchaseCount > 0 ? Math.round(m.purchase / m.purchaseCount) : 0;
                  const balColor =
                    m.endBalance > 0 ? "text-amber-700" :
                    m.endBalance < 0 ? "text-rose-700" : "text-slate-400";
                  return (
                    <tr
                      key={m.ym}
                      className={`border-b border-slate-100 hover:bg-slate-50/50 transition ${
                        idx === 0 ? "bg-sky-50/30" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5 font-semibold text-slate-700">
                        {fmtYmShort(m.ym)}
                      </td>
                      <td className="text-right px-2 py-1.5 font-semibold text-emerald-700">
                        {m.purchase > 0 ? fmtWonFull(m.purchase) : "-"}
                      </td>
                      <td className="text-right px-2 py-1.5 text-slate-500">
                        {m.purchaseCount > 0 ? m.purchaseCount : "-"}
                      </td>
                      <td className="text-right px-2 py-1.5 font-semibold text-sky-700">
                        {m.payment > 0 ? fmtWonFull(m.payment) : "-"}
                      </td>
                      <td className={`text-right px-2 py-1.5 font-semibold ${balColor}`}>
                        {m.endBalance === 0
                          ? "완납"
                          : `${fmtWonFull(Math.abs(m.endBalance))}${m.endBalance < 0 ? " 초과" : ""}`}
                      </td>
                      <td className="text-right px-2 py-1.5 text-slate-600">
                        {avgUnit > 0 ? fmtWonFull(avgUnit) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100/60">
                  <td className="px-2 py-2 font-black text-slate-700 text-[11px] uppercase tracking-wider">
                    누적
                  </td>
                  <td className="text-right px-2 py-2 font-black text-emerald-800">
                    {fmtWonFull(totals.purchase)}
                  </td>
                  <td className="text-right px-2 py-2 font-black text-slate-700">
                    {totals.count > 0 ? totals.count : "-"}
                  </td>
                  <td className="text-right px-2 py-2 font-black text-sky-800">
                    {fmtWonFull(totals.payment)}
                  </td>
                  <td className={`text-right px-2 py-2 font-black ${
                    totals.latestBalance > 0 ? "text-amber-800" :
                    totals.latestBalance < 0 ? "text-rose-800" : "text-slate-500"
                  }`}>
                    {totals.latestBalance === 0
                      ? "완납"
                      : `${fmtWonFull(Math.abs(totals.latestBalance))}${totals.latestBalance < 0 ? " 초과" : ""}`}
                  </td>
                  <td className="text-right px-2 py-2 font-black text-slate-700">
                    {totals.avgUnit > 0 ? fmtWonFull(totals.avgUnit) : "-"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 표 하단 · 평균 매입주기 · 활성 상품수 */}
          <div className="flex items-center gap-4 flex-wrap pl-1 pt-1 text-[12px] text-slate-500">
            <span className="inline-flex items-baseline gap-1">
              <span className="text-slate-400">평균 매입주기</span>
              <span className="font-black text-slate-700 tabular-nums">
                {kpi.avgCycleDays != null ? kpi.avgCycleDays : "-"}
              </span>
              {kpi.avgCycleDays != null && (
                <span className="text-[11px] font-bold text-slate-400">일</span>
              )}
            </span>
            {kpi.activeProductCount != null && (
              <span className="inline-flex items-baseline gap-1">
                <span className="text-slate-400">1년간 취급 상품</span>
                <span className="font-black text-slate-700 tabular-nums">
                  {kpi.activeProductCount}
                </span>
                <span className="text-[11px] font-bold text-slate-400">종</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorInfoHeader;
