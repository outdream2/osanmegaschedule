// 2026-08-24 · #253 · 자동 임포트 · 서버 endpoints (config get/post · heartbeat)
//   · 관리자 lv9 만 · authorize(9) 미들웨어
//   · KV `auto_import_config` (설정) · `auto_import_status` (heartbeat 상태)
//   · Python 스크립트는 매 실행마다 config 조회 · heartbeat 리포트
//   · installer zip 다운로드 endpoint 는 Phase C (PyInstaller 빌드 후)
import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// 2026-08-24 · ESM 환경 · __dirname 미정의 fix · import.meta.url → 파일 경로 파생
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
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
// __dirname resolve · scripts 폴더 (프로젝트 루트 기준)
// tsx 실행 시 · 이 파일은 server/routes/settings/autoImport.ts · scripts/ 는 3 depth 위
const INSTALLER_DIR = path.resolve(__dirname, "../../../scripts/auto_import");
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
  const bat = `@echo off
REM ═══════════════════════════════════════════════════════════════
REM 메가타운 자동 임포트 · 원클릭 설치 (2026-08-24)
REM   · 이 파일 하나만 더블클릭 하면 · 모든 것 자동 설치
REM   · Python 미설치 시 · Python 설치 안내 + 자동 다운로드
REM   · 스크립트 다운로드 → 폴더 생성 → Task Scheduler 등록 → 첫 실행
REM ═══════════════════════════════════════════════════════════════
setlocal enabledelayedexpansion
chcp 65001 >nul
cls
echo.
echo ═══════════════════════════════════════════════════
echo   메가타운 자동 임포트 · 원클릭 설치 시작
echo ═══════════════════════════════════════════════════
echo.

REM ── [1/6] Python 확인 ─────────────────────────────
echo [1/6] Python 확인 중...
where python >nul 2>&1
if errorlevel 1 (
  echo   [!] Python 미설치 · Python 3.10+ 필요
  echo   [!] https://www.python.org/downloads/ 방문 · 설치 후 재실행
  echo   [!] 설치 시 · "Add Python to PATH" 체크 필수
  start https://www.python.org/downloads/
  pause
  exit /b 1
)
python --version
echo   [OK] Python 확인 완료
echo.

REM ── [2/6] 설치 폴더 생성 ──────────────────────────
set INSTALL_DIR=%USERPROFILE%\\megatown-auto-import
set DATA_DIR=%USERPROFILE%\\Downloads\\megatown-importdata
echo [2/6] 설치 폴더 생성...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
for %%C in (products stock purchase) do (
  if not exist "%DATA_DIR%\\%%C" mkdir "%DATA_DIR%\\%%C"
  if not exist "%DATA_DIR%\\%%C\\_processed" mkdir "%DATA_DIR%\\%%C\\_processed"
  if not exist "%DATA_DIR%\\%%C\\_failed" mkdir "%DATA_DIR%\\%%C\\_failed"
)
echo   [OK] 설치 폴더 · %INSTALL_DIR%
echo   [OK] 데이터 폴더 · %DATA_DIR% (products·stock·purchase)
echo.

REM ── [3/6] 스크립트 다운로드 ───────────────────────
echo [3/6] 자동 임포트 스크립트 다운로드...
set BASE_URL=${base}
powershell -Command "try { Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=auto_import.py' -OutFile '%INSTALL_DIR%\\auto_import.py' -UseBasicParsing } catch { exit 1 }"
if errorlevel 1 (
  echo   [!] 다운로드 실패 · 서버 연결 확인 · %BASE_URL%
  pause
  exit /b 1
)
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=requirements.txt' -OutFile '%INSTALL_DIR%\\requirements.txt' -UseBasicParsing"
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=run.bat' -OutFile '%INSTALL_DIR%\\run.bat' -UseBasicParsing"
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=uninstall.bat' -OutFile '%INSTALL_DIR%\\uninstall.bat' -UseBasicParsing"
powershell -Command "Invoke-WebRequest -Uri '${base}/api/auto-import/installer/file?name=config.ini.example' -OutFile '%INSTALL_DIR%\\config.ini' -UseBasicParsing"
echo   [OK] 스크립트·문서 다운로드 완료
echo.

REM ── [4/6] Python 패키지 설치 ─────────────────────
echo [4/6] 필요 패키지 설치 (requests · openpyxl 등)...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r "%INSTALL_DIR%\\requirements.txt"
echo   [OK] 패키지 설치 완료
echo.

REM ── [5/6] Task Scheduler 등록 ────────────────────
echo [5/6] Windows 작업 스케줄러 등록 (10분마다 자동 실행)...
schtasks /Query /TN "MegatownAutoImport" >nul 2>&1
if %errorlevel% equ 0 (
  echo   [i] 기존 작업 · 재등록
  schtasks /Delete /TN "MegatownAutoImport" /F >nul 2>&1
)
schtasks /Create /SC MINUTE /MO 10 /TN "MegatownAutoImport" /TR "\"%INSTALL_DIR%\\run.bat\"" /F >nul
echo   [OK] Task Scheduler · MegatownAutoImport · 10분 간격
echo.

REM ── [6/6] 서버 base URL 기록 ─────────────────────
echo [6/6] 서버 URL 설정...
echo BASE_URL=%BASE_URL% > "%INSTALL_DIR%\\.env"
echo   [OK] BASE_URL · %BASE_URL%
echo.

echo ═══════════════════════════════════════════════════
echo   ✓ 설치 완료
echo ═══════════════════════════════════════════════════
echo.
echo   설치 경로 · %INSTALL_DIR%
echo   데이터 경로 · %DATA_DIR%
echo.
echo   xlsx 파일을 아래 폴더에 넣으면 10분마다 자동 임포트:
echo     %DATA_DIR%\\products   (상품)
echo     %DATA_DIR%\\stock      (재고)
echo     %DATA_DIR%\\purchase   (매입)
echo.
echo   수동 실행 · %INSTALL_DIR%\\run.bat
echo   제거 · %INSTALL_DIR%\\uninstall.bat
echo.
echo   웹 관리자 페이지에서 상태 확인 · 설정 변경 가능
echo.
pause
`;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="megatown-auto-import-installer.bat"`);
  res.send(bat);
}));

export default router;

// 최소 export · badRequest silence linter (미사용 warn 제거용 · 향후 확장 대비)
export const _autoImportBadRequest = badRequest;
