// apps/sync-agent/src/main/snapshotStore.ts
// 2026-10-04 · Phase 2 · 3 Dataset 독립 Snapshot 영속 저장
//   · userData/snapshots/{DATASET}.json
//   · 신규 Fetch 성공 시 "현재 snapshot" 교체 · 중간 실패 시 기존 보호
//   · 프로그램 재시작 후 복원 가능
//   · 민감정보 저장 금지

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { createHash, randomUUID } from "crypto";
import type { DatasetKey, SnapshotMeta, ValidationSummary } from "./datasetTypes";

function snapshotDir(): string {
  const dir = join(app.getPath("userData"), "snapshots");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

interface StoredSnapshot {
  meta: SnapshotMeta;
  rows: unknown[];
}

function filePath(dataset: DatasetKey): string {
  return join(snapshotDir(), `${dataset}.json`);
}

/** 체크섬 (간단) · row count 변조 감지용 */
function computeChecksum(rows: unknown[]): string {
  const h = createHash("sha256");
  h.update(String(rows.length));
  // 처음 몇 row 만으로 가볍게 체크섬 (전체 직렬화 비용 회피)
  const sample = rows.slice(0, Math.min(10, rows.length));
  h.update(JSON.stringify(sample));
  return h.digest("hex").slice(0, 16);
}

/** 저장 · 성공 전 임시 파일 → rename atomic swap · 기존 파일 보호 */
export function saveSnapshot(
  dataset: DatasetKey,
  rows: unknown[],
  startedAt: string,
  validation?: ValidationSummary,
): SnapshotMeta {
  const meta: SnapshotMeta = {
    snapshotId: randomUUID(),
    dataset,
    fetchedAt: startedAt,
    completedAt: new Date().toISOString(),
    rowCount: rows.length,
    checksum: computeChecksum(rows),
    validation,
  };
  const payload: StoredSnapshot = { meta, rows };
  const target = filePath(dataset);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload), "utf8");
  renameSync(tmp, target); // atomic replace
  return meta;
}

/** 로드 (프로그램 재시작 복구용) */
export function loadSnapshotMeta(dataset: DatasetKey): SnapshotMeta | null {
  const p = filePath(dataset);
  if (!existsSync(p)) return null;
  try {
    const payload: StoredSnapshot = JSON.parse(readFileSync(p, "utf8"));
    return payload.meta ?? null;
  } catch (err) {
    console.warn(`[snapshotStore] ${dataset} meta 로드 실패 · ${(err as Error).message}`);
    return null;
  }
}

/** rows 포함 전체 로드 (Validation · Preview · Sync 용) */
export function loadSnapshotFull<T = unknown>(dataset: DatasetKey): { meta: SnapshotMeta; rows: T[] } | null {
  const p = filePath(dataset);
  if (!existsSync(p)) return null;
  try {
    const payload: StoredSnapshot = JSON.parse(readFileSync(p, "utf8"));
    if (!payload.meta || !Array.isArray(payload.rows)) return null;
    return { meta: payload.meta, rows: payload.rows as T[] };
  } catch (err) {
    console.warn(`[snapshotStore] ${dataset} full 로드 실패 · ${(err as Error).message}`);
    return null;
  }
}

/** Validation 결과만 업데이트 (rows 유지) */
export function updateSnapshotValidation(dataset: DatasetKey, validation: ValidationSummary): SnapshotMeta | null {
  const full = loadSnapshotFull(dataset);
  if (!full) return null;
  const updatedMeta: SnapshotMeta = { ...full.meta, validation };
  const payload: StoredSnapshot = { meta: updatedMeta, rows: full.rows };
  const target = filePath(dataset);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload), "utf8");
  renameSync(tmp, target);
  return updatedMeta;
}
