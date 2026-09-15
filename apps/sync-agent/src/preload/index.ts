// apps/sync-agent/src/preload/index.ts
// 2026-09-15 · #253 Phase B · IPC 브릿지 · contextBridge (보안)
//   · renderer (React) 에서 · 안전하게 · main process 함수 호출
//   · 화이트리스트 방식 · 최소 노출

import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const api = {
  // ── 앱 정보 ────────────────────────────────────
  getAppInfo: () => ipcRenderer.invoke("app-info"),

  // ── 이벤트 리스너 · main → renderer ────────────
  onNavigate: (callback: (page: string) => void) => {
    const listener = (_: unknown, page: string) => callback(page);
    ipcRenderer.on("navigate", listener);
    return () => ipcRenderer.removeListener("navigate", listener);
  },
  onUpdateStatus: (callback: (status: { type: string; version?: string }) => void) => {
    const listener = (_: unknown, status: { type: string; version?: string }) => callback(status);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },

  // TODO Phase 2 · 설정 CRUD · 로그 조회 · 즉시 실행 · 로그인 등
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (err) {
    console.error(err);
  }
} else {
  // @ts-ignore (contextIsolation off · 하위 호환)
  window.electron = electronAPI;
  // @ts-ignore
  window.api = api;
}

export type SyncAgentApi = typeof api;
