// src/lib/dateFormat.ts
// 2026-09-18 · 날짜 포맷 유틸 · 발주이력·발주 카드 등 · 짧은 표기 통일
//   · shortDate("2026-09-11") → "26/9/11"
//   · 사용 · OrderHistoryTab · 발주필요 · 유통기한 임박 리스트 등 · 화면 폭 절약

/**
 * ISO 날짜(YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss) → "YY/M/D" 짧은 포맷
 *   · 연 뒤 2자리 · 월/일 leading zero 제거
 *   · 입력 falsy · "" 반환
 *   · 파싱 실패 · 원본 첫 10자 반환 (안전 fallback)
 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  const mn = Number(m);
  const dn = Number(d);
  if (!Number.isFinite(mn) || !Number.isFinite(dn)) return s;
  return `${y.slice(-2)}/${mn}/${dn}`;
}

/**
 * 2026-10-06 · 사용자 지시 · 년도 제거 · "MM/DD(요일)" 포맷
 *   · 예 · "2026-10-06" → "10/06(화)"
 *   · 시간대별 매출추이 · 날짜 overlay · tooltip · legend 공통 formatter
 */
const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
export function shortDateWithDow(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = String(iso).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  const yn = Number(y);
  const mn = Number(m);
  const dn = Number(d);
  if (!Number.isFinite(yn) || !Number.isFinite(mn) || !Number.isFinite(dn)) return s;
  const date = new Date(yn, mn - 1, dn);
  const dow = DOW_KO[date.getDay()] ?? "";
  return `${String(mn).padStart(2, "0")}/${String(dn).padStart(2, "0")}(${dow})`;
}
