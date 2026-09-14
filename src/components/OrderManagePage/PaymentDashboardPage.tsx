// src/components/OrderManagePage/PaymentDashboardPage.tsx
// 2026-09-14 · #118 · 결제 대시보드 페이지 신규
//   · 결제 메뉴 첫 진입 · 종합 KPI · 미지급 공급사 · 이번달 결제 예정
//   · GET /api/supplier-balances-map · SSOT (매입/결제/잔고/cogs/stock_asset)
//   · 상세 · 각 공급사 클릭 → 결제입력 페이지 (기존 flow)
// 2026-09-14 · #140 · 기간 필터 (PeriodSelector) · #141 · 차용 이력 섹션 (있을 때만)

import React, { useEffect, useMemo, useState } from "react";
import { Wallet, TrendingUp, TrendingDown, CircleCheck, Package, RefreshCw, Building2, ArrowRight, FileText } from "lucide-react";
import { api } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { PeriodSelector, PERIOD_UNIFIED_DAYS_PRESET } from "../common/PeriodSelector";
import { useToast, toastClass } from "../../hooks/useToast";
import { listBorrowings, type BorrowingRow } from "../../lib/borrowingsApi";

interface SupplierValues {
  purchase: number;
  payment: number;
  balance: number;
  cogs: number;
  stock_asset: number;
}

interface Row {
  supplier: string;
  purchase: number;
  payment: number;
  balance: number;
  cogs: number;
  stock_asset: number;
}

const fmt = (n: number): string => Number(n ?? 0).toLocaleString();

export const PaymentDashboardPage: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast, showError } = useToast();
  // 2026-09-14 · #140 · 기간 필터 · 0 = 전체 · N = 최근 N일
  const [periodDays, setPeriodDays] = useState<number>(0);
  // 2026-09-14 · #141 · 차용 이력 · 있을 때만 표시
  const [borrowings, setBorrowings] = useState<BorrowingRow[]>([]);

  const dateRange = useMemo(() => {
    if (!periodDays || periodDays <= 0) return { start: "", end: "" };
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const startD = new Date(now.getTime() - (periodDays - 1) * 86400000);
    const start = startD.toISOString().slice(0, 10);
    return { start, end };
  }, [periodDays]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (dateRange.start && dateRange.end) {
        qs.set("start", dateRange.start);
        qs.set("end", dateRange.end);
      }
      const { data } = await api.get<{ values?: Record<string, SupplierValues> }>(
        `/api/supplier-balances-map${qs.toString() ? `?${qs.toString()}` : ""}`
      );
      const values = data?.values ?? {};
      const list: Row[] = Object.entries(values).map(([supplier, v]) => ({
        supplier,
        purchase: Number(v.purchase ?? 0),
        payment: Number(v.payment ?? 0),
        balance: Number(v.balance ?? 0),
        cogs: Number(v.cogs ?? 0),
        stock_asset: Number(v.stock_asset ?? 0),
      }));
      setRows(list);
      // 2026-09-14 · #141 · 차용 이력 · 오픈 상태 우선 · 기간 필터 반영 (있을 때)
      try {
        const brs = await listBorrowings({ days: periodDays > 0 ? periodDays : undefined, limit: 20 });
        setBorrowings(brs);
      } catch { setBorrowings([]); }
    } catch (e) {
      showError(`대시보드 로드 실패: ${getErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, [showError, dateRange, periodDays]);

  useEffect(() => { void load(); }, [load]);

  const kpi = useMemo(() => {
    const totalPurchase = rows.reduce((s, r) => s + r.purchase, 0);
    const totalPayment = rows.reduce((s, r) => s + r.payment, 0);
    const totalBalance = totalPurchase - totalPayment;
    const totalStockAsset = rows.reduce((s, r) => s + r.stock_asset, 0);
    const unpaidCount = rows.filter(r => r.balance > 0).length;
    const prepaidCount = rows.filter(r => r.balance < 0).length;
    const settledCount = rows.filter(r => r.balance === 0 && (r.purchase > 0 || r.payment > 0)).length;
    return { totalPurchase, totalPayment, totalBalance, totalStockAsset, unpaidCount, prepaidCount, settledCount };
  }, [rows]);

  const unpaidTop = useMemo(() =>
    [...rows].filter(r => r.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10),
  [rows]);

  const prepaidTop = useMemo(() =>
    [...rows].filter(r => r.balance < 0).sort((a, b) => a.balance - b.balance).slice(0, 10),
  [rows]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 헤더 · 2026-09-14 · #140 · 기간 필터 · PeriodSelector 통합 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wallet size={20} className="text-brand-deep" />
          <span className="text-[20px] font-bold text-zinc-900 tracking-tight">결제 대시보드</span>
          <span className="text-[13px] tabular-nums text-zinc-400 font-medium">공급사 {rows.length}개</span>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector<number>
            options={[{ value: 0, label: "전체", title: "전체 기간" }, ...PERIOD_UNIFIED_DAYS_PRESET]}
            value={periodDays}
            onChange={(v) => setPeriodDays(v)}
            accent="indigo"
          />
          <button
            onClick={() => void load()}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {periodDays > 0 && (
        <div className="text-[11.5px] text-ink-soft tabular-nums bg-brand-tint/30 border border-brand-tint/50 rounded-md px-2 py-1 self-start">
          기간 필터 · {dateRange.start} ~ {dateRange.end}
        </div>
      )}

      {/* KPI 카드 · 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card padding="md" rounded="xl" className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 uppercase tracking-wider">
            <TrendingUp size={13} className="text-brand-deep" />
            총 매입 (전체)
          </div>
          <div className="text-[22px] font-extrabold tabular-nums text-brand-deep leading-none mt-1">
            {fmt(kpi.totalPurchase)}<span className="text-[14px] font-semibold text-ink-soft ml-1">원</span>
          </div>
        </Card>
        <Card padding="md" rounded="xl" className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 uppercase tracking-wider">
            <TrendingDown size={13} className="text-emerald-600" />
            총 결제 (전체)
          </div>
          <div className="text-[22px] font-extrabold tabular-nums text-emerald-700 leading-none mt-1">
            {fmt(kpi.totalPayment)}<span className="text-[14px] font-semibold text-ink-soft ml-1">원</span>
          </div>
        </Card>
        <Card padding="md" rounded="xl" className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 uppercase tracking-wider">
            <Wallet size={13} className={kpi.totalBalance > 0 ? "text-sky-600" : kpi.totalBalance < 0 ? "text-rose-600" : "text-emerald-600"} />
            총 잔고 · {kpi.totalBalance > 0 ? "미지급" : kpi.totalBalance < 0 ? "선지급" : "완납"}
          </div>
          <div className={`text-[22px] font-extrabold tabular-nums leading-none mt-1 ${
            kpi.totalBalance > 0 ? "text-sky-700" : kpi.totalBalance < 0 ? "text-rose-700" : "text-emerald-700"
          }`}>
            {fmt(kpi.totalBalance)}<span className="text-[14px] font-semibold text-ink-soft ml-1">원</span>
          </div>
        </Card>
        <Card padding="md" rounded="xl" className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-500 uppercase tracking-wider">
            <Package size={13} className="text-amber-600" />
            총 재고자산
          </div>
          <div className="text-[22px] font-extrabold tabular-nums text-amber-700 leading-none mt-1">
            {fmt(kpi.totalStockAsset)}<span className="text-[14px] font-semibold text-ink-soft ml-1">원</span>
          </div>
        </Card>
      </div>

      {/* 상태 카운트 */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill tone="sky" size="md">미지급 {kpi.unpaidCount}개사</StatusPill>
        <StatusPill tone="rose" size="md">선지급 {kpi.prepaidCount}개사</StatusPill>
        <StatusPill tone="emerald" size="md" dot>완납 {kpi.settledCount}개사</StatusPill>
      </div>

      {/* 미지급·선지급 리스트 · 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 미지급 Top 10 */}
        <Card padding="md" rounded="xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-sky-600" />
              <span className="text-[16px] font-bold text-zinc-900">미지급 공급사 Top 10</span>
              <span className="text-[12px] tabular-nums text-zinc-400 font-medium">잔고 &gt; 0</span>
            </div>
          </div>
          {loading && unpaidTop.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Spinner tone="zinc" label="로딩..." labelSize={12} />
            </div>
          ) : unpaidTop.length === 0 ? (
            <EmptyState icon={CircleCheck} title="미지급 공급사 없음" size="compact" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {unpaidTop.map((r, idx) => (
                <div
                  key={r.supplier}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sky-100 bg-sky-50/40 hover:bg-sky-50 transition-colors"
                >
                  <span className="text-[12px] font-bold text-sky-600 w-5 shrink-0 tabular-nums">{idx + 1}</span>
                  <Building2 size={13} className="text-sky-500 shrink-0" />
                  <span className="text-[14px] font-bold text-zinc-900 min-w-0 flex-1 truncate">{r.supplier}</span>
                  <span className="text-[14px] font-bold text-sky-700 tabular-nums shrink-0">{fmt(r.balance)}원</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 선지급 Top 10 */}
        <Card padding="md" rounded="xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingDown size={16} className="text-rose-600" />
              <span className="text-[16px] font-bold text-zinc-900">선지급 공급사 Top 10</span>
              <span className="text-[12px] tabular-nums text-zinc-400 font-medium">잔고 &lt; 0</span>
            </div>
          </div>
          {loading && prepaidTop.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Spinner tone="zinc" label="로딩..." labelSize={12} />
            </div>
          ) : prepaidTop.length === 0 ? (
            <EmptyState icon={CircleCheck} title="선지급 공급사 없음" size="compact" />
          ) : (
            <div className="flex flex-col gap-1.5">
              {prepaidTop.map((r, idx) => (
                <div
                  key={r.supplier}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-100 bg-rose-50/40 hover:bg-rose-50 transition-colors"
                >
                  <span className="text-[12px] font-bold text-rose-600 w-5 shrink-0 tabular-nums">{idx + 1}</span>
                  <Building2 size={13} className="text-rose-500 shrink-0" />
                  <span className="text-[14px] font-bold text-zinc-900 min-w-0 flex-1 truncate">{r.supplier}</span>
                  <span className="text-[14px] font-bold text-rose-700 tabular-nums shrink-0">{fmt(r.balance)}원</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 2026-09-14 · #141 · 차용 이력 · 있을 때만 표시 */}
      {borrowings.length > 0 && (
        <Card padding="md" rounded="xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-violet-600" />
              <span className="text-[16px] font-bold text-zinc-900">차용 이력</span>
              <span className="text-[12px] tabular-nums text-zinc-400 font-medium">{borrowings.length}건</span>
              {periodDays > 0 && (
                <StatusPill tone="zinc" size="xs">최근 {periodDays}일</StatusPill>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {borrowings.slice(0, 10).map(b => {
              const isLend = b.direction === "lend";
              const isOpen = b.status === "open";
              const amount = (b.qty ?? 0) * (b.unit_price ?? 0);
              return (
                <div
                  key={b.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    isOpen
                      ? isLend
                        ? "border-sky-100 bg-sky-50/40 hover:bg-sky-50"
                        : "border-amber-100 bg-amber-50/40 hover:bg-amber-50"
                      : "border-zinc-100 bg-white hover:bg-zinc-50"
                  }`}
                >
                  <StatusPill tone={isLend ? "sky" : "amber"} size="xs">
                    {isLend ? "대여" : "차용"}
                  </StatusPill>
                  <span className="text-[14px] font-bold text-zinc-900 min-w-0 truncate flex-1">
                    {b.product_name ?? b.product_code ?? "(상품 미지정)"}
                  </span>
                  <span className="text-[12px] text-zinc-500 tabular-nums">
                    {b.supplier ?? "-"}
                  </span>
                  <span className="text-[12px] text-zinc-500 tabular-nums">
                    수량 {b.qty}
                  </span>
                  {amount > 0 && (
                    <span className="text-[13px] font-bold text-zinc-800 tabular-nums shrink-0">
                      {fmt(amount)}원
                    </span>
                  )}
                  <StatusPill
                    tone={b.status === "open" ? "rose" : b.status === "settled" ? "emerald" : "zinc"}
                    size="xs"
                    dot={b.status === "open"}
                  >
                    {b.status === "open" ? "미결" : b.status === "settled" ? "완료" : "취소"}
                  </StatusPill>
                  {b.due_date && (
                    <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                      ~ {String(b.due_date).slice(5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 안내 · 다음 액션 */}
      <Card padding="md" rounded="xl" variant="flat" bg="bg-brand-tint/20" borderColor="border-brand-tint/40">
        <div className="flex items-center gap-2 text-[13px] text-brand-deep">
          <ArrowRight size={14} />
          <span className="font-semibold">개별 공급사 결제 등록 · <span className="underline">결제입력</span> 탭에서 · 공급사 검색 후 진행</span>
        </div>
      </Card>

      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </div>
  );
};

export default PaymentDashboardPage;
