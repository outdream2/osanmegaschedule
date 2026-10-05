// apps/sync-agent/src/preload/index.ts
// 2026-09-15 · Phase 2 · IPC 브릿지 · contextBridge (보안)
//   · Config · Auth · Scheduler · Dialog · 화이트리스트 방식

import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

export type FileKind = "products" | "stock" | "purchase";

export interface LastRun {
  at: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  fileName?: string;
}

export interface RendererConfig {
  server: { baseUrl: string };
  auth: { email?: string; hasToken: boolean };
  folders: Partial<Record<FileKind, string>>;
  schedules: Partial<Record<FileKind, string>>;
  lastRun: Partial<Record<FileKind, LastRun>>;
  autoStart: boolean;
  showNotifications: boolean;
}

const api = {
  // ── 앱 정보 ────────────────────────────────────
  getAppInfo: () => ipcRenderer.invoke("app-info") as Promise<{ version: string; name: string }>,

  // ── Config ────────────────────────────────────
  getConfig: () => ipcRenderer.invoke("config:get") as Promise<RendererConfig>,
  patchConfig: (patch: Partial<RendererConfig>) =>
    ipcRenderer.invoke("config:patch", patch) as Promise<{ ok: boolean; config: RendererConfig }>,
  // 2026-10-05 · ERP 자동 Scheduler 상태 (lastRun/nextRun 포함)
  erpSchedulerGetStatus: () =>
    ipcRenderer.invoke("erpScheduler:getStatus") as Promise<{ ok: boolean; status: Record<string, { enabled: boolean; interval: string; time: string; weekday: number; lastRunAt?: string; lastRunResult?: string; nextRunAt?: string; active: boolean }> }>,

  // ── Auth ──────────────────────────────────────
  isLoggedIn: () => ipcRenderer.invoke("auth:isLoggedIn") as Promise<boolean>,
  getSavedPhone: () =>
    ipcRenderer.invoke("auth:getSavedPhone") as Promise<{ savedPhone: string; savePhone: boolean }>,
  // 2026-09-15 · fix · 웹앱과 동일 · 핸드폰번호 (email 아님) · savePhone 옵션 (아이디 저장)
  login: (phone: string, password: string, savePhone: boolean) =>
    ipcRenderer.invoke("auth:login", { phone, password, savePhone }) as Promise<{ ok: boolean; error?: string }>,
  logout: () => ipcRenderer.invoke("auth:logout") as Promise<{ ok: boolean }>,

  // ── Dialog ────────────────────────────────────
  selectFolder: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke("dialog:selectFolder", options) as Promise<string | null>,

  // ── Scheduler ─────────────────────────────────
  runNow: (kind: FileKind) =>
    ipcRenderer.invoke("scheduler:runNow", kind) as Promise<{
      ok: boolean; kind: FileKind; filesProcessed: number; filesFailed: number; message: string;
    }>,
  runAll: () => ipcRenderer.invoke("scheduler:runAll") as Promise<Array<{
    ok: boolean; kind: FileKind; filesProcessed: number; filesFailed: number; message: string;
  }>>,
  findLatest: (kind: FileKind) =>
    ipcRenderer.invoke("importer:findLatest", kind) as Promise<
      | { ok: true; name: string; date: string; isProcessed: boolean; isFailed: boolean; mtime: number }
      | { ok: false; error: string }
    >,

  // ── 로컬 큐 ────────────────────────────────
  listQueue: () => ipcRenderer.invoke("queue:list") as Promise<Array<{
    id: string; kind: FileKind; filePath: string; originalName: string;
    addedAt: string; attempts: number; nextRetryAt: string; lastError?: string;
  }>>,
  removeQueueItem: (id: string) => ipcRenderer.invoke("queue:remove", id) as Promise<{ ok: boolean }>,
  clearQueue: () => ipcRenderer.invoke("queue:clear") as Promise<{ ok: boolean }>,

  // ── 폴더 상태·열기 ────────────────────────
  folderStats: (kind: FileKind) => ipcRenderer.invoke("folder:stats", kind) as Promise<
    | { ok: true; folder: string; pending: number; processed: number; failed: number; failedLogs: number }
    | { ok: false; error: string }
  >,
  openFolder: (kind: FileKind, subdir?: "processed" | "failed") =>
    ipcRenderer.invoke("folder:open", kind, subdir) as Promise<{ ok: boolean; error?: string }>,

  // ── Iregen ERP Live Query (검증용 · READ-ONLY · Supabase 미반영) ──
  erpInventoryQuery: (opts?: { startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke("erp:inventoryStatus", opts) as Promise<
      | {
          ok: true;
          rowCount: number;
          columns: string[];
          rows: Record<string, unknown>[];
          meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
        }
      | { ok: false; stage: "config" | "network" | "http" | "decoder" | "fs"; error: string }
    >,
  // 2026-10-03 · 진단 TEST A · Fiddler Request Raw 전송 (CorpDB_nm 만 env 치환)
  erpInventoryQueryRaw: () =>
    ipcRenderer.invoke("erp:inventoryStatusRaw") as Promise<
      | {
          ok: true;
          rowCount: number;
          columns: string[];
          rows: Record<string, unknown>[];
          meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
        }
      | { ok: false; stage: "config" | "network" | "http" | "decoder" | "fs"; error: string }
    >,
  // 2026-10-03 · PHASE 1 · Product_List (사업장 상품관리 · pagination)
  erpProductList: (opts?: { pageSize?: number; maxPages?: number; concurrency?: number }) =>
    ipcRenderer.invoke("erp:productList", opts) as Promise<
      | {
          ok: true;
          rowCount: number;
          columns: string[];
          rows: Record<string, unknown>[];
          meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
        }
      | { ok: false; stage: "config" | "network" | "http" | "decoder" | "fs"; error: string }
    >,
  // 2026-10-03 · PHASE 1 · Buy_Status (매입 현황 · DevStartDate/DevEndDate)
  erpBuyStatus: (opts?: { startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke("erp:buyStatus", opts) as Promise<
      | {
          ok: true;
          rowCount: number;
          columns: string[];
          rows: Record<string, unknown>[];
          meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
        }
      | { ok: false; stage: "config" | "network" | "http" | "decoder" | "fs"; error: string }
    >,
  // 2026-10-04 · PHASE 1 · Sale_Status (판매 현황 · StartDate/EndDate)
  erpSaleStatus: (opts?: { startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke("erp:saleStatus", opts) as Promise<
      | {
          ok: true;
          rowCount: number;
          columns: string[];
          rows: Record<string, unknown>[];
          meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
        }
      | { ok: false; stage: "config" | "network" | "http" | "decoder" | "fs"; error: string }
    >,
  // 2026-10-04 · S2 Product Sync Service (상단 "ERP → Supabase 동기화" workflow)
  productSyncRunCheck: () =>
    ipcRenderer.invoke("productSync:runCheck") as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  productSyncApplyWrite: (opts: { allowWrite: boolean }) =>
    ipcRenderer.invoke("productSync:applyWrite", opts) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  productSyncGetHistory: (opts?: { limit?: number }) =>
    ipcRenderer.invoke("productSync:getHistory", opts) as Promise<{ ok: boolean; history: Array<Record<string, unknown>> }>,
  // 2026-10-04 · BUY Sync Service (호출자 ERP rows 주입 · Service 는 재조회 X)
  buySyncRunCheck: (args: { erpRows: Record<string, unknown>[] }) =>
    ipcRenderer.invoke("buy:runCheck", args) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  buySyncApplyWrite: (args: { erpRows: Record<string, unknown>[]; allowWrite: boolean }) =>
    ipcRenderer.invoke("buy:applyWrite", args) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  // 2026-10-04 · stock_history Sync Service (ERP Inventory_Status · metadata 외부 주입)
  stockHistorySyncRunCheck: (args: { erpRows: Record<string, unknown>[]; metadata: { period_start: string; period_end: string } }) =>
    ipcRenderer.invoke("stockHistory:runCheck", args) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  stockHistorySyncApplyWrite: (args: { erpRows: Record<string, unknown>[]; metadata: { period_start: string; period_end: string }; allowWrite: boolean }) =>
    ipcRenderer.invoke("stockHistory:applyWrite", args) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  saleSyncRunCheck: (args: { erpRows: Record<string, unknown>[] }) =>
    ipcRenderer.invoke("sale:runCheck", args) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  saleSyncApplyWrite: (args: { erpRows: Record<string, unknown>[]; allowWrite: boolean }) =>
    ipcRenderer.invoke("sale:applyWrite", args) as Promise<{ ok: boolean; result?: unknown; error?: string }>,
  syncHistoryGet: (args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS"; limit?: number }) =>
    ipcRenderer.invoke("syncHistory:get", args) as Promise<{ ok: boolean; history: Array<Record<string, unknown>> }>,
  erpGetFetchHistory: (args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS"; limit?: number }) =>
    ipcRenderer.invoke("erp:getFetchHistory", args) as Promise<{ ok: boolean; history: Array<Record<string, unknown>> }>,
  erpGetHistoryIndex: (args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS" }) =>
    ipcRenderer.invoke("erp:getHistoryIndex", args) as Promise<{ ok: boolean; entries?: Array<Record<string, unknown>>; error?: string }>,
  erpLoadHistorySnapshot: (args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS"; snapshotId: string; limit?: number }) =>
    ipcRenderer.invoke("erp:loadHistorySnapshot", args) as Promise<{ ok: boolean; meta?: Record<string, unknown>; rows?: Array<Record<string, unknown>>; total?: number; error?: string }>,
  // ── Iregen 연동 설정 (CorpDB_nm · safeStorage · renderer 로 재전달 X) ──
  iregenGetSettings: () =>
    ipcRenderer.invoke("iregen:getSettings") as Promise<{
      enabled: boolean;
      endpoint: string;
      soapAction: string;
      corpDbNmSet: boolean;
      source: "env" | "safeStorage" | "none";
      envSourceLabel: string | null;
    }>,
  iregenSaveSettings: (patch: {
    enabled?: boolean;
    endpoint?: string;
    soapAction?: string;
    corpDbNm?: string;
  }) =>
    ipcRenderer.invoke("iregen:saveSettings", patch) as Promise<
      { ok: true; corpDbNmSet: boolean } | { ok: false; error: string }
    >,
  iregenClearCorpDbNm: () => ipcRenderer.invoke("iregen:clearCorpDbNm") as Promise<{ ok: boolean }>,

  // ── 2026-10-04 · Phase 2 · Multi-Dataset ERP Gateway ──
  erpSyncGetAllDatasets: () => ipcRenderer.invoke("erpSync:getAllDatasets"),
  erpSyncGetDatasetState: (dataset: string) =>
    ipcRenderer.invoke("erpSync:getDatasetState", dataset),
  erpSyncFetchDataset: (args: { dataset: string; startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke("erpSync:fetchDataset", args) as Promise<{ ok: true; enqueued: true; dataset: string }>,
  erpSyncFetchSelected: (args: { datasets: string[]; startDate?: string; endDate?: string }) =>
    ipcRenderer.invoke("erpSync:fetchSelected", args) as Promise<{ ok: true; enqueued: string[] }>,
  erpSyncRevalidate: (dataset: string) =>
    ipcRenderer.invoke("erpSync:revalidate", dataset) as Promise<{ ok: boolean; validation: unknown }>,
  erpSyncGetRows: (args: { dataset: string; limit?: number }) =>
    ipcRenderer.invoke("erpSync:getRows", args) as Promise<
      | { ok: true; rows: unknown[]; total: number }
      | { ok: false; error: string }
    >,
  erpSyncSyncSelected: (args: { datasets: string[]; allowWrite?: boolean }) =>
    ipcRenderer.invoke("erpSync:syncSelected", args) as Promise<{
      ok: boolean; dryRun: boolean; inserted: number; updated: number; failed: number; message?: string;
    }>,
  onErpDatasetProgress: (
    callback: (p: { dataset: string; phase: string; page?: number; totalPages?: number; rowsAccum?: number; totalRowsExpected?: number; startedAt?: string; message?: string }) => void,
  ): (() => void) => {
    const listener = (_: unknown, p: any) => callback(p);
    ipcRenderer.on("erp:dataset-progress", listener);
    return () => { ipcRenderer.removeListener("erp:dataset-progress", listener); };
  },

  // 2026-10-03 · Product_List pagination 진행률 (매 페이지/배치 완료 broadcast)
  onErpProductProgress: (
    callback: (p: { page: number; rowsAccum: number; done?: boolean; totalPages?: number; totalRowsExpected?: number }) => void,
  ): (() => void) => {
    const listener = (_: unknown, p: any) => callback(p);
    ipcRenderer.on("erp:product-progress", listener);
    return () => { ipcRenderer.removeListener("erp:product-progress", listener); };
  },

  // ── 이벤트 리스너 · main → renderer ────────────
  onNavigate: (callback: (page: string) => void): (() => void) => {
    const listener = (_: unknown, page: string) => callback(page);
    ipcRenderer.on("navigate", listener);
    return () => { ipcRenderer.removeListener("navigate", listener); };
  },
  onUpdateStatus: (callback: (status: { type: string; version?: string }) => void): (() => void) => {
    const listener = (_: unknown, status: { type: string; version?: string }) => callback(status);
    ipcRenderer.on("update-status", listener);
    return () => { ipcRenderer.removeListener("update-status", listener); };
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (err) {
    console.error(err);
  }
} else {
  // @ts-ignore
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
}

export type SyncAgentApi = typeof api;
