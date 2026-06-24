// src/hooks/useSettings.ts
import { useState, useCallback } from "react";
import { DEFAULT_SCHEDULE_TYPES } from "../constants";

export interface AppSettings {
  positions: string[];
  employmentTypes: string[];
  workplaces: string[];
  scheduleTypes: string[];
  openShiftHour: string;
  middleShiftHour: string;
  closeShiftHour: string;
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
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      positions: Array.isArray(parsed.positions) && parsed.positions.length > 0
        ? parsed.positions
        : DEFAULT_SETTINGS.positions,
      employmentTypes: Array.isArray(parsed.employmentTypes) && parsed.employmentTypes.length > 0
        ? parsed.employmentTypes
        : DEFAULT_SETTINGS.employmentTypes,
      workplaces: Array.isArray(parsed.workplaces) && parsed.workplaces.length > 0
        ? parsed.workplaces
        : DEFAULT_SETTINGS.workplaces,
      scheduleTypes: Array.isArray(parsed.scheduleTypes) && parsed.scheduleTypes.length > 0
        ? parsed.scheduleTypes
        : DEFAULT_SETTINGS.scheduleTypes,
      openShiftHour: parsed.openShiftHour || DEFAULT_SETTINGS.openShiftHour,
      middleShiftHour: parsed.middleShiftHour || DEFAULT_SETTINGS.middleShiftHour,
      closeShiftHour: parsed.closeShiftHour || DEFAULT_SETTINGS.closeShiftHour,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const update = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  return {
    positions: settings.positions,
    employmentTypes: settings.employmentTypes,
    workplaces: settings.workplaces,
    scheduleTypes: settings.scheduleTypes,
    openShiftHour: settings.openShiftHour,
    middleShiftHour: settings.middleShiftHour,
    closeShiftHour: settings.closeShiftHour,
    update,
  };
}
