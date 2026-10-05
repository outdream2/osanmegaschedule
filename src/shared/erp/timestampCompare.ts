// src/shared/erp/timestampCompare.ts
// 2026-10-04 · ERP vs Postgres timestamp 공통 비교 helper
//
// 배경:
//   ERP 응답:   "2026-10-02 17:19:56"           (timezone 없음)
//   Postgres:   "2026-10-02T17:19:56+00:00"     (UTC 명시)
//
//   WRITE 시 Postgres TIMESTAMPTZ 는 timezone 없는 ERP 값을 session timezone (default UTC) 로 저장.
//   READ 시 ISO 8601 로 timezone 명시해서 반환.
//   → 두 값은 **같은 instant** · 문자열 비교하면 다르게 보임.
//
// 정책 (사용자 2026-10-04 명시):
//   임의 timezone 변환 정책 새로 만들지 않음.
//   기존 WRITE 동작과 일치: timezone 없는 ERP 값은 UTC 로 간주.
//   → Date.parse 는 "YYYY-MM-DD HH:MM:SS" 를 local timezone 으로 해석하므로
//     수동으로 "Z" (UTC) suffix 를 붙여서 UTC 로 명시해야 함.

/**
 * timestamp-like 값을 UTC epoch ms 로 정규화.
 * null/empty → null.
 */
export function normalizeTimestampForComparison(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;

  // Case 1: ISO 8601 with explicit timezone (Postgres TIMESTAMPTZ READ)
  //   "2026-10-02T17:19:56+00:00" · "2026-10-02T17:19:56Z" · "2026-10-02T17:19:56.123+09:00"
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)$/i.test(s)) {
    const d = Date.parse(s);
    return Number.isFinite(d) ? d : null;
  }

  // Case 2: ISO date only "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = Date.parse(s + "T00:00:00Z");
    return Number.isFinite(d) ? d : null;
  }

  // Case 3: ERP "YYYY-MM-DD HH:MM:SS" (timezone 없음) · UTC 로 간주 (기존 WRITE 동작 유지)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
    const iso = (s.includes("T") ? s : s.replace(" ", "T")) + "Z";
    const d = Date.parse(iso);
    return Number.isFinite(d) ? d : null;
  }

  // Fallback: 모든 포맷 그냥 Date.parse (local 해석 가능) · 호환성 유지
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : null;
}

/**
 * 두 timestamp-like 값이 same instant 를 가리키는지 비교.
 */
export function timestampsEqual(a: unknown, b: unknown): boolean {
  const na = normalizeTimestampForComparison(a);
  const nb = normalizeTimestampForComparison(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  return na === nb;
}
