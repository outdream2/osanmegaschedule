// apps/sync-agent/src/main/datasetTypes.ts
// 2026-10-04 · Phase 2 · 3 Dataset 독립 관리 · 타입 정의
//
// Dataset 별 ERP ↔ Supabase gateway 상태 · 각각 독립
//   PRODUCT_LIST     → "상품정보 · 현재고"
//   INVENTORY_STATUS → "재고 입출고 현황"
//   BUY_STATUS       → "매입내역"

export type DatasetKey = "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS";

export const DATASET_LABEL: Record<DatasetKey, string> = {
  PRODUCT_LIST: "상품정보 · 현재고",
  INVENTORY_STATUS: "재고 입출고 현황",
  BUY_STATUS: "매입내역",
  SALE_STATUS: "판매내역",
};

export const DATASET_API_NAME: Record<DatasetKey, string> = {
  PRODUCT_LIST: "Product_List",
  INVENTORY_STATUS: "Inventory_Status",
  BUY_STATUS: "Buy_Status",
  SALE_STATUS: "Sale_Status",
};

export type FetchPhase =
  | "IDLE"
  | "QUEUED"
  | "REQUESTING"
  | "RECEIVING"
  | "DECODING"
  | "VALIDATING"
  | "READY"
  | "FAILED";

export type SyncReadiness =
  | "READY"              // Validation 통과 · Sync 가능
  | "REVIEW"             // REVIEW 가 있어 사용자 확인 필요 (Sync 가능)
  | "BLOCKED"            // ERROR 또는 migration 미적용 · Sync 불가
  | "NOT_CONFIGURED"     // 해당 Dataset 의 Supabase destination 정책 미확정
  | "SYNCED";            // 최근 Sync 완료 상태 (Phase 3 이후 활성화)

export interface ValidationSummary {
  readonly totalRows: number;
  readonly normal: number;
  readonly review: number;
  readonly error: number;
  readonly blockingErrors: boolean;
}

export interface SnapshotMeta {
  readonly snapshotId: string;
  readonly dataset: DatasetKey;
  readonly fetchedAt: string;
  readonly completedAt: string;
  readonly rowCount: number;
  /** sha256(dataset-level deterministic hash) · identity 정렬 후 stable serialize */
  readonly checksum: string;
  readonly validation?: ValidationSummary;
  /** mapping 규칙 버전 · bump 시 기존 snapshot 재처리 유도 */
  readonly mappingVersion?: number;
}

/** 2026-10-04 · candidate + last-synced 분리 메타 */
export interface DatasetMetadata {
  readonly datasetType: DatasetKey;
  readonly candidate: SnapshotMeta | null;
  readonly lastSynced: SnapshotMeta | null;
  readonly lastSyncAttemptAt: string | null;
  readonly lastSyncResult: "VERIFIED_SUCCESS" | "PARTIAL_FAILED" | "FAILED" | null;
  readonly syncStatus: SyncReadiness;
  readonly mappingVersion: number;
}

export interface DatasetProgress {
  readonly dataset: DatasetKey;
  readonly phase: FetchPhase;
  readonly page?: number;
  readonly totalPages?: number;
  readonly rowsAccum?: number;
  readonly totalRowsExpected?: number;
  readonly startedAt?: string;
  readonly message?: string;
}

export interface DatasetState {
  readonly dataset: DatasetKey;
  readonly phase: FetchPhase;
  readonly readiness: SyncReadiness;
  /** @deprecated · 호환성 유지 · 신규 코드는 candidate/lastSynced 사용 */
  readonly snapshot: SnapshotMeta | null;
  readonly candidate: SnapshotMeta | null;
  readonly lastSynced: SnapshotMeta | null;
  readonly lastSyncAttemptAt: string | null;
  readonly lastSyncResult: "VERIFIED_SUCCESS" | "PARTIAL_FAILED" | "FAILED" | null;
  readonly inflight: DatasetProgress | null;
  readonly lastError: string | null;
  readonly dependencyMessage: string | null;
  readonly mappingVersion: number;
}

/** 현재 Mapping 규칙 버전 · 변환 로직 변경 시 bump */
export const CURRENT_MAPPING_VERSION = 1;

/** Sync 가능 여부 간단 판정 (UI 보조) */
export function canSyncDataset(state: DatasetState): boolean {
  if (state.readiness === "BLOCKED") return false;
  if (state.readiness === "NOT_CONFIGURED") return false;
  if (!state.snapshot) return false;
  if (state.snapshot.validation?.blockingErrors) return false;
  return state.readiness === "READY" || state.readiness === "REVIEW";
}
