// apps/sync-agent/src/main/stockHistorySyncService.ts
// 2026-10-04 · Phase 1 · stock_history Sync Service (Electron main · BUY sync 와 동형 패턴)
//
// 사용자 지시 (XLSX 폐기 반영):
//   · 호출자가 넘겨준 "현재 ERP rows + metadata (period_start/end)" 만 사용
//   · ERP 재조회 X · Local 재조회 X
//   · identity: (period_start, period_end, st_code, pcode)
//   · 비교·UPDATE 대상: ERP_OWNED_INVENTORY_FIELDS 17 field 재고 수량만
//   · PROTECTED (product_code · product_name · 금액 · period_type 등) UPDATE payload 완전 제외
//   · NEW INSERT · CHANGED UPDATE · SAME SKIP · DELETE 없음
//   · products.current_stock 수정 금지 (별도 테이블)

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { appendSyncHistory } from "./syncHistoryStore";
import {
  type ErpInventoryRow,
  type InventoryMetadata,
  buildInventoryRowFromErp,
} from "../../../../src/shared/erp/erpInventoryMapper";
import {
  ERP_OWNED_INVENTORY_FIELDS,
  PROTECTED_INVENTORY_FIELDS,
  assertNoProtectedField,
  isErpEmpty,
} from "../../../../src/shared/erp/erpSyncWhitelist";

const IDENTITY_FIELDS = new Set(["period_start", "period_end", "st_code", "pcode"]);
const COMPARE_FIELDS = Object.keys(ERP_OWNED_INVENTORY_FIELDS);
// Supabase SELECT · identity + 17 ERP 재고 field + PROTECTED (read-back 보호 검증용)
const DB_SELECT_COLS = [
  "id",
  "period_start", "period_end", "st_code", "pcode",
  ...COMPARE_FIELDS,
  ...PROTECTED_INVENTORY_FIELDS.filter((f) => f !== "id" && f !== "created_at"),
].join(", ");

export interface StockHistorySyncInput {
  readonly erpRows: readonly ErpInventoryRow[];
  readonly metadata: InventoryMetadata;
  /** ERP.PCode → products.product_code (Barcode) · 2026-10-05 사용자 지시 · INSERT 시 product_code 저장 */
  readonly pcodeToBarcodeMap?: ReadonlyMap<string, string>;
}

export interface InventoryChangeDetail {
  readonly db: unknown;
  readonly erp: unknown;
}

export interface InventorySyncEntry {
  readonly identity: {
    period_start: string;
    period_end: string;
    st_code: string;
    pcode: string;
  };
  readonly action: "NEW" | "CHANGED" | "SAME";
  readonly productName: string;
  readonly changes?: Record<string, InventoryChangeDetail>;
}

export interface StockHistorySyncCheckResult {
  readonly supabaseFetchedAt: string;
  readonly erpTotal: number;
  readonly invalidIdentity: number;
  readonly dbRowsMatched: number;
  readonly new: number;
  readonly changed: number;
  readonly same: number;
  readonly entries: ReadonlyArray<InventorySyncEntry>;
}

export interface StockHistorySyncApplyResult extends StockHistorySyncCheckResult {
  readonly allowWrite: boolean;
  readonly inserted: number;
  readonly updated: number;
  readonly updatedCells: number;
  readonly skippedSame: number;
  readonly failed: number;
  readonly readbackMatched: number;
  readonly readbackMismatch: number;
  readonly protectedModified: number;    // PROTECTED field 변경 (0 기대)
  readonly identityModified: number;     // identity 변경 (0 기대)
  readonly errors: ReadonlyArray<{ pcode: string; message: string }>;
  readonly message?: string;
}

type DbRow = Record<string, unknown>;

function normalizeErpValue(raw: unknown): number | null {
  if (isErpEmpty(raw)) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function sameNumeric(db: unknown, erp: unknown): boolean {
  const d = db == null ? null : Number(db);
  const e = erp == null ? null : Number(erp);
  return d === e;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[]);
  return out;
}

/**
 * Supabase 에서 동일 (period_start, period_end, st_code) 범위 안
 * pcode IN (chunk) 로 fresh fetch.
 */
async function fetchDbByIdentity(
  supabase: SupabaseClient,
  input: StockHistorySyncInput,
): Promise<Map<string, DbRow>> {
  const map = new Map<string, DbRow>();
  const pcodes = [...new Set(input.erpRows.map((r) => String(r.PCode ?? "").trim()).filter(Boolean))];
  if (pcodes.length === 0) return map;
  // 단일 조회 (ERP 응답은 1개 period · 1개 st_code · 다수 pcode)
  const { period_start, period_end } = input.metadata;
  for (const slice of chunk(pcodes, 200)) {
    const { data, error } = await supabase
      .from("stock_history")
      .select(DB_SELECT_COLS)
      .eq("period_start", period_start)
      .eq("period_end", period_end)
      .in("pcode", slice);
    if (error) throw new Error(`stock_history fetch 실패 · ${error.message}`);
    for (const d of ((data ?? []) as unknown) as DbRow[]) {
      // identity: period_start · period_end · st_code · pcode
      const key = `${String(d.period_start)}#${String(d.period_end)}#${String(d.st_code ?? "")}#${String(d.pcode ?? "")}`;
      map.set(key, d);
    }
  }
  return map;
}

interface DiffBundle {
  readonly entries: InventorySyncEntry[];
  readonly inserts: Array<{ identity: InventorySyncEntry["identity"]; payload: Record<string, unknown>; pcode: string }>;
  readonly updates: Array<{ identity: InventorySyncEntry["identity"]; payload: Record<string, unknown>; changedFields: string[]; pcode: string }>;
  readonly stats: {
    erpTotal: number;
    invalidIdentity: number;
    dbRowsMatched: number;
    new: number;
    changed: number;
    same: number;
  };
}

function buildInventoryDiff(input: StockHistorySyncInput, dbByKey: Map<string, DbRow>): DiffBundle {
  const entries: InventorySyncEntry[] = [];
  const inserts: DiffBundle["inserts"] = [];
  const updates: DiffBundle["updates"] = [];
  let invalidIdentity = 0;
  let countNew = 0;
  let countChanged = 0;
  let countSame = 0;

  for (const erpRow of input.erpRows) {
    let mapped;
    try {
      mapped = buildInventoryRowFromErp(erpRow, input.metadata, input.pcodeToBarcodeMap);
    } catch {
      invalidIdentity++;
      continue;
    }
    const { uniqueKey, payload } = mapped;
    const key = `${uniqueKey.period_start}#${uniqueKey.period_end}#${uniqueKey.st_code}#${uniqueKey.pcode}`;
    const productName = String(erpRow.ProductName ?? "");

    const db = dbByKey.get(key);
    if (!db) {
      // NEW
      // INSERT payload: identity + 17 ERP 재고 수량 + updated_at (PROTECTED 완전 제외)
      const insertPayload: Record<string, unknown> = {
        ...payload,
        updated_at: new Date().toISOString(),
      };
      assertNoProtectedField(insertPayload, PROTECTED_INVENTORY_FIELDS, `stockHistorySyncService INSERT (${key})`);
      inserts.push({ identity: uniqueKey, payload: insertPayload, pcode: uniqueKey.pcode });
      entries.push({ identity: uniqueKey, action: "NEW", productName });
      countNew++;
      continue;
    }

    // CHANGED vs SAME · 17 ERP 재고 수량만 비교
    const changes: Record<string, InventoryChangeDetail> = {};
    const updatePayload: Record<string, unknown> = {};
    for (const [dbCol, mapping] of Object.entries(ERP_OWNED_INVENTORY_FIELDS)) {
      if (IDENTITY_FIELDS.has(dbCol)) continue;
      const erpRaw = (erpRow as Record<string, unknown>)[mapping.erp];
      const erpEmpty = isErpEmpty(erpRaw);
      if (erpEmpty && !mapping.nullOverwrite) continue;
      const normalized = normalizeErpValue(erpRaw);
      const dbVal = db[dbCol];
      if (sameNumeric(dbVal, normalized)) continue;
      changes[dbCol] = { db: dbVal ?? null, erp: normalized };
      updatePayload[dbCol] = normalized;
    }

    if (Object.keys(changes).length === 0) {
      entries.push({ identity: uniqueKey, action: "SAME", productName });
      countSame++;
    } else {
      // UPDATE payload: changed ERP field + updated_at (PROTECTED/identity 완전 제외)
      updatePayload.updated_at = new Date().toISOString();
      assertNoProtectedField(updatePayload, PROTECTED_INVENTORY_FIELDS, `stockHistorySyncService UPDATE (${key})`);
      updates.push({ identity: uniqueKey, payload: updatePayload, changedFields: Object.keys(changes), pcode: uniqueKey.pcode });
      entries.push({ identity: uniqueKey, action: "CHANGED", productName, changes });
      countChanged++;
    }
  }

  return {
    entries,
    inserts,
    updates,
    stats: {
      erpTotal: input.erpRows.length,
      invalidIdentity,
      dbRowsMatched: dbByKey.size,
      new: countNew,
      changed: countChanged,
      same: countSame,
    },
  };
}

/** CHECK · fresh Supabase fetch + diff · DB WRITE 없음 */
export async function runStockHistorySyncCheck(input: StockHistorySyncInput): Promise<StockHistorySyncCheckResult> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정 · SUPABASE_URL / SUPABASE_KEY 환경변수 확인");

  const supabaseFetchedAt = new Date().toISOString();
  const dbByKey = await fetchDbByIdentity(supabase, input);
  const diff = buildInventoryDiff(input, dbByKey);

  return {
    supabaseFetchedAt,
    erpTotal: diff.stats.erpTotal,
    invalidIdentity: diff.stats.invalidIdentity,
    dbRowsMatched: diff.stats.dbRowsMatched,
    new: diff.stats.new,
    changed: diff.stats.changed,
    same: diff.stats.same,
    entries: diff.entries,
  };
}

/** APPLY · 동일 rows + fresh fetch · NEW INSERT + CHANGED UPDATE + Read-back */
export async function applyStockHistorySync(
  input: StockHistorySyncInput & { allowWrite: boolean },
): Promise<StockHistorySyncApplyResult> {
  const startedAt = new Date().toISOString();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정");

  const dbByKey = await fetchDbByIdentity(supabase, input);
  const diff = buildInventoryDiff(input, dbByKey);

  const base: StockHistorySyncCheckResult = {
    supabaseFetchedAt: startedAt,
    erpTotal: diff.stats.erpTotal,
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
      protectedModified: 0, identityModified: 0,
      errors: [],
      message: "allowWrite=false · WRITE 안 함 (안전장치)",
    };
  }

  // PROTECTED snapshot (BEFORE) · 변경 안 됐음을 Read-back 때 검증
  const protectedBefore = new Map<string, Record<string, unknown>>();
  for (const [key, d] of dbByKey.entries()) {
    const snap: Record<string, unknown> = {};
    for (const w of PROTECTED_INVENTORY_FIELDS) {
      if (w === "id" || w === "created_at") continue;
      snap[w] = d[w] ?? null;
    }
    protectedBefore.set(key, snap);
  }

  const errors: Array<{ pcode: string; message: string }> = [];
  let inserted = 0;
  let updated = 0;
  let updatedCells = 0;
  let failed = 0;

  // INSERT (batch 500)
  for (const batch of chunk(diff.inserts, 500)) {
    const payloads = batch.map((b) => b.payload);
    const { data, error } = await supabase
      .from("stock_history")
      .insert(payloads)
      .select("period_start, period_end, st_code, pcode");
    if (error) {
      failed += batch.length;
      // batch 전체 실패 · 첫 identity + error 전문 + payload sample 기록
      const samplePayload = payloads[0] ? JSON.stringify(payloads[0]).slice(0, 200) : "(empty)";
      console.error(
        `[stockHistorySyncService] INSERT batch 실패 · batch=${batch.length}건 · error="${error.message}" · code=${error.code ?? "-"} · hint="${error.hint ?? "-"}" · details="${error.details ?? "-"}" · payload[0]=${samplePayload}`,
      );
      // errors[] 에 batch 안 pcode 전부 기록 (상한 20 유지 · 원인 추적용)
      for (const item of batch) {
        if (errors.length >= 20) break;
        errors.push({ pcode: item.pcode, message: `INSERT batch 실패 · ${error.message}` });
      }
    } else {
      inserted += (data?.length ?? 0);
    }
  }

  // UPDATE · identity 4-key 조건 (ERP partial unique)
  const PAR = 10;
  for (let i = 0; i < diff.updates.length; i += PAR) {
    const slice = diff.updates.slice(i, i + PAR);
    const results = await Promise.all(
      slice.map(async (u) => {
        const { error } = await supabase
          .from("stock_history")
          .update(u.payload)
          .eq("period_start", u.identity.period_start)
          .eq("period_end", u.identity.period_end)
          .eq("st_code", u.identity.st_code)
          .eq("pcode", u.identity.pcode);
        return { u, error: error?.message };
      }),
    );
    for (const r of results) {
      if (r.error) {
        failed++;
        if (errors.length < 20) errors.push({ pcode: r.u.pcode, message: r.error });
      } else {
        updated++;
        updatedCells += r.u.changedFields.length;
      }
    }
  }

  // Read-back · NEW + CHANGED keys
  const touchedPcodes = new Set<string>();
  for (const i of diff.inserts) touchedPcodes.add(i.identity.pcode);
  for (const u of diff.updates) touchedPcodes.add(u.identity.pcode);
  const readbackMap = new Map<string, DbRow>();
  for (const slice of chunk([...touchedPcodes], 200)) {
    const { data, error } = await supabase
      .from("stock_history")
      .select(DB_SELECT_COLS)
      .eq("period_start", input.metadata.period_start)
      .eq("period_end", input.metadata.period_end)
      .in("pcode", slice);
    if (error) throw new Error(`read-back 실패 · ${error.message}`);
    for (const d of ((data ?? []) as unknown) as DbRow[]) {
      const key = `${String(d.period_start)}#${String(d.period_end)}#${String(d.st_code ?? "")}#${String(d.pcode ?? "")}`;
      readbackMap.set(key, d);
    }
  }

  let readbackMatched = 0;
  let readbackMismatch = 0;
  let protectedModified = 0;
  let identityModified = 0;

  for (const u of diff.updates) {
    const key = `${u.identity.period_start}#${u.identity.period_end}#${u.identity.st_code}#${u.identity.pcode}`;
    const back = readbackMap.get(key);
    if (!back) { readbackMismatch++; continue; }
    if (
      String(back.period_start) !== u.identity.period_start ||
      String(back.period_end)   !== u.identity.period_end ||
      String(back.st_code)      !== u.identity.st_code ||
      String(back.pcode)        !== u.identity.pcode
    ) {
      identityModified++;
    }
    // PROTECTED 보호 검증
    const web = protectedBefore.get(key);
    if (web) {
      for (const w of PROTECTED_INVENTORY_FIELDS) {
        if (w === "id" || w === "created_at") continue;
        const b = web[w];
        const a = back[w];
        if ((b === null && a === null) || b === a) continue;
        if (JSON.stringify(b) !== JSON.stringify(a)) protectedModified++;
      }
    }
    // Field read-back
    let allMatch = true;
    for (const f of u.changedFields) {
      const expected = u.payload[f];
      const actual = back[f];
      if (!sameNumeric(actual, expected)) { allMatch = false; break; }
    }
    if (allMatch) readbackMatched++;
    else readbackMismatch++;
  }

  for (const ins of diff.inserts) {
    const key = `${ins.identity.period_start}#${ins.identity.period_end}#${ins.identity.st_code}#${ins.identity.pcode}`;
    const back = readbackMap.get(key);
    if (!back) { readbackMismatch++; continue; }
    let allMatch = true;
    for (const f of Object.keys(ins.payload)) {
      if (IDENTITY_FIELDS.has(f) || f === "updated_at") continue;
      const expected = ins.payload[f];
      const actual = back[f];
      if (!sameNumeric(actual, expected)) { allMatch = false; break; }
    }
    if (allMatch) readbackMatched++;
    else readbackMismatch++;
  }

  const result: StockHistorySyncApplyResult = {
    ...base,
    allowWrite: true,
    inserted,
    updated,
    updatedCells,
    skippedSame: diff.stats.same,
    failed,
    readbackMatched,
    readbackMismatch,
    protectedModified,
    identityModified,
    errors,
  };

  try {
    appendSyncHistory("INVENTORY_STATUS", {
      startedAt,
      completedAt: new Date().toISOString(),
      ok: failed === 0 && identityModified === 0 && protectedModified === 0,
      updatedRows: inserted + updated,
      updatedCells,
      skippedSame: diff.stats.same,
      failed,
      webModified: protectedModified,
      identityModified,
      readbackMatched,
      readbackMismatch,
      erpCacheFetchedAt: null,
      erpCacheRowCount: diff.stats.erpTotal,
    });
  } catch (err) {
    console.warn(`[stockHistorySyncService] 이력 기록 실패 · ${(err as Error).message}`);
  }

  return result;
}
