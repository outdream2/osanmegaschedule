// src/shared/erp/erpLocalDiff.ts
// 2026-10-04 · Phase 2 · Local Diff · candidate vs last-synced
//
// 역할:
//   · 두 ERP snapshot 사이 변경분 식별 (identity 단위)
//   · SAME / NEW / CHANGED / MISSING 분류
//   · MISSING 은 절대 DELETE 로 해석하지 않음 (Supabase DELETE 영구 금지)
//   · pure function · DB WRITE 없음
//
// 사용처:
//   · Supabase Final Diff 전 "ERP 자체 변경분" 추출
//   · UI "변경내용" / "이상데이터" 화면 입력

import {
  productIdentity,
  productFingerprintHash,
  buyIdentity,
  type ProductFingerprintRow,
  type BuyFingerprintRow,
} from "./datasetHash";

export type LocalDiffAction = "SAME" | "NEW" | "CHANGED" | "MISSING";

export interface LocalDiffRow {
  readonly identity: string;
  readonly action: LocalDiffAction;
  readonly candidateIndex: number | null;      // candidate 안 index · null 이면 MISSING
  readonly lastSyncedIndex: number | null;     // last-synced 안 index · null 이면 NEW
}

export interface LocalDiffSummary {
  readonly total: number;
  readonly same: number;
  readonly new_: number;
  readonly changed: number;
  readonly missing: number;
  readonly rows: readonly LocalDiffRow[];
}

/**
 * Product_List Local Diff.
 *
 * @param candidate 신규 Fetch 결과
 * @param lastSynced 이전 Promotion 완료 snapshot (null 이면 전체 NEW)
 */
export function diffProductsLocal(
  candidate: readonly ProductFingerprintRow[],
  lastSynced: readonly ProductFingerprintRow[] | null,
): LocalDiffSummary {
  const result: LocalDiffRow[] = [];
  const lastMap = new Map<string, { row: ProductFingerprintRow; fpHash: string; idx: number }>();
  if (lastSynced) {
    lastSynced.forEach((r, i) => {
      const id = productIdentity(r);
      if (id) lastMap.set(id, { row: r, fpHash: productFingerprintHash(r), idx: i });
    });
  }
  const candidateIds = new Set<string>();
  let same = 0, new_ = 0, changed = 0, missing = 0;

  candidate.forEach((r, i) => {
    const id = productIdentity(r);
    if (!id) return; // identity 없는 row 는 Validation 에서 분리 처리
    candidateIds.add(id);
    const prev = lastMap.get(id);
    if (!prev) {
      // last-synced 없거나 identity 처음 등장
      if (lastSynced == null) {
        // first-run · 전부 NEW 로 간주 (호출부가 Supabase Final Diff 로 다시 걸러냄)
        new_++;
        result.push({ identity: id, action: "NEW", candidateIndex: i, lastSyncedIndex: null });
      } else {
        new_++;
        result.push({ identity: id, action: "NEW", candidateIndex: i, lastSyncedIndex: null });
      }
    } else {
      const curHash = productFingerprintHash(r);
      if (curHash === prev.fpHash) {
        same++;
        result.push({ identity: id, action: "SAME", candidateIndex: i, lastSyncedIndex: prev.idx });
      } else {
        changed++;
        result.push({ identity: id, action: "CHANGED", candidateIndex: i, lastSyncedIndex: prev.idx });
      }
    }
  });

  // MISSING · last-synced 에 있었는데 candidate 에 없는 identity
  if (lastSynced) {
    for (const [id, prev] of lastMap) {
      if (!candidateIds.has(id)) {
        missing++;
        result.push({ identity: id, action: "MISSING", candidateIndex: null, lastSyncedIndex: prev.idx });
      }
    }
  }

  return { total: result.length, same, new_, changed, missing, rows: result };
}

/** Buy_Status Local Diff · (BmCode, ROWNUM) · fingerprint hash 없이 identity 만 비교 가능 */
export function diffBuysLocal(
  candidate: readonly BuyFingerprintRow[],
  lastSynced: readonly BuyFingerprintRow[] | null,
): LocalDiffSummary {
  const result: LocalDiffRow[] = [];
  const lastIds = new Set<string>();
  const lastMap = new Map<string, number>();
  if (lastSynced) {
    lastSynced.forEach((r, i) => {
      const id = buyIdentity(r);
      lastIds.add(id);
      lastMap.set(id, i);
    });
  }
  const seen = new Set<string>();
  let same = 0, new_ = 0, missing = 0;
  // Buy transaction 은 immutable 가정 (한 번 등록된 거래는 수정 X) · CHANGED 는 분류 안 함 · 전부 same or new
  candidate.forEach((r, i) => {
    const id = buyIdentity(r);
    if (!id || id === "|") return;
    seen.add(id);
    const prevIdx = lastMap.get(id);
    if (prevIdx == null) {
      new_++;
      result.push({ identity: id, action: "NEW", candidateIndex: i, lastSyncedIndex: null });
    } else {
      same++;
      result.push({ identity: id, action: "SAME", candidateIndex: i, lastSyncedIndex: prevIdx });
    }
  });
  if (lastSynced) {
    for (const [id, idx] of lastMap) {
      if (!seen.has(id)) {
        missing++;
        result.push({ identity: id, action: "MISSING", candidateIndex: null, lastSyncedIndex: idx });
      }
    }
  }
  return { total: result.length, same, new_, changed: 0, missing, rows: result };
}
