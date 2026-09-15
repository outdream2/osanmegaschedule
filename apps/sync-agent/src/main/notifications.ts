// apps/sync-agent/src/main/notifications.ts
// 2026-09-15 · Phase 3 · Windows toast 알림 · 트레이 상태 색상
//   · Notification API · Windows 10/11 native toast
//   · 트레이 아이콘 · 3-state (idle/syncing/error) · 색상 변경

import { Notification, Tray, nativeImage, dialog, BrowserWindow } from "electron";
import { loadConfig } from "./config";
import { generateTrayIcon } from "./trayIcon";

let trayRef: Tray | null = null;

export function registerTray(tray: Tray) {
  trayRef = tray;
}

export type TrayState = "idle" | "syncing" | "error" | "success";

const STATE_COLOR: Record<TrayState, { r: number; g: number; b: number }> = {
  idle:    { r: 10,  g: 46,  b: 74  },   // brand-deep · 기본
  syncing: { r: 14,  g: 165, b: 233 },   // sky-500 · 진행중
  success: { r: 16,  g: 185, b: 129 },   // emerald-500 · 성공
  error:   { r: 244, g: 63,  b: 94  },   // rose-500 · 실패
};

let currentState: TrayState = "idle";

/** 트레이 아이콘 상태 변경 · 색상 · tooltip */
export function setTrayState(state: TrayState, message?: string) {
  if (!trayRef) return;
  currentState = state;
  try {
    const color = STATE_COLOR[state];
    const buf = generateTrayIcon(color);
    let img = nativeImage.createFromBuffer(buf);
    img = img.resize({ width: 16, height: 16 });
    trayRef.setImage(img);
    trayRef.setToolTip(`메가타운 자동임포트${message ? ` · ${message}` : ""}`);
  } catch (err) {
    console.warn("[notifications] setTrayState 실패:", err);
  }
}

export function getTrayState(): TrayState {
  return currentState;
}

/** Windows toast 알림 · 성공·실패·정보 */
export function notify(title: string, body: string, urgency: "info" | "success" | "error" = "info") {
  const cfg = loadConfig();
  if (!cfg.showNotifications) return;
  if (!Notification.isSupported()) {
    console.log(`[notify] not supported · ${title} · ${body}`);
    return;
  }
  try {
    const n = new Notification({
      title,
      body,
      silent: urgency === "info", // 성공·에러는 소리 · info 무음
      urgency: urgency === "error" ? "critical" : urgency === "success" ? "normal" : "low",
      timeoutType: "default",
    });
    n.show();
  } catch (err) {
    console.warn("[notify] 실패:", err);
  }
}

/** 에러 대화상자 · 사용자에게 · 실패 상세 표시 (blocking) */
export function showErrorDialog(title: string, message: string, detail?: string) {
  const focused = BrowserWindow.getFocusedWindow();
  try {
    dialog.showMessageBox(focused ?? undefined!, {
      type: "error",
      title,
      message,
      detail,
      buttons: ["확인"],
      defaultId: 0,
      noLink: true,
    });
  } catch (err) {
    console.warn("[notifications] showErrorDialog 실패:", err);
  }
}

/** 임포트 결과 · 자동 토스트 + 트레이 상태 */
export function notifyImportResult(kind: string, result: { ok: boolean; message: string; filesProcessed: number; filesFailed: number; errors?: string[] }) {
  const label = kind === "products" ? "상품정보" : kind === "stock" ? "재고정보" : kind === "purchase" ? "매입정보" : kind;

  if (result.ok && result.filesProcessed > 0) {
    setTrayState("success", `${label} · 완료`);
    notify(`✓ ${label} 임포트 완료`, result.message, "success");
    // 3초 후 · idle 로 복귀
    setTimeout(() => setTrayState("idle"), 3000);
  } else if (result.filesFailed > 0) {
    setTrayState("error", `${label} · 실패`);
    notify(`✕ ${label} 임포트 실패`, result.message, "error");
    // 실패는 · 30초 후 idle
    setTimeout(() => setTrayState("idle"), 30_000);
  } else {
    // 파일 없음 · 알림 X · 상태만
    setTrayState("idle");
  }
}
