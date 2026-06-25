// src/hooks/useSettings.ts
import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_SCHEDULE_TYPES } from "../constants";

export interface WageRate {
  weekday: number;  // 주중 시급 (원)
  weekend: number;  // 주말 시급 (원)
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
    typeof v === "object" &&
    v !== null &&
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

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
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
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function fetchSetting(key: string): Promise<unknown> {
  const res = await fetch(`/api/settings?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error("fetch failed");
  const json = await res.json();
  return json.value;
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error("save failed");
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load wage settings from DB on mount (overrides localStorage)
  useEffect(() => {
    Promise.all([
      fetchSetting("wage_rates"),
      fetchSetting("employee_wage_overrides"),
    ]).then(([rates, overrides]) => {
      const wageRates = sanitizeWageRates(rates);
      const employeeWageOverrides = sanitizeEmployeeOverrides(overrides);
      setSettings(prev => {
        const next = { ...prev, wageRates, employeeWageOverrides };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
    }).catch(() => {}); // silently fall back to localStorage
  }, []);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });

    // Debounced DB save for wage-related changes
    if ("wageRates" in partial || "employeeWageOverrides" in partial) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const current = settingsRef.current;
        const nextWages = "wageRates" in partial ? (partial.wageRates ?? current.wageRates) : current.wageRates;
        const nextOverrides = "employeeWageOverrides" in partial ? (partial.employeeWageOverrides ?? current.employeeWageOverrides) : current.employeeWageOverrides;
        Promise.all([
          saveSetting("wage_rates", nextWages),
          saveSetting("employee_wage_overrides", nextOverrides),
        ]).catch(console.error);
      }, 800);
    }
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
