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
import { queryInventoryStatus, queryInventoryStatusRaw, queryProductList, queryBuyStatus, querySaleStatus, iregenSecretSource, iregenEnvSourceLabel } from "./iregenSoap";
import {
  enqueueFetch,
  getDatasetState,
  getAllDatasetStates,
  getQueueStatus,
  revalidate,
  loadRows,
  buildProductDiff,
} from "./erpSyncOrchestrator";
import type { DatasetKey } from "./datasetTypes";
import { CURRENT_MAPPING_VERSION } from "./datasetTypes";
import { getSupabaseStatus } from "./supabaseClient";
import { saveCandidate } from "./snapshotStore";

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-04 · 최상위 대원칙 · "api값만 사용한다 · 데이터 임의 연결·생성 금지"
//   · 로컬 join (PCode→BarCode map 등) 전부 금지 · 응답 enrichment 금지
//   · 하단 "🔗 Iregen ERP 직접 조회" 는 순수 API 값만 표시 (사용자 확인 전용)
//   · 로컬 저장 (persistQueryResult) 은 raw 응답 그대로 저장 · 변조 X
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2026-10-04 · 하단 "🔗 Iregen ERP 직접 조회" 결과를 로컬 snapshot 에 저장.
 *   · 사용자 지시 (2-레이어 아키텍처): 직접조회 데이터가 상단 "ERP → Supabase 동기화" workflow 에서 재사용
 *   · 상단과 동일한 candidate.json.gz 에 저장 → 두 영역 single-source 공유
 *   · rows 는 ERP 응답 그대로 저장 · 변조·enrich 금지 (최상위 대원칙)
 *   · 실패 시 조회 결과 반환은 유지 (저장 실패가 조회 자체를 깨뜨리지 않도록 best-effort)
 */
function persistQueryResult(dataset: DatasetKey, result: { ok: boolean; rows?: Record<string, unknown>[]; rowCount?: number; meta?: { queriedAt?: string } }): void {
  if (!result.ok || !Array.isArray(result.rows)) return;
  try {
    saveCandidate({
      dataset,
      rows: result.rows,
      startedAt: result.meta?.queriedAt ?? new Date().toISOString(),
      mappingVersion: CURRENT_MAPPING_VERSION,
    });
  } catch (err) {
    console.warn(`[ipc:erp] ${dataset} snapshot 저장 실패 (조회 결과는 유지) ·`, (err as Error).message);
  }
}

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

  // 2026-10-04 · 2-레이어 아키텍처 (사용자 선언):
  //   하단 "🔗 Iregen ERP 직접 조회" = ERP → 로컬 저장
  //   상단 "⚡ ERP → Supabase 동기화" = 로컬 → Supabase (ERP 재호출 X)
  //   → 하단 조회 handler 는 반환 전에 saveCandidate() + BarCode enrich 수행
  //   → 상단은 loadCandidateFull() 로 재사용

  ipcMain.handle("erp:inventoryStatus", async (_e, opts?: { startDate?: string; endDate?: string }) => {
    const result = await queryInventoryStatus(opts);
    if (result.ok) persistQueryResult("INVENTORY_STATUS", result);
    return result;
  });

  // 2026-10-03 · 사용자 지시 TEST A · diagnostic · Fiddler Request 그대로 전송
  //   · samples/request.txt body 사용 · CorpDB_nm 만 env/safeStorage 로 치환
  //   · diagnostic 용이라 snapshot 저장 X (일회성)
  ipcMain.handle("erp:inventoryStatusRaw", async () => {
    return queryInventoryStatusRaw();
  });

  // 2026-10-03 · PHASE 1 · Product_List (사업장 상품관리)
  //   · PageIdx/PageSize 서버 pagination · 전체 상품 loop
  //   · 2026-10-04 · snapshot 저장 (BarCode enrich 불필요 · 자기 자신)
  ipcMain.handle("erp:productList", async (_e, opts?: { pageSize?: number; maxPages?: number; concurrency?: number }) => {
    const result = await queryProductList(opts);
    if (result.ok) persistQueryResult("PRODUCT_LIST", result);
    return result;
  });

  // 2026-10-03 · PHASE 1 · Buy_Status (매입 현황)
  //   · DevStartDate/DevEndDate 기간 조회
  //   · 2026-10-04 · 응답 그대로 snapshot 저장 (enrich 금지 · 최상위 대원칙)
  ipcMain.handle("erp:buyStatus", async (_e, opts?: { startDate?: string; endDate?: string }) => {
    const result = await queryBuyStatus(opts);
    if (result.ok) persistQueryResult("BUY_STATUS", result);
    return result;
  });

  // 2026-10-04 · PHASE 1 · Sale_Status (판매 현황) · 하단 "🔗 Iregen ERP 직접 조회" 판매현황 탭
  //   · StartDate/EndDate 기간 조회 · RowArea 에 BarCode 포함 요청 (envelope · 요청 파라미터만 수정 OK)
  //   · ERP 응답 그대로 UI 표시 · enrich·join 금지 (최상위 대원칙)
  ipcMain.handle("erp:saleStatus", async (_e, opts?: { startDate?: string; endDate?: string }) => {
    const result = await querySaleStatus(opts);
    if (result.ok) persistQueryResult("SALE_STATUS", result);
    return result;
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

  // ── 2026-10-04 · Phase 2 · Multi-Dataset ERP → Supabase Gateway ──
  //   · 3 Dataset 독립 Fetch · 영속 Snapshot · Queue concurrency=1
  //   · DRY-RUN 전용 · 실제 WRITE 는 Phase 3 승인 후 활성화

  ipcMain.handle("erpSync:getAllDatasets", () => {
    return {
      supabase: getSupabaseStatus(),
      datasets: getAllDatasetStates(),
      queue: getQueueStatus(),
    };
  });

  ipcMain.handle("erpSync:getDatasetState", (_e, dataset: DatasetKey) => {
    return getDatasetState(dataset);
  });

  ipcMain.handle("erpSync:fetchDataset", (_e, args: { dataset: DatasetKey; startDate?: string; endDate?: string }) => {
    enqueueFetch(args.dataset, { startDate: args.startDate, endDate: args.endDate });
    return { ok: true, enqueued: true, dataset: args.dataset };
  });

  ipcMain.handle("erpSync:fetchSelected", (_e, args: { datasets: DatasetKey[]; startDate?: string; endDate?: string }) => {
    for (const d of args.datasets) {
      enqueueFetch(d, { startDate: args.startDate, endDate: args.endDate });
    }
    return { ok: true, enqueued: args.datasets };
  });

  ipcMain.handle("erpSync:revalidate", (_e, dataset: DatasetKey) => {
    const v = revalidate(dataset);
    return { ok: !!v, validation: v };
  });

  ipcMain.handle("erpSync:getRows", (_e, args: { dataset: DatasetKey; limit?: number }) => {
    const rows = loadRows(args.dataset);
    if (!rows) return { ok: false, error: "snapshot 없음" };
    const limit = args.limit ?? 500;
    return { ok: true, rows: rows.slice(0, limit), total: rows.length };
  });

  // 2026-10-04 · Phase 2 · Local Diff + Supabase Final Diff · ERP 호출 없음
  ipcMain.handle("erpSync:productDiff", async () => {
    try {
      const result = await buildProductDiff();
      // UI 전송 payload 는 size 제한 · entries 상위 500 만
      return {
        ok: true,
        candidateHash: result.candidateHash,
        lastSyncedHash: result.lastSyncedHash,
        firstRun: result.firstRun,
        mappingVersion: result.mappingVersion,
        local: {
          total: result.localDiff.total,
          same: result.localDiff.same,
          new: result.localDiff.new_,
          changed: result.localDiff.changed,
          missing: result.localDiff.missing,
        },
        supabase: {
          totalChecked: result.supabaseDiff.totalChecked,
          wouldInsert: result.supabaseDiff.wouldInsert,
          wouldUpdate: result.supabaseDiff.wouldUpdate,
          wouldSkipSame: result.supabaseDiff.wouldSkipSame,
          wouldDelete: result.supabaseDiff.wouldDelete,
          entries: result.supabaseDiff.entries.slice(0, 500).map((e) => ({
            barcode: e.barcode,
            productName: e.productName,
            action: e.action,
            changedFields: e.changedFields,
          })),
        },
      };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  // 전체 WRITE 는 아직 금지 · Phase 3 승인 후 활성화
  ipcMain.handle("erpSync:syncSelected", async (_e, args: { datasets: DatasetKey[]; allowWrite?: boolean }) => {
    void args;
    return { ok: false, dryRun: true, inserted: 0, updated: 0, failed: 0, message: "전체 WRITE 는 Phase 3 사용자 승인 후 활성화" };
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
