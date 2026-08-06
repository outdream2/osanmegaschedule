// src/lib/format.ts
// 공통 포맷 유틸 · fmtWon · fmtDate · fmtDateShort · fmtDateYMD · fmtDateMD
// 2026-08-06 · T-SLIM · 중복 제거 통합 (Phase 2: fmtWonNoUnit · fmtWonFull · fmtDateSlice 추가)

// ─── 통화 ─────────────────────────────────────────────────────────────────────

/**
 * 원화 컴팩트 포맷 (null 없는 경우):
 *   1억 이상 → "X.X억"
 *   1만 이상 → "X.X만"
 *   미만      → "X,XXX원"
 * null/undefined/NaN 은 처리 안 함 — 호출자가 보장해야 함
 */
export function fmtWonCompact(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return `${n.toLocaleString()}원`;
}

/**
 * 원화 컴팩트 포맷 (null-safe):
 *   null / undefined / NaN → "-"
 *   나머지 → fmtWonCompact
 */
export function fmtWon(n: number | null | undefined): string {
  if (n == null) return "-";
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return fmtWonCompact(v);
}

/**
 * 원화 컴팩트 포맷 (단위 접미사 없음, NaN/0 → "0"):
 *   0 → "0"
 *   1억 이상 → "X.X억"
 *   1만 이상 → "X.X만"
 *   미만      → "X,XXX"
 * PurchaseHistoryTab / VendorInfoHeader(common) 등 "원" 단위를 별도 표기하는 UI용
 */
export function fmtWonNoUnit(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

/**
 * 원화 풀 포맷 (toLocaleString + "원" 접미사, NaN/0 → "0"):
 *   0 → "0"
 *   나머지 → "X,XXX원"
 * OrderManagePage/VendorInfoHeader 등 정밀 표기용
 */
export function fmtWonFull(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (n === 0) return "0";
  return `${Math.round(n).toLocaleString()}원`;
}

// ─── 날짜 ─────────────────────────────────────────────────────────────────────

/**
 * "M/D" 형식 — 게시판 날짜 등 짧은 표기
 *   "2026-08-06T10:30:00Z" → "8/6"
 */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return "-"; }
}

/**
 * "YYYY.MM.DD" 형식 — 휴가 기간, 사직서 날짜 등
 *   "2026-08-06" → "2026.08.06"
 */
export function fmtDateYMD(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch { return String(iso); }
}

/**
 * "M/D HH:MM" 형식 — 요청 일시, 휴가 신청일 등 짧은 날짜+시간
 *   "2026-08-06T10:30:00Z" → "8/6 10:30" (로컬 시간)
 */
export function fmtDateMD(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return String(iso); }
}

/**
 * "YYYY-MM-DD" 슬라이스 포맷 — ISO 문자열의 앞 10자만 취함
 *   "2026-08-06T10:30:00" → "2026-08-06"
 *   null/undefined → "-"
 * VendorInfoHeader · PurchaseHistoryTab 등 시간 없이 날짜만 표기하는 UI용
 */
export function fmtDateSlice(iso: string | null | undefined): string {
  if (!iso) return "-";
  return String(iso).slice(0, 10);
}
