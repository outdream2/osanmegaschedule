// apps/sync-agent/src/main/ipc.ts
// 2026-09-15 · Phase 2 · IPC handlers · renderer ↔ main
//   · config CRUD · 로그인 · 폴더 선택 · 스케줄 · 즉시 실행

import { ipcMain, dialog, BrowserWindow } from "electron";
import { loadConfig, patchConfig, isLoggedIn, type FileKind, type AppConfig } from "./config";
import { login, logout } from "./auth";
import { rescheduleAll, runNow, runNowAll } from "./scheduler";

export function registerIpcHandlers() {
  // ── Config ────────────────────────────────────
  ipcMain.handle("config:get", () => {
    const cfg = loadConfig();
    // 토큰 노출 X · encryptedToken 필드만 존재 여부 표시
    return {
      ...cfg,
      auth: { email: cfg.auth.email, hasToken: !!cfg.auth.encryptedToken },
    };
  });

  ipcMain.handle("config:patch", (_e, patch: Partial<AppConfig>) => {
    const next = patchConfig(patch);
    // 스케줄 변경 · 자동 재등록
    if (patch.schedules) rescheduleAll();
    return { ok: true, config: next };
  });

  // ── Auth ──────────────────────────────────────
  ipcMain.handle("auth:isLoggedIn", () => isLoggedIn());

  ipcMain.handle("auth:login", async (_e, credentials: { phone: string; password: string }) => {
    const result = await login(credentials.phone, credentials.password);
    return result;
  });

  ipcMain.handle("auth:logout", () => {
    logout();
    return { ok: true };
  });

  // ── 폴더 선택 (Windows dialog) ────────────────
  ipcMain.handle("dialog:selectFolder", async (_e, options?: { title?: string; defaultPath?: string }) => {
    const focused = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(focused ?? undefined!, {
      title: options?.title ?? "폴더 선택",
      defaultPath: options?.defaultPath,
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ── 스케줄 · 즉시 실행 ────────────────────────
  ipcMain.handle("scheduler:runNow", async (_e, kind: FileKind) => {
    return runNow(kind);
  });

  ipcMain.handle("scheduler:runAll", async () => {
    return runNowAll();
  });
}
