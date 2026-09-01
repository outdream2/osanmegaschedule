// 2026-08-24 · #253 · 자동 임포트 · 서버 endpoints (config get/post · heartbeat)
//   · 관리자 lv9 만 · authorize(9) 미들웨어
//   · KV `auto_import_config` (설정) · `auto_import_status` (heartbeat 상태)
//   · Python 스크립트는 매 실행마다 config 조회 · heartbeat 리포트
//   · installer zip 다운로드 endpoint 는 Phase C (PyInstaller 빌드 후)
import { Router } from "express";
import fs from "fs";
import path from "path";
// 2026-08-24 · __dirname · ESM/CJS 양 환경 안전 파생 (2번째 fix)
//   문제: import.meta.url 사용 시 · esbuild --format=cjs 번들에서 void 0 이 되어 크래시
//   해결: import.meta 완전 회피 · globalThis.__dirname (CJS 번들 runtime) 또는 cwd fallback
//   - prod (esbuild → dist/server.cjs): 번들 runtime 이 __dirname 정의됨 (CJS 표준)
//   - dev (tsx ESM): __dirname 미정의 → cwd 기반 · scripts/auto_import 는 project root 아래
function resolveInstallerDir(): string {
  if (process.env.INSTALLER_DIR) return process.env.INSTALLER_DIR;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cjsDir = (globalThis as any).__dirname;
  if (typeof cjsDir === "string" && cjsDir.length > 0) {
    // CJS 번들 · dist/server.cjs · project root = ../
    // → scripts/auto_import
    return path.resolve(cjsDir, "..", "scripts", "auto_import");
  }
  // dev tsx ESM · project root = process.cwd()
  return path.resolve(process.cwd(), "scripts", "auto_import");
}
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
// 2026-08-27 · 사용자 지시 · 자동임포트 후 이력 남기고 관리자 알림
import { notificationsService } from "../../services/notificationsService";
import {
  AutoImportConfigSchema,
  AutoImportHeartbeatSchema,
  DEFAULT_AUTO_IMPORT_CONFIG,
  type AutoImportStatus,
} from "../../../src/shared/schemas/autoImport";

const router = Router();

const CONFIG_KEY = "auto_import_config";
const STATUS_KEY = "auto_import_status";

/**
 * GET /api/auto-import/config · 자동 임포트 설정 조회
 *   · Python (매 실행) · 웹 UI (초기 로드) 공용
 *   · KV 부재 시 · DEFAULT_AUTO_IMPORT_CONFIG 반환 (enabled=false)
 */
router.get("/api/auto-import/config", authorize(9), asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CONFIG_KEY)
    .maybeSingle();
  if (error) throw new HttpError(500, `자동 임포트 설정 조회 실패: ${error.message}`);
  const raw = data?.value ?? DEFAULT_AUTO_IMPORT_CONFIG;
  // Zod 파싱 · KV 손상 시 · DEFAULT fallback
  const parsed = AutoImportConfigSchema.safeParse(raw);
  const value = parsed.success ? parsed.data : DEFAULT_AUTO_IMPORT_CONFIG;
  res.json({ value });
}));

/**
 * POST /api/auto-import/config · 자동 임포트 설정 저장 (관리자 웹 UI 편집)
 *   · 저장 → Python 다음 실행에서 반영 (Task Scheduler interval 도 자동 재등록)
 */
router.post(
  "/api/auto-import/config",
  authorize(9),
  validateBody(AutoImportConfigSchema),
  asyncHandler(async (req, res) => {
    const value = req.body;  // Zod 검증됨
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: CONFIG_KEY, value, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new HttpError(500, `자동 임포트 설정 저장 실패: ${error.message}`);
    res.json({ ok: true, value });
  }),
);

/**
 * POST /api/auto-import/heartbeat · Python 매 실행 후 상태 리포트
 *   · KV `auto_import_status` 갱신 · 웹 UI 상태 표시 (green/amber/red)
 *   · errors 배열 · 최근 실패 · 관리자 참고
 */
router.post(
  "/api/auto-import/heartbeat",
  authorize(9),
  validateBody(AutoImportHeartbeatSchema),
  asyncHandler(async (req, res) => {
    const beat = req.body;
    const status: AutoImportStatus = {
      last_heartbeat_at:  beat.at,
      last_status:        beat.status,
      last_processed:     beat.processed ?? {},
      last_errors:        beat.errors ?? [],
      last_script_version: beat.script_version ?? null,
      last_host:          beat.host ?? null,
      updated_at:         new Date().toISOString(),
    };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: STATUS_KEY, value: status, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new HttpError(500, `자동 임포트 상태 저장 실패: ${error.message}`);
    // 2026-08-27 · 사용자 지시 · 자동임포트 이력 + 관리자 알림
    //   · product_import_log KV에 source="auto" 항목 append (최근 20개 유지 · 수동과 통합)
    //   · notifyAllAdmins · in-app 알림 (관리자 lv9+ 자동 broadcast)
    try {
      const processed = beat.processed ?? {};
      const errors = beat.errors ?? [];
      const totalCount = Object.values(processed).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);
      const isSuccess = beat.status === "success" && errors.length === 0;
      // 이력 append
      const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "product_import_log").maybeSingle();
      const prevLogs: unknown[] = Array.isArray(logData?.value) ? logData.value : [];
      const entry = {
        timestamp: status.updated_at,
        source:    "auto" as const,
        status:    beat.status,
        processed,
        count:     totalCount,
        errors:    errors.slice(0, 5),
        host:      beat.host ?? null,
      };
      const logs = [entry, ...prevLogs].slice(0, 20);
      await supabase.from("app_settings").upsert(
        { key: "product_import_log", value: logs, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
      // 관리자 알림 · 성공/실패 각각
      const summary = Object.entries(processed).map(([k, v]) => `${k} ${v}건`).join(" · ") || "처리 없음";
      if (isSuccess) {
        await notificationsService.notifyAllAdmins({
          title: `자동임포트 완료 · ${totalCount}건`,
          body:  `${summary}${beat.host ? ` · ${beat.host}` : ""}`,
          type:  "success",
        });
      } else if (errors.length > 0) {
        await notificationsService.notifyAllAdmins({
          title: `자동임포트 실패 · ${errors.length}건 오류`,
          body:  `${errors.slice(0, 2).join(" / ")}${beat.host ? ` · ${beat.host}` : ""}`,
          type:  "alert",
        });
      }
    } catch (notifyErr: any) {
      // 알림·이력 실패는 heartbeat 흐름 안 막음
      console.warn("[auto-import heartbeat] notify/log failed:", notifyErr?.message ?? notifyErr);
    }
    // Python 이 사용할 정보 · 다음 config 반영 필요 여부
    res.json({ ok: true, received_at: status.updated_at });
  }),
);

/**
 * GET /api/auto-import/status · 웹 UI · 마지막 heartbeat 상태 조회
 */
router.get("/api/auto-import/status", authorize(9), asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", STATUS_KEY)
    .maybeSingle();
  if (error) throw new HttpError(500, `자동 임포트 상태 조회 실패: ${error.message}`);
  res.json({ value: data?.value ?? null });
}));

/**
 * GET /api/auto-import/installer · 설치 파일 개별 스트림
 *   · 7 파일 · scripts/auto_import/* · 클라이언트가 개별 다운로드
 *   · 파일 목록만 반환 · 클라가 /api/auto-import/installer/file?name= 로 개별 조회
 */
// 2026-08-24 · CJS 안전 경로 resolve (import.meta.url 회피)
const INSTALLER_DIR = resolveInstallerDir();
const INSTALLER_FILES = [
  "auto_import.py",
  "config.ini.example",
  "install.bat",
  "uninstall.bat",
  "run.bat",
  "requirements.txt",
  "README.md",
];

router.get("/api/auto-import/installer", authorize(9), asyncHandler(async (_req, res) => {
  const files = INSTALLER_FILES.map(name => ({
    name,
    size: (() => {
      try { return fs.statSync(path.join(INSTALLER_DIR, name)).size; }
      catch { return 0; }
    })(),
    url: `/api/auto-import/installer/file?name=${encodeURIComponent(name)}`,
  }));
  res.json({ files, dir: "megatown-auto-import", version: "1.0.0" });
}));

router.get("/api/auto-import/installer/file", authorize(9), asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? "");
  if (!INSTALLER_FILES.includes(name)) throw new HttpError(400, "invalid file name");
  const filePath = path.join(INSTALLER_DIR, name);
  if (!fs.existsSync(filePath)) throw new HttpError(404, `file not found: ${name}`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  fs.createReadStream(filePath).pipe(res);
}));

/**
 * 2026-08-24 · #253 · **One-click installer** · 단일 자동 설치 배치 파일
 *   · GET /api/auto-import/one-click-installer
 *   · 사용자 · 클릭 · 다운로드 · 더블클릭 실행 · 모든 것 자동 설치
 *   · 이 배치 파일이 · Python 확인 + 파일 다운로드 + 폴더 생성 + Task Scheduler 등록 + 첫 실행
 *   · 배치 안에 서버 base URL 자동 삽입 (req.protocol + host)
 *   · 다른 배치·py 파일 · 이 배치가 curl 로 다운로드 (필요 시 이 endpoint 만으로 다 처리 가능)
 */
router.get("/api/auto-import/one-click-installer", authorize(9), asyncHandler(async (req, res) => {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost:3000";
  const base = `${proto}://${host}`;
  // 2026-09-01 · Fix · ASCII only (cmd.exe CP949/UTF-8 mojibake regression)
  //   · install.bat 처럼 · 한글 제거 · Windows cmd 인코딩 무관 안전
  const bat = `@echo off
REM ================================================================
REM Megatown Auto Import - One-Click Installer (2026-09-01)
REM   - Double-click this single file to install everything
REM   - If Python missing, opens python.org for install
REM   - Downloads scripts -> creates folders -> registers Task Scheduler -> first run
REM ================================================================
setlocal enabledelayedexpansion

REM 0. Admin check + auto elevate (Task Scheduler needs admin)
net session >nul 2>&1
if errorlevel 1 (
  echo [!] Administrator privileges required. Requesting elevation...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

cls
echo.
echo ==================================================
echo   Megatown Auto Import - One-Click Installer
echo ==================================================
echo.

REM -- [1/6] Python check ---------------------------
echo [1/6] Checking Python...
where python >nul 2>&1
if errorlevel 1 (
  echo   [!] Python not installed. Python 3.10+ required.
  echo   [!] Opening https://www.python.org/downloads/
  echo   [!] Check "Add Python to PATH" when installing.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)
python --version
echo   [OK] Python detected
echo.

REM -- [2/6] Create install folders -----------------
set INSTALL_DIR=%USERPROFILE%\\megatown-auto-import
set DATA_DIR=%USERPROFILE%\\Downloads\\megatown-importdata
echo [2/6] Creating install folders...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
for %%C in (products stock purchase) do (
  if not exist "%DATA_DIR%\\%%C" mkdir "%DATA_DIR%\\%%C"
  if not exist "%DATA_DIR%\\%%C\\_processed" mkdir "%DATA_DIR%\\%%C\\_processed"
  if not exist "%DATA_DIR%\\%%C\\_failed" mkdir "%DATA_DIR%\\%%C\\_failed"
)
echo   [OK] Install folder: %INSTALL_DIR%
echo   [OK] Data folder:    %DATA_DIR% (products, stock, purchase)
echo.

REM -- [3/6] Download scripts -----------------------
echo [3/6] Downloading auto-import scripts...
set BASE_URL=${base}
powershell -Command "try { Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=auto_import.py' -OutFile '%INSTALL_DIR%\\auto_import.py' -UseBasicParsing } catch { exit 1 }"
if errorlevel 1 (
  echo   [!] Download failed. Check server URL: %BASE_URL%
  pause
  exit /b 1
)
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=requirements.txt' -OutFile '%INSTALL_DIR%\\requirements.txt' -UseBasicParsing"
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=run.bat' -OutFile '%INSTALL_DIR%\\run.bat' -UseBasicParsing"
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=uninstall.bat' -OutFile '%INSTALL_DIR%\\uninstall.bat' -UseBasicParsing"
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=config.ini.example' -OutFile '%INSTALL_DIR%\\config.ini' -UseBasicParsing"
echo   [OK] Scripts downloaded
echo.

REM -- [4/6] Install Python packages ----------------
echo [4/6] Installing Python packages (requests, openpyxl, ...)
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r "%INSTALL_DIR%\\requirements.txt"
echo   [OK] Packages installed
echo.

REM -- [5/6] Register Windows Task Scheduler --------
echo [5/6] Registering Windows Task Scheduler (10 min interval)
schtasks /Query /TN "MegatownAutoImport" >nul 2>&1
if %errorlevel% equ 0 (
  echo   [i] Existing task found. Re-registering...
  schtasks /Delete /TN "MegatownAutoImport" /F >nul 2>&1
)
schtasks /Create /SC MINUTE /MO 10 /TN "MegatownAutoImport" /TR "\"%INSTALL_DIR%\\run.bat\"" /RL HIGHEST /F >nul
if errorlevel 1 (
  echo   [X] Task Scheduler registration failed. Run as Administrator.
  pause
  exit /b 1
)
echo   [OK] Task Scheduler: MegatownAutoImport - every 10 min
echo.

REM -- [6/6] Save server base URL -------------------
echo [6/6] Saving server URL...
echo BASE_URL=%BASE_URL% > "%INSTALL_DIR%\\.env"
echo   [OK] BASE_URL: %BASE_URL%
echo.

echo ==================================================
echo   Install complete
echo ==================================================
echo.
echo   Install path: %INSTALL_DIR%
echo   Data path:    %DATA_DIR%
echo.
echo   Drop xlsx files into these folders (auto imported every 10 min):
echo     %DATA_DIR%\\products   (product list)
echo     %DATA_DIR%\\stock      (stock)
echo     %DATA_DIR%\\purchase   (purchase)
echo.
echo   Manual run: %INSTALL_DIR%\\run.bat
echo   Uninstall:  %INSTALL_DIR%\\uninstall.bat
echo.
echo   Check status / change settings in the web admin page.
echo.
pause
endlocal
`;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="megatown-auto-import-installer.bat"`);
  res.send(bat);
}));

export default router;

// 최소 export · badRequest silence linter (미사용 warn 제거용 · 향후 확장 대비)
export const _autoImportBadRequest = badRequest;
