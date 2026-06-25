// src/hooks/useSettings.ts
import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_SCHEDULE_TYPES } from "../constants";

export interface WageRate {
  weekday: number;
  weekend: number;
}

export interface AppSettings {
  positions: string[];
  employmentTypes: string[];
  workplaces: string[];
  scheduleTypes: string[];
  openShiftHour: string;
  middleShiftHour: string;
  closeShiftHour: string;
  wageRates: Record<string, WageRate>;
  employeeWageOverrides: Record<number, WageRate>;
}

const STORAGE_KEY = "app_settings";
const DB_KEY = "all_settings";

const DEFAULT_SETTINGS: AppSettings = {
  positions: ["약사", "캐셔", "물류", "대표", "임원"],
  employmentTypes: ["정직원", "계약직", "알바"],
  workplaces: ["매장", "창고"],
  scheduleTypes: DEFAULT_SCHEDULE_TYPES,
  openShiftHour: "10:00-18:00",
  middleShiftHour: "11:00-18:00",
  closeShiftHour: "12:00-20:00",
  wageRates: {},
  employeeWageOverrides: {},
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

function mergeWithDefaults(parsed: Partial<AppSettings>): AppSettings {
  return {
    positions: Array.isArray(parsed.positions) && parsed.positions.length > 0
      ? parsed.positions : DEFAULT_SETTINGS.positions,
    employmentTypes: Array.isArray(parsed.employmentTypes) && parsed.employmentTypes.length > 0
      ? parsed.employmentTypes : DEFAULT_SETTINGS.employmentTypes,
    workplaces: Array.isArray(parsed.workplaces) && parsed.workplaces.length > 0
      ? parsed.workplaces : DEFAULT_SETTINGS.workplaces,
    scheduleTypes: Array.isArray(parsed.scheduleTypes) && parsed.scheduleTypes.length > 0
      ? parsed.scheduleTypes : DEFAULT_SETTINGS.scheduleTypes,
    openShiftHour: parsed.openShiftHour || DEFAULT_SETTINGS.openShiftHour,
    middleShiftHour: parsed.middleShiftHour || DEFAULT_SETTINGS.middleShiftHour,
    closeShiftHour: parsed.closeShiftHour || DEFAULT_SETTINGS.closeShiftHour,
    wageRates: sanitizeWageRates(parsed.wageRates),
    employeeWageOverrides: sanitizeEmployeeOverrides(parsed.employeeWageOverrides),
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
    const res = await fetch(`/api/settings?key=${DB_KEY}`);
    if (!res.ok) return null;
    const { value } = await res.json();
    if (!value) return null;
    return mergeWithDefaults(value as Partial<AppSettings>);
  } catch {
    return null;
  }
}

async function saveAllSettings(s: AppSettings): Promise<void> {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: DB_KEY, value: s }),
  });
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
  }, []);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

    // Debounced save to DB
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const next = { ...settingsRef.current, ...partial };
      saveAllSettings(next).catch(console.error);
    }, 800);
  }, []);

  return {
    positions: settings.positions,
    employmentTypes: settings.employmentTypes,
    workplaces: settings.workplaces,
    scheduleTypes: settings.scheduleTypes,
    openShiftHour: settings.openShiftHour,
    middleShiftHour: settings.middleShiftHour,
    closeShiftHour: settings.closeShiftHour,
    wageRates: settings.wageRates,
    employeeWageOverrides: settings.employeeWageOverrides,
    update,
  };
}
