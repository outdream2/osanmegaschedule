// apps/sync-agent/src/main/fetchHistoryStore.ts
// 2026-10-04 · 사용자 지시 · ERP 직접 조회 저장 이력
//   · 하단 "🔗 Iregen ERP 직접 조회" 에서 조회할 때마다 append
//   · 각 Dataset 별 최근 50건 유지
//   · dataset 폴더 안 fetch-history.json 저장 · syncHistory 와 분리

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

export interface FetchHistoryEntry {
  readonly id: string;
  readonly dataset: DatasetKey;
  readonly fetchedAt: string;   // 조회 완료 시각
  readonly ok: boolean;
  readonly rowCount: number;
  readonly queryFrom?: string;  // 기간 조회 API 만
  readonly queryTo?: string;
  readonly soapMs?: number;
  readonly totalMs?: number;
  readonly stage?: string;      // 실패 시 stage
  readonly error?: string;
}

function historyPath(dataset: DatasetKey): string {
  const dir = join(app.getPath("userData"), "erp-cache", SLUG[dataset]);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "fetch-history.json");
}

export function loadFetchHistory(dataset: DatasetKey): FetchHistoryEntry[] {
  const p = historyPath(dataset);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FetchHistoryEntry[];
  } catch (err) {
    console.warn(`[fetchHistory] ${dataset} 로드 실패 · ${(err as Error).message}`);
    return [];
  }
}

export function appendFetchHistory(dataset: DatasetKey, entry: Omit<FetchHistoryEntry, "id" | "dataset">): FetchHistoryEntry {
  const target = historyPath(dataset);
  const existing = loadFetchHistory(dataset);
  const full: FetchHistoryEntry = { ...entry, id: randomUUID(), dataset };
  // 최신이 앞 (역순 유지)
  const next = [full, ...existing].slice(0, MAX_ENTRIES);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, target);
  return full;
}

export function getRecentFetchHistory(dataset: DatasetKey, limit: number = 20): FetchHistoryEntry[] {
  return loadFetchHistory(dataset).slice(0, Math.max(1, Math.min(MAX_ENTRIES, limit)));
}
