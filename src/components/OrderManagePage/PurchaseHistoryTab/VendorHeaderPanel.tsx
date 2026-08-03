// src/components/OrderManagePage/PurchaseHistoryTab/VendorHeaderPanel.tsx
// 우측 상단 · 공급사 정보 헤더 + KPI 4카드 (2026-08-03)
// Procurement dashboard 표준 · 3~4 KPI · 5+ 지양
// - 헤더 · 공급사명 (H2) + 분류 + 사업자번호 + 활성
// - Sub · 연락처 · 담당자 · 결제조건 · 등록일
// - KPI 4 · 누적매입 · 이번달(MoM%) · 평균매입주기 · 활성상품수

import React, { useMemo } from "react";
import { Building2, Phone, User2, Calendar, Package, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { VendorCategoryBadge } from "../../common/VendorCategoryBadge";
import type { PurchaseDetailRow } from "./PurchaseSubTabs";

export interface VendorFull {
  id: number;
  company_name: string;
  category: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_number?: string | null;
  note?: string | null;
  created_at?: string | null;
}

interface VendorHeaderPanelProps {
  vendor: VendorFull;
  detailRows: PurchaseDetailRow[]; // 최근 365일 raw rows · KPI 산출용
  loading: boolean;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
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

// ─── KPI 계산 ─────────────────────────────────────────────────────────────

interface Kpis {
  totalAmount: number;
  thisMonthAmount: number;
  lastMonthAmount: number;
  momPct: number | null;
  avgCycleDays: number | null;
  activeSkuCount: number;
}

function calcKpis(rows: PurchaseDetailRow[]): Kpis {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartYmd = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // 지난달 말일
  const lmStartYmd = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const lmEndYmd = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEnd.getDate()).padStart(2, "0")}`;

  let total = 0;
  let thisMonth = 0;
  let lastMonth = 0;
  const skuSet = new Set<string>();
  const purchaseDates = new Set<string>();

  for (const r of rows) {
    total += r.amount;
    if (r.date >= monthStartYmd) thisMonth += r.amount;
    if (r.date >= lmStartYmd && r.date <= lmEndYmd) lastMonth += r.amount;
    if (r.product_code) skuSet.add(r.product_code);
    if (r.date) purchaseDates.add(r.date);
  }

  const momPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

  // 평균 매입주기 · distinct date 간 평균 diff
  let avgCycleDays: number | null = null;
  if (purchaseDates.size >= 2) {
    const sorted = Array.from(purchaseDates).sort();
    let sumDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1] + "T00:00:00").getTime();
      const d2 = new Date(sorted[i] + "T00:00:00").getTime();
      sumDiff += (d2 - d1) / (24 * 60 * 60 * 1000);
    }
    avgCycleDays = Math.round(sumDiff / (sorted.length - 1));
  }

  return {
    totalAmount: total,
    thisMonthAmount: thisMonth,
    lastMonthAmount: lastMonth,
    momPct,
    avgCycleDays,
    activeSkuCount: skuSet.size,
  };
}

// ─── KpiCard ──────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  suffix?: string;
  hint?: React.ReactNode;
  tone?: "emerald" | "slate" | "amber" | "rose";
  icon?: React.ReactNode;
}

const TONE: Record<string, { valueCls: string; badgeCls: string }> = {
  emerald: { valueCls: "text-emerald-700", badgeCls: "bg-emerald-50 text-emerald-600" },
  slate:   { valueCls: "text-slate-700",   badgeCls: "bg-slate-50 text-slate-500" },
  amber:   { valueCls: "text-amber-700",   badgeCls: "bg-amber-50 text-amber-600" },
  rose:    { valueCls: "text-rose-700",    badgeCls: "bg-rose-50 text-rose-600" },
};

const KpiCard: React.FC<KpiCardProps> = ({ label, value, suffix, hint, tone = "slate", icon }) => {
  const t = TONE[tone];
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-3 py-2.5 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5">
        {icon && <span className={`w-5 h-5 flex items-center justify-center rounded ${t.badgeCls}`}>{icon}</span>}
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider truncate">{label}</span>
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span className={`text-[16px] font-black tabular-nums truncate ${t.valueCls}`}>{value}</span>
        {suffix && <span className="text-[10px] font-semibold text-slate-400 shrink-0">{suffix}</span>}
      </div>
      {hint && <div className="text-[10px] text-slate-500 leading-tight">{hint}</div>}
    </div>
  );
};

// ─── VendorHeaderPanel ────────────────────────────────────────────────────

export const VendorHeaderPanel: React.FC<VendorHeaderPanelProps> = ({ vendor, detailRows, loading }) => {
  const kpis = useMemo(() => calcKpis(detailRows), [detailRows]);
  const momIcon = kpis.momPct == null ? <Minus size={10} /> : kpis.momPct > 0 ? <TrendingUp size={10} /> : kpis.momPct < 0 ? <TrendingDown size={10} /> : <Minus size={10} />;
  const momTone: "emerald" | "rose" | "slate" = kpis.momPct == null ? "slate" : kpis.momPct > 5 ? "emerald" : kpis.momPct < -5 ? "rose" : "slate";
  const momText = kpis.momPct == null
    ? "전월 매입 없음"
    : kpis.momPct === 0
      ? "전월 대비 변동 없음"
      : `전월 대비 ${kpis.momPct > 0 ? "+" : ""}${kpis.momPct.toFixed(1)}%`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col gap-3">
      {/* 헤더 · 공급사명 라인 */}
      <div className="flex items-start gap-2 flex-wrap">
        <Building2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-black text-slate-800 break-words">{vendor.company_name}</h2>
            <VendorCategoryBadge category={vendor.category} />
            {vendor.business_number && (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 tabular-nums">
                {fmtBizNum(vendor.business_number)}
              </span>
            )}
          </div>
          {/* Sub-line · 담당자·연락처·등록일 */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
            {vendor.contact_name && (
              <span className="inline-flex items-center gap-1">
                <User2 size={10} className="text-slate-400" />
                {vendor.contact_name}
              </span>
            )}
            {vendor.phone && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone size={10} className="text-slate-400" />
                {fmtPhone(vendor.phone)}
              </span>
            )}
            {vendor.email && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]" title={vendor.email}>
                @{vendor.email}
              </span>
            )}
            {vendor.created_at && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Calendar size={10} className="text-slate-400" />
                등록 {fmtDate(vendor.created_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI 4개 · 최근 365일 기준 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard
          label="누적 매입액 (1년)"
          value={fmtWon(kpis.totalAmount)}
          suffix={kpis.totalAmount >= 10_000 ? "원" : ""}
          hint={loading ? "로딩 중" : `${detailRows.length}건`}
          tone="emerald"
        />
        <KpiCard
          label="이번달 매입액"
          value={fmtWon(kpis.thisMonthAmount)}
          suffix={kpis.thisMonthAmount >= 10_000 ? "원" : ""}
          hint={<span className="inline-flex items-center gap-0.5">{momIcon}{momText}</span>}
          tone={momTone}
        />
        <KpiCard
          label="평균 매입주기"
          value={kpis.avgCycleDays != null ? String(kpis.avgCycleDays) : "-"}
          suffix={kpis.avgCycleDays != null ? "일" : ""}
          hint="매입일 간 평균 간격"
          tone="slate"
        />
        <KpiCard
          label="활성 상품수"
          value={kpis.activeSkuCount > 0 ? kpis.activeSkuCount.toLocaleString() : "-"}
          suffix={kpis.activeSkuCount > 0 ? "종" : ""}
          hint="Distinct SKU (1년)"
          tone="slate"
          icon={<Package size={12} />}
        />
      </div>
    </div>
  );
};

export default VendorHeaderPanel;
