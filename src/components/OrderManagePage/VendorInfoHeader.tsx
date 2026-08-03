// src/components/OrderManagePage/VendorInfoHeader.tsx
// 공급사 상세 패널 — 최상단 헤더 카드 + KPI 4개
// 재사용: VendorDetailTabs, PaymentInfoTab 공용
// VendorHeaderPanel(PurchaseHistoryTab)과 유사 · 결제잔고 KPI 로 교체
// Props: vendor + ledger KPI (총 매입/결제/잔고) + 평균 매입주기

import React from "react";
import {
  Building2, Phone, User2, Mail, Calendar,
  TrendingUp, TrendingDown, Minus, Wallet, ReceiptText, Scale,
} from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { KpiCard } from "../common/KpiCard";

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
}

export interface VendorKpi {
  totalPurchase: number;   // 기간 내 총 매입액
  totalPayment: number;    // 기간 내 총 결제액
  balance: number;         // 현재 잔고 (매입 - 결제)
  avgCycleDays: number | null; // 평균 매입주기 (일)
  momPct?: number | null;  // 이번달 MoM %
  rowCount?: number;       // 원장 건수
}

interface VendorInfoHeaderProps {
  vendor: VendorBasic;
  kpi: VendorKpi;
  loading?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
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

// ─── VendorInfoHeader ─────────────────────────────────────────────────────

export const VendorInfoHeader: React.FC<VendorInfoHeaderProps> = ({ vendor, kpi, loading = false }) => {
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

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">

      {/* 헤더 · 공급사명 + 배지 + 활성 pill */}
      <div className="flex items-start gap-3">
        {/* 아이콘 원형 */}
        <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 ring-1 ring-sky-200">
          <Building2 size={18} className="text-sky-600" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* 공급사명 + 분류 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-black text-slate-800 leading-tight break-words">
              {vendor.company_name}
            </h2>
            <VendorCategoryBadge category={vendor.category} />
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

      {/* KPI 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard
          icon={ReceiptText}
          label="총 매입액"
          value={
            <span>
              {fmtWon(kpi.totalPurchase)}
              {kpi.totalPurchase >= 10_000 && (
                <span className="text-[10px] font-semibold text-slate-400 ml-0.5">원</span>
              )}
            </span>
          }
          subtitle={loading ? "로딩 중" : kpi.rowCount != null ? `${kpi.rowCount}건` : undefined}
          color="emerald"
        />
        <KpiCard
          label="총 결제액"
          value={
            <span>
              {fmtWon(kpi.totalPayment)}
              {kpi.totalPayment >= 10_000 && (
                <span className="text-[10px] font-semibold text-slate-400 ml-0.5">원</span>
              )}
            </span>
          }
          subtitle={<span className="inline-flex items-center gap-0.5">{momIcon}{momText}</span>}
          color="sky"
        />
        <KpiCard
          icon={Scale}
          label="현재 잔고"
          value={
            <span>
              {fmtWon(Math.abs(kpi.balance))}
              {Math.abs(kpi.balance) >= 10_000 && (
                <span className="text-[10px] font-semibold text-slate-400 ml-0.5">원</span>
              )}
            </span>
          }
          subtitle={kpi.balance > 0 ? "미결제 잔액" : kpi.balance < 0 ? "초과 결제" : "완납"}
          color={balanceColor}
        />
        <KpiCard
          label="평균 매입주기"
          value={
            <span>
              {kpi.avgCycleDays != null ? String(kpi.avgCycleDays) : "-"}
              {kpi.avgCycleDays != null && (
                <span className="text-[10px] font-semibold text-slate-400 ml-0.5">일</span>
              )}
            </span>
          }
          subtitle="매입일 간 평균 간격"
          color="slate"
        />
      </div>
    </div>
  );
};

export default VendorInfoHeader;
