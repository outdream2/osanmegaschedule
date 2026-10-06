// server/lib/periodFilter.ts
// 2026-10-06 · 사용자 지시 · 공통 기간필터 util (STANDARD)
//
// months_list=YYYY-MM,YYYY-MM 비연속 월 멀티선택 지원 유틸.
// 매입이력(STANDARD) 패턴의 복붙 4곳 (purchase.ts/supplierPurchases.ts/
// purchaseSummary.ts/topSales.ts) + 결제 신규 지원분을 한 함수로 통일.
//
// 사용 패턴:
//   const months = parseMonthsList(req.query.months_list);
//   if (months.isEmpty) {
//     // 기존 days / start·end 분기 유지
//   } else {
//     q = q.gte(dateCol, months.from!).lte(dateCol, months.to!);
//     // post-filter · 비연속 중간 월 제거
//     rows = rows.filter(r => isDateInSelectedMonths(r[dateCol], months.set));
//   }
//
// 비연속 핵심:
//   months_list=2026-07,2026-10
//   → from=2026-07-01, to=2026-10-31 (range 1회 SELECT)
//   → set={2026-07, 2026-10} 로 YM post-filter (8/9월 제거)

export interface MonthsListParsed {
  /** 입력 받은 YM 리스트 · 정렬·검증 완료 */
  arr: string[];
  /** YM Set · post-filter 용 */
  set: Set<string>;
  /** min YM 의 1일 · "YYYY-MM-01" · isEmpty 이면 null */
  from: string | null;
  /** max YM 의 말일 · "YYYY-MM-DD" · isEmpty 이면 null */
  to: string | null;
  /** 선택 월 0건 · 기존 days/start·end 분기로 돌아감 */
  isEmpty: boolean;
}

/**
 * req.query.months_list 를 파싱.
 *   · "2026-07,2026-10" → { arr, set, from="2026-07-01", to="2026-10-31" }
 *   · 공백/빈값/잘못된 포맷 · isEmpty=true 반환
 */
export function parseMonthsList(raw: unknown): MonthsListParsed {
  const s = String(raw ?? "").trim();
  const arr = s
    ? s.split(",").map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}$/.test(x))
    : [];
  if (arr.length === 0) {
    return { arr: [], set: new Set<string>(), from: null, to: null, isEmpty: true };
  }
  const sorted = [...arr].sort();
  const minYm = sorted[0];
  const maxYm = sorted[sorted.length - 1];
  const [yy, mm] = maxYm.split("-").map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  return {
    arr,
    set: new Set(arr),
    from: `${minYm}-01`,
    to: `${maxYm}-${String(lastDay).padStart(2, "0")}`,
    isEmpty: false,
  };
}

/**
 * date 문자열(YYYY-MM-DD 또는 ISO) 이 선택 월 집합에 포함되는지.
 *   · 빈값·잘못된 포맷 → false
 */
export function isDateInSelectedMonths(dateStr: string | null | undefined, set: Set<string>): boolean {
  if (!dateStr) return false;
  const ym = String(dateStr).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return false;
  return set.has(ym);
}
