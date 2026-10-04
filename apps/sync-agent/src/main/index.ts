// apps/sync-agent/src/main/index.ts
// 2026-09-15 · #253 Phase B · Electron 메인 프로세스 · 트레이 상주 · 부팅 자동 시작
//   · 웹 서버 (Render) API 호출 방식 (Option C)
//   · 파일별 스케줄 · node-cron
//   · 로그인 세션 · keytar (Windows Credential Manager)

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, screen, session } from "electron";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { join } from "path";
import AutoLaunch from "auto-launch";
// electron-updater · CommonJS · default import 후 destructure (ESM 호환)
import electronUpdaterPkg from "electron-updater";
const { autoUpdater } = electronUpdaterPkg;
// 2026-09-15 · Phase 2 · Config · Auth · Scheduler · IPC
import { registerIpcHandlers } from "./ipc";
import { rescheduleAll, runNowAll, stopAllJobs } from "./scheduler";
// Phase 3 · 알림 · 트레이 상태
import { registerTray, setTrayState } from "./notifications";
import { generateTrayIcon } from "./trayIcon";
// Phase 3 · 파일 감시 · chokidar
import { rescanWatchers, stopAllWatchers } from "./watcher";
import { loadConfig } from "./config";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const AGENT_NAME = "메가타운 자동임포트";

// 2026-10-03 · White Screen 원인 · DevTools Console · net::ERR_CACHE_READ_FAILURE
//   · Chromium HTTP 디스크 캐시 (userData/Cache) 손상 · 리소스 읽기 실패 · 하얀 화면
//   · dev 모드 · 디스크 캐시 전면 비활성화 (Vite HMR · 캐시 불필요)
//   · 반드시 app.whenReady() 이전 · appendSwitch
if (!app.isPackaged) {
  app.commandLine.appendSwitch("disable-http-cache");
  console.log("[main] dev · --disable-http-cache 적용 (ERR_CACHE_READ_FAILURE 방지)");
}

// 2026-09-18 · 사용자 보고 · 트레이 아이콘 2개 · 원인 · 이중 실행 (auto-launch + installer)
//   · 두 번째 인스턴스 방지 · 첫 번째 인스턴스 · focus/window open
//   · Windows · 특히 · autoLaunch + installer 직후 launch 동시 · 2 아이콘
// 2026-10-03 · 사용자 지시 · 중복 실행 강력 방지
//   · appUserModelId 를 lock 요청 전에 설정 (Windows 가 같은 앱으로 식별 · lock 공간 통일)
//   · app.quit() 는 비동기 → tray 생성 사이 race 가능 → app.exit(0) 즉시 종료로 변경
app.setAppUserModelId("com.megatown.sync-agent");
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  console.log("[main] 두 번째 인스턴스 감지 · 즉시 종료 (singleInstance)");
  app.exit(0); // quit() 비동기 · exit() 즉시 (tray 생성 전 종료 보장)
} else {
  app.on("second-instance", () => {
    console.log("[main] second-instance 이벤트 · 기존 창 focus");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
    } else {
      createMainWindow();
    }
  });
}

// ── 부팅 자동 시작 ────────────────────────────────
const autoLauncher = new AutoLaunch({
  name: AGENT_NAME,
  isHidden: true, // 창 없이 · 트레이만
});

async function ensureAutoLaunch() {
  try {
    const enabled = await autoLauncher.isEnabled();
    if (!enabled) await autoLauncher.enable();
  } catch (err) {
    console.warn("[main] auto-launch 설정 실패:", err);
  }
}

// 2026-10-03 · Tray/Window 재표시 신뢰성 강화 · off-screen · minimized · hidden 모두 복구
function ensureOnScreen(win: BrowserWindow) {
  try {
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const wa = display?.workArea;
    if (!wa) { win.center(); return; }
    const outOfScreen =
      bounds.x + bounds.width  < wa.x + 40 ||
      bounds.x > wa.x + wa.width  - 40 ||
      bounds.y + bounds.height < wa.y + 40 ||
      bounds.y > wa.y + wa.height - 40;
    if (outOfScreen) {
      console.log("[main] 창 좌표 off-screen 감지 · center 복구:", bounds, "workArea:", wa);
      win.center();
    }
  } catch (err) {
    console.warn("[main] ensureOnScreen 실패 · center 로 fallback:", (err as Error)?.message);
    try { win.center(); } catch {}
  }
}

// ── 메인 창 (트레이 클릭 시 열림) ─────────────────
function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    ensureOnScreen(mainWindow);
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    console.log("[main] 기존 창 재표시 · visible:", mainWindow.isVisible(), "minimized:", mainWindow.isMinimized(), "bounds:", mainWindow.getBounds());
    return;
  }
  // destroyed 상태였거나 null 이면 · 새 창 생성
  mainWindow = null;

  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 720,
    minHeight: 540,
    show: true, // 2026-09-15 · 즉시 표시 · ready-to-show 의존성 제거 (사용자 UI 안 보임 문제)
    center: true,
    autoHideMenuBar: true,
    backgroundColor: "#F4F7FA",
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: AGENT_NAME,
  });

  console.log("[main] BrowserWindow 생성 · size:", mainWindow.getSize(), "position:", mainWindow.getPosition());
  // 2026-10-03 · White Screen 진단 · dev 환경 변수 상태 로그
  console.log("[main] is.dev:", is.dev, "· ELECTRON_RENDERER_URL:", process.env["ELECTRON_RENDERER_URL"] ?? "(unset)", "· isPackaged:", app.isPackaged);
  // 2026-10-03 · 사용자 지시 · DevTools 자동 open 제거
  //   · 필요 시 수동 open: Ctrl+Shift+I 또는 메뉴 토글

  mainWindow.on("ready-to-show", () => {
    console.log("[main] ready-to-show · focus/moveTop");
    mainWindow?.focus();
    mainWindow?.moveTop();
  });

  // 2026-10-03 · White Screen 진단 · 로딩 단계별 로그
  mainWindow.webContents.on("did-start-loading", () => {
    console.log("[main] did-start-loading · URL 요청 시작");
  });
  mainWindow.webContents.on("dom-ready", () => {
    console.log("[main] dom-ready · DOM 파싱 완료 · URL:", mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error("[main] preload-error · preload 로드 실패:", preloadPath, error?.message ?? String(error));
  });
  mainWindow.webContents.on("unresponsive", () => {
    console.warn("[main] webContents unresponsive · renderer 응답 없음");
  });

  mainWindow.on("close", (e) => {
    // X 클릭 · 종료 안 함 · 트레이 최소화만
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // 2026-09-18 · 사용자 보고 · 배포 · 하얀 화면 · loadFile 경로 상세 로그
  // 2026-10-03 · White Screen 진단 · dev/packaged 분기 명시 로그 + loadURL promise reject 캡쳐
  // 2026-10-03 · WHITE SCREEN 영구 방어 · Vite dev server 늦게 뜨는 경우 자동 재시도 (max 15회 · 500ms)
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    const url = process.env["ELECTRON_RENDERER_URL"];
    console.log("[main] >>> dev 분기 · loadURL:", url);
    const tryLoad = async (attempt: number): Promise<void> => {
      try {
        await mainWindow!.loadURL(url);
        console.log("[main] loadURL resolved · attempt", attempt, "· 현재 URL:", mainWindow?.webContents.getURL());
      } catch (err: any) {
        const code = err?.code || "";
        const retriable = code === "ERR_CONNECTION_REFUSED" || code === "ERR_FAILED" || code === "ERR_EMPTY_RESPONSE";
        console.warn("[main] loadURL attempt", attempt, "rejected ·", code, err?.message);
        if (retriable && attempt < 15 && !mainWindow?.isDestroyed()) {
          setTimeout(() => void tryLoad(attempt + 1), 500);
        } else {
          console.error("[main] loadURL · 재시도 포기 · attempt", attempt);
          mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
            <html><body style="font-family:sans-serif;padding:40px;color:#475569;background:#F4F7FA">
              <h2 style="color:#dc2626;margin:0 0 12px">⚠ 개발 서버 연결 실패</h2>
              <p>Vite dev server (${url}) 가 응답하지 않습니다.</p>
              <p style="margin:8px 0">코드 변경 없이 npm run dev 를 재시작하거나 · dev server 가 뜨길 기다렸다가 새로고침해 주세요.</p>
              <button onclick="location.reload()" style="padding:8px 16px;background:#0A2E4A;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">새로고침</button>
            </body></html>
          `)}`);
        }
      }
    };
    void tryLoad(1);
  } else {
    const htmlPath = join(__dirname, "../renderer/index.html");
    console.log("[main] >>> production 분기 · loadFile:", htmlPath, "· __dirname:", __dirname, "· is.dev:", is.dev, "· ELECTRON_RENDERER_URL set:", !!process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.loadFile(htmlPath).catch((err) => {
      console.error("[main] loadFile 실패:", err);
      // fallback · 데이터 URL · 최소 안내 페이지 (하얀 화면 방지)
      mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <html><body style="font-family:sans-serif;padding:40px;color:#475569">
          <h2 style="color:#dc2626">⚠ 렌더러 로드 실패</h2>
          <p>파일: ${htmlPath}</p>
          <p>오류: ${err?.message ?? String(err)}</p>
          <p style="margin-top:20px;color:#64748b">앱을 재설치하거나 · 관리자에게 문의하세요.</p>
        </body></html>
      `)}`);
    });
  }

  // 2026-09-18 · 상세 진단 · 하얀 화면 원인 파악
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("[main] Renderer did-finish-load · URL:", mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  // 2026-09-21 · E-004 · did-fail-load · 하위 리소스 (JS/CSS) 실패 시 · 데이터 URL fallback
  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error("[main] Renderer 로딩 실패:", { errorCode, errorDescription, validatedURL, isMainFrame });
    // 메인 프레임 실패만 fallback (sub-resource 실패는 스킵 · 무한 루프 방지)
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED · loadURL 재호출 등 정상 상황
    mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html><body style="font-family:sans-serif;padding:40px;color:#475569;background:#F4F7FA">
        <h2 style="color:#dc2626;margin:0 0 12px">⚠ 렌더러 로딩 실패</h2>
        <p style="margin:8px 0">URL: <code>${validatedURL}</code></p>
        <p style="margin:8px 0">Error: <code>${errorCode} · ${errorDescription}</code></p>
        <p style="margin:20px 0 8px;color:#64748b">앱을 재설치하거나 · 관리자에게 문의하세요.</p>
        <button onclick="location.reload()" style="padding:8px 16px;background:#0A2E4A;color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">새로고침</button>
      </body></html>
    `)}`);
  });
  // 2026-09-21 · E-004 · Renderer 프로세스 크래시 감지
  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    console.error("[main] Renderer 프로세스 크래시:", details);
  });
}

// ── 시스템 트레이 (하이브리드 · D안) · trayIcon.ts + notifications.ts 로 상태 관리 ──
function createTray() {
  // 2026-10-04 · 사용자 지시 · tray 중복 방지
  //   · 기존 tray 가 있으면 반드시 destroy (dev-mode tsx watch 재시작 시 2개 생성 방지)
  if (tray) {
    try { tray.destroy(); } catch { /* ignore */ }
    tray = null;
  }
  // 1. 리소스 파일 시도 (배포 시 · resources/tray-idle.png 있을 때)
  const iconPath = join(__dirname, "../../resources/tray-idle.png");
  let trayImage = nativeImage.createFromPath(iconPath);

  // 2. 없으면 · trayIcon.ts · 코드 생성 PNG · brand-deep 기본
  if (trayImage.isEmpty()) {
    console.log("[tray] resources/tray-idle.png 없음 · 코드 생성 아이콘 사용");
    trayImage = nativeImage.createFromBuffer(generateTrayIcon({ r: 10, g: 46, b: 74 }));
  }

  // Windows · 트레이 표준 · 16x16 (자동 스케일)
  trayImage = trayImage.resize({ width: 16, height: 16 });
  console.log("[tray] 이미지 · isEmpty:", trayImage.isEmpty(), "size:", trayImage.getSize());

  tray = new Tray(trayImage);
  tray.setToolTip(AGENT_NAME);
  // Phase 3 · 알림 · 트레이 참조 등록 · setTrayState 사용
  registerTray(tray);
  setTrayState("idle");

  const contextMenu = Menu.buildFromTemplate([
    { label: "열기", click: () => createMainWindow() },
    { label: "지금 실행", click: () => runNowAllTasks() },
    { type: "separator" },
    { label: "설정", click: () => {
      createMainWindow();
      mainWindow?.webContents.send("navigate", "settings");
    }},
    { label: "로그", click: () => {
      createMainWindow();
      mainWindow?.webContents.send("navigate", "logs");
    }},
    { type: "separator" },
    { label: "업데이트 확인", click: () => checkForUpdatesManual() },
    { type: "separator" },
    { label: "종료", click: () => {
      quitting = true;
      app.quit();
    }},
  ]);

  tray.setContextMenu(contextMenu);

  // 좌클릭 · 미니 팝오버 (추후 · 별도 창으로 확장)
  // 현재는 · 좌클릭 · 메인 창 open
  tray.on("click", () => createMainWindow());

  // 더블클릭 · 메인 창 open (하이브리드 D안)
  tray.on("double-click", () => createMainWindow());
}

// ── 자동 업데이트 (electron-updater) ─────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] 신규 버전 감지:", info.version);
    mainWindow?.webContents.send("update-status", { type: "available", version: info.version });
  });

  autoUpdater.on("update-downloaded", () => {
    console.log("[updater] 다운로드 완료 · 다음 시작 시 적용");
    mainWindow?.webContents.send("update-status", { type: "downloaded" });
  });

  autoUpdater.on("error", (err) => {
    console.warn("[updater] 오류:", err.message);
  });

  // 첫 실행 · 5초 후 · 이후 매 1시간 · 자동 확인
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 60 * 60 * 1000);
}

function checkForUpdatesManual() {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.warn("[updater] 수동 확인 실패:", err.message);
  });
}

// ── 스케줄러 · 즉시 실행 (트레이 메뉴) ──────────
async function runNowAllTasks() {
  console.log("[main] runNowAllTasks · 3 파일 즉시 실행");
  const results = await runNowAll();
  for (const r of results) {
    console.log(`[main] ${r.kind} · ${r.message}`);
  }
}

// ── 임포트 모드 적용 · 파일 감시 vs 스케줄 (상호배제) ──
export function applyImportMode() {
  const cfg = loadConfig();
  // 기존 모두 정지 · 재등록
  stopAllJobs();
  stopAllWatchers();

  if (cfg.useFileWatcher) {
    console.log("[main] 임포트 모드 · 파일 감시 (chokidar)");
    rescanWatchers();
  } else {
    console.log("[main] 임포트 모드 · 스케줄 (cron)");
    rescheduleAll();
  }
}

// ── IPC · Renderer 통신 ─────────────────────────
ipcMain.handle("app-info", () => ({
  version: app.getVersion(),
  name: AGENT_NAME,
}));

// ── 앱 시작 ────────────────────────────────────────
app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.megatown.sync-agent");

  // 2026-10-03 · White Screen fix · 손상된 HTTP 캐시 · 1 회 clear (ERR_CACHE_READ_FAILURE 복구)
  try {
    await session.defaultSession.clearCache();
    console.log("[main] HTTP 캐시 clearCache 완료");
  } catch (err) {
    console.warn("[main] clearCache 실패:", (err as Error)?.message);
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Phase 2 · IPC handlers 등록
  registerIpcHandlers();

  createTray();
  ensureAutoLaunch();
  setupAutoUpdater();

  // Phase 3 · 파일 감시 모드 · or · 스케줄 모드 · 상호배제
  applyImportMode();

  // 2026-10-03 · 사용자 요청 · 최초 실행 시 Main Window 자동 open (dev / packaged 모두)
  //   · 기존 · 배포 모드 · 트레이만 · 사용자 UI 접근 불가 보고
  //   · X 로 닫으면 트레이 상주 유지 (close event · hide) · 종료는 트레이 메뉴 명시만
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  stopAllJobs();
  stopAllWatchers();
  // 2026-10-04 · tray 명시 destroy · OS 가 늦게 지워 중복 아이콘 보이는 문제 방지
  if (tray) {
    try { tray.destroy(); } catch { /* ignore */ }
    tray = null;
  }
});

// Windows · 트레이 종료 후에도 · 앱 유지 (기본 window-all-closed 시 종료 방지)
app.on("window-all-closed", () => {
  // Do nothing · 트레이 상주
});
