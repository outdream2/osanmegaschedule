// src/hooks/useSettings.ts
// 2026-08-16 · apiClient 마이그레이션
import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_SCHEDULE_TYPES } from "../constants";
import { api } from "../lib/apiClient";
// 2026-09-14 · settingsApi 프리미티브
import { saveSetting } from "../lib/settingsApi";

export interface ScheduleTypeEntry {
  type: string;
  hours: string;           // 기타/default hours
  pharmHours: string;      // 약사 override hours
  logisticsHours: string;  // 물류 override hours
  partTimeHours: string;   // 알바 override hours
  color?: string;          // hex background color
}

export interface WageRate {
  weekday: number;
  weekend: number;
}

/** 2026-09-04 · 직군별 기본 연차일수 · ScheduleSettingsPage 에서 편집 */
export interface DefaultAnnualLeave {
  pharmacist: number;
  default: number;
}

export const DEFAULT_ANNUAL_LEAVE: DefaultAnnualLeave = { pharmacist: 3, default: 12 };

/** 2026-10-06 · 방문예약 설정 · "대표/이사" 하드코드 제거 · employees.id 배열로 담당자 지정 */
export interface VisitorReservationSettings {
  assigneeEmployeeIds: number[];
  slotMinutes: number;
  bufferMinutes: number;
  useEmployeeSchedule: boolean;
  maxConcurrentBookings?: number;
  allowSameDayBooking?: boolean;
  advanceDays?: number;
}

export const DEFAULT_VISITOR_RESERVATION: VisitorReservationSettings = {
  assigneeEmployeeIds: [],
  slotMinutes: 30,
  bufferMinutes: 10,
  useEmployeeSchedule: true,
};

export interface AppSettings {
  positions: string[];
  /** 2026-08-29 · #177 P2 · 직급(rank) 목록 · 자유 텍스트 · 대표·부장·과장·사원 등 · 편집 시 재직 직원 자동 rename · optional (DB migration 없이 자동 default) */
  ranks?: string[];
  employmentTypes: string[];
  workplaces: string[];
  scheduleTypes: ScheduleTypeEntry[];
  wageRates: Record<string, WageRate>;
  employeeWageOverrides: Record<number, WageRate>;
  /** 2026-08-11 · 공사중 (비로그인 랜딩페이지 · 재고 검색 숨김 · "곧 오픈 예정" 표시) */
  underConstruction?: boolean;
  /** 2026-09-04 · 직군별 기본 연차일수 · 약사=3일, 그 외=12일 */
  defaultAnnualLeave?: DefaultAnnualLeave;
  /** 2026-10-06 · 방문예약 담당자/슬롯 · "대표/이사" rank 하드코드 제거 · optional (기존 settings 호환) */
  visitorReservation?: VisitorReservationSettings;
}

const STORAGE_KEY = "app_settings";
const DB_KEY = "all_settings";

// 2026-08-05 · 근로계약서 시급 default (사용자 편집 가능한 초기값)
//  - 약사: 주중 35,000 / 주말 40,000
//  - 사원 (그 외 직급 · 캐셔·물류 등): 2026년 최저시급 기준 · 주중 10,030 / 주말 12,000
export const DEFAULT_PHARMACIST_WAGE: WageRate = { weekday: 35000, weekend: 40000 };
export const DEFAULT_STAFF_WAGE: WageRate = { weekday: 10030, weekend: 12000 };

/** 직급명 → default 시급. positions 목록에 있으면 자동으로 default 를 제공. */
export function defaultWageForPosition(position: string): WageRate {
  return position === "약사" ? { ...DEFAULT_PHARMACIST_WAGE } : { ...DEFAULT_STAFF_WAGE };
}

const DEFAULT_SETTINGS: AppSettings = {
  positions: ["약사", "캐셔", "물류", "대표", "임원"],
  // 2026-08-29 · #177 P2 · 직급 · 자유 텍스트 · 기본값 (사용자 자유롭게 편집 가능)
  ranks: ["대표", "부장", "팀장", "과장", "대리", "사원"],
  employmentTypes: ["정직원", "계약직", "알바"],
  workplaces: ["매장", "창고"],
  scheduleTypes: DEFAULT_SCHEDULE_TYPES,
  wageRates: {},
  employeeWageOverrides: {},
  underConstruction: false,
};

function isWageRate(v: unknown): v is WageRate {
  return (
    typeof v === "object" && v !== null &&
    typeof (v as WageRate).weekday === "number" &&
    typeof (v as WageRate).weekend === "number"
  );
}

function sanitizeWageRates(input: unknown): Record<string, WageRate> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, WageRate> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (isWageRate(v)) out[k] = { weekday: v.weekday, weekend: v.weekend };
  }
  return out;
}

function sanitizeEmployeeOverrides(input: unknown): Record<number, WageRate> {
  if (!input || typeof input !== "object") return {};
  const out: Record<number, WageRate> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const idNum = Number(k);
    if (!Number.isFinite(idNum)) continue;
    if (isWageRate(v)) out[idNum] = { weekday: v.weekday, weekend: v.weekend };
  }
  return out;
}

/** 2026-10-06 · visitorReservation 안전 파서 · 알 수 없는 field 제거 · default 보장 */
function sanitizeVisitorReservation(input: unknown): VisitorReservationSettings {
  const base = { ...DEFAULT_VISITOR_RESERVATION };
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;
  if (Array.isArray(raw.assigneeEmployeeIds)) {
    base.assigneeEmployeeIds = (raw.assigneeEmployeeIds as unknown[])
      .map(v => Number(v))
      .filter(v => Number.isInteger(v) && v > 0);
  }
  if (typeof raw.slotMinutes === "number" && Number.isFinite(raw.slotMinutes) && raw.slotMinutes >= 10 && raw.slotMinutes <= 240) {
    base.slotMinutes = Math.round(raw.slotMinutes);
  }
  if (typeof raw.bufferMinutes === "number" && Number.isFinite(raw.bufferMinutes) && raw.bufferMinutes >= 0 && raw.bufferMinutes <= 120) {
    base.bufferMinutes = Math.round(raw.bufferMinutes);
  }
  if (typeof raw.useEmployeeSchedule === "boolean") {
    base.useEmployeeSchedule = raw.useEmployeeSchedule;
  }
  if (typeof raw.maxConcurrentBookings === "number" && raw.maxConcurrentBookings >= 1) {
    base.maxConcurrentBookings = Math.round(raw.maxConcurrentBookings);
  }
  if (typeof raw.allowSameDayBooking === "boolean") {
    base.allowSameDayBooking = raw.allowSameDayBooking;
  }
  if (typeof raw.advanceDays === "number" && raw.advanceDays >= 0) {
    base.advanceDays = Math.round(raw.advanceDays);
  }
  return base;
}

/** 구버전 localStorage 포맷 · scheduleTypes 가 string[] 였을 때 저장된 개별 시간 필드 */
interface LegacyScheduleFields {
  openShiftHour?: string;
  openShiftHourPharm?: string;
  middleShiftHour?: string;
  middleShiftHourPharm?: string;
  closeShiftHour?: string;
  closeShiftHourPharm?: string;
  openCloseShiftHour?: string;
  openCloseShiftHourPharm?: string;
}

function migrateScheduleTypes(raw: unknown, parsed: Partial<AppSettings> & LegacyScheduleFields): ScheduleTypeEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_SCHEDULE_TYPES;
  if (typeof raw[0] === "string") {
    // Old string[] format — migrate
    const hoursByType: Record<string, { hours: string; pharmHours: string }> = {
      "오픈":     { hours: parsed.openShiftHour || "10:00-18:00",     pharmHours: parsed.openShiftHourPharm || "" },
      "미들":     { hours: parsed.middleShiftHour || "11:00-18:00",   pharmHours: parsed.middleShiftHourPharm || "" },
      "마감":     { hours: parsed.closeShiftHour || "12:00-20:00",    pharmHours: parsed.closeShiftHourPharm || "" },
      "오픈마감": { hours: parsed.openCloseShiftHour || "10:00-22:00", pharmHours: parsed.openCloseShiftHourPharm || "" },
    };
    return (raw as string[]).map(s => ({ type: s, hours: hoursByType[s]?.hours ?? "", pharmHours: hoursByType[s]?.pharmHours ?? "", logisticsHours: "", partTimeHours: "" }));
  }
  // Already ScheduleTypeEntry[] — backfill color from defaults if missing
  const defaultColorMap: Record<string, string> = Object.fromEntries(
    DEFAULT_SCHEDULE_TYPES.filter(d => d.color).map(d => [d.type, d.color!])
  );
  return (raw as ScheduleTypeEntry[]).map(e => ({
    type: e.type || "",
    hours: e.hours || "",
    pharmHours: e.pharmHours || "",
    logisticsHours: e.logisticsHours || "",
    partTimeHours: e.partTimeHours || "",
    color: e.color || defaultColorMap[e.type] || "#e2e8f0",
  })).filter(e => e.type);
}

function mergeWithDefaults(parsed: Partial<AppSettings>): AppSettings {
  return {
    positions: Array.isArray(parsed.positions) && parsed.positions.length > 0
      ? parsed.positions : DEFAULT_SETTINGS.positions,
    // 2026-08-29 · #177 P2 · ranks · DB 없어도 default 폴백
    ranks: Array.isArray((parsed as any).ranks) && (parsed as any).ranks.length > 0
      ? (parsed as any).ranks as string[] : DEFAULT_SETTINGS.ranks,
    employmentTypes: Array.isArray(parsed.employmentTypes) && parsed.employmentTypes.length > 0
      ? parsed.employmentTypes : DEFAULT_SETTINGS.employmentTypes,
    workplaces: Array.isArray(parsed.workplaces) && parsed.workplaces.length > 0
      ? parsed.workplaces : DEFAULT_SETTINGS.workplaces,
    scheduleTypes: migrateScheduleTypes((parsed as Partial<AppSettings> & LegacyScheduleFields).scheduleTypes, parsed as Partial<AppSettings> & LegacyScheduleFields),
    wageRates: sanitizeWageRates(parsed.wageRates),
    employeeWageOverrides: sanitizeEmployeeOverrides(parsed.employeeWageOverrides),
    underConstruction: parsed.underConstruction === true,
    defaultAnnualLeave: {
      pharmacist: (parsed.defaultAnnualLeave?.pharmacist ?? DEFAULT_ANNUAL_LEAVE.pharmacist),
      default: (parsed.defaultAnnualLeave?.default ?? DEFAULT_ANNUAL_LEAVE.default),
    },
    visitorReservation: sanitizeVisitorReservation((parsed as any).visitorReservation),
  };
}

function loadFromLocalStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeWithDefaults(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function fetchAllSettings(): Promise<AppSettings | null> {
  try {
    const { data } = await api.get<{ value?: Partial<AppSettings> }>(`/api/settings?key=${DB_KEY}`);
    if (!data?.value) return null;
    return mergeWithDefaults(data.value);
  } catch {
    return null;
  }
}

const SETTINGS_UPDATED_EVENT = "settings-updated";

async function saveAllSettings(s: AppSettings): Promise<void> {
  await saveSetting(DB_KEY, s);
}

/** 모든 useSettings 인스턴스에 변경을 알리는 이벤트 */
function dispatchSettingsUpdated(next: AppSettings): void {
  try {
    window.dispatchEvent(new CustomEvent<AppSettings>(SETTINGS_UPDATED_EVENT, { detail: next }));
  } catch { /* silent */ }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadFromLocalStorage);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: load from DB and override localStorage
  useEffect(() => {
    fetchAllSettings().then((dbSettings) => {
      if (!dbSettings) return;
      setSettings(dbSettings);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(dbSettings)); } catch {}
    }).catch(() => {});
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  // 다른 useSettings 인스턴스(다른 탭/컴포넌트)에서 발행한 settings-updated 이벤트 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<AppSettings>).detail;
      if (!next) return;
      setSettings(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handler);
  }, []);

  const update = useCallback((partial: Partial<AppSettings>) => {
    let nextSnapshot: AppSettings = DEFAULT_SETTINGS;
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      nextSnapshot = next;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

    // 같은 세션의 다른 useSettings 인스턴스에 즉시 전파
    // (setTimeout 0 으로 setSettings 완료 후 dispatch)
    setTimeout(() => dispatchSettingsUpdated(nextSnapshot), 0);

    // Debounced save to DB
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const next = { ...settingsRef.current, ...partial };
      saveAllSettings(next).catch(console.error);
      // DB 저장 완료 후 다시 dispatch (최신 DB 값 반영)
      dispatchSettingsUpdated(next);
    }, 800);
  }, []);

  /** debounce 취소 후 현재 settings 즉시 서버 저장 */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveAllSettings(settingsRef.current);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    positions: settings.positions,
    ranks: settings.ranks,
    employmentTypes: settings.employmentTypes,
    workplaces: settings.workplaces,
    scheduleTypes: settings.scheduleTypes,
    wageRates: settings.wageRates,
    employeeWageOverrides: settings.employeeWageOverrides,
    underConstruction: settings.underConstruction === true,
    defaultAnnualLeave: settings.defaultAnnualLeave ?? DEFAULT_ANNUAL_LEAVE,
    visitorReservation: settings.visitorReservation ?? DEFAULT_VISITOR_RESERVATION,
    settings,
    update,
    saveNow,
  };
}
