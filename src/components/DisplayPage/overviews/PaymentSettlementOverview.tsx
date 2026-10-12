// src/components/DisplayPage/overviews/PaymentSettlementOverview.tsx
// 2026-10-09 · GLOBAL UI · 결제·정산 Single-Page Operations Console
//   · Payment summary endpoint 재사용 · placeholder 폐기
//   · /api/supplier-balances-map · 전체 공급사 미지급금 (PaymentInputPage 패턴)
//   · PaymentInputPage · supplierPayments business logic 보호 유지

import React, { useEffect, useMemo, useState } from "react";
import { CurrencyKrw, Buildings, Wallet, Shield } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";
import { OperationsDetailModalShell } from "./OperationsDetailModalShell";
import { api } from "../../../lib/apiClient";

export interface PaymentSettlementOverviewProps { onSelectSubTab: (sub: any) => void; }

type BalanceEntry = { balance?: number; purchase?: number; payment?: number; [k: string]: any };
type BalancesMap = Record<string, BalanceEntry>;

export const PaymentSettlementOverview: React.FC<PaymentSettlementOverviewProps> = () => {
  const [balances, setBalances] = useState<BalancesMap | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<{ supplier: string; entry: BalanceEntry } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get<{ values?: BalancesMap } | BalancesMap>(`/api/supplier-balances-map`)
      .then(({ data }) => {
        if (!alive) return;
        const map = (data as any)?.values ?? (data as BalancesMap) ?? {};
        setBalances(map);
      })
      .catch(() => { if (alive) setBalances({}); });
    return () => { alive = false; };
  }, [refreshKey]);

  const entries = useMemo(() => {
    if (!balances) return [];
    return Object.entries(balances)
      .map(([supplier, entry]) => ({ supplier, ...entry }))
      .filter(e => Number(e.balance ?? 0) !== 0 || Number(e.purchase ?? 0) !== 0);
  }, [balances]);

  const totals = useMemo(() => {
    const sum = (k: "balance" | "purchase" | "payment") =>
      entries.reduce((s, e) => s + Number((e as any)[k] ?? 0), 0);
    return {
      balance: sum("balance"),
      purchase: sum("purchase"),
      payment: sum("payment"),
      supplierCount: entries.length,
    };
  }, [entries]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = q ? entries.filter(e => e.supplier.toLowerCase().includes(q)) : entries;
    return [...base].sort((a, b) => Math.abs(Number(b.balance ?? 0)) - Math.abs(Number(a.balance ?? 0))).slice(0, 50);
  }, [entries, q]);

  const kpiValue = (n: number | null | undefined) => n == null ? "-" : n.toLocaleString();

  const columns: OverviewTableColumn[] = [
    { key: "supplier", label: "공급사" },
    { key: "purchase", label: "매입 누적", align: "right" },
    { key: "payment", label: "지급 누적", align: "right" },
    { key: "balance", label: "미지급 (잔액)", align: "right" },
  ];
  const rows = filtered.map(e => {
    const balance = Number(e.balance ?? 0);
    return {
      supplier: e.supplier,
      purchase: Number(e.purchase ?? 0).toLocaleString(),
      payment: Number(e.payment ?? 0).toLocaleString(),
      balance: (
        <span className={balance > 0 ? "text-rose-600 font-semibold" : balance < 0 ? "text-emerald-600 font-semibold" : "text-ink-soft"}>
          {balance.toLocaleString()}
        </span>
      ),
      __onClick: () => setDetail({ supplier: e.supplier, entry: e }),
    };
  });

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader
        title="결제·정산"
        description="공급사별 미지급금/매입/지급 누적을 한 페이지에서 확인하고 결제를 처리합니다"
      />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="공급사 검색"
        right={
          <button type="button" onClick={() => setRefreshKey(k => k + 1)}
            className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white hover:bg-slate-50 cursor-pointer transition-colors">새로고침</button>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<Buildings size={18} weight="fill" />} label="거래 공급사" value={kpiValue(totals.supplierCount)} unit="곳" tone="brand" hint="거래 발생" />
        <OverviewKpi icon={<CurrencyKrw size={18} weight="fill" />} label="누적 매입액" value={kpiValue(totals.purchase)} unit="원" tone="violet" hint="전체 공급사" />
        <OverviewKpi icon={<Wallet size={18} weight="fill" />} label="누적 지급액" value={kpiValue(totals.payment)} unit="원" tone="emerald" hint="전체 공급사" />
        <OverviewKpi icon={<Shield size={18} weight="fill" />} label="미지급 잔액" value={kpiValue(totals.balance)} unit="원" tone={totals.balance > 0 ? "rose" : "neutral"} hint="매입-지급" />
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection
          title={<span>공급사별 결제·정산 현황 <span className="ml-2 text-[13px] font-medium text-ink-soft">잔액 상위 {filtered.length}곳</span></span>}
          action={<span className="text-[12px] font-medium text-ink-soft">row 클릭 · 상세</span>}
        >
          <OverviewTable columns={columns} rows={rows} emptyMessage={balances == null ? "불러오는 중..." : "공급사 결제 데이터가 없습니다"} />
        </OverviewSection>
      </div>

      <OperationsDetailModalShell
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.supplier} · 결제·정산 상세` : "결제·정산 상세"}
        icon={<Wallet size={18} />}
        size="md"
        summary={detail && (
          <section className="grid grid-cols-3 gap-x-6 gap-y-3 text-[14px]">
            <div>
              <div className="text-[12px] text-ink-soft">매입 누적</div>
              <div className="font-semibold text-ink tabular-nums mt-0.5">{Number(detail.entry.purchase ?? 0).toLocaleString()}원</div>
            </div>
            <div>
              <div className="text-[12px] text-ink-soft">지급 누적</div>
              <div className="font-semibold text-ink tabular-nums mt-0.5">{Number(detail.entry.payment ?? 0).toLocaleString()}원</div>
            </div>
            <div>
              <div className="text-[12px] text-ink-soft">미지급 잔액</div>
              <div className={`font-semibold tabular-nums mt-0.5 ${Number(detail.entry.balance ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {Number(detail.entry.balance ?? 0).toLocaleString()}원
              </div>
            </div>
          </section>
        )}
      >
        <div className="text-[13px] text-ink-soft">
          <Shield size={14} className="inline mr-1" />
          공급사별 결제 상세 거래/월별 ledger는 /api/supplier-ledger 재사용 통합 예정. 결제 입력/승인/수정 action은 PaymentInputPage flow 보호 유지하며 Modal로 이관.
        </div>
      </OperationsDetailModalShell>
    </div>
  );
};

export default PaymentSettlementOverview;
