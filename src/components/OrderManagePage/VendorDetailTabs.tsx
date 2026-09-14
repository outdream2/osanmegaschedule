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
import { OrderHistoryContent } from "./VendorDetailTabs.orders";
import { SalesContent } from "./VendorDetailTabs.sales";
import {
  type LedgerSummary, type PurchaseDetailRow, type TabKey,
  type OrderHistoryGroup, type SalesTrendRow,
  calcAvgCycle,
} from "./VendorDetailTabs.types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface VendorDetailTabsProps {
  vendor: VendorBasic;
  // 2026-09-10 · #71 · 사용자 지시 · 부모 상단 툴바 · 기간 통합 시 · 값 수신
  externalPeriodMonths?: number;
  externalPeriodSeason?: string | null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const VendorDetailTabs: React.FC<VendorDetailTabsProps> = ({ vendor, externalPeriodMonths, externalPeriodSeason }) => {
  const { toast, showError } = useToast();
  // 2026-08-24 · 사용자 지시 · 공급사 정보 수정 · openVendorInfo · [수정] 버튼 wiring
  const { openVendorInfo, modalElement: vendorModalElement } = useVendorInfoModal();
  const [activeTab, setActiveTab] = useState<TabKey>("balance");

  // 발주내역 데이터
  const [orderGroups, setOrderGroups] = useState<OrderHistoryGroup[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);

  // 판매내역 데이터
  const [salesRows, setSalesRows] = useState<SalesTrendRow[]>([]);
  const [salesProducts, setSalesProducts] = useState<import("./VendorDetailTabs.types").SalesProductRow[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);

  // 기간 필터 (내부 관리)
  // 2026-09-10 · #71 · 사용자 지시 · external 값 있으면 사용 · 없으면 내부 관리 (fallback)
  const [periodMonthsLocal, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeasonLocal, setPeriodSeason] = useState<SeasonKey | null>(null);
  const periodMonths = (externalPeriodMonths != null ? (externalPeriodMonths as 0|1|2|3|4|5|6) : periodMonthsLocal);
  const periodSeason = (externalPeriodSeason !== undefined ? (externalPeriodSeason as SeasonKey | null) : periodSeasonLocal);
  // 미사용 setter 경고 회피
  void setPeriodMonths; void setPeriodSeason;

  // 원장 데이터
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 2026-09-14 · 사용자 지시 · 재고자산 공식 통일 · 매입액 − 판매원가 (대원칙 memory · project_stock_asset_balance_formula_2026-09-10.md)
  //   · 이전 · ERP 현재고 × 사입단가 (/api/supplier-stock-value) · 페이지 내 다른 위치와 상충
  //   · 이후 · salesRows 파생 · totalPurchaseCost − totalCogs · 페이지 내 모든 재고자산 값 통일
  const totalStockAsset = useMemo(() => {
    let totalP = 0; let totalC = 0;
    for (const r of salesRows) {
      totalP += Number(r.purchase_cost ?? 0) || 0;
      totalC += Number(r.cogs_amount ?? 0) || 0;
    }
    return totalP - totalC;
  }, [salesRows]);

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
      showError(`매입내역 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally { setDetailLoading(false); }
  }, [vendor, days]);

  const loadOrders = useCallback(async () => {
    if (!vendor) return;
    setOrderLoading(true);
    try {
      const { data: j } = await api.get<any>(`/api/order-history?supplier=${encodeURIComponent(vendor.company_name)}&days=${days}`);
      setOrderGroups(Array.isArray(j.orders) ? j.orders : []);
    } catch {
      setOrderGroups([]);
    } finally { setOrderLoading(false); }
  }, [vendor, days]);

  const loadSales = useCallback(async () => {
    if (!vendor) return;
    setSalesLoading(true);
    try {
      const months = periodSeason ? 12 : (periodMonths === 0 ? 1 : periodMonths);
      const { data: j } = await api.get<any>(`/api/sales-trend/supplier?name=${encodeURIComponent(vendor.company_name)}&months=${months}`);
      setSalesRows(Array.isArray(j.rows) ? j.rows : []);
      setSalesProducts(Array.isArray(j.products) ? j.products : []);
    } catch {
      setSalesRows([]);
      setSalesProducts([]);
    } finally { setSalesLoading(false); }
  }, [vendor, periodMonths, periodSeason]);

  // 공급사/기간 변경 시 재조회
  useEffect(() => {
    loadLedger();
    loadDetail();
    loadOrders();
    loadSales();
  }, [loadLedger, loadDetail, loadOrders, loadSales]);

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

  const isLoading = ledgerLoading || detailLoading || orderLoading || salesLoading;

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {vendorModalElement}

      {/* 2026-09-10 · #71 · 사용자 지시 · 기간 필터 · 상단 툴바 (VendorPaymentPanel) 로 통합
          · external 값 사용 시 · 자체 UI 완전 숨김 · 외부 툴바가 기간 관리 */}
      {externalPeriodMonths == null && (
        <div className={`${CARD_BASE} px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5`}>
          <span className="text-[14px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">기간</span>
          <div className="flex flex-wrap bg-zinc-50 border border-line rounded-lg p-0.5 gap-0.5">
            <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
              className={`px-2.5 h-6 text-[15px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              10일
            </button>
            {([1, 2, 3, 4, 5, 6] as const).map(m => (
              <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
                className={`px-2.5 h-6 text-[15px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
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
            onClick={() => { loadLedger(); loadDetail(); loadOrders(); loadSales(); }}
            disabled={isLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      )}

      {/* 헤더 카드 · 벤더 정보 + 월별 표 · 2026-09-10 · 사용자 지시 · 기간 필터 아래로 이동 */}
      <VendorInfoHeader
        vendor={vendor}
        kpi={kpi}
        loading={isLoading}
        ledgerRows={ledger?.rows as LedgerRowMinimal[] | undefined}
        onEdit={() => openVendorInfo(vendor as any)}
        currentStockValue={null}
        monthlySalesMap={useMemo(() => {
          // 2026-09-10 · #66 · salesRows → ym → total_amount map
          const m = new Map<string, number>();
          for (const r of salesRows) {
            const ym = String(r.snapshot_date ?? r.period_start_date ?? "").slice(0, 7);
            if (!ym) continue;
            m.set(ym, (m.get(ym) ?? 0) + Number(r.total_amount ?? 0));
          }
          return m;
        }, [salesRows])}
        totalSalesValue={useMemo(() => salesRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0), [salesRows])}
        monthlyCogsMap={useMemo(() => {
          // 2026-09-10 · 원가 · salesRows → ym → cogs_amount map
          const m = new Map<string, number>();
          for (const r of salesRows) {
            const ym = String(r.snapshot_date ?? r.period_start_date ?? "").slice(0, 7);
            if (!ym) continue;
            m.set(ym, (m.get(ym) ?? 0) + Number(r.cogs_amount ?? 0));
          }
          return m;
        }, [salesRows])}
        totalCogsValue={useMemo(() => salesRows.reduce((s, r) => s + Number(r.cogs_amount ?? 0), 0), [salesRows])}
        monthlyStockAssetMap={useMemo(() => {
          // 2026-09-10 · #72 · 확정 공식 · 재고자산(월별) = 매입원가(월별) − 판매원가(월별)
          const m = new Map<string, number>();
          for (const r of salesRows) {
            const ym = String(r.snapshot_date ?? r.period_start_date ?? "").slice(0, 7);
            if (!ym) continue;
            const purchaseCost = Number(r.purchase_cost ?? 0) || 0;
            const cogs = Number(r.cogs_amount ?? 0) || 0;
            m.set(ym, (m.get(ym) ?? 0) + (purchaseCost - cogs));
          }
          return m;
        }, [salesRows])}
        totalStockAssetValue={totalStockAsset}
      />

      {/* 2026-08-25 · SplitRightTabs 프리미티브 이관 · v9 브랜드 시그니처 · 폰트 +2 */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        <SplitRightTabs
          tabs={[
            { key: "balance",  label: "결제내역", icon: ReceiptText as any, count: ledger?.rows.filter(r => r.type === "payment").length ?? undefined },
            { key: "order",    label: "발주내역", icon: Package2 as any,    count: orderGroups.length || undefined },
            { key: "purchase", label: "매입내역", icon: Package2 as any,    count: detailRows.length || undefined },
            { key: "sales",    label: "판매내역", icon: TrendingUp as any,  count: salesProducts.length || undefined },
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
              // 2026-09-10 · 사용자 지시 · 순서 · 매입액 · 건수 · 총재고자산 · 결제내역 · 잔고
              const purchaseCount = ledger.rows.filter(r => r.type === "purchase").length;
              const items = [
                {
                  label: "매입액",
                  value: ledger.total_purchase,
                  tone: "emerald" as const,
                  icon: <Package2 size={14} strokeWidth={2.4} />,
                  subtitle: "구입 총액",
                  vatBadge: vatMode != null ? `VAT ${ledger.total_purchase_vat.toLocaleString()}원 · 공급가액 ${ledger.total_purchase_supply.toLocaleString()}원` : null,
                  trend: null as null | { icon: React.ReactNode; text: string; cls: string },
                  isCount: false,
                },
                {
                  label: "건수",
                  value: purchaseCount,
                  tone: "zinc" as const,
                  icon: <Package2 size={14} strokeWidth={2.4} />,
                  subtitle: "매입 건수",
                  vatBadge: null,
                  trend: null,
                  isCount: true,
                },
                {
                  label: "총 재고자산",
                  value: totalStockAsset,
                  tone: "violet" as const,
                  icon: <Package2 size={14} strokeWidth={2.4} />,
                  subtitle: "매입액 − 판매원가",
                  vatBadge: null,
                  trend: null,
                  isCount: false,
                },
                {
                  label: "결제내역",
                  value: ledger.total_payment,
                  tone: "sky" as const,
                  icon: <Wallet size={14} strokeWidth={2.4} />,
                  subtitle: payRatio != null ? `매입 대비 ${payRatio}%` : "지불 총액",
                  vatBadge: vatMode === true && ledger.total_payment_vat > 0 ? `VAT ${ledger.total_payment_vat.toLocaleString()}원 · 공급가액 ${ledger.total_payment_supply.toLocaleString()}원` : null,
                  trend: null,
                  isCount: false,
                },
                {
                  label: ledger.current_balance > 0
                    ? "잔고 (미지급)"
                    : ledger.current_balance < 0
                      ? "잔고 (선지급)"
                      : "잔고 (완납)",
                  value: Math.abs(ledger.current_balance),
                  tone: ledger.current_balance > 0
                    ? "amber" as const
                    : ledger.current_balance < 0
                      ? "sky" as const
                      : "emerald" as const,
                  icon: ledger.current_balance > 0
                    ? <TrendingUp size={14} strokeWidth={2.4} />
                    : ledger.current_balance < 0
                      ? <TrendingDown size={14} strokeWidth={2.4} />
                      : <Minus size={14} strokeWidth={2.4} />,
                  subtitle: ledger.current_balance > 0
                    ? "지불 필요"
                    : ledger.current_balance < 0
                      ? "초과 결제 · 다음 매입 상쇄"
                      : "완납",
                  vatBadge: null,
                  trend: null,
                  isCount: false,
                },
              ];
              return (
                <div className="flex flex-col">
                  {/* VAT 모드 배지 (전체 우상단) */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <span className="text-[14px] font-bold text-zinc-500 uppercase tracking-wider">기간 합계</span>
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
                  {/* 2026-09-10 · 사용자 지시 · UI 대원칙 · Linear/Vercel/Notion 톤
                      · 카드형 → 미니멀 텍스트 · 아이콘·배경 gradient·IconTile 제거
                      · 컬럼 구분 · 얇은 zinc-100 세로선 · 뉴트럴 톤 · 값에만 액센트 */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-0 border-b border-line">
                    {items.map((item, i) => {
                      const valueCls =
                        item.tone === "amber" ? "text-amber-700" :
                        item.tone === "sky" ? "text-sky-700" :
                        item.tone === "emerald" && item.label.startsWith("잔고") ? "text-emerald-600" :
                        "text-zinc-900";
                      return (
                        <div key={i} className={`px-5 py-4 ${i < items.length - 1 ? "lg:border-r border-zinc-100" : ""} flex flex-col gap-2`}>
                          <span className="text-[13px] text-zinc-500 font-medium tracking-tight">{item.label}</span>
                          <span className={`text-[26px] font-bold tabular-nums leading-none tracking-tight ${valueCls}`}>
                            {item.value.toLocaleString()}
                            <span className="text-[14px] font-medium ml-1 text-zinc-400">{item.isCount ? "건" : "원"}</span>
                          </span>
                          <span className="text-[12px] text-zinc-400 font-medium">{item.subtitle}</span>
                          {item.vatBadge && (
                            <span className="text-[12px] text-zinc-500 font-medium tabular-nums leading-tight mt-0.5">
                              {item.vatBadge}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            <LedgerContent ledger={ledger} loading={ledgerLoading} error={ledgerError} />
          </div>
        )}
        {activeTab === "purchase" && (
          <HistoryContent detailRows={detailRows} loading={detailLoading} />
        )}
        {activeTab === "order" && (
          <OrderHistoryContent groups={orderGroups} loading={orderLoading} />
        )}
        {activeTab === "sales" && (
          <SalesContent products={salesProducts} loading={salesLoading} />
        )}
      </div>
    </div>
    </>
  );
};

export default VendorDetailTabs;
