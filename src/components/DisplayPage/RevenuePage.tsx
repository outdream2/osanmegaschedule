// src/components/DisplayPage/RevenuePage.tsx
// 2026-10-05 · 매장 > 매출 페이지 (ERP Sales_Days_TimeReport + Statistics_Month_DashBoard)
//   · 상단: 오늘 TODAY KPI (오늘 날짜 데이터만 집계)
//   · 탭 1: 시간대별 매출 (날짜별 column group · 각 날짜 안 ERP UI 와 동일 column + 누적)
//   · 탭 2: 월별 매출 (7 column 달력 · 각 날짜 셀 매입/매출/객수단가/마진 · 주간 subtotal)
//   · ERP 가 제공하는 값은 그대로 사용 · ERP 미제공 집계(누적/주간)만 WEB 계산
//   · ERROR != ZERO · 조회 전 "-" · 실패 "-" + 오류 · 성공시 실제 값

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";

type RevenueTab = "hourly" | "monthly";
type FetchStatus = "idle" | "loading" | "success" | "error";

interface HourlyRow {
  CorpCode: string;
  SaleDate: string;        // YYYY-MM-DD
  SaleTime: string;        // "HH"
  CustomerCnt: number;
  ChargeTotal: number;
  AvgChargeTotal: number;
  Margin: number;
  SaleTotal: number;
  MarginRate: number;
}

interface MonthlyAggregated {
  CorpCode: string;
  StCode: string;
  SaleDate: string;              // YYYY-MM
  maxSaleDateRaw?: string;
  BuyTotal?: string | number | null;
  CostTotal?: string | number | null;
  SaleTotal?: string | number | null;
  CustomerCnt?: string | number | null;
  AvgPerCustomer?: number | null;
  Margin?: string | number | null;
  MarginPercent?: string | number | null;
}

// 2026-10-05 · 사용자 지시 · schema mismatch 상태 분리 (UI 에 ERP 오류 표시 · 0원/0건 X)
type MonthlyApiResponse = {
  ok: boolean;
  schemaMismatch?: boolean;
  buy?: MonthlyAggregated[];
  sale?: MonthlyAggregated[];
  buyDaily?: MonthlyBuyDaily[];
  saleDaily?: MonthlySaleDaily[];
  error?: string;
};
interface MonthlyBuyDaily {
  CorpCode: string;
  StCode: string;
  SaleDate: string;      // YYYY-MM
  SaleDateRaw: string;   // YYYY-MM-DD
  BuyTotal: number | null;
}
interface MonthlySaleDaily {
  CorpCode: string;
  StCode: string;
  SaleDate: string;
  SaleDateRaw: string;
  CostTotal: number | null;
  SaleTotal: number | null;
  CustomerCnt: number | null;
  AvgPerCustomer: number | null;
  Margin: number | null;
  MarginPercent: number | null;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addOneDay(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtWon(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR") + "원";
}
// 2026-10-05 · 12개월 overview 용 짧은 포맷 (1억 이상 "N.N억" · 1만 이상 "N만" · 미만 그대로)
function fmtWonShort(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "-";
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000)}만`;
  return n.toLocaleString("ko-KR");
}
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "-";
  return Math.round(n).toLocaleString("ko-KR");
}
function fmtHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function parseHour(saleTime: string): number {
  const m = (saleTime || "").match(/^(\d{1,2})/);
  return m ? Number(m[1]) : -1;
}

// 2026-10-05 · 사용자 지시 · HOURLY/MONTHLY 완전 분리
//   · Parent 는 tab state 만 유지
//   · HOURLY state (hourlyRows/hourlyLoading/hourlyError/hourlyFromDate/hourlyToDate) → HourlyReportTab 자체 보유
//   · MONTHLY state (selectedYear/selectedMonth/monthlyData/monthlyLoading/monthlyError) → MonthlyReportTab 자체 보유 (이미 분리)
//   · 공용 date state 금지 · HOURLY/MONTHLY API 호출 · parser · state 완전 독립
export const RevenuePage: React.FC = () => {
  const [tab, setTab] = useState<RevenueTab>("hourly");
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 탭 */}
      <div className="px-4 pt-4 shrink-0">
        <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1 w-fit">
          {([
            { k: "hourly" as const,  label: "⏱ 시간대별 조회" },
            { k: "monthly" as const, label: "📅 월별 조회" },
          ]).map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`px-4 py-2 rounded text-[18px] font-semibold transition ${
                tab === t.k ? "bg-brand-deep text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === "hourly" ? <HourlyReportTab /> : <MonthlyReportTab />}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// 시간대별 탭 · 완전 독립 state (HOURLY)
//   · 자체 보유: hourlyRows / hourlyStatus / hourlyError / hourlyFrom / hourlyTo
//   · API: /api/erp/sale-hourly-report (Sales_Days_TimeReport)
//   · MONTHLY data / monthlyRows / Statistics_Month_DashBoard · 절대 사용 X
//   · 날짜별 column group (ERP UI 와 동일) · 각 날짜 cumulative · "← 현재" 1개만
// ──────────────────────────────────────────────────────────────────────────
interface HourlyApiResponse {
  ok: boolean;
  schemaMismatch?: boolean;
  rows?: HourlyRow[];
  error?: string;
}

const HourlyReportTab: React.FC = () => {
  // HOURLY 전용 state
  const [hourlyRows, setHourlyRows] = useState<HourlyRow[] | null>(null);
  const [hourlyStatus, setHourlyStatus] = useState<FetchStatus>("idle");
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const [hourlySchemaMismatch, setHourlySchemaMismatch] = useState<boolean>(false);
  const [hourlyLastSuccessAt, setHourlyLastSuccessAt] = useState<string | null>(null);
  const [hourlyFromDate, setHourlyFromDate] = useState<string>(() => todayYmd());
  const [hourlyToDate, setHourlyToDate] = useState<string>(() => todayYmd());
  // 2026-10-05 · 모바일 반응형 · 날짜별 세로 접이식 · 오늘만 기본 펼침
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set([todayYmd()]));
  const toggleDate = (date: string) => setExpandedDates((prev) => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });

  // HOURLY 전용 loader · /api/erp/sale-hourly-report · Sales_Days_TimeReport
  const loadHourly = useCallback(async (from: string, to: string) => {
    setHourlyStatus("loading"); setHourlyError(null); setHourlySchemaMismatch(false);
    try {
      const r = await api.get<HourlyApiResponse>(`/api/erp/sale-hourly-report?from=${from}&to=${to}`);
      if (!r.data.ok) {
        if (r.data.schemaMismatch) {
          setHourlySchemaMismatch(true);
          setHourlyError(r.data.error ?? "ERP 시간대별 응답 비정상");
          setHourlyStatus("error");
          setHourlyRows(null);
          return;
        }
        throw new Error(r.data.error ?? "조회 실패");
      }
      setHourlyRows(r.data.rows ?? []);
      setHourlyLastSuccessAt(new Date().toISOString());
      setHourlyStatus("success");
    } catch (e) {
      setHourlyError((e as Error).message);
      setHourlyStatus("error");
      setHourlyRows(null);
    }
  }, []);

  useEffect(() => { void loadHourly(hourlyFromDate, hourlyToDate); }, [loadHourly, hourlyFromDate, hourlyToDate]);

  const onResetToday = () => { const y = todayYmd(); setHourlyFromDate(y); setHourlyToDate(y); };

  // 상단 TODAY KPI = 오늘 날짜 rows 만 (조회 범위에 오늘 포함시만)
  const now = new Date();
  const today = todayYmd();
  const curHour = now.getHours();
  const curTimeLabel = fmtHHmm(now);
  const rows = hourlyRows;
  const status = hourlyStatus;
  const error = hourlyError;
  const fromDate = hourlyFromDate;
  const toDate = hourlyToDate;

  const todayRowsOnly = useMemo(() =>
    (rows ?? []).filter((r) => r.SaleDate === today), [rows, today]);
  const accumulatedRows = useMemo(() =>
    todayRowsOnly.filter((r) => {
      const h = parseHour(r.SaleTime);
      return h >= 0 && h <= curHour;
    }), [todayRowsOnly, curHour]);
  const todaySale = accumulatedRows.reduce((a, r) => a + Number(r.SaleTotal ?? 0), 0);
  const todayCust = accumulatedRows.reduce((a, r) => a + Number(r.CustomerCnt ?? 0), 0);
  const showTopKpi = status === "success" && rows !== null && todayRowsOnly.length > 0;
  const show = status === "success" && rows !== null;
  // 2026-10-05 fix · 사용자 지적 · ERP 가 범위 외 데이터 반환해도 조회 기간 밖은 숨김
  //   · "기간을 위에서 정했으면 그만큼만 나와야 함"
  const dataRows = useMemo(
    () => (rows ?? []).filter((r) => r.SaleDate >= fromDate && r.SaleDate <= toDate),
    [rows, fromDate, toDate],
  );

  // 날짜별 group + SaleTime 정순
  const byDate = useMemo(() => {
    const map = new Map<string, HourlyRow[]>();
    for (const r of dataRows) {
      const d = r.SaleDate;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    }
    for (const [, list] of map) {
      list.sort((a, b) => Number(a.SaleTime) - Number(b.SaleTime));
    }
    return map;
  }, [dataRows]);

  const dates = useMemo(() => [...byDate.keys()].sort(), [byDate]);

  // 날짜별 cumulative + 통계
  type DateBlock = {
    date: string;
    rowMap: Map<string, HourlyRow & { cumCust: number; cumSale: number }>;
    totalSale: number;
    totalCust: number;
    totalMargin: number;
  };
  const dateData: DateBlock[] = useMemo(() => {
    return dates.map((date) => {
      const dayRows = byDate.get(date)!;
      let cumCust = 0, cumSale = 0;
      const rowMap = new Map<string, HourlyRow & { cumCust: number; cumSale: number }>();
      let totalMargin = 0;
      for (const r of dayRows) {
        cumCust += Number(r.CustomerCnt ?? 0);
        cumSale += Number(r.SaleTotal ?? 0);
        totalMargin += Number(r.Margin ?? 0);
        rowMap.set(r.SaleTime, { ...r, cumCust, cumSale });
      }
      return { date, rowMap, totalSale: cumSale, totalCust: cumCust, totalMargin };
    });
  }, [dates, byDate]);

  // 전체 시간 slot (모든 날짜에서 등장하는 시간들)
  const allSlots = useMemo(() => {
    const set = new Set<string>();
    for (const d of dateData) for (const t of d.rowMap.keys()) set.add(t);
    return [...set].sort();
  }, [dateData]);

  // 오늘만 KPI
  const todayBlock = dateData.find((d) => d.date === today);
  const totalSale = todayBlock?.totalSale ?? 0;
  const totalMargin = todayBlock?.totalMargin ?? 0;
  const totalCust = todayBlock?.totalCust ?? 0;
  const marginRate = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0;
  const curSlot = String(curHour).padStart(2, "0");

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 TODAY KPI (HOURLY 전용 · 오늘 데이터만) */}
      <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[15px] text-zinc-600 font-semibold">오늘 {today} {curTimeLabel} 기준</div>
          <div className="flex items-center gap-6 mt-1">
            <div>
              <span className="text-[15px] text-zinc-500">누적 고객수</span>
              <span className="ml-2 text-[23px] font-bold text-brand-deep tabular-nums">{showTopKpi ? todayCust.toLocaleString() + "명" : "-"}</span>
            </div>
            <div>
              <span className="text-[15px] text-zinc-500">누적 매출</span>
              <span className="ml-2 text-[23px] font-bold text-brand-deep tabular-nums">{showTopKpi ? fmtWon(todaySale) : "-"}</span>
            </div>
          </div>
        </div>
        <div className="text-[14px] text-zinc-500">마지막 ERP 조회: {hourlyLastSuccessAt ? fmtHHmm(new Date(hourlyLastSuccessAt)) : "-"}</div>
      </div>

      {/* 날짜 선택 UI · HOURLY 전용 */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
        <span className="text-[16px] font-semibold text-zinc-700">조회 기간</span>
        <input type="date" value={fromDate} onChange={(e) => setHourlyFromDate(e.target.value)}
          className="px-3 py-1.5 border border-zinc-300 rounded text-[16px]" />
        <span className="text-zinc-400">~</span>
        <input type="date" value={toDate} onChange={(e) => setHourlyToDate(e.target.value)}
          className="px-3 py-1.5 border border-zinc-300 rounded text-[16px]" />
        <button onClick={() => void loadHourly(fromDate, toDate)} disabled={status === "loading"}
          className="px-4 py-1.5 bg-brand-deep text-white rounded hover:bg-brand-deep/90 text-[16px] font-bold disabled:opacity-50">
          {status === "loading" ? "조회 중..." : "🔍 조회"}
        </button>
        <button onClick={onResetToday}
          className="px-3 py-1.5 border border-brand-deep text-brand-deep rounded bg-white hover:bg-sky-50 text-[15px] font-semibold">
          오늘로
        </button>
        <div className="flex-1" />
        <div className="text-[15px] font-semibold text-zinc-700">
          {dates.length === 0
            ? "데이터 없음"
            : dates.length === 1
              ? `${dates[0]} (${dates.length}일)`
              : `${dates[0]} ~ ${dates[dates.length - 1]} (${dates.length}일)`}
        </div>
      </div>
      {hourlySchemaMismatch && error && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 border text-[15px] p-3 rounded flex items-center justify-between gap-2">
          <div>
            <span className="font-semibold">⚠ ERP 응답 비정상 · 다시 조회 시도</span>
            <div className="text-[13px] mt-1 opacity-80">{error}</div>
          </div>
          <button onClick={() => void loadHourly(fromDate, toDate)}
            className="shrink-0 px-3 py-1.5 border border-current rounded text-[14px] font-semibold hover:bg-white/50">
            다시 조회
          </button>
        </div>
      )}

      {status === "error" && error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[16px] p-3 rounded">
          ERP 조회 실패: {error}
        </div>
      )}

      {/* 오늘 KPI = 오늘 날짜만 */}
      <div className="grid grid-cols-4 gap-3">
        <KpiBox label={`${today} 매출총액`} value={show ? fmtWon(totalSale) : "-"} />
        <KpiBox label={`${today} 매출이익`} value={show ? fmtWon(totalMargin) : "-"} />
        <KpiBox label={`${today} 마진율`} value={show ? `${marginRate.toFixed(1)}%` : "-"} />
        <KpiBox label={`${today} 고객수`} value={show ? totalCust.toLocaleString() + "명" : "-"} />
      </div>

      {/* 날짜별 column group · PC 전용 */}
      <div className="hidden md:block bg-white border border-zinc-200 rounded-lg overflow-auto">
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th rowSpan={2} className="text-center px-3 py-2 font-semibold text-zinc-600 border-r border-zinc-200 bg-zinc-50 sticky left-0 z-10" style={{ minWidth: 72 }}>시간</th>
              {dateData.map((d) => (
                <th key={d.date} colSpan={6} className={`text-center px-3 py-2 font-semibold text-zinc-700 border-r border-zinc-200 ${d.date === today ? "bg-amber-50" : "bg-sky-50"}`}>
                  {d.date}{d.date === today && <span className="ml-1 text-amber-700 text-[14px]">● 오늘</span>}
                </th>
              ))}
            </tr>
            <tr className="bg-zinc-50 border-b border-zinc-200 text-[14px]">
              {dateData.map((d) => (
                <React.Fragment key={d.date}>
                  <th className="text-right px-2 py-1 font-semibold text-zinc-600">객단가</th>
                  <th className="text-right px-2 py-1 font-semibold text-zinc-600">고객수</th>
                  <th className="text-right px-2 py-1 font-semibold text-zinc-600">합계금액</th>
                  <th className="text-right px-2 py-1 font-semibold text-zinc-600">마진율(%)</th>
                  <th className="text-right px-2 py-1 font-semibold text-amber-800 bg-amber-50">누적 고객수</th>
                  <th className="text-right px-2 py-1 font-semibold text-amber-800 bg-amber-50 border-r border-zinc-200">누적 합계금액</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {!show ? (
              <tr><td colSpan={1 + dateData.length * 6} className="text-center py-8 text-zinc-400">
                {status === "idle" || status === "loading" ? "조회 중..." : status === "error" ? "조회 실패" : "데이터 없음"}
              </td></tr>
            ) : allSlots.length === 0 ? (
              <tr><td colSpan={1} className="text-center py-8 text-zinc-400">데이터 없음 (ERP 응답 0 row)</td></tr>
            ) : allSlots.map((slot) => (
              <tr key={slot} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="px-3 py-2 text-center font-semibold text-zinc-700 border-r border-zinc-200 sticky left-0 bg-white z-10">
                  {slot}
                </td>
                {dateData.map((d) => {
                  const r = d.rowMap.get(slot);
                  const isCurrent = d.date === today && slot === curSlot;
                  if (!r) {
                    return (
                      <React.Fragment key={d.date}>
                        <td className="px-2 py-2 text-right text-zinc-300">-</td>
                        <td className="px-2 py-2 text-right text-zinc-300">-</td>
                        <td className="px-2 py-2 text-right text-zinc-300">-</td>
                        <td className="px-2 py-2 text-right text-zinc-300">-</td>
                        <td className="px-2 py-2 text-right text-zinc-300 bg-amber-50/30">-</td>
                        <td className="px-2 py-2 text-right text-zinc-300 bg-amber-50/30 border-r border-zinc-200">-</td>
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={d.date}>
                      <td className={`px-2 py-2 text-right tabular-nums ${isCurrent ? "bg-sky-100 font-semibold" : ""}`}>{fmtNum(Number(r.AvgChargeTotal ?? 0))}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${isCurrent ? "bg-sky-100 font-semibold" : ""}`}>{fmtNum(Number(r.CustomerCnt ?? 0))}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${isCurrent ? "bg-sky-100 font-semibold" : ""}`}>{fmtNum(Number(r.SaleTotal ?? 0))}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${isCurrent ? "bg-sky-100 font-semibold" : ""}`}>{Number(r.MarginRate ?? 0).toFixed(1)}{isCurrent && <span className="ml-1 text-sky-600 text-[14px]">← 현재</span>}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-amber-50 font-semibold text-amber-800">{fmtNum(r.cumCust)}</td>
                      <td className="px-2 py-2 text-right tabular-nums bg-amber-50 font-semibold text-amber-800 border-r border-zinc-200">{fmtNum(r.cumSale)}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 날짜별 세로 접이식 · 모바일 전용 · 오늘만 기본 펼침 */}
      <div className="md:hidden flex flex-col gap-2">
        {!show ? (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-400">
            {status === "idle" || status === "loading" ? "조회 중..." : status === "error" ? "조회 실패" : "데이터 없음"}
          </div>
        ) : dateData.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-400">데이터 없음</div>
        ) : (
          dateData.map((d) => {
            const isExp = expandedDates.has(d.date);
            const isToday = d.date === today;
            const dayRows = [...d.rowMap.values()].sort((a, b) => Number(a.SaleTime) - Number(b.SaleTime));
            const dMarginRate = d.totalSale > 0 ? (d.totalMargin / d.totalSale) * 100 : 0;
            return (
              <div key={d.date} className={`bg-white border rounded-lg overflow-hidden ${isToday ? "border-amber-300" : "border-zinc-200"}`}>
                <button
                  type="button"
                  onClick={() => toggleDate(d.date)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 transition ${isToday ? "bg-amber-50 hover:bg-amber-100" : "bg-zinc-50 hover:bg-zinc-100"}`}
                  aria-expanded={isExp}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[16px] font-semibold text-zinc-800 whitespace-nowrap">{d.date}</span>
                    {isToday && <span className="text-amber-700 text-[13px] font-bold whitespace-nowrap">● 오늘</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right text-[13px] text-zinc-600">
                      <div className="font-semibold text-zinc-800 tabular-nums">{fmtWon(d.totalSale)}</div>
                      <div className="tabular-nums">{d.totalCust.toLocaleString()}명 · {dMarginRate.toFixed(1)}%</div>
                    </div>
                    <span className="text-zinc-600 text-[14px] font-bold w-4 text-center">{isExp ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isExp && (
                  <div className="border-t border-zinc-200 overflow-x-auto">
                    <table className="w-full text-[14px] border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-[12px]">
                          <th className="text-center px-2 py-1.5 font-semibold text-zinc-600">시간</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">객단가</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">고객</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">합계</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">마진%</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-amber-800 bg-amber-50">누적고객</th>
                          <th className="text-right px-2 py-1.5 font-semibold text-amber-800 bg-amber-50">누적합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayRows.map((r) => {
                          const isCurrent = isToday && r.SaleTime === curSlot;
                          return (
                            <tr key={r.SaleTime} className={`border-b border-zinc-100 ${isCurrent ? "bg-sky-50" : ""}`}>
                              <td className={`px-2 py-1.5 text-center font-semibold ${isCurrent ? "text-sky-700" : "text-zinc-700"}`}>
                                {r.SaleTime}{isCurrent && <span className="ml-0.5 text-sky-600 text-[11px]">●</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(Number(r.AvgChargeTotal ?? 0))}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(Number(r.CustomerCnt ?? 0))}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(Number(r.SaleTotal ?? 0))}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.MarginRate ?? 0).toFixed(1)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums bg-amber-50/40 text-amber-800 font-semibold">{fmtNum(r.cumCust)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums bg-amber-50/40 text-amber-800 font-semibold">{fmtNum(r.cumSale)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const KpiBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white border border-zinc-200 rounded-lg p-4">
    <div className="text-[15px] text-zinc-500 font-semibold mb-1">{label}</div>
    <div className="text-[21px] font-bold text-ink">{value}</div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────────
// 월별 탭 · 7 column 달력 grid (ERP UI "월별 현황" 동일 구조)
//   · 각 날짜 셀: 매입 · 매출 · 객수/단가 · 마진 (ERP raw)
//   · 일요일 셀 안 "[주간 합계]" subtotal (해당 주 월~토 합계 · WEB 계산)
//   · 오늘 날짜 셀 하이라이트
// ──────────────────────────────────────────────────────────────────────────
const MonthlyReportTab: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [buyMonths, setBuyMonths] = useState<MonthlyAggregated[] | null>(null);
  const [saleMonths, setSaleMonths] = useState<MonthlyAggregated[] | null>(null);
  const [buyDaily, setBuyDaily] = useState<MonthlyBuyDaily[] | null>(null);
  const [saleDaily, setSaleDaily] = useState<MonthlySaleDaily[] | null>(null);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [schemaMismatch, setSchemaMismatch] = useState<boolean>(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);

  // 2026-10-05 · 사용자 지시 · frontend cache 제거 · 매 조회(진입/기간변경/새로고침) ERP 실시간 호출
  //   · 기존 loadedKey 캐싱 제거 (사용자 지시 "cache 가 매출 실시간 조회를 막는다면 제거")
  //   · ERP 비결정적 schema → server 가 1회 retry 후 schemaMismatch 반환시 UI 오류 표시
  const load = useCallback(async (y: number, m: number) => {
    setStatus("loading"); setError(null); setSchemaMismatch(false);
    try {
      const r = await api.get<MonthlyApiResponse>(
        `/api/erp/sale-monthly-report?year=${y}&month=${m}`,
      );
      if (!r.data.ok) {
        if (r.data.schemaMismatch) {
          setSchemaMismatch(true);
          setError(r.data.error ?? "ERP 월별 응답 비정상 · 다시 시도해 주세요");
          setStatus("error");
          setBuyMonths(null); setSaleMonths(null); setBuyDaily(null); setSaleDaily(null);
          return;
        }
        throw new Error(r.data.error ?? "조회 실패");
      }
      setBuyMonths(r.data.buy ?? []);
      setSaleMonths(r.data.sale ?? []);
      setBuyDaily(r.data.buyDaily ?? []);
      setSaleDaily(r.data.saleDaily ?? []);
      setLastSuccessAt(new Date().toISOString());
      setStatus("success");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
      setBuyMonths(null); setSaleMonths(null); setBuyDaily(null); setSaleDaily(null);
    }
  }, []);

  useEffect(() => { void load(year, month); }, [year, month, load]);

  // 2026-10-05 · 사용자 요청 · 선택 년도 12개월 각 월별 데이터 (매입/매출/매출이익/마진율/고객수) 표
  //   · year 변경시 1~12월 ERP 호출 (병렬) · yearOverview Map 쌓음
  //   · load() 와는 별도 비동기 · 선택월 조회에 영향 X
  type YearOverviewItem = { buyTotal: number; saleTotal: number; margin: number; customerCnt: number };
  const [yearOverview, setYearOverview] = useState<Map<number, YearOverviewItem>>(new Map());
  const [overviewYear, setOverviewYear] = useState<number | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    setYearOverview(new Map());
    setOverviewYear(year);
    (async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => i + 1).map(async (m) => {
          try {
            const r = await api.get<MonthlyApiResponse>(`/api/erp/sale-monthly-report?year=${year}&month=${m}`);
            if (!r.data.ok) return { m, buyTotal: 0, saleTotal: 0, margin: 0, customerCnt: 0 };
            const sale0 = r.data.sale?.[0];
            const buy0 = r.data.buy?.[0];
            return {
              m,
              buyTotal: Number(buy0?.BuyTotal ?? 0),
              saleTotal: Number(sale0?.SaleTotal ?? 0),
              margin: Number(sale0?.Margin ?? 0),
              customerCnt: Number(sale0?.CustomerCnt ?? 0),
            };
          } catch { return { m, buyTotal: 0, saleTotal: 0, margin: 0, customerCnt: 0 }; }
        }),
      );
      if (cancelled) return;
      const map = new Map<number, YearOverviewItem>();
      results.forEach((r) => map.set(r.m, { buyTotal: r.buyTotal, saleTotal: r.saleTotal, margin: r.margin, customerCnt: r.customerCnt }));
      setYearOverview(map);
    })();
    return () => { cancelled = true; };
  }, [year]);

  const goPrev = () => { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const goNext = () => { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); };
  const goThisMonth = () => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); };

  const show = status === "success" && buyDaily !== null && saleDaily !== null;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();  // 0=일, 6=토

  // 선택 월의 daily rows만
  const buyByDay = useMemo(() => {
    const map = new Map<string, MonthlyBuyDaily>();
    (buyDaily ?? []).forEach((r) => { if (r.SaleDateRaw?.startsWith(monthStr)) map.set(r.SaleDateRaw, r); });
    return map;
  }, [buyDaily, monthStr]);
  const saleByDay = useMemo(() => {
    const map = new Map<string, MonthlySaleDaily>();
    (saleDaily ?? []).forEach((r) => { if (r.SaleDateRaw?.startsWith(monthStr)) map.set(r.SaleDateRaw, r); });
    return map;
  }, [saleDaily, monthStr]);

  // 달력 cells
  type Cell = null | { day: number; dateStr: string; buy?: MonthlyBuyDaily; sale?: MonthlySaleDaily };
  const cells: Cell[] = useMemo(() => {
    const arr: Cell[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${monthStr}-${String(d).padStart(2, "0")}`;
      arr.push({ day: d, dateStr: ds, buy: buyByDay.get(ds), sale: saleByDay.get(ds) });
    }
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [firstDayOfWeek, daysInMonth, monthStr, buyByDay, saleByDay]);

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  // 각 주 subtotal
  const weekSummaries = weeks.map((week) => {
    let buyT = 0, saleT = 0, cust = 0, marg = 0;
    for (const c of week) {
      if (!c) continue;
      buyT += Number(c.buy?.BuyTotal ?? 0);
      saleT += Number(c.sale?.SaleTotal ?? 0);
      cust += Number(c.sale?.CustomerCnt ?? 0);
      marg += Number(c.sale?.Margin ?? 0);
    }
    const avg = cust > 0 ? Math.round(saleT / cust) : 0;
    const marginPct = saleT > 0 ? Math.round((marg / saleT) * 1000) / 10 : 0;
    return { buyTotal: buyT, saleTotal: saleT, cust, avg, margin: marg, marginPct };
  });

  const todayStr = todayYmd();

  // 월 KPI (선택월 전체 집계)
  const selMonthKey = monthStr;
  const selSale = (saleMonths ?? []).find((r) => r.SaleDate === selMonthKey);
  const selBuy = (buyMonths ?? []).find((r) => r.SaleDate === selMonthKey);
  const sel = {
    buyTotal: Number(selBuy?.BuyTotal ?? 0),
    saleTotal: Number(selSale?.SaleTotal ?? 0),
    customerCnt: Number(selSale?.CustomerCnt ?? 0),
    margin: Number(selSale?.Margin ?? 0),
    marginPercent: Number(selSale?.MarginPercent ?? 0),
  };
  const maxDay = (selSale as unknown as { maxSaleDateRaw?: string } | undefined)?.maxSaleDateRaw
    || (selBuy as unknown as { maxSaleDateRaw?: string } | undefined)?.maxSaleDateRaw;
  const isCurMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const asOfLabel = (maxDay && /^\d{4}-\d{2}-\d{2}$/.test(maxDay))
    ? ` (${Number(maxDay.slice(5, 7))}월 ${Number(maxDay.slice(8, 10))}일까지)`
    : "";

  return (
    <div className="flex flex-col gap-4">
      {/* 월 navigator */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="px-3 py-1.5 border border-zinc-300 rounded bg-white hover:bg-zinc-50 text-[16px]">‹ 이전달</button>
          <div className="px-4 py-1.5 text-[18px] font-bold text-brand-deep min-w-[140px] text-center">{year}년 {month}월</div>
          <button onClick={goNext} className="px-3 py-1.5 border border-zinc-300 rounded bg-white hover:bg-zinc-50 text-[16px]">다음달 ›</button>
          <button onClick={goThisMonth} className="ml-2 px-3 py-1.5 border border-brand-deep text-brand-deep rounded bg-white hover:bg-sky-50 text-[16px] font-semibold">이번달</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void load(year, month)} disabled={status === "loading"}
            className="px-3 py-1.5 border border-zinc-300 rounded bg-white hover:bg-zinc-50 text-[17px] font-semibold disabled:opacity-50">
            {status === "loading" ? "조회 중..." : "🔄 새로고침"}
          </button>
          <div className="text-[16px] text-zinc-500">
            {status === "success" && lastSuccessAt ? `${new Date(lastSuccessAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ERP 조회` :
             status === "error" ? "조회 실패" :
             status === "loading" ? "..." : "조회 전"}
          </div>
        </div>
      </div>

      {status === "error" && error && (
        <div className={`${schemaMismatch ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-rose-50 border-rose-200 text-rose-700"} border text-[17px] p-3 rounded flex items-center justify-between gap-2`}>
          <div>
            <span className="font-semibold">{schemaMismatch ? "⚠ ERP 응답 비정상 (schema mismatch · 2회 재시도 실패)" : "ERP 조회 실패"}</span>
            <div className="text-[15px] mt-1 opacity-80">{error}</div>
          </div>
          <button onClick={() => void load(year, month)}
            className="shrink-0 px-3 py-1.5 border border-current rounded text-[16px] font-semibold hover:bg-white/50">
            다시 조회
          </button>
        </div>
      )}

      {/* 12개월 매출 테이블 · 반응형 접기 (모바일 기본 접힘 · PC 항상 펼침) */}
      <div className="bg-white border border-zinc-200 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[17px] sm:text-[18px] font-bold text-zinc-800">📊 {overviewYear ?? year}년 월별 매출{isCurMonth ? asOfLabel : ""}</div>
          <div className="flex items-center gap-2">
            <div className="text-[13px] text-zinc-500">{yearOverview.size === 0 ? "조회 중..." : yearOverview.size === 12 ? "완료" : `${yearOverview.size}/12`}</div>
            <button onClick={() => setMobileExpanded((v) => !v)}
              className="md:hidden px-2 py-1 border border-zinc-300 rounded bg-white hover:bg-zinc-50 text-[13px] font-semibold">
              {mobileExpanded ? "접기 ▲" : "펼치기 ▼"}
            </button>
          </div>
        </div>
        {/* 2026-10-05 · 사용자 지시 · 달력 느낌 2×6 카드 그리드 · 분기별 컬러 accent · Linear/Vercel 톤 */}
        {(() => {
          const maxSale = Math.max(0, ...[...yearOverview.values()].map(v => v.saleTotal));
          const QUARTER_TONES: Record<number, { label: string; accent: string; bar: string; text: string; ring: string }> = {
            1: { label: "Q1", accent: "bg-emerald-500", bar: "from-emerald-500/80 to-emerald-400/40", text: "text-emerald-700", ring: "ring-emerald-200/60" },
            2: { label: "Q2", accent: "bg-amber-500",   bar: "from-amber-500/80 to-amber-400/40",     text: "text-amber-700",   ring: "ring-amber-200/60" },
            3: { label: "Q3", accent: "bg-rose-500",    bar: "from-rose-500/80 to-rose-400/40",       text: "text-rose-700",    ring: "ring-rose-200/60" },
            4: { label: "Q4", accent: "bg-indigo-500",  bar: "from-indigo-500/80 to-indigo-400/40",   text: "text-indigo-700",  ring: "ring-indigo-200/60" },
          };
          const renderMonth = (m: number) => {
            const row = yearOverview.get(m);
            const isSelected = m === month;
            const isCurrent = m === now.getMonth() + 1 && year === now.getFullYear();
            const hasData = row && row.saleTotal > 0;
            const ratio = hasData && maxSale > 0 ? row.saleTotal / maxSale : 0;
            const q = Math.ceil(m / 3);
            const qt = QUARTER_TONES[q];
            return (
              <button key={m} onClick={() => setMonth(m)}
                title={`${qt.label} · ${m}월`}
                className={`group relative text-left rounded-xl border bg-white transition-all overflow-hidden h-[108px] flex flex-col ${
                  isSelected
                    ? "border-zinc-900 shadow-lg ring-2 ring-zinc-900/10 -translate-y-0.5"
                    : `border-zinc-200 hover:border-zinc-300 hover:shadow-md hover:-translate-y-0.5 hover:ring-2 hover:${qt.ring}`
                }`}
              >
                {/* 분기 accent · 좌측 세로 bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${qt.accent}`} />
                {/* 매출 bar · 하단 fill */}
                {hasData && (
                  <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t ${qt.bar} opacity-20`}
                       style={{ height: `${Math.round(ratio * 100)}%` }} />
                )}
                {/* 상단 · 월 라벨 + 분기 미니 chip */}
                <div className="relative flex items-start justify-between px-3 pt-2.5 pb-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-[17px] font-extrabold tabular-nums leading-none ${isSelected ? "text-zinc-900" : "text-zinc-800"}`}>{m}</span>
                    <span className={`text-[11px] font-semibold ${isSelected ? "text-zinc-500" : "text-zinc-400"}`}>월</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isCurrent && (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">오늘</span>
                    )}
                    <span className={`text-[9px] font-bold ${qt.text} tracking-wider`}>{qt.label}</span>
                  </div>
                </div>
                {/* 중앙 · 매출 금액 · 큰 숫자 */}
                <div className="relative flex-1 flex items-center justify-center px-3">
                  {row === undefined ? (
                    <span className="text-[13px] text-zinc-300">...</span>
                  ) : !hasData ? (
                    <span className="text-[13px] text-zinc-300">—</span>
                  ) : (
                    <span className={`text-[22px] font-extrabold tabular-nums tracking-tight ${isSelected ? "text-zinc-900" : qt.text}`}>
                      {fmtWonShort(row.saleTotal)}
                    </span>
                  )}
                </div>
                {/* 하단 · subtle 라벨 */}
                <div className="relative px-3 pb-2 text-[10px] font-medium text-zinc-400 text-right">
                  {hasData ? "매출" : ""}
                </div>
              </button>
            );
          };
          return (
            <div className={`flex flex-col gap-2 ${mobileExpanded ? "" : "hidden md:flex"}`}>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map(renderMonth)}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[7, 8, 9, 10, 11, 12].map(renderMonth)}
              </div>
              {/* 분기 legend */}
              <div className="hidden sm:flex items-center justify-end gap-4 pt-2 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Q1 봄</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Q2 여름</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />Q3 가을</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" />Q4 겨울</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 선택월 상세 · 미니멀 · 텍스트 위주 */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5">
        <div className="flex items-baseline gap-2 mb-4 flex-wrap">
          <span className="text-[20px] font-bold text-zinc-900">{year}년 {month}월</span>
          {isCurMonth && <span className="text-[13px] text-zinc-500">· 이번달{asOfLabel}</span>}
        </div>
        {!show ? (
          <div className="text-center py-8 text-zinc-400 text-[15px]">
            {status === "idle" || status === "loading" ? "조회 중..." : status === "error" ? "조회 실패" : "데이터 없음"}
          </div>
        ) : !selSale && !selBuy ? (
          <div className="text-center py-8 text-zinc-400 text-[15px]">선택 월 데이터 없음</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5">
            {(() => {
              const avg = sel.customerCnt > 0 ? sel.saleTotal / sel.customerCnt : 0;
              const items: Array<{ label: string; value: string }> = [
                { label: "매출총액", value: fmtWon(sel.saleTotal) },
                { label: "객단가",   value: fmtWon(avg) },
                { label: "매입총액", value: fmtWon(sel.buyTotal) },
                { label: "매출이익", value: fmtWon(sel.margin) },
                { label: "마진율",   value: `${sel.marginPercent.toFixed(1)}%` },
                { label: "방문객수", value: sel.customerCnt.toLocaleString() + "명" },
              ];
              return items.map((it) => (
                <div key={it.label}>
                  <div className="text-[13px] text-zinc-500 mb-1">{it.label}</div>
                  <div className="text-[20px] font-bold text-zinc-900 tabular-nums">{it.value}</div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* 2026-10-05 · 선택월 KPI 는 12개월 cell 안 drop-down 으로 통합 · 별도 섹션 제거 */}
      {false && (
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <div className="text-[16px] font-bold text-zinc-700 mb-3">
          📊 {year}년 {month}월 {isCurMonth ? "누계" : "집계"}{asOfLabel}
        </div>
        {!show ? (
          <div className="text-center py-6 text-zinc-400 text-[16px]">
            {status === "idle" || status === "loading" ? "조회 중..." : status === "error" ? "조회 실패" : "데이터 없음"}
          </div>
        ) : !selSale && !selBuy ? (
          <div className="text-center py-6 text-zinc-400 text-[16px]">데이터 없음 (ERP 응답에 해당 월 없음)</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <KpiBox label="매입총액" value={fmtWon(sel.buyTotal)} />
            <KpiBox label="매출총액" value={fmtWon(sel.saleTotal)} />
            <KpiBox label="매출이익" value={fmtWon(sel.margin)} />
            <KpiBox label="마진율" value={`${sel.marginPercent.toFixed(1)}%`} />
            <KpiBox label="고객수" value={sel.customerCnt.toLocaleString() + "명"} />
          </div>
        )}
      </div>
      )}

      {/* 달력 grid */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {/* 요일 header */}
        <div className="grid grid-cols-7 bg-zinc-50 border-b border-zinc-200">
          {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
            <div key={w} className={`px-2 py-2 text-center text-[15px] font-semibold border-r border-zinc-200 last:border-r-0 ${
              i === 0 ? "text-rose-600" : i === 6 ? "text-sky-600" : "text-zinc-700"
            }`}>{w}</div>
          ))}
        </div>

        {/* 각 주 */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-zinc-200 last:border-b-0">
            {week.map((cell, ci) => {
              const isSunday = ci === 0;
              const ws = isSunday && show ? weekSummaries[wi] : null;
              const hasWeek = !!ws && (ws.buyTotal + ws.saleTotal > 0);

              if (!cell) {
                return (
                  <div key={ci} className="min-h-[140px] bg-zinc-50/50 border-r border-zinc-100 last:border-r-0 p-2">
                    {hasWeek && ws && <WeekSubtotalBlock ws={ws} />}
                  </div>
                );
              }
              const isToday = cell.dateStr === todayStr;
              return (
                <div key={ci} className={`min-h-[140px] p-2 border-r border-zinc-100 last:border-r-0 ${isToday ? "bg-amber-50" : "bg-white"}`}>
                  <div className={`text-[15px] font-bold ${isSunday ? "text-rose-600" : ci === 6 ? "text-sky-600" : "text-zinc-700"} ${isToday ? "text-amber-700" : ""}`}>
                    {cell.day}{isToday && <span className="ml-1 text-[13px] text-amber-700">● 오늘</span>}
                  </div>
                  <div className="mt-1 space-y-[2px] text-[14px]">
                    {cell.buy && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-zinc-500">매입</span>
                        <span className="tabular-nums">{fmtNum(Number(cell.buy.BuyTotal ?? 0))}</span>
                      </div>
                    )}
                    {cell.sale && (
                      <>
                        <div className="flex justify-between items-baseline">
                          <span className="text-zinc-500">매출</span>
                          <span className="tabular-nums font-semibold text-zinc-800">{fmtNum(Number(cell.sale.SaleTotal ?? 0))}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-zinc-500">객수/단가</span>
                          <span className="tabular-nums">{Number(cell.sale.CustomerCnt ?? 0).toLocaleString()}/{fmtNum(Number(cell.sale.AvgPerCustomer ?? 0))}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="text-zinc-500">마진</span>
                          <span className="tabular-nums">{fmtNum(Number(cell.sale.Margin ?? 0))}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {/* 일요일 셀 안 주간 subtotal */}
                  {hasWeek && ws && <WeekSubtotalBlock ws={ws} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

const WeekSubtotalBlock: React.FC<{ ws: { buyTotal: number; saleTotal: number; cust: number; avg: number; margin: number; marginPct: number } }> = ({ ws }) => (
  <div className="mt-2 pt-2 border-t-2 border-rose-200 space-y-[2px] text-[13px] bg-rose-50/60 rounded px-1 py-1">
    <div className="text-rose-700 font-semibold">[주간 합계]</div>
    <div className="flex justify-between items-baseline"><span className="text-zinc-600">매입</span><span className="tabular-nums text-zinc-800">{fmtNum(ws.buyTotal)}</span></div>
    <div className="flex justify-between items-baseline"><span className="text-zinc-600">매출</span><span className="tabular-nums font-semibold text-zinc-900">{fmtNum(ws.saleTotal)}</span></div>
    <div className="flex justify-between items-baseline"><span className="text-zinc-600">객수/단가</span><span className="tabular-nums text-zinc-800">{ws.cust.toLocaleString()}/{fmtNum(ws.avg)}</span></div>
    <div className="flex justify-between items-baseline"><span className="text-zinc-600">마진</span><span className="tabular-nums text-zinc-800">{fmtNum(ws.margin)}</span></div>
  </div>
);

export default RevenuePage;
