// apps/sync-agent/src/main/index.ts
// 2026-09-15 · #253 Phase B · Electron 메인 프로세스 · 트레이 상주 · 부팅 자동 시작
//   · 웹 서버 (Render) API 호출 방식 (Option C)
//   · 파일별 스케줄 · node-cron
//   · 로그인 세션 · keytar (Windows Credential Manager)

import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } from "electron";
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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

const AGENT_NAME = "메가타운 자동임포트";

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

// ── 메인 창 (트레이 클릭 시 열림) ─────────────────
function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

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

  mainWindow.on("ready-to-show", () => {
    console.log("[main] ready-to-show · focus/moveTop");
    mainWindow?.focus();
    mainWindow?.moveTop();
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

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    // 2026-09-15 · dev 모드 · DevTools 자동 열기 제거 (사용자 요청)
    //   · 필요 시 · F12 or Ctrl+Shift+I · 수동 open
    //   · optimizer.watchWindowShortcuts · 이미 등록되어 있음
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // 로딩 실패 진단
  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error("[main] Renderer 로딩 실패:", { errorCode, errorDescription, validatedURL });
  });
}

// ── 시스템 트레이 (하이브리드 · D안) · trayIcon.ts + notifications.ts 로 상태 관리 ──
function createTray() {
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

// ── IPC · Renderer 통신 ─────────────────────────
ipcMain.handle("app-info", () => ({
  version: app.getVersion(),
  name: AGENT_NAME,
}));

// ── 앱 시작 ────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.megatown.sync-agent");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Phase 2 · IPC handlers 등록
  registerIpcHandlers();

  createTray();
  ensureAutoLaunch();
  setupAutoUpdater();

  // Phase 2 · 저장된 스케줄 복구 · cron job 등록
  rescheduleAll();

  // 개발 모드 · 창 자동 open · 배포 · 트레이만
  if (is.dev) {
    createMainWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  stopAllJobs();
});

// Windows · 트레이 종료 후에도 · 앱 유지 (기본 window-all-closed 시 종료 방지)
app.on("window-all-closed", () => {
  // Do nothing · 트레이 상주
});
