// server/services/erpSync/types.ts
// 2026-10-03 저녁 · Phase 2 · ERP → Supabase Sync Runner · 공통 타입
//
// 핵심 원칙:
//   · 기본값 mode = "DRY_RUN" · allowWrite = false
//   · 실제 WRITE 는 mode==="WRITE" AND allowWrite===true 둘 다 요구 (double gate)
//   · 민감 credential 로그 금지

/** Sync 모드 */
export type SyncMode = "DRY_RUN" | "WRITE";

/** ERP 데이터 소스 */
export type SyncSource = "LIVE_ERP" | "SNAPSHOT";

export interface SyncRunnerOptions {
  /** 기본 DRY_RUN · DB WRITE 금지 */
  readonly mode?: SyncMode;
  /** mode==="WRITE" 이고 allowWrite===true 일 때만 실제 WRITE 수행 (double gate) */
  readonly allowWrite?: boolean;
  /** 기본 SNAPSHOT · 개발/테스트 ERP 재호출 방지 */
  readonly source?: SyncSource;
  /** chunk 크기 (default 300) · Supabase payload 과도 방지 */
  readonly batchSize?: number;
  /** SNAPSHOT 사용 시 명시 경로 (default: data/snapshots/*-latest) */
  readonly snapshotPath?: string;
  /** reporter · 중간 batch 결과 즉시 로깅 (optional) */
  readonly onBatchComplete?: (batchIdx: number, totalBatches: number, partial: BatchResult) => void;
}

/** 한 batch 처리 결과 */
export interface BatchResult {
  readonly batchIdx: number;
  readonly rowCount: number;
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

export interface ProductSyncResult {
  readonly mode: SyncMode;
  readonly actualWriteExecuted: boolean;        // 반드시 WRITE 수행된 경우만 true
  readonly source: SyncSource;
  readonly snapshotPath?: string;
  readonly erpRows: number;
  readonly dbRows: number;
  readonly matched: number;                     // ERP ∩ DB · UPDATE 후보
  readonly newInsert: number;                   // ERP only · INSERT 후보
  readonly dbOnly: number;                      // DB only · KEEP
  readonly conflict: number;                    // same Barcode · 다른 상품명 (현재 0 예상)
  readonly erpMissingBarcode: number;
  // DRY_RUN 결과 (실제 WRITE 될 payload 집계)
  readonly wouldUpdate: number;                 // UPDATE 될 상품 수 (changedFieldCount > 0)
  readonly wouldInsert: number;
  readonly wouldSkipSame: number;               // 모든 field same · payload empty
  readonly reviewLocation: number;              // 뷰티·냉장고·뒤앞 · 사용자 결정 전 KEEP
  // WRITE 결과 (allowWrite 통과 시만)
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly protectedMutationCount: 0;           // 반드시 0 (방어 유틸)
  readonly batches: readonly BatchResult[];
  readonly elapsedMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly sanitizedErrors: readonly string[];  // credential 없는 요약 에러만
}

export type BuyBlockReason =
  | "MIGRATION_REQUIRED"      // bm_code · row_num 컬럼 없음
  | "SNAPSHOT_MISSING"
  | "WRITE_LOCKED";

export interface BuySyncResult {
  readonly mode: SyncMode;
  readonly actualWriteExecuted: boolean;
  readonly source: SyncSource;
  readonly snapshotPath?: string;
  readonly erpRows: number;
  readonly mapped: number;                      // PCode → Barcode 매핑 성공
  readonly unmapped: number;                    // 매핑 실패 (상품 미등록)
  readonly wouldInsert: number;                 // ON CONFLICT DO NOTHING · 신규만 집계
  readonly existingDuplicate: number;           // (bm_code, row_num) 이미 존재
  readonly inserted: number;
  readonly skipped: number;
  readonly failed: number;
  readonly batches: readonly BatchResult[];
  readonly migrationStatus: "present" | "missing" | "unknown";
  readonly blocked: boolean;
  readonly blockReason?: BuyBlockReason;
  readonly elapsedMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly sanitizedErrors: readonly string[];
}
