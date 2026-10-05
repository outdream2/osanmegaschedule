// apps/sync-agent/src/main/syncHistoryStore.ts
// 2026-10-04 · 사용자 지시 · ERP → Supabase 동기화 이력 저장
//   · 각 applyProductSync 완료 시 append
//   · 최근 N개 유지 (default 50)
//   · 조회: 역순 (최근 먼저)

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { DatasetKey } from "./datasetTypes";

const MAX_ENTRIES = 50;

const SLUG: Record<DatasetKey, string> = {
  PRODUCT_LIST: "product-list",
  INVENTORY_STATUS: "inventory-status",
  BUY_STATUS: "buy-status",
  SALE_STATUS: "sale-status",
};

export interface SyncHistoryEntry {
  readonly id: string;
  readonly dataset: DatasetKey;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly ok: boolean;
  readonly updatedRows: number;
  readonly updatedCells: number;
  readonly skippedSame: number;
  readonly failed: number;
  readonly webModified: number;
  readonly identityModified: number;
  readonly readbackMatched: number;
  readonly readbackMismatch: number;
  readonly erpCacheFetchedAt: string | null;
  readonly erpCacheRowCount: number | null;
  readonly message?: string;
}

function historyPath(dataset: DatasetKey): string {
  const dir = join(app.getPath("userData"), "erp-cache", SLUG[dataset]);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "sync-history.json");
}

export function loadSyncHistory(dataset: DatasetKey): SyncHistoryEntry[] {
  const p = historyPath(dataset);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SyncHistoryEntry[];
  } catch (err) {
    console.warn(`[syncHistory] ${dataset} 로드 실패 · ${(err as Error).message}`);
    return [];
  }
}

export function appendSyncHistory(dataset: DatasetKey, entry: Omit<SyncHistoryEntry, "id" | "dataset">): SyncHistoryEntry {
  const target = historyPath(dataset);
  const existing = loadSyncHistory(dataset);
  const full: SyncHistoryEntry = { ...entry, id: randomUUID(), dataset };
  // 최신이 앞으로 (역순 유지)
  const next = [full, ...existing].slice(0, MAX_ENTRIES);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, target);
  return full;
}

export function getRecentSyncHistory(dataset: DatasetKey, limit: number = 20): SyncHistoryEntry[] {
  return loadSyncHistory(dataset).slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
}
