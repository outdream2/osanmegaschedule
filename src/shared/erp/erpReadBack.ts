// src/shared/erp/erpReadBack.ts
// 2026-10-04 · Phase 2 · WRITE 후 Supabase Read-Back 검증
//
// 원칙:
//   · Sync Runner 가 success 반환했다 해도 Supabase 실제 저장을 재조회로 확인
//   · WRITE payload field 와 Supabase 실제 field 가 일치해야 VERIFIED_SUCCESS
//   · 하나라도 불일치면 PARTIAL_FAILED · candidate 그대로 유지 · last-synced 승격 금지
//   · DB WRITE 없음 · READ-only
//
// 호출 책임:
//   · 호출부가 "실제 WRITE 한 barcode + payload" 를 전달
//   · 호출부가 Supabase 재조회 함수를 inject (sync-agent 쪽 service-role 유지)

export type ReadBackStatus = "VERIFIED_SUCCESS" | "PARTIAL_FAILED" | "FAILED";

export interface ReadBackMismatch {
  readonly barcode: string;
  readonly productName?: string;
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly reason: string;
}

export interface ReadBackReport {
  readonly status: ReadBackStatus;
  readonly totalChecked: number;
  readonly verified: number;
  readonly mismatches: readonly ReadBackMismatch[];
  readonly notFound: readonly string[];       // 재조회 시 DB 에서 못 찾은 barcode
}

/** 호출부가 inject 할 재조회 함수 · barcode 리스트 → DB row 리스트 */
export type ReadBackFetcher = (
  barcodes: readonly string[],
) => Promise<ReadonlyMap<string, Record<string, unknown>>>;

export interface ReadBackInput {
  readonly barcode: string;
  readonly productName?: string;
  /** 실제 WRITE 한 payload (expected 비교 기준) */
  readonly payload: Record<string, unknown>;
}

/** empty string ↔ null 같은 값으로 정규화 비교 */
function normalizeCompare(a: unknown, b: unknown): boolean {
  const na = a == null || (typeof a === "string" && a.trim() === "") ? null : a;
  const nb = b == null || (typeof b === "string" && b.trim() === "") ? null : b;
  if (na === null && nb === null) return true;
  // 숫자 field 는 Number 비교
  if (typeof na === "number" || typeof nb === "number") {
    const ia = typeof na === "number" ? na : Number(String(na));
    const ib = typeof nb === "number" ? nb : Number(String(nb));
    if (Number.isFinite(ia) && Number.isFinite(ib)) return Math.abs(ia - ib) < 0.0001;
  }
  return String(na ?? "") === String(nb ?? "");
}

/**
 * Read-Back 검증 메인.
 *
 * @param writes 실제 WRITE 한 상품 리스트 (barcode + payload)
 * @param fetcher Supabase 에서 barcode 로 상품 재조회
 */
export async function verifyReadBack(
  writes: readonly ReadBackInput[],
  fetcher: ReadBackFetcher,
): Promise<ReadBackReport> {
  if (writes.length === 0) {
    return { status: "VERIFIED_SUCCESS", totalChecked: 0, verified: 0, mismatches: [], notFound: [] };
  }
  const barcodes = writes.map((w) => w.barcode);
  const dbMap = await fetcher(barcodes);

  const mismatches: ReadBackMismatch[] = [];
  const notFound: string[] = [];
  let verified = 0;

  for (const w of writes) {
    const dbRow = dbMap.get(w.barcode);
    if (!dbRow) {
      notFound.push(w.barcode);
      continue;
    }
    let allMatch = true;
    for (const [field, expected] of Object.entries(w.payload)) {
      const actual = dbRow[field];
      if (!normalizeCompare(expected, actual)) {
        allMatch = false;
        mismatches.push({
          barcode: w.barcode,
          productName: w.productName,
          field,
          expected,
          actual,
          reason: "payload != DB after WRITE",
        });
      }
    }
    if (allMatch) verified++;
  }

  const totalChecked = writes.length;
  const anyFail = mismatches.length > 0 || notFound.length > 0;
  const status: ReadBackStatus =
    !anyFail ? "VERIFIED_SUCCESS"
    : verified === 0 ? "FAILED"
    : "PARTIAL_FAILED";

  return { status, totalChecked, verified, mismatches, notFound };
}
