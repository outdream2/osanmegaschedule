// apps/sync-agent/src/main/ipc.ts
// 2026-09-15 · Phase 2 · IPC handlers · renderer ↔ main
//   · config CRUD · 로그인 · 폴더 선택 · 스케줄 · 즉시 실행

import { ipcMain, dialog, BrowserWindow } from "electron";
import { loadConfig, patchConfig, isLoggedIn, type FileKind, type AppConfig } from "./config";
import { login, logout } from "./auth";
import { rescheduleAll, runNow, runNowAll } from "./scheduler";
import { findLatestFile } from "./importer";

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

  ipcMain.handle("auth:getSavedPhone", () => {
    const cfg = loadConfig();
    return { savedPhone: cfg.auth.savedPhone ?? "", savePhone: cfg.auth.savePhone ?? true };
  });

  ipcMain.handle("auth:login", async (_e, credentials: { phone: string; password: string; savePhone?: boolean }) => {
    const result = await login(credentials.phone, credentials.password);
    // 로그인 성공 · 아이디 저장 설정 반영
    if (result.ok) {
      const cleanPhone = credentials.phone.replace(/[^0-9]/g, "");
      const { patchConfig } = await import("./config");
      patchConfig({
        auth: {
          savedPhone: credentials.savePhone ? cleanPhone : undefined,
          savePhone: credentials.savePhone ?? false,
        },
      });
    }
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

  // ── 최신 파일 정보 조회 (지금 실행 전 · 확인 dialog 용) ──
  ipcMain.handle("importer:findLatest", async (_e, kind: FileKind) => {
    const cfg = loadConfig();
    const folder = cfg.folders[kind];
    if (!folder) return { ok: false, error: "폴더 미설정" };
    const latest = findLatestFile(folder);
    if (!latest) return { ok: false, error: "폴더에 xlsx 파일 없음" };
    return {
      ok: true,
      name: latest.name,
      date: latest.date,
      isProcessed: latest.isProcessed,
      mtime: latest.mtime,
    };
  });
}
