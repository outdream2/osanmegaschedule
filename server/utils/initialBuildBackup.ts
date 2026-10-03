// server/utils/initialBuildBackup.ts
// 2026-10-03 저녁 · Phase 2 · Initial Data Build · Backup/Rollback scaffold
//   · ⚠ scaffold only · 실제 실행은 Phase 3 사용자 승인 후
//   · 호출 책임자: initialBuildRunner (Phase 3 신규)
//   · DRY-RUN 단계에서는 호출되지 않음

import type { SupabaseClient } from "@supabase/supabase-js";
import logger from "../lib/logger";

export interface BackupResult {
  readonly table: string;
  readonly snapshotTable: string;
  readonly originalRowCount: number;
  readonly snapshotRowCount: number;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * ⚠ scaffold · 호출 시 실제로 CREATE TABLE AS 를 수행함.
 * Phase 2 에서는 호출 금지. Phase 3 명시 승인 후 사용.
 *
 * 안전 체크:
 *   - snapshot row count === original row count 아니면 ABORT
 *   - 호출 전 반드시 ERP + Supabase 모든 응답 완료 상태여야 함
 *
 * TODO (Phase 3):
 *   - Supabase 는 CREATE TABLE AS 를 service_role 로 RPC 호출 필요 (REST API 로는 불가)
 *   - 사전에 supabase/migrations/future_phase3_backup_rpc.sql 로 RPC 함수 등록
 */
export async function createSnapshotTable(
  _supabase: SupabaseClient,
  _tableName: string,
  _suffix: string,
): Promise<BackupResult> {
  throw new Error("[initialBuildBackup] Phase 2 scaffold · 실제 실행 금지 · Phase 3 승인 후 활성화");
}

export interface RollbackPlan {
  readonly steps: readonly string[];
  readonly notes: readonly string[];
}

/**
 * FK/CASCADE 를 고려한 Rollback 계획 생성 (실행 아님).
 *
 * TODO Phase 3:
 *   - FK audit 결과 반영
 *   - products ← purchase_details FK 있으면 purchase_details rollback 먼저
 *   - inventory_checks ← products FK 있으면 inventory_checks 먼저 복원
 *   - RLS/trigger 복사 안 되는 문제 사전 고지
 */
export function buildRollbackPlan(backupSuffix: string): RollbackPlan {
  return {
    steps: [
      `BEGIN;`,
      `-- FK 종속 테이블부터 역순 복원`,
      `TRUNCATE inventory_checks RESTART IDENTITY CASCADE;`,
      `INSERT INTO inventory_checks SELECT * FROM inventory_checks_snapshot_${backupSuffix};`,
      `TRUNCATE purchase_details RESTART IDENTITY CASCADE;`,
      `INSERT INTO purchase_details SELECT * FROM purchase_details_snapshot_${backupSuffix};`,
      `TRUNCATE stock_history RESTART IDENTITY CASCADE;`,
      `INSERT INTO stock_history SELECT * FROM stock_history_snapshot_${backupSuffix};`,
      `TRUNCATE products RESTART IDENTITY CASCADE;`,
      `INSERT INTO products SELECT * FROM products_snapshot_${backupSuffix};`,
      `COMMIT;`,
    ],
    notes: [
      "⚠ 실행 전 FK audit 결과 반드시 확인 (CASCADE 가 다른 테이블까지 지울 수 있음)",
      "⚠ Supabase 는 RPC/function 으로 wrap 해야 TRUNCATE 가능 (REST 는 TRUNCATE 지원 X)",
      "⚠ snapshot table 은 RLS 복사 안 됨 · 복원 후 RLS 재검증 필요",
      "⚠ 거대 trans action 금지 · chunk 500 batch 로 분할하는 대체 전략 검토",
    ],
  };
}

/** FK audit · Supabase information_schema READ ONLY (scaffold) */
export async function auditForeignKeys(supabase: SupabaseClient): Promise<{
  ok: boolean;
  constraints?: Array<{ table: string; column: string; references: string; onDelete: string | null }>;
  error?: string;
}> {
  try {
    // information_schema 는 Supabase 에서 PostgREST 로 노출 안 됨 → RPC 필요
    //   · 아래 쿼리는 RPC audit_fk_constraints() 안에 들어가야 함
    //   · 현재는 scaffold · 호출 시 명확한 에러
    logger.info("[initialBuildBackup] auditForeignKeys · 현재 RPC 미구현 · 수동 SQL 필요");
    const sqlForManualInspection = `
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS references_table,
        ccu.column_name AS references_column,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name IN ('products', 'purchase_details', 'stock_history', 'inventory_checks', 'vendors');
    `;
    void supabase; // placeholder · 실제 호출은 Phase 3
    return {
      ok: false,
      error: "FK audit 는 Supabase SQL Editor 에서 수동 실행 필요 (RPC 미구현):\n" + sqlForManualInspection,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
