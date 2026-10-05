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
  /** 파일 감시 모드 · true = chokidar · 새 파일 시 10분 후 자동 임포트 · 스케줄 비활성
   *   · false = cron 스케줄 (schedules 필드 사용) */
  useFileWatcher: boolean;
  /** 2026-10-03 · Iregen ERP 연동 설정 · CorpDB_nm 은 safeStorage 로 암호화 저장 */
  iregen?: {
    enabled: boolean;
    endpoint: string;
    soapAction: string;
    encryptedCorpDbNm?: string;
  };
  /** 2026-10-05 · Dataset 별 독립 자동 Scheduler 설정 (local only · Supabase 저장 안 함) */
  erpAutoScheduler?: {
    datasets: {
      PRODUCT:   DatasetSchedule;
      BUY:       DatasetSchedule;
      INVENTORY: DatasetSchedule;
      SALE:      DatasetSchedule;
      VENDOR:    DatasetSchedule;
    };
  };
}

export type ScheduleInterval = "30min" | "1h" | "2h" | "4h" | "6h" | "12h" | "daily" | "weekly";
export interface DatasetSchedule {
  enabled: boolean;
  interval: ScheduleInterval;
  time: string;              // "HH:MM" (daily/weekly + interval 기준시간)
  weekday: number;           // 0=일 ~ 6=토 (weekly 전용)
  lastRunAt?: string;        // ISO
  lastRunResult?: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  nextRunAt?: string;        // ISO (scheduler 계산)
}

export const DEFAULT_IREGEN_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcInventoryBiz.asmx";
export const DEFAULT_IREGEN_SOAP_ACTION = "http://tempuri.org/Inventory_Status";

const DEFAULT_CONFIG: AppConfig = {
  server: { baseUrl: "https://osanmega.onrender.com" },
  auth: {},
  folders: {},
  schedules: {},
  lastRun: {},
  autoStart: true,
  showNotifications: true,
  useFileWatcher: true, // 기본 · 파일 감시 모드 (사용자 요청)
  // 2026-10-03 · 사용자 지시 · ERP 연동 체크 기본값 ON
  //   · 초기 설치 또는 config.json 에 iregen 섹션 없는 상태에서 자동 활성
  //   · CorpDB_nm 미설정 시 쿼리하면 config 단계에서 안전하게 차단됨
  iregen: {
    enabled: true,
    endpoint: DEFAULT_IREGEN_ENDPOINT,
    soapAction: DEFAULT_IREGEN_SOAP_ACTION,
  },
  // 2026-10-05 · Dataset 별 독립 자동 scheduler 기본값
  erpAutoScheduler: {
    datasets: {
      PRODUCT:   { enabled: true,  interval: "daily",  time: "02:00", weekday: 0 },
      BUY:       { enabled: true,  interval: "4h",     time: "02:00", weekday: 0 },
      INVENTORY: { enabled: true,  interval: "30min",  time: "02:00", weekday: 0 },
      SALE:      { enabled: true,  interval: "30min",  time: "02:00", weekday: 0 },
      VENDOR:    { enabled: false, interval: "weekly", time: "02:00", weekday: 0 },
    },
  },
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

type SchedulerCfg = AppConfig["erpAutoScheduler"];
function mergeScheduler(current: SchedulerCfg, patch: SchedulerCfg): SchedulerCfg {
  if (!patch) return current;
  const baseDatasets = current?.datasets ?? DEFAULT_CONFIG.erpAutoScheduler!.datasets;
  const patchDatasets = patch.datasets ?? {};
  const merged: Partial<Record<keyof typeof baseDatasets, DatasetSchedule>> = {};
  for (const k of Object.keys(baseDatasets) as Array<keyof typeof baseDatasets>) {
    merged[k] = { ...baseDatasets[k], ...(patchDatasets[k] ?? {}) };
  }
  return { datasets: merged as SchedulerCfg extends { datasets: infer D } ? D : never };
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
    // iregen 은 helper 가 항상 전체 객체 전달 · 단순 교체
    iregen: patch.iregen ?? current.iregen,
    erpAutoScheduler: mergeScheduler(current.erpAutoScheduler, patch.erpAutoScheduler),
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

// ── Iregen · CorpDB_nm (safeStorage · DPAPI) ──
// 2026-10-03 · 평문 저장 금지 · renderer 로 재전달 X
export function hasIregenCorpDbNm(): boolean {
  const cfg = loadConfig();
  return !!cfg.iregen?.encryptedCorpDbNm;
}

export function getIregenCorpDbNm(): string | null {
  const cfg = loadConfig();
  if (!cfg.iregen?.encryptedCorpDbNm) return null;
  return decryptToken(cfg.iregen.encryptedCorpDbNm);
}

export function setIregenCorpDbNm(value: string): boolean {
  const enc = encryptToken(value);
  if (!enc) return false;
  const cfg = loadConfig();
  patchConfig({
    iregen: {
      enabled: cfg.iregen?.enabled ?? false,
      endpoint: cfg.iregen?.endpoint ?? DEFAULT_IREGEN_ENDPOINT,
      soapAction: cfg.iregen?.soapAction ?? DEFAULT_IREGEN_SOAP_ACTION,
      encryptedCorpDbNm: enc,
    },
  });
  return true;
}

export function clearIregenCorpDbNm(): void {
  const cfg = loadConfig();
  patchConfig({
    iregen: {
      enabled: cfg.iregen?.enabled ?? false,
      endpoint: cfg.iregen?.endpoint ?? DEFAULT_IREGEN_ENDPOINT,
      soapAction: cfg.iregen?.soapAction ?? DEFAULT_IREGEN_SOAP_ACTION,
      encryptedCorpDbNm: undefined,
    },
  });
}
