// apps/sync-agent/src/main/buySyncService.ts
// 2026-10-04 · S2 패턴 · BUY Sync Service (Electron main 전용)
//
// 사용자 지시 (단순화 원칙):
//   · 호출자가 넘겨준 "현재 ERP rows" 만 사용 (ERP 재호출 X · Local 재조회 X)
//   · 호출자가 넘겨준 pcodeToBarcodeMap 재사용 (매핑 로직 중복 금지 · PCode→BarCode 의미 유지)
//   · identity = (bm_code, row_num) · UPDATE 대상 아님
//   · ERP-owned 12 fields · 그 중 데이터 10개 (identity 제외) 로 CHANGED 판정
//   · product_code = INSERT 시 payload 포함 · UPDATE 시 제외 (identity 역할)
//   · WEB-owned (verified_*, period_*, expiry_date, imported_at) 완전 보호
//   · Partial unique index · UPSERT 금지 · INSERT + UPDATE 분리
//   · Scheduler/UI 공통 사용

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { appendSyncHistory } from "./syncHistoryStore";
import {
  type ErpBuyRow,
  buildBuyRowFromErp,
} from "../../../../src/shared/erp/erpBuyMapper";
import {
  ERP_OWNED_PURCHASE_FIELDS,
  PROTECTED_PURCHASE_FIELDS,
  assertNoProtectedField,
  isErpEmpty,
} from "../../../../src/shared/erp/erpSyncWhitelist";

const NUMERIC_FIELDS = new Set(["quantity", "unit_price", "amount", "vat", "total", "row_num"]);
const IDENTITY_FIELDS = new Set(["bm_code", "row_num"]);
const WEB_FIELDS = [
  "verified_by", "verify_status", "verify_note", "verified_at", "verified_expiring",
  "expiry_date", "imported_at", "period_start_date", "period_type",
];
const COMPARE_DATA_FIELDS = Object.keys(ERP_OWNED_PURCHASE_FIELDS).filter(
  (k) => !IDENTITY_FIELDS.has(k),
);
const DB_SELECT_COLS = [
  "id", "bm_code", "row_num", "product_code",
  ...COMPARE_DATA_FIELDS,
  ...WEB_FIELDS,
].join(", ");

// 2026-10-12 · 사용자 지시 "B · 변한 데이터만 넣으면 되자나" (TASKS #17)
//   · diff identity 를 (bm_code, row_num) → business_key 로 교체
//   · ERP 가 매 sync 마다 다른 bm_code/row_num 할당 → 과거엔 매번 NEW 판정 → 매 sync 수천 row insert 호출
//   · business_key = (purchase_date, product_code, quantity, unit_price, amount) · DB UNIQUE constraint 와 일치
//   · ERP BuyDate 가 "20261008" 같은 compact string 일 수 있어 ISO ("2026-10-08") 로 normalize 후 비교
function toIsoDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ISO 포맷 ("2026-10-08" 또는 "2026-10-08T00:00:00") 우선 처리
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // compact 형태 ("20261008") 또는 slash/dot ("2026/10/08", "2026.10.08") 처리
  const compact = s.replace(/[^\d]/g, "");
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function businessKey(obj: Record<string, unknown>): string | null {
  const d = toIsoDate(obj.purchase_date);
  const pc = String(obj.product_code ?? "").trim();
  const q = Number(obj.quantity);
  const up = Number(obj.unit_price);
  const am = Number(obj.amount);
  if (!d || !pc || !Number.isFinite(q) || !Number.isFinite(up) || !Number.isFinite(am)) return null;
  return `${d}|${pc}|${q}|${up}|${am}`;
}

export interface BuySyncInput {
  readonly erpRows: readonly ErpBuyRow[];
  readonly pcodeToBarcodeMap: ReadonlyMap<string, string>;
}

export interface BuyChangeDetail {
  readonly db: unknown;
  readonly erp: unknown;
}

export interface BuySyncEntry {
  readonly identity: { bm_code: string; row_num: number };
  readonly action: "NEW" | "CHANGED" | "SAME" | "UNMAPPED";
  readonly productCode: string | null;
  readonly erpPCode: string;
  readonly productName: string;
  readonly changes?: Record<string, BuyChangeDetail>;
}

export interface BuySyncCheckResult {
  readonly supabaseFetchedAt: string;
  readonly erpTotal: number;
  readonly unmappedProduct: number;
  readonly invalidIdentity: number;
  readonly dbRowsMatched: number;
  readonly new: number;
  readonly changed: number;
  readonly same: number;
  readonly entries: ReadonlyArray<BuySyncEntry>;
}

export type BuyErrorType =
  | "DB_INSERT_ERROR"
  | "DB_UPDATE_ERROR"
  | "DUPLICATE_RECOVERED_SAME"
  | "DUPLICATE_RECOVERED_UPDATED"
  | "ERP_IDENTITY_CONFLICT";

export interface BuySyncErrorEntry {
  readonly identity: { bm_code: string; row_num: number };
  readonly message: string;
  // 2026-10-06 · 사용자 요청 · UI 모달에서 operation/code/cause/recovery 표시
  readonly errorType?: BuyErrorType;
  readonly operation?: "INSERT" | "UPDATE";
  readonly dbCode?: string;
  readonly cause?: string;
  readonly recovery?: "SAME" | "UPDATED" | "UNRECOVERED";
}

export interface BuySyncApplyResult extends BuySyncCheckResult {
  readonly allowWrite: boolean;
  readonly inserted: number;
  readonly updated: number;
  readonly updatedCells: number;
  readonly skippedSame: number;
  readonly failed: number;
  readonly readbackMatched: number;
  readonly readbackMismatch: number;
  readonly webModified: number;
  readonly identityModified: number;
  // 2026-10-06 · 사용자 요청 · recoverable 23505 reconciliation
  readonly recoveredSame: number;      // DB 에 이미 identical row → write 없이 복구
  readonly recoveredUpdated: number;   // DB 에 다른 값 row → UPDATE 로 복구
  readonly erpInternalDuplicates: number; // ERP candidate 내부 (BmCode,ROWNUM) 중복 (pre-dedup)
  readonly errors: ReadonlyArray<BuySyncErrorEntry>;
  readonly message?: string;
}

type DbRow = Record<string, unknown>;

function normalizeErpValue(raw: unknown, isNumeric: boolean): unknown {
  if (isErpEmpty(raw)) return null;
  if (isNumeric) {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === "string") return raw.trim();
  return raw ?? null;
}

function sameValue(db: unknown, erp: unknown, isNumeric: boolean): boolean {
  if (isNumeric) {
    const d = db == null ? null : Number(db);
    const e = erp == null ? null : Number(erp);
    return d === e;
  }
  const d = db == null ? "" : String(db).trim();
  const e = erp == null ? "" : String(erp).trim();
  return d === e;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[]);
  return out;
}

// 2026-10-12 · TASKS #17 · ERP rows 의 purchase_date range 로 DB 조회 · business_key map 반환
//   · bm_code `.in` 조회가 매 sync 마다 다른 값이라 매칭 miss 됐던 근본 원인 해결
//   · ERP rows 가 다루는 날짜만 가져오므로 과거 수십만 row 테이블 전부 스캔하지 않음
//   · ORDER BY purchase_date + id · range offset pagination 결정론 보장
async function fetchDbByBusinessKey(
  supabase: SupabaseClient,
  erpRows: readonly ErpBuyRow[],
): Promise<Map<string, DbRow>> {
  const map = new Map<string, DbRow>();
  if (erpRows.length === 0) return map;

  const dates = new Set<string>();
  for (const r of erpRows) {
    const d = toIsoDate(r.BuyDate);
    if (d) dates.add(d);
  }
  if (dates.size === 0) return map;
  const sorted = [...dates].sort();
  const minDate = sorted[0];
  const maxDate = sorted[sorted.length - 1];

  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("purchase_details")
      .select(DB_SELECT_COLS)
      .gte("purchase_date", minDate)
      .lte("purchase_date", maxDate)
      .order("purchase_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`purchase_details fetch (business_key) 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    for (const d of ((data) as unknown) as DbRow[]) {
      const bk = businessKey(d);
      if (bk) map.set(bk, d);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return map;
}

async function fetchDbByIdentity(
  supabase: SupabaseClient,
  bmCodes: readonly string[],
): Promise<Map<string, DbRow>> {
  const map = new Map<string, DbRow>();
  if (bmCodes.length === 0) return map;
  // 2026-10-04 fix · Supabase 기본 limit=1000 · chunk 안 매칭 row 수가 1000 초과시
  //   앞 1000 만 반환 → 미매칭 row 가 NEW 로 오분류 됨
  //   → range pagination 로 chunk 안 전체 가져오기
  // 2026-10-06 fix · ORDER BY 추가 · range offset pagination 결정론 보장
  //   ROOT CAUSE: ORDER BY 없는 Postgres offset pagination 은 순서 비결정적 →
  //     1차/2차 range 가 같은 row 를 중복 반환하고 다른 row 를 누락 →
  //     누락 row 가 "DB 에 없다" 오분류 → NEW 로 INSERT 시도 →
  //     unique constraint "idx_purchase_details_bm_rownum" violation → 1071 failed
  //   큰 bm_code (예: 12260928000009 · row_num 619+) 가 slice 안에 있을 때 발동.
  //   (bm_code, row_num) 은 unique index 이므로 결정론적 정렬 보장.
  for (const slice of chunk(bmCodes, 200)) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("purchase_details")
        .select(DB_SELECT_COLS)
        .in("bm_code", slice)
        .order("bm_code", { ascending: true })
        .order("row_num", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(`purchase_details fetch 실패 · ${error.message}`);
      if (!data || data.length === 0) break;
      for (const d of ((data) as unknown) as DbRow[]) {
        const key = `${String(d.bm_code)}#${String(d.row_num)}`;
        map.set(key, d);
      }
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return map;
}

interface DiffBundle {
  readonly entries: BuySyncEntry[];
  readonly inserts: Array<{ identity: { bm_code: string; row_num: number }; payload: Record<string, unknown> }>;
  // 2026-10-12 · TASKS #17 · dbId 추가 · UPDATE WHERE 를 .eq("id", dbId) 로 쓰기 위해
  readonly updates: Array<{ identity: { bm_code: string; row_num: number }; payload: Record<string, unknown>; changedFields: string[]; dbId: number }>;
  readonly stats: {
    erpTotal: number;
    unmappedProduct: number;
    invalidIdentity: number;
    dbRowsMatched: number;
    new: number;
    changed: number;
    same: number;
  };
}

function buildBuyDiff(
  input: BuySyncInput,
  dbByKey: Map<string, DbRow>,
  erpDedupeStats?: { duplicates: number; conflicts: BuySyncErrorEntry[] },
): DiffBundle {
  const entries: BuySyncEntry[] = [];
  const inserts: DiffBundle["inserts"] = [];
  const updates: DiffBundle["updates"] = [];
  let unmappedProduct = 0;
  let invalidIdentity = 0;
  let countNew = 0;
  let countChanged = 0;
  let countSame = 0;

  // 2026-10-06 · 사용자 요청 · ERP internal duplicate pre-check
  //   같은 (BmCode, ROWNUM) 이 ERP candidate 안에 2건 이상 있으면:
  //     · 값 동일 → 1건만 유지 (silent dedupe)
  //     · 값 다름 → ERP_IDENTITY_CONFLICT 보고 · 임의 선택 금지 (양쪽 모두 skip)
  const erpSeen = new Map<string, ErpBuyRow>();
  const erpSkipKeys = new Set<string>();
  for (const r of input.erpRows) {
    const bm = String(r.BmCode ?? "").trim();
    const rn = Number(r.ROWNUM);
    if (!bm || !Number.isInteger(rn) || rn < 1) continue;
    const key = `${bm}#${rn}`;
    const prev = erpSeen.get(key);
    if (!prev) { erpSeen.set(key, r); continue; }
    // compare ERP fields
    let identical = true;
    for (const mapping of Object.values(ERP_OWNED_PURCHASE_FIELDS)) {
      const a = (prev as Record<string, unknown>)[mapping.erp];
      const b = (r as Record<string, unknown>)[mapping.erp];
      const na = isErpEmpty(a) ? "" : String(a).trim();
      const nb = isErpEmpty(b) ? "" : String(b).trim();
      if (na !== nb) { identical = false; break; }
    }
    if (erpDedupeStats) {
      erpDedupeStats.duplicates++;
      if (!identical) {
        erpSkipKeys.add(key);
        erpDedupeStats.conflicts.push({
          identity: { bm_code: bm, row_num: rn },
          message: `ERP candidate 내 동일 identity 가 서로 다른 값으로 2건 이상 존재`,
          errorType: "ERP_IDENTITY_CONFLICT",
          operation: "INSERT",
          dbCode: "-",
          cause: "ERP (BmCode, ROWNUM) duplicate with conflicting values",
          recovery: "UNRECOVERED",
        });
      }
    }
  }

  const seenInLoop = new Set<string>();
  for (const erpRow of input.erpRows) {
    // 2026-10-06 · ERP internal dedupe · 같은 key 2회+ 는 1회만 처리 (identical) 또는 전부 skip (conflict)
    const bmKey = String(erpRow.BmCode ?? "").trim();
    const rnKey = Number(erpRow.ROWNUM);
    if (bmKey && Number.isInteger(rnKey)) {
      const key = `${bmKey}#${rnKey}`;
      if (erpSkipKeys.has(key)) continue;
      if (seenInLoop.has(key)) continue;
      seenInLoop.add(key);
    }
    let mapped;
    try {
      mapped = buildBuyRowFromErp(erpRow, input.pcodeToBarcodeMap);
    } catch {
      invalidIdentity++;
      continue;
    }
    if (mapped.productMatchStatus === "unmapped") {
      unmappedProduct++;
      // UI 표시용 entry (실제 INSERT/UPDATE 대상 아님 · 사용자 검토용)
      const bm = String(erpRow.BmCode ?? "").trim();
      const rn = Number(erpRow.ROWNUM);
      entries.push({
        identity: { bm_code: bm, row_num: Number.isInteger(rn) ? rn : 0 },
        action: "UNMAPPED",
        productCode: null,
        erpPCode: String(erpRow.PCode ?? ""),
        productName: String(erpRow.ProductName ?? ""),
      });
      continue;
    }
    const { uniqueKey, payload, productCode } = mapped;
    // 2026-10-12 · TASKS #17 · dbByKey 는 business_key 기반 map
    //   · ERP identity (bm_code, row_num) 는 매 sync 마다 바뀌므로 매칭 miss
    //   · business_key = (purchase_date, product_code, quantity, unit_price, amount) 로 과거 매입 재식별
    const bk = businessKey({
      purchase_date: payload.purchase_date,
      product_code: productCode,
      quantity: payload.quantity,
      unit_price: payload.unit_price,
      amount: payload.amount,
    });
    const key = `${uniqueKey.bm_code}#${uniqueKey.row_num}`;

    const db = bk ? dbByKey.get(bk) : undefined;
    if (!db) {
      const insertPayload: Record<string, unknown> = { ...payload, product_code: productCode };
      assertNoProtectedField(insertPayload, PROTECTED_PURCHASE_FIELDS, `buySyncService INSERT (${key})`);
      inserts.push({ identity: uniqueKey, payload: insertPayload });
      entries.push({
        identity: uniqueKey,
        action: "NEW",
        productCode,
        erpPCode: mapped.pCode,
        productName: String(payload.product_name ?? ""),
      });
      countNew++;
      continue;
    }

    const changes: Record<string, BuyChangeDetail> = {};
    const updatePayload: Record<string, unknown> = {};
    for (const [dbCol, mapping] of Object.entries(ERP_OWNED_PURCHASE_FIELDS)) {
      if (IDENTITY_FIELDS.has(dbCol)) continue;
      const erpRaw = (erpRow as Record<string, unknown>)[mapping.erp];
      const erpEmpty = isErpEmpty(erpRaw);
      if (erpEmpty && !mapping.nullOverwrite) continue;
      const isNumeric = NUMERIC_FIELDS.has(dbCol);
      const normalized = normalizeErpValue(erpRaw, isNumeric);
      const dbVal = db[dbCol];
      if (sameValue(dbVal, normalized, isNumeric)) continue;
      changes[dbCol] = { db: dbVal ?? null, erp: normalized };
      updatePayload[dbCol] = normalized;
    }

    if (Object.keys(changes).length === 0) {
      entries.push({
        identity: uniqueKey,
        action: "SAME",
        productCode,
        erpPCode: mapped.pCode,
        productName: String(payload.product_name ?? ""),
      });
      countSame++;
    } else {
      assertNoProtectedField(updatePayload, PROTECTED_PURCHASE_FIELDS, `buySyncService UPDATE (${key})`);
      // 2026-10-12 · TASKS #17 · dbId = DB primary key · UPDATE WHERE 에 사용 (bm_code+row_num 대신)
      const dbId = Number((db as DbRow).id);
      updates.push({ identity: uniqueKey, payload: updatePayload, changedFields: Object.keys(changes), dbId });
      entries.push({
        identity: uniqueKey,
        action: "CHANGED",
        productCode,
        erpPCode: mapped.pCode,
        productName: String(payload.product_name ?? ""),
        changes,
      });
      countChanged++;
    }
  }

  return {
    entries,
    inserts,
    updates,
    stats: {
      erpTotal: input.erpRows.length,
      unmappedProduct,
      invalidIdentity,
      dbRowsMatched: dbByKey.size,
      new: countNew,
      changed: countChanged,
      same: countSame,
    },
  };
}

/** CHECK · fresh Supabase fetch + diff · DB WRITE 없음 */
export async function runBuySyncCheck(input: BuySyncInput): Promise<BuySyncCheckResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정 · SUPABASE_URL / SUPABASE_KEY 환경변수 확인");

  const supabaseFetchedAt = new Date().toISOString();
  // 2026-10-12 · TASKS #17 · business_key map (bm_code lookup → purchase_date range lookup)
  const dbByKey = await fetchDbByBusinessKey(supabase, input.erpRows);
  const dedupeStats = { duplicates: 0, conflicts: [] as BuySyncErrorEntry[] };
  const diff = buildBuyDiff(input, dbByKey, dedupeStats);

  return {
    supabaseFetchedAt,
    erpTotal: diff.stats.erpTotal,
    unmappedProduct: diff.stats.unmappedProduct,
    invalidIdentity: diff.stats.invalidIdentity,
    dbRowsMatched: diff.stats.dbRowsMatched,
    new: diff.stats.new,
    changed: diff.stats.changed,
    same: diff.stats.same,
    entries: diff.entries,
  };
}

/**
 * 23505 (unique_violation) recoverable 처리.
 * INSERT batch 가 duplicate 로 실패하면 batch 전체가 Postgres에 commit 안 되므로
 *   fresh re-query 로 각 identity 를 분류:
 *     A. DB SAME → RECOVERED_SAME (write 없음)
 *     B. DB CHANGED → UPDATE 1건 → RECOVERED_UPDATED
 *     C. DB NOT FOUND → race 또는 ERP identity conflict · 재시도 1회 · 그래도 실패하면 UNRECOVERED
 */
async function reconcileDuplicateBatch(
  supabase: SupabaseClient,
  batch: Array<{ identity: { bm_code: string; row_num: number }; payload: Record<string, unknown> }>,
): Promise<{
  recoveredSame: number;
  recoveredUpdated: number;
  updatedCells: number;
  realErrors: number;
  inserted: number;
  errors: BuySyncErrorEntry[];
}> {
  const bmCodes = [...new Set(batch.map((b) => b.identity.bm_code))];
  const dbMap = await fetchDbByIdentity(supabase, bmCodes);

  let recoveredSame = 0;
  let recoveredUpdated = 0;
  let updatedCells = 0;
  let realErrors = 0;
  let inserted = 0;
  const errors: BuySyncErrorEntry[] = [];
  const updateTargets: Array<{ identity: { bm_code: string; row_num: number }; payload: Record<string, unknown>; changedFields: string[] }> = [];
  const retryInserts: typeof batch = [];

  for (const item of batch) {
    const key = `${item.identity.bm_code}#${item.identity.row_num}`;
    const dbRow = dbMap.get(key);
    if (!dbRow) {
      // race condition · 또 다른 process INSERT 후 UPDATE 가능성 · retry 1회
      retryInserts.push(item);
      continue;
    }
    // DB 에 존재 · ERP payload 와 compare (ERP-owned 필드만)
    const changes: Record<string, unknown> = {};
    const changedFields: string[] = [];
    for (const [dbCol, mapping] of Object.entries(ERP_OWNED_PURCHASE_FIELDS)) {
      if (IDENTITY_FIELDS.has(dbCol)) continue;
      const erpVal = item.payload[dbCol];
      const erpEmpty = isErpEmpty(erpVal);
      if (erpEmpty && !mapping.nullOverwrite) continue;
      const isNumeric = NUMERIC_FIELDS.has(dbCol);
      if (!sameValue(dbRow[dbCol], erpVal, isNumeric)) {
        changes[dbCol] = erpVal;
        changedFields.push(dbCol);
      }
    }
    if (changedFields.length === 0) {
      recoveredSame++;
      errors.push({
        identity: item.identity,
        message: "DB 에 identical row 존재 · write 없이 복구",
        errorType: "DUPLICATE_RECOVERED_SAME",
        operation: "INSERT",
        dbCode: "23505",
        cause: "Identity already existed with same values",
        recovery: "SAME",
      });
    } else {
      assertNoProtectedField(changes, PROTECTED_PURCHASE_FIELDS, `reconcileDuplicateBatch UPDATE (${key})`);
      updateTargets.push({ identity: item.identity, payload: changes, changedFields });
    }
  }

  // UPDATE 적용 (parallel 10)
  const PAR = 10;
  for (let i = 0; i < updateTargets.length; i += PAR) {
    const slice = updateTargets.slice(i, i + PAR);
    const results = await Promise.all(
      slice.map(async (u) => {
        const { error } = await supabase
          .from("purchase_details")
          .update(u.payload)
          .eq("bm_code", u.identity.bm_code)
          .eq("row_num", u.identity.row_num);
        return { u, error: error?.message };
      }),
    );
    for (const r of results) {
      if (r.error) {
        realErrors++;
        errors.push({
          identity: r.u.identity,
          message: `복구 UPDATE 실패 · ${r.error}`,
          errorType: "DB_UPDATE_ERROR",
          operation: "UPDATE",
          dbCode: "-",
          cause: "Reconciliation UPDATE failed",
          recovery: "UNRECOVERED",
        });
      } else {
        recoveredUpdated++;
        updatedCells += r.u.changedFields.length;
        errors.push({
          identity: r.u.identity,
          message: `DB 에 다른 값 row 존재 · UPDATE ${r.u.changedFields.length}개 field 로 복구`,
          errorType: "DUPLICATE_RECOVERED_UPDATED",
          operation: "UPDATE",
          dbCode: "23505",
          cause: "Identity already existed with different values",
          recovery: "UPDATED",
        });
      }
    }
  }

  // retryInserts · fresh query 에서도 못 찾은 identity · race condition 또는 ERP conflict
  if (retryInserts.length > 0) {
    const retryPayloads = retryInserts.map((x) => x.payload);
    const { data, error } = await supabase
      .from("purchase_details")
      .insert(retryPayloads)
      .select("bm_code, row_num");
    if (error) {
      realErrors += retryInserts.length;
      for (const item of retryInserts) {
        errors.push({
          identity: item.identity,
          message: `재시도 INSERT 실패 · ${error.message}`,
          errorType: "DB_INSERT_ERROR",
          operation: "INSERT",
          dbCode: typeof error.code === "string" ? error.code : "-",
          cause: "Retry INSERT also failed",
          recovery: "UNRECOVERED",
        });
      }
    } else {
      inserted += (data?.length ?? 0);
    }
  }

  return { recoveredSame, recoveredUpdated, updatedCells, realErrors, inserted, errors };
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === "23505") return true;
  return /duplicate key value violates unique constraint/i.test(String(error.message ?? ""));
}

/** APPLY · 동일 rows + fresh Supabase fetch · NEW INSERT + CHANGED UPDATE + Read-back */
export async function applyBuySync(
  input: BuySyncInput & { allowWrite: boolean },
): Promise<BuySyncApplyResult> {
  const startedAt = new Date().toISOString();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정");

  // 2026-10-12 · TASKS #17 · business_key map (bm_code lookup → purchase_date range lookup)
  const dbByKey = await fetchDbByBusinessKey(supabase, input.erpRows);
  // 2026-10-06 · ERP internal dedupe 통계 수집
  const dedupeStats = { duplicates: 0, conflicts: [] as BuySyncErrorEntry[] };
  const diff = buildBuyDiff(input, dbByKey, dedupeStats);

  const base: BuySyncCheckResult = {
    supabaseFetchedAt: startedAt,
    erpTotal: diff.stats.erpTotal,
    unmappedProduct: diff.stats.unmappedProduct,
    invalidIdentity: diff.stats.invalidIdentity,
    dbRowsMatched: diff.stats.dbRowsMatched,
    new: diff.stats.new,
    changed: diff.stats.changed,
    same: diff.stats.same,
    entries: diff.entries,
  };

  if (!input.allowWrite) {
    return {
      ...base,
      allowWrite: false,
      inserted: 0, updated: 0, updatedCells: 0, skippedSame: diff.stats.same,
      failed: 0, readbackMatched: 0, readbackMismatch: 0,
      webModified: 0, identityModified: 0,
      recoveredSame: 0, recoveredUpdated: 0,
      erpInternalDuplicates: dedupeStats.duplicates,
      errors: [],
      message: "allowWrite=false · WRITE 안 함 (안전장치)",
    };
  }

  // 2026-10-12 · TASKS #17 · webBefore key 를 DB id 로 전환 (ERP bm_code 변동 무관)
  const webBefore = new Map<string, Record<string, unknown>>();
  for (const d of dbByKey.values()) {
    const idKey = String(d.id ?? "");
    if (!idKey) continue;
    const snap: Record<string, unknown> = {};
    for (const w of WEB_FIELDS) snap[w] = d[w] ?? null;
    webBefore.set(idKey, snap);
  }
  // 2026-10-12 · TASKS #17 · insert 로 들어간 row 의 (bm_code,row_num) → id 매핑 (read-back 용)
  const insertedIdMap = new Map<string, number>();

  const errors: BuySyncErrorEntry[] = [];
  // ERP internal conflicts 가 있으면 errors 에 먼저 적재 (fresh verify 전에 UI 노출)
  for (const e of dedupeStats.conflicts) {
    if (errors.length < 20) errors.push(e);
  }
  let inserted = 0;
  let updated = 0;
  let updatedCells = 0;
  let failed = 0;
  // 2026-10-06 · 사용자 요청 · recoverable reconciliation 통계
  let recoveredSame = 0;
  let recoveredUpdated = 0;

  for (const batch of chunk(diff.inserts, 500)) {
    const payloads = batch.map((b) => b.payload);
    // 2026-10-12 · 사용자 지시 "같은 데이터는 덮어써야지 · 이런 일 없도록"
    //   · DB 에 UNIQUE constraint 미적용 상태에서 `.insert()` → 매 sync 마다 중복 row 수백 건 쌓임
    //   · 해결: business key `(purchase_date, product_code, quantity, unit_price, amount)` 조합으로 UPSERT
    // 2026-10-15 · 사용자 지시 "일별로 덮어쓰기 · 같은 날이면 UPDATE"
    //   · ignoreDuplicates: true → false · 매입 UPDATE 모드 활성
    //   · 같은 business_key 면 skip 아니라 **UPDATE** (수량/가격 변경 반영)
    //   · 실제로는 business_key 가 수량/가격 포함이라 CHANGED 는 다른 key · onConflict 매칭 시 bm_code/row_num 메타 UPDATE
    const { data, error } = await supabase
      .from("purchase_details")
      .upsert(payloads, {
        onConflict: "purchase_date,product_code,quantity,unit_price,amount",
        ignoreDuplicates: false,
      })
      .select("id, bm_code, row_num");
    if (!error) {
      inserted += (data?.length ?? 0);
      // 2026-10-12 · TASKS #17 · inserted row → id 매핑 (read-back 용 · ignoreDuplicates 로 skip 된 건 반환 X)
      for (const row of ((data ?? []) as unknown) as Array<{ id: number; bm_code: string; row_num: number }>) {
        insertedIdMap.set(`${String(row.bm_code)}#${String(row.row_num)}`, Number(row.id));
      }
      continue;
    }
    // 2026-10-06 · 사용자 요청 · 23505 unique_violation 은 recoverable
    //   batch 전체가 Postgres 레벨 rollback 되므로 fresh re-query 로 각 identity 분류:
    //     A. DB SAME → RECOVERED_SAME (write 없음)
    //     B. DB CHANGED → UPDATE → RECOVERED_UPDATED
    //     C. DB NOT FOUND → race condition · retry 1회 · 그래도 실패하면 UNRECOVERED
    const samplePayload = payloads[0] ? JSON.stringify(payloads[0]).slice(0, 200) : "(empty)";
    console.warn(
      `[buySyncService] INSERT batch 23505/error · batch=${batch.length}건 · error="${error.message}" · code=${error.code ?? "-"} · hint="${error.hint ?? "-"}" · details="${error.details ?? "-"}" · payload[0]=${samplePayload}`,
    );
    if (isUniqueViolation(error as { code?: string; message?: string })) {
      const rec = await reconcileDuplicateBatch(supabase, batch);
      recoveredSame += rec.recoveredSame;
      recoveredUpdated += rec.recoveredUpdated;
      updatedCells += rec.updatedCells;
      inserted += rec.inserted;
      failed += rec.realErrors;
      for (const e of rec.errors) {
        if (errors.length < 20) errors.push(e);
      }
      console.info(
        `[buySyncService] reconcile · recoveredSame=${rec.recoveredSame} · recoveredUpdated=${rec.recoveredUpdated} · retryInserted=${rec.inserted} · realErrors=${rec.realErrors}`,
      );
    } else {
      // non-unique DB error → batch 전체 real error · UNRECOVERED
      failed += batch.length;
      for (const item of batch) {
        if (errors.length < 20) {
          errors.push({
            identity: item.identity,
            message: `INSERT batch 실패 · ${error.message}`,
            errorType: "DB_INSERT_ERROR",
            operation: "INSERT",
            dbCode: typeof error.code === "string" ? error.code : "-",
            cause: "INSERT batch non-unique error",
            recovery: "UNRECOVERED",
          });
        }
      }
    }
  }

  const PAR = 10;
  for (let i = 0; i < diff.updates.length; i += PAR) {
    const slice = diff.updates.slice(i, i + PAR);
    const results = await Promise.all(
      slice.map(async (u) => {
        // 2026-10-12 · TASKS #17 · UPDATE WHERE = id (ERP bm_code/row_num 변동 무관)
        const { error } = await supabase
          .from("purchase_details")
          .update(u.payload)
          .eq("id", u.dbId);
        return { u, error: error?.message };
      }),
    );
    for (const r of results) {
      if (r.error) {
        failed++;
        if (errors.length < 20) {
          errors.push({
            identity: r.u.identity,
            message: `UPDATE 실패 · ${r.error}`,
            errorType: "DB_UPDATE_ERROR",
            operation: "UPDATE",
            dbCode: "-",
            cause: "DB UPDATE failed",
            recovery: "UNRECOVERED",
          });
        }
      } else {
        updated++;
        updatedCells += r.u.changedFields.length;
      }
    }
  }

  // 2026-10-12 · TASKS #17 · read-back 을 id 기반으로 전환
  //   · updates 는 u.dbId · inserts 는 upsert returned id (ignoreDuplicates 로 skip 된 건 생략)
  const touchedIds = new Set<number>();
  for (const u of diff.updates) if (Number.isFinite(u.dbId)) touchedIds.add(u.dbId);
  for (const id of insertedIdMap.values()) touchedIds.add(id);
  const readbackMap = new Map<string, DbRow>();
  for (const slice of chunk([...touchedIds], 200)) {
    const { data, error } = await supabase
      .from("purchase_details")
      .select(DB_SELECT_COLS)
      .in("id", slice);
    if (error) throw new Error(`read-back 실패 · ${error.message}`);
    for (const d of ((data ?? []) as unknown) as DbRow[]) {
      readbackMap.set(String(d.id), d);
    }
  }

  let readbackMatched = 0;
  let readbackMismatch = 0;
  let webModified = 0;
  let identityModified = 0;

  for (const u of diff.updates) {
    // 2026-10-12 · TASKS #17 · readback/webBefore 를 DB id 로 lookup
    //   · identityModified 체크는 "ERP 가 보낸 bm_code/row_num 과 DB 저장값이 다른지" · 매번 다름이 정상이므로 체크 제거
    const key = String(u.dbId);
    const back = readbackMap.get(key);
    if (!back) { readbackMismatch++; continue; }
    const web = webBefore.get(key);
    if (web) {
      for (const w of WEB_FIELDS) {
        const b = web[w];
        const a = back[w];
        if ((b === null && a === null) || b === a) continue;
        if (JSON.stringify(b) !== JSON.stringify(a)) webModified++;
      }
    }
    let allMatch = true;
    for (const f of u.changedFields) {
      const expected = u.payload[f];
      const actual = back[f];
      const m = sameValue(actual, expected, NUMERIC_FIELDS.has(f));
      if (!m) { allMatch = false; break; }
    }
    if (allMatch) readbackMatched++;
    else readbackMismatch++;
  }

  for (const ins of diff.inserts) {
    // 2026-10-12 · TASKS #17 · insertedIdMap 에서 id 찾기 · 못 찾으면 upsert ignoreDuplicates skip (match 불가 · skip)
    const insId = insertedIdMap.get(`${ins.identity.bm_code}#${ins.identity.row_num}`);
    if (!insId) continue;
    const back = readbackMap.get(String(insId));
    if (!back) { readbackMismatch++; continue; }
    let allMatch = true;
    for (const f of Object.keys(ins.payload)) {
      if (f === "bm_code" || f === "row_num") continue;
      const expected = ins.payload[f];
      const actual = back[f];
      const m = sameValue(actual, expected, NUMERIC_FIELDS.has(f));
      if (!m) { allMatch = false; break; }
    }
    if (allMatch) readbackMatched++;
    else readbackMismatch++;
  }

  const result: BuySyncApplyResult = {
    ...base,
    allowWrite: true,
    inserted,
    updated,
    updatedCells,
    skippedSame: diff.stats.same,
    failed,
    readbackMatched,
    readbackMismatch,
    webModified,
    identityModified,
    recoveredSame,
    recoveredUpdated,
    erpInternalDuplicates: dedupeStats.duplicates,
    errors,
  };

  try {
    appendSyncHistory("BUY_STATUS", {
      startedAt,
      completedAt: new Date().toISOString(),
      // 2026-10-06 · ok = unrecovered failed === 0 (복구된 duplicate 는 성공 간주)
      ok: failed === 0 && identityModified === 0 && webModified === 0,
      updatedRows: inserted + updated + recoveredUpdated,
      updatedCells,
      skippedSame: diff.stats.same,
      failed,
      webModified,
      identityModified,
      readbackMatched,
      readbackMismatch,
      // 2026-10-06 · 사용자 요청 · recovery / ERP duplicate 통계 저장 (UI 모달 요약)
      recoveredSame,
      recoveredUpdated,
      erpInternalDuplicates: dedupeStats.duplicates,
      erpCacheFetchedAt: null,
      erpCacheRowCount: diff.stats.erpTotal,
      // 2026-10-06 · 사용자 승인 · 실패 디버깅용 샘플 저장 (최대 20건) · errorType/operation/code/cause/recovery 포함
      errors: errors.length > 0
        ? errors.slice(0, 20).map((e) => ({
            identity: `${e.identity.bm_code}#${e.identity.row_num}`,
            message: e.message,
            errorType: e.errorType,
            operation: e.operation,
            dbCode: e.dbCode,
            cause: e.cause,
            recovery: e.recovery,
          }))
        : undefined,
    } as Parameters<typeof appendSyncHistory>[1]);
  } catch (err) {
    console.warn(`[buySyncService] 이력 기록 실패 · ${(err as Error).message}`);
  }

  return result;
}
