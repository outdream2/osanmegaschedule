// apps/sync-agent/src/main/config.ts
// 2026-09-15 · Phase 2 · 로컬 설정 저장 · %APPDATA%/megatown-sync-agent/config.json
//   · 폴더 경로 · 스케줄 · 마지막 실행 상태 · 서버 URL · 이메일
//   · 토큰 · Electron safeStorage 로 암호화 (Windows DPAPI · 네이티브 모듈 X)

import { app, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export type FileKind = "products" | "stock" | "purchase";

export interface LastRun {
  at: string;                              // ISO timestamp
  status: "success" | "failed" | "skipped";
  message?: string;
  fileName?: string;
}

export interface AppConfig {
  server: {
    baseUrl: string;
  };
  auth: {
    email?: string;
    encryptedToken?: string;               // safeStorage encrypted access/refresh token
    employeeId?: number;                   // 로그인 시 저장 · upload API managerId 쿼리용
    role?: string;
    level?: number;
    /** 2026-09-15 · 사용자 요청 · 아이디 저장 · 로그인 form 자동 채움 */
    savedPhone?: string;
    savePhone?: boolean;
  };
  folders: {
    products?: string;
    stock?: string;
    purchase?: string;
  };
  /** cron 표현식 or 프리셋 키 · node-cron 형식 (예 "0 8 * * *" · 매일 08:00) */
  schedules: {
    products?: string;
    stock?: string;
    purchase?: string;
  };
  lastRun: Partial<Record<FileKind, LastRun>>;
  /** 자동 시작 여부 (UI 토글) */
  autoStart: boolean;
  /** 알림 표시 여부 */
  showNotifications: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  server: { baseUrl: "https://osanmega.onrender.com" },
  auth: {},
  folders: {},
  schedules: {},
  lastRun: {},
  autoStart: true,
  showNotifications: true,
};

let cachedConfig: AppConfig | null = null;

function configFilePath(): string {
  return join(app.getPath("userData"), "config.json");
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const path = configFilePath();
    if (!existsSync(path)) {
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    cachedConfig = { ...DEFAULT_CONFIG, ...parsed, auth: { ...DEFAULT_CONFIG.auth, ...(parsed.auth ?? {}) } };
    return cachedConfig;
  } catch (err) {
    console.warn("[config] 로드 실패 · 기본값 사용:", err);
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    const path = configFilePath();
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2), "utf-8");
    cachedConfig = config;
  } catch (err) {
    console.error("[config] 저장 실패:", err);
    throw err;
  }
}

export function patchConfig(patch: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const next: AppConfig = {
    ...current,
    ...patch,
    server: { ...current.server, ...(patch.server ?? {}) },
    auth: { ...current.auth, ...(patch.auth ?? {}) },
    folders: { ...current.folders, ...(patch.folders ?? {}) },
    schedules: { ...current.schedules, ...(patch.schedules ?? {}) },
    lastRun: { ...current.lastRun, ...(patch.lastRun ?? {}) },
  };
  saveConfig(next);
  return next;
}

// ── 토큰 암호화 · safeStorage (Electron 내장 · Windows DPAPI) ──
export function encryptToken(token: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn("[config] safeStorage 사용 불가 · 평문 저장 (개발용)");
      return `plain:${token}`;
    }
    return safeStorage.encryptString(token).toString("base64");
  } catch (err) {
    console.error("[config] 토큰 암호화 실패:", err);
    return null;
  }
}

export function decryptToken(encrypted: string): string | null {
  try {
    if (encrypted.startsWith("plain:")) return encrypted.slice(6);
    if (!safeStorage.isEncryptionAvailable()) return null;
    const buf = Buffer.from(encrypted, "base64");
    return safeStorage.decryptString(buf);
  } catch (err) {
    console.error("[config] 토큰 복호화 실패:", err);
    return null;
  }
}

/** 로그인 상태 · token 존재 여부 */
export function isLoggedIn(): boolean {
  const cfg = loadConfig();
  return !!(cfg.auth.email && cfg.auth.encryptedToken);
}

/** 로그아웃 · 토큰 삭제 */
export function clearAuth(): void {
  patchConfig({ auth: { email: undefined, encryptedToken: undefined } });
}
