// apps/sync-agent/src/main/snapshotHistoryStore.ts
// 2026-10-04 · ERP 조회 결과 저장 · AUTO / MANUAL / INITIAL_SYNC trigger 분리 + History 실체 보존
//
// 역할:
//   하단 Manual 조회 (하단 ErpSection) → trigger=MANUAL → manual-latest + history 저장
//   상단 Auto 조회 (Scheduler/orchestrator) → trigger=AUTO → sync-latest + history 저장
//   최초 전체 구축 (CLI/수동 1회) → trigger=INITIAL_SYNC → sync-latest + history 저장
//
// 저장 구조:
//   {userData}/erp-cache/{dataset-slug}/
//     sync-latest.json.gz        · AUTO/INITIAL_SYNC 전용 최신 조회 결과
//     manual-latest.json.gz      · MANUAL 전용 최신 조회 결과
//     history/{snapshotId}.json.gz  · 성공 조회 전수 보존 (overwrite 금지)
//     history-index.json         · snapshotId → metadata 매핑
//     candidate.json.gz          · 레거시 호환 유지 (당분간)

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { gzipSync, gunzipSync } from "zlib";
import { randomUUID, createHash } from "crypto";
import type { DatasetKey } from "./datasetTypes";

export type SyncTrigger = "AUTO" | "MANUAL" | "INITIAL_SYNC" | "SCHEDULED";

const SLUG: Record<DatasetKey, string> = {
  PRODUCT_LIST: "product-list",
  INVENTORY_STATUS: "inventory-status",
  BUY_STATUS: "buy-status",
  SALE_STATUS: "sale-status",
};

export interface SnapshotMetaV2 {
  readonly snapshotId: string;
  readonly dataset: DatasetKey;
  readonly trigger: SyncTrigger;
  readonly fetchedAt: string;
  readonly completedAt: string;
  readonly rowCount: number;
  readonly queryFrom?: string;
  readonly queryTo?: string;
  readonly checksum: string;
}

export interface SnapshotPayloadV2 {
  readonly meta: SnapshotMetaV2;
  readonly rows: ReadonlyArray<unknown>;
}

export interface HistoryEntryV2 {
  readonly snapshotId: string;
  readonly dataset: DatasetKey;
  readonly trigger: SyncTrigger;
  readonly fetchedAt: string;
  readonly rowCount: number;
  readonly queryFrom?: string;
  readonly queryTo?: string;
  readonly actualPath: string;  // history/{snapshotId}.json.gz 상대 경로
}

function datasetDir(dataset: DatasetKey): string {
  const dir = join(app.getPath("userData"), "erp-cache", SLUG[dataset]);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function historyDir(dataset: DatasetKey): string {
  const dir = join(datasetDir(dataset), "history");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function syncLatestPath(dataset: DatasetKey): string {
  return join(datasetDir(dataset), "sync-latest.json.gz");
}
function manualLatestPath(dataset: DatasetKey): string {
  return join(datasetDir(dataset), "manual-latest.json.gz");
}
function historyIndexPath(dataset: DatasetKey): string {
  return join(datasetDir(dataset), "history-index.json");
}
function historySnapshotPath(dataset: DatasetKey, snapshotId: string): string {
  return join(historyDir(dataset), `${snapshotId}.json.gz`);
}

function stableChecksum(rows: ReadonlyArray<unknown>): string {
  const h = createHash("sha256");
  h.update(String(rows.length));
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    h.update(JSON.stringify(rows[i]));
  }
  return h.digest("hex");
}

function writeGzip(target: string, payload: SnapshotPayloadV2): void {
  const tmp = `${target}.tmp`;
  const buf = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  writeFileSync(tmp, buf);
  renameSync(tmp, target);
}

function readGzip(path: string): SnapshotPayloadV2 | null {
  if (!existsSync(path)) return null;
  try {
    const buf = readFileSync(path);
    return JSON.parse(gunzipSync(buf).toString("utf8")) as SnapshotPayloadV2;
  } catch (err) {
    console.warn(`[snapshotHistoryStore] ${path} 로드 실패 · ${(err as Error).message}`);
    return null;
  }
}

function loadIndex(dataset: DatasetKey): HistoryEntryV2[] {
  const p = historyIndexPath(dataset);
  if (!existsSync(p)) return [];
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw as HistoryEntryV2[];
  } catch {
    return [];
  }
}

function writeIndex(dataset: DatasetKey, entries: HistoryEntryV2[]): void {
  const p = historyIndexPath(dataset);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2), "utf8");
  renameSync(tmp, p);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface SaveInput {
  readonly dataset: DatasetKey;
  readonly rows: ReadonlyArray<unknown>;
  readonly trigger: SyncTrigger;
  readonly fetchedAt?: string;      // 시작 시각
  readonly completedAt?: string;    // 완료 시각
  readonly queryFrom?: string;
  readonly queryTo?: string;
}

/**
 * ERP 조회 성공 결과 저장.
 *   · 반드시 trigger 에 따라 적절한 latest 파일 교체
 *   · history/{snapshotId}.json.gz 로 실체 rows 보존 (overwrite 금지)
 *   · history-index.json 에 entry append
 *
 * MANUAL → manual-latest · sync-latest 는 건드리지 않음
 * AUTO / SCHEDULED / INITIAL_SYNC → sync-latest · manual-latest 는 건드리지 않음
 *
 * 0 rows 도 정상 history entry 로 기록.
 */
export function saveWithHistory(input: SaveInput): SnapshotMetaV2 {
  const snapshotId = randomUUID();
  const now = new Date().toISOString();
  const meta: SnapshotMetaV2 = {
    snapshotId,
    dataset: input.dataset,
    trigger: input.trigger,
    fetchedAt: input.fetchedAt ?? now,
    completedAt: input.completedAt ?? now,
    rowCount: input.rows.length,
    queryFrom: input.queryFrom,
    queryTo: input.queryTo,
    checksum: stableChecksum(input.rows),
  };
  const payload: SnapshotPayloadV2 = { meta, rows: input.rows };

  // 1. history/{snapshotId}.json.gz 저장 (atomic rename)
  writeGzip(historySnapshotPath(input.dataset, snapshotId), payload);

  // 2. trigger 에 따라 latest 교체
  if (input.trigger === "MANUAL") {
    writeGzip(manualLatestPath(input.dataset), payload);
  } else {
    // AUTO · SCHEDULED · INITIAL_SYNC
    writeGzip(syncLatestPath(input.dataset), payload);
  }

  // 3. history-index append (최대 500 entry 유지)
  const idx = loadIndex(input.dataset);
  const entry: HistoryEntryV2 = {
    snapshotId,
    dataset: input.dataset,
    trigger: input.trigger,
    fetchedAt: meta.fetchedAt,
    rowCount: meta.rowCount,
    queryFrom: meta.queryFrom,
    queryTo: meta.queryTo,
    actualPath: `history/${snapshotId}.json.gz`,
  };
  const next = [entry, ...idx].slice(0, 500);
  writeIndex(input.dataset, next);

  return meta;
}

/** AUTO/Scheduler sync source · sync-latest.json.gz · manual 은 사용 X */
export function loadLatestForSync<T = unknown>(dataset: DatasetKey): { meta: SnapshotMetaV2; rows: T[] } | null {
  const p = readGzip(syncLatestPath(dataset));
  if (!p) return null;
  return { meta: p.meta, rows: p.rows as T[] };
}

/** 하단 UI 임의 조회 결과 · manual-latest.json.gz */
export function loadLatestManual<T = unknown>(dataset: DatasetKey): { meta: SnapshotMetaV2; rows: T[] } | null {
  const p = readGzip(manualLatestPath(dataset));
  if (!p) return null;
  return { meta: p.meta, rows: p.rows as T[] };
}

/** 특정 history snapshot 로드 (UI 보기 전용) */
export function loadHistorySnapshot<T = unknown>(dataset: DatasetKey, snapshotId: string): { meta: SnapshotMetaV2; rows: T[] } | null {
  const p = readGzip(historySnapshotPath(dataset, snapshotId));
  if (!p) return null;
  return { meta: p.meta, rows: p.rows as T[] };
}

/** history-index 전수 조회 (UI 리스트용) */
export function getHistoryIndex(dataset: DatasetKey): HistoryEntryV2[] {
  return loadIndex(dataset);
}

/** 최초 1회 수동 복사 유틸: manual-latest → sync-latest (INITIAL_SYNC 예외 처리용) */
export function promoteManualToSync(dataset: DatasetKey): SnapshotMetaV2 | null {
  const p = readGzip(manualLatestPath(dataset));
  if (!p) return null;
  // 새 snapshotId · trigger=INITIAL_SYNC 로 재저장
  return saveWithHistory({
    dataset,
    rows: p.rows,
    trigger: "INITIAL_SYNC",
    fetchedAt: p.meta.fetchedAt,
    completedAt: p.meta.completedAt,
    queryFrom: p.meta.queryFrom,
    queryTo: p.meta.queryTo,
  });
}
