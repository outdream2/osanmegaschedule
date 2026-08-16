// src/components/StockManagePage/LossHistoryTab.tsx
// 2026-08-06 · T-LOSS-HISTORY · 손실추적 이력 탭
// 2026-08-17 · apiClient 마이그레이션
//   · 기간 선택 (오늘 · 1주 · 1개월 · 3개월)
//   · 공급사 필터
//   · 일자별 손실액 라인차트 (recharts)
//   · 공급사별 Top10 리스트
//   · 총 손실액 KPI

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Calendar, Loader2, TrendingDown, Package, Building2, Camera } from "lucide-react";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import { LoadingState } from "../common/LoadingState";
import { KpiCard } from "../common/KpiCard";
import { displayVendorName } from "../../utils/vendorNameNormalize";

type PeriodKey = "today" | "week" | "month" | "3months";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "오늘",
  week: "1주",
  month: "1개월",
  "3months": "3개월",
};

const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 0,
  week: 6,
  month: 29,
  "3months": 89,
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

function fmtWon(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0원";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억원`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(1)}만원`;
  return `${sign}${Math.round(abs).toLocaleString()}원`;
}

interface SummaryRow {
  key: string;
  label: string;
  loss: number;
  loss_value: number;
  count: number;
  extra?: { product_code?: string };
}

interface SummaryResponse {
  from: string;
  to: string;
  groupBy: "date" | "supplier" | "product";
  supplier: string | null;
  rows: SummaryRow[];
  total: { loss: number; loss_value: number; count: number };
}

export const LossHistoryTab: React.FC = () => {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [dateSummary, setDateSummary] = useState<SummaryResponse | null>(null);
  const [supplierSummary, setSupplierSummary] = useState<SummaryResponse | null>(null);
  const [productSummary, setProductSummary] = useState<SummaryResponse | null>(null);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  const from = useMemo(() => daysAgoYmd(PERIOD_DAYS[period]), [period]);
  const to = useMemo(() => todayYmd(), []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const supplierParam = supplierFilter ? `&supplier=${encodeURIComponent(supplierFilter)}` : "";
      const [d, s, p] = await Promise.all([
        api.get<SummaryResponse>(`/api/loss-tracking/summary?from=${from}&to=${to}&groupBy=date${supplierParam}`).then(r => r.data).catch(() => null),
        api.get<SummaryResponse>(`/api/loss-tracking/summary?from=${from}&to=${to}&groupBy=supplier${supplierParam}`).then(r => r.data).catch(() => null),
        api.get<SummaryResponse>(`/api/loss-tracking/summary?from=${from}&to=${to}&groupBy=product${supplierParam}`).then(r => r.data).catch(() => null),
      ]);
      setDateSummary(d);
      setSupplierSummary(s);
      setProductSummary(p);
    } finally {
      setLoading(false);
    }
  }, [from, to, supplierFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // 수동 스냅샷 (테스트/보정용)
  const runSnapshot = useCallback(async () => {
    setSnapshotting(true);
    setSnapshotMsg(null);
    try {
      const { data: j } = await api.post<any>("/api/loss-tracking/snapshot");
      if (j.error === "TABLE_MISSING") {
        setSnapshotMsg("테이블 미생성 · migrations/loss_tracking_daily.sql 실행 필요");
      } else if (j.ok) {
        setSnapshotMsg(`저장 완료 · ${j.saved}건`);
        await fetchAll();
      } else {
        setSnapshotMsg(j.error ?? "스냅샷 실패");
      }
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "스냅샷 실패");
      setSnapshotMsg(msg);
    } finally {
      setSnapshotting(false);
      setTimeout(() => setSnapshotMsg(null), 4000);
    }
  }, [fetchAll]);

  const total = dateSummary?.total ?? { loss: 0, loss_value: 0, count: 0 };
  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    (supplierSummary?.rows ?? []).forEach(r => { if (r.key) set.add(r.key); });
    return Array.from(set).sort();
  }, [supplierSummary]);

  const chartData = useMemo(() => {
    const rows = dateSummary?.rows ?? [];
    return rows.map(r => ({
      date: r.key.slice(5), // MM-DD
      loss: r.loss,
      loss_value: r.loss_value,
    }));
  }, [dateSummary]);

  const supplierTop10 = useMemo(() => (supplierSummary?.rows ?? []).slice(0, 10), [supplierSummary]);
  const productTop10  = useMemo(() => (productSummary?.rows  ?? []).slice(0, 10), [productSummary]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── 필터바 ── */}
      <div className={`${CARD_BASE} px-3 py-2 flex flex-wrap items-center gap-2`}>
        <div className="flex items-center gap-2">
          <Calendar size={13} className="text-zinc-400" />
          <div className="flex gap-1">
            {(Object.keys(PERIOD_LABEL) as PeriodKey[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md border transition cursor-pointer ${
                  period === k
                    ? "bg-violet-500 text-white border-violet-500"
                    : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {PERIOD_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Building2 size={13} className="text-zinc-400" />
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="text-[11px] font-semibold border border-zinc-200 rounded-md px-2 py-1 bg-white cursor-pointer max-w-[140px]"
          >
            <option value="">전체 공급사</option>
            {supplierOptions.map(s => (
              <option key={s} value={s}>{displayVendorName(s)}</option>
            ))}
          </select>
        </div>
        <div className={`${TEXT.caption} text-zinc-400 hidden sm:block ml-auto`}>
          {from} ~ {to}
        </div>
        <button
          type="button"
          onClick={runSnapshot}
          disabled={snapshotting}
          title="지금 손실 스냅샷 저장 (실재고 저장 시 자동으로도 저장됨)"
          className="ml-auto sm:ml-0 flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition disabled:opacity-40 cursor-pointer"
        >
          {snapshotting ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
          스냅샷
        </button>
        <button
          type="button"
          onClick={fetchAll}
          disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 transition disabled:opacity-40 cursor-pointer"
          title="새로고침"
        >
          <Loader2 size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {snapshotMsg && (
        <div className="text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-3 py-1.5">
          {snapshotMsg}
        </div>
      )}

      {loading && !dateSummary ? (
        <LoadingState tone="slate" size="compact" label="이력 로딩 중..." />
      ) : (dateSummary?.rows.length ?? 0) === 0 ? (
        <div className={`${CARD_BASE} py-6`}>
          <EmptyState
            icon={TrendingDown}
            title="이 기간 손실 이력 없음"
            hint={`${from} ~ ${to} · 스냅샷을 눌러 오늘 손실을 저장하거나 · 실재고를 저장하세요 (자동 저장됨)`}
            size="compact"
          />
        </div>
      ) : (
        <>
          {/* ── KPI 카드 3개 ── */}
          <div className="grid grid-cols-3 gap-2">
            <KpiCard
              icon={TrendingDown}
              label="총 손실액"
              value={<span className="text-rose-700">{fmtWon(total.loss_value)}</span>}
              subtitle={`${fmt(total.loss)}개 · ${total.count}건`}
              color="rose"
            />
            <KpiCard
              icon={Building2}
              label="공급사 수"
              value={supplierTop10.length}
              subtitle="집계 대상"
              color="violet"
            />
            <KpiCard
              icon={Package}
              label="상품 수"
              value={productTop10.length > 0 ? (productSummary?.rows.length ?? 0) : 0}
              subtitle="이력 있는"
              color="sky"
            />
          </div>

          {/* ── 일자별 손실액 라인 차트 ── */}
          <div className={`${CARD_BASE} px-3 py-3`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`${TEXT.caption} text-zinc-600`}>일자별 손실액 추이</span>
              <span className={`${TEXT.caption} text-zinc-400`}>{chartData.length}일</span>
            </div>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis
                    tickFormatter={(v) => fmtWon(Number(v))}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    width={70}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === "loss_value") return [fmtWon(Number(value)), "손실액"];
                      return [fmt(Number(value)), name];
                    }}
                    labelFormatter={(l) => `${l}`}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="loss_value"
                    stroke="#e11d48"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#e11d48" }}
                    activeDot={{ r: 5 }}
                    name="loss_value"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Top10 두 개 (공급사 · 상품) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <div className={`${CARD_BASE} px-3 py-2`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`${TEXT.caption} text-zinc-600 flex items-center gap-1`}>
                  <Building2 size={11} className="text-violet-500" />
                  공급사별 Top10 손실액
                </span>
                <span className={`${TEXT.caption} text-zinc-400`}>{supplierTop10.length}건</span>
              </div>
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-zinc-50">
                  {supplierTop10.map((r, i) => (
                    <tr key={`sup-${r.key}`} className="hover:bg-zinc-50/60">
                      <td className="py-1.5 pr-1 text-zinc-400 font-semibold tabular-nums w-6 text-right">{i + 1}</td>
                      <td className="py-1.5 pl-1 text-zinc-700 font-semibold truncate max-w-[140px]" title={r.label}>
                        {displayVendorName(r.label)}
                      </td>
                      <td className="py-1.5 text-right text-rose-700 font-bold tabular-nums">{fmtWon(r.loss_value)}</td>
                      <td className="py-1.5 pl-2 text-right text-zinc-400 tabular-nums text-[10px] w-14">{fmt(r.count)}건</td>
                    </tr>
                  ))}
                  {supplierTop10.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-zinc-400 py-4">데이터 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={`${CARD_BASE} px-3 py-2`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`${TEXT.caption} text-zinc-600 flex items-center gap-1`}>
                  <Package size={11} className="text-sky-500" />
                  상품별 Top10 손실액
                </span>
                <span className={`${TEXT.caption} text-zinc-400`}>{productTop10.length}건</span>
              </div>
              <table className="w-full text-[11px]">
                <tbody className="divide-y divide-zinc-50">
                  {productTop10.map((r, i) => (
                    <tr key={`prod-${r.key}`} className="hover:bg-zinc-50/60">
                      <td className="py-1.5 pr-1 text-zinc-400 font-semibold tabular-nums w-6 text-right">{i + 1}</td>
                      <td className="py-1.5 pl-1 text-zinc-700 font-semibold truncate max-w-[140px]" title={r.label}>
                        {r.label}
                      </td>
                      <td className="py-1.5 text-right text-rose-700 font-bold tabular-nums">{fmtWon(r.loss_value)}</td>
                      <td className="py-1.5 pl-2 text-right text-zinc-400 tabular-nums text-[10px] w-14">{fmt(r.count)}건</td>
                    </tr>
                  ))}
                  {productTop10.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-zinc-400 py-4">데이터 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LossHistoryTab;
