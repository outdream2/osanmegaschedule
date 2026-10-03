// server/services/erpSync/productSyncRunner.ts
// 2026-10-03 저녁 · Phase 2 · ERP Product_List → Supabase products Sync Runner
//
// 흐름:
//   Product_List (SNAPSHOT or LIVE)
//     → BarCode identity
//     → buildErpProductPayload (whitelist · PROTECTED 방어)
//     → chunk UPSERT (allowWrite 통과 시만)
//
// 안전장치:
//   · 기본 mode=DRY_RUN · allowWrite=false
//   · WRITE 는 mode==="WRITE" AND allowWrite===true 모두 만족해야 실행
//   · 자동 DELETE 영구 금지 (DB_ONLY = KEEP)
//   · PROTECTED field 는 payload 생성 시 자동 제외 (assertNoProtectedField)

import type { SupabaseClient } from "@supabase/supabase-js";
import logger from "../../lib/logger";
import { buildErpProductPayload, type DbProductRow, type ErpProductRow } from "../../../src/shared/erp/erpProductMapper";
import { loadProductListSnapshot } from "./syncSource";
import type { SyncRunnerOptions, ProductSyncResult, BatchResult } from "./types";

/** DB 조회: products 전수 (sync 대상 비교용) */
async function loadAllProductsFromDb(supabase: SupabaseClient): Promise<DbProductRow[]> {
  const PAGE = 1000;
  const out: DbProductRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "product_code, product_name, supplier, supplier_code, unit, sale_status, brand, manufacturer, " +
        "last_purchase_date, last_sale_date, current_stock, display_location, location, " +
        "optimal_stock, memo, hidden, stock_note, imported_at",
      )
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`products 조회 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as unknown as DbProductRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/** Supabase 에러 message 에서 credential/pii 를 제거 (방어적 sanitize) */
function sanitizeError(msg: string): string {
  return String(msg)
    .replace(/Bearer\s+[^\s]+/gi, "Bearer ***")
    .replace(/supabase\.co[^\s"]*/gi, "supabase.co/***")
    .replace(/postgres:\/\/[^\s]+/gi, "postgres://***")
    .slice(0, 200);
}

/**
 * Product Sync Runner · 메인 함수.
 *
 * @param supabase Supabase client
 * @param options mode / allowWrite / source / batchSize
 */
export async function syncProducts(
  supabase: SupabaseClient,
  options: SyncRunnerOptions = {},
): Promise<ProductSyncResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const mode = options.mode ?? "DRY_RUN";
  const allowWrite = options.allowWrite === true;
  const source = options.source ?? "SNAPSHOT";
  const batchSize = Math.max(50, Math.min(500, options.batchSize ?? 300));

  const allowSet: Set<string> | null = options.onlyProductCodes && options.onlyProductCodes.length > 0
    ? new Set(options.onlyProductCodes.map((s) => String(s).trim()).filter(Boolean))
    : null;

  logger.info(
    `[productSyncRunner] 시작 · mode=${mode} · allowWrite=${allowWrite} · source=${source} · batchSize=${batchSize}` +
    (allowSet ? ` · onlyProductCodes=${allowSet.size}` : ""),
  );

  // ── 1. ERP 소스 로드 ──────────────────────────────────────────────────────
  if (source !== "SNAPSHOT") {
    throw new Error("[productSyncRunner] LIVE_ERP 모드 미지원 (Phase 3) · SNAPSHOT 사용");
  }
  const snap = loadProductListSnapshot(options.snapshotPath);
  if (!snap) throw new Error("Product_List snapshot 없음 · sync-agent 로 1회 조회 필요");
  const erpRows = snap.rows;

  // ── 2. Supabase products READ ─────────────────────────────────────────────
  const dbRows = await loadAllProductsFromDb(supabase);
  const dbByCode = new Map(dbRows.map((p) => [String(p.product_code).trim(), p]));

  // ── 3. 분류 + payload 생성 ────────────────────────────────────────────────
  let matched = 0, newInsert = 0, conflict = 0, erpMissingBarcode = 0;
  let wouldUpdate = 0, wouldInsert = 0, wouldSkipSame = 0, reviewLocation = 0;
  const updatePayloads: { code: string; payload: Record<string, unknown> }[] = [];
  const insertPayloads: Record<string, unknown>[] = [];
  const sanitizedErrors: string[] = [];
  const seenBarcode = new Set<string>();

  // ERP 전수 duplicate 체크용 (allowlist 와 무관하게 conflict 집계)
  const fullErpSeen = new Set<string>();

  for (const er of erpRows) {
    const bc = String(er.BarCode ?? "").trim();
    if (!bc) { erpMissingBarcode++; continue; }
    if (fullErpSeen.has(bc)) { conflict++; continue; }
    fullErpSeen.add(bc);

    // allowlist 활성 시 · 해당 Barcode 가 아니면 분류/payload 생성 자체 건너뜀
    if (allowSet && !allowSet.has(bc)) continue;
    seenBarcode.add(bc);

    const dbRow = dbByCode.get(bc) ?? null;
    try {
      const result = buildErpProductPayload(er, dbRow);
      if (result.locationDecision === "review") reviewLocation++;
      if (dbRow) {
        matched++;
        if (result.changedCount === 0) {
          wouldSkipSame++;
        } else {
          wouldUpdate++;
          updatePayloads.push({ code: bc, payload: result.payload });
        }
      } else {
        newInsert++;
        wouldInsert++;
        insertPayloads.push(result.payload);
      }
    } catch (e) {
      sanitizedErrors.push(`${bc}: ${sanitizeError((e as Error).message)}`);
    }
  }
  // dbOnly 는 전체 ERP 기준으로 집계 (allowlist 와 무관하게 "DB 에만 있고 ERP 에 없는 상품" 의미 유지)
  const dbOnly = dbRows.filter((p) => !fullErpSeen.has(String(p.product_code).trim())).length;

  // ── 4. WRITE (allowWrite 통과 시만) ────────────────────────────────────────
  const canWrite = mode === "WRITE" && allowWrite;
  const batches: BatchResult[] = [];
  let inserted = 0, updated = 0, skipped = 0, failed = 0;

  if (!canWrite) {
    logger.info(`[productSyncRunner] WRITE lock 활성 · mode=${mode} allowWrite=${allowWrite} · DB WRITE 0건`);
  } else {
    // ⚠ 실제 WRITE 경로 · double gate 통과한 경우만 실행
    logger.warn(`[productSyncRunner] ★ WRITE 모드 실행 · DB mutation 발생 · updates=${updatePayloads.length} inserts=${insertPayloads.length}`);

    // allowlist pre-assert · 명시된 Barcode 밖 payload 가 섞이면 즉시 중단
    if (allowSet) {
      for (const u of updatePayloads) {
        if (!allowSet.has(u.code)) {
          throw new Error(`[productSyncRunner] ★ SAFETY · UPDATE outside allowlist · ${u.code}`);
        }
      }
      for (const p of insertPayloads) {
        const code = String(p.product_code ?? "").trim();
        if (!allowSet.has(code)) {
          throw new Error(`[productSyncRunner] ★ SAFETY · INSERT outside allowlist · ${code}`);
        }
      }
      logger.warn(`[productSyncRunner] allowlist pre-assert PASS · ${updatePayloads.length + insertPayloads.length}건 전부 allowlist 내`);
    }

    // 명시 안전 체크: 전부 Barcode(product_code) 필수
    for (const u of updatePayloads) {
      if (!u.code) {
        failed++;
        sanitizedErrors.push("UPDATE payload missing product_code");
      }
    }

    // UPDATE batch 들
    const updateChunks: typeof updatePayloads[] = [];
    for (let i = 0; i < updatePayloads.length; i += batchSize) {
      updateChunks.push(updatePayloads.slice(i, i + batchSize));
    }
    for (let bi = 0; bi < updateChunks.length; bi++) {
      const chunk = updateChunks[bi];
      const errors: string[] = [];
      let bInserted = 0, bUpdated = 0, bSkipped = 0, bFailed = 0;
      for (const u of chunk) {
        const { error } = await supabase.from("products").update(u.payload).eq("product_code", u.code);
        if (error) { bFailed++; errors.push(`${u.code}: ${sanitizeError(error.message)}`); }
        else bUpdated++;
      }
      const br: BatchResult = { batchIdx: bi, rowCount: chunk.length, inserted: bInserted, updated: bUpdated, skipped: bSkipped, failed: bFailed, errors };
      batches.push(br);
      updated += bUpdated;
      failed += bFailed;
      sanitizedErrors.push(...errors);
      options.onBatchComplete?.(bi, updateChunks.length + Math.ceil(insertPayloads.length / batchSize), br);
    }

    // INSERT batch 들
    const insertChunks: typeof insertPayloads[] = [];
    for (let i = 0; i < insertPayloads.length; i += batchSize) {
      insertChunks.push(insertPayloads.slice(i, i + batchSize));
    }
    for (let bi = 0; bi < insertChunks.length; bi++) {
      const chunk = insertChunks[bi];
      const errors: string[] = [];
      let bInserted = 0, bFailed = 0;
      const { error } = await supabase.from("products").insert(chunk);
      if (error) {
        bFailed = chunk.length;
        errors.push(`batch insert fail: ${sanitizeError(error.message)}`);
      } else {
        bInserted = chunk.length;
      }
      const br: BatchResult = { batchIdx: updateChunks.length + bi, rowCount: chunk.length, inserted: bInserted, updated: 0, skipped: 0, failed: bFailed, errors };
      batches.push(br);
      inserted += bInserted;
      failed += bFailed;
      sanitizedErrors.push(...errors);
      options.onBatchComplete?.(updateChunks.length + bi, updateChunks.length + insertChunks.length, br);
    }
  }

  const finishedAt = new Date().toISOString();
  const elapsedMs = Date.now() - t0;

  const result: ProductSyncResult = {
    mode,
    actualWriteExecuted: canWrite,
    source,
    snapshotPath: snap.path,
    erpRows: erpRows.length,
    dbRows: dbRows.length,
    matched,
    newInsert,
    dbOnly,
    conflict,
    erpMissingBarcode,
    wouldUpdate,
    wouldInsert,
    wouldSkipSame,
    reviewLocation,
    inserted,
    updated,
    skipped,
    failed,
    protectedMutationCount: 0,
    batches,
    elapsedMs,
    startedAt,
    finishedAt,
    sanitizedErrors,
  };

  logger.info(
    `[productSyncRunner] 완료 · ${elapsedMs}ms · matched=${matched} new=${newInsert} dbOnly=${dbOnly} ` +
    `wouldUpdate=${wouldUpdate} wouldInsert=${wouldInsert} write=${canWrite ? "YES" : "NO"} ` +
    `inserted=${inserted} updated=${updated} failed=${failed}`,
  );
  return result;
}
