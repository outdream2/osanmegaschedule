// server/routes/admin/initialBuildPreview.ts
// 2026-10-03 저녁 · Phase 2 · Initial Data Build · DRY-RUN Preview API
//   · READ ONLY · DB WRITE 절대 없음
//   · 기존 Product_List snapshot (data/snapshots/product-list-*.json) + Supabase READ
//   · ERP 재호출 하지 않음 (snapshot 재사용)
//   · 사용자 명시 실행 승인 전까지 "DRY-RUN ONLY" 상태 유지

import { Router } from "express";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";
import { supabase } from "../../../src/supabase/client";
import logger from "../../lib/logger";

import { buildErpProductPayload, type DbProductRow, type ErpProductRow } from "../../../src/shared/erp/erpProductMapper";
import { transformErpLocation, type LocationReviewFlag } from "../../../src/shared/erp/erpLocationTransform";
import { buildBuyRowFromErp, buildPCodeToBarcodeMap } from "../../../src/shared/erp/erpBuyMapper";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot loader (data/snapshots)
// ─────────────────────────────────────────────────────────────────────────────
const SNAPSHOT_DIR = join(process.cwd(), "data/snapshots");

function pickLatestSnapshot(prefix: string): string | null {
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort(); // ISO date 명명이므로 lexicographic sort = 최신 last
  return files.length ? join(SNAPSHOT_DIR, files[files.length - 1]) : null;
}

interface SnapshotMeta {
  fetchedAt?: string;
  [k: string]: unknown;
}

function loadProductListSnapshot(): { rows: ErpProductRow[]; path: string; meta?: SnapshotMeta } | null {
  const path = pickLatestSnapshot("product-list-");
  if (!path) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return { rows: parsed.rows ?? [], path, meta: parsed._meta };
}

function loadBuyStatusSnapshot(): { rows: Record<string, unknown>[]; path: string; meta?: SnapshotMeta } | null {
  const path = pickLatestSnapshot("buy-status-");
  if (!path) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return { rows: parsed.rows ?? [], path, meta: parsed._meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase READ (paginated)
// ─────────────────────────────────────────────────────────────────────────────
async function loadAllProductsFromDb(): Promise<DbProductRow[]> {
  const out: DbProductRow[] = [];
  const PAGE = 1000;
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
    if (error) throw new HttpError(500, `products 조회 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as any));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function countExistingPurchaseKeys(): Promise<{ withBmCode: number; total: number }> {
  const { count: total, error: e1 } = await supabase.from("purchase_details").select("*", { count: "exact", head: true });
  if (e1) throw new HttpError(500, e1.message);
  const { count: withBmCode, error: e2 } = await supabase
    .from("purchase_details")
    .select("*", { count: "exact", head: true })
    .not("bm_code" as any, "is", null);
  // bm_code column 미존재 시 42703 · migration 미적용 상태로 처리
  if (e2 && !/column.*bm_code.*does not exist/i.test(e2.message)) {
    throw new HttpError(500, e2.message);
  }
  return { withBmCode: e2 ? -1 : (withBmCode ?? 0), total: total ?? 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// DRY-RUN engine
// ─────────────────────────────────────────────────────────────────────────────
export interface DryRunPreview {
  readonly generatedAt: string;
  readonly dryRunOnly: true;                   // 반드시 true · WRITE 금지 표식
  readonly snapshots: {
    productList: { path: string; rows: number; fetchedAt?: string } | null;
    buyStatus: { path: string; rows: number; fetchedAt?: string } | null;
  };
  readonly erpConfig: { present: boolean; source: "env" | "safeStorage" | "none" };
  readonly product: {
    erpCount: number;
    dbCount: number;
    matched: number;
    newInsert: number;
    dbOnly: number;
    conflict: number;
    protectedMutation: 0;                     // 반드시 0
  };
  readonly fieldLevel: Record<string, { same: number; change: number; db_empty_erp_has: number; erp_empty_db_has: number; both_empty: number }>;
  readonly location: {
    autoApply: number;
    keep: number;
    review: number;
    reviewByFlag: Record<LocationReviewFlag, number>;
    erpMissingKeepDb: number;
    warehouseClassFlip: number;
  };
  readonly price: {
    saleMatch: number;
    saleDbEmptyErpHas: number;
    saleDifferent: number;
    saleBothEmpty: number;
    purchaseMatch: number;
    purchaseDbEmptyErpHas: number;
    purchaseDifferent: number;
    purchaseBothEmpty: number;
    userDecisionRequired: number;
  };
  readonly purchase: {
    buyStatusRows: number;
    mapped: number;
    unmapped: number;
    uniqueKey: "(bm_code, row_num)";
    migrationStatus: {
      bmCodeColumn: "present" | "missing" | "unknown";
      existingBmCodeRows: number;
      totalPurchaseRows: number;
    };
  };
  readonly protectedData: {
    productsFields: readonly string[];
    purchaseFields: readonly string[];
    vendorsNote: string;
    inventoryChecksNote: string;
    stockHistoryNote: string;
  };
  readonly criticalBlockers: readonly string[];
  readonly userDecisions: readonly string[];
  readonly readyForWrite: false;              // 반드시 false
}

// Supabase product_code 기준 Barcode-only 샘플 Warehouse code 집합
const WAREHOUSE_1_CODES = new Set(["24", "25", "26", "27", "7B", "8A"]);
function wClass(code: string | null | undefined): "w1" | "w2" | "none" {
  if (!code) return "none";
  const c = String(code).trim().toUpperCase();
  if (WAREHOUSE_1_CODES.has(c)) return "w1";
  if (c.length > 4) return "none";
  const n = parseInt(c, 10);
  if (!isNaN(n) && String(n) === c) return (n >= 1 && n <= 99) ? "w2" : "none";
  if (/^[0-9A-Z]{2,4}$/.test(c)) return "w2";
  return "none";
}

export async function runDryRun(): Promise<DryRunPreview> {
  const t0 = Date.now();
  logger.info("[initialBuildPreview] DRY-RUN 시작 (READ ONLY)");

  // 1. Snapshot 로드
  const pl = loadProductListSnapshot();
  const buy = loadBuyStatusSnapshot();

  if (!pl) {
    throw new HttpError(503, "Product_List snapshot 없음 · data/snapshots/product-list-*.json 생성 필요 (sync-agent 를 통해 1회 조회)");
  }

  // 2. Supabase READ
  const dbProducts = await loadAllProductsFromDb();
  const dbByCode = new Map(dbProducts.map((p) => [String(p.product_code).trim(), p]));

  // 3. 상품 분류 (ERP_MATCHED / ERP_NEW / DB_ONLY / BARCODE_CONFLICT)
  const matchedResults: ReturnType<typeof buildErpProductPayload>[] = [];
  const newInsertResults: ReturnType<typeof buildErpProductPayload>[] = [];
  let conflict = 0;

  const barcodeDup = new Map<string, number>();
  for (const er of pl.rows) {
    const bc = String(er.BarCode ?? "").trim();
    if (!bc) continue;
    barcodeDup.set(bc, (barcodeDup.get(bc) ?? 0) + 1);
  }
  for (const [, n] of barcodeDup) if (n > 1) conflict++;

  const erpSeen = new Set<string>();
  for (const er of pl.rows) {
    const bc = String(er.BarCode ?? "").trim();
    if (!bc) continue;
    if (erpSeen.has(bc)) continue; // duplicate 는 conflict 로 집계만
    erpSeen.add(bc);
    const dbRow = dbByCode.get(bc) ?? null;
    try {
      const r = buildErpProductPayload(er, dbRow);
      if (dbRow) matchedResults.push(r);
      else newInsertResults.push(r);
    } catch (e) {
      logger.warn(`[initialBuildPreview] 상품 변환 실패 ${bc}: ${(e as Error).message}`);
    }
  }

  const dbOnly = dbProducts.filter((p) => !erpSeen.has(String(p.product_code).trim())).length;

  // 4. Field-level diff 집계
  const fieldKeys = [
    "product_name", "supplier", "supplier_code", "unit", "sale_status",
    "brand", "manufacturer", "last_purchase_date", "last_sale_date", "current_stock",
    "display_location",
  ];
  const fieldLevel: DryRunPreview["fieldLevel"] = {};
  for (const k of fieldKeys) {
    fieldLevel[k] = { same: 0, change: 0, db_empty_erp_has: 0, erp_empty_db_has: 0, both_empty: 0 };
  }
  for (const r of matchedResults) {
    for (const d of r.diffs) {
      const bucket = fieldLevel[d.field];
      if (!bucket) continue;
      if (d.status in bucket) (bucket as any)[d.status]++;
    }
  }

  // 5. Location 통계
  const location = {
    autoApply: 0,
    keep: 0,
    review: 0,
    reviewByFlag: {
      LOCATION_REVIEW_BEAUTY: 0,
      LOCATION_REVIEW_FRIDGE: 0,
      LOCATION_REVIEW_REAR_FRONT: 0,
    } as Record<LocationReviewFlag, number>,
    erpMissingKeepDb: 0,
    warehouseClassFlip: 0,
  };
  for (const r of matchedResults) {
    if (r.locationDecision === "apply") location.autoApply++;
    else if (r.locationDecision === "keep") {
      location.keep++;
      // ERP empty + DB has 인지 확인
      const dbRow = dbByCode.get(r.productCode);
      const dbLoc = (dbRow?.display_location || dbRow?.location || "").trim();
      if (dbLoc && (r.locationResult.reason === "empty" || r.locationResult.reason === "no_middle" || r.locationResult.reason === "empty_middle")) {
        location.erpMissingKeepDb++;
      }
    } else {
      location.review++;
      if (r.locationResult.reviewFlag) location.reviewByFlag[r.locationResult.reviewFlag]++;
    }
    // Warehouse class flip
    if (r.locationDecision === "apply" && r.locationResult.derived) {
      const dbRow = dbByCode.get(r.productCode);
      const dbLoc = dbRow?.display_location || dbRow?.location || null;
      const beforeC = wClass(dbLoc);
      const afterC = wClass(r.locationResult.derived);
      if ((beforeC === "w1" && afterC === "w2") || (beforeC === "w2" && afterC === "w1")) {
        location.warehouseClassFlip++;
      }
    }
  }
  // ERP_NEW 중 review 집계
  for (const r of newInsertResults) {
    if (r.locationDecision === "review" && r.locationResult.reviewFlag) {
      location.reviewByFlag[r.locationResult.reviewFlag]++;
      location.review++;
    } else if (r.locationDecision === "apply") {
      location.autoApply++;
    }
  }

  // 6. Price 통계 (현재 whitelist 에 포함 안 되지만 Preview 는 수집)
  const price = {
    saleMatch: 0, saleDbEmptyErpHas: 0, saleDifferent: 0, saleBothEmpty: 0,
    purchaseMatch: 0, purchaseDbEmptyErpHas: 0, purchaseDifferent: 0, purchaseBothEmpty: 0,
    userDecisionRequired: 0,
  };
  for (const er of pl.rows) {
    const bc = String(er.BarCode ?? "").trim();
    if (!bc) continue;
    const dbRow = dbByCode.get(bc);
    if (!dbRow) continue;
    // sale_price vs PriceA
    const salePa = Number(er.PriceA);
    const saleDb = dbRow.current_stock == null ? null : Number((dbRow as any).sale_price);
    const salePaHas = Number.isFinite(salePa) && salePa > 0;
    const saleDbHas = saleDb != null && Number.isFinite(saleDb) && saleDb > 0;
    if (!salePaHas && !saleDbHas) price.saleBothEmpty++;
    else if (!salePaHas && saleDbHas) price.saleBothEmpty++;
    else if (salePaHas && !saleDbHas) price.saleDbEmptyErpHas++;
    else if (Math.abs(salePa - saleDb!) < 0.01) price.saleMatch++;
    else { price.saleDifferent++; price.userDecisionRequired++; }

    // purchase_price vs CostPrice
    const costP = Number(er.CostPrice);
    const purDb = (dbRow as any).purchase_price == null ? null : Number((dbRow as any).purchase_price);
    const costHas = Number.isFinite(costP) && costP > 0;
    const purDbHas = purDb != null && Number.isFinite(purDb) && purDb > 0;
    if (!costHas && !purDbHas) price.purchaseBothEmpty++;
    else if (!costHas && purDbHas) price.purchaseBothEmpty++;
    else if (costHas && !purDbHas) price.purchaseDbEmptyErpHas++;
    else if (Math.abs(costP - purDb!) < 0.01) price.purchaseMatch++;
    else { price.purchaseDifferent++; price.userDecisionRequired++; }
  }

  // 7. Purchase (Buy_Status) 통계
  const pcodeMap = buildPCodeToBarcodeMap(pl.rows as any);
  let buyMapped = 0, buyUnmapped = 0;
  if (buy) {
    for (const br of buy.rows) {
      try {
        const r = buildBuyRowFromErp(br, pcodeMap);
        if (r.productMatchStatus === "mapped") buyMapped++;
        else buyUnmapped++;
      } catch {
        buyUnmapped++;
      }
    }
  }

  const purchaseKeys = await countExistingPurchaseKeys();

  // 8. Critical blockers · USER DECISIONS 분리
  const criticalBlockers: string[] = [];
  if (conflict > 0) criticalBlockers.push(`BARCODE_CONFLICT=${conflict} (same Barcode · 다른 상품)`);
  const erpMissingBarcode = pl.rows.filter((r) => !String(r.BarCode ?? "").trim()).length;
  if (erpMissingBarcode > 0) criticalBlockers.push(`ERP_MISSING_BARCODE=${erpMissingBarcode}`);
  if (purchaseKeys.withBmCode === -1) criticalBlockers.push("purchase_details.bm_code · row_num 컬럼 미생성 (migration 필요)");

  const userDecisions: string[] = [];
  if (location.reviewByFlag.LOCATION_REVIEW_BEAUTY > 0) userDecisions.push(`뷰티 Location 규칙 (${location.reviewByFlag.LOCATION_REVIEW_BEAUTY} 상품)`);
  if (location.reviewByFlag.LOCATION_REVIEW_FRIDGE > 0) userDecisions.push(`냉장고 Location 규칙 (${location.reviewByFlag.LOCATION_REVIEW_FRIDGE} 상품)`);
  if (location.reviewByFlag.LOCATION_REVIEW_REAR_FRONT > 0) userDecisions.push(`매대+뒤/앞 Location 규칙 (${location.reviewByFlag.LOCATION_REVIEW_REAR_FRONT} 상품)`);
  if (price.saleDifferent > 0) userDecisions.push(`sale_price Different (${price.saleDifferent}) · USE ERP / KEEP CURRENT`);
  if (price.purchaseDifferent > 0) userDecisions.push(`purchase_price Different (${price.purchaseDifferent}) · USE ERP / KEEP CURRENT`);
  userDecisions.push("GO-LIVE 날짜 확정");
  userDecisions.push("Backup 보관 기간 승인");

  const preview: DryRunPreview = {
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    snapshots: {
      productList: { path: pl.path, rows: pl.rows.length, fetchedAt: pl.meta?.fetchedAt },
      buyStatus: buy ? { path: buy.path, rows: buy.rows.length, fetchedAt: buy.meta?.fetchedAt } : null,
    },
    erpConfig: { present: !!process.env.CorpDB_nm || !!process.env.IREGEN_CORP_DB_NM, source: "env" },
    product: {
      erpCount: pl.rows.length,
      dbCount: dbProducts.length,
      matched: matchedResults.length,
      newInsert: newInsertResults.length,
      dbOnly,
      conflict,
      protectedMutation: 0,
    },
    fieldLevel,
    location,
    price,
    purchase: {
      buyStatusRows: buy?.rows.length ?? 0,
      mapped: buyMapped,
      unmapped: buyUnmapped,
      uniqueKey: "(bm_code, row_num)",
      migrationStatus: {
        bmCodeColumn: purchaseKeys.withBmCode === -1 ? "missing" : "present",
        existingBmCodeRows: purchaseKeys.withBmCode === -1 ? 0 : purchaseKeys.withBmCode,
        totalPurchaseRows: purchaseKeys.total,
      },
    },
    protectedData: {
      productsFields: ["optimal_stock", "optimal_stock_backup", "memo", "hidden", "stock_note", "imported_at"],
      purchaseFields: ["verified_by", "verify_status", "verify_note", "verified_at", "verified_expiring", "expiry_date"],
      vendorsNote: "전체 24 column PROTECTED · ERP 가 contact/approval/note 등 건드리지 않음",
      inventoryChecksNote: "전체 PROTECTED · shelf_positions 만 MERGE 로 slot 추가 (사용자 상세 보존)",
      stockHistoryNote: "전체 KEEP · GO-LIVE 이후 신규 쌓기 (Phase 3)",
    },
    criticalBlockers,
    userDecisions,
    readyForWrite: false,
  };

  const totalMs = Date.now() - t0;
  logger.info(`[initialBuildPreview] DRY-RUN 완료 · ${totalMs}ms · matched=${preview.product.matched} new=${preview.product.newInsert} dbOnly=${preview.product.dbOnly}`);
  return preview;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/** DRY-RUN Preview · lv≥9 · DB WRITE 없음 */
router.get(
  "/api/admin/initial-build/preview",
  authorize(9),
  asyncHandler(async (_req, res) => {
    const preview = await runDryRun();
    res.json(preview);
  }),
);

/** Execute endpoint · 명시적으로 locked · DB WRITE 금지 */
router.post(
  "/api/admin/initial-build/execute",
  authorize(9),
  asyncHandler(async (_req, _res) => {
    throw new HttpError(
      423,
      "Initial Data Build 실행 잠금 · Phase 2 는 DRY-RUN 전용 · 실제 WRITE 는 사용자 명시 승인 후 Phase 3 에서 활성화",
    );
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-03 저녁 · Phase 2 · ERP Sync Runner endpoints
// ─────────────────────────────────────────────────────────────────────────────
import { syncProducts } from "../../services/erpSync/productSyncRunner";
import { syncPurchases } from "../../services/erpSync/buySyncRunner";
import type { SyncMode } from "../../services/erpSync/types";

interface SyncRequestBody {
  mode?: SyncMode;
  allowWrite?: boolean;
  source?: "SNAPSHOT" | "LIVE_ERP";
  batchSize?: number;
}

/**
 * 서버 측 추가 안전 게이트:
 *   · 요청에 mode="WRITE" + allowWrite=true 가 모두 있어야 통과
 *   · 환경변수 ERP_SYNC_WRITE_ENABLED=true 가 추가로 필요 (double gate · process level)
 *   · Phase 2 에서는 ERP_SYNC_WRITE_ENABLED 환경변수를 설정하지 않음 → 모든 WRITE 요청 403
 */
function enforceWriteSafety(body: SyncRequestBody): { mode: SyncMode; allowWrite: boolean } {
  const mode: SyncMode = body.mode === "WRITE" ? "WRITE" : "DRY_RUN";
  const requestedWrite = body.allowWrite === true;
  const envGate = String(process.env.ERP_SYNC_WRITE_ENABLED || "").toLowerCase() === "true";
  const canWrite = mode === "WRITE" && requestedWrite && envGate;
  if (mode === "WRITE" && !canWrite) {
    throw new HttpError(
      403,
      "ERP Sync WRITE 거부 · Phase 2 는 DRY_RUN 전용. " +
      "실제 WRITE 는 (1) body.allowWrite=true (2) process.env.ERP_SYNC_WRITE_ENABLED=true 두 조건 모두 필요.",
    );
  }
  return { mode: canWrite ? "WRITE" : "DRY_RUN", allowWrite: canWrite };
}

/** Product Sync Runner · POST · 기본 DRY_RUN */
router.post(
  "/api/admin/erp-sync/products",
  authorize(9),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as SyncRequestBody;
    const gate = enforceWriteSafety(body);
    const result = await syncProducts(supabase, {
      mode: gate.mode,
      allowWrite: gate.allowWrite,
      source: body.source === "LIVE_ERP" ? "LIVE_ERP" : "SNAPSHOT",
      batchSize: body.batchSize,
    });
    res.json(result);
  }),
);

/** Buy Sync Runner · POST · 기본 DRY_RUN · migration 미적용 시 자동 차단 */
router.post(
  "/api/admin/erp-sync/purchases",
  authorize(9),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as SyncRequestBody;
    const gate = enforceWriteSafety(body);
    const result = await syncPurchases(supabase, {
      mode: gate.mode,
      allowWrite: gate.allowWrite,
      source: body.source === "LIVE_ERP" ? "LIVE_ERP" : "SNAPSHOT",
      batchSize: body.batchSize,
    });
    res.json(result);
  }),
);

export default router;
