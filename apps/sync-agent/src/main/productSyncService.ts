// apps/sync-agent/src/main/productSyncService.ts
// 2026-10-04 · S2 · Product Sync Service (Electron main 전용)
//
// 역할 (2-레이어 아키텍처):
//   하단 "직접 조회" → ERP SOAP → local snapshot cache (candidate.json.gz)
//   상단 "동기화 확인" / "Supabase 반영" → local snapshot ↔ Supabase (ERP 재호출 X)
//
// 2 service:
//   runProductSyncCheck()  · local cache + Supabase fresh fetch → SAME/CHANGED/REVIEW/ERROR
//   applyProductSync()     · fresh fetch + Final Diff + CHANGED UPDATE + Read-back

import { loadCandidateFull } from "./snapshotStore";
import { getSupabaseClient } from "./supabaseClient";
import { appendSyncHistory } from "./syncHistoryStore";
import {
  computeProductSyncCheck,
  type SyncEntry,
} from "../../../../src/shared/erp/productSyncCheck";
import type { ErpProductRow, DbProductRow } from "../../../../src/shared/erp/erpProductMapper";
import { ERP_OWNED_PRODUCT_FIELDS, isErpEmpty } from "../../../../src/shared/erp/erpSyncWhitelist";
import { timestampsEqual } from "../../../../src/shared/erp/timestampCompare";

const NUMERIC_FIELDS = new Set(["current_stock", "purchase_price", "sale_price"]);
const TIMESTAMP_FIELDS = new Set(["erp_registered_at", "erp_modified_at"]);

/** 사용자 UI 표시용 Product_List fetch 상태 */
export interface ErpCacheInfo {
  readonly fetchedAt: string | null;
  readonly rowCount: number;
  readonly checksum: string | null;
}

export interface ProductSyncCheckResult {
  readonly erpCache: ErpCacheInfo;
  readonly supabaseFetchedAt: string;
  readonly erpTotal: number;
  readonly pcodeMatch: number;
  readonly same: number;
  readonly changed: number;
  readonly new_: number;
  readonly identityReview: number;
  readonly errors: number;
  readonly skippedMissingPcode: number;
  readonly dbRowsCount: number;
  readonly entries: ReadonlyArray<SyncEntry>;
  /** IDENTITY_REVIEW 상세 (상품명 완전일치 but 바코드 포맷 다름) */
  readonly reviewEntries: ReadonlyArray<{ pcode: string; erpBarcode: string; erpProductName: string; dbMatches: Array<{ product_code: string; pcode: string | null }> }>;
}

/**
 * local ERP cache + Supabase fresh fetch 로 Sync Check.
 * ERP SOAP 재호출 하지 않음.
 */
export async function runProductSyncCheck(): Promise<ProductSyncCheckResult> {
  const full = loadCandidateFull<ErpProductRow>("PRODUCT_LIST");
  if (!full) {
    throw new Error("Product_List local cache 없음 · 하단 'Iregen ERP 직접 조회' 에서 사업장 상품관리 조회를 먼저 실행하세요.");
  }
  const erpRows = full.rows;
  const erpCache: ErpCacheInfo = {
    fetchedAt: full.meta.fetchedAt ?? null,
    rowCount: full.meta.rowCount,
    checksum: full.meta.checksum ?? null,
  };

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정 · SUPABASE_URL / SUPABASE_KEY 환경변수 확인");

  const supabaseFetchedAt = new Date().toISOString();
  const dbRows: DbProductRow[] = await fetchAllProductsForSync(supabase);

  // Pure diff
  const summary = computeProductSyncCheck(erpRows, dbRows);

  // IDENTITY_REVIEW · pcode 매칭 없음 + BarCode 도 DB 에 없음 + ProductName 완전 일치 DB row 있음
  const dbByName = new Map<string, DbProductRow[]>();
  const dbByBarcode = new Map<string, DbProductRow>();
  const dbByPcode = new Map<string, DbProductRow>();
  for (const d of dbRows) {
    const pc = String((d as { pcode?: unknown }).pcode ?? "").trim();
    if (pc) dbByPcode.set(pc, d);
    const bc = String(d.product_code ?? "").trim();
    if (bc) dbByBarcode.set(bc, d);
    const nm = String((d as { product_name?: unknown }).product_name ?? "").trim();
    if (nm) {
      if (!dbByName.has(nm)) dbByName.set(nm, []);
      dbByName.get(nm)!.push(d);
    }
  }

  // identityReview 는 summary.entries 안 NEW 중 상품명 완전 일치 DB row 있는 것
  let identityReview = 0;
  const reviewEntries: Array<{ pcode: string; erpBarcode: string; erpProductName: string; dbMatches: Array<{ product_code: string; pcode: string | null }> }> = [];
  let realNew = 0;
  const filteredEntries: SyncEntry[] = [];
  for (const e of summary.entries) {
    if (e.action === "NEW") {
      const matches = dbByName.get(e.erpProductName);
      if (matches && matches.length > 0) {
        identityReview++;
        reviewEntries.push({
          pcode: e.pcode, erpBarcode: e.erpBarcode, erpProductName: e.erpProductName,
          dbMatches: matches.map((m) => ({
            product_code: String(m.product_code ?? ""),
            pcode: ((m as { pcode?: unknown }).pcode == null ? null : String((m as { pcode?: unknown }).pcode)),
          })),
        });
        continue; // NEW 에서 제외
      }
      realNew++;
      filteredEntries.push(e);
    } else {
      filteredEntries.push(e);
    }
  }

  return {
    erpCache,
    supabaseFetchedAt,
    erpTotal: summary.totalErp,
    pcodeMatch: summary.same + summary.changed,
    same: summary.same,
    changed: summary.changed,
    new_: realNew,
    identityReview,
    errors: summary.errors,
    skippedMissingPcode: summary.skippedMissingPcode,
    dbRowsCount: dbRows.length,
    entries: filteredEntries,
    reviewEntries,
  };
}

async function fetchAllProductsForSync(supabase: ReturnType<typeof getSupabaseClient>): Promise<DbProductRow[]> {
  if (!supabase) throw new Error("Supabase client null");
  const dataFields = Object.keys(ERP_OWNED_PRODUCT_FIELDS).filter((k) => k !== "pcode");
  const selectCols = `product_code, pcode, ${dataFields.join(", ")}`;
  const all: DbProductRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("products").select(selectCols).range(from, from + 999);
    if (error) throw new Error(`products 조회 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as DbProductRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// applyProductSync
// ─────────────────────────────────────────────────────────────────────────────
export interface ApplyResult {
  readonly ok: boolean;
  readonly allowWrite: boolean;
  readonly insertedRows: number;
  readonly updatedRows: number;
  readonly updatedCells: number;
  readonly skippedSame: number;
  readonly failed: number;
  readonly webModified: number;
  readonly identityModified: number;
  readonly readbackMatched: number;
  readonly readbackMismatch: number;
  readonly errors: ReadonlyArray<{ pcode: string; message: string }>;
  readonly message?: string;
}

/**
 * CHANGED 만 UPDATE 수행.
 * SAME · IDENTITY_REVIEW · ERROR · DB-only · identity · WEB-owned 변경 금지.
 * ERP SOAP 재호출 하지 않음.
 */
export async function applyProductSync(opts: { allowWrite: boolean }): Promise<ApplyResult> {
  if (!opts.allowWrite) {
    return { ok: false, allowWrite: false, insertedRows: 0, updatedRows: 0, updatedCells: 0, skippedSame: 0, failed: 0, webModified: 0, identityModified: 0, readbackMatched: 0, readbackMismatch: 0, errors: [], message: "allowWrite=false · WRITE 안 함 (안전장치)" };
  }

  const startedAt = new Date().toISOString();
  const full = loadCandidateFull<ErpProductRow>("PRODUCT_LIST");
  if (!full) throw new Error("Product_List local cache 없음");
  const erpRows = full.rows;

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정");

  // Fresh fetch (WEB-owned 보존 검증을 위해 brand/manufacturer/optimal_stock/memo/hidden/stock_note 도 함께 조회)
  const dataFields = Object.keys(ERP_OWNED_PRODUCT_FIELDS).filter((k) => k !== "pcode");
  const webFields = ["brand", "manufacturer", "optimal_stock", "memo", "hidden", "stock_note", "imported_at"];
  const selectCols = `product_code, pcode, ${dataFields.join(", ")}, ${webFields.join(", ")}`;
  const dbAll: Array<Record<string, unknown>> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("products").select(selectCols).range(from, from + 999);
    if (error) throw new Error(`products fresh fetch 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    dbAll.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
    from += 1000;
  }

  const dbByPcode = new Map<string, Record<string, unknown>>();
  for (const d of dbAll) {
    const pc = String(d.pcode ?? "").trim();
    if (pc) dbByPcode.set(pc, d);
  }
  // WEB snapshot (BEFORE)
  const webBefore = new Map<string, Record<string, unknown>>();
  for (const d of dbAll) {
    const pc = String(d.pcode ?? "").trim();
    if (!pc) continue;
    const snap: Record<string, unknown> = { product_code: d.product_code };
    for (const w of webFields) snap[w] = d[w] ?? null;
    webBefore.set(pc, snap);
  }

  // Final Diff · CHANGED + NEW
  interface Update { pcode: string; product_code: string; payload: Record<string, unknown>; changedFields: string[]; }
  interface Insert { pcode: string; product_code: string; payload: Record<string, unknown>; }
  const updates: Update[] = [];
  const inserts: Insert[] = [];
  let skippedSame = 0;
  // NEW · ERP 에만 있고 DB 에 없는 pcode (사용자 지시 2026-10-05 · 영구 INSERT 로직)
  for (const r of erpRows) {
    const pcode = String((r as { PCode?: unknown }).PCode ?? "").trim();
    if (!pcode) continue;
    if (dbByPcode.has(pcode)) continue; // UPDATE loop 가 처리
    const barcode = String((r as { BarCode?: unknown }).BarCode ?? "").trim();
    if (!barcode) continue; // ERP BarCode 없으면 skip (product_code identity 불가)
    const payload: Record<string, unknown> = { pcode, product_code: barcode };
    for (const [dbCol, mapping] of Object.entries(ERP_OWNED_PRODUCT_FIELDS)) {
      if (dbCol === "pcode") continue;
      const erpVal = (r as Record<string, unknown>)[mapping.erp];
      if (isErpEmpty(erpVal) && !mapping.nullOverwrite) continue;
      let normalized: unknown;
      if (NUMERIC_FIELDS.has(dbCol)) {
        if (isErpEmpty(erpVal)) normalized = null;
        else { const n = typeof erpVal === "number" ? erpVal : Number(String(erpVal).trim()); normalized = Number.isFinite(n) ? n : null; }
      } else if (typeof erpVal === "string") normalized = erpVal.trim();
      else normalized = erpVal ?? null;
      payload[dbCol] = normalized;
    }
    inserts.push({ pcode, product_code: barcode, payload });
  }
  // CHANGED · DB 에 pcode 있고 ERP 값과 다른 경우
  for (const r of erpRows) {
    const pcode = String((r as { PCode?: unknown }).PCode ?? "").trim();
    if (!pcode) continue;
    const db = dbByPcode.get(pcode);
    if (!db) continue;
    const payload: Record<string, unknown> = {};
    const changedFields: string[] = [];
    for (const [dbCol, mapping] of Object.entries(ERP_OWNED_PRODUCT_FIELDS)) {
      if (dbCol === "pcode") continue; // identity · payload 제외
      const erpVal = (r as Record<string, unknown>)[mapping.erp];
      const dbVal = db[dbCol];
      const erpEmpty = isErpEmpty(erpVal);
      if (erpEmpty && !mapping.nullOverwrite) continue; // KEEP

      let normalized: unknown;
      if (NUMERIC_FIELDS.has(dbCol)) {
        if (erpEmpty) normalized = null;
        else { const n = typeof erpVal === "number" ? erpVal : Number(String(erpVal).trim()); normalized = Number.isFinite(n) ? n : null; }
      } else if (typeof erpVal === "string") normalized = erpVal.trim();
      else normalized = erpVal ?? null;

      let same: boolean;
      if (TIMESTAMP_FIELDS.has(dbCol)) same = timestampsEqual(dbVal, normalized);
      else if (NUMERIC_FIELDS.has(dbCol)) same = (dbVal == null ? null : Number(dbVal)) === normalized;
      else same = (dbVal == null ? "" : String(dbVal).trim()) === (normalized == null ? "" : String(normalized).trim());
      if (same) continue;

      payload[dbCol] = normalized;
      changedFields.push(dbCol);
    }
    if (changedFields.length === 0) { skippedSame++; continue; }
    updates.push({ pcode, product_code: String(db.product_code ?? ""), payload, changedFields });
  }

  // Execute INSERT (batch · NEW)
  let insertedRows = 0;
  const errors: Array<{ pcode: string; message: string }> = [];
  if (inserts.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < inserts.length; i += BATCH) {
      const slice = inserts.slice(i, i + BATCH);
      const payloads = slice.map(s => s.payload);
      const { data, error } = await supabase.from("products").insert(payloads).select("product_code, pcode");
      if (error) {
        for (const s of slice) { if (errors.length < 20) errors.push({ pcode: s.pcode, message: `INSERT · ${error.message}` }); }
      } else {
        insertedRows += data?.length ?? 0;
      }
    }
  }

  // Execute UPDATE (CHANGED)
  let updatedRows = 0, failed = 0, updatedCells = 0;
  const PAR = 10;
  for (let i = 0; i < updates.length; i += PAR) {
    const batch = updates.slice(i, i + PAR);
    const results = await Promise.all(batch.map(async (u): Promise<{ ok: boolean; u: Update; err?: string }> => {
      const { error } = await supabase.from("products").update(u.payload).eq("pcode", u.pcode).eq("product_code", u.product_code);
      if (error) return { ok: false, u, err: error.message };
      return { ok: true, u };
    }));
    for (const r of results) {
      if (r.ok) { updatedRows++; updatedCells += r.u.changedFields.length; }
      else { failed++; if (errors.length < 20) errors.push({ pcode: r.u.pcode, message: r.err ?? "unknown" }); }
    }
  }

  // Read-back
  const updatedPcodes = updates.map((u) => u.pcode);
  const readbackMap = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < updatedPcodes.length; i += 100) {
    const chunk = updatedPcodes.slice(i, i + 100);
    const { data } = await supabase.from("products").select(selectCols).in("pcode", chunk);
    for (const d of ((data ?? []) as unknown as Record<string, unknown>[])) readbackMap.set(String(d.pcode), d);
  }

  let readbackMatched = 0, readbackMismatch = 0;
  let webModified = 0, identityModified = 0;
  for (const u of updates) {
    const back = readbackMap.get(u.pcode);
    if (!back) { readbackMismatch++; continue; }
    // identity 보호 검증
    if (String(back.pcode) !== u.pcode) identityModified++;
    if (String(back.product_code) !== u.product_code) identityModified++;
    // WEB-owned 보호 검증
    const web = webBefore.get(u.pcode);
    if (web) {
      for (const w of webFields) {
        const b = web[w];
        const a = back[w];
        if ((b === null && a === null) || b === a) continue;
        if (JSON.stringify(b) !== JSON.stringify(a)) webModified++;
      }
    }
    // Field 수준 read-back · updated field 가 ERP 값 반영했는지
    let allMatch = true;
    for (const f of u.changedFields) {
      const expected = u.payload[f];
      const actual = back[f];
      let m: boolean;
      if (TIMESTAMP_FIELDS.has(f)) m = timestampsEqual(expected, actual);
      else if (NUMERIC_FIELDS.has(f)) m = (actual == null ? null : Number(actual)) === expected;
      else m = (actual == null ? "" : String(actual)) === (expected == null ? "" : String(expected));
      if (!m) { allMatch = false; break; }
    }
    if (allMatch) readbackMatched++;
    else readbackMismatch++;
  }

  const result: ApplyResult = {
    ok: failed === 0 && identityModified === 0 && webModified === 0,
    allowWrite: true,
    insertedRows, updatedRows, updatedCells, skippedSame, failed,
    webModified, identityModified,
    readbackMatched, readbackMismatch,
    errors,
  };

  // 2026-10-04 · 사용자 지시 · 동기화 이력 기록 (ERP → Supabase)
  try {
    appendSyncHistory("PRODUCT_LIST", {
      startedAt,
      completedAt: new Date().toISOString(),
      ok: result.ok,
      updatedRows: result.updatedRows,
      updatedCells: result.updatedCells,
      skippedSame: result.skippedSame,
      failed: result.failed,
      webModified: result.webModified,
      identityModified: result.identityModified,
      readbackMatched: result.readbackMatched,
      readbackMismatch: result.readbackMismatch,
      erpCacheFetchedAt: full.meta.fetchedAt ?? null,
      erpCacheRowCount: full.meta.rowCount ?? null,
    });
  } catch (err) {
    console.warn(`[productSyncService] 이력 기록 실패 · ${(err as Error).message}`);
  }

  return result;
}
