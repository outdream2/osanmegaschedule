// src/components/SchedulePage/useDisplayZones.ts
// 2026-08-22 · #framework-4 · SchedulePage 분리 · 디스플레이 존 로컬스토리지 훅
import { useState } from "react";
import { Employee } from "../../types";
import { ZONE_DEFS, ZONES_STORAGE_KEY } from "../../constants/displayZones";
import { isLogisticsPosition as isLogistics } from "../../lib/employeeCategory";
import type { LogisticsZoneProps } from "../EmployeeCalendarModal";

export type DisplayZoneSlim = {
  id: string; num: number; assignedStaffId: number | null;
  assignedStaffName: string; status: string; label: string;
  category: string; section: string; products: string;
};

export function useDisplayZones() {
  const [displayZoneVer, setDisplayZoneVer] = useState(0);

  const loadDisplayZones = (): DisplayZoneSlim[] => {
    try {
      const raw = localStorage.getItem(ZONES_STORAGE_KEY);
      if (!raw) return ZONE_DEFS.map(d => ({
        id: String(d.num), num: d.num, label: d.label, category: d.category,
        section: d.section, assignedStaffId: null, assignedStaffName: "",
        status: "normal", products: "",
      }));
      return JSON.parse(raw) as DisplayZoneSlim[];
    } catch { return []; }
  };

  const saveDisplayZones = (zones: DisplayZoneSlim[]) => {
    localStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
    setDisplayZoneVer(v => v + 1);
  };

  const buildLogisticsZoneProps = (calendarEmployee: Employee): LogisticsZoneProps | undefined => {
    if (!isLogistics(calendarEmployee.position)) return undefined;
    const zones = loadDisplayZones();
    const assignedZoneNums = zones.filter(z => z.assignedStaffId === calendarEmployee.id).map(z => z.num);
    const empId = calendarEmployee.id;
    const empName = calendarEmployee.name;
    return {
      assignedZoneNums,
      onToggle: (zoneNum: number) => {
        const current = loadDisplayZones();
        saveDisplayZones(current.map(z => {
          if (z.num !== zoneNum) return z;
          return z.assignedStaffId === empId
            ? { ...z, assignedStaffId: null, assignedStaffName: "" }
            : { ...z, assignedStaffId: empId, assignedStaffName: empName };
        }));
      },
      onClearAll: () => saveDisplayZones(loadDisplayZones().map(z =>
        z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
      )),
      onSaveToDow: async (dow: number) => {
        const currentZones = loadDisplayZones();
        const currentNums = currentZones.filter(z => z.assignedStaffId === empId).map(z => z.num);
        localStorage.setItem(`megatown_zone_template_emp${empId}_dow${dow}`, JSON.stringify(currentNums));
      },
    };
  };

  const getEmpZoneNums = (empId: number): number[] => {
    return loadDisplayZones().filter(z => z.assignedStaffId === empId).map(z => z.num);
  };

  const applyZones = (empId: number, name: string, position: string, zoneNums: number[]) => {
    if (position !== "물류") return;
    const current = loadDisplayZones();
    const cleared = current.map(z =>
      z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
    );
    saveDisplayZones(cleared.map(z =>
      zoneNums.includes(z.num) ? { ...z, assignedStaffId: empId, assignedStaffName: name } : z
    ));
  };

  return { loadDisplayZones, saveDisplayZones, buildLogisticsZoneProps, getEmpZoneNums, applyZones, displayZoneVer };
}
