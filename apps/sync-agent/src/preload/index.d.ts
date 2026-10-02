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
  erpInventoryQuery(): Promise<
    | {
        ok: true;
        rowCount: number;
        columns: string[];
        rows: Record<string, unknown>[];
        meta: { soapMs: number; decoderMs: number; totalMs: number; queriedAt: string };
      }
    | { ok: false; stage: "config" | "soap" | "xml" | "decoder" | "fs"; error: string }
  >;
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
