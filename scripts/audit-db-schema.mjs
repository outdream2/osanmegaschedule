/**
 * scripts/audit-db-schema.mjs
 * Supabase 실제 스키마 vs 코드가 요구하는 스키마 감사
 *
 * 실행: node scripts/audit-db-schema.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ── 코드가 요구하는 테이블 및 컬럼 정의 ────────────────────────────────────────
// server/routes/*.ts grep 결과 기반 (supabase.from(...).select/insert/update 참조 전체)
const REQUIRED_SCHEMA = {
  // ── 핵심 마스터 ────────────────────────────────────────────────────────────
  products: [
    "product_code", "product_name", "spec", "supplier", "supplier_code",
    "purchase_price", "sale_price", "profit_rate", "expiry_date",
    "real_map", "display_location", "current_stock", "sale_status",
    "category", "hidden", "search_keywords", "optimal_stock",
    "optimal_stock_backup", "cost_price", "brand", "manufacturer",
    "barcode", "memo", "note", "last_purchase_date", "min_order",
  ],
  vendors: [
    "id", "company_name", "contact_name", "phone", "email",
    "category", "note", "business_number", "password_hash", "created_at",
  ],
  employees: [
    "id", "level", "auth_level", "push_subscription",
  ],

  // ── 매입 / 재고 ────────────────────────────────────────────────────────────
  purchase_details: [
    "id", "purchase_date", "period_start_date", "period_type",
    "supplier_code", "supplier_name", "product_code", "product_name",
    "spec", "quantity", "unit_price", "amount", "vat", "total",
    "imported_at",
  ],
  stock_history: [
    "product_code", "product_name", "supplier_code", "supplier_name", "spec",
    "snapshot_date", "period_start_date", "period_type",
    "opening_stock", "purchase_qty", "sale_qty", "disposal_qty",
    "internal_qty", "adjustment_qty", "closing_stock",
    "supply_amount", "total_amount",
  ],
  inventory_checks: [
    "id", "product_code", "warehouse_stock", "store_stock", "checked_at", "status",
  ],

  // ── OCR ────────────────────────────────────────────────────────────────────
  ocr_confirmed_items: [
    "id", "saved_at", "supplier", "product_name", "product_code",
    "quantity", "unit_price", "amount", "balance", "expiry_date",
    "memo", "raw_json", "created_at",
  ],
  ocr_templates: [
    "supplier_name", "headers", "column_mapping", "updated_at",
  ],
  ocr_supplier_aliases: [
    "id", "alias", "canonical", "created_at",
  ],
  ocr_synonyms: [
    "id", "prod_name_old", "created_at",
  ],
  ocr_deleted_rows: [
    "id", "signature", "deleted_at",
  ],

  // ── 재고 검증 (신규) ───────────────────────────────────────────────────────
  stock_reconciliation_sessions: [
    "id", "session_date", "supplier", "title", "status",
    "source_confirmed_ids", "memo", "created_by",
    "created_at", "updated_at", "finalized_at",
  ],
  stock_reconciliation_items: [
    "id", "session_id", "product_code", "product_name",
    "receiving_qty", "invoice_qty", "erp_qty",
    "receiving_note", "invoice_note", "erp_note",
    "receiving_confirmed_by", "receiving_confirmed_at",
    "invoice_confirmed_by", "invoice_confirmed_at",
    "created_at", "updated_at",
  ],

  // ── 공급사 잔고 ────────────────────────────────────────────────────────────
  supplier_balances: [
    "supplier_name", "balance", "invoice_date", "created_at",
  ],
  supplier_balance_configs: [
    "supplier_name", "balance_field", "column_layout", "updated_at",
  ],

  // ── 요청 / 배정 / 알림 ─────────────────────────────────────────────────────
  display_requests: [
    "id", "status", "requested_at",
  ],
  order_requests: [
    "id", "product_code", "requested_at",
  ],
  order_dispatches: [
    "id",
  ],
  zone_assignments: [
    "dow",
  ],
  zone_mismatches: [
    "product_code",
  ],
  notifications: [
    "id",
  ],
  anon_push_subscriptions: [
    "id", "subscription",
  ],
  stock_arrivals: [
    "id", "broadcast_sent",
  ],

  // ── 기타 ──────────────────────────────────────────────────────────────────
  app_settings: [
    "key", "value", "updated_at",
  ],
  leave_requests: [
    "id", "status",
  ],
  lunch_requests: [
    "id", "date", "eating",
  ],
  reservations: [
    "id",
  ],
};

// ── 테이블 존재 여부 및 컬럼 목록 조회 ─────────────────────────────────────────
async function getActualColumns(tableName) {
  // 행이 하나라도 있으면 keys 로 컬럼 목록 파악
  // 없으면 information_schema 로 fallback
  const { data, error } = await sb
    .from(tableName)
    .select("*")
    .limit(1);

  if (error) {
    if (/relation|does not exist/i.test(error.message)) {
      return { exists: false, columns: [] };
    }
    // 테이블 존재하지만 다른 오류 (RLS 등) → information_schema 시도
    return queryInformationSchema(tableName);
  }

  if (data && data.length > 0) {
    return { exists: true, columns: Object.keys(data[0]) };
  }

  // 빈 테이블 → information_schema
  return queryInformationSchema(tableName);
}

async function queryInformationSchema(tableName) {
  const { data, error } = await sb
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", tableName);

  if (error || !data || data.length === 0) {
    // information_schema 접근 불가 or 테이블 없음
    // 마지막 수단: 빈 SELECT 로 에러 메시지 보고 존재 여부만 파악
    return { exists: !error, columns: [] };
  }

  return { exists: true, columns: data.map(r => r.column_name) };
}

// ── 메인 감사 로직 ────────────────────────────────────────────────────────────
async function runAudit() {
  console.log("=".repeat(60));
  console.log("Supabase 스키마 감사 시작");
  console.log(`대상 DB: ${process.env.SUPABASE_URL}`);
  console.log("=".repeat(60));

  const missingTables = [];
  const missingColumns = {}; // tableName → string[]
  const okTables = [];

  const tableNames = Object.keys(REQUIRED_SCHEMA);
  console.log(`\n검증 테이블 수: ${tableNames.length}개\n`);

  for (const tableName of tableNames) {
    const requiredCols = REQUIRED_SCHEMA[tableName];
    const { exists, columns: actualCols } = await getActualColumns(tableName);

    if (!exists) {
      missingTables.push(tableName);
      console.log(`[MISSING TABLE] ${tableName}`);
      continue;
    }

    const missing = actualCols.length === 0
      ? [] // 컬럼 목록 파악 불가 (RLS 등) → 컬럼 감사 스킵
      : requiredCols.filter(col => !actualCols.includes(col));

    if (missing.length > 0) {
      missingColumns[tableName] = missing;
      console.log(`[MISSING COLS]  ${tableName}: ${missing.join(", ")}`);
    } else {
      okTables.push(tableName);
      console.log(`[OK]            ${tableName} (${actualCols.length}열)`);
    }
  }

  // ── 요약 ──────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("감사 결과 요약");
  console.log("=".repeat(60));

  console.log(`\n총 검증: ${tableNames.length}개`);
  console.log(`  정상:           ${okTables.length}개`);
  console.log(`  누락 테이블:    ${missingTables.length}개`);
  console.log(`  컬럼 누락 테이블: ${Object.keys(missingColumns).length}개`);

  if (missingTables.length > 0) {
    console.log("\n[ 누락 테이블 ]");
    missingTables.forEach(t => console.log(`  - ${t}`));
  }

  if (Object.keys(missingColumns).length > 0) {
    console.log("\n[ 테이블별 누락 컬럼 ]");
    for (const [tbl, cols] of Object.entries(missingColumns)) {
      console.log(`  ${tbl}:`);
      cols.forEach(c => console.log(`    - ${c}`));
    }
  }

  if (missingTables.length === 0 && Object.keys(missingColumns).length === 0) {
    console.log("\n모든 테이블 및 컬럼이 존재합니다.");
  } else {
    console.log("\n수정 SQL: migrations/audit-fix.sql 을 Supabase SQL Editor 에서 실행하세요.");
  }

  return { missingTables, missingColumns };
}

runAudit().catch(err => {
  console.error("감사 스크립트 오류:", err?.message ?? err);
  process.exit(1);
});
