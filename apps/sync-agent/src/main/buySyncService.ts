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
  readonly errors: ReadonlyArray<{ identity: { bm_code: string; row_num: number }; message: string }>;
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

async function fetchDbByIdentity(
  supabase: SupabaseClient,
  bmCodes: readonly string[],
): Promise<Map<string, DbRow>> {
  const map = new Map<string, DbRow>();
  if (bmCodes.length === 0) return map;
  // 2026-10-04 fix · Supabase 기본 limit=1000 · chunk 안 매칭 row 수가 1000 초과시
  //   앞 1000 만 반환 → 미매칭 row 가 NEW 로 오분류 됨
  //   → range pagination 로 chunk 안 전체 가져오기
  for (const slice of chunk(bmCodes, 200)) {
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("purchase_details")
        .select(DB_SELECT_COLS)
        .in("bm_code", slice)
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
  readonly updates: Array<{ identity: { bm_code: string; row_num: number }; payload: Record<string, unknown>; changedFields: string[] }>;
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

function buildBuyDiff(input: BuySyncInput, dbByKey: Map<string, DbRow>): DiffBundle {
  const entries: BuySyncEntry[] = [];
  const inserts: DiffBundle["inserts"] = [];
  const updates: DiffBundle["updates"] = [];
  let unmappedProduct = 0;
  let invalidIdentity = 0;
  let countNew = 0;
  let countChanged = 0;
  let countSame = 0;

  for (const erpRow of input.erpRows) {
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
    const key = `${uniqueKey.bm_code}#${uniqueKey.row_num}`;

    const db = dbByKey.get(key);
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
      updates.push({ identity: uniqueKey, payload: updatePayload, changedFields: Object.keys(changes) });
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

function getBmCodes(input: BuySyncInput): string[] {
  const set = new Set<string>();
  for (const r of input.erpRows) {
    const bm = String(r.BmCode ?? "").trim();
    if (bm) set.add(bm);
  }
  return [...set];
}

/** CHECK · fresh Supabase fetch + diff · DB WRITE 없음 */
export async function runBuySyncCheck(input: BuySyncInput): Promise<BuySyncCheckResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정 · SUPABASE_URL / SUPABASE_KEY 환경변수 확인");

  const supabaseFetchedAt = new Date().toISOString();
  const dbByKey = await fetchDbByIdentity(supabase, getBmCodes(input));
  const diff = buildBuyDiff(input, dbByKey);

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

/** APPLY · 동일 rows + fresh Supabase fetch · NEW INSERT + CHANGED UPDATE + Read-back */
export async function applyBuySync(
  input: BuySyncInput & { allowWrite: boolean },
): Promise<BuySyncApplyResult> {
  const startedAt = new Date().toISOString();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정");

  const dbByKey = await fetchDbByIdentity(supabase, getBmCodes(input));
  const diff = buildBuyDiff(input, dbByKey);

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
      errors: [],
      message: "allowWrite=false · WRITE 안 함 (안전장치)",
    };
  }

  const webBefore = new Map<string, Record<string, unknown>>();
  for (const [key, d] of dbByKey.entries()) {
    const snap: Record<string, unknown> = {};
    for (const w of WEB_FIELDS) snap[w] = d[w] ?? null;
    webBefore.set(key, snap);
  }

  const errors: Array<{ identity: { bm_code: string; row_num: number }; message: string }> = [];
  let inserted = 0;
  let updated = 0;
  let updatedCells = 0;
  let failed = 0;

  for (const batch of chunk(diff.inserts, 500)) {
    const payloads = batch.map((b) => b.payload);
    const { data, error } = await supabase
      .from("purchase_details")
      .insert(payloads)
      .select("bm_code, row_num");
    if (error) {
      failed += batch.length;
      // batch 전체 실패 · 첫 identity + error 전문 + payload sample 기록
      const samplePayload = payloads[0] ? JSON.stringify(payloads[0]).slice(0, 200) : "(empty)";
      console.error(
        `[buySyncService] INSERT batch 실패 · batch=${batch.length}건 · error="${error.message}" · code=${error.code ?? "-"} · hint="${error.hint ?? "-"}" · details="${error.details ?? "-"}" · payload[0]=${samplePayload}`,
      );
      // errors[] 에 batch 안 identity 전부 기록 (상한 20 유지 · 원인 추적용)
      for (const item of batch) {
        if (errors.length >= 20) break;
        errors.push({ identity: item.identity, message: `INSERT batch 실패 · ${error.message}` });
      }
    } else {
      inserted += (data?.length ?? 0);
    }
  }

  const PAR = 10;
  for (let i = 0; i < diff.updates.length; i += PAR) {
    const slice = diff.updates.slice(i, i + PAR);
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
        failed++;
        if (errors.length < 20) errors.push({ identity: r.u.identity, message: r.error });
      } else {
        updated++;
        updatedCells += r.u.changedFields.length;
      }
    }
  }

  const touchedBmCodes = new Set<string>();
  for (const i of diff.inserts) touchedBmCodes.add(i.identity.bm_code);
  for (const u of diff.updates) touchedBmCodes.add(u.identity.bm_code);
  const readbackMap = new Map<string, DbRow>();
  for (const slice of chunk([...touchedBmCodes], 200)) {
    const { data, error } = await supabase
      .from("purchase_details")
      .select(DB_SELECT_COLS)
      .in("bm_code", slice);
    if (error) throw new Error(`read-back 실패 · ${error.message}`);
    for (const d of ((data ?? []) as unknown) as DbRow[]) {
      readbackMap.set(`${String(d.bm_code)}#${String(d.row_num)}`, d);
    }
  }

  let readbackMatched = 0;
  let readbackMismatch = 0;
  let webModified = 0;
  let identityModified = 0;

  for (const u of diff.updates) {
    const key = `${u.identity.bm_code}#${u.identity.row_num}`;
    const back = readbackMap.get(key);
    if (!back) { readbackMismatch++; continue; }
    if (String(back.bm_code) !== u.identity.bm_code || Number(back.row_num) !== u.identity.row_num) {
      identityModified++;
    }
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
    const key = `${ins.identity.bm_code}#${ins.identity.row_num}`;
    const back = readbackMap.get(key);
    if (!back) { readbackMismatch++; continue; }
    if (String(back.bm_code) !== ins.identity.bm_code || Number(back.row_num) !== ins.identity.row_num) {
      identityModified++;
    }
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
    errors,
  };

  try {
    appendSyncHistory("BUY_STATUS", {
      startedAt,
      completedAt: new Date().toISOString(),
      ok: failed === 0 && identityModified === 0 && webModified === 0,
      updatedRows: inserted + updated,
      updatedCells,
      skippedSame: diff.stats.same,
      failed,
      webModified,
      identityModified,
      readbackMatched,
      readbackMismatch,
      erpCacheFetchedAt: null,
      erpCacheRowCount: diff.stats.erpTotal,
    });
  } catch (err) {
    console.warn(`[buySyncService] 이력 기록 실패 · ${(err as Error).message}`);
  }

  return result;
}
