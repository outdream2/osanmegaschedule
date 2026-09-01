// src/components/SchedulePage/useDisplayZones.ts
// #14 · 2026-08-31 · KV→DB 이관 · localStorage 제거 · /api/zones 단일 소스
// 2026-09-01 · 보안 fix · 정적 ZONE_DEFS import → useZoneDefs 훅으로 이관 (DB 단일 소스)
import { useState, useEffect, useRef } from "react";
import { Employee } from "../../types";
import { useZoneDefs, type ZoneDef } from "../../hooks/useZoneDefs";
import { isLogisticsPosition as isLogistics } from "../../lib/employeeCategory";
import { fetchZonesFromDB, saveZonesToDB } from "../DisplayPage/DisplayPage.helpers";
import type { LogisticsZoneProps } from "../EmployeeCalendarModal";

export type DisplayZoneSlim = {
  id: string; num: number; assignedStaffId: number | null;
  assignedStaffName: string; status: string; label: string;
  category: string; section: string; products: string;
};

const buildDefaultSlimZones = (zoneDefs: ZoneDef[]): DisplayZoneSlim[] =>
  zoneDefs.map(d => ({
    id: String(d.num), num: d.num, label: d.label, category: d.category,
    section: d.section, assignedStaffId: null, assignedStaffName: "",
    status: "normal", products: "",
  }));

export function useDisplayZones() {
  // 2026-09-01 · DB 단일 소스 · 정적 ZONE_DEFS 대신 useZoneDefs 훅 (서버 편집 즉시 반영)
  const { zones: zoneDefs, loading: zoneDefsLoading } = useZoneDefs();
  const [zones, setZones] = useState<DisplayZoneSlim[]>(() => buildDefaultSlimZones([]));
  const [displayZoneVer, setDisplayZoneVer] = useState(0);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  // zoneDefs 로드 완료 시 기본 슬림 존 갱신 (DB fetch 이전 초기 상태)
  useEffect(() => {
    if (!zoneDefsLoading && zoneDefs.length > 0 && !initializedRef.current) {
      setZones(buildDefaultSlimZones(zoneDefs));
    }
  }, [zoneDefsLoading, zoneDefs]);

  // 마운트 시 DB에서 로드
  useEffect(() => {
    fetchZonesFromDB().then(dbZones => {
      if (!dbZones) return;
      initializedRef.current = true;
      // DisplayZone → DisplayZoneSlim 형 변환
      const slim: DisplayZoneSlim[] = dbZones.map(z => ({
        id: z.id,
        num: typeof (z as any).num === "number" ? (z as any).num : parseInt(z.id, 10),
        assignedStaffId: z.assignedStaffId,
        assignedStaffName: z.assignedStaffName,
        status: z.status,
        label: (z as any).label ?? "",
        category: (z as any).category ?? "",
        section: (z as any).section ?? "",
        products: z.products ?? "",
      }));
      setZones(slim);
    });
  }, []);

  const saveZonesDebounced = (nextZones: DisplayZoneSlim[]) => {
    if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = setTimeout(() => {
      // DisplayZoneSlim → DisplayZone 형태로 변환해서 saveZonesToDB 호출
      const full = nextZones.map(z => ({
        id: z.id,
        assignedStaffId: z.assignedStaffId,
        assignedStaffName: z.assignedStaffName,
        status: z.status as any,
        products: z.products,
        dowMap: null,
        label: z.label,
        category: z.category,
        section: z.section,
      }));
      saveZonesToDB(full as any).catch(() => { });
    }, 800);
  };

  const updateZones = (updater: (prev: DisplayZoneSlim[]) => DisplayZoneSlim[]) => {
    setZones(prev => {
      const next = updater(prev);
      saveZonesDebounced(next);
      setDisplayZoneVer(v => v + 1);
      return next;
    });
  };

  const buildLogisticsZoneProps = (calendarEmployee: Employee): LogisticsZoneProps | undefined => {
    if (!isLogistics(calendarEmployee.position)) return undefined;
    const empId = calendarEmployee.id;
    const empName = calendarEmployee.name;
    const assignedZoneNums = zones.filter(z => z.assignedStaffId === empId).map(z => z.num);
    return {
      assignedZoneNums,
      onToggle: (zoneNum: number) => {
        updateZones(prev => prev.map(z => {
          if (z.num !== zoneNum) return z;
          return z.assignedStaffId === empId
            ? { ...z, assignedStaffId: null, assignedStaffName: "" }
            : { ...z, assignedStaffId: empId, assignedStaffName: empName };
        }));
      },
      onClearAll: () => {
        updateZones(prev => prev.map(z =>
          z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
        ));
      },
      onSaveToDow: async (_dow: number) => {
        // #14 · dow 템플릿은 DB 미지원 · 추후 구현 예정 · localStorage 제거
      },
    };
  };

  const getEmpZoneNums = (empId: number): number[] =>
    zones.filter(z => z.assignedStaffId === empId).map(z => z.num);

  const applyZones = (empId: number, name: string, position: string, zoneNums: number[]) => {
    if (position !== "물류") return;
    updateZones(prev => {
      const cleared = prev.map(z =>
        z.assignedStaffId === empId ? { ...z, assignedStaffId: null, assignedStaffName: "" } : z
      );
      return cleared.map(z =>
        zoneNums.includes(z.num) ? { ...z, assignedStaffId: empId, assignedStaffName: name } : z
      );
    });
  };

  return { buildLogisticsZoneProps, getEmpZoneNums, applyZones, displayZoneVer };
}
