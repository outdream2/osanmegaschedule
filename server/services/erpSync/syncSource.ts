// server/services/erpSync/syncSource.ts
// 2026-10-03 저녁 · Phase 2 · ERP 데이터 소스 로더 (SNAPSHOT or LIVE_ERP wrapper)
//   · 개발/테스트 기본 SNAPSHOT (ERP 재호출 금지 원칙)
//   · LIVE_ERP 는 Electron sync-agent 실행 가정 (현재 Node 서버에서는 scaffold)

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import logger from "../../lib/logger";
import type { ErpProductRow } from "../../../src/shared/erp/erpProductMapper";
import type { ErpBuyRow } from "../../../src/shared/erp/erpBuyMapper";

const SNAPSHOT_DIR = resolve(process.cwd(), "data/snapshots");

export interface LoadedSnapshot<T> {
  readonly rows: readonly T[];
  readonly path: string;
  readonly fetchedAt?: string;
}

function pickLatestSnapshot(prefix: string, explicitPath?: string): string | null {
  if (explicitPath) {
    return existsSync(explicitPath) ? explicitPath : null;
  }
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  return files.length ? join(SNAPSHOT_DIR, files[files.length - 1]) : null;
}

export function loadProductListSnapshot(explicitPath?: string): LoadedSnapshot<ErpProductRow> | null {
  const path = pickLatestSnapshot("product-list-", explicitPath);
  if (!path) {
    logger.warn("[syncSource] Product_List snapshot 없음 · data/snapshots/product-list-*.json");
    return null;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  logger.info(`[syncSource] Product_List snapshot 로드 · ${path} · rows=${(parsed.rows ?? []).length}`);
  return { rows: (parsed.rows ?? []) as ErpProductRow[], path, fetchedAt: parsed._meta?.fetchedAt };
}

export function loadBuyStatusSnapshot(explicitPath?: string): LoadedSnapshot<ErpBuyRow> | null {
  const path = pickLatestSnapshot("buy-status-", explicitPath);
  if (!path) {
    logger.warn("[syncSource] Buy_Status snapshot 없음");
    return null;
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  logger.info(`[syncSource] Buy_Status snapshot 로드 · ${path} · rows=${(parsed.rows ?? []).length}`);
  return { rows: (parsed.rows ?? []) as ErpBuyRow[], path, fetchedAt: parsed._meta?.fetchedAt };
}

/**
 * LIVE_ERP 모드 scaffold.
 * 현재 Node 서버에서는 Electron sync-agent 를 직접 호출하지 않음.
 * (Electron 과 Node 는 다른 프로세스 · IPC 필요)
 *
 * 사용자 지시 사항:
 *   · ERP concurrency = 1
 *   · retry 30s/60s/120s/abort (이미 iregenSoap.ts 에 반영됨)
 *   · 개발/테스트는 SNAPSHOT 우선
 *
 * TODO Phase 3 (production):
 *   · Electron sync-agent 가 Supabase 직접 호출 (현재 아키텍처)
 *   · 또는 Node 서버가 scheduled job 으로 호출 (아직 미구현)
 */
export function fetchLiveProductList(): never {
  throw new Error(
    "[syncSource] LIVE_ERP Product_List 모드 미구현 · " +
    "현재 Node 서버에서는 ERP SOAP 직접 호출 scaffold 없음. " +
    "sync-agent 가 Product_List 호출 후 snapshot 저장 → SNAPSHOT 소스로 재사용.",
  );
}

export function fetchLiveBuyStatus(): never {
  throw new Error(
    "[syncSource] LIVE_ERP Buy_Status 모드 미구현 · SNAPSHOT 우선 사용.",
  );
}
