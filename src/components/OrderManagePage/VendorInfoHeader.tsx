// src/components/OrderManagePage/VendorInfoHeader.tsx
// 공급사 상세 패널 — 최상단 헤더 카드 + 월별 데이터 표
// 재사용: VendorDetailTabs, PaymentInfoTab 공용
// 2026-08-04 · Task #97 · KPI 카드/드롭다운 제거 → 월별 데이터 표 (12개월 · 누적행 포함)
// Props: vendor + ledger KPI + activeProductCount

import React, { useEffect, useMemo, useState } from "react";
import {
  Building2, Phone, User2, Mail, Calendar, Wallet,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { StatusPill } from "../common/StatusPill";
import { fmtWonFull, fmtDateSlice } from "../../lib/format";
import { Spinner } from "../common/Spinner";
// 2026-09-10 · 사용자 지시 · 월별 재고자산 컬럼 · 신규 API fetch
import { api } from "../../lib/apiClient";

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
  // #51 · Vendor DTO 확장 · 팀장·비상연락처
  team_leader_name?: string | null;
  team_leader_phone?: string | null;
  emergency_contact?: string | null;
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
  /** 2026-08-24 · 공급사 정보 수정 콜백 · 있으면 [수정] 버튼 표시 (사용자 지시) */
  onEdit?: () => void;
  /** 2026-09-10 · 사용자 지시 · 표 맨 오른쪽 "현재" 열 · 현장 재고자산 (ERP 현재고 × 사입단가) */
  currentStockValue?: number | null;
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
  vendor, kpi, loading = false, ledgerRows, onEdit, currentStockValue = null,
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

  // 2026-09-10 · 사용자 지시 · 월별 재고자산 · vendor 변경 시 fetch
  const [monthlyStockValueMap, setMonthlyStockValueMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!vendor.company_name) { setMonthlyStockValueMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ rows: { ym: string; stock_value: number }[] }>(
          `/api/supplier-monthly-stock-values/${encodeURIComponent(vendor.company_name)}?months=12`
        );
        const m = new Map<string, number>();
        for (const r of data?.rows ?? []) m.set(r.ym, Number(r.stock_value) || 0);
        if (!cancelled) setMonthlyStockValueMap(m);
      } catch { if (!cancelled) setMonthlyStockValueMap(new Map()); }
    })();
    return () => { cancelled = true; };
  }, [vendor.company_name]);

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
    <div className="relative bg-white rounded-2xl border border-line shadow-sm p-4 flex flex-col gap-3 overflow-hidden">
      {/* 2026-08-24 · v9 · 상단 2px gradient accent */}
      <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10 rounded-t-2xl" />

      {/* 헤더 · 공급사명 + 배지 + 활성 pill */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 ring-1 ring-sky-200">
          <Building2 size={18} className="text-sky-600" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-bold text-zinc-800 leading-tight break-words">
              {vendor.company_name}
            </h2>
            <VendorCategoryBadge category={vendor.category} />
            {/* VAT 배지 · 2026-08-17 · StatusPill 통일 */}
            {vendor.vat_included === true && (
              <span title="거래명세서 총액에 VAT 포함 · 부가세 신고 시 amount÷11 로 세액 산정">
                <StatusPill tone="emerald" size="xs">VAT 포함</StatusPill>
              </span>
            )}
            {vendor.vat_included === false && (
              <span title="거래명세서 총액은 공급가액 · 부가세 10% 별도 · 세액 = amount×0.1">
                <StatusPill tone="amber" size="xs">VAT 별도</StatusPill>
              </span>
            )}
            {vendor.active === false && (
              <StatusPill tone="zinc" size="xs">비활성</StatusPill>
            )}
            {/* 2026-08-24 · 사용자 지시 · [수정] 버튼 · 오른쪽 정렬 · openVendorInfo 콜백 */}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                title="공급사 정보 조회 및 수정"
                className="ml-auto inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[15px] font-bold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 active:scale-[0.98] transition-all cursor-pointer"
              >
                수정
              </button>
            )}
          </div>

          {vendor.business_number && (
            <button
              type="button"
              onClick={copyBizNum}
              title="클릭하여 복사"
              className="self-start inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-50 border border-line hover:bg-sky-50 hover:border-sky-300 transition text-[13px] font-semibold text-zinc-600 tabular-nums cursor-pointer"
            >
              <span className="text-zinc-400 text-[13px] font-bold uppercase tracking-wider">사업자</span>
              {fmtBizNum(vendor.business_number)}
            </button>
          )}
        </div>
      </div>

      {/* 연락처 서브라인 */}
      <div className="flex items-center gap-3 flex-wrap text-[13px] text-zinc-500 pl-1">
        {vendor.contact_name && (
          <span className="inline-flex items-center gap-1">
            <User2 size={11} className="text-zinc-400 shrink-0" />
            {vendor.contact_name}
          </span>
        )}
        {vendor.phone && (
          <a
            href={`tel:${vendor.phone.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-1 tabular-nums hover:text-sky-600 transition"
          >
            <Phone size={11} className="text-zinc-400 shrink-0" />
            {fmtPhone(vendor.phone)}
          </a>
        )}
        {vendor.email && (
          <a
            href={`mailto:${vendor.email}`}
            className="inline-flex items-center gap-1 hover:text-sky-600 transition max-w-[200px]"
            title={vendor.email}
          >
            <Mail size={11} className="text-zinc-400 shrink-0" />
            <span className="truncate">{vendor.email}</span>
          </a>
        )}
        {/* #51 · 팀장 · 비상연락처 (있을 때만) */}
        {vendor.team_leader_name && (
          <span className="inline-flex items-center gap-1" title="팀장">
            <User2 size={11} className="text-amber-500 shrink-0" />
            <span className="text-[13px] font-bold text-amber-500 uppercase tracking-wider">팀장</span>
            {vendor.team_leader_name}
          </span>
        )}
        {vendor.team_leader_phone && (
          <a
            href={`tel:${vendor.team_leader_phone.replace(/\D/g, "")}`}
            className="inline-flex items-center gap-1 tabular-nums hover:text-amber-600 transition"
            title="팀장 전화"
          >
            <Phone size={11} className="text-amber-500 shrink-0" />
            {fmtPhone(vendor.team_leader_phone)}
          </a>
        )}
        {vendor.emergency_contact && (
          <span className="inline-flex items-center gap-1 tabular-nums text-rose-600" title="비상연락처">
            <Phone size={11} className="text-rose-500 shrink-0" />
            <span className="text-[13px] font-bold text-rose-500 uppercase tracking-wider">비상</span>
            {vendor.emergency_contact}
          </span>
        )}
        {vendor.payment_terms && (
          <span className="inline-flex items-center gap-1 text-zinc-400">
            <Wallet size={11} className="shrink-0" />
            {vendor.payment_terms}
          </span>
        )}
        {vendor.created_at && (
          <span className="inline-flex items-center gap-1 tabular-nums text-zinc-400 ml-auto">
            <Calendar size={11} className="shrink-0" />
            등록 {fmtDate(vendor.created_at)}
          </span>
        )}
      </div>

      {/* 구분선 */}
      <div className="border-t border-zinc-100" />

      {/* 월별 데이터 표 (2026-08-04 · Task #97 · KPI 카드 → 표 형식 전환) */}
      {loading ? (
        <div className="pl-1 py-4"><Spinner label="로딩 중..." size={13} tone="zinc" labelSize={12} /></div>
      ) : !hasMonthly ? (
        <div className="text-[14px] text-zinc-400 pl-1 py-4">
          월별 데이터가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* 2026-09-10 · 사용자 지시 · 표 전치 · 왼쪽 첫 컬럼 = 항목 (5행) · 열 = 월들 + 현재
              · 행: 매입액 · 결제액 · 재고자산 · 판매금액 · 잔고 (선지급/미지급) */}
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[480px] border-collapse text-[14px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-zinc-50">
                <tr className="border-b-2 border-line">
                  <th className="text-left px-2 py-1.5 font-bold text-zinc-600 text-[13px] uppercase tracking-wider sticky left-0 bg-zinc-50 z-20">
                    항목
                  </th>
                  {monthlyAgg.map(m => (
                    <th key={m.ym} className="text-right px-2 py-1.5 font-semibold text-zinc-500 text-[13px] whitespace-nowrap">
                      {fmtYmShort(m.ym)}
                    </th>
                  ))}
                  <th className="text-right px-2 py-1.5 font-bold text-zinc-800 text-[13px] uppercase tracking-wider whitespace-nowrap bg-sky-50/50">
                    현재
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* 매입액 (emerald) */}
                <tr className="border-b border-zinc-100 hover:bg-zinc-50/50 transition">
                  <td className="px-2 py-1.5 font-bold text-emerald-700 sticky left-0 bg-white z-10">매입액</td>
                  {monthlyAgg.map(m => (
                    <td key={m.ym} className="text-right px-2 py-1.5 text-emerald-700 font-semibold">
                      {m.purchase > 0 ? fmtWonFull(m.purchase) : "-"}
                    </td>
                  ))}
                  <td className="text-right px-2 py-1.5 text-emerald-800 font-bold bg-sky-50/50">
                    {totals.purchase > 0 ? fmtWonFull(totals.purchase) : "-"}
                  </td>
                </tr>
                {/* 결제액 (sky) */}
                <tr className="border-b border-zinc-100 hover:bg-zinc-50/50 transition">
                  <td className="px-2 py-1.5 font-bold text-sky-700 sticky left-0 bg-white z-10">결제액</td>
                  {monthlyAgg.map(m => (
                    <td key={m.ym} className="text-right px-2 py-1.5 text-sky-700 font-semibold">
                      {m.payment > 0 ? fmtWonFull(m.payment) : "-"}
                    </td>
                  ))}
                  <td className="text-right px-2 py-1.5 text-sky-800 font-bold bg-sky-50/50">
                    {totals.payment > 0 ? fmtWonFull(totals.payment) : "-"}
                  </td>
                </tr>
                {/* 재고자산 (violet) · 월별 스냅샷 · 현재 = currentStockValue prop */}
                <tr className="border-b border-zinc-100 hover:bg-zinc-50/50 transition">
                  <td className="px-2 py-1.5 font-bold text-violet-700 sticky left-0 bg-white z-10">재고자산</td>
                  {monthlyAgg.map(m => {
                    const v = monthlyStockValueMap.get(m.ym) ?? 0;
                    return (
                      <td key={m.ym} className="text-right px-2 py-1.5 text-violet-700 font-semibold">
                        {v > 0 ? fmtWonFull(v) : "-"}
                      </td>
                    );
                  })}
                  <td className="text-right px-2 py-1.5 text-violet-800 font-bold bg-sky-50/50">
                    {currentStockValue != null && currentStockValue > 0 ? fmtWonFull(currentStockValue) : "-"}
                  </td>
                </tr>
                {/* 판매액 · TODO · salesTrend 데이터 연동 예정 · 2026-09-10 사용자 지시 · 판매금액→판매액 */}
                <tr className="border-b border-zinc-100 hover:bg-zinc-50/50 transition">
                  <td className="px-2 py-1.5 font-bold text-teal-700 sticky left-0 bg-white z-10">판매액</td>
                  {monthlyAgg.map(m => (
                    <td key={m.ym} className="text-right px-2 py-1.5 text-zinc-300">-</td>
                  ))}
                  <td className="text-right px-2 py-1.5 text-zinc-300 bg-sky-50/50">-</td>
                </tr>
                {/* 잔고 (amber/rose · 부호별) · 미지급 / 선지급 */}
                <tr className="hover:bg-zinc-50/50 transition">
                  <td className="px-2 py-1.5 font-bold text-amber-700 sticky left-0 bg-white z-10">잔고 (선지급/미지급)</td>
                  {monthlyAgg.map(m => {
                    const balColor =
                      m.endBalance > 0 ? "text-amber-700" :
                      m.endBalance < 0 ? "text-sky-700" : "text-zinc-400";
                    return (
                      <td key={m.ym} className={`text-right px-2 py-1.5 font-semibold ${balColor}`}>
                        {m.endBalance === 0
                          ? "완납"
                          : `${fmtWonFull(Math.abs(m.endBalance))}${m.endBalance < 0 ? " 선지급" : ""}`}
                      </td>
                    );
                  })}
                  <td className={`text-right px-2 py-1.5 font-bold bg-sky-50/50 ${
                    totals.latestBalance > 0 ? "text-amber-800" :
                    totals.latestBalance < 0 ? "text-sky-800" : "text-zinc-500"
                  }`}>
                    {totals.latestBalance === 0
                      ? "완납"
                      : `${fmtWonFull(Math.abs(totals.latestBalance))}${totals.latestBalance < 0 ? " 선지급" : ""}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 표 하단 · 평균 매입주기 · 활성 상품수 */}
          <div className="flex items-center gap-4 flex-wrap pl-1 pt-1 text-[14px] text-zinc-500">
            <span className="inline-flex items-baseline gap-1">
              <span className="text-zinc-400">평균 매입주기</span>
              <span className="font-bold text-zinc-700 tabular-nums">
                {kpi.avgCycleDays != null ? kpi.avgCycleDays : "-"}
              </span>
              {kpi.avgCycleDays != null && (
                <span className="text-[13px] font-bold text-zinc-400">일</span>
              )}
            </span>
            {kpi.activeProductCount != null && (
              <span className="inline-flex items-baseline gap-1">
                <span className="text-zinc-400">1년간 취급 상품</span>
                <span className="font-bold text-zinc-700 tabular-nums">
                  {kpi.activeProductCount}
                </span>
                <span className="text-[13px] font-bold text-zinc-400">종</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorInfoHeader;
