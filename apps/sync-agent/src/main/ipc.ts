// apps/sync-agent/src/main/ipc.ts
// 2026-09-15 · Phase 2 · IPC handlers · renderer ↔ main
//   · config CRUD · 로그인 · 폴더 선택 · 스케줄 · 즉시 실행

import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import {
  loadConfig, patchConfig, isLoggedIn, type FileKind, type AppConfig,
  hasIregenCorpDbNm, setIregenCorpDbNm, clearIregenCorpDbNm,
  DEFAULT_IREGEN_ENDPOINT, DEFAULT_IREGEN_SOAP_ACTION,
} from "./config";
import { login, logout } from "./auth";
import { runNow, runNowAll } from "./scheduler";
import { findLatestFile } from "./importer";
import { listQueue, clearQueue, removeItem } from "./queue";
import { queryInventoryStatus, iregenSecretSource, iregenEnvSourceLabel } from "./iregenSoap";

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

  ipcMain.handle("config:patch", async (_e, patch: Partial<AppConfig>) => {
    const next = patchConfig(patch);
    // 임포트 모드 변경 or 폴더/스케줄 변경 · 재적용
    if (patch.schedules || patch.folders || patch.useFileWatcher !== undefined) {
      const { applyImportMode } = await import("./index");
      applyImportMode();
    }
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
      isFailed: latest.isFailed,
      mtime: latest.mtime,
    };
  });

  // ── 로컬 큐 · 재시도 대기 · Renderer UI 용 ──
  ipcMain.handle("queue:list", () => listQueue());
  ipcMain.handle("queue:remove", (_e, id: string) => { removeItem(id); return { ok: true }; });
  ipcMain.handle("queue:clear", () => { clearQueue(); return { ok: true }; });

  // ── 폴더 상태 · _processed · _failed 갯수 조회 (Logs 탭) ──
  ipcMain.handle("folder:stats", (_e, kind: FileKind) => {
    const cfg = loadConfig();
    const folder = cfg.folders[kind];
    if (!folder || !existsSync(folder)) return { ok: false, error: "폴더 없음" };
    const countXlsx = (dir: string): number => {
      if (!existsSync(dir)) return 0;
      try {
        return readdirSync(dir).filter(f => {
          const p = join(dir, f);
          try {
            if (!statSync(p).isFile()) return false;
          } catch { return false; }
          const lo = f.toLowerCase();
          return lo.endsWith(".xlsx") || lo.endsWith(".xls");
        }).length;
      } catch { return 0; }
    };
    const countLogs = (dir: string): number => {
      if (!existsSync(dir)) return 0;
      try {
        return readdirSync(dir).filter(f => f.toLowerCase().endsWith(".log")).length;
      } catch { return 0; }
    };
    return {
      ok: true,
      folder,
      pending: countXlsx(folder),
      processed: countXlsx(join(folder, "_processed")),
      failed: countXlsx(join(folder, "_failed")),
      failedLogs: countLogs(join(folder, "_failed")),
    };
  });

  // 2026-10-03 · Iregen ERP Live Query · 검증용 · Supabase WRITE 금지
  //   · UI 버튼 클릭 시만 호출 · 메모리 응답 전용
  ipcMain.handle("erp:inventoryStatus", async () => {
    return queryInventoryStatus();
  });

  // 2026-10-03 · Iregen 연동 설정 · CorpDB_nm 은 safeStorage 저장 · renderer 로 재전달 X
  ipcMain.handle("iregen:getSettings", () => {
    const cfg = loadConfig();
    const source = iregenSecretSource(); // "env" | "safeStorage" | "none"
    return {
      enabled: cfg.iregen?.enabled ?? false,
      endpoint: cfg.iregen?.endpoint || DEFAULT_IREGEN_ENDPOINT,
      soapAction: cfg.iregen?.soapAction || DEFAULT_IREGEN_SOAP_ACTION,
      corpDbNmSet: source !== "none" || hasIregenCorpDbNm(),
      source, // UI 가 env 우선 상태를 표시
      envSourceLabel: iregenEnvSourceLabel(), // 어느 env 파일/프로세스 var 인지 (경로)
    };
  });

  ipcMain.handle("iregen:saveSettings", (_e, patch: {
    enabled?: boolean;
    endpoint?: string;
    soapAction?: string;
    corpDbNm?: string;
  }) => {
    const cfg = loadConfig();
    const nextIregen = {
      enabled: patch.enabled ?? cfg.iregen?.enabled ?? false,
      endpoint: (patch.endpoint ?? cfg.iregen?.endpoint ?? DEFAULT_IREGEN_ENDPOINT).trim() || DEFAULT_IREGEN_ENDPOINT,
      soapAction: (patch.soapAction ?? cfg.iregen?.soapAction ?? DEFAULT_IREGEN_SOAP_ACTION).trim() || DEFAULT_IREGEN_SOAP_ACTION,
      encryptedCorpDbNm: cfg.iregen?.encryptedCorpDbNm,
    };
    patchConfig({ iregen: nextIregen });
    // CorpDB_nm · 입력 값 있을 때만 교체 (빈 문자열 · 유지 · 사용자가 매번 재입력 강제 X)
    if (typeof patch.corpDbNm === "string" && patch.corpDbNm.trim()) {
      const ok = setIregenCorpDbNm(patch.corpDbNm.trim());
      if (!ok) return { ok: false, error: "암호화 저장 실패 (safeStorage)" };
    }
    return { ok: true, corpDbNmSet: hasIregenCorpDbNm() };
  });

  ipcMain.handle("iregen:clearCorpDbNm", () => {
    clearIregenCorpDbNm();
    return { ok: true };
  });

  // ── 폴더 열기 (탐색기) ──
  ipcMain.handle("folder:open", (_e, kind: FileKind, subdir?: "processed" | "failed") => {
    const cfg = loadConfig();
    const folder = cfg.folders[kind];
    if (!folder) return { ok: false, error: "폴더 미설정" };
    const target = subdir === "processed" ? join(folder, "_processed")
                : subdir === "failed"    ? join(folder, "_failed")
                : folder;
    if (!existsSync(target)) return { ok: false, error: "폴더 없음 · " + target };
    shell.openPath(target);
    return { ok: true };
  });
}
