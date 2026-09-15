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
    show: false, // 초기 · 숨김 · 트레이 클릭 시 · 표시
    autoHideMenuBar: true,
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: AGENT_NAME,
  });

  mainWindow.on("ready-to-show", () => {
    // 2026-09-15 · dev 모드 · 첫 실행 · 창 자동 open (확인 편의)
    // 배포 모드 · 트레이 자동 시작 · 창 숨김 유지 · 아이콘 클릭 시 표시
    if (is.dev) {
      mainWindow?.show();
      mainWindow?.focus();
    }
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
    // dev 모드 · DevTools 자동 열기 · 콘솔 오류 확인
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // 로딩 실패 진단
  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error("[main] Renderer 로딩 실패:", { errorCode, errorDescription, validatedURL });
  });
}

// ── 인라인 트레이 아이콘 (16x16 · brand-deep 색 · fallback · 파일 X 대비) ──
// 파란 원 · 흰 화살표 (다운로드 심볼)
const TRAY_ICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA" +
  "PklEQVQ4T2NkYGD4z0AEYBxVSDAgo+aTF04MQwGjChkYGP4T" +
  "EwqjChkYGP4TEwqjChkYGP4TEwqjChkYGGjIAgBAyAsFOFVj" +
  "cQAAAABJRU5ErkJggg==";

// ── 시스템 트레이 (하이브리드 · D안) ────────────────
function createTray() {
  // 1. 리소스 파일 시도 (배포 시 · resources/tray-idle.png 있을 때)
  const iconPath = join(__dirname, "../../resources/tray-idle.png");
  let trayImage = nativeImage.createFromPath(iconPath);

  // 2. 없으면 · 인라인 base64 PNG · 개발용 fallback
  if (trayImage.isEmpty()) {
    console.log("[tray] resources/tray-idle.png 없음 · 인라인 fallback 사용");
    trayImage = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG_BASE64}`);
  }

  // 3. Windows · 16x16 리사이즈 (시스템 트레이 표준)
  if (!trayImage.isEmpty()) {
    trayImage = trayImage.resize({ width: 16, height: 16 });
  }

  tray = new Tray(trayImage);
  tray.setToolTip(AGENT_NAME);
  console.log("[tray] 생성 완료 · isEmpty:", trayImage.isEmpty());

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

// ── 스케줄러 · 임포트 실행 (Phase 2 에서 구현) ────
function runNowAllTasks() {
  console.log("[scheduler] runNowAllTasks · 아직 미구현");
  // TODO Phase 2 · 3 파일 · 즉시 실행
}

// ── IPC · Renderer 통신 (Phase 2 에서 확장) ──────
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

  createTray();
  ensureAutoLaunch();
  setupAutoUpdater();

  // 개발 모드 · 창 자동 open · 배포 · 트레이만
  if (is.dev) {
    createMainWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("before-quit", () => { quitting = true; });

// Windows · 트레이 종료 후에도 · 앱 유지 (기본 window-all-closed 시 종료 방지)
app.on("window-all-closed", () => {
  // Do nothing · 트레이 상주
});
