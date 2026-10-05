import { ElectronAPI } from "@electron-toolkit/preload";

// Renderer 에서 접근 가능한 · window.api 시그니처
// (preload/index.ts 실제 구현과 동기 · types.ts 재사용)

type FileKind = "products" | "stock" | "purchase";

interface LastRun {
  at: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  fileName?: string;
}

interface RendererConfig {
  server: { baseUrl: string };
  auth: { email?: string; hasToken: boolean };
  folders: Partial<Record<FileKind, string>>;
  schedules: Partial<Record<FileKind, string>>;
  lastRun: Partial<Record<FileKind, LastRun>>;
  autoStart: boolean;
  showNotifications: boolean;
  useFileWatcher: boolean;
}

interface RunResult {
  ok: boolean;
  kind: FileKind;
  filesProcessed: number;
  filesFailed: number;
  message: string;
}

interface ProductListVerification {
  firstPageRows: number;
  lastPage: number;
  lastPageRows: number;
  pagesLoaded: number;
  totalRows: number;
  duplicateCodes: number;
  emptyCodes: number;
  erpExpectedRows: number;
  countMatch: boolean;
  verified: boolean;
  firstPageTables: Array<{ index: number; name: string; rowCount: number; columnCount: number; firstColumns: string[]; firstRow?: Record<string, unknown> }>;
  primaryTableName: string;
  rootCauseNote?: string;
  concurrency: number;
  failedPages: number[];
  totalRetries: number;
  elapsedMs: number;
  metadataColumn1?: unknown;
  totalPagesSource: "metadata" | "sequential-detection";
}

type ErpQueryResult =
  | {
      ok: true;
      rowCount: number;
      columns: string[];
      rows: Record<string, unknown>[];
      meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
      verification?: ProductListVerification;
    }
  | { ok: false; stage: "config" | "network" | "http" | "decoder" | "fs"; error: string };

interface SyncAgentApi {
  getAppInfo(): Promise<{ version: string; name: string }>;
  getConfig(): Promise<RendererConfig>;
  patchConfig(patch: Partial<RendererConfig>): Promise<{ ok: boolean; config: RendererConfig }>;
  isLoggedIn(): Promise<boolean>;
  getSavedPhone(): Promise<{ savedPhone: string; savePhone: boolean }>;
  login(phone: string, password: string, savePhone: boolean): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<{ ok: boolean }>;
  selectFolder(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
  runNow(kind: FileKind): Promise<RunResult>;
  runAll(): Promise<RunResult[]>;
  findLatest(kind: FileKind): Promise<
    | { ok: true; name: string; date: string; isProcessed: boolean; isFailed: boolean; mtime: number }
    | { ok: false; error: string }
  >;
  listQueue(): Promise<Array<{
    id: string; kind: FileKind; filePath: string; originalName: string;
    addedAt: string; attempts: number; nextRetryAt: string; lastError?: string;
  }>>;
  removeQueueItem(id: string): Promise<{ ok: boolean }>;
  clearQueue(): Promise<{ ok: boolean }>;
  folderStats(kind: FileKind): Promise<
    | { ok: true; folder: string; pending: number; processed: number; failed: number; failedLogs: number }
    | { ok: false; error: string }
  >;
  openFolder(kind: FileKind, subdir?: "processed" | "failed"): Promise<{ ok: boolean; error?: string }>;
  erpInventoryQuery(opts?: { startDate?: string; endDate?: string }): Promise<ErpQueryResult>;
  erpInventoryQueryRaw(): Promise<ErpQueryResult>;
  erpProductList(opts?: { pageSize?: number; maxPages?: number; concurrency?: number }): Promise<ErpQueryResult>;
  erpBuyStatus(opts?: { startDate?: string; endDate?: string }): Promise<ErpQueryResult>;
  erpSaleStatus(opts?: { startDate?: string; endDate?: string }): Promise<ErpQueryResult>;
  productSyncRunCheck(): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  productSyncApplyWrite(opts: { allowWrite: boolean }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  productSyncGetHistory(opts?: { limit?: number }): Promise<{ ok: boolean; history: Array<Record<string, unknown>> }>;
  buySyncRunCheck(args: { erpRows: Record<string, unknown>[] }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  buySyncApplyWrite(args: { erpRows: Record<string, unknown>[]; allowWrite: boolean }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  stockHistorySyncRunCheck(args: { erpRows: Record<string, unknown>[]; metadata: { period_start: string; period_end: string } }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  stockHistorySyncApplyWrite(args: { erpRows: Record<string, unknown>[]; metadata: { period_start: string; period_end: string }; allowWrite: boolean }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  saleSyncRunCheck(args: { erpRows: Record<string, unknown>[] }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  saleSyncApplyWrite(args: { erpRows: Record<string, unknown>[]; allowWrite: boolean }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  syncHistoryGet(args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS"; limit?: number }): Promise<{ ok: boolean; history: Array<Record<string, unknown>> }>;
  erpGetFetchHistory(args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS"; limit?: number }): Promise<{ ok: boolean; history: Array<Record<string, unknown>> }>;
  erpGetHistoryIndex(args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS" }): Promise<{ ok: boolean; entries?: Array<Record<string, unknown>>; error?: string }>;
  erpLoadHistorySnapshot(args: { dataset: "PRODUCT_LIST" | "INVENTORY_STATUS" | "BUY_STATUS" | "SALE_STATUS"; snapshotId: string; limit?: number }): Promise<{ ok: boolean; meta?: Record<string, unknown>; rows?: Array<Record<string, unknown>>; total?: number; error?: string }>;
  onErpProductProgress(
    callback: (p: { page: number; rowsAccum: number; done?: boolean; totalPages?: number; totalRowsExpected?: number }) => void,
  ): () => void;
  iregenGetSettings(): Promise<{
    enabled: boolean;
    endpoint: string;
    soapAction: string;
    corpDbNmSet: boolean;
    source: "env" | "safeStorage" | "none";
    envSourceLabel: string | null;
  }>;
  iregenSaveSettings(patch: {
    enabled?: boolean;
    endpoint?: string;
    soapAction?: string;
    corpDbNm?: string;
  }): Promise<{ ok: true; corpDbNmSet: boolean } | { ok: false; error: string }>;
  iregenClearCorpDbNm(): Promise<{ ok: boolean }>;
  onNavigate(callback: (page: string) => void): () => void;
  onUpdateStatus(callback: (status: { type: string; version?: string }) => void): () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: SyncAgentApi;
  }
}

export {};
