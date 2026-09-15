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
  login: (email: string, password: string) =>
    ipcRenderer.invoke("auth:login", { email, password }) as Promise<{ ok: boolean; error?: string }>,
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
