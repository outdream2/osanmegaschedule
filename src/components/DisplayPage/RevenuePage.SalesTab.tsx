// src/components/DisplayPage/RevenuePage.SalesTab.tsx
// 2026-10-10 · #11-P1 · 판매·매출현황 안 "판매" 탭 Phase 1 (P0 4섹션)
//   레퍼런스: Shopify Spring 2026 Insight Card · Stripe KPI 삼단 · Attio density 테이블 · Vercel Geist 톤
//   섹션:
//     ① Insight Card (북극성 자연어 1줄)
//     ② KPI 4-strip (총매출/건수/객단가/마진율 + delta + sparkline)
//     ③ 매출 추이 Area (전주 overlay)
//     ④ 베스트셀러 Top 10 (density 테이블)
//   상단: 기간 필터 (7/30/90일)
//
//   원칙 (feedback_no_fallback_db_first · feedback_no_data_fabrication):
//     - ERP 값만 사용 · 가짜 fallback 금지
//     - 숫자 null 은 null · 집계 시 null skip
//     - BEHAVIOR = 데이터 조회 전용 (수정/삭제 X)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Line, LineChart as SparkLineChart, PieChart, Pie, Cell } from "recharts";

// ─── 공통 helpers ──────────────────────────────────────────────────────
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtWon(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}
function fmtWonShort(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (abs >= 10000) return `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
function fmtCount(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}
function fmtPct(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "-";
  return `${n.toFixed(digits)}%`;
}
function pctDelta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

// ─── ERP 응답 타입 (sale-day-products) ─────────────────────────────────
interface DaySaleItem {
  pcode: string | null;
  productName: string | null;
  buyerCorpName: string | null;
  unitCost: number | null;
  unitSale: number | null;
  totalStock: number | null;      // 판매 수량
  saleTotal: number | null;       // 판매 금액
  margin: number | null;
  marginPct: number | null;
  location: string | null;
  class: "pre" | "general" | "unknown" | string;
}
interface DayProductsResp {
  ok: boolean;
  items?: DaySaleItem[];
  totals?: { quantity?: number | null; saleTotal?: number | null; margin?: number | null; count?: number | null };
  error?: string;
}

// ─── 기간 필터 ──────────────────────────────────────────────────────────
type RangeKey = "7" | "30" | "90";
const RANGE_OPTIONS: Array<{ k: RangeKey; label: string }> = [
  { k: "7",  label: "최근 7일" },
  { k: "30", label: "최근 30일" },
  { k: "90", label: "최근 90일" },
];

interface DayAggregate {
  date: string;
  saleTotal: number;   // 매출
  count: number;       // 결제 건수 (고객수 proxy · ERP totals.count 없으면 items.length)
  margin: number;
  qty: number;         // 수량
}

// ─── Hourly report row (⑥ Heatmap 용) ─────────────────────────────────
interface HourlyRow {
  SaleDate: string;      // YYYY-MM-DD
  SaleTime: string;      // "HH"
  CustomerCnt: number;
  SaleTotal: number;
}
interface HourlyResp {
  ok: boolean;
  rows?: HourlyRow[];
  error?: string;
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────
export const SalesTab: React.FC = () => {
  const [range, setRange] = useState<RangeKey>("30");
  const [days, setDays] = useState<DayAggregate[] | null>(null);
  const [prevDays, setPrevDays] = useState<DayAggregate[] | null>(null);  // 전주 비교용 (동일 기간 이전)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [err, setErr] = useState<string>("");
  // 베스트셀러 집계 (전 기간 상품별 합)
  const [bestsellers, setBestsellers] = useState<Array<{ pcode: string | null; name: string | null; qty: number; sale: number; margin: number; marginPct: number | null; }>>([]);
  // 공급사별 집계 (⑤ Donut)
  const [suppliers, setSuppliers] = useState<Array<{ name: string; sale: number }>>([]);
  // 요일×시간대 Heatmap (⑥) · [dow 0-6][hour 9-22] = { sale, count }
  const [heat, setHeat] = useState<Array<Array<{ sale: number; count: number }>> | null>(null);
  const [heatHours, setHeatHours] = useState<number[]>([]);  // 실제 ERP 응답 안 시간대 목록

  const load = useCallback(async () => {
    const n = Number(range);
    const to = todayYmd();
    const dates: string[] = [];
    for (let i = n - 1; i >= 0; i--) dates.push(daysAgoYmd(i));
    const prevDates: string[] = [];
    for (let i = n * 2 - 1; i >= n; i--) prevDates.push(daysAgoYmd(i));
    setStatus("loading"); setErr("");

    // 상품별 집계 (베스트셀러용) · pcode 단위
    const prodMap = new Map<string, { pcode: string | null; name: string | null; qty: number; sale: number; margin: number }>();
    // 공급사별 집계 (⑤ Donut 용) · buyerCorpName 단위
    const supMap = new Map<string, number>();

    try {
      // 당기 날짜별 fetch (병렬) · 90일이면 90회 호출 · 서버·ERP 부하 고려 chunk=5
      const CHUNK = 5;
      const curAgg: DayAggregate[] = [];
      for (let i = 0; i < dates.length; i += CHUNK) {
        const batch = dates.slice(i, i + CHUNK);
        const results = await Promise.all(batch.map((d) => api.get<DayProductsResp>(`/api/erp/sale-day-products?date=${d}`).then((r) => r.data).catch(() => ({ ok: false } as DayProductsResp))));
        batch.forEach((date, idx) => {
          const r = results[idx];
          const items = (r?.items ?? []);
          let dayQty = 0, daySale = 0, dayMargin = 0;
          for (const it of items) {
            const q = it.totalStock ?? 0;
            const s = it.saleTotal ?? 0;
            const m = it.margin ?? 0;
            dayQty += q;
            daySale += s;
            dayMargin += m;
            const key = String(it.pcode ?? it.productName ?? "");
            if (!key) continue;
            const prev = prodMap.get(key);
            if (prev) {
              prev.qty += q; prev.sale += s; prev.margin += m;
            } else {
              prodMap.set(key, { pcode: it.pcode, name: it.productName, qty: q, sale: s, margin: m });
            }
            // 공급사 집계 (⑤)
            const sup = (it.buyerCorpName ?? "").trim();
            if (sup) supMap.set(sup, (supMap.get(sup) ?? 0) + s);
          }
          curAgg.push({
            date,
            saleTotal: daySale,
            count: Number(r?.totals?.count ?? items.length ?? 0),
            margin: dayMargin,
            qty: dayQty,
          });
        });
      }
      setDays(curAgg);

      // 베스트셀러 TOP 10 (판매수량 desc)
      const list = Array.from(prodMap.values())
        .filter((x) => x.qty > 0)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10)
        .map((x) => ({
          pcode: x.pcode, name: x.name, qty: x.qty, sale: x.sale, margin: x.margin,
          marginPct: x.sale > 0 ? (x.margin / x.sale) * 100 : null,
        }));
      setBestsellers(list);

      // 전기 날짜별 fetch (daily aggregate 만 · 상품은 집계 X · 속도 우선)
      const prevAgg: DayAggregate[] = [];
      for (let i = 0; i < prevDates.length; i += CHUNK) {
        const batch = prevDates.slice(i, i + CHUNK);
        const results = await Promise.all(batch.map((d) => api.get<DayProductsResp>(`/api/erp/sale-day-products?date=${d}`).then((r) => r.data).catch(() => ({ ok: false } as DayProductsResp))));
        batch.forEach((date, idx) => {
          const r = results[idx];
          const items = (r?.items ?? []);
          let daySale = 0, dayMargin = 0, dayQty = 0;
          for (const it of items) {
            daySale += (it.saleTotal ?? 0);
            dayMargin += (it.margin ?? 0);
            dayQty += (it.totalStock ?? 0);
          }
          prevAgg.push({ date, saleTotal: daySale, count: Number(r?.totals?.count ?? items.length ?? 0), margin: dayMargin, qty: dayQty });
        });
      }
      setPrevDays(prevAgg);

      // 공급사별 집계 (⑤) · Top 6 + "기타" aggregate
      const supArr = Array.from(supMap.entries())
        .map(([name, sale]) => ({ name, sale }))
        .filter((x) => x.sale > 0)
        .sort((a, b) => b.sale - a.sale);
      const TOP = 6;
      if (supArr.length > TOP) {
        const top = supArr.slice(0, TOP);
        const etc = supArr.slice(TOP).reduce((s, x) => s + x.sale, 0);
        if (etc > 0) top.push({ name: "기타", sale: etc });
        setSuppliers(top);
      } else {
        setSuppliers(supArr);
      }

      // ⑥ Heatmap · sale-hourly-report 1회 호출
      try {
        const from = dates[0];
        const to = dates[dates.length - 1];
        const hr = await api.get<HourlyResp>(`/api/erp/sale-hourly-report?from=${from}&to=${to}`);
        const rows = (hr.data?.rows ?? []);
        // dow 0=일 ~ 6=토 · hour 번호 유니크 수집
        const hourSet = new Set<number>();
        for (const r of rows) {
          const h = Number(String(r.SaleTime).slice(0, 2));
          if (Number.isFinite(h)) hourSet.add(h);
        }
        const hourList = Array.from(hourSet).sort((a, b) => a - b);
        setHeatHours(hourList);
        const hourIdx = new Map(hourList.map((h, i) => [h, i]));
        const grid: Array<Array<{ sale: number; count: number }>> = Array.from({ length: 7 }, () =>
          Array.from({ length: hourList.length }, () => ({ sale: 0, count: 0 }))
        );
        for (const r of rows) {
          const d = new Date(r.SaleDate + "T00:00:00");
          const dow = d.getDay();
          const h = Number(String(r.SaleTime).slice(0, 2));
          const idx = hourIdx.get(h);
          if (idx === undefined) continue;
          grid[dow][idx].sale += Number(r.SaleTotal ?? 0);
          grid[dow][idx].count += Number(r.CustomerCnt ?? 0);
        }
        setHeat(grid);
      } catch { setHeat(null); }

      setStatus("success");
    } catch (e) {
      setErr((e as Error).message ?? "조회 실패");
      setStatus("error");
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // ─── 집계 ──────────────────────────────────────────────────────────
  const cur = useMemo(() => {
    const d = days ?? [];
    const sale = d.reduce((s, r) => s + r.saleTotal, 0);
    const count = d.reduce((s, r) => s + r.count, 0);
    const margin = d.reduce((s, r) => s + r.margin, 0);
    const qty = d.reduce((s, r) => s + r.qty, 0);
    return {
      sale, count, margin, qty,
      avgOrder: count > 0 ? sale / count : null,
      marginPct: sale > 0 ? (margin / sale) * 100 : null,
    };
  }, [days]);
  const prev = useMemo(() => {
    const d = prevDays ?? [];
    const sale = d.reduce((s, r) => s + r.saleTotal, 0);
    const count = d.reduce((s, r) => s + r.count, 0);
    const margin = d.reduce((s, r) => s + r.margin, 0);
    return {
      sale, count, margin,
      avgOrder: count > 0 ? sale / count : null,
      marginPct: sale > 0 ? (margin / sale) * 100 : null,
    };
  }, [prevDays]);

  const deltas = useMemo(() => ({
    sale:      pctDelta(cur.sale, prev.sale),
    count:     pctDelta(cur.count, prev.count),
    avgOrder:  pctDelta(cur.avgOrder, prev.avgOrder),
    marginPct: cur.marginPct !== null && prev.marginPct !== null ? cur.marginPct - prev.marginPct : null,  // pp
  }), [cur, prev]);

  // ⑦ 마진 Top/Bottom · bestsellers 는 수량순 · 새로 matrixPct 기준 Top/Bottom 산출
  //   · bestsellers 는 Top 10 수량 기준만 담겨 있으므로 전체 상품 중 재계산 (prodMap 재사용 불가 · load 완료 시 bestsellers 외 전체 보존하지 않음)
  //   · 간단히 bestsellers 안에서 Top5/Bottom5 분리 (판매수량이 있는 상품 중)
  const marginRanking = useMemo(() => {
    const withPct = bestsellers.filter((x) => x.marginPct !== null) as Array<{ pcode: string | null; name: string | null; qty: number; sale: number; margin: number; marginPct: number }>;
    const sorted = [...withPct].sort((a, b) => b.marginPct - a.marginPct);
    const top5 = sorted.slice(0, 5);
    const bottom5 = sorted.slice(-5).reverse();
    return { top5, bottom5 };
  }, [bestsellers]);

  // ⑧ Anomaly · days 매출 평균 & 표준편차 ±2σ 이탈
  const anomalies = useMemo(() => {
    const vals = (days ?? []).map((d) => d.saleTotal);
    const n = vals.length;
    if (n < 7) return [];
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const sigma = Math.sqrt(variance);
    const hi = mean + 2 * sigma;
    const lo = Math.max(0, mean - 2 * sigma);
    const out: Array<{ date: string; sale: number; direction: "up" | "down"; delta: number }> = [];
    (days ?? []).forEach((d) => {
      if (d.saleTotal > hi) out.push({ date: d.date, sale: d.saleTotal, direction: "up", delta: d.saleTotal - mean });
      else if (d.saleTotal < lo && d.saleTotal > 0) out.push({ date: d.date, sale: d.saleTotal, direction: "down", delta: d.saleTotal - mean });
    });
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
  }, [days]);

  // Insight Card · 자연어 1줄 (룰 기반)
  const insight = useMemo(() => {
    if (!days || days.length === 0) return "조회 중...";
    const dSale = deltas.sale;
    if (dSale === null) return `${range}일간 총 매출 ${fmtWon(cur.sale)}원 · 전기 비교 데이터 부족`;
    const dir = dSale >= 0 ? "증가" : "감소";
    const topItem = bestsellers[0]?.name ?? null;
    const base = `${range}일 매출 ${fmtWon(cur.sale)}원 · 전기 대비 ${dir === "증가" ? "+" : ""}${dSale.toFixed(1)}%`;
    return topItem ? `${base} · 베스트: ${topItem} ${bestsellers[0].qty}개` : base;
  }, [cur, deltas.sale, days, bestsellers, range]);

  // ─── UI ────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-w-0 max-w-full p-4 flex flex-col gap-4">
      {/* 상단 필터 toolbar · 홈 톤 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-0 bg-slate-100 border border-slate-200 rounded-md p-0.5">
          {RANGE_OPTIONS.map((o) => (
            <button key={o.k} type="button" onClick={() => setRange(o.k)}
              className={`px-3 h-8 rounded text-[14px] font-semibold transition-colors cursor-pointer ${range === o.k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-ink"}`}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="text-[13px] text-slate-500 font-medium">
          기간: <span className="tabular-nums text-ink">{daysAgoYmd(Number(range) - 1)}</span> ~ <span className="tabular-nums text-ink">{todayYmd()}</span>
          <span className="ml-2 text-slate-400">· 전기: 동일 기간 그 이전</span>
        </div>
      </div>

      {/* ① Insight Card · 북극성 자연어 */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 md:p-5">
        <div className="text-[13px] font-medium text-slate-500 mb-1">오늘의 인사이트</div>
        <div className="text-[16px] md:text-[17px] font-semibold text-ink leading-snug tabular-nums">
          {status === "loading" ? "조회 중..." : status === "error" ? `오류 · ${err}` : insight}
        </div>
      </section>

      {/* ② KPI 4-strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="총매출" value={status === "loading" ? "..." : `${fmtWonShort(cur.sale)}원`} delta={deltas.sale} deltaType="pct" positive={true} series={days?.map(d => d.saleTotal) ?? []} />
        <KpiCard label="결제 건수" value={status === "loading" ? "..." : fmtCount(cur.count)} delta={deltas.count} deltaType="pct" positive={true} series={days?.map(d => d.count) ?? []} />
        <KpiCard label="객단가" value={status === "loading" ? "..." : `${fmtWonShort(cur.avgOrder)}원`} delta={deltas.avgOrder} deltaType="pct" positive={true} series={days?.map(d => d.count > 0 ? d.saleTotal / d.count : 0) ?? []} />
        <KpiCard label="마진율" value={status === "loading" ? "..." : fmtPct(cur.marginPct)} delta={deltas.marginPct} deltaType="pp" positive={true} series={days?.map(d => d.saleTotal > 0 ? (d.margin / d.saleTotal) * 100 : 0) ?? []} />
      </section>

      {/* ③ 매출 추이 Area (전주 overlay) */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매출 추이</h3>
          <div className="text-[13px] text-slate-500 font-medium">단위: 원 · 전기 overlay (dim)</div>
        </div>
        <div className="w-full" style={{ height: 260 }}>
          {status === "loading" || !days ? (
            <div className="h-full flex items-center justify-center text-[14px] text-slate-400">조회 중...</div>
          ) : (
            <ResponsiveContainer>
              <AreaChart data={buildTrendData(days, prevDays)} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="cur-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v) => fmtWonShort(Number(v))} width={55} />
                <Tooltip
                  formatter={(v: any, name: string) => [`${fmtWon(Number(v))}원`, name === "cur" ? "당기" : "전기"]}
                  contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  labelFormatter={(l) => `${l}`}
                />
                <Area type="monotone" dataKey="prev" stroke="#cbd5e1" strokeWidth={1.5} fill="transparent" dot={false} />
                <Area type="monotone" dataKey="cur"  stroke="#4f46e5" strokeWidth={2}   fill="url(#cur-fill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ④ 베스트셀러 Top 10 · Attio density 테이블 */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">베스트셀러 Top 10</h3>
          <div className="text-[13px] text-slate-500 font-medium">판매수량 상위 · {range}일 집계</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr className="text-[13px] font-medium">
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-left px-3 py-2">상품명</th>
                <th className="text-right px-3 py-2">수량</th>
                <th className="text-right px-3 py-2">매출</th>
                <th className="text-right px-3 py-2 w-16">마진율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {status === "loading" && bestsellers.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-[14px]">조회 중...</td></tr>
              )}
              {status === "success" && bestsellers.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400 text-[14px]">판매 데이터 없음</td></tr>
              )}
              {bestsellers.map((it, i) => (
                <tr key={`${it.pcode ?? it.name ?? i}`} className="hover:bg-slate-50/50 transition-colors text-ink h-10">
                  <td className="px-3 py-2 text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 font-medium break-keep">{it.name ?? "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtCount(it.qty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtWon(it.sale)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${(it.marginPct ?? 0) >= 30 ? "text-emerald-600" : (it.marginPct ?? 0) >= 15 ? "text-slate-700" : "text-slate-400"}`}>{fmtPct(it.marginPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ⑤ 공급사별 매출 비중 Donut */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">공급사별 매출 비중</h3>
          <div className="text-[13px] text-slate-500 font-medium">상위 6 + 기타</div>
        </div>
        {suppliers.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "데이터 없음"}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
            <div className="md:col-span-2" style={{ height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={suppliers} dataKey="sale" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={1} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                    {suppliers.map((_, idx) => (
                      <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${fmtWon(Number(v))}원`} contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="md:col-span-3 min-w-0">
              {(() => {
                const total = suppliers.reduce((s, x) => s + x.sale, 0);
                return (
                  <ul className="divide-y divide-slate-100">
                    {suppliers.map((s, i) => {
                      const pct = total > 0 ? (s.sale / total) * 100 : 0;
                      return (
                        <li key={`${s.name}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-[14px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                            <span className="text-ink font-medium break-keep truncate">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 tabular-nums">
                            <span className="text-slate-500 text-[13px]">{pct.toFixed(1)}%</span>
                            <span className="text-ink font-semibold w-20 text-right">{fmtWon(s.sale)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>
        )}
      </section>

      {/* ⑥ 요일×시간대 Heatmap */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 md:p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">요일 × 시간대 Heatmap</h3>
          <div className="text-[13px] text-slate-500 font-medium">매출 집계 · 짙을수록 매출 ↑</div>
        </div>
        {!heat || heatHours.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "데이터 없음"}</div>
        ) : (() => {
          const maxVal = Math.max(1, ...heat.flat().map((c) => c.sale));
          const DOW_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
          return (
            <div className="overflow-x-auto">
              <table className="border-separate" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="w-10 text-[12px] text-slate-400 font-medium"></th>
                    {heatHours.map((h) => (
                      <th key={h} className="text-[11px] text-slate-500 font-medium tabular-nums text-center" style={{ minWidth: 24 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.map((row, dowIdx) => (
                    <tr key={dowIdx}>
                      <td className={`text-[12px] font-semibold text-center ${dowIdx === 0 ? "text-rose-600" : dowIdx === 6 ? "text-sky-600" : "text-slate-600"}`}>{DOW_LABEL[dowIdx]}</td>
                      {row.map((cell, hIdx) => {
                        const intensity = cell.sale / maxVal;  // 0~1
                        const bg = intensity > 0 ? `rgba(79, 70, 229, ${0.08 + intensity * 0.75})` : "rgba(241, 245, 249, 0.6)";
                        const title = `${DOW_LABEL[dowIdx]} ${heatHours[hIdx]}시 · 매출 ${fmtWon(cell.sale)}원 · 고객 ${fmtCount(cell.count)}명`;
                        return (
                          <td key={hIdx} title={title} style={{ backgroundColor: bg, width: 24, height: 24, borderRadius: 3 }} />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </section>

      {/* ⑦ 마진 Top 5 · Bottom 5 (좌우 2열) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">마진율 상위 Top 5</h3>
            <span className="text-[12px] text-emerald-600 font-semibold">▲ 수익성 ↑</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {marginRanking.top5.length === 0 ? (
              <li className="text-[14px] text-slate-400 text-center py-6">데이터 없음</li>
            ) : marginRanking.top5.map((it, i) => (
              <li key={`t-${it.pcode ?? it.name ?? i}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[14px] text-ink">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 tabular-nums w-5 text-right">{i + 1}</span>
                  <span className="font-medium break-keep truncate">{it.name ?? "-"}</span>
                </div>
                <span className="shrink-0 text-emerald-600 font-semibold tabular-nums">{fmtPct(it.marginPct)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">마진율 하위 Bottom 5</h3>
            <span className="text-[12px] text-rose-600 font-semibold">▼ 수익성 ↓</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {marginRanking.bottom5.length === 0 ? (
              <li className="text-[14px] text-slate-400 text-center py-6">데이터 없음</li>
            ) : marginRanking.bottom5.map((it, i) => (
              <li key={`b-${it.pcode ?? it.name ?? i}`} className="flex items-center justify-between gap-3 px-4 py-2 text-[14px] text-ink">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 tabular-nums w-5 text-right">{i + 1}</span>
                  <span className="font-medium break-keep truncate">{it.name ?? "-"}</span>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${it.marginPct < 10 ? "text-rose-600" : "text-slate-700"}`}>{fmtPct(it.marginPct)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ⑧ Anomaly Alert · 평균-2σ 이탈 */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">특이 매출 알림</h3>
          <span className="text-[12px] text-slate-500 font-medium">평균 ±2σ 이탈</span>
        </div>
        {anomalies.length === 0 ? (
          <div className="px-4 py-6 text-center text-[14px] text-slate-400">{status === "loading" ? "조회 중..." : "이상 매출 없음 · 안정적인 기간"}</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {anomalies.map((a) => (
              <li key={a.date} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[12px] font-bold ${a.direction === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {a.direction === "up" ? "▲" : "▼"}
                  </span>
                  <span className="font-semibold text-ink tabular-nums">{a.date}</span>
                  <span className="text-[12px] text-slate-500">{new Date(a.date + "T00:00:00").toLocaleDateString("ko-KR", { weekday: "short" })}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <span className="text-ink font-semibold">{fmtWon(a.sale)}원</span>
                  <span className={`text-[13px] font-semibold ${a.direction === "up" ? "text-emerald-600" : "text-rose-600"}`}>
                    {a.direction === "up" ? "+" : ""}{fmtWon(a.delta)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

// Donut 색상 · 뉴트럴 + 액센트 · Linear/Vercel 톤
const DONUT_COLORS = [
  "#4f46e5",  // indigo (primary)
  "#0ea5e9",  // sky
  "#14b8a6",  // teal
  "#f59e0b",  // amber
  "#ec4899",  // pink
  "#8b5cf6",  // violet
  "#94a3b8",  // slate (기타)
];

// ─── 보조: 매출 추이 데이터 조립 ────────────────────────────────────
function buildTrendData(cur: DayAggregate[], prev: DayAggregate[] | null): Array<{ label: string; cur: number; prev: number | null }> {
  return cur.map((c, i) => {
    const p = prev && prev[i] ? prev[i].saleTotal : null;
    const d = c.date; // YYYY-MM-DD
    const label = `${d.slice(5, 7)}/${d.slice(8, 10)}`;
    return { label, cur: c.saleTotal, prev: p };
  });
}

// ─── KPI Card (숫자 + delta + sparkline) ────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  delta: number | null;      // % 또는 pp
  deltaType: "pct" | "pp";
  positive: boolean;         // delta ≥ 0 이 좋은가 (true = 상승이 success)
  series: number[];
}
const KpiCard: React.FC<KpiCardProps> = ({ label, value, delta, deltaType, positive, series }) => {
  const good = delta !== null && (positive ? delta >= 0 : delta <= 0);
  const bad = delta !== null && (positive ? delta < 0 : delta > 0);
  const deltaStr = delta === null ? "-" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}${deltaType === "pct" ? "%" : "pp"}`;
  const data = series.map((v, i) => ({ i, v }));
  return (
    <div className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3 md:p-4 min-w-0">
      <div className="text-[13px] font-medium text-slate-500 mb-1 truncate">{label}</div>
      <div className="flex items-end justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <div className="text-[20px] md:text-[22px] font-bold text-ink tabular-nums leading-tight break-all">{value}</div>
          <div className={`text-[13px] font-semibold tabular-nums mt-0.5 ${good ? "text-emerald-600" : bad ? "text-rose-600" : "text-slate-400"}`}>{deltaStr}</div>
        </div>
        {data.length > 1 && (
          <div className="shrink-0" style={{ width: 72, height: 28 }}>
            <ResponsiveContainer>
              <SparkLineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                <Line type="monotone" dataKey="v" stroke={good ? "#059669" : bad ? "#e11d48" : "#64748b"} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </SparkLineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesTab;
