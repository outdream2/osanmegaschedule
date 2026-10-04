// apps/sync-agent/src/main/snapshotStore.ts
// 2026-10-04 · Phase 2 · JSON.gz Candidate + Last-Synced 영속 저장
//
// 설계 원칙:
//   · SQLite / IndexedDB 사용 금지 · gzip JSON 만 사용
//   · atomic rename · 중간 실패 시 기존 데이터 보호
//   · candidate (최근 ERP Fetch 성공) vs last-synced (Read-back 검증 완료) 분리
//   · Promotion 은 Read-back 검증 후에만 (promoteCandidateToLastSynced)
//   · ERP 민감정보 저장 금지
//
// 경로:
//   {userData}/erp-cache/{dataset-slug}/
//     candidate.json.gz
//     last-synced.json.gz
//     metadata.json

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync, unlinkSync } from "fs";
import { join } from "path";
import { gzipSync, gunzipSync } from "zlib";
import { createHash, randomUUID } from "crypto";
import type { DatasetKey, SnapshotMeta, DatasetMetadata, ValidationSummary, SyncReadiness } from "./datasetTypes";

const SLUG: Record<DatasetKey, string> = {
  PRODUCT_LIST: "product-list",
  INVENTORY_STATUS: "inventory-status",
  BUY_STATUS: "buy-status",
};

function rootDir(): string {
  const dir = join(app.getPath("userData"), "erp-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function datasetDir(dataset: DatasetKey): string {
  const dir = join(rootDir(), SLUG[dataset]);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function candidatePath(dataset: DatasetKey): string {
  return join(datasetDir(dataset), "candidate.json.gz");
}
function lastSyncedPath(dataset: DatasetKey): string {
  return join(datasetDir(dataset), "last-synced.json.gz");
}
function metadataPath(dataset: DatasetKey): string {
  return join(datasetDir(dataset), "metadata.json");
}

/** 2026-10-04 · computeChecksum 는 datasetHash.ts 가 공식 역할 · 여기선 fallback 간이 체크섬 */
function fallbackChecksum(rows: unknown[]): string {
  const h = createHash("sha256");
  h.update(String(rows.length));
  const sample = rows.slice(0, Math.min(10, rows.length));
  h.update(JSON.stringify(sample));
  return h.digest("hex");
}

interface StoredPayload {
  meta: SnapshotMeta;
  rows: unknown[];
}

/** gzip JSON 저장 (atomic rename) */
function writeGzip(target: string, payload: StoredPayload): void {
  const tmp = `${target}.tmp`;
  const buf = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  writeFileSync(tmp, buf);
  renameSync(tmp, target);
}

/** gzip JSON 로드 · 실패 시 null */
function readGzip<T = StoredPayload>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    const buf = readFileSync(path);
    const text = gunzipSync(buf).toString("utf8");
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`[snapshotStore] ${path} 로드 실패 · ${(err as Error).message}`);
    return null;
  }
}

/** metadata JSON 저장/로드 */
function writeMetadata(dataset: DatasetKey, meta: DatasetMetadata): void {
  const target = metadataPath(dataset);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2), "utf8");
  renameSync(tmp, target);
}
function readMetadata(dataset: DatasetKey): DatasetMetadata | null {
  const p = metadataPath(dataset);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as DatasetMetadata;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate 저장 (ERP Fetch 성공 직후)
// ─────────────────────────────────────────────────────────────────────────────
export interface SaveCandidateInput {
  readonly dataset: DatasetKey;
  readonly rows: readonly unknown[];
  readonly startedAt: string;
  readonly checksum?: string;
  readonly validation?: ValidationSummary;
  readonly mappingVersion: number;
}

export function saveCandidate(input: SaveCandidateInput): SnapshotMeta {
  const meta: SnapshotMeta = {
    snapshotId: randomUUID(),
    dataset: input.dataset,
    fetchedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    rowCount: input.rows.length,
    checksum: input.checksum ?? fallbackChecksum(input.rows as unknown[]),
    validation: input.validation,
    mappingVersion: input.mappingVersion,
  };
  const payload: StoredPayload = { meta, rows: input.rows as unknown[] };
  writeGzip(candidatePath(input.dataset), payload);

  // metadata 업데이트 (lastSynced 는 그대로 유지)
  const prev = readMetadata(input.dataset);
  const nextMeta: DatasetMetadata = {
    datasetType: input.dataset,
    candidate: meta,
    lastSynced: prev?.lastSynced ?? null,
    lastSyncAttemptAt: prev?.lastSyncAttemptAt ?? null,
    lastSyncResult: prev?.lastSyncResult ?? null,
    syncStatus: prev?.syncStatus ?? "READY",
    mappingVersion: input.mappingVersion,
  };
  writeMetadata(input.dataset, nextMeta);
  return meta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate / Last-Synced 로드
// ─────────────────────────────────────────────────────────────────────────────
export function loadCandidateMeta(dataset: DatasetKey): SnapshotMeta | null {
  const payload = readGzip<StoredPayload>(candidatePath(dataset));
  return payload?.meta ?? null;
}
export function loadLastSyncedMeta(dataset: DatasetKey): SnapshotMeta | null {
  const payload = readGzip<StoredPayload>(lastSyncedPath(dataset));
  return payload?.meta ?? null;
}
export function loadCandidateFull<T = unknown>(dataset: DatasetKey): { meta: SnapshotMeta; rows: T[] } | null {
  const payload = readGzip<StoredPayload>(candidatePath(dataset));
  if (!payload || !Array.isArray(payload.rows)) return null;
  return { meta: payload.meta, rows: payload.rows as T[] };
}
export function loadLastSyncedFull<T = unknown>(dataset: DatasetKey): { meta: SnapshotMeta; rows: T[] } | null {
  const payload = readGzip<StoredPayload>(lastSyncedPath(dataset));
  if (!payload || !Array.isArray(payload.rows)) return null;
  return { meta: payload.meta, rows: payload.rows as T[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata 조회/업데이트
// ─────────────────────────────────────────────────────────────────────────────
export function getMetadata(dataset: DatasetKey): DatasetMetadata | null {
  return readMetadata(dataset);
}

export function updateCandidateValidation(dataset: DatasetKey, validation: ValidationSummary): SnapshotMeta | null {
  const full = loadCandidateFull(dataset);
  if (!full) return null;
  const nextMeta: SnapshotMeta = { ...full.meta, validation };
  const payload: StoredPayload = { meta: nextMeta, rows: full.rows };
  writeGzip(candidatePath(dataset), payload);
  // metadata 업데이트
  const prev = readMetadata(dataset);
  if (prev) {
    writeMetadata(dataset, { ...prev, candidate: nextMeta });
  }
  return nextMeta;
}

export function updateSyncStatus(dataset: DatasetKey, status: SyncReadiness): void {
  const prev = readMetadata(dataset);
  if (!prev) return;
  writeMetadata(dataset, { ...prev, syncStatus: status });
}

export function recordSyncAttempt(dataset: DatasetKey, result: "VERIFIED_SUCCESS" | "PARTIAL_FAILED" | "FAILED"): void {
  const prev = readMetadata(dataset);
  if (!prev) return;
  writeMetadata(dataset, {
    ...prev,
    lastSyncAttemptAt: new Date().toISOString(),
    lastSyncResult: result,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate → Last-Synced 승격 (Read-back 검증 통과 시만)
// ─────────────────────────────────────────────────────────────────────────────
export function promoteCandidateToLastSynced(dataset: DatasetKey): SnapshotMeta | null {
  const src = candidatePath(dataset);
  if (!existsSync(src)) return null;
  const target = lastSyncedPath(dataset);
  const tmp = `${target}.tmp`;
  copyFileSync(src, tmp);
  renameSync(tmp, target);

  const meta = loadCandidateMeta(dataset);
  if (!meta) return null;
  const prev = readMetadata(dataset);
  if (prev) {
    writeMetadata(dataset, {
      ...prev,
      lastSynced: meta,
      lastSyncResult: "VERIFIED_SUCCESS",
      lastSyncAttemptAt: new Date().toISOString(),
      syncStatus: "SYNCED",
    });
  }
  return meta;
}

/** 테스트/복구용 · last-synced 삭제 (first-run 시뮬레이션 또는 손상 복구) */
export function clearLastSynced(dataset: DatasetKey): void {
  const p = lastSyncedPath(dataset);
  if (existsSync(p)) unlinkSync(p);
  const prev = readMetadata(dataset);
  if (prev) {
    writeMetadata(dataset, { ...prev, lastSynced: null, lastSyncResult: null, syncStatus: "READY" });
  }
}
