// src/components/SalesTrendPage/SalesTrendPage.helpers.ts
// 2026-08-22 · Framework Phase 4 · SalesTrendPage 대형 파일 분리 · types + helpers 이관
import { ZONE_DEFS } from "../../constants/displayZones";

// ─── 타입 ───────────────────────────────────────────────────────────────────
export type PeriodRow = {
  period_start_date: string;
  snapshot_date: string;
  period_type: string | null;
  supplier_name?: string | null;
  product_name?: string | null;
  spec?: string | null;
  opening_stock?: number;
  purchase_qty?: number;
  sale_qty?: number;
  disposal_qty?: number;
  closing_stock?: number;
  supply_amount?: number;
  total_amount?: number;
  product_count?: number;
};

export interface ChartSeries {
  label: string;
  color: string;
  values: number[];
  kind?: "line" | "bar";
  format?: "count" | "won";
}

export interface LineChartProps {
  labels: string[];
  series: ChartSeries[];
  height?: number;
}

// ─── 구역 코드 → 카테고리 매핑 (매장 구역도 ZONE_DEFS 그대로 사용) ────
//   real_map 형식 예: "1A", "1B", "2A", "9B", "22" 등
//   ZONE_DEFS 의 num + section 으로 매칭 · subA/subB 있으면 side 로 세분화
export const ZONE_CATEGORY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const z of ZONE_DEFS) {
    const nStr = String(z.num);
    if (z.subA && z.subB) {
      map[`${nStr}A`] = z.subA;
      map[`${nStr}B`] = z.subB;
    }
    map[nStr] = z.category;
  }
  return map;
})();

export const zoneCategoryLabel = (zone: string): string => {
  if (!zone || zone === "미배치") return "미배치 상품";
  return ZONE_CATEGORY_MAP[zone.toUpperCase()] ?? ZONE_CATEGORY_MAP[zone.replace(/[AB]$/, "")] ?? "";
};

// ─── 유틸 ───────────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return "-";
  return Number(n).toLocaleString();
};

// 재고관리와 동일 · YYYY-M-D 형식에서 M/D 추출
export function extractMonthDay(raw: any): string | null {
  if (!raw) return null;
  try {
    if (raw instanceof Date) return `${raw.getMonth() + 1}/${raw.getDate()}`;
    const s = String(raw).trim();
    if (!s) return null;
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
    if (m) return `${Number(m[2])}/${Number(m[3])}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()}`;
    return null;
  } catch { return null; }
}

export const periodLabel = (start: string, end: string): string => {
  const m1 = /^\d{4}-(\d{2})-(\d{2})$/.exec(start);
  const m2 = /^\d{4}-(\d{2})-(\d{2})$/.exec(end);
  if (!m1 || !m2) return `${start} ~ ${end}`;
  return `${Number(m1[1])}/${Number(m1[2])} ~ ${Number(m2[1])}/${Number(m2[2])}`;
};

// Y축 nice scale: 최댓값을 반올림해서 tick 값이 깔끔한 숫자가 되도록
export function niceScale(maxVal: number): { niceMax: number; ticks: number[] } {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return { niceMax: 1, ticks: [0, 1] };
  const exp = Math.floor(Math.log10(maxVal));
  const pow = Math.pow(10, exp);
  const mantissa = maxVal / pow;
  let niceMantissa: number;
  if (mantissa <= 1) niceMantissa = 1;
  else if (mantissa <= 2) niceMantissa = 2;
  else if (mantissa <= 2.5) niceMantissa = 2.5;
  else if (mantissa <= 5) niceMantissa = 5;
  else niceMantissa = 10;
  const niceMax = niceMantissa * pow;
  const stepCount = 4;
  const step = niceMax / stepCount;
  const ticks = Array.from({ length: stepCount + 1 }, (_, i) => i * step);
  return { niceMax, ticks };
}

// ─── 기간 생성 · 채우기 · 월별 집계 ────────────────────────────────────────
export function padDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function generatePeriods(rangeDays: number): Array<{ start: string; end: string; period_type: "early" | "mid" | "late" }> {
  const now = new Date();
  const todayStr = padDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - rangeDays);
  const cutoffStr = padDate(cutoff.getFullYear(), cutoff.getMonth() + 1, cutoff.getDate());
  const periods: Array<{ start: string; end: string; period_type: "early" | "mid" | "late" }> = [];
  // cutoff 이 속한 달부터 오늘 이 속한 달까지 각 초/중/하순 나열
  let year = cutoff.getFullYear();
  let month = cutoff.getMonth() + 1; // 1-based
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    // 초순
    periods.push({ start: padDate(year, month, 1), end: padDate(year, month, 10), period_type: "early" });
    // 중순
    periods.push({ start: padDate(year, month, 11), end: padDate(year, month, 20), period_type: "mid" });
    // 하순
    periods.push({ start: padDate(year, month, 21), end: padDate(year, month, lastDayOfMonth(year, month)), period_type: "late" });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  // cutoff 이전 · today 이후 기간 filter
  return periods.filter(p => p.end >= cutoffStr && p.start <= todayStr);
}

// 실제 rows 를 기간 목록에 매핑 · 없는 기간은 0 값 placeholder
export function fillPeriodsWithRows<T extends { period_start_date: string; snapshot_date: string }>(
  rows: T[],
  rangeDays: number,
  makeEmpty: (start: string, end: string, periodType: "early" | "mid" | "late") => T,
): T[] {
  const periods = generatePeriods(rangeDays);
  const byStart = new Map<string, T>();
  for (const r of rows) byStart.set(String(r.period_start_date), r);
  return periods.map(p => byStart.get(p.start) ?? makeEmpty(p.start, p.end, p.period_type));
}

// 10일 기간 rows → 월별 aggregation (같은 YYYY-MM 끼리 합산)
// 유량(purchase/sale/disposal): SUM · 재고: 마지막 스냅샷 값 · 금액: SUM
export function aggregateToMonths<T extends {
  period_start_date: string; snapshot_date: string; period_type: string | null;
  opening_stock?: number; purchase_qty?: number; sale_qty?: number; disposal_qty?: number;
  closing_stock?: number; supply_amount?: number; total_amount?: number; product_count?: number;
  supplier_name?: string | null; product_name?: string | null; spec?: string | null;
}>(rows: T[]): T[] {
  const byMonth = new Map<string, T>();
  for (const r of rows) {
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(r.period_start_date);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, { ...r, period_start_date: `${key}-01`, snapshot_date: r.snapshot_date, period_type: null } as T);
      const agg = byMonth.get(key)! as any;
      agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
      agg.purchase_qty = 0;
      agg.sale_qty = 0;
      agg.disposal_qty = 0;
      agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
      agg.supply_amount = 0;
      agg.total_amount = 0;
      agg.product_count = 0;
      agg._first_snap = r.snapshot_date;
      agg._last_snap = r.snapshot_date;
    }
    const agg = byMonth.get(key)! as any;
    // 유량: SUM
    agg.purchase_qty += Number(r.purchase_qty ?? 0) || 0;
    agg.sale_qty += Number(r.sale_qty ?? 0) || 0;
    agg.disposal_qty += Number(r.disposal_qty ?? 0) || 0;
    agg.supply_amount += Number(r.supply_amount ?? 0) || 0;
    agg.total_amount += Number(r.total_amount ?? 0) || 0;
    // 재고 시작=가장 이른 스냅샷의 opening
    if (r.snapshot_date < (agg._first_snap ?? r.snapshot_date)) {
      agg._first_snap = r.snapshot_date;
      agg.opening_stock = Number(r.opening_stock ?? 0) || 0;
    }
    // 재고 종료=가장 늦은 스냅샷의 closing
    if (r.snapshot_date > (agg._last_snap ?? "")) {
      agg._last_snap = r.snapshot_date;
      agg.snapshot_date = r.snapshot_date;
      agg.closing_stock = Number(r.closing_stock ?? 0) || 0;
    }
    // product_count 는 최댓값 (같은 월에 같은 상품이 중복 카운트되지 않도록)
    agg.product_count = Math.max(agg.product_count, Number(r.product_count ?? 0) || 0);
  }
  // 내부 헬퍼 필드 제거
  return Array.from(byMonth.values())
    .map(v => { const { _first_snap, _last_snap, ...rest } = v as any; void _first_snap; void _last_snap; return rest as T; })
    .sort((a, b) => a.period_start_date.localeCompare(b.period_start_date));
}
