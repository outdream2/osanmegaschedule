// 2026-08-17 · apiClient 마이그레이션
// src/components/OrderManagePage/VendorDetailTabs.tsx
// 공급사 상세 패널 — 하단 2탭 (결제내역 · 매입이력)
// VendorInfoHeader 아래에 배치 · vendor, ledger, purchase-detail API 활용
// Props: vendor (VendorBasic) → 내부에서 직접 fetch
// 2026-08-29 · 탭 컨텐츠 분리 · LedgerContent → .ledger.tsx · HistoryContent → .history.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Package2, ReceiptText, Wallet, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { VendorInfoHeader, type VendorBasic, type VendorKpi, type LedgerRowMinimal } from "./VendorInfoHeader";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { SplitRightTabs } from "../common/SplitRightTabs";
import { IconTile } from "../common/IconTile";
import { GradientAccent } from "../common/GradientAccent";
import { CARD_BASE } from "../../styles/tokens";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";
import { LedgerContent } from "./VendorDetailTabs.ledger";
import { HistoryContent } from "./VendorDetailTabs.history";
import {
  type LedgerSummary, type PurchaseDetailRow, type TabKey,
  calcAvgCycle,
} from "./VendorDetailTabs.types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface VendorDetailTabsProps {
  vendor: VendorBasic;
  /** 외부에서 기간 필터를 공유할 때 사용 · 미지정 시 내부에서 관리 */
  periodMonths?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  periodSeason?: SeasonKey | null;
  onPeriodChange?: (months: 0 | 1 | 2 | 3 | 4 | 5 | 6, season: SeasonKey | null) => void;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const VendorDetailTabs: React.FC<VendorDetailTabsProps> = ({ vendor }) => {
  const { toast, showError } = useToast();
  // 2026-08-24 · 사용자 지시 · 공급사 정보 수정 · openVendorInfo · [수정] 버튼 wiring
  const { openVendorInfo, modalElement: vendorModalElement } = useVendorInfoModal();
  const [activeTab, setActiveTab] = useState<TabKey>("balance");

  // 기간 필터 (내부 관리)
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // 원장 데이터
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 매입상세 데이터
  const [detailRows, setDetailRows] = useState<PurchaseDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const days = periodSeason ? 365 : (periodMonths === 0 ? 10 : (periodMonths || 1) * 30);

  const loadLedger = useCallback(async () => {
    if (!vendor) return;
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const params = new URLSearchParams({ supplier: vendor.company_name, days: String(days) });
      const { data: j } = await api.get<any>(`/api/supplier-ledger?${params}`);
      setLedger({
        supplier: j.supplier ?? vendor.company_name,
        rows: Array.isArray(j.rows) ? j.rows : [],
        total_purchase: Number(j.total_purchase ?? 0),
        total_payment: Number(j.total_payment ?? 0),
        current_balance: Number(j.current_balance ?? 0),
        // 2026-08-03 · #193 · VAT 통합 필드 (서버가 없으면 0)
        vat_included: j.vat_included === true ? true : j.vat_included === false ? false : null,
        total_purchase_vat: Number(j.total_purchase_vat ?? 0),
        total_purchase_supply: Number(j.total_purchase_supply ?? 0),
        total_payment_vat: Number(j.total_payment_vat ?? 0),
        total_payment_supply: Number(j.total_payment_supply ?? 0),
      });
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류");
      setLedgerError(msg);
      setLedger(null);
      showError(`원장 로드 실패: ${msg}`);
    } finally { setLedgerLoading(false); }
  }, [vendor, days]);

  const loadDetail = useCallback(async () => {
    if (!vendor) return;
    setDetailLoading(true);
    try {
      const { data: j } = await api.get<any>(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(vendor.company_name)}&days=${days}`);
      setDetailRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setDetailRows([]);
      showError(`매입이력 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally { setDetailLoading(false); }
  }, [vendor, days]);

  // 공급사/기간 변경 시 재조회
  useEffect(() => {
    loadLedger();
    loadDetail();
  }, [loadLedger, loadDetail]);

  // KPI 계산 (ledger 기반)
  const kpi = useMemo<VendorKpi>(() => {
    const totalPurchase = ledger?.total_purchase ?? 0;
    const totalPayment = ledger?.total_payment ?? 0;
    const balance = ledger?.current_balance ?? 0;
    const avgCycleDays = calcAvgCycle(detailRows);

    // MoM: 이번달 vs 지난달 (detailRows 기반)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lmStart = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
    const lmEnd = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEnd.getDate()).padStart(2, "0")}`;
    let thisMonth = 0; let lastMonth = 0;
    for (const r of detailRows) {
      if (r.date >= monthStart) thisMonth += r.amount;
      if (r.date >= lmStart && r.date <= lmEnd) lastMonth += r.amount;
    }
    const momPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

    // 활성 상품수 · 표시 기간 내 unique product_code
    const codeSet = new Set<string>();
    for (const r of detailRows) {
      const code = (r.product_code ?? "").trim();
      if (code) codeSet.add(code);
    }
    const activeProductCount = codeSet.size;

    return {
      totalPurchase,
      totalPayment,
      balance,
      avgCycleDays,
      momPct,
      rowCount: ledger?.rows.length,
      activeProductCount,
    };
  }, [ledger, detailRows]);

  const isLoading = ledgerLoading || detailLoading;

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* 헤더 카드 · 2026-08-24 · [수정] 버튼 · openVendorInfo → VendorDetailModal */}
      <VendorInfoHeader
        vendor={vendor}
        kpi={kpi}
        loading={isLoading}
        ledgerRows={ledger?.rows as LedgerRowMinimal[] | undefined}
        onEdit={() => openVendorInfo(vendor as any)}
      />
      {vendorModalElement}

      {/* 기간 필터 + 새로고침 */}
      <div className={`${CARD_BASE} px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5`}>
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">기간</span>
        <div className="flex flex-wrap bg-zinc-50 border border-line rounded-lg p-0.5 gap-0.5">
          <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
            className={`px-2.5 h-6 text-[11px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
            10일
          </button>
          {([1, 2, 3, 4, 5, 6] as const).map(m => (
            <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
              className={`px-2.5 h-6 text-[11px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              {m}개월
            </button>
          ))}
        </div>
        <SeasonButtons
          value={periodSeason}
          onChange={v => { setPeriodSeason(v); if (v) setPeriodMonths(0); }}
          size="sm"
          hideLabel
        />
        <button
          type="button"
          onClick={() => { loadLedger(); loadDetail(); }}
          disabled={isLoading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 2026-08-25 · SplitRightTabs 프리미티브 이관 · v9 브랜드 시그니처 · 폰트 +2 */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        <SplitRightTabs
          tabs={[
            { key: "balance", label: "결제내역", icon: ReceiptText as any, count: ledger?.rows.filter(r => r.type === "payment").length ?? undefined },
            { key: "history", label: "매입이력", icon: Package2 as any, count: detailRows.length || undefined },
          ]}
          active={activeTab}
          onSelect={(k) => setActiveTab(k as TabKey)}
          bg="bg-white"
        />
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "balance" && (
          <div className={`relative ${CARD_BASE} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            {/* v9 · gradient topAccent (brand-deep → sky-500) */}
            <GradientAccent size="thin" className="z-10" />
            {/* 탭 내 KPI 3개 · 매입금액 · 결제금액 · 남은잔고 (미결제) */}
            {/* 2026-08-25 · v9 · IconTile + 폰트 +2 · Delta trend · Vercel/Attio 톤 */}
            {ledger && !ledgerLoading && (() => {
              const vatMode = ledger.vat_included;
              const vatModeText =
                vatMode === true  ? "VAT 포함" :
                vatMode === false ? "VAT 별도" :
                                    "VAT 미설정";
              const vatModeTone: PillTone =
                vatMode === true  ? "emerald" :
                vatMode === false ? "amber" :
                                    "zinc";
              const payRatio = ledger.total_purchase > 0
                ? Math.round((ledger.total_payment / ledger.total_purchase) * 100)
                : null;
              const items = [
                {
                  label: "매입 금액",
                  value: ledger.total_purchase,
                  tone: "emerald" as const,
                  icon: <Package2 size={14} strokeWidth={2.4} />,
                  subtitle: "구입 총액",
                  vatBadge: vatMode != null ? `VAT ${ledger.total_purchase_vat.toLocaleString()}원 · 공급가액 ${ledger.total_purchase_supply.toLocaleString()}원` : null,
                  trend: null as null | { icon: React.ReactNode; text: string; cls: string },
                },
                {
                  label: "결제 금액",
                  value: ledger.total_payment,
                  tone: "sky" as const,
                  icon: <Wallet size={14} strokeWidth={2.4} />,
                  subtitle: payRatio != null ? `매입 대비 ${payRatio}%` : "지불 총액",
                  vatBadge: vatMode === true && ledger.total_payment_vat > 0 ? `VAT ${ledger.total_payment_vat.toLocaleString()}원 · 공급가액 ${ledger.total_payment_supply.toLocaleString()}원` : null,
                  trend: null,
                },
                {
                  label: "남은 잔고 (미결제)",
                  value: ledger.current_balance,
                  tone: ledger.current_balance > 0 ? "amber" as const : "emerald" as const,
                  icon: ledger.current_balance > 0
                    ? <TrendingUp size={14} strokeWidth={2.4} />
                    : ledger.current_balance < 0
                      ? <TrendingDown size={14} strokeWidth={2.4} />
                      : <Minus size={14} strokeWidth={2.4} />,
                  subtitle: ledger.current_balance > 0 ? "지불 필요" : ledger.current_balance < 0 ? "초과 결제" : "완납",
                  vatBadge: null,
                  trend: null,
                },
              ];
              return (
                <div className="flex flex-col">
                  {/* VAT 모드 배지 (전체 우상단) */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">기간 합계</span>
                    <span
                      title={
                        vatMode === true  ? "거래명세서 총액에 VAT 포함 · amount÷11 로 세액 산정" :
                        vatMode === false ? "거래명세서 총액은 공급가액 · amount×0.1 별도 세액" :
                                            "공급사 관리에서 VAT 처리 방식을 설정하면 세액이 계산됩니다"
                      }
                    >
                      <StatusPill tone={vatModeTone} size="sm" dot={vatMode !== null}>{vatModeText}</StatusPill>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-0 border-b border-line bg-gradient-to-b from-zinc-50/60 to-white">
                    {items.map((item, i) => (
                      <div key={i} className={`px-4 py-3.5 ${i < 2 ? "border-r border-line" : ""} flex flex-col gap-1.5`}>
                        <div className="flex items-center gap-2">
                          <IconTile icon={item.icon} tone={item.tone} size="sm" />
                          <span className="text-[13px] font-bold text-zinc-600 tracking-tight">{item.label}</span>
                        </div>
                        <span className={`text-[22px] font-extrabold tabular-nums leading-tight tracking-tight ${
                          item.tone === "emerald" ? "text-emerald-700" :
                          item.tone === "sky" ? "text-sky-700" :
                          "text-amber-700"
                        }`}>
                          {item.value.toLocaleString()}<span className="text-[13px] font-bold ml-0.5 text-zinc-400">원</span>
                        </span>
                        <span className="text-[12px] text-zinc-500 font-semibold">{item.subtitle}</span>
                        {item.vatBadge && (
                          <span className="text-[11px] text-zinc-500 font-semibold tabular-nums mt-0.5 leading-tight bg-zinc-50 px-2 py-1 rounded-md border border-line">
                            {item.vatBadge}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <LedgerContent ledger={ledger} loading={ledgerLoading} error={ledgerError} />
          </div>
        )}
        {activeTab === "history" && (
          <HistoryContent detailRows={detailRows} loading={detailLoading} />
        )}
      </div>
    </div>
    </>
  );
};

export default VendorDetailTabs;
