// server/services/erpSync/buySyncRunner.ts
// 2026-10-03 저녁 · Phase 2 · ERP Buy_Status → Supabase purchase_details Sync Runner
//
// 흐름:
//   Buy_Status (SNAPSHOT or LIVE)
//     → PCode → Barcode 매핑
//     → buildBuyRowFromErp (bm_code+row_num unique key)
//     → migration 상태 확인
//     → chunk INSERT ON CONFLICT (bm_code, row_num) DO NOTHING
//
// 안전장치:
//   · 기본 mode=DRY_RUN · allowWrite=false
//   · bm_code · row_num 컬럼 없으면 BLOCKED (MIGRATION_REQUIRED)
//   · 기존 12,939 과거 데이터는 KEEP · 삭제 금지

import type { SupabaseClient } from "@supabase/supabase-js";
import logger from "../../lib/logger";
import { buildBuyRowFromErp, buildPCodeToBarcodeMap } from "../../../src/shared/erp/erpBuyMapper";
import { loadProductListSnapshot, loadBuyStatusSnapshot } from "./syncSource";
import type { SyncRunnerOptions, BuySyncResult, BatchResult } from "./types";

function sanitizeError(msg: string): string {
  return String(msg)
    .replace(/Bearer\s+[^\s]+/gi, "Bearer ***")
    .replace(/supabase\.co[^\s"]*/gi, "supabase.co/***")
    .slice(0, 200);
}

/** purchase_details.bm_code 컬럼 존재 여부 확인 (migration 상태 gate) */
async function checkBmCodeColumnExists(supabase: SupabaseClient): Promise<"present" | "missing" | "unknown"> {
  const { error } = await supabase
    .from("purchase_details")
    .select("bm_code")
    .limit(1);
  if (!error) return "present";
  if (/column.*bm_code.*does not exist/i.test(error.message)) return "missing";
  logger.warn(`[buySyncRunner] bm_code 컬럼 확인 중 unknown 에러: ${sanitizeError(error.message)}`);
  return "unknown";
}

/** 기존 (bm_code, row_num) tuple 조회 (중복 방지 사전) */
async function loadExistingPurchaseKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const PAGE = 1000;
  const keys = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("purchase_details")
      .select("bm_code, row_num")
      .not("bm_code", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`purchase_details(bm_code) 조회 실패 · ${sanitizeError(error.message)}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ bm_code: string | null; row_num: number | null }>) {
      if (r.bm_code != null && r.row_num != null) {
        keys.add(`${r.bm_code}|${r.row_num}`);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return keys;
}

/**
 * Buy Sync Runner · 메인 함수.
 */
export async function syncPurchases(
  supabase: SupabaseClient,
  options: SyncRunnerOptions = {},
): Promise<BuySyncResult> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const mode = options.mode ?? "DRY_RUN";
  const allowWrite = options.allowWrite === true;
  const source = options.source ?? "SNAPSHOT";
  const batchSize = Math.max(50, Math.min(500, options.batchSize ?? 300));

  logger.info(`[buySyncRunner] 시작 · mode=${mode} · allowWrite=${allowWrite} · source=${source} · batchSize=${batchSize}`);

  const sanitizedErrors: string[] = [];

  // ── 1. migration gate · bm_code 컬럼 확인 ─────────────────────────────────
  const migrationStatus = await checkBmCodeColumnExists(supabase);
  if (migrationStatus !== "present") {
    const finishedAt = new Date().toISOString();
    const elapsedMs = Date.now() - t0;
    logger.warn(`[buySyncRunner] 차단 · migration ${migrationStatus} · DB WRITE 0`);
    return {
      mode, actualWriteExecuted: false, source,
      erpRows: 0, mapped: 0, unmapped: 0, wouldInsert: 0, existingDuplicate: 0,
      inserted: 0, skipped: 0, failed: 0, batches: [],
      migrationStatus,
      blocked: true, blockReason: "MIGRATION_REQUIRED",
      elapsedMs, startedAt, finishedAt,
      sanitizedErrors: [`purchase_details.bm_code 컬럼 없음 · supabase/migrations/future_phase2_erp_sync_bm_code_row_num.sql 수동 실행 필요`],
    };
  }

  // ── 2. 소스 로드 (Buy + PCode 매핑용 Product_List) ────────────────────────
  if (source !== "SNAPSHOT") {
    throw new Error("[buySyncRunner] LIVE_ERP 모드 미지원 (Phase 3)");
  }
  const buySnap = loadBuyStatusSnapshot(options.snapshotPath);
  const plSnap = loadProductListSnapshot();
  if (!buySnap) {
    const finishedAt = new Date().toISOString();
    const elapsedMs = Date.now() - t0;
    return {
      mode, actualWriteExecuted: false, source,
      erpRows: 0, mapped: 0, unmapped: 0, wouldInsert: 0, existingDuplicate: 0,
      inserted: 0, skipped: 0, failed: 0, batches: [],
      migrationStatus,
      blocked: true, blockReason: "SNAPSHOT_MISSING",
      elapsedMs, startedAt, finishedAt,
      sanitizedErrors: ["Buy_Status snapshot 없음"],
    };
  }
  if (!plSnap) {
    const finishedAt = new Date().toISOString();
    const elapsedMs = Date.now() - t0;
    return {
      mode, actualWriteExecuted: false, source,
      erpRows: buySnap.rows.length, mapped: 0, unmapped: 0, wouldInsert: 0, existingDuplicate: 0,
      inserted: 0, skipped: 0, failed: 0, batches: [],
      migrationStatus,
      blocked: true, blockReason: "SNAPSHOT_MISSING",
      elapsedMs, startedAt, finishedAt,
      sanitizedErrors: ["Product_List snapshot 없음 · PCode→Barcode 매핑 사전 생성 불가"],
    };
  }

  const pcodeMap = buildPCodeToBarcodeMap(plSnap.rows as Array<{ PCode?: unknown; BarCode?: unknown }>);
  const existingKeys = await loadExistingPurchaseKeys(supabase);

  // ── 3. 분류 + payload 생성 ────────────────────────────────────────────────
  let mapped = 0, unmapped = 0, wouldInsert = 0, existingDuplicate = 0;
  const insertPayloads: Record<string, unknown>[] = [];

  for (const br of buySnap.rows) {
    try {
      const result = buildBuyRowFromErp(br, pcodeMap);
      if (result.productMatchStatus === "mapped") {
        mapped++;
      } else {
        unmapped++;
        continue; // Barcode 매핑 실패 상품은 INSERT 하지 않음
      }
      const key = `${result.uniqueKey.bm_code}|${result.uniqueKey.row_num}`;
      if (existingKeys.has(key)) {
        existingDuplicate++;
        continue;
      }
      wouldInsert++;
      insertPayloads.push(result.payload);
    } catch (e) {
      sanitizedErrors.push(sanitizeError((e as Error).message));
    }
  }

  // ── 4. WRITE (allowWrite 통과 시만) ────────────────────────────────────────
  const canWrite = mode === "WRITE" && allowWrite;
  const batches: BatchResult[] = [];
  let inserted = 0, skipped = 0, failed = 0;

  if (!canWrite) {
    logger.info(`[buySyncRunner] WRITE lock 활성 · mode=${mode} allowWrite=${allowWrite} · DB WRITE 0`);
  } else {
    logger.warn(`[buySyncRunner] ★ WRITE 모드 실행 · DB mutation 발생 · inserts=${insertPayloads.length}`);
    const chunks: typeof insertPayloads[] = [];
    for (let i = 0; i < insertPayloads.length; i += batchSize) {
      chunks.push(insertPayloads.slice(i, i + batchSize));
    }
    for (let bi = 0; bi < chunks.length; bi++) {
      const chunk = chunks[bi];
      const errors: string[] = [];
      let bInserted = 0, bFailed = 0;
      // ON CONFLICT (bm_code, row_num) DO NOTHING → upsert with ignoreDuplicates
      const { error } = await supabase
        .from("purchase_details")
        .upsert(chunk, { onConflict: "bm_code,row_num", ignoreDuplicates: true });
      if (error) {
        bFailed = chunk.length;
        errors.push(`batch upsert fail: ${sanitizeError(error.message)}`);
      } else {
        bInserted = chunk.length;
      }
      const br: BatchResult = { batchIdx: bi, rowCount: chunk.length, inserted: bInserted, updated: 0, skipped: 0, failed: bFailed, errors };
      batches.push(br);
      inserted += bInserted;
      failed += bFailed;
      sanitizedErrors.push(...errors);
      options.onBatchComplete?.(bi, chunks.length, br);
    }
  }

  const finishedAt = new Date().toISOString();
  const elapsedMs = Date.now() - t0;

  return {
    mode,
    actualWriteExecuted: canWrite,
    source,
    snapshotPath: buySnap.path,
    erpRows: buySnap.rows.length,
    mapped,
    unmapped,
    wouldInsert,
    existingDuplicate,
    inserted,
    skipped,
    failed,
    batches,
    migrationStatus,
    blocked: false,
    elapsedMs,
    startedAt,
    finishedAt,
    sanitizedErrors,
  };
}
