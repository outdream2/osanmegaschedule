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
    | { ok: true; name: string; date: string; isProcessed: boolean; mtime: number }
    | { ok: false; error: string }
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
