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
