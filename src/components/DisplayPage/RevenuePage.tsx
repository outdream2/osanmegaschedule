// src/components/DisplayPage/RevenuePage.tsx
// 2026-10-05 · 매장 > 매출 페이지 (ERP Sales_Days_TimeReport + Statistics_Month_DashBoard)
//   · 상단: 오늘 TODAY KPI (오늘 날짜 데이터만 집계)
//   · 탭 1: 시간대별 매출 (날짜별 column group · 각 날짜 안 ERP UI 와 동일 column + 누적)
//   · 탭 2: 월별 매출 (7 column 달력 · 각 날짜 셀 매입/매출/객수단가/마진 · 주간 subtotal)
//   · ERP 가 제공하는 값은 그대로 사용 · ERP 미제공 집계(누적/주간)만 WEB 계산
//   · ERROR != ZERO · 조회 전 "-" · 실패 "-" + 오류 · 성공시 실제 값

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/apiClient";
import { Modal } from "../common/Modal";
// 2026-10-09 · UI-4 · overview 상단 공통 모듈
import { OverviewHero, OverviewInnerTabs, type OverviewInnerTab } from "./overviews/OverviewHeader";
import { CalendarDays } from "lucide-react";
import { LineChart, Line, Bar, ComposedChart, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { shortDateWithDow } from "../../lib/dateFormat";
// 2026-10-07 · HourlyReportTab 조회기간 월 멀티선택 (STANDARD)
import { useMonthFilter } from "../../hooks/useMonthFilter";
import { MonthToggleSelector, dateRangesFromMonths } from "../common/MonthToggleSelector";
// 2026-10-07 · DayDetailModal · 날짜별 상품 ERP 실시간 조회 · 상비약/일반약 분류 필터
import { CLASS_FILTER_LABEL, type ClassFilter, type ProductClass } from "../../utils/productClassify";

type RevenueTab = "hourly" | "monthly";
// 2026-10-09 · 사용자 지시 · 판매·매출현황 페이지 상단 탭 (매출 | 판매)
type TopTab = "revenue" | "sales";
// 2026-10-10 · #11-P1 · 판매탭 완전 신규 설계 (C안 · 2026 트렌드)
//   · 이전: SalesPanel (OrderManagePage statistics) lazy embed
//   · 이후: SalesTab 신규 컴포넌트 (Insight Card + KPI 4-strip + Area + 베스트셀러 Top10)
const SalesTab = React.lazy(() => import("./RevenuePage.SalesTab").then(m => ({ default: m.SalesTab })));
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
// 2026-10-10 · #12 · 메뉴 쪼개기 · initialTab prop 추가
//   · 매출현황 메뉴 (subTab=revenue) → initialTab="revenue"
//   · 판매현황 메뉴 (subTab=sales) → initialTab="sales"
//   · 상단 [매출|판매] 탭은 유지 (사용자 전환 가능 · 이후 전용 페이지 분리 시 제거)
export interface RevenuePageProps { initialTab?: "revenue" | "sales"; }
export const RevenuePage: React.FC<RevenuePageProps> = ({ initialTab = "revenue" }) => {
  // 2026-10-09 · 사용자 지시 · 판매·매출현황 상단 탭 (매출 | 판매) · 홈 랜딩 톤
  // 2026-10-10 · #12 · 메뉴에서 받은 initialTab 으로 default
  const [topTab, setTopTab] = useState<TopTab>(initialTab);
  const [tab, setTab] = useState<RevenueTab>("hourly");
  return (
    // 2026-10-10 · 사용자 "아직도 달라 · 똑같이 · 통일성" 3차 통일
    //   · 발주반품/매입재고/재고진열 wrapper 공식 100% 복제 · flex-1 제거
    //   · 다른 overview 들은 flex-1 없이 상위 main 의 min-h-0 flex-col 안에서 자연 작동
    <div className="flex flex-col gap-3 md:gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      {/* 2026-10-10 · #12 · 메뉴 쪼개진 후 상단 inner tab 제거 (사용자 지시 "매출현황메뉴에서는 매출현황탭 판매현황탭 없애야지") · OverviewHero title 만 initialTab 따라 분기 */}
      <OverviewHero
        tone={initialTab === "sales" ? "rose" : "emerald"}
        title={initialTab === "sales" ? "판매현황" : "매출현황"}
        description={initialTab === "sales" ? "구역별 · 제품별 · 공급사별 판매" : "시간대별 · 월별 매출"}
      />

      {topTab === "revenue" ? (
        /* 2026-10-10 · pill + content 를 하나의 섹션으로 wrap · wrapper gap-3 md:gap-4 과 발주반품현황 리듬 동일화
            · 내부 간격 gap-2 (pill ~ content tight · 사용자 "아래 여백 줄여") */
        <div className="flex-1 flex flex-col min-h-0 gap-2 w-full min-w-0 max-w-full">
          {/* 매출 하위 탭 · pill 유지 (사용자 "매출 하위 탭은 손대지마") */}
          <div className="px-4 shrink-0 w-full min-w-0 max-w-full">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {([
                { k: "hourly" as const,  label: "시간대별" },
                { k: "monthly" as const, label: "월별" },
              ]).map((t) => (
                <button key={t.k} type="button" onClick={() => setTab(t.k)}
                  className={`px-3 py-1.5 rounded-md text-[13px] md:text-[14px] font-medium transition-colors ${
                    tab === t.k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4 w-full min-w-0 max-w-full"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="w-full min-w-0 max-w-full">
              {tab === "hourly" ? <HourlyReportTab /> : <MonthlyReportTab />}
            </div>
          </div>
        </div>
      ) : (
        /* 판매 탭 · 2026-10-10 · #11-P1 · 신규 SalesTab (Insight+KPI+Area+Top10) */
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <React.Suspense fallback={<div className="flex-1 flex items-center justify-center py-16 text-[14px] text-slate-500">판매 데이터 로딩 중...</div>}>
            <SalesTab />
          </React.Suspense>
        </div>
      )}
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
  // 2026-10-06 · 사용자 지시 · 시간대별 chart metric 탭 (매출/객단가/마진율/고객수)
  //   · 같은 dataset 재사용 · tab 변경 시 API 재호출 X · series 만 전환
  //   · 고객수 = Bar · 나머지 = Line (사용자 지시)
  //   · 날짜 여러개 선택 시 각 slot 평균 1 series (overlay 복잡성 피함)
  //   · 주말 포함/제외 체크박스 (default: 포함)
  type ChartMetric = "revenue" | "avg-order" | "margin-rate" | "customers";
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  // 2026-10-06 · 사용자 지시 · chart 상단 탭 · 시간대별 추이 / 일별 추이 / 요일별 추이
  //   · hour · X=09~22시 · 날짜별 overlay
  //   · day · X=1~31일 · 월별 overlay
  //   · weekday · X=09~22시 · 선택 요일 날짜 overlay (요일 선택 radio)
  type ChartAxis = "hour" | "day" | "week" | "weekday";
  const [chartAxis, setChartAxis] = useState<ChartAxis>("hour");
  // 2026-10-06 · 사용자 지시 · 요일 멀티선택 (0=일 ~ 6=토) · default 월
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(() => new Set([1]));
  const toggleWeekday = (w: number) => setSelectedWeekdays((prev) => {
    const next = new Set(prev);
    if (next.has(w)) next.delete(w); else next.add(w);
    return next;
  });
  const [includeWeekend, setIncludeWeekend] = useState<boolean>(true);
  // 2026-10-06 · 사용자 지시 · 주말만 체크박스 · 체크 시 주말 날짜만 표시 (주말 포함과 상호 배타)
  const [weekendOnly, setWeekendOnly] = useState<boolean>(false);
  // 2026-10-10 · 사용자 지시 · 일별 추이 요일 기준 정렬
  //   · X축=일(1~31) 유지 · 다른 월 데이터를 현재월 요일에 맞춰 좌 shift
  //   · 예: 9월 첫째주 토일과 10월 첫째주 토일이 같은 X 위치에 겹침
  //   · chartAxis==="day" 에서만 노출
  const [weekdayAlign, setWeekdayAlign] = useState<boolean>(false);
  // 2026-10-07 · 공휴일 포함 체크 (session only · default=포함 · GET /api/holidays?year, is_holiday=true 만)
  //   · 대체공휴일 포함 · data.go.kr 특일정보 API 가 isHoliday=Y 로 반환 (예: "대체공휴일(삼일절)")
  const [includeHoliday, setIncludeHoliday] = useState<boolean>(true);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(() => new Set());
  // 2026-10-07 · 일별 추이 x축 공휴일명 표시 · date → name lookup
  const [holidayNameMap, setHolidayNameMap] = useState<Map<string, string>>(() => new Map());
  const [hourlyRows, setHourlyRows] = useState<HourlyRow[] | null>(null);
  const [hourlyStatus, setHourlyStatus] = useState<FetchStatus>("idle");
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const [hourlySchemaMismatch, setHourlySchemaMismatch] = useState<boolean>(false);
  const [hourlyLastSuccessAt, setHourlyLastSuccessAt] = useState<string | null>(null);
  const [hourlyFromDate, setHourlyFromDate] = useState<string>(() => todayYmd());
  const [hourlyToDate, setHourlyToDate] = useState<string>(() => todayYmd());
  // 2026-10-07 · 월 멀티선택 (STANDARD · useMonthFilter) · initial [] = date 모드 · toggle 시 멀티 fetch · 비연속 지원
  const { selectedMonths, setSelectedMonths } = useMonthFilter({ initial: [] });
  // 2026-10-05 · 모바일 반응형 · 날짜별 세로 접이식 · 오늘만 기본 펼침
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set([todayYmd()]));
  const toggleDate = (date: string) => setExpandedDates((prev) => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });
  // 2026-10-06 · 사용자 지시 · 일별 추이 축 · 월별 아코디언 · 이번 달 default 펼침
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set([todayYmd().slice(0, 7)]));
  const toggleMonth = (monthKey: string) => setExpandedMonths((prev) => {
    const next = new Set(prev);
    if (next.has(monthKey)) next.delete(monthKey); else next.add(monthKey);
    return next;
  });

  // HOURLY loader · 2026-10-07 · ranges[] Promise.all 병렬 fetch · ranges.length===1 → 단일 범위 동작
  const loadHourlyRanges = useCallback(async (ranges: Array<{ startDate: string; endDate: string }>) => {
    if (ranges.length === 0) return;
    setHourlyStatus("loading"); setHourlyError(null); setHourlySchemaMismatch(false);
    try {
      // 2026-10-07 hotfix · ERP working condition END=START+1 (Fiddler 확정 · TodayRevenueKpiPanel 와 동일 contract)
      //   · from===to (same-day) 요청 시 ERP SOAP 가 HTTP 500 반환
      //   · dead-code 였던 addOneDay helper 를 요청 송신 시점에만 적용 · client 측 dataRows 필터는 rng.endDate 그대로 사용 (visible 날짜 shift 없음)
      const results = await Promise.all(
        ranges.map(rng => api.get<HourlyApiResponse>(`/api/erp/sale-hourly-report?from=${rng.startDate}&to=${addOneDay(rng.endDate)}`))
      );
      const merged: HourlyRow[] = [];
      for (const r of results) {
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
        if (r.data.rows) merged.push(...r.data.rows);
      }
      setHourlyRows(merged);
      setHourlyLastSuccessAt(new Date().toISOString());
      setHourlyStatus("success");
    } catch (e) {
      setHourlyError((e as Error).message);
      setHourlyStatus("error");
      setHourlyRows(null);
    }
  }, []);

  // selectedMonths 비어있으면 from/to · 아니면 월 멀티선택 ranges
  const activeRanges = useMemo((): Array<{ startDate: string; endDate: string }> =>
    selectedMonths.length > 0 ? dateRangesFromMonths(selectedMonths) : [{ startDate: hourlyFromDate, endDate: hourlyToDate }],
    [selectedMonths, hourlyFromDate, hourlyToDate]);

  useEffect(() => { void loadHourlyRanges(activeRanges); }, [loadHourlyRanges, activeRanges]);

  // 2026-10-07 · 공휴일 fetch · 활성 범위 연도별 · 서버 24h cache · API 실패 silent skip
  //   · 2026-10-08 · 서버 fetchHolidays 에서 고정 공휴일 fallback 처리 (API 누락 방어)
  useEffect(() => {
    let cancelled = false;
    const years = new Set<number>();
    for (const r of activeRanges) {
      const sy = Number((r.startDate ?? "").slice(0, 4));
      const ey = Number((r.endDate ?? "").slice(0, 4));
      if (Number.isFinite(sy)) years.add(sy);
      if (Number.isFinite(ey)) years.add(ey);
    }
    if (years.size === 0) { setHolidaySet(new Set()); setHolidayNameMap(new Map()); return; }
    (async () => {
      const dates = new Set<string>();
      const nameMap = new Map<string, string>();
      for (const y of years) {
        try {
          const resp = await api.get<{ holidays?: Array<{ date: string; name?: string; is_holiday: boolean }> }>(`/api/holidays?year=${y}`);
          for (const h of resp.data.holidays ?? []) {
            if (h.is_holiday && typeof h.date === "string") {
              dates.add(h.date);
              if (typeof h.name === "string" && h.name) nameMap.set(h.date, h.name);
            }
          }
        } catch { /* HOLIDAY_API_KEY 미설정 등 · 해당 연도 skip */ }
      }
      if (!cancelled) { setHolidaySet(dates); setHolidayNameMap(nameMap); }
    })();
    return () => { cancelled = true; };
  }, [activeRanges]);

  const onResetToday = () => {
    const y = todayYmd();
    setSelectedMonths([]); // 월 멀티선택 해제
    setHourlyFromDate(y); setHourlyToDate(y);
  };

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
  // 2026-10-07 · 월 멀티선택 지원 · activeRanges 중 어느 한 범위에 속해야 포함 (비연속 월 지원)
  const dataRows = useMemo(
    () => (rows ?? []).filter((r) => activeRanges.some(rng => r.SaleDate >= rng.startDate && r.SaleDate <= rng.endDate)),
    [rows, activeRanges],
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

  // 2026-10-05 · 표시 순서: 최신일 먼저 (PC 좌측, 모바일 상단)
  //   · 집계용 dateData 는 ascending 유지 (라벨 "오래된 ~ 최신" 자연 순서)
  const displayDateData = useMemo(() => [...dateData].reverse(), [dateData]);

  // 오늘만 KPI
  const todayBlock = dateData.find((d) => d.date === today);
  const totalSale = todayBlock?.totalSale ?? 0;
  const totalMargin = todayBlock?.totalMargin ?? 0;
  const totalCust = todayBlock?.totalCust ?? 0;
  const marginRate = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0;
  const curSlot = String(curHour).padStart(2, "0");

  return (
    // 2026-10-06 · 사용자 지시 · 반응형 · min-w-0 보장 · 오른쪽 잘림 방지
    <div className="flex flex-col gap-4 w-full min-w-0 max-w-full">
      {/* 상단 TODAY KPI (HOURLY 전용 · 오늘 데이터만) · 미묘 톤 · 매출 색 포인트 */}
      <div className="bg-white border border-zinc-200 rounded-xl p-3 md:p-4">
        <div className="text-[13px] md:text-[14px] text-zinc-500 font-semibold mb-2">오늘 {today} {curTimeLabel} 기준</div>
        <div className="flex items-stretch divide-x divide-zinc-100">
          {/* 매출 (color point) */}
          <div className="flex-1 pr-3 relative min-w-0">
            <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-brand-deep rounded-r-full" aria-hidden />
            <div className="pl-2">
              <div className="text-[13px] md:text-[14px] text-zinc-500 font-semibold mb-0.5">누적 매출</div>
              <div className="text-[17px] md:text-[20px] font-bold tabular-nums text-brand-deep leading-tight truncate">
                {showTopKpi ? fmtWon(todaySale) : "-"}
              </div>
            </div>
          </div>
          {/* 객단가 */}
          <div className="flex-1 px-3 min-w-0">
            <div className="text-[13px] md:text-[14px] text-zinc-500 font-semibold mb-0.5">객단가</div>
            <div className="text-[17px] md:text-[20px] font-bold tabular-nums text-ink leading-tight truncate">
              {showTopKpi && todayCust > 0 ? fmtWon(todaySale / todayCust) : "-"}
            </div>
          </div>
          {/* 고객수 */}
          <div className="flex-1 pl-3 min-w-0">
            <div className="text-[13px] md:text-[14px] text-zinc-500 font-semibold mb-0.5">누적 고객수</div>
            <div className="text-[17px] md:text-[20px] font-bold tabular-nums text-ink leading-tight truncate">
              {showTopKpi ? todayCust.toLocaleString() + "명" : "-"}
            </div>
          </div>
        </div>
      </div>

      {/* 날짜 선택 UI · HOURLY · 2026-10-07 · 월 멀티선택 추가 (STANDARD) */}
      <div className="bg-white border border-zinc-200 rounded-lg p-3 flex items-center gap-2 flex-wrap">
        <span className="text-[16px] font-semibold text-zinc-700">조회 기간</span>
        <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} ariaLabel="월 선택 (멀티)" />
        <span className="text-zinc-300 mx-1">│</span>
        <input type="date" value={fromDate} disabled={selectedMonths.length > 0}
          onChange={(e) => { setSelectedMonths([]); setHourlyFromDate(e.target.value); }}
          className="px-3 py-1.5 border border-zinc-300 rounded text-[16px] disabled:bg-zinc-100 disabled:text-zinc-400" />
        <span className="text-zinc-400">~</span>
        <input type="date" value={toDate} disabled={selectedMonths.length > 0}
          onChange={(e) => { setSelectedMonths([]); setHourlyToDate(e.target.value); }}
          className="px-3 py-1.5 border border-zinc-300 rounded text-[16px] disabled:bg-zinc-100 disabled:text-zinc-400" />
        <button onClick={() => void loadHourlyRanges(activeRanges)} disabled={status === "loading"}
          className="px-4 py-1.5 bg-brand-deep text-white rounded hover:bg-brand-deep/90 text-[16px] font-bold disabled:opacity-50">
          {status === "loading" ? "조회 중..." : "🔍 조회"}
        </button>
        <button onClick={onResetToday}
          className="px-3 py-1.5 border border-brand-deep text-brand-deep rounded bg-white hover:bg-sky-50 text-[15px] font-semibold">
          오늘로
        </button>
        <div className="flex-1" />
        <div className="text-[15px] font-semibold text-zinc-700">
          {selectedMonths.length > 0 && (
            <span className="text-zinc-500 mr-2">{selectedMonths.length}개월 선택 · </span>
          )}
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
          <button onClick={() => void loadHourlyRanges(activeRanges)}
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

      {/* 2026-10-06 · 사용자 지시 · 조회기간 전체 집계 KPI 4개 · 깔끔 텍스트 + 미묘 컬러 포인트 (좌측 strip)
          · 누적매출총액 · 누적매출이익 · 평균마진율(가중) · 평균고객수(일 평균) */}
      {show && displayDateData.length > 0 && (() => {
        const sumSale = displayDateData.reduce((s, d) => s + d.totalSale, 0);
        const sumMargin = displayDateData.reduce((s, d) => s + d.totalMargin, 0);
        const sumCust = displayDateData.reduce((s, d) => s + d.totalCust, 0);
        const avgMarginRate = sumSale > 0 ? (sumMargin / sumSale) * 100 : 0;
        const avgCust = displayDateData.length > 0 ? sumCust / displayDateData.length : 0;
        const nDays = displayDateData.length;
        const items: Array<{ label: string; value: string; accent: string }> = [
          { label: `${nDays}일 누적 매출총액`, value: fmtWon(sumSale), accent: "bg-brand-deep" },
          { label: `${nDays}일 누적 매출이익`, value: fmtWon(sumMargin), accent: "bg-emerald-500" },
          { label: `${nDays}일 평균 마진율`, value: `${avgMarginRate.toFixed(1)}%`, accent: "bg-amber-500" },
          { label: `${nDays}일 일평균 고객수`, value: `${Math.round(avgCust).toLocaleString()}명`, accent: "bg-sky-500" },
        ];
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            {items.map((it) => (
              <div key={it.label} className="bg-white border border-zinc-200 rounded-xl px-3 py-2.5 min-w-0 shadow-[0_1px_2px_rgba(10,46,74,0.04)] relative overflow-hidden">
                <span className={`absolute left-0 top-2 bottom-2 w-[3px] ${it.accent} rounded-r-full`} aria-hidden />
                <div className="pl-2.5 min-w-0">
                  <div className="text-[12px] md:text-[13px] text-zinc-500 font-semibold mb-0.5 truncate">{it.label}</div>
                  <div className="text-[16px] md:text-[19px] font-bold tabular-nums text-ink leading-tight truncate">{it.value}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 2026-10-06 · 사용자 지시 · 상단 축 탭 (시간대별 추이 / 일별 추이) · 구성 동일 · 데이터 축만 다름
          · 시간대별: X=09~22시 · series=날짜별 overlay · 주말 체크박스 적용
          · 일별 추이: X=1~31일 · series=월별 overlay · 주말 체크박스 적용 */}
      {show && displayDateData.length > 0 && (() => {
        // 요일 필터 · 주말(토=6, 일=0) 포함 여부
        const isWeekend = (dateStr: string): boolean => {
          const [y, m, d] = dateStr.split("-").map(Number);
          if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
          const dow = new Date(y, m - 1, d).getDay();
          return dow === 0 || dow === 6;
        };
        // 2026-10-06 · 사용자 지시 · 축별 effDateData filter
        //   · hour · day · includeWeekend 체크 적용
        //   · weekday · selectedWeekdays 멀티선택 적용 (요일 getDay() 매칭)
        const getDayOfWeek = (dateStr: string): number => {
          const [y, m, d] = dateStr.split("-").map(Number);
          if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return -1;
          return new Date(y, m - 1, d).getDay();
        };
        // 2026-10-07 · 공휴일 제외 필터 (모든 축 적용 · ON 시만)
        // 2026-10-09 · fix · 주말만 + 공휴일 포함 조합 · OR 로직 (주말 OR 공휴일)
        //   · 이전 · AND · 주말만이 평일 공휴일 제외 → 공휴일 포함이 복구 불가
        //   · 지금 · weekendOnly 시 includeHoliday 이면 공휴일도 함께 포함
        const effDateDataBase = chartAxis === "weekday"
          ? displayDateData.filter((d) => selectedWeekdays.has(getDayOfWeek(d.date)))
          : weekendOnly
            ? displayDateData.filter((d) => isWeekend(d.date) || (includeHoliday && holidaySet.has(d.date)))
            : (includeWeekend ? displayDateData : displayDateData.filter((d) => !isWeekend(d.date)));
        const effDateData = !includeHoliday ? effDateDataBase.filter((d) => !holidaySet.has(d.date)) : effDateDataBase;
        // 2026-10-06 · effDateData 빈 경우 chart 영역만 메시지 (상단 탭/메트릭 탭 유지)
        const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
        const emptyChartMsg = chartAxis === "weekday"
          ? `선택 요일(${[...selectedWeekdays].sort().map((w) => DOW_KO[w]).join("·") || "없음"}) 날짜 없음`
          : weekendOnly
            ? "주말만 선택 시 조회 기간 내 주말 날짜 없음"
            : !includeWeekend
              ? "주말 제외 시 조회 기간 내 평일 날짜 없음"
              : !includeHoliday
                ? "공휴일 제외 시 조회 기간 내 날짜 없음"
                : "표시할 날짜 없음";
        const isEffEmpty = effDateData.length === 0;
        // 2026-10-06 · 사용자 지시 · 요일별 추이 · 각 날짜 W1/W2/.. 주 번호 라벨 (같은 요일 내 오름차순 index+1)
        const weekLabelMap = new Map<string, string>();
        if (chartAxis === "weekday") {
          const byDow = new Map<number, string[]>();
          for (const d of effDateData) {
            const dow = getDayOfWeek(d.date);
            if (!byDow.has(dow)) byDow.set(dow, []);
            byDow.get(dow)!.push(d.date);
          }
          for (const arr of byDow.values()) {
            arr.sort((a, b) => a.localeCompare(b));
            arr.forEach((date, idx) => weekLabelMap.set(date, `W${idx + 1}`));
          }
        }
        // 2026-10-06 · 사용자 지시 · X축 영업시간 고정 (09~22시 · 14 slot) · 화면 폭 responsive
        //   · 데이터에 등장하는 slot 과 영업시간 union · 양쪽 모두 커버
        const BUSINESS_HOURS = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];
        const unionSlotsSet = new Set<string>([...BUSINESS_HOURS, ...allSlots]);
        const fixedSlots = [...unionSlotsSet].sort();
        // 2026-10-06 · 사용자 지시 · 현재 시간 이후 slot = 데이터 없음 (null) · 0 으로 처리 X
        const nowHour = new Date().getHours();
        // slot 별 각 날짜 series value 계산 · metric 별
        //   오늘 Line · 현재 시간 이후 null (끊김)
        const todayInEffData = effDateData.some((d) => d.date === today);
        const buildSeriesData = (metric: ChartMetric) => {
          return fixedSlots.map((slot) => {
            const point: Record<string, number | string | null> = { time: slot };
            const slotHour = parseInt(slot, 10);
            const isFutureSlot = todayInEffData && Number.isFinite(slotHour) && slotHour > nowHour;
            for (const d of effDateData) {
              const r = d.rowMap.get(slot);
              if (!r) { point[d.date] = null; continue; }
              const sale = Number(r.SaleTotal ?? 0);
              const cust = Number(r.CustomerCnt ?? 0);
              const marg = Number(r.Margin ?? 0);
              let v: number | null = null;
              if (metric === "revenue") v = sale;
              else if (metric === "avg-order") v = cust > 0 ? Math.round(sale / cust) : null;
              else if (metric === "margin-rate") v = sale > 0 ? Math.round((marg / sale) * 1000) / 10 : null;
              else if (metric === "customers") v = cust;
              // 오늘 날짜 · 현재 시간 이후 slot 은 데이터 없는 것으로 처리 (null)
              if (d.date === today && isFutureSlot) {
                point[d.date] = null;
              } else {
                point[d.date] = v;
              }
            }
            return point;
          });
        };
        const TAB_LABEL: Record<ChartMetric, string> = {
          "revenue": "매출", "avg-order": "객단가", "margin-rate": "마진율", "customers": "고객수",
        };
        // 날짜별 색상 · 오늘 날짜는 rose (강조) · 과거 날짜는 다양한 색
        const PAST_COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#0ea5e9"];
        return (
          <div className="bg-white border border-zinc-200 rounded-lg p-3 md:p-4 w-full min-w-0 max-w-full overflow-hidden">
            {/* 2026-10-06 · 사용자 지시 · 최상단 축 탭 (시간대별 / 일별 / 요일별) · 메트릭 탭 위 */}
            <div className="flex items-center gap-1 mb-2 bg-zinc-100 border border-zinc-200 rounded-lg p-0.5 w-fit">
              {(["hour", "day", "week", "weekday"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChartAxis(k)}
                  className={`px-3.5 py-1 text-[14px] font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${
                    chartAxis === k ? "bg-brand-deep text-white shadow-sm" : "text-zinc-600 hover:bg-white"
                  }`}
                >
                  {k === "hour" ? "시간대별 추이" : k === "day" ? "일별 추이" : k === "week" ? "주별 추이" : "요일별 추이"}
                </button>
              ))}
            </div>
            {/* 2026-10-06 · 사용자 지시 · 메트릭 탭 + 주말 체크 (hour/day) · 요일 멀티선택 (weekday) */}
            <div className="flex items-center justify-start gap-3 mb-2 flex-wrap">
              <div className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 rounded-lg p-0.5">
                {(["revenue", "avg-order", "margin-rate", "customers"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setChartMetric(k)}
                    className={`px-3 py-1 text-[13px] font-semibold rounded-md transition cursor-pointer whitespace-nowrap ${
                      chartMetric === k ? "bg-brand-deep text-white shadow-sm" : "text-zinc-600 hover:bg-white"
                    }`}
                  >
                    {TAB_LABEL[k]}
                  </button>
                ))}
              </div>
              {/* 2026-10-07 · 사용자 지시 · 체크박스 순서 · [주말 포함] [주말만] [공휴일 포함] (공휴일 포함을 주말만 옆으로 이동) */}
              {chartAxis !== "weekday" ? (
                <>
                  {/* 2026-10-10 · 사용자 지시 · 일별 추이 전용 · 요일 기준 shift (주말 포함 앞 배치) */}
                  {chartAxis === "day" && (
                    <label className={`inline-flex items-center gap-1.5 text-[13px] cursor-pointer select-none ${weekdayAlign ? "text-indigo-700 font-semibold" : "text-zinc-700"}`}>
                      <input
                        type="checkbox"
                        checked={weekdayAlign}
                        onChange={(e) => setWeekdayAlign(e.target.checked)}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                      />
                      <span>요일 기준</span>
                    </label>
                  )}
                  <label className={`inline-flex items-center gap-1.5 text-[13px] cursor-pointer select-none ${weekendOnly ? "text-zinc-400" : "text-zinc-700"}`}>
                    <input
                      type="checkbox"
                      checked={includeWeekend && !weekendOnly}
                      disabled={weekendOnly}
                      onChange={(e) => setIncludeWeekend(e.target.checked)}
                      className="w-4 h-4 accent-brand-deep cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span>주말 포함</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[13px] text-zinc-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={weekendOnly}
                      onChange={(e) => setWeekendOnly(e.target.checked)}
                      className="w-4 h-4 accent-rose-500 cursor-pointer"
                    />
                    <span>주말만</span>
                  </label>
                </>
              ) : (
                <div className="inline-flex items-center gap-1 bg-zinc-100 border border-zinc-200 rounded-lg p-0.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((w) => {
                    const label = ["일", "월", "화", "수", "목", "금", "토"][w];
                    const isSel = selectedWeekdays.has(w);
                    const isWknd = w === 0 || w === 6;
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => toggleWeekday(w)}
                        className={`px-2.5 py-1 text-[13px] font-semibold rounded-md transition cursor-pointer min-w-[28px] ${
                          isSel ? "bg-brand-deep text-white shadow-sm" : `${isWknd ? (w === 0 ? "text-rose-600" : "text-sky-600") : "text-zinc-600"} hover:bg-white`
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {/* 2026-10-07 · 사용자 지시 · 공휴일 포함 체크박스 · 주말만 (또는 요일 선택) 옆에 배치
                  2026-10-08 · 사용자 지시 · 활성 범위 내 공휴일 갯수 표시 (예: "공휴일 포함(2일)") */}
              <label className={`inline-flex items-center gap-1.5 text-[13px] cursor-pointer select-none ${includeHoliday ? "text-red-700 font-semibold" : "text-zinc-700"}`}>
                <input
                  type="checkbox"
                  checked={includeHoliday}
                  onChange={(e) => setIncludeHoliday(e.target.checked)}
                  className="w-4 h-4 accent-red-600 cursor-pointer"
                />
                <span>
                  공휴일 포함
                  {(() => {
                    let count = 0;
                    for (const [date] of holidayNameMap) {
                      if (activeRanges.some((r) => date >= r.startDate && date <= r.endDate)) count++;
                    }
                    return count > 0 ? <span className="tabular-nums">({count}일)</span> : null;
                  })()}
                </span>
              </label>
            </div>
            {/* 2026-10-08 · 사용자 지시 · 공휴일 포함 체크 시 · 활성 범위 내 공휴일 상세 리스트 (예: 10/3 개천절 · 10/5 대체공휴일) */}
            {includeHoliday && (() => {
              const items: Array<{ date: string; name: string }> = [];
              for (const [date, name] of holidayNameMap) {
                if (activeRanges.some((r) => date >= r.startDate && date <= r.endDate)) {
                  items.push({ date, name });
                }
              }
              if (items.length === 0) return null;
              items.sort((a, b) => a.date.localeCompare(b.date));
              return (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 text-[12px]">
                  <span className="text-red-700 font-bold">공휴일</span>
                  {items.map((it, idx) => {
                    const m = Number(it.date.slice(5, 7));
                    const d = Number(it.date.slice(8, 10));
                    return (
                      <span key={it.date} className="inline-flex items-center gap-1.5">
                        <span className="text-red-700 font-bold tabular-nums">{m}/{d}</span>
                        <span className="text-red-400 font-semibold">{it.name}</span>
                        {idx < items.length - 1 && <span className="text-zinc-300">·</span>}
                      </span>
                    );
                  })}
                </div>
              );
            })()}
            {/* 제목 + 일수 */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className="text-[15px] md:text-[16px] font-bold text-zinc-800">{chartAxis === "hour" ? "시간대별 추이" : "일별 추이"}</div>
              <span className="text-[12px] text-zinc-500">{effDateData.length}일</span>
            </div>
            <div className="w-full min-w-0 max-w-full overflow-hidden" style={{ height: 360 }}>
              {(() => {
                // 2026-10-06 · 사용자 지시 · chart 영역에서만 empty 메시지 (상단 탭/메트릭 탭 유지)
                if (isEffEmpty) {
                  return (
                    <div className="h-full flex items-center justify-center text-zinc-400 text-[14px]">{emptyChartMsg}</div>
                  );
                }
                const chartData = buildSeriesData(chartMetric);
                // 2026-10-06 · 사용자 지시 · percentile 축 자르기 취소 · domain=auto · Brush 로 range 선택
                const yFormatter = chartMetric === "margin-rate"
                  ? (v: number) => `${Number(v).toFixed(0)}%`
                  : chartMetric === "customers"
                    ? (v: number) => `${Math.round(Number(v)).toLocaleString()}`
                    : (v: number) => fmtWonShort(Number(v));
                const tooltipValueFormatter = (v: number | string) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return "-";
                  if (chartMetric === "margin-rate") return `${n.toFixed(1)}%`;
                  if (chartMetric === "customers") return `${Math.round(n).toLocaleString()}명`;
                  return fmtWon(n);
                };
                // 2026-10-06 · 사용자 지시 · 4 탭 모두 Line (꺾은선 그래프) · 날짜별 overlay
                //   · 오늘 Line 두껍게 (3.5) + ★ 포인트 · Legend 특별 라벨
                //   · 데이터 있으면 그리지 않음 (null · connectNulls=false)
                // 2026-10-06 · 사용자 지시 · Y축 왼쪽 단위 라벨
                const yUnit = chartMetric === "margin-rate" ? "%" : chartMetric === "customers" ? "명" : "원";
                // 2026-10-06 · 사용자 지시 · 주별 추이 축 · X=W1~W5 (월 내 주차) · 월별 overlay
                //   · 주차 = Math.ceil(day/7) · 각 주 안 날짜 합산 (매출/매출이익/고객수)
                if (chartAxis === "week") {
                  interface WeekAgg { sale: number; cust: number; marg: number }
                  const monthWeekMap = new Map<string, Map<number, WeekAgg>>();
                  for (const d of effDateData) {
                    const monthKey = d.date.slice(0, 7);
                    const day = Number(d.date.slice(8, 10));
                    const w = Math.ceil(day / 7);
                    if (!monthWeekMap.has(monthKey)) monthWeekMap.set(monthKey, new Map());
                    const prev = monthWeekMap.get(monthKey)!.get(w) ?? { sale: 0, cust: 0, marg: 0 };
                    prev.sale += d.totalSale;
                    prev.cust += d.totalCust;
                    prev.marg += d.totalMargin;
                    monthWeekMap.get(monthKey)!.set(w, prev);
                  }
                  const months = [...monthWeekMap.keys()].sort();
                  const weekChartData: Record<string, number | string | null>[] = [];
                  for (let w = 1; w <= 5; w++) {
                    const point: Record<string, number | string | null> = { week: w };
                    for (const monthKey of months) {
                      const r = monthWeekMap.get(monthKey)!.get(w);
                      if (!r) { point[monthKey] = null; continue; }
                      let v: number | null = null;
                      if (chartMetric === "revenue") v = r.sale;
                      else if (chartMetric === "avg-order") v = r.cust > 0 ? Math.round(r.sale / r.cust) : null;
                      else if (chartMetric === "margin-rate") v = r.sale > 0 ? Math.round((r.marg / r.sale) * 1000) / 10 : null;
                      else if (chartMetric === "customers") v = r.cust;
                      point[monthKey] = v;
                    }
                    weekChartData.push(point);
                  }
                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weekChartData} margin={{ top: 18, right: 15, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                        <XAxis dataKey="week" tick={{ fontSize: 13, fill: "#52525b" }} tickFormatter={(v) => `W${v}`} interval={0} />
                        <YAxis
                          tick={{ fontSize: 12, fill: "#52525b" }}
                          tickFormatter={(v) => yFormatter(Number(v))}
                          width={60}
                          domain={["auto", "auto"]}
                          allowDecimals={false}
                          label={{ value: `(${yUnit})`, position: "insideTopLeft", offset: -4, style: { fontSize: 12, fill: "#71717a", fontWeight: 600 } }}
                        />
                        <Tooltip
                          formatter={(v, name) => {
                            const nm = String(name);
                            const raw = nm.replace(" ★ 이번달", "");
                            const [yy, mm] = raw.split("-");
                            const monthLbl = yy && mm ? `${yy}년 ${Number(mm)}월` : raw;
                            return [tooltipValueFormatter(v as number), monthLbl];
                          }}
                          labelFormatter={(v) => `W${v} (${Number(v) === 1 ? "1~7" : Number(v) === 2 ? "8~14" : Number(v) === 3 ? "15~21" : Number(v) === 4 ? "22~28" : "29~31"}일)`}
                          contentStyle={{ fontSize: 13, borderRadius: 8 }}
                        />
                        {/* 2026-10-07 · 사용자 지시 · Legend 간단·확실하게 노출 · 하단 고정 · 네모 아이콘 */}
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          height={32}
                          iconType="rect"
                          iconSize={10}
                          wrapperStyle={{ fontSize: 13, paddingTop: 6, lineHeight: "16px" }}
                          formatter={(name) => {
                            const nm = String(name);
                            const raw = nm.replace(" ★ 이번달", "");
                            const [yy, mm] = raw.split("-");
                            const monthLbl = yy && mm ? `${yy}년 ${Number(mm)}월` : raw;
                            if (nm.endsWith("★ 이번달")) return <span style={{ color: "#dc2626", fontWeight: 800 }}>{monthLbl} ★ 이번달</span>;
                            return <span style={{ color: "#52525b" }}>{monthLbl}</span>;
                          }}
                        />
                        {months.map((monthKey, i) => {
                          const isCurMonth = monthKey === today.slice(0, 7);
                          const color = isCurMonth ? "#dc2626" : PAST_COLORS[i % PAST_COLORS.length];
                          return (
                            <Line
                              key={monthKey} type="monotone" dataKey={monthKey}
                              name={isCurMonth ? `${monthKey} ★ 이번달` : monthKey}
                              stroke={color} strokeWidth={isCurMonth ? 3.5 : 2.2}
                              dot={{ r: isCurMonth ? 5 : 3, strokeWidth: 1 }} activeDot={{ r: isCurMonth ? 7 : 6 }}
                              connectNulls={true}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  );
                }
                // 2026-10-06 · 사용자 지시 · 일별 추이 축 · X=1~31일 · 월별 overlay (조회 기간 내 각 월 series)
                if (chartAxis === "day") {
                  const monthMap = new Map<string, Map<number, { sale: number; cust: number; marg: number }>>();
                  for (const d of effDateData) {
                    const monthKey = d.date.slice(0, 7);
                    const day = Number(d.date.slice(8, 10));
                    if (!monthMap.has(monthKey)) monthMap.set(monthKey, new Map());
                    monthMap.get(monthKey)!.set(day, { sale: d.totalSale, cust: d.totalCust, marg: d.totalMargin });
                  }
                  const months = [...monthMap.keys()].sort();
                  // 2026-10-07 · 사용자 지시 · 일별 추이 x축 날짜 아래 요일 (단일 월 조회 시만 표시)
                  const singleMonthKey = months.length === 1 ? months[0] : null;
                  const DOW_KO_X = ["일", "월", "화", "수", "목", "금", "토"];
                  // 2026-10-10 · 사용자 지시 · 요일 기준 shift
                  //   · reference = 현재월(today 포함) · 없으면 months 마지막 (최신)
                  //   · 각 month 1일 dow 와 ref 1일 dow 차이만큼 좌 shift
                  //   · 예: ref=10월(1일=수), 비교=9월(1일=월) → offset=-2 → 9월 데이터는 왼쪽 2칸 shift
                  //         → 9월 3일(수) 데이터가 X=1 자리 (10월 1일=수 와 overlay)
                  //         → 9월 6일(토) 데이터가 X=4 자리 (10월 4일=토 와 overlay)
                  const todayMonthKey = today.slice(0, 7);
                  const refMonthKey = months.includes(todayMonthKey) ? todayMonthKey : months[months.length - 1];
                  const dowOf1st = (monthKey: string): number => {
                    const [yr, mo] = monthKey.split("-").map(Number);
                    return new Date(yr, mo - 1, 1).getDay();
                  };
                  const refDow = refMonthKey ? dowOf1st(refMonthKey) : 0;
                  const monthOffset = new Map<string, number>();
                  for (const m of months) {
                    if (!weekdayAlign) { monthOffset.set(m, 0); continue; }
                    const diff = ((dowOf1st(m) - refDow + 7) % 7);
                    // 좌 shift (0 ~ -6)
                    monthOffset.set(m, -diff);
                  }
                  const dayChartData: Record<string, number | string | null>[] = [];
                  for (let day = 1; day <= 31; day++) {
                    const point: Record<string, number | string | null> = { day };
                    for (const monthKey of months) {
                      const off = monthOffset.get(monthKey) ?? 0;
                      // offset 적용 · 원본 날짜 = day - off (양수 ≥ 1)
                      const srcDay = day - off;
                      const r = monthMap.get(monthKey)!.get(srcDay);
                      if (!r || srcDay < 1 || srcDay > 31) { point[monthKey] = null; continue; }
                      const { sale, cust, marg } = r;
                      let v: number | null = null;
                      if (chartMetric === "revenue") v = sale;
                      else if (chartMetric === "avg-order") v = cust > 0 ? Math.round(sale / cust) : null;
                      else if (chartMetric === "margin-rate") v = sale > 0 ? Math.round((marg / sale) * 1000) / 10 : null;
                      else if (chartMetric === "customers") v = cust;
                      point[monthKey] = v;
                    }
                    dayChartData.push(point);
                  }
                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dayChartData} margin={{ top: 18, right: 15, left: 0, bottom: singleMonthKey ? 18 : 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                        <XAxis
                          dataKey="day"
                          interval={1}
                          tick={(props: any) => {
                            const x = Number(props?.x ?? 0);
                            const y = Number(props?.y ?? 0);
                            const day = Number(props?.payload?.value);
                            if (!Number.isFinite(day)) return <g />;
                            if (!singleMonthKey) {
                              return (
                                <text x={x} y={y + 14} textAnchor="middle" fontSize={13} fill="#52525b">{`${day}일`}</text>
                              );
                            }
                            const [yr, mo] = singleMonthKey.split("-").map(Number);
                            const dt = new Date(yr, mo - 1, day);
                            if (dt.getMonth() !== mo - 1) {
                              return (
                                <text x={x} y={y + 14} textAnchor="middle" fontSize={13} fill="#52525b">{`${day}일`}</text>
                              );
                            }
                            const dow = DOW_KO_X[dt.getDay()];
                            // 2026-10-07 · 사용자 지시 · 공휴일인 날짜에 공휴일명 표시 (예: "1일" / "월 개천절")
                            const dateYmd = `${singleMonthKey}-${String(day).padStart(2, "0")}`;
                            const holidayName = holidayNameMap.get(dateYmd);
                            const isHolidayDay = Boolean(holidayName);
                            const color = isHolidayDay ? "#dc2626" : dt.getDay() === 0 ? "#dc2626" : dt.getDay() === 6 ? "#2563eb" : "#71717a";
                            const secondLineFontSize = isHolidayDay ? 10 : 11;
                            const secondLineText = isHolidayDay ? `${dow} ${holidayName}` : dow;
                            return (
                              <g>
                                <text x={x} y={y + 12} textAnchor="middle" fontSize={13} fill="#52525b">{`${day}일`}</text>
                                <text x={x} y={y + 26} textAnchor="middle" fontSize={secondLineFontSize} fill={color} fontWeight={isHolidayDay ? 600 : 400}>{secondLineText}</text>
                              </g>
                            );
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: "#52525b" }}
                          tickFormatter={(v) => yFormatter(Number(v))}
                          width={60}
                          domain={["auto", "auto"]}
                          allowDecimals={false}
                          label={{ value: `(${yUnit})`, position: "insideTopLeft", offset: -4, style: { fontSize: 12, fill: "#71717a", fontWeight: 600 } }}
                        />
                        <Tooltip
                          formatter={(v, name) => {
                            const nm = String(name);
                            const raw = nm.replace(" ★ 이번달", "");
                            const [yy, mm] = raw.split("-");
                            const monthLbl = yy && mm ? `${yy}년 ${Number(mm)}월` : raw;
                            return [tooltipValueFormatter(v as number), monthLbl];
                          }}
                          labelFormatter={(v) => `${v}일`}
                          contentStyle={{ fontSize: 13, borderRadius: 8 }}
                        />
                        {/* 2026-10-07 · 사용자 지시 · Legend 간단·확실하게 노출 · 하단 고정 · 네모 아이콘 */}
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          height={32}
                          iconType="rect"
                          iconSize={10}
                          wrapperStyle={{ fontSize: 13, paddingTop: 6, lineHeight: "16px" }}
                          formatter={(name) => {
                            const nm = String(name);
                            const raw = nm.replace(" ★ 이번달", "");
                            const [yy, mm] = raw.split("-");
                            const monthLbl = yy && mm ? `${yy}년 ${Number(mm)}월` : raw;
                            if (nm.endsWith("★ 이번달")) return <span style={{ color: "#dc2626", fontWeight: 800 }}>{monthLbl} ★ 이번달</span>;
                            return <span style={{ color: "#52525b" }}>{monthLbl}</span>;
                          }}
                        />
                        {months.map((monthKey, i) => {
                          // 2026-10-06 · 사용자 지시 · 일별 추이 · 현재월 붉은색 + 두껍게 (시간대별 추이 "오늘" 패턴과 동일)
                          const isCurMonth = monthKey === today.slice(0, 7);
                          const color = isCurMonth ? "#dc2626" : PAST_COLORS[i % PAST_COLORS.length];
                          return (
                            <Line
                              key={monthKey} type="monotone" dataKey={monthKey}
                              name={isCurMonth ? `${monthKey} ★ 이번달` : monthKey}
                              stroke={color} strokeWidth={isCurMonth ? 3.5 : 2.2}
                              dot={{ r: isCurMonth ? 5 : 3, strokeWidth: 1 }} activeDot={{ r: isCurMonth ? 7 : 6 }}
                              // 2026-10-06 · 사용자 지시 · 주말 미포함 시 주중 point 간 연결 (주말 날짜 null gap 건너뛰기)
                              connectNulls={!includeWeekend}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  );
                }
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 18, right: 15, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      {/* 2026-10-06 · 사용자 지시 · 차트 글씨 +1 (12→13, 11→12) */}
                      <XAxis dataKey="time" tick={{ fontSize: 13, fill: "#52525b" }} tickFormatter={(v) => `${v}시`} interval={0} />
                      <YAxis
                        tick={{ fontSize: 12, fill: "#52525b" }}
                        tickFormatter={(v) => yFormatter(Number(v))}
                        width={60}
                        domain={["auto", "auto"]}
                        allowDecimals={false}
                        label={{ value: `(${yUnit})`, position: "insideTopLeft", offset: -4, style: { fontSize: 12, fill: "#71717a", fontWeight: 600 } }}
                      />
                      <Tooltip
                        formatter={(v, name) => {
                          const nm = String(name);
                          // weekday 축 때 name 이 "W1 MM/DD(요일)" 형태 · 그대로 사용
                          if (nm.includes(" ")) return [tooltipValueFormatter(v as number), nm.replace(" ★ 오늘", "")];
                          return [tooltipValueFormatter(v as number), shortDateWithDow(nm.replace(" ★ 오늘", ""))];
                        }}
                        labelFormatter={(v) => `${v}시`}
                        contentStyle={{ fontSize: 13, borderRadius: 8 }}
                      />
                      {/* 2026-10-07 · 사용자 지시 · Legend 간단·확실하게 노출 · 하단 고정 · 네모 아이콘 */}
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        height={32}
                        iconType="rect"
                        iconSize={10}
                        wrapperStyle={{ fontSize: 13, paddingTop: 6, lineHeight: "16px" }}
                        formatter={(name) => {
                          const nm = String(name);
                          if (nm.endsWith("★ 오늘")) return <span style={{ color: "#dc2626", fontWeight: 800 }}>{nm}</span>;
                          // weekday 축 "W1 MM/DD(요일)" 형태 · 그대로 사용
                          if (nm.includes(" ")) return <span style={{ color: "#52525b" }}>{nm}</span>;
                          return <span style={{ color: "#52525b" }}>{shortDateWithDow(nm)}</span>;
                        }}
                      />
                      {effDateData.map((d, i) => {
                        const isToday = d.date === today;
                        const isWknd = isWeekend(d.date);
                        const color = isToday ? "#dc2626" : PAST_COLORS[i % PAST_COLORS.length];
                        // 2026-10-06 · 사용자 지시 · 주말 날짜는 다른 선 타입 (dashed) · 오늘이 아닐 때만
                        const dash = isWknd && !isToday ? "6 3" : undefined;
                        // 2026-10-06 · 사용자 지시 · 요일별 추이 Line 라벨에 주 번호 (W1/W2/..) prefix
                        const wkPrefix = chartAxis === "weekday" ? (weekLabelMap.get(d.date) ?? "") : "";
                        const baseName = wkPrefix ? `${wkPrefix} ${shortDateWithDow(d.date)}` : d.date;
                        return (
                          <Line
                            key={d.date} type="monotone" dataKey={d.date}
                            name={isToday ? `${shortDateWithDow(d.date)} ★ 오늘` : baseName}
                            stroke={color} strokeWidth={isToday ? 3.5 : 1.8}
                            strokeDasharray={dash}
                            dot={{ r: isToday ? 5 : 3, strokeWidth: 1 }} activeDot={{ r: 7 }}
                            connectNulls={false}
                            // 2026-10-06 · 사용자 지시 · 요일별 추이 · W1/W2 라벨 그래프 안 표시 (각 point 위)
                            label={wkPrefix ? { position: "top", fontSize: 10, fontWeight: 700, fill: color, formatter: () => wkPrefix } : undefined}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* 2026-10-06 · 사용자 지시 · PC 가로 테이블 제거 · 세로 아코디언 통일 (모든 viewport)
          · 각 날짜 세로 블록 · 접었다 폈다 · 최근 날짜 맨 위 (displayDateData reversed) */}
      <div className="flex flex-col gap-2 w-full min-w-0 max-w-full">
        {!show ? (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-400">
            {status === "idle" || status === "loading" ? "조회 중..." : status === "error" ? "조회 실패" : "데이터 없음"}
          </div>
        ) : displayDateData.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-400">데이터 없음</div>
        ) : chartAxis === "week" ? (
          // 2026-10-06 · 사용자 지시 · 주별 추이 축 · 주별 아코디언 · 안에 그 주의 일별 테이블
          //   · 각 주 header · W1~W5 (해당 월 1~7일 · 8~14일 · 15~21일 · 22~28일 · 29~31일)
          //   · 요약 · 그 주 매출총액 · 매출이익 · 마진율 · 고객수 · 최신 주 맨 위
          (() => {
            interface DayData { date: string; totalSale: number; totalMargin: number; totalCust: number }
            const isWeekendDate = (dateStr: string): boolean => {
              const [y, m, dd] = dateStr.split("-").map(Number);
              if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(dd)) return false;
              const dow = new Date(y, m - 1, dd).getDay();
              return dow === 0 || dow === 6;
            };
            // 2026-10-07 · 공휴일 제외 반영 · 2026-10-09 · fix · 주말만+공휴일포함 OR 로직
            const dayFilteredBase = weekendOnly
              ? displayDateData.filter((d) => isWeekendDate(d.date) || (includeHoliday && holidaySet.has(d.date)))
              : (includeWeekend ? displayDateData : displayDateData.filter((d) => !isWeekendDate(d.date)));
            const dayFiltered = !includeHoliday ? dayFilteredBase.filter((d) => !holidaySet.has(d.date)) : dayFilteredBase;
            const weekMap = new Map<string, DayData[]>(); // key = "YYYY-MM/W"
            for (const d of dayFiltered) {
              const monthKey = d.date.slice(0, 7);
              const day = Number(d.date.slice(8, 10));
              const w = Math.ceil(day / 7);
              const key = `${monthKey}/W${w}`;
              if (!weekMap.has(key)) weekMap.set(key, []);
              weekMap.get(key)!.push({ date: d.date, totalSale: d.totalSale, totalMargin: d.totalMargin, totalCust: d.totalCust });
            }
            const weeks = [...weekMap.keys()].sort().reverse();
            const todayMonth = today.slice(0, 7);
            const todayWeek = Math.ceil(Number(today.slice(8, 10)) / 7);
            const todayWeekKey = `${todayMonth}/W${todayWeek}`;
            return (
              <>
                {weeks.map((weekKey) => {
                  const days = weekMap.get(weekKey)!.slice().sort((a, b) => a.date.localeCompare(b.date));
                  const wSale = days.reduce((s, d) => s + d.totalSale, 0);
                  const wMargin = days.reduce((s, d) => s + d.totalMargin, 0);
                  const wCust = days.reduce((s, d) => s + d.totalCust, 0);
                  const wRate = wSale > 0 ? (wMargin / wSale) * 100 : 0;
                  const isCurWeek = weekKey === todayWeekKey;
                  const isWExp = expandedMonths.has(weekKey);
                  const [mk, wk] = weekKey.split("/");
                  const [my, mm] = mk.split("-");
                  const wn = Number(wk.slice(1));
                  const dayRange = wn === 1 ? "1~7" : wn === 2 ? "8~14" : wn === 3 ? "15~21" : wn === 4 ? "22~28" : "29~31";
                  const weekLabel = `${my}년 ${Number(mm)}월 ${wk} (${dayRange}일)`;
                  return (
                    <div key={weekKey} className={`bg-white border rounded-lg overflow-hidden ${isCurWeek ? "border-amber-300" : "border-zinc-200"}`}>
                      <button
                        type="button"
                        onClick={() => toggleMonth(weekKey)}
                        className={`w-full px-3 py-2 md:py-2.5 transition ${isCurWeek ? "bg-amber-50 hover:bg-amber-100" : "bg-zinc-50 hover:bg-zinc-100"}`}
                        aria-expanded={isWExp}
                      >
                        <div className="flex items-center gap-2 md:gap-4 min-w-0">
                          <div className="flex items-center gap-1.5 shrink-0 min-w-[140px] md:min-w-[180px]">
                            <span className="text-[15px] md:text-[16px] font-bold text-zinc-800 whitespace-nowrap">{weekLabel}</span>
                            {isCurWeek && <span className="text-amber-700 text-[12px] md:text-[13px] font-bold whitespace-nowrap">● 이번주</span>}
                          </div>
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2 min-w-0">
                            {[
                              { label: "매출총액", value: fmtWon(wSale), accent: "text-brand-deep", bar: "bg-brand-deep" },
                              { label: "매출이익", value: fmtWon(wMargin), accent: "text-emerald-700", bar: "bg-emerald-500" },
                              { label: "마진율", value: `${wRate.toFixed(1)}%`, accent: "text-amber-700", bar: "bg-amber-500" },
                              { label: "고객수", value: `${wCust.toLocaleString()}명`, accent: "text-sky-700", bar: "bg-sky-500" },
                            ].map((k) => (
                              <div key={k.label} className="relative pl-2 min-w-0 text-left">
                                <span className={`absolute left-0 top-0.5 bottom-0.5 w-[2px] ${k.bar} rounded-r-full`} aria-hidden />
                                <div className="text-[11px] md:text-[12px] text-zinc-500 font-semibold leading-tight truncate">{k.label}</div>
                                <div className={`text-[13px] md:text-[15px] font-bold tabular-nums leading-tight truncate ${k.accent}`}>{k.value}</div>
                              </div>
                            ))}
                          </div>
                          <span className="shrink-0 text-zinc-600 text-[14px] font-bold w-4 text-center">{isWExp ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {isWExp && (
                        <div className="border-t border-zinc-200">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[14px] border-collapse">
                              <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200 text-[12px]">
                                  <th className="text-left px-2 py-1.5 font-semibold text-zinc-600">날짜</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">매출총액</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">매출이익</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">마진율</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">고객수</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">객단가</th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.slice().reverse().map((r) => {
                                  const rate = r.totalSale > 0 ? (r.totalMargin / r.totalSale) * 100 : 0;
                                  const avg = r.totalCust > 0 ? Math.round(r.totalSale / r.totalCust) : 0;
                                  const isTodayRow = r.date === today;
                                  return (
                                    <tr key={r.date} className={`border-b border-zinc-100 ${isTodayRow ? "bg-amber-50/60" : ""}`}>
                                      <td className={`px-2 py-1.5 text-left font-semibold whitespace-nowrap ${isTodayRow ? "text-amber-800" : "text-zinc-700"}`}>
                                        {shortDateWithDow(r.date)}{isTodayRow && <span className="ml-1 text-amber-700 text-[11px]">●</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-brand-deep">{fmtNum(r.totalSale)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{fmtNum(r.totalMargin)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{rate.toFixed(1)}%</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{r.totalCust.toLocaleString()}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtNum(avg)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()
        ) : chartAxis === "weekday" ? (
          // 2026-10-06 · 사용자 지시 · 요일별 추이 축 · 요일별 아코디언 · 안에 그 요일 날짜 테이블
          //   · 각 요일 header · "월요일" 등 · 선택 요일만 (selectedWeekdays)
          //   · 요약 · 그 요일 전체 매출총액/매출이익/마진율/일평균 고객수
          //   · 펼침 시 각 날짜 테이블 (W1 10/05(월) 등 · 매출/매출이익/마진율/고객수/객단가)
          (() => {
            const DOW_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
            const dowColor = (w: number) => w === 0 ? "text-rose-600" : w === 6 ? "text-sky-600" : "text-zinc-800";
            const dowOf = (dateStr: string): number => {
              const [y, m, dd] = dateStr.split("-").map(Number);
              if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(dd)) return -1;
              return new Date(y, m - 1, dd).getDay();
            };
            interface DowData { date: string; totalSale: number; totalMargin: number; totalCust: number }
            const dowMap = new Map<number, DowData[]>();
            for (const d of displayDateData) {
              const w = dowOf(d.date);
              if (!selectedWeekdays.has(w)) continue;
              if (!includeHoliday && holidaySet.has(d.date)) continue; // 2026-10-07
              if (!dowMap.has(w)) dowMap.set(w, []);
              dowMap.get(w)!.push({ date: d.date, totalSale: d.totalSale, totalMargin: d.totalMargin, totalCust: d.totalCust });
            }
            const dows = [...dowMap.keys()].sort();
            if (dows.length === 0) {
              return <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-zinc-400">선택 요일 데이터 없음</div>;
            }
            return (
              <>
                {dows.map((w) => {
                  const days = dowMap.get(w)!.slice().sort((a, b) => a.date.localeCompare(b.date));
                  const wkSale = days.reduce((s, d) => s + d.totalSale, 0);
                  const wkMargin = days.reduce((s, d) => s + d.totalMargin, 0);
                  const wkCust = days.reduce((s, d) => s + d.totalCust, 0);
                  const wkRate = wkSale > 0 ? (wkMargin / wkSale) * 100 : 0;
                  const avgCust = days.length > 0 ? Math.round(wkCust / days.length) : 0;
                  const dowKey = `dow-${w}`;
                  const isDExp = expandedMonths.has(dowKey);
                  return (
                    <div key={w} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleMonth(dowKey)}
                        className="w-full px-3 py-2 md:py-2.5 transition bg-zinc-50 hover:bg-zinc-100"
                        aria-expanded={isDExp}
                      >
                        <div className="flex items-center gap-2 md:gap-4 min-w-0">
                          <div className="flex items-center gap-1.5 shrink-0 min-w-[90px] md:min-w-[112px]">
                            <span className={`text-[15px] md:text-[16px] font-bold whitespace-nowrap ${dowColor(w)}`}>{DOW_FULL[w]}</span>
                            <span className="text-zinc-500 text-[12px]">{days.length}회</span>
                          </div>
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2 min-w-0">
                            {[
                              { label: "매출총액", value: fmtWon(wkSale), accent: "text-brand-deep", bar: "bg-brand-deep" },
                              { label: "매출이익", value: fmtWon(wkMargin), accent: "text-emerald-700", bar: "bg-emerald-500" },
                              { label: "마진율", value: `${wkRate.toFixed(1)}%`, accent: "text-amber-700", bar: "bg-amber-500" },
                              { label: "일평균 고객", value: `${avgCust.toLocaleString()}명`, accent: "text-sky-700", bar: "bg-sky-500" },
                            ].map((k) => (
                              <div key={k.label} className="relative pl-2 min-w-0 text-left">
                                <span className={`absolute left-0 top-0.5 bottom-0.5 w-[2px] ${k.bar} rounded-r-full`} aria-hidden />
                                <div className="text-[11px] md:text-[12px] text-zinc-500 font-semibold leading-tight truncate">{k.label}</div>
                                <div className={`text-[13px] md:text-[15px] font-bold tabular-nums leading-tight truncate ${k.accent}`}>{k.value}</div>
                              </div>
                            ))}
                          </div>
                          <span className="shrink-0 text-zinc-600 text-[14px] font-bold w-4 text-center">{isDExp ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {isDExp && (
                        <div className="border-t border-zinc-200">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[14px] border-collapse">
                              <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200 text-[12px]">
                                  <th className="text-left px-2 py-1.5 font-semibold text-zinc-600">주 · 날짜</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">매출총액</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">매출이익</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">마진율</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">고객수</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">객단가</th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.map((r, idx) => {
                                  const rate = r.totalSale > 0 ? (r.totalMargin / r.totalSale) * 100 : 0;
                                  const avg = r.totalCust > 0 ? Math.round(r.totalSale / r.totalCust) : 0;
                                  const isTodayRow = r.date === today;
                                  return (
                                    <tr key={r.date} className={`border-b border-zinc-100 ${isTodayRow ? "bg-amber-50/60" : ""}`}>
                                      <td className={`px-2 py-1.5 text-left font-semibold whitespace-nowrap ${isTodayRow ? "text-amber-800" : "text-zinc-700"}`}>
                                        W{idx + 1} · {shortDateWithDow(r.date)}{isTodayRow && <span className="ml-1 text-amber-700 text-[11px]">●</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-brand-deep">{fmtNum(r.totalSale)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{fmtNum(r.totalMargin)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{rate.toFixed(1)}%</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{r.totalCust.toLocaleString()}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtNum(avg)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()
        ) : chartAxis === "day" ? (
          // 2026-10-06 · 사용자 지시 · 일별 추이 축 · 월별 아코디언 · 안에 일별 데이터 테이블
          //   · displayDateData 를 YYYY-MM 그룹핑 · 최신 월 맨 위
          //   · 각 월 header · 그 월 매출총액/매출이익/마진율/고객수 요약 KPI 4
          //   · 펼침 시 일별 테이블 (날짜 · 매출 · 매출이익 · 마진율 · 고객수 · 객단가)
          (() => {
            interface DayData { date: string; totalSale: number; totalMargin: number; totalCust: number }
            // 2026-10-06 · 사용자 지시 · 월별 아코디언 데이터도 주말 포함/주말만 체크 반영
            const isWeekendDate = (dateStr: string): boolean => {
              const [y, m, dd] = dateStr.split("-").map(Number);
              if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(dd)) return false;
              const dow = new Date(y, m - 1, dd).getDay();
              return dow === 0 || dow === 6;
            };
            // 2026-10-07 · 공휴일 제외 반영 (월별 아코디언) · 2026-10-09 · fix · 주말만+공휴일포함 OR 로직
            const dayFilteredBase = weekendOnly
              ? displayDateData.filter((d) => isWeekendDate(d.date) || (includeHoliday && holidaySet.has(d.date)))
              : (includeWeekend ? displayDateData : displayDateData.filter((d) => !isWeekendDate(d.date)));
            const dayFiltered = !includeHoliday ? dayFilteredBase.filter((d) => !holidaySet.has(d.date)) : dayFilteredBase;
            const monthMap = new Map<string, DayData[]>();
            for (const d of dayFiltered) {
              const monthKey = d.date.slice(0, 7);
              if (!monthMap.has(monthKey)) monthMap.set(monthKey, []);
              monthMap.get(monthKey)!.push({ date: d.date, totalSale: d.totalSale, totalMargin: d.totalMargin, totalCust: d.totalCust });
            }
            const months = [...monthMap.keys()].sort().reverse();
            const todayMonth = today.slice(0, 7);
            return (
              <>
                {months.map((monthKey) => {
                  const days = monthMap.get(monthKey)!.slice().sort((a, b) => a.date.localeCompare(b.date));
                  const mSale = days.reduce((s, d) => s + d.totalSale, 0);
                  const mMargin = days.reduce((s, d) => s + d.totalMargin, 0);
                  const mCust = days.reduce((s, d) => s + d.totalCust, 0);
                  const mRate = mSale > 0 ? (mMargin / mSale) * 100 : 0;
                  const isCurMonth = monthKey === todayMonth;
                  const isMExp = expandedMonths.has(monthKey);
                  const [my, mm] = monthKey.split("-");
                  const monthLabel = `${my}년 ${Number(mm)}월`;
                  return (
                    <div key={monthKey} className={`bg-white border rounded-lg overflow-hidden ${isCurMonth ? "border-amber-300" : "border-zinc-200"}`}>
                      <button
                        type="button"
                        onClick={() => toggleMonth(monthKey)}
                        className={`w-full px-3 py-2 md:py-2.5 transition ${isCurMonth ? "bg-amber-50 hover:bg-amber-100" : "bg-zinc-50 hover:bg-zinc-100"}`}
                        aria-expanded={isMExp}
                      >
                        <div className="flex items-center gap-2 md:gap-4 min-w-0">
                          <div className="flex items-center gap-1.5 shrink-0 min-w-[90px] md:min-w-[112px]">
                            <span className="text-[15px] md:text-[16px] font-bold text-zinc-800 whitespace-nowrap">{monthLabel}</span>
                            {isCurMonth && <span className="text-amber-700 text-[12px] md:text-[13px] font-bold whitespace-nowrap">● 이번달</span>}
                          </div>
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2 min-w-0">
                            {[
                              { label: "매출총액", value: fmtWon(mSale), accent: "text-brand-deep", bar: "bg-brand-deep" },
                              { label: "매출이익", value: fmtWon(mMargin), accent: "text-emerald-700", bar: "bg-emerald-500" },
                              { label: "마진율", value: `${mRate.toFixed(1)}%`, accent: "text-amber-700", bar: "bg-amber-500" },
                              { label: "고객수", value: `${mCust.toLocaleString()}명`, accent: "text-sky-700", bar: "bg-sky-500" },
                            ].map((k) => (
                              <div key={k.label} className="relative pl-2 min-w-0 text-left">
                                <span className={`absolute left-0 top-0.5 bottom-0.5 w-[2px] ${k.bar} rounded-r-full`} aria-hidden />
                                <div className="text-[11px] md:text-[12px] text-zinc-500 font-semibold leading-tight truncate">{k.label}</div>
                                <div className={`text-[13px] md:text-[15px] font-bold tabular-nums leading-tight truncate ${k.accent}`}>{k.value}</div>
                              </div>
                            ))}
                          </div>
                          <span className="shrink-0 text-zinc-600 text-[14px] font-bold w-4 text-center">{isMExp ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {isMExp && (
                        <div className="border-t border-zinc-200">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[14px] border-collapse">
                              <thead>
                                <tr className="bg-zinc-50 border-b border-zinc-200 text-[12px]">
                                  <th className="text-left px-2 py-1.5 font-semibold text-zinc-600">날짜</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">매출총액</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">매출이익</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">마진율</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">고객수</th>
                                  <th className="text-right px-2 py-1.5 font-semibold text-zinc-600">객단가</th>
                                </tr>
                              </thead>
                              <tbody>
                                {days.slice().reverse().map((r) => {
                                  const rate = r.totalSale > 0 ? (r.totalMargin / r.totalSale) * 100 : 0;
                                  const avg = r.totalCust > 0 ? Math.round(r.totalSale / r.totalCust) : 0;
                                  const isTodayRow = r.date === today;
                                  return (
                                    <tr key={r.date} className={`border-b border-zinc-100 ${isTodayRow ? "bg-amber-50/60" : ""}`}>
                                      <td className={`px-2 py-1.5 text-left font-semibold whitespace-nowrap ${isTodayRow ? "text-amber-800" : "text-zinc-700"}`}>
                                        {shortDateWithDow(r.date)}{isTodayRow && <span className="ml-1 text-amber-700 text-[11px]">●</span>}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-brand-deep">{fmtNum(r.totalSale)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{fmtNum(r.totalMargin)}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{rate.toFixed(1)}%</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-sky-700">{r.totalCust.toLocaleString()}</td>
                                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmtNum(avg)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            );
          })()
        ) : (
          (() => {
            // 2026-10-06 · 사용자 지시 · hour 축 아코디언 · 주말 포함/주말만 체크 반영
            const isWknd = (dateStr: string) => {
              const [y, m, dd] = dateStr.split("-").map(Number);
              if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(dd)) return false;
              const dow = new Date(y, m - 1, dd).getDay();
              return dow === 0 || dow === 6;
            };
            // 2026-10-07 · 공휴일 제외 반영
            const base = weekendOnly ? displayDateData.filter((d) => isWknd(d.date)) : (!includeWeekend ? displayDateData.filter((d) => !isWknd(d.date)) : displayDateData);
            return !includeHoliday ? base.filter((d) => !holidaySet.has(d.date)) : base;
          })().map((d) => {
            const isExp = expandedDates.has(d.date);
            const isToday = d.date === today;
            const dayRows = [...d.rowMap.values()].sort((a, b) => Number(a.SaleTime) - Number(b.SaleTime));
            const dMarginRate = d.totalSale > 0 ? (d.totalMargin / d.totalSale) * 100 : 0;
            return (
              <div key={d.date} className={`bg-white border rounded-lg overflow-hidden ${isToday ? "border-amber-300" : "border-zinc-200"}`}>
                <button
                  type="button"
                  onClick={() => toggleDate(d.date)}
                  className={`w-full px-3 py-2 md:py-2.5 transition ${isToday ? "bg-amber-50 hover:bg-amber-100" : "bg-zinc-50 hover:bg-zinc-100"}`}
                  aria-expanded={isExp}
                >
                  {/* 2026-10-06 · 사용자 지시 · 접기 바에 KPI 4개 (매출총액/매출이익/마진율/고객수) 노출
                      · 깔끔 텍스트 + 미묘 컬러 포인트 · PC 한 줄 · 모바일 2 줄 (상단 날짜+화살표 · 하단 KPI 2x2) */}
                  <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    <div className="flex items-center gap-1.5 shrink-0 min-w-[90px] md:min-w-[112px]">
                      <span className="text-[15px] md:text-[16px] font-bold text-zinc-800 whitespace-nowrap">{d.date}</span>
                      {isToday && <span className="text-amber-700 text-[12px] md:text-[13px] font-bold whitespace-nowrap">● 오늘</span>}
                    </div>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2 min-w-0">
                      {[
                        { label: "매출총액", value: fmtWon(d.totalSale), accent: "text-brand-deep", bar: "bg-brand-deep" },
                        { label: "매출이익", value: fmtWon(d.totalMargin), accent: "text-emerald-700", bar: "bg-emerald-500" },
                        { label: "마진율", value: `${dMarginRate.toFixed(1)}%`, accent: "text-amber-700", bar: "bg-amber-500" },
                        { label: "고객수", value: `${d.totalCust.toLocaleString()}명`, accent: "text-sky-700", bar: "bg-sky-500" },
                      ].map((k) => (
                        <div key={k.label} className="relative pl-2 min-w-0 text-left">
                          <span className={`absolute left-0 top-0.5 bottom-0.5 w-[2px] ${k.bar} rounded-r-full`} aria-hidden />
                          <div className="text-[11px] md:text-[12px] text-zinc-500 font-semibold leading-tight truncate">{k.label}</div>
                          <div className={`text-[13px] md:text-[15px] font-bold tabular-nums leading-tight truncate ${k.accent}`}>{k.value}</div>
                        </div>
                      ))}
                    </div>
                    <span className="shrink-0 text-zinc-600 text-[14px] font-bold w-4 text-center">{isExp ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isExp && (
                  <div className="border-t border-zinc-200">
                    <div className="overflow-x-auto">
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
  <div className="bg-white border border-zinc-200 rounded-xl p-3 md:p-4 min-w-0 shadow-[0_1px_2px_rgba(10,46,74,0.04)]">
    <div className="text-[12px] md:text-[14px] text-zinc-500 font-semibold mb-1 truncate-none break-keep leading-tight">{label}</div>
    <div className="text-[16px] md:text-[20px] font-bold text-ink tabular-nums leading-tight break-all">{value}</div>
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

  // 2026-10-05 · 캘린더 날짜 클릭 → 상세 모달
  const [modalDay, setModalDay] = useState<{ day: number; dateStr: string; buy?: MonthlyBuyDaily; sale?: MonthlySaleDaily } | null>(null);
  // 2026-10-05 · 12개월 overview · Supabase cache 기반 신규 route 로 전환
  //   · 기존: 12 × /api/erp/sale-monthly-report (decoder lock 때문에 사실상 순차 · 12~24s)
  //   · 신규: 1 × /api/erp/sale-year-overview (cache hit → ~50ms · cache miss 월만 ERP)
  interface YearOverviewApiResponse {
    ok: boolean;
    year?: number;
    results?: Record<string, { buyTotal: number; saleTotal: number; margin: number; customerCnt: number } | null>;
    cachedCount?: number;
    fetchedCount?: number;
    error?: string;
  }
  useEffect(() => {
    let cancelled = false;
    setYearOverview(new Map());
    setOverviewYear(year);
    (async () => {
      try {
        const r = await api.get<YearOverviewApiResponse>(`/api/erp/sale-year-overview?year=${year}`);
        if (cancelled) return;
        if (!r.data.ok || !r.data.results) {
          return;
        }
        const map = new Map<number, YearOverviewItem>();
        for (let m = 1; m <= 12; m++) {
          const row = r.data.results[String(m)];
          if (row) {
            map.set(m, { buyTotal: row.buyTotal, saleTotal: row.saleTotal, margin: row.margin, customerCnt: row.customerCnt });
          }
        }
        setYearOverview(map);
      } catch { /* noop · UI 에서 조회중 표시 */ }
    })();
    return () => { cancelled = true; };
  }, [year]);

  // 2026-10-06 · 사용자 지시 · 공식 공휴일 표시 (data.go.kr 특일정보 · /api/holidays?year)
  //   · 서버 라우트 server/routes/settings/holidays.ts · 24h in-memory cache
  //   · year 변경 시 1회 조회 · Map<YYYY-MM-DD, name> lookup
  interface HolidayApiRow { date: string; name: string; is_holiday: boolean }
  interface HolidayApiResponse { year: number; holidays?: HolidayApiRow[] }
  const [holidayMap, setHolidayMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<HolidayApiResponse>(`/api/holidays?year=${year}`);
        if (cancelled) return;
        const m = new Map<string, string>();
        for (const h of r.data.holidays ?? []) {
          if (h.is_holiday && h.date && h.name) m.set(h.date, h.name);
        }
        setHolidayMap(m);
      } catch { /* noop · 공휴일 조회 실패시 일반 날짜로 표시 */ }
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
    // 2026-10-06 · 사용자 지시 · 반응형 · min-w-0 보장 · 오른쪽 잘림 방지
    <div className="flex flex-col gap-4 w-full min-w-0 max-w-full">
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
        {/* 2026-10-05 · 사용자 지시 · 12개월 가로 막대바 chart · 분기별 컬러 accent · Linear 톤 */}
        {(() => {
          // 2026-10-09 · 사용자 지시 · 현재 월 bar 뒤에 "예상매출" overlay (겹쳐서 projection)
          //   · 공식 = 평균 × 총일수 (현재까지 매출/지난일수 × 당월 총일수)
          const currentM = now.getMonth() + 1;
          const projected = (() => {
            if (year !== now.getFullYear()) return null;
            const row = yearOverview.get(currentM);
            if (!row || row.saleTotal <= 0) return null;
            const daysInMonth = new Date(year, currentM, 0).getDate();
            const pastDays = now.getDate();
            if (pastDays <= 0) return null;
            return { total: (row.saleTotal / pastDays) * daysInMonth };
          })();
          const maxSale = Math.max(
            0,
            ...[...yearOverview.values()].map(v => v.saleTotal),
            projected?.total ?? 0,
          );
          const QUARTER_TONES: Record<number, { label: string; accent: string; barFrom: string; barTo: string; barMuted: string; text: string; ring: string }> = {
            1: { label: "Q1", accent: "bg-emerald-500", barFrom: "from-emerald-500", barTo: "to-emerald-300", barMuted: "bg-emerald-200", text: "text-emerald-700", ring: "ring-emerald-300" },
            2: { label: "Q2", accent: "bg-amber-500",   barFrom: "from-amber-500",   barTo: "to-amber-300",   barMuted: "bg-amber-200",   text: "text-amber-700",   ring: "ring-amber-300" },
            3: { label: "Q3", accent: "bg-rose-500",    barFrom: "from-rose-500",    barTo: "to-rose-300",    barMuted: "bg-rose-200",    text: "text-rose-700",    ring: "ring-rose-300" },
            4: { label: "Q4", accent: "bg-indigo-500",  barFrom: "from-indigo-500",  barTo: "to-indigo-300",  barMuted: "bg-indigo-200",  text: "text-indigo-700",  ring: "ring-indigo-300" },
          };
          const renderMonthBar = (m: number) => {
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
                className={`group flex-1 flex flex-col items-center min-w-0 rounded-lg px-1 py-1.5 transition-all ${
                  isSelected
                    ? `ring-2 ${qt.ring} bg-zinc-50`
                    : "hover:bg-zinc-50"
                }`}
              >
                {/* 상단 · 매출 금액 + 보조 metric · 2026-10-09 현재 월 예상매출 라벨 추가 */}
                <div className="h-[42px] flex flex-col items-center justify-end gap-0.5 min-w-0 w-full">
                  {row === undefined ? (
                    <span className="text-[11px] text-zinc-300">...</span>
                  ) : !hasData ? (
                    <span className="text-[14px] text-zinc-300 font-bold">—</span>
                  ) : (
                    <>
                      <span className={`text-[13px] md:text-[14px] font-extrabold tabular-nums tracking-tight leading-none ${isCurrent ? "text-rose-600" : "text-zinc-800"}`}>
                        {fmtWonShort(row.saleTotal)}
                      </span>
                      {isCurrent && projected && projected.total > row.saleTotal && (
                        <span className="text-[9px] md:text-[10px] font-semibold tabular-nums text-cyan-700 leading-none" title={`일별 평균 × 총일수 = 월말 예상 총매출`}>
                          예상 {fmtWonShort(projected.total)}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-[9px] md:text-[10px] tabular-nums whitespace-nowrap leading-none">
                        <span className="text-emerald-700">{fmtWonShort(row.margin)}</span>
                        <span className="text-zinc-300">·</span>
                        <span className="text-brand-deep">{row.customerCnt > 0 ? fmtWonShort(row.saleTotal / row.customerCnt) : "-"}</span>
                      </div>
                    </>
                  )}
                </div>
                {/* 세로 bar · 2026-10-09 현재 월 예상매출 overlay (뒤에 겹쳐서) */}
                <div className="w-full h-[140px] md:h-[180px] flex items-end justify-center mt-1.5 mb-1.5 relative">
                  {isCurrent && projected && projected.total > 0 && maxSale > 0 && (
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[42px] rounded-t-md bg-cyan-200/50 border border-dashed border-cyan-500 pointer-events-none"
                      style={{ height: `${Math.max((projected.total / maxSale) * 100, 3)}%` }}
                      title={`예상 월말 매출 ${fmtWonShort(projected.total)}`}
                      aria-hidden
                    />
                  )}
                  {hasData ? (
                    <div
                      className={`relative z-10 w-full max-w-[42px] rounded-t-md transition-all bg-gradient-to-t ${qt.barFrom} ${qt.barTo} ${isCurrent ? "shadow-[0_-2px_8px_rgba(244,63,94,0.25)] ring-1 ring-white" : "opacity-80 group-hover:opacity-100"}`}
                      style={{ height: `${Math.max(ratio * 100, 3)}%` }}
                    />
                  ) : (
                    <div className="w-full max-w-[42px] h-[2px] bg-zinc-200 rounded" />
                  )}
                </div>
                {/* 하단 · 월 + 오늘 뱃지 + 분기 */}
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex items-center gap-1">
                    <span className={`text-[13px] md:text-[14px] font-bold tabular-nums leading-none ${isCurrent ? "text-amber-700" : "text-zinc-700"}`}>{m}</span>
                    <span className={`text-[10px] font-semibold ${isCurrent ? "text-amber-600" : "text-zinc-400"}`}>월</span>
                  </div>
                  {isCurrent ? (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 py-0.5 rounded leading-none">오늘</span>
                  ) : (
                    <span className={`text-[9px] font-bold ${qt.text} tracking-wider leading-none`}>{qt.label}</span>
                  )}
                </div>
              </button>
            );
          };
          return (
            <div className={`${mobileExpanded ? "" : "hidden md:block"}`}>
              {/* 가로 scroll · 모바일 좁은 폭 대응 · min-w 로 bar 폭 보장 */}
              <div className="overflow-x-auto -mx-1">
                <div className="flex items-end gap-0.5 sm:gap-1 px-1 min-w-[640px] md:min-w-0">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(renderMonthBar)}
                </div>
              </div>
              {/* 범례 · 매출(rose) · 마진(emerald) · 객단(brand) */}
              <div className="flex items-center justify-end gap-3 pt-2 text-[10px] md:text-[11px] text-zinc-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />매출</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-dashed border-cyan-500 bg-cyan-200/50" />예상</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />마진</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-deep" />객단가</span>
                <span className="text-zinc-300">|</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Q1</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Q2</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Q3</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" />Q4</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 선택월 상세 · 미니멀 · 텍스트 위주 */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 md:p-5">
        <div className="flex items-baseline gap-2 mb-3 md:mb-4 flex-wrap">
          <span className="text-[18px] md:text-[20px] font-bold text-zinc-900">{year}년 {month}월</span>
          {isCurMonth && <span className="text-[12px] md:text-[13px] text-zinc-500">· 이번달{asOfLabel}</span>}
          {/* 2026-10-09 · 사용자 지시 · 예상매출 라벨 inline (헤더 옆) · 공식 평균×총일수 */}
          {isCurMonth && show && sel.saleTotal > 0 && (() => {
            const daysInMonth = new Date(year, month, 0).getDate();
            const pastDays = maxDay && /^\d{4}-\d{2}-\d{2}$/.test(maxDay)
              ? Number(maxDay.slice(8, 10))
              : now.getDate();
            if (pastDays <= 0) return null;
            const total = (sel.saleTotal / pastDays) * daysInMonth;
            return (
              <span
                className="text-[12px] md:text-[13px] font-semibold text-cyan-700 tabular-nums whitespace-nowrap"
                title={`일별 평균 × ${daysInMonth}일 · 월말 예상 총매출`}
              >
                · 예상 {fmtWon(total)}
              </span>
            );
          })()}
        </div>
        {!show ? (
          <div className="text-center py-8 text-zinc-400 text-[15px]">
            {status === "idle" || status === "loading" ? "조회 중..." : status === "error" ? "조회 실패" : "데이터 없음"}
          </div>
        ) : !selSale && !selBuy ? (
          <div className="text-center py-8 text-zinc-400 text-[15px]">선택 월 데이터 없음</div>
        ) : (
          // 2026-10-06 · 사용자 지시 · 금액 줄바꿈 금지 · 최신 트렌드 (Linear/Vercel · whitespace-nowrap + clamp 반응형 폰트)
          //   · auto-fit minmax 로 좁은 폭에서 자동 2~3단 재배치 · 각 cell 은 금액 폭 자동 확장
          <div
            className="grid gap-x-4 md:gap-x-6 gap-y-4 md:gap-y-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
          >
            {(() => {
              const avg = sel.customerCnt > 0 ? sel.saleTotal / sel.customerCnt : 0;
              // 2026-10-09 · 예상매출은 상단 헤더로 이동 (사용자 지시 "헤더 옆에 깔끔하게")
              const items: Array<{ label: string; value: string; accent: string; labelColor: string; valueColor: string; title?: string }> = [
                { label: "매출총액", value: fmtWon(sel.saleTotal), accent: "bg-rose-500",     labelColor: "text-rose-600",     valueColor: "text-rose-700" },
                { label: "객단가",   value: fmtWon(avg),           accent: "bg-emerald-500",  labelColor: "text-emerald-600",  valueColor: "text-emerald-800" },
                { label: "매입총액", value: fmtWon(sel.buyTotal),  accent: "bg-brand-deep",   labelColor: "text-brand-deep",   valueColor: "text-brand-deep" },
                { label: "매출이익", value: fmtWon(sel.margin),    accent: "bg-indigo-500",   labelColor: "text-indigo-600",   valueColor: "text-indigo-800" },
                { label: "마진율",   value: `${sel.marginPercent.toFixed(1)}%`, accent: "bg-amber-500", labelColor: "text-amber-600", valueColor: "text-amber-800" },
                { label: "방문객수", value: sel.customerCnt.toLocaleString() + "명", accent: "bg-sky-500", labelColor: "text-sky-600", valueColor: "text-sky-800" },
              ];
              return items.map((it) => (
                <div key={it.label} className="relative pl-2.5 min-w-0">
                  <span className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full ${it.accent}`} aria-hidden />
                  <div className={`text-[12px] md:text-[13px] font-semibold mb-1 leading-tight tracking-tight whitespace-nowrap ${it.labelColor}`}>{it.label}</div>
                  <div
                    className={`font-bold tabular-nums leading-tight whitespace-nowrap ${it.valueColor}`}
                    style={{ fontSize: "clamp(15px, 1.5vw, 22px)" }}
                    title={it.title ?? it.value}
                  >
                    {it.value}
                  </div>
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
                  <div key={ci} className="min-h-[90px] md:min-h-[140px] bg-zinc-50/50 border-r border-zinc-100 last:border-r-0 p-1 md:p-2 min-w-0">
                    {hasWeek && ws && <WeekSubtotalBlock ws={ws} />}
                  </div>
                );
              }
              const isToday = cell.dateStr === todayStr;
              const hasData = !!(cell.buy || cell.sale);
              // 2026-10-07 · 사용자 지시 · 공휴일/주말 배경 붉은계열 · 오늘은 노란계열 유지 · 주말/공휴일 살짝 톤 차이
              //   · 우선순위: 오늘(amber-50/60) > 공휴일(rose-100/60) > 주말(rose-50/60) > 평일(white)
              //   · 날짜 숫자: 요일 기준 색만 유지 (일=rose, 토=sky, 평일=zinc-800)
              //   · 공휴일 표시: 좌상단 amber dot + 하단 공휴일명 (amber-700)
              const holidayName = holidayMap.get(cell.dateStr);
              const isHoliday = !!holidayName;
              const isSaturday = ci === 6;
              const isWeekendCell = isSunday || isSaturday;
              const bgClass = isToday
                ? "bg-amber-50/60"
                : isHoliday
                  ? "bg-rose-100/60"
                  : isWeekendCell
                    ? "bg-rose-50/60"
                    : "bg-white";
              const dayColor = isSunday ? "text-rose-600" : isSaturday ? "text-sky-600" : "text-zinc-800";
              return (
                <div key={ci} className={`min-h-[90px] md:min-h-[140px] border-r border-zinc-100 last:border-r-0 min-w-0 flex flex-col ${bgClass}`}>
                  <button
                    type="button"
                    onClick={() => hasData && setModalDay(cell)}
                    disabled={!hasData}
                    className={`flex-1 flex flex-col justify-start items-stretch w-full text-left p-1 md:p-2 min-w-0 transition relative ${hasData ? "cursor-pointer hover:bg-brand-tint/30" : "cursor-default"}`}
                    title={hasData ? `${cell.dateStr} 상세 보기${isHoliday ? ` · ${holidayName}` : ""}` : (isHoliday ? holidayName : undefined)}
                  >
                    {/* 2026-10-07 · 공휴일명 bar · 셀 상단 full-width · amber bg + 흰 글씨 */}
                    {isHoliday && (
                      <div
                        className="mb-0.5 md:mb-1 bg-amber-500 text-white text-[10px] md:text-[11px] font-semibold px-1 md:px-1.5 py-0.5 rounded leading-tight truncate tracking-tight"
                        title={holidayName}
                      >
                        {holidayName}
                      </div>
                    )}
                    <div className={`text-[14px] md:text-[16px] font-bold ${dayColor} ${isToday ? "text-amber-700" : ""} leading-tight`}>
                      {cell.day}{isToday && <span className="ml-1 text-[12px] md:text-[14px] text-amber-700">● 오늘</span>}
                    </div>
                    <div className="mt-1 space-y-1 text-[12px] md:text-[14px]">
                      {cell.sale && (() => {
                        // 2026-10-07 · 사용자 지시 · 매출 기본 파랑 · 5천만원 초과 붉은색 highlight
                        const saleAmount = Number(cell.sale.SaleTotal ?? 0);
                        const isSaleHigh = saleAmount >= 50_000_000;
                        const labelColor = isSaleHigh ? "text-rose-600" : "text-sky-600";
                        const valueColor = isSaleHigh ? "text-rose-700" : "text-sky-700";
                        return (
                          <div className="flex flex-col min-w-0">
                            <span className={`${labelColor} font-semibold leading-tight`}>매출</span>
                            <span className={`tabular-nums font-bold ${valueColor} leading-tight break-all`}>{fmtNum(saleAmount)}</span>
                          </div>
                        );
                      })()}
                      {cell.buy && (
                        <div className="flex flex-col min-w-0">
                          <span className="text-brand-deep font-semibold leading-tight">매입</span>
                          <span className="tabular-nums text-brand-deep leading-tight break-all">{fmtNum(Number(cell.buy.BuyTotal ?? 0))}</span>
                        </div>
                      )}
                      {cell.sale && (
                        <div className="flex flex-col min-w-0">
                          <span className="text-emerald-600 font-semibold leading-tight">객수/단가</span>
                          <span className="tabular-nums text-emerald-800 leading-tight break-all">{Number(cell.sale.CustomerCnt ?? 0).toLocaleString()} / {fmtNum(Number(cell.sale.AvgPerCustomer ?? 0))}</span>
                        </div>
                      )}
                    </div>
                  </button>
                  {/* 일요일 셀 안 주간 subtotal */}
                  {hasWeek && ws && <div className="px-1 md:px-2 pb-1 md:pb-2"><WeekSubtotalBlock ws={ws} /></div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 날짜 상세 모달 · 2026-10-05 */}
      {modalDay && (
        <DayDetailModal day={modalDay} year={year} month={month} onClose={() => setModalDay(null)} />
      )}
    </div>
  );
};

// 날짜 상세 모달 · Modal primitive · 각 metric 별 컬러 엑센트
type AccentColor = "brand" | "amber" | "emerald" | "indigo" | "sky" | "rose";
const ACCENT_STYLES: Record<AccentColor, { bg: string; border: string; bar: string; label: string; value: string }> = {
  brand:   { bg: "bg-brand-tint/40",  border: "border-brand-deep/20", bar: "bg-gradient-to-b from-brand-deep via-sky-500 to-indigo-500", label: "text-brand-deep",   value: "text-brand-deep" },
  amber:   { bg: "bg-amber-50",       border: "border-amber-200",     bar: "bg-amber-500",   label: "text-amber-700",   value: "text-amber-900" },
  emerald: { bg: "bg-emerald-50",     border: "border-emerald-200",   bar: "bg-emerald-500", label: "text-emerald-700", value: "text-emerald-900" },
  indigo:  { bg: "bg-indigo-50",      border: "border-indigo-200",    bar: "bg-indigo-500",  label: "text-indigo-700",  value: "text-indigo-900" },
  sky:     { bg: "bg-sky-50",         border: "border-sky-200",       bar: "bg-sky-500",     label: "text-sky-700",     value: "text-sky-900" },
  rose:    { bg: "bg-rose-50",        border: "border-rose-200",      bar: "bg-rose-500",    label: "text-rose-700",    value: "text-rose-900" },
};

const MetricCard: React.FC<{ color: AccentColor; label: string; value: string; big?: boolean; full?: boolean }> = ({ color, label, value, big, full }) => {
  const s = ACCENT_STYLES[color];
  return (
    <div className={`relative overflow-hidden rounded-xl border ${s.bg} ${s.border} ${full ? "col-span-2" : ""} ${big ? "p-4" : "p-3"}`}>
      <span className={`absolute left-0 top-2 bottom-2 w-[3px] ${s.bar} rounded-r-full`} aria-hidden />
      <div className="pl-2 min-w-0">
        <div className={`text-[12px] md:text-[13px] font-semibold mb-1 tracking-tight ${s.label}`}>{label}</div>
        <div className={`font-bold tabular-nums leading-tight break-all ${s.value} ${big ? "text-[22px] md:text-[26px]" : "text-[17px] md:text-[19px]"}`}>{value}</div>
      </div>
    </div>
  );
};

// 2026-10-07 · 날짜별 상품 ERP 실시간 조회 응답 타입 (서버 salesDayProductRouter 와 1:1)
interface DaySaleProductItem {
  pcode: string | null;
  productName: string | null;
  buyerCorpName: string | null;
  unitCost: number | null;
  unitSale: number | null;
  totalStock: number | null;    // 수량
  saleTotal: number | null;
  margin: number | null;
  marginPct: number | null;
  location: string | null;
  class: ProductClass;
}
interface DayProductClassStats {
  quantity: number | null;
  saleTotal: number | null;
  margin: number | null;
  marginPct: number | null;
  count: number;
}
interface DayProductApiResponse {
  ok: boolean;
  date?: string;
  totals?: DayProductClassStats;
  // 2026-10-07 · cosmetics (화장품 · 뷰티 포함) 그룹 추가
  // 2026-10-08 · fridge (냉장고) / liquid (물약) 그룹 추가
  byClass?: {
    stationery: DayProductClassStats;
    general: DayProductClassStats;
    cosmetics: DayProductClassStats;
    fridge: DayProductClassStats;
    liquid: DayProductClassStats;
    unknown: DayProductClassStats;
  };
  items?: DaySaleProductItem[];
  error?: string;
}

// 2026-10-07 · 사용자 지시 · DayDetailModal UI 전면 재구성
//   · 상단 compact KPI 영역 (120~150px · 7-metric 균일 grid · 들쭉날쭉 X)
//   · 레이블 12px / 값 15px · 각 metric 별 컬러 포인트 (Linear/Vercel/Notion 2026 톤)
//   · ClassFilter 4-tab (전체/상비약/일반약/미분류) + 검색창 sticky
//   · 상품 테이블 65-70% body · 분류/이익 column 재추가 · default sort = 매출 desc · 폰트 +1
//   · 중복 badge 제거 (상단 KPI 와 중복) · "ERP 실시간" status subdued text
const DayDetailModal: React.FC<{
  day: { day: number; dateStr: string; buy?: MonthlyBuyDaily; sale?: MonthlySaleDaily };
  year: number;
  month: number;
  onClose: () => void;
}> = ({ day, year, month, onClose }) => {
  const dow = ["일","월","화","수","목","금","토"][new Date(day.dateStr + "T00:00:00").getDay()];
  const buyTotal = Number(day.buy?.BuyTotal ?? 0);
  const saleTotal = Number(day.sale?.SaleTotal ?? 0);
  const margin = Number(day.sale?.Margin ?? 0);
  const marginPct = saleTotal > 0 ? (margin / saleTotal) * 100 : 0;
  const cust = Number(day.sale?.CustomerCnt ?? 0);
  const avg = Number(day.sale?.AvgPerCustomer ?? 0);
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  const isToday = day.dateStr === todayStr;
  const dowColor = dow === "일" ? "text-rose-600" : dow === "토" ? "text-sky-600" : "text-zinc-600";

  // 2026-10-07 · 날짜별 상품 ERP 실시간 조회
  const [prodStatus, setProdStatus] = useState<FetchStatus>("idle");
  const [prodErr, setProdErr] = useState<string>("");
  const [prodResp, setProdResp] = useState<DayProductApiResponse | null>(null);
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProdStatus("loading");
      setProdErr("");
      try {
        const r = await api.get<DayProductApiResponse>(`/api/erp/sale-day-products?date=${day.dateStr}`);
        if (cancelled) return;
        if (!r.data.ok) {
          setProdErr(r.data.error ?? "ERP 조회 실패");
          setProdStatus("error");
          return;
        }
        setProdResp(r.data);
        setProdStatus("success");
      } catch (e) {
        if (cancelled) return;
        setProdErr((e as Error).message || "ERP 조회 실패");
        setProdStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [day.dateStr]);

  const items: DaySaleProductItem[] = prodResp?.items ?? [];
  // 2026-10-07 · 사용자 지시 · ClassFilter + 검색 쿼리 적용 (분류 → 검색)
  const filteredItems = useMemo(() => {
    let xs = classFilter === "all" ? items : items.filter((i) => i.class === classFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      xs = xs.filter((i) => {
        const name = (i.productName ?? "").toLowerCase();
        const pcode = (i.pcode ?? "").toLowerCase();
        return name.includes(q) || pcode.includes(q);
      });
    }
    return xs;
  }, [items, classFilter, searchQuery]);

  // 2026-10-07 · 사용자 지시 · 수량/판매수량 상단 KPI 집계 (ERP totals 기반)
  const totalQty = prodResp?.totals?.quantity ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<CalendarDays size={18} />}
      title={
        <span className="flex items-baseline gap-2 flex-wrap">
          <span>{year}년 {month}월 {day.day}일</span>
          <span className={`text-[14px] font-bold ${dowColor}`}>({dow})</span>
          {isToday && <span className="text-[12px] text-amber-700 font-bold">● 오늘</span>}
          <span className="text-[11px] text-zinc-400 font-normal ml-1">· ERP 실시간</span>
        </span>
      }
      titleAccent
    >
      <div className="flex flex-col gap-3">
        {/* 2026-10-07 · 사용자 지시 · Compact KPI 영역 (7-metric · 균일 grid · 들쭉날쭉 X · 레이블 12/값 15)
            · 매출(zinc-900 bold) · 매출이익(emerald) · 마진율(amber) · 방문객(sky) · 객단가(brand) · 매입(indigo) · 판매수량(rose) */}
        <div className="rounded-xl border border-zinc-200/70 bg-white shadow-sm px-4 md:px-5 py-3 md:py-3.5">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-x-3 md:gap-x-4 gap-y-2.5">
            {([
              { label: "매출",     value: fmtWon(saleTotal), labelColor: "text-zinc-500",     valueColor: "text-zinc-900", dot: "bg-zinc-900" },
              { label: "매출이익", value: fmtWon(margin),    labelColor: "text-emerald-600",  valueColor: "text-emerald-700", dot: "bg-emerald-500" },
              { label: "마진율",   value: saleTotal > 0 ? `${marginPct.toFixed(1)}%` : "-", labelColor: "text-amber-600", valueColor: "text-amber-700", dot: "bg-amber-500" },
              { label: "방문객",   value: cust > 0 ? cust.toLocaleString() + "명" : "-",     labelColor: "text-sky-600",   valueColor: "text-sky-700",   dot: "bg-sky-500" },
              { label: "객단가",   value: avg > 0 ? fmtWon(avg) : "-",                      labelColor: "text-brand-deep", valueColor: "text-brand-deep", dot: "bg-brand-deep" },
              { label: "매입",     value: fmtWon(buyTotal),                                 labelColor: "text-indigo-600", valueColor: "text-indigo-700", dot: "bg-indigo-500" },
              { label: "판매수량", value: totalQty !== null ? fmtNum(totalQty) : "-",       labelColor: "text-rose-600",  valueColor: "text-rose-700",  dot: "bg-rose-500" },
            ] as const).map((m) => (
              <div key={m.label} className="flex flex-col gap-0.5 min-w-0">
                <span className={`flex items-center gap-1 text-[12px] font-medium tracking-tight ${m.labelColor}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${m.dot}`} aria-hidden />
                  {m.label}
                </span>
                <span className={`text-[15px] md:text-[16px] font-bold tabular-nums leading-tight truncate ${m.valueColor}`} title={m.value}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 2026-10-07 · 날짜별 판매 상품 · ERP 실시간 (Sale_Status · SvcSaleBiz)
            · ClassFilter 4-tab + 검색 sticky · 상품 테이블 body 65-70% */}
        <DayProductSection
          status={prodStatus}
          error={prodErr}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          byClass={prodResp?.byClass ?? null}
          totals={prodResp?.totals ?? null}
          items={filteredItems}
          totalCount={items.length}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      </div>
    </Modal>
  );
};

// 2026-10-07 · 사용자 지시 · DayProductSection 전면 재구성
//   · ClassFilter 4-tab (전체/상비약/일반약/미분류) · reconciliation 보장 (전체 = 상비약+일반약+미분류)
//   · 검색 input (상품명/pcode · 실시간) · 탭+검색 영역 sticky top-0
//   · 상품 테이블 columns · 상품명 / 분류 / 수량 / 매출 / 이익 / 마진율 (분류·이익 column 재추가)
//   · default sort = 매출 desc · column sort toggle (4 numeric + name)
//   · compact density (py-0.5) · 폰트 +1 (base 14 / md 15)
//   · 중복 badge 제거 (상단 KPI 와 중복)
//   · body 65-70% of modal → max-h 적극 활용 (lg modal 기준 60vh)
const DayProductSection: React.FC<{
  status: FetchStatus;
  error: string;
  classFilter: ClassFilter;
  setClassFilter: (f: ClassFilter) => void;
  byClass: { stationery: DayProductClassStats; general: DayProductClassStats; cosmetics: DayProductClassStats; fridge: DayProductClassStats; liquid: DayProductClassStats; unknown: DayProductClassStats } | null;
  totals: DayProductClassStats | null;
  items: DaySaleProductItem[];
  totalCount: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}> = ({ status, error, classFilter, setClassFilter, byClass, totals, items, totalCount, searchQuery, setSearchQuery }) => {
  // 2026-10-08 · 사용자 지시 · 7-tab (냉장고 · 물약 추가)
  //   전체 count = 상비약+일반약+뷰티+냉장고+물약+미분류 (서버 byClass.*.count 합산 보장)
  const tabs: Array<{ key: ClassFilter; label: string; count: number | null; accent: string }> = [
    { key: "all",        label: CLASS_FILTER_LABEL.all,        count: totals?.count ?? (totalCount || null), accent: "bg-zinc-900" },
    { key: "stationery", label: CLASS_FILTER_LABEL.stationery, count: byClass?.stationery.count ?? null,     accent: "bg-emerald-500" },
    { key: "general",    label: CLASS_FILTER_LABEL.general,    count: byClass?.general.count ?? null,         accent: "bg-amber-500" },
    { key: "cosmetics",  label: CLASS_FILTER_LABEL.cosmetics,  count: byClass?.cosmetics.count ?? null,       accent: "bg-pink-500" },
    { key: "fridge",     label: CLASS_FILTER_LABEL.fridge,     count: byClass?.fridge.count ?? null,          accent: "bg-sky-500" },
    { key: "liquid",     label: CLASS_FILTER_LABEL.liquid,     count: byClass?.liquid.count ?? null,          accent: "bg-indigo-500" },
    { key: "unknown",    label: CLASS_FILTER_LABEL.unknown,    count: byClass?.unknown.count ?? null,         accent: "bg-zinc-400" },
  ];

  // 2026-10-07 · 사용자 지시 · 컬럼 재정렬: 상품명/분류/마진률/매출/매입단가/수량
  //   · 이익 column 제거 (사용자 요청 미포함)
  //   · 매입단가 추가 (unitCost 필드)
  //   · default = 마진률 desc · column 헤더 클릭 토글 (asc/desc)
  //   · null 값 뒤로 (asc/desc 상관없이)
  type SortKey = "name" | "marginPct" | "sale" | "unitCost" | "qty";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("marginPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onHeaderClick = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 숫자 column default desc · name default asc
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const sortedItems = useMemo(() => {
    const copy = [...items];
    const sign = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const nullOrder = (x: unknown, y: unknown): number | null => {
        const xn = x === null || x === undefined || x === "";
        const yn = y === null || y === undefined || y === "";
        if (xn && yn) return 0;
        if (xn) return 1;
        if (yn) return -1;
        return null;
      };
      if (sortKey === "name") {
        const no = nullOrder(a.productName, b.productName);
        if (no !== null) return no;
        return sign * (a.productName ?? "").localeCompare(b.productName ?? "", "ko");
      }
      const key = sortKey === "qty" ? "totalStock"
        : sortKey === "sale" ? "saleTotal"
        : sortKey === "unitCost" ? "unitCost"
        : "marginPct";
      const av = (a as unknown as Record<string, number | null>)[key];
      const bv = (b as unknown as Record<string, number | null>)[key];
      const no = nullOrder(av, bv);
      if (no !== null) return no;
      return sign * ((av as number) - (bv as number));
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const SortArrow: React.FC<{ k: SortKey }> = ({ k }) =>
    k === sortKey
      ? <span className="ml-0.5 text-[10px] text-zinc-500">{sortDir === "asc" ? "▲" : "▼"}</span>
      : <span className="ml-0.5 text-[10px] text-zinc-300">▲</span>;

  return (
    <div className="flex flex-col gap-2">
      {/* Sticky area · 탭 + 검색 */}
      <div className="sticky top-[-20px] z-20 bg-white -mx-1 px-1 pb-1 pt-1 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[14px] md:text-[15px] font-bold text-zinc-800">판매 상품</div>
          {status === "success" && (
            <div className="text-[11px] text-zinc-400 tabular-nums">
              {filteredCountLabel(sortedItems.length, totalCount, searchQuery, classFilter)}
            </div>
          )}
        </div>

        {/* ClassFilter 4-tab */}
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => {
            const active = tab.key === classFilter;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setClassFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] md:text-[14px] font-semibold border transition-colors ${
                  active
                    ? "bg-brand-deep text-white border-brand-deep shadow-sm"
                    : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${active ? "bg-white/80" : tab.accent}`} aria-hidden />
                {tab.label}
                {tab.count !== null && (
                  <span className={`ml-0.5 text-[12px] tabular-nums ${active ? "text-white/85" : "text-zinc-500"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 검색 input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="상품명 또는 PCode 검색"
            className="w-full border border-zinc-200 rounded-md px-3 py-1.5 text-[14px] md:text-[15px] placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-1 focus:ring-brand-deep/20 bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-[14px] px-1"
              aria-label="검색어 지우기"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 상품 테이블 · Loading / Error / Empty / Success */}
      {status === "loading" && (
        <div className="py-6 text-center text-[14px] text-zinc-500">ERP 조회 중…</div>
      )}
      {status === "error" && (
        <div className="py-4 px-3 rounded-md bg-rose-50 border border-rose-200 text-[13px] text-rose-700">
          ERP 조회 실패 · {error}
        </div>
      )}
      {status === "success" && items.length === 0 && (
        <div className="py-6 text-center text-[14px] text-zinc-500">해당 조건의 판매 상품이 없습니다.</div>
      )}
      {status === "success" && items.length > 0 && (
        <div
          className="overflow-auto rounded-md border border-zinc-200"
          style={{ maxHeight: "min(60vh, 560px)", minHeight: 320 }}
        >
          <table className="w-full text-[14px] md:text-[15px]">
            {/* 2026-10-07 · 사용자 지시 · 분류/이익 column 재추가 · default sort 매출 desc · compact density */}
            <thead className="bg-zinc-50 text-zinc-600 sticky top-0 z-10 select-none">
              <tr>
                <th
                  className="px-2 py-1 text-left font-semibold cursor-pointer hover:bg-zinc-100 transition-colors"
                  onClick={() => onHeaderClick("name")}
                  aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  상품명<SortArrow k="name" />
                </th>
                <th
                  className="px-2 py-1 text-right font-semibold cursor-pointer hover:bg-zinc-100 transition-colors whitespace-nowrap"
                  onClick={() => onHeaderClick("marginPct")}
                  aria-sort={sortKey === "marginPct" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  마진율<SortArrow k="marginPct" />
                </th>
                <th
                  className="px-2 py-1 text-right font-semibold cursor-pointer hover:bg-zinc-100 transition-colors whitespace-nowrap"
                  onClick={() => onHeaderClick("sale")}
                  aria-sort={sortKey === "sale" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  매출<SortArrow k="sale" />
                </th>
                <th
                  className="px-2 py-1 text-right font-semibold cursor-pointer hover:bg-zinc-100 transition-colors whitespace-nowrap"
                  onClick={() => onHeaderClick("unitCost")}
                  aria-sort={sortKey === "unitCost" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  매입단가<SortArrow k="unitCost" />
                </th>
                <th
                  className="px-2 py-1 text-right font-semibold cursor-pointer hover:bg-zinc-100 transition-colors whitespace-nowrap"
                  onClick={() => onHeaderClick("qty")}
                  aria-sort={sortKey === "qty" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  수량<SortArrow k="qty" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedItems.map((it, idx) => (
                <tr key={`${it.pcode ?? "noPcode"}-${idx}`} className="hover:bg-zinc-50/50">
                  <td className="px-2 py-0.5 text-zinc-800 truncate max-w-[260px]" title={it.productName ?? ""}>
                    {it.productName ?? "-"}
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums text-amber-700">
                    {it.marginPct !== null ? `${it.marginPct.toFixed(1)}%` : "-"}
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums font-semibold text-zinc-900">
                    {it.saleTotal !== null ? fmtNum(it.saleTotal) : "-"}
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums text-zinc-700">
                    {it.unitCost !== null ? fmtNum(it.unitCost) : "-"}
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums text-zinc-700">
                    {it.totalStock !== null ? fmtNum(it.totalStock) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// 2026-10-07 · 사용자 지시 · 필터·검색 적용 count 라벨 helper
function filteredCountLabel(shown: number, total: number, q: string, cf: ClassFilter): string {
  if (!q && cf === "all") return `${shown}건`;
  return `${shown}건 / 전체 ${total}건`;
}

const WeekSubtotalBlock: React.FC<{ ws: { buyTotal: number; saleTotal: number; cust: number; avg: number; margin: number; marginPct: number } }> = ({ ws }) => (
  <div className="mt-2 pt-2 border-t border-brand-deep/15 space-y-1 text-[12px] md:text-[14px] bg-gradient-to-br from-brand-tint/40 to-sky-50/50 rounded px-1.5 py-1.5 min-w-0">
    <div className="text-brand-deep font-bold leading-tight tracking-tight">[주간 합계]</div>
    <div className="flex flex-col min-w-0">
      <span className="text-rose-600 font-semibold leading-tight">매출</span>
      <span className="tabular-nums font-bold text-rose-700 leading-tight break-all">{fmtNum(ws.saleTotal)}</span>
    </div>
    <div className="flex flex-col min-w-0">
      <span className="text-brand-deep font-semibold leading-tight">매입</span>
      <span className="tabular-nums text-brand-deep leading-tight break-all">{fmtNum(ws.buyTotal)}</span>
    </div>
    <div className="flex flex-col min-w-0">
      <span className="text-emerald-600 font-semibold leading-tight">객/단가</span>
      <span className="tabular-nums text-emerald-800 leading-tight break-all">{ws.cust.toLocaleString()} / {fmtNum(ws.avg)}</span>
    </div>
  </div>
);

export default RevenuePage;
