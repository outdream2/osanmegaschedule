// src/components/OrderManagePage/VendorInfoHeader.tsx
// 공급사 상세 패널 — 최상단 헤더 카드 + KPI 4개
// 재사용: VendorDetailTabs, PaymentInfoTab 공용
// VendorHeaderPanel(PurchaseHistoryTab)과 유사 · 결제잔고 KPI 로 교체
// Props: vendor + ledger KPI (총 매입/결제/잔고) + 평균 매입주기
// 2026-08-03 · 월별 리스트 인라인 드롭다운 추가 (총매입/총결제/잔고 각 옆 토글)

import React, { useMemo, useState } from "react";
import {
  Building2, Phone, User2, Mail, Calendar,
  TrendingUp, TrendingDown, Minus, Wallet, ChevronDown, ChevronUp,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";

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
  rowCount?: number;       // 원장 건수
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
  /** supplier-ledger rows · 월별 집계 표시용 (없으면 월별 리스트 숨김) */
  ledgerRows?: LedgerRowMinimal[];
}

// ─── Types (월별 집계) ─────────────────────────────────────────────────

interface MonthlyAgg {
  ym: string;          // "2026-08"
  purchase: number;
  payment: number;
  /** 해당 월 마지막 running_balance 값 */
  endBalance: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

function fmtWonShort(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString();
}

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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return String(iso).slice(0, 10);
}

/** ledger rows → 월별 집계 (내림차순 · 최근 월부터) */
function buildMonthlyAgg(rows: LedgerRowMinimal[]): MonthlyAgg[] {
  if (!rows.length) return [];

  // 월별 purchase/payment 누계 + running_balance (마지막 row 기준)
  const map = new Map<string, MonthlyAgg>();
  for (const r of rows) {
    if (!r.date) continue;
    const ym = String(r.date).slice(0, 7); // "2026-08"
    let agg = map.get(ym);
    if (!agg) {
      agg = { ym, purchase: 0, payment: 0, endBalance: 0 };
      map.set(ym, agg);
    }
    if (r.type === "purchase") agg.purchase += r.amount;
    else agg.payment += r.amount;
    // running_balance 는 시간순 정렬된 rows 에서 해당 월의 마지막 값
    agg.endBalance = r.running_balance;
  }

  return Array.from(map.values()).sort((a, b) => b.ym.localeCompare(a.ym));
}

// ─── MonthlyDropdown · 각 KPI 옆 인라인 월별 리스트 ─────────────────────

type MonthlyField = "purchase" | "payment" | "balance";

const PREVIEW_COUNT = 3; // 항상 보이는 개수
const EXPAND_COUNT = 12; // 최대 표시

const MonthlyDropdown: React.FC<{
  months: MonthlyAgg[];
  field: MonthlyField;
}> = ({ months, field }) => {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded
    ? months.slice(0, EXPAND_COUNT)
    : months.slice(0, PREVIEW_COUNT);

  const hasMore = months.length > PREVIEW_COUNT;

  if (months.length === 0) return <span className="text-[10px] text-slate-300">-</span>;

  const getValue = (m: MonthlyAgg): number => {
    if (field === "purchase") return m.purchase;
    if (field === "payment") return m.payment;
    return m.endBalance;
  };

  const getColor = (m: MonthlyAgg): string => {
    if (field === "purchase") return "text-emerald-700";
    if (field === "payment") return "text-sky-700";
    const v = m.endBalance;
    return v > 0 ? "text-amber-700" : v < 0 ? "text-rose-700" : "text-slate-400";
  };

  // 최대값 (bar 비율용)
  const maxVal = Math.max(...months.slice(0, EXPAND_COUNT).map(m => Math.abs(getValue(m))), 1);

  return (
    <div className="inline-flex flex-col gap-0.5 ml-1 align-top">
      {visible.map((m) => {
        const val = getValue(m);
        const barPct = Math.round((Math.abs(val) / maxVal) * 40); // 최대 40px
        return (
          <div key={m.ym} className="inline-flex items-center gap-1.5 h-4">
            {/* 월 라벨 */}
            <span className="text-[10px] text-slate-400 tabular-nums w-[46px] shrink-0 leading-none">
              {m.ym.slice(2).replace("-", "/")}
            </span>
            {/* mini bar */}
            <span
              className={`inline-block h-1.5 rounded-full opacity-40 shrink-0 ${
                field === "purchase" ? "bg-emerald-500" :
                field === "payment"  ? "bg-sky-500" :
                val > 0 ? "bg-amber-500" : val < 0 ? "bg-rose-500" : "bg-slate-300"
              }`}
              style={{ width: `${Math.max(barPct, 2)}px` }}
            />
            {/* 금액 */}
            <span className={`text-[10px] font-semibold tabular-nums leading-none ${getColor(m)}`}>
              {val === 0 ? "-" : `${fmtWonShort(Math.abs(val))}${field === "balance" && val < 0 ? " 초과" : ""}`}
            </span>
          </div>
        );
      })}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="inline-flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-sky-500 transition leading-none mt-0.5 cursor-pointer"
        >
          {expanded
            ? <><ChevronUp size={9} /> 접기</>
            : <><ChevronDown size={9} /> +{months.length - PREVIEW_COUNT}개월 더</>
          }
        </button>
      )}
    </div>
  );
};

// ─── VendorInfoHeader ─────────────────────────────────────────────────────

export const VendorInfoHeader: React.FC<VendorInfoHeaderProps> = ({
  vendor, kpi, loading = false, ledgerRows,
}) => {
  const balanceColor: "amber" | "emerald" | "rose" =
    kpi.balance > 0 ? "amber" : kpi.balance < 0 ? "rose" : "emerald";

  const momIcon =
    kpi.momPct == null ? <Minus size={10} /> :
    kpi.momPct > 0 ? <TrendingUp size={10} /> :
    kpi.momPct < 0 ? <TrendingDown size={10} /> :
    <Minus size={10} />;
  const momText =
    kpi.momPct == null ? "전월 데이터 없음" :
    kpi.momPct === 0 ? "전월 대비 변동 없음" :
    `전월 대비 ${kpi.momPct > 0 ? "+" : ""}${kpi.momPct.toFixed(1)}%`;

  const copyBizNum = () => {
    if (!vendor.business_number) return;
    const raw = vendor.business_number.replace(/\D/g, "");
    navigator.clipboard?.writeText(raw).catch(() => {});
  };

  // 월별 집계 (ledgerRows 있을 때만)
  const monthlyAgg = useMemo(
    () => (ledgerRows && ledgerRows.length > 0 ? buildMonthlyAgg(ledgerRows) : []),
    [ledgerRows],
  );

  // 각 KPI 항목의 인라인 펼침 상태
  const [openPurchase, setOpenPurchase]   = useState(false);
  const [openPayment,  setOpenPayment]    = useState(false);
  const [openBalance,  setOpenBalance]    = useState(false);

  const hasMonthly = monthlyAgg.length > 0;

  // 토글 버튼 공통 스타일
  const toggleBtn = (open: boolean) =>
    `inline-flex items-center justify-center w-4 h-4 rounded transition cursor-pointer shrink-0 ${
      open
        ? "bg-slate-200 text-slate-600"
        : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
    }`;

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">

      {/* 헤더 · 공급사명 + 배지 + 활성 pill */}
      <div className="flex items-start gap-3">
        {/* 아이콘 원형 */}
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 ring-1 ring-sky-200">
          <Building2 size={18} className="text-sky-600" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* 공급사명 + 분류 배지 + VAT 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-black text-slate-800 leading-tight break-words">
              {vendor.company_name}
            </h2>
            <VendorCategoryBadge category={vendor.category} />
            {/* 2026-08-03 · #193 · VAT 배지 (설정된 경우만 · 미설정은 미표시) */}
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

          {/* 사업자번호 · 클릭 복사 */}
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

      {/* KPI · 심플 텍스트 (2026-08-03 사용자 요청 · 카드 대시보드 제거) */}
      {/* 2026-08-03 · 월별 리스트 인라인 드롭다운 추가 */}
      <dl className="flex flex-col gap-2 pl-1 text-[13px]">

        {/* ── 총 매입 ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5">
          <div className="inline-flex items-baseline gap-1.5 flex-wrap">
            <dt className="text-slate-500 font-semibold">총 매입</dt>
            <dd className="font-black text-emerald-700 tabular-nums">
              {fmtWon(kpi.totalPurchase)}
              {kpi.totalPurchase >= 10_000 && <span className="text-[11px] font-bold text-slate-400 ml-0.5">원</span>}
            </dd>
            {kpi.rowCount != null && <span className="text-[11px] text-slate-400">({kpi.rowCount}건)</span>}
            {/* 월별 토글 버튼 */}
            {hasMonthly && !loading && (
              <button
                type="button"
                onClick={() => setOpenPurchase(v => !v)}
                className={toggleBtn(openPurchase)}
                title="월별 매입 리스트"
                aria-expanded={openPurchase}
              >
                {openPurchase ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
            )}
          </div>
          {/* 월별 미리보기 (항상 표시 · 단 펼침 토글 기준) */}
          {hasMonthly && !loading && openPurchase && (
            <div className="ml-[52px] mt-0.5">
              <MonthlyDropdown months={monthlyAgg} field="purchase" />
            </div>
          )}
          {/* 닫힌 상태에서도 최근 3개월 인라인 미리보기 */}
          {hasMonthly && !loading && !openPurchase && (
            <div className="inline-flex items-center gap-2 ml-[52px] flex-wrap">
              {monthlyAgg.slice(0, PREVIEW_COUNT).map(m => (
                <span key={m.ym} className="inline-flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 tabular-nums">{m.ym.slice(2).replace("-", "/")}</span>
                  <span className="text-[10px] font-semibold text-emerald-700 tabular-nums">
                    {m.purchase > 0 ? fmtWonShort(m.purchase) : "-"}
                  </span>
                </span>
              ))}
              {monthlyAgg.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setOpenPurchase(true)}
                  className="text-[10px] text-slate-400 hover:text-sky-500 transition cursor-pointer"
                >
                  +{monthlyAgg.length - PREVIEW_COUNT}개월
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── 총 결제 ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5">
          <div className="inline-flex items-baseline gap-1.5 flex-wrap">
            <dt className="text-slate-500 font-semibold">총 결제</dt>
            <dd className="font-black text-sky-700 tabular-nums">
              {fmtWon(kpi.totalPayment)}
              {kpi.totalPayment >= 10_000 && <span className="text-[11px] font-bold text-slate-400 ml-0.5">원</span>}
            </dd>
            {kpi.momPct != null && (
              <span className="text-[11px] text-slate-400 inline-flex items-center gap-0.5">
                {momIcon}{momText}
              </span>
            )}
            {hasMonthly && !loading && (
              <button
                type="button"
                onClick={() => setOpenPayment(v => !v)}
                className={toggleBtn(openPayment)}
                title="월별 결제 리스트"
                aria-expanded={openPayment}
              >
                {openPayment ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
            )}
          </div>
          {hasMonthly && !loading && openPayment && (
            <div className="ml-[52px] mt-0.5">
              <MonthlyDropdown months={monthlyAgg} field="payment" />
            </div>
          )}
          {hasMonthly && !loading && !openPayment && (
            <div className="inline-flex items-center gap-2 ml-[52px] flex-wrap">
              {monthlyAgg.slice(0, PREVIEW_COUNT).map(m => (
                <span key={m.ym} className="inline-flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 tabular-nums">{m.ym.slice(2).replace("-", "/")}</span>
                  <span className="text-[10px] font-semibold text-sky-700 tabular-nums">
                    {m.payment > 0 ? fmtWonShort(m.payment) : "-"}
                  </span>
                </span>
              ))}
              {monthlyAgg.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setOpenPayment(true)}
                  className="text-[10px] text-slate-400 hover:text-sky-500 transition cursor-pointer"
                >
                  +{monthlyAgg.length - PREVIEW_COUNT}개월
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── 잔고 ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-0.5">
          <div className="inline-flex items-baseline gap-1.5 flex-wrap">
            <dt className="text-slate-500 font-semibold">잔고</dt>
            <dd className={`font-black tabular-nums ${
              balanceColor === "amber" ? "text-amber-700" :
              balanceColor === "rose" ? "text-rose-700" : "text-emerald-700"
            }`}>
              {fmtWon(Math.abs(kpi.balance))}
              {Math.abs(kpi.balance) >= 10_000 && <span className="text-[11px] font-bold text-slate-400 ml-0.5">원</span>}
            </dd>
            <span className="text-[11px] text-slate-400">
              {kpi.balance > 0 ? "· 미결제" : kpi.balance < 0 ? "· 초과 결제" : "· 완납"}
            </span>
            {hasMonthly && !loading && (
              <button
                type="button"
                onClick={() => setOpenBalance(v => !v)}
                className={toggleBtn(openBalance)}
                title="월별 잔고 리스트"
                aria-expanded={openBalance}
              >
                {openBalance ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
              </button>
            )}
          </div>
          {hasMonthly && !loading && openBalance && (
            <div className="ml-[28px] mt-0.5">
              <MonthlyDropdown months={monthlyAgg} field="balance" />
            </div>
          )}
          {hasMonthly && !loading && !openBalance && (
            <div className="inline-flex items-center gap-2 ml-[28px] flex-wrap">
              {monthlyAgg.slice(0, PREVIEW_COUNT).map(m => {
                const v = m.endBalance;
                const cls = v > 0 ? "text-amber-700" : v < 0 ? "text-rose-700" : "text-slate-400";
                return (
                  <span key={m.ym} className="inline-flex items-center gap-1">
                    <span className="text-[10px] text-slate-400 tabular-nums">{m.ym.slice(2).replace("-", "/")}</span>
                    <span className={`text-[10px] font-semibold tabular-nums ${cls}`}>
                      {fmtWonShort(Math.abs(v))}{v < 0 ? " 초과" : v === 0 ? " 완납" : ""}
                    </span>
                  </span>
                );
              })}
              {monthlyAgg.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setOpenBalance(true)}
                  className="text-[10px] text-slate-400 hover:text-sky-500 transition cursor-pointer"
                >
                  +{monthlyAgg.length - PREVIEW_COUNT}개월
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── 평균 매입주기 ────────────────────────────────────── */}
        <div className="inline-flex items-baseline gap-1.5">
          <dt className="text-slate-500 font-semibold">평균 매입주기</dt>
          <dd className="font-black text-slate-700 tabular-nums">
            {kpi.avgCycleDays != null ? String(kpi.avgCycleDays) : "-"}
            {kpi.avgCycleDays != null && <span className="text-[11px] font-bold text-slate-400 ml-0.5">일</span>}
          </dd>
        </div>
      </dl>
    </div>
  );
};

export default VendorInfoHeader;
